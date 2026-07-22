"""
Semantic Audit Service

Responsible for:
- Sampling + stats from DuckDB
- LLM batching with asyncio.gather
- Confidence thresholds for UI states
"""

import asyncio
from typing import Any, Dict, List

import duckdb

from app.core.logger import get_logger
from app.core.storage import get_duckdb_path
from app.services.analytics.query_utils import execute, safe_identifier
from app.services.role_taxonomy import ROLE_TAXONOMY, ROLE_VOCABULARY_FOR_LLM

logger = get_logger(__name__)

# Confidence thresholds (locked)
CONFIDENCE_AUTO_ACCEPT = 0.90
CONFIDENCE_FLAGGED = 0.65


def _table_name(dataset_id: str, version_id: str = None) -> str:
    """Resolve the DuckDB table name for a dataset.

    Returns 'data' for legacy single-table datasets,
    or the actual table name for multi-table datasets.
    """
    if version_id:
        from app.models.database import get_session
        from app.services.analytics.table_resolver import resolve_table_name
        from uuid import UUID
        
        session_gen = get_session()
        session = next(session_gen)
        try:
            return resolve_table_name(UUID(version_id), session)
        except Exception:
            pass
        finally:
            session_gen.close()
    return "data"


def _fetch_column_samples(conn: duckdb.DuckDBPyConnection, table: str, col: str, limit: int = 20) -> List[Any]:
    try:
        df = execute(conn, f'SELECT {safe_identifier(col)} FROM {safe_identifier(table)} LIMIT ?', params=[limit]).df()
        return df[col].tolist()
    except Exception as e:
        logger.warning(f"Sample fetch failed for {col}: {e}")
        return []


def _fetch_column_stats(conn: duckdb.DuckDBPyConnection, table: str, col: str) -> Dict[str, Any]:
    """Return basic stats (null_pct, unique_count, min, max) for a column."""
    stats = {
        "null_pct": None,
        "unique_count": None,
        "min": None,
        "max": None,
    }
    safe_t = safe_identifier(table)
    safe_c = safe_identifier(col)
    try:
        total = execute(conn, f'SELECT COUNT(*) AS c FROM {safe_t}').fetchone()[0]
        if total == 0:
            return stats

        nulls = execute(conn, f'SELECT COUNT(*) AS c FROM {safe_t} WHERE {safe_c} IS NULL').fetchone()[0]
        stats["null_pct"] = round(nulls / total, 4)

        stats["unique_count"] = execute(
            conn, f'SELECT COUNT(DISTINCT {safe_c}) FROM {safe_t}'
        ).fetchone()[0]

        try:
            min_max = execute(
                conn, f'SELECT MIN({safe_c}), MAX({safe_c}) FROM {safe_t}'
            ).fetchone()
            stats["min"] = min_max[0]
            stats["max"] = min_max[1]
        except Exception:
            pass
    except Exception as e:
        logger.warning(f"Stats fetch failed for {col}: {e}")

    return stats


