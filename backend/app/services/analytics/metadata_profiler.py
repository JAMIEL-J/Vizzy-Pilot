"""
Metadata Profiler - Analyzes dataset columns to generate physical, logical, and semantic metadata.
"""

import logging
import re
from typing import Any, Dict, List
import pandas as pd

from app.services.analytics.domain_detector import DomainType

logger = logging.getLogger(__name__)

# Regex for common semantic tagging
SEMANTIC_PATTERNS = {
    "financial:monetary": [r"revenue", r"sales", r"profit", r"cost", r"spend", r"budget", r"income", r"salary", r"price", r"charge", r"amount"],
    "geo:region": [r"region", r"state", r"province", r"territory", r"market", r"zone"],
    "geo:city": [r"city", r"town", r"village"],
    "geo:country": [r"country", r"nation"],
    "identity:surrogate": [r"id", r"uuid", r"guid", r"key", r"index", r"row_number", r"unnamed"],
    "temporal:period": [r"date", r"time", r"timestamp", r"year", r"month", r"quarter", r"period", r"day"],
}

# Values that indicate boolean status
BOOLEAN_WORDS = {"true", "false", "yes", "no", "y", "n", "1", "0", "1.0", "0.0"}

def profile_dataset(df: pd.DataFrame) -> Dict[str, Dict[str, Any]]:
    """
    Profiles a pandas DataFrame and returns metadata for each column.
    """
    metadata = {}
    row_count = len(df)

    for col in df.columns:
        series = df[col]
        non_null_series = series.dropna()
        null_count = row_count - len(non_null_series)
        null_ratio = null_count / row_count if row_count > 0 else 1.0

        unique_count = non_null_series.nunique()
        cardinality = unique_count / row_count if row_count > 0 else 0.0

        # Determine physical type
        physical_type = str(series.dtype)

        # Detect logical type
        logical_type = "categorical"
        if pd.api.types.is_numeric_dtype(series):
            # Check if it behaves like a boolean flag
            unique_vals = set(non_null_series.unique())
            if unique_vals.issubset({0, 1, 0.0, 1.0}):
                logical_type = "boolean"
            else:
                logical_type = "numeric"
        elif pd.api.types.is_datetime64_any_dtype(series):
            logical_type = "temporal"
        else:
            # Check if it behaves like a boolean string
            unique_vals_str = {str(x).strip().lower() for x in non_null_series.unique()[:10]}
            if unique_vals_str.issubset(BOOLEAN_WORDS) and len(unique_vals_str) > 0:
                logical_type = "boolean"

        base_format, semantic_tags = _detect_semantics_and_format(col, logical_type, non_null_series)

        # Statistical heuristics for ID detection
        if logical_type != "numeric" and cardinality > 0.95 and "identity:surrogate" not in semantic_tags:
            semantic_tags.append("identity:surrogate")

        # Format detection
        format_type = base_format
        if "temporal:period" in semantic_tags and logical_type == "numeric":
            # check if it looks like a year (values in 1900-2100 range)
            try:
                non_null = non_null_series.dropna()
                if not non_null.empty and non_null.max() <= 2100 and non_null.min() >= 1900:
                    format_type = "date"
            except Exception:
                pass

        metadata[col] = {
            "physical_type": physical_type,
            "logical_type": logical_type,
            "null_ratio": null_ratio,
            "cardinality": cardinality,
            "unique_count": unique_count,
            "semantic_tags": semantic_tags,
            "format_type": format_type,
        }

    return metadata


def _detect_semantics_and_format(
    col: str,
    logical_type: str,
    non_null_series: pd.Series,
) -> tuple:
    """Shared semantic tagging and format detection logic for both pandas and DuckDB profilers."""
    col_lower = col.lower().replace("_", " ").replace("-", " ")

    semantic_tags = []
    for tag, patterns in SEMANTIC_PATTERNS.items():
        if any(re.search(pat, col_lower) for pat in patterns):
            if tag == "temporal:period":
                exclude_kws = [
                    "charge", "cost", "price", "amount", "fee", "balance",
                    "salary", "income", "revenue", "tenure", "duration",
                    "age", "mrr", "monthly", "weekly", "daily", "yearly",
                ]
                if any(kw in col_lower for kw in exclude_kws):
                    continue
            semantic_tags.append(tag)

    format_type = "number"
    if logical_type == "temporal" or (
        "temporal:period" in semantic_tags and logical_type != "numeric"
    ):
        format_type = "date"
    elif "financial:monetary" in semantic_tags:
        format_type = "currency"
    elif any(
        x in col_lower for x in ["ratio", "percent", "pct", "rate", "ctr", "cvr", "csat", "sla"]
    ):
        format_type = "percentage"

    return format_type, semantic_tags


