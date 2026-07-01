"""
Index manager for DuckDB analytical tables.

Creates composite performance indices on date and categorical columns
after table creation to accelerate common analytical query patterns.

Belongs to: Analytics pipeline
Responsibility: Post-load table optimization (indices, ordering)
"""

import duckdb
import logging
from typing import List, Set
from .query_utils import safe_identifier

logger = logging.getLogger(__name__)

# DuckDB ART index types are created via standard CREATE INDEX syntax.
# For analytical workloads, single-column indices on high-filter columns
# (dates, categoricals) provide the best cost/benefit ratio.
_INDEX_CACHE: Set[str] = set()  # track tables already indexed to avoid redundant work


def _get_date_like_types() -> List[str]:
    """Return DuckDB type names considered date/time for indexing."""
    return [
        "DATE", "TIMESTAMP", "TIMESTAMP WITH TIME ZONE",
        "TIMESTAMP WITHOUT TIME ZONE", "TIME",
        "TIMESTAMP_NS", "TIMESTAMP_MS", "TIMESTAMP_S",
        "TIMESTAMPTZ",
    ]


def _is_low_cardinality_categorical(
    conn: duckdb.DuckDBPyConnection,
    table_name: str,
    column_name: str,
    threshold: float = 0.05,
) -> bool:
    """Check if a VARCHAR column is low-cardinality (< 5% unique).
    
    Uses COUNT(DISTINCT) / COUNT(*) ratio to determine cardinality.
    Low-cardinality categoricals benefit most from indexing.
    """
    try:
        row = conn.execute(
            """
            SELECT CASE WHEN c > 0 THEN u * 1.0 / c ELSE 1 END AS ratio
            FROM (
                SELECT
                    (SELECT COUNT(DISTINCT "{}") FROM "{}") AS u,
                    (SELECT COUNT(*) FROM "{}") AS c
            ) t
            """.format(column_name, table_name, table_name)
        ).fetchone()
        if row:
            return row[0] <= threshold
    except Exception:
        pass
    return False


def _index_name(table_name: str, column_name: str) -> str:
    """Generate a deterministic index name."""
    safe_table = table_name.replace('"', "").replace(" ", "_")
    safe_col = column_name.replace('"', "").replace(" ", "_")
    return f"ix_{safe_table}_{safe_col}"


def _batch_compute_cardinality(
    conn: duckdb.DuckDBPyConnection,
    table_name: str,
    varchar_cols: List[str],
    threshold: float = 0.05,
) -> List[str]:
    """Compute cardinality ratio for all VARCHAR columns in a single query.
    
    Returns column names where ratio (distinct / total) <= threshold
    (i.e., low-cardinality columns worth indexing).
    """
    if not varchar_cols:
        return []

    # Build a UNNEST query that computes ratios for all columns in one pass
    union_parts = []
    for col in varchar_cols:
        union_parts.append(
            f'SELECT \'{col}\' AS col_name, '
            f'COUNT(DISTINCT "{col}") AS u, '
            f'COUNT(*) AS c '
            f'FROM "{table_name}"'
        )
    combined = " UNION ALL ".join(union_parts)

    try:
        result = conn.execute(
            f"""
            SELECT col_name
            FROM ({combined}) t
            WHERE c > 0 AND u * 1.0 / c <= ?
            """,
            parameters=[threshold],
        ).fetchall()
        return [row[0] for row in result]
    except Exception as e:
        logger.warning("Batch cardinality computation failed: %s", e)
        # Fallback: return empty, no indices created
        return []