async def run_semantic_audit(
    dataset_id: str,
    version_id: str,
    schema: List[Dict[str, Any]],
    llm_router,
    corrections_text: str = "",
) -> List[Dict[str, Any]]:
    """
    Run the semantic audit against a dataset using DuckDB for sampling + stats,
    then batch columns into groups of 12 and classify via LLM.

    Falls back to schema-only classification when DuckDB file is unavailable
    (e.g. encoding error during build, still building in background).

    Returns a list of ColumnMapping dicts.
    """
    from app.services.analytics.semantic_mapper import SemanticMapper

    mapper = SemanticMapper()
    table = _table_name(dataset_id, version_id)

    # Try connecting to dataset-specific DuckDB file
    duckdb_path = get_duckdb_path(dataset_id, version_id)
    conn = None
    duckdb_available = False

    from app.services.storage import get_storage
    if get_storage().exists(duckdb_path):
        try:
            conn = duckdb.connect(str(duckdb_path), read_only=True)
            duckdb_available = True
        except Exception as e:
            logger.warning(f"DuckDB file exists but connection failed: {e}")
    else:
        logger.info(
            "DuckDB file not found for dataset_id=%s, version_id=%s. "
            "Proceeding with schema-only LLM classification.",
            dataset_id, version_id,
        )

    try:
        columns = [c["name"] for c in schema]
        schema_dtype = {c["name"]: c.get("dtype", "string") for c in schema}
        column_payloads = []

        for col in columns:
            if duckdb_available and conn:
                raw_samples = _fetch_column_samples(conn, table, col, limit=10)
                # Truncate string samples to prevent payload bloat on datasets like Superstore
                samples = [str(s)[:50] + "..." if isinstance(s, str) and len(str(s)) > 50 else s for s in raw_samples]
                stats = _fetch_column_stats(conn, table, col)
            else:
                samples = []
                stats = {"null_pct": None, "unique_count": None, "min": None, "max": None}

            dtype = schema_dtype.get(col, "string")

            # Build a ColumnProfile-compatible payload for the profiler
            # When DuckDB is available, use its samples; otherwise schema-only
            payload = {
                "name": col,
                "dtype": dtype,
                "sample_values": samples,
                "null_pct": stats["null_pct"],
                "unique_count": stats["unique_count"],
                "min": stats["min"],
                "max": stats["max"],
            }
            column_payloads.append(payload)

        # Batch into smaller groups of 8 to avoid 413 Payload Too Large on Groq API
        batch_size = 8
        batches = [column_payloads[i:i + batch_size] for i in range(0, len(column_payloads), batch_size)]

        async def classify_batch(batch: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
            roles = list(ROLE_TAXONOMY.keys())
            
            corrections_block = f"\n\n### HISTORICAL CORRECTIONS FOR CONTEXT\nThe user previously corrected the AI on this dataset:\n{corrections_text}\n" if corrections_text else ""
            
            prompt = (
                "You are a data classification expert. Classify each column into exactly one role from this taxonomy:\n"
                f"{roles}\n\n"
                "For each column return JSON: {\"column\": \"...\", \"role\": \"...\", "
                "\"confidence\": 0.0-1.0, \"reasoning\": \"...\"}\n"
                "Return only a JSON array. No preamble.\n\n"
                f"{corrections_block}"
                f"Columns:\n{batch}"
            )
            try:
                response = await llm_router.complete(
                    system_prompt="You are a data classification expert.",
                    user_prompt=prompt,
                    temperature=0.1,
                    max_tokens=2048,
                    purpose="semantic_mapping",
                )
                raw = response.content
                # Let semantic_mapper parse / normalize
                parsed = mapper._parse_llm_response(raw)
                if isinstance(parsed, list):
                    return parsed
                if isinstance(parsed, dict) and isinstance(parsed.get("items"), list):
                    return parsed["items"]
            except Exception as e:
                logger.warning(f"LLM batch failed: {e}")

            # Retry once with simplified prompt
            try:
                roles = list(ROLE_TAXONOMY.keys())
                columns_brief = [{"name": c["name"], "dtype": c["dtype"]} for c in batch]
                prompt_simple = (
                    "Classify each column into a role from this list: "
                    f"{roles}.\n"
                    "Return JSON array of {column, role, confidence, reasoning}.\n\n"
                    f"Columns:\n{columns_brief}"
                )
                response = await llm_router.complete(
                    system_prompt="You are a data classification expert.",
                    user_prompt=prompt_simple,
                    purpose="semantic_mapping",
                )
                raw = response.content
                parsed = mapper._parse_llm_response(raw)
                if isinstance(parsed, list):
                    return parsed
            except Exception as e:
                logger.warning(f"LLM batch retry failed: {e}")

            return []

        results = await asyncio.gather(*[classify_batch(b) for b in batches])

        flattened: List[Dict[str, Any]] = []
        for r in results:
            if isinstance(r, list):
                flattened.extend(r)

        return flattened
    finally:
        if conn:
            conn.close()
