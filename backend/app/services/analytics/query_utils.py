"""
Safe parameterized SQL execution for DuckDB.

Centralizes query construction to enforce:
1. All VALUES passed via ? placeholders (never f-string interpolation)
2. All identifiers validated and double-quoted via safe_identifier()
3. Consistent logging and error handling

Belongs to: Analytics pipeline
Responsibility: Query safety — prevent SQL injection through value interpolation
"""

import duckdb
import logging
import re
from typing import Any, Dict, List, Optional, Tuple, Union

logger = logging.getLogger(__name__)

# Valid SQL identifier pattern (column or table name).
# Must start with letter or underscore, contain only alphanumeric + underscore.
_IDENTIFIER_RE = re.compile(r'^[a-zA-Z_][a-zA-Z0-9_]*$')


class QuerySafetyError(ValueError):
    """Raised when a query component fails safety validation."""
    pass


def safe_identifier(name: str) -> str:
    """Validate and return a double-quoted SQL identifier.
    
    Raises QuerySafetyError if the identifier contains unsafe characters.
    This prevents identifier injection while allowing standard column/table names.
    """
    if not _IDENTIFIER_RE.match(name):
        raise QuerySafetyError(
            f"Unsafe SQL identifier: '{name}'. "
            f"Identifiers must match {_IDENTIFIER_RE.pattern}"
        )
    return f'"{name}"'


def safe_table_ref(catalog: str, table: str) -> str:
    """Return a safely quoted table reference (catalog.table or just table)."""
    return f"{safe_identifier(catalog)}.{safe_identifier(table)}"


def execute(
    conn: duckdb.DuckDBPyConnection,
    query: str,
    params: Optional[List[Any]] = None,
) -> duckdb.DuckDBPyResult:
    """Execute a DuckDB query with parameterized values.
    
    Args:
        conn: DuckDB connection
        query: SQL string with ? placeholders for values.
               Identifiers (table/column names) must ALREADY be quoted
               via safe_identifier() before this call.
        params: List of parameter values matching ? placeholders.
    
    Returns:
        DuckDB query result
    
    Raises:
        QuerySafetyError if ? placeholders don't match params length
    """
    if params is not None and not isinstance(params, list):
        # Wrap single values
        if isinstance(params, (list, tuple)):
            params = list(params)
        else:
            params = [params]

    # Verify placeholder count matches params count
    if params:
        placeholder_count = query.count("?")
        if placeholder_count != len(params):
            raise QuerySafetyError(
                f"Parameter mismatch: query has {placeholder_count} placeholders"
                f" but {len(params)} params provided"
            )

    try:
        if params:
            result = conn.execute(query, params)
        else:
            result = conn.execute(query)
        return result
    except Exception as e:
        logger.error(f"Query execution failed: {e}")
        raise


def execute_df(
    conn: duckdb.DuckDBPyConnection,
    query: str,
    params: Optional[List[Any]] = None,
) -> "pandas.DataFrame":
    """Execute a parameterized DuckDB query and return a DataFrame."""
    result = execute(conn, query, params)
    return result.df()


def build_in_clause(values: List[Any]) -> Tuple[str, List[Any]]:
    """Build a parameterized IN (... ) clause.
    
    Returns (sql_fragment, params_list).
    Example: build_in_clause(["a", "b", "c"]) -> ("IN (?, ?, ?)", ["a", "b", "c"])
    """
    if not values:
        return "IN (NULL)", []
    placeholders = ", ".join(["?"] * len(values))
    return f"IN ({placeholders})", values