def create_performance_indices(
    conn: duckdb.DuckDBPyConnection,
    table_name: str,
) -> List[str]:
    """Analyze table schema and create ART indices on date + categorical columns.
    
    Skips tables already indexed in this process lifetime.
    Uses a single-pass batch query for cardinality checks instead of
    per-column COUNT(DISTINCT) queries. Does NOT reorder the table
    on ingest (defers to an explicit optimization step if needed).
    Returns list of index names created.
    """
    import time as _time
    _t0 = _time.perf_counter()

    if table_name in _INDEX_CACHE:
        logger.debug("Table '%s' already indexed, skipping.", table_name)
        return []

    created: List[str] = []
    date_types = _get_date_like_types()

    try:
        schema_df = conn.execute(f'DESCRIBE {safe_identifier(table_name)}').df()
    except Exception as e:
        logger.warning("Could not describe table '%s' for indexing: %s", table_name, e)
        return []

    # -- Date columns: create indexes (fast, no full scan) --
    date_cols = []
    varchar_cols = []
    for _, row in schema_df.iterrows():
        col_name = row["column_name"]
        col_type = row["column_type"].upper()
        if col_type in date_types:
            date_cols.append(col_name)
        elif col_type.startswith("VARCHAR") or col_type == "STRING":
            varchar_cols.append(col_name)

    # Index date columns (these are always worth indexing)
    for col_name in date_cols:
        idx = _index_name(table_name, col_name)
        try:
            conn.execute(f'CREATE INDEX IF NOT EXISTS {safe_identifier(idx)} ON {safe_identifier(table_name)} ({safe_identifier(col_name)})')
            created.append(idx)
        except Exception as e:
            logger.warning("Failed to create index on '%s': %s", col_name, e)

    # -- Categorical columns: single-pass cardinality check + index --
    low_card_cols = _batch_compute_cardinality(conn, table_name, varchar_cols, threshold=0.05)
    for col_name in low_card_cols:
        idx = _index_name(table_name, col_name)
        try:
            conn.execute(f'CREATE INDEX IF NOT EXISTS {safe_identifier(idx)} ON {safe_identifier(table_name)} ({safe_identifier(col_name)})')
            created.append(idx)
        except Exception as e:
            logger.warning("Failed to create index on '%s': %s", col_name, e)

    _INDEX_CACHE.add(table_name)
    _elapsed = _time.perf_counter() - _t0
    logger.info(
        "Created %d performance indices on table '%s' in %.2fs (%d date, %d varchar: %d low-card)",
        len(created), table_name, _elapsed,
        len(date_cols), len(varchar_cols), len(low_card_cols),
    )
    return created


def _order_table_by_date(
    conn: duckdb.DuckDBPyConnection,
    table_name: str,
    date_types: List[str],
) -> None:
    """Re-order table rows by the first date column found.
    
    DuckDB's columnar storage benefits significantly from sorted data
    because zone maps (min/max per row group) become more effective.
    This is a no-op if no date column exists or table is empty.
    """
    try:
        schema_df = conn.execute(f'DESCRIBE {safe_identifier(table_name)}').df()
        date_cols = [
            r["column_name"]
            for _, r in schema_df.iterrows()
            if r["column_type"].upper() in date_types
        ]
        if not date_cols:
            return

        # Use the first date column as the sort key
        sort_col = date_cols[0]

        # Skip if table is empty
        count = conn.execute(f'SELECT COUNT(*) FROM {safe_identifier(table_name)}').fetchone()[0]
        if count == 0:
            return

        # DuckDB: re-order by clustering via ORDER BY in CTAS + rename
        tmp_name = f'{table_name}__reordered'
        conn.execute(f'DROP TABLE IF EXISTS {safe_identifier(tmp_name)}')
        conn.execute(
            f'CREATE TABLE {safe_identifier(tmp_name)} AS SELECT * FROM {safe_identifier(table_name)} ORDER BY {safe_identifier(sort_col)}'
        )
        conn.execute(f'DROP TABLE IF EXISTS {safe_identifier(table_name)}')
        conn.execute(f'ALTER TABLE {safe_identifier(tmp_name)} RENAME TO {safe_identifier(table_name)}')
        logger.debug("Re-ordered table '%s' by column '%s'", table_name, sort_col)
    except Exception as e:
        logger.warning("Could not re-order table '%s' by date: %s", table_name, e)