def _get_duckdb_physical_type_map(
    conn: "duckdb.DuckDBPyConnection",
    table_ref: str,
) -> Dict[str, str]:
    """
    Run DESCRIBE on the table to get the canonical physical type for every column.

    Uses DuckDB's catalog-level type information (deterministic, not row-sampled)
    instead of ANY_VALUE(TYPEOF(...)) which is non-deterministic on mixed-type columns.
    """
    try:
        # Execute directly to avoid duplicate logging in query_utils.execute()
        describe_df = conn.execute(f"DESCRIBE SELECT * FROM {table_ref}").df()
        type_map: Dict[str, str] = {}
        for _, row in describe_df.iterrows():
            colname = str(row.iloc[0])
            coltype = str(row.iloc[1])
            type_map[colname] = coltype
        return type_map
    except Exception as e:
        logger.error(f"Failed to get physical type map for {table_ref}: {e}")
        return {}


def profile_dataset_duckdb(
    reader: "DuckDBReader",
    columns: List[str],
) -> Dict[str, Dict[str, Any]]:
    """
    Profile dataset columns using DuckDB-accurate aggregations.

    Returns the same metadata dict format as profile_dataset() but with
    null_ratio, unique_count, and cardinality computed from the FULL
    dataset via DuckDB instead of a pandas sample.

    Uses DESCRIBE (catalog-level) for column type detection instead of
    ANY_VALUE(TYPEOF(...)) to ensure deterministic, schema-based types.
    """
    from .duckdb_reader import DuckDBReader
    from .query_utils import safe_identifier, execute_df

    metadata: Dict[str, Dict[str, Any]] = {}

    try:
        total_records = reader.row_count()
    except Exception:
        total_records = 0

    if total_records == 0:
        return metadata

    conn = reader._conn
    table_ref = reader._table or safe_identifier("data")

    # --- P1 Fix: Get all column types via DESCRIBE (deterministic, catalog-level) ---
    physical_type_map = _get_duckdb_physical_type_map(conn, table_ref)

    for col in columns:
        safe_col = safe_identifier(col)

        try:
            # Compute null count and unique count from DuckDB
            # (physical type is now from DESCRIBE, not TYPEOF)
            row = execute_df(
                conn,
                f"""
                SELECT
                    COUNT(*)                                               AS total,
                    COUNT({safe_col})                                      AS non_null,
                    APPROX_COUNT_DISTINCT({safe_col})                             AS unique_count
                FROM {table_ref}
                """,
            )
            if row.empty:
                continue
            r = row.iloc[0]
        except Exception:
            continue

        null_count = total_records - int(r["non_null"])
        null_ratio = null_count / total_records if total_records > 0 else 0.0
        unique_count = int(r["unique_count"])
        cardinality = unique_count / total_records if total_records > 0 else 0.0

        # --- P1 Fix: Use DESCRIBE type map instead of ANY_VALUE(TYPEOF(...)) ---
        raw_type = physical_type_map.get(col, "VARCHAR")
        physical_type = str(raw_type)

        # Detect logical type from DuckDB physical type + value sampling
        logical_type = "categorical"
        duckdb_type_lower = physical_type.lower()

        if any(t in duckdb_type_lower for t in ("int", "float", "double", "decimal", "numeric", "number")):
            logical_type = "numeric"
        elif any(t in duckdb_type_lower for t in ("date", "timestamp", "time")):
            logical_type = "temporal"
        elif "bool" in duckdb_type_lower:
            logical_type = "boolean"
        else:
            # For VARCHAR/string columns, check if boolean-like from DuckDB values
            try:
                sample = execute_df(
                    conn,
                    f"SELECT DISTINCT {safe_col} FROM {table_ref} WHERE {safe_col} IS NOT NULL LIMIT 10",
                )
                if not sample.empty:
                    vals = {str(v).strip().lower() for v in sample.iloc[:, 0] if pd.notna(v)}
                    if vals.issubset(BOOLEAN_WORDS) and len(vals) > 0:
                        logical_type = "boolean"
            except Exception:
                pass

        # Semantic tagging and format detection (same logic as pandas profiler)
        format_type, semantic_tags = _detect_semantics_and_format(col, logical_type, pd.Series(dtype="object"))

        # ID detection with DuckDB-accurate cardinality
        if logical_type != "numeric" and cardinality > 0.95 and "identity:surrogate" not in semantic_tags:
            semantic_tags.append("identity:surrogate")

        metadata[col] = {
            "physical_type": physical_type,
            "logical_type": logical_type,
            "null_ratio": null_ratio,
            "cardinality": cardinality,
            "unique_count": unique_count,
            "semantic_tags": semantic_tags,
            "format_type": format_type,
        }

    return metadata
