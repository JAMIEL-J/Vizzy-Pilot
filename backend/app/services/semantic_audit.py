"""
Semantic Audit Service

Responsible for:
- ROLE_TAXONOMY (single source of truth)
- Sampling + stats from DuckDB
- LLM batching with asyncio.gather
- Confidence thresholds for UI states
"""

import asyncio
from typing import Any, Dict, List

import duckdb

from app.core.logger import get_logger
from app.core.storage import get_duckdb_path

logger = get_logger(__name__)

# Confidence thresholds (locked)
CONFIDENCE_AUTO_ACCEPT = 0.90
CONFIDENCE_FLAGGED = 0.65

# ROLE_TAXONOMY (locked)
ROLE_TAXONOMY: Dict[str, Dict[str, Any]] = {
    # Temporal
    "date": {"affinity": "time_series_x", "execution_slot": "duckdb"},
    "datetime": {"affinity": "time_series_x", "execution_slot": "duckdb"},
    "year_month": {"affinity": "time_series_x", "execution_slot": "duckdb"},
    "fiscal_period": {"affinity": "time_series_x", "execution_slot": "duckdb"},

    # Dimension
    "category": {"affinity": "groupby_x", "execution_slot": "duckdb"},
    "sub_category": {"affinity": "groupby_x", "execution_slot": "duckdb"},
    "geography": {"affinity": "map_dimension", "execution_slot": "duckdb"},
    "entity_id": {"affinity": "filter_only", "execution_slot": "duckdb"},
    "boolean_flag": {"affinity": "filter_only", "execution_slot": "duckdb"},

    # Measure
    "revenue": {"affinity": "measure_y", "execution_slot": "duckdb"},
    "cost": {"affinity": "measure_y", "execution_slot": "duckdb"},
    "quantity": {"affinity": "measure_y", "execution_slot": "duckdb"},
    "count": {"affinity": "measure_y", "execution_slot": "duckdb"},
    "score": {"affinity": "measure_y", "execution_slot": "duckdb"},
    "duration_seconds": {"affinity": "measure_y", "execution_slot": "duckdb"},
    "ratio_pct": {"affinity": "gauge_measure", "execution_slot": "pandas"},

    # Identity (no chart output)
    "primary_key": {"affinity": "identifier", "execution_slot": None},
    "foreign_key": {"affinity": "identifier", "execution_slot": None},
    "name_label": {"affinity": "label", "execution_slot": None},

    # Fallback
    "unclassified": {"affinity": "none", "execution_slot": None},
}


def _table_name(dataset_id: str) -> str:
    return f"data"


def _fetch_column_samples(conn: duckdb.DuckDBPyConnection, table: str, col: str, limit: int = 20) -> List[Any]:
    try:
        df = conn.execute(f'SELECT "{col}" FROM "{table}" USING SAMPLE {limit} ROWS').df()
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
    try:
        total = conn.execute(f'SELECT COUNT(*) AS c FROM "{table}"').fetchone()[0]
        if total == 0:
            return stats

        nulls = conn.execute(f'SELECT COUNT(*) AS c FROM "{table}" WHERE "{col}" IS NULL').fetchone()[0]
        stats["null_pct"] = round(nulls / total, 4)

        stats["unique_count"] = conn.execute(
            f'SELECT COUNT(DISTINCT "{col}") FROM "{table}"'
        ).fetchone()[0]

        try:
            min_max = conn.execute(
                f'SELECT MIN("{col}"), MAX("{col}") FROM "{table}"'
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
) -> List[Dict[str, Any]]:
    """
    Run the semantic audit against a dataset using DuckDB for sampling + stats,
    then batch columns into groups of 12 and classify via LLM.

    Returns a list of ColumnMapping dicts.
    """
    from app.services.analytics.semantic_mapper import SemanticMapper

    mapper = SemanticMapper()
    table = _table_name(dataset_id)

    # Connect directly to dataset-specific DuckDB file
    duckdb_path = get_duckdb_path(dataset_id, version_id)
    if not duckdb_path.exists():
        raise FileNotFoundError(f"DuckDB file not found for dataset_id={dataset_id}, version_id={version_id}")
    conn = duckdb.connect(str(duckdb_path), read_only=True)
    try:
        columns = [c["name"] for c in schema]
        schema_dtype = {c["name"]: c.get("dtype", "string") for c in schema}
        column_payloads = []

        for col in columns:
            samples = _fetch_column_samples(conn, table, col, limit=20)
            stats = _fetch_column_stats(conn, table, col)
            payload = {
                "name": col,
                "dtype": schema_dtype.get(col, "string"),
                "sample_values": samples,
                "null_pct": stats["null_pct"],
                "unique_count": stats["unique_count"],
                "min": stats["min"],
                "max": stats["max"],
            }
            column_payloads.append(payload)

        # Batch into groups of 12
        batch_size = 12
        batches = [column_payloads[i:i + batch_size] for i in range(0, len(column_payloads), batch_size)]

        async def classify_batch(batch: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
            roles = list(ROLE_TAXONOMY.keys())
            prompt = (
                "You are a data classification expert. Classify each column into exactly one role from this taxonomy:\n"
                f"{roles}\n\n"
                "For each column return JSON: {\"column\": \"...\", \"role\": \"...\", "
                "\"confidence\": 0.0-1.0, \"reasoning\": \"...\"}\n"
                "Return only a JSON array. No preamble.\n\n"
                f"Columns:\n{batch}"
            )
            try:
                response = await llm_router.complete(
                    system_prompt="You are a data classification expert.",
                    user_prompt=prompt,
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
        conn.close()
