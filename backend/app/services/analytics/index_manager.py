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


def create_performance_indices(
    conn: duckdb.DuckDBPyConnection,
    table_name: str,
) -> List[str]:
    """Analyze table schema and create ART indices on date + categorical columns.
    
    Skips tables already indexed in this process lifetime.
    Returns list of index names created.
    """
    if table_name in _INDEX_CACHE:
        logger.debug("Table '%s' already indexed, skipping.", table_name)
        return []

    created: List[str] = []
    date_types = _get_date_like_types()

    try:
        schema_df = conn.execute(f'DESCRIBE "{table_name}"').df()
    except Exception as e:
        logger.warning("Could not describe table '%s' for indexing: %s", table_name, e)
        return []

    # Re-order table by date columns for better row-group pruning in DuckDB
    # MUST happen BEFORE index creation (re-ordering drops/recreates table)
    _order_table_by_date(conn, table_name, date_types)

    for _, row in schema_df.iterrows():
        col_name = row["column_name"]
        col_type = row["column_type"].upper()

        # Index DATE / TIMESTAMP columns
        if col_type in date_types:
            idx = _index_name(table_name, col_name)
            try:
                conn.execute(f'CREATE INDEX IF NOT EXISTS "{idx}" ON "{table_name}" ("{col_name}")')
                created.append(idx)
                logger.debug("Created index '%s' on date column '%s'", idx, col_name)
            except Exception as e:
                logger.warning("Failed to create index on '%s': %s", col_name, e)
            continue

        # Index low-cardinality VARCHAR columns (categoricals)
        if col_type.startswith("VARCHAR") or col_type == "STRING":
            if _is_low_cardinality_categorical(conn, table_name, col_name):
                idx = _index_name(table_name, col_name)
                try:
                    conn.execute(f'CREATE INDEX IF NOT EXISTS "{idx}" ON "{table_name}" ("{col_name}")')
                    created.append(idx)
                    logger.debug("Created index '%s' on categorical column '%s'", idx, col_name)
                except Exception as e:
                    logger.warning("Failed to create index on '%s': %s", col_name, e)

    _INDEX_CACHE.add(table_name)
    logger.info("Created %d performance indices on table '%s'", len(created), table_name)
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
        schema_df = conn.execute(f'DESCRIBE "{table_name}"').df()
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
        count = conn.execute(f'SELECT COUNT(*) FROM "{table_name}"').fetchone()[0]
        if count == 0:
            return

        # DuckDB: re-order by clustering via ORDER BY in CTAS + rename
        tmp_name = f'"{table_name}__reordered"'
        conn.execute(f'DROP TABLE IF EXISTS {tmp_name}')
        conn.execute(
            f'CREATE TABLE {tmp_name} AS SELECT * FROM "{table_name}" ORDER BY "{sort_col}"'
        )
        conn.execute(f'DROP TABLE IF EXISTS "{table_name}"')
        conn.execute(f'ALTER TABLE {tmp_name} RENAME TO "{table_name}"')
        logger.debug("Re-ordered table '%s' by column '%s'", table_name, sort_col)
    except Exception as e:
        logger.warning("Could not re-order table '%s' by date: %s", table_name, e)
