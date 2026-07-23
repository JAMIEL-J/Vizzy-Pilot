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

# Valid SQL identifier pattern (simple unquoted names).
# For names that don't match, we still allow them via double-quoting
# after sanitization (DuckDB supports quoted identifiers with spaces).
_IDENTIFIER_SIMPLE_RE = re.compile(r'^[a-zA-Z_][a-zA-Z0-9_]*$')


class QuerySafetyError(ValueError):
    """Raised when a query component fails safety validation."""
    pass


def safe_identifier(name: str) -> str:
    """Validate and return a double-quoted SQL identifier.

    Accepts any string as a SQL identifier by double-quoting it with
    proper escaping. Rejects identifiers that are unsafe to use even
    within double-quotes: empty, null bytes, control characters,
    format/overpower characters (bidi, zero-width), or excessively long.

    Embedded double-quotes are escaped per SQL standard (doubled: " → "").

    DuckDB accepts any character inside a double-quoted identifier
    except the double-quote itself (which must be doubled), so this
    function is safe for all real-world CSV column names including
    spaces, hyphens, periods, numeric prefixes, and unicode characters.
    """
    if not name or not name.strip():
        raise QuerySafetyError("Empty SQL identifier is not allowed.")
    if '\x00' in name:
        raise QuerySafetyError(
            f"Unsafe SQL identifier: '{name[:50]}...'. Null bytes are not allowed."
        )
    if len(name) > 256:
        raise QuerySafetyError(
            f"Unsafe SQL identifier: '{name[:50]}...'. "
            f"Identifier too long ({len(name)} chars, max 256)."
        )

    # Reject ASCII control characters (0x00-0x1F, 0x7F)
    # These can truncate or corrupt SQL parsing even inside double-quotes.
    for i, ch in enumerate(name):
        code = ord(ch)
        if code < 0x20 or code == 0x7F:
            raise QuerySafetyError(
                f"Unsafe SQL identifier: '{name[:50]}...'. "
                f"Character {i} is an ASCII control character (U+{code:04X})."
            )

    # Reject Unicode format / control / surrogate characters (category Cc, Cf, Cs)
    # Includes bidi overrides (U+202A-U+202E), zero-width spaces (U+200B),
    # language indicators, and other invisible characters.
    import unicodedata
    for i, ch in enumerate(name):
        cat = unicodedata.category(ch)
        if cat in ('Cc', 'Cf', 'Cs'):
            raise QuerySafetyError(
                f"Unsafe SQL identifier: '{name[:50]}...'. "
                f"Character {i} is a disallowed Unicode {cat} character "
                f"(U+{ord(ch):04X})."
            )

    # Escape any embedded double-quotes (SQL standard: " → "")
    escaped = name.replace('"', '""')
    return f'"{escaped}"'


def safe_table_ref(catalog: str, table: str) -> str:
    """Return a safely quoted table reference (catalog.table or just table)."""
    return f"{safe_identifier(catalog)}.{safe_identifier(table)}"


def execute(
    conn: duckdb.DuckDBPyConnection,
    query: str,
    params: Optional[List[Any]] = None,
) -> duckdb.DuckDBPyConnection:
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
    df = result.df()
    
    # ponytail: Aggressive memory downcasting for categorical strings
    # Converts heavy Python object strings to memory-mapped int pointers
    for col in df.select_dtypes(include=["object", "string"]).columns:
        try:
            if df[col].nunique(dropna=False) < (len(df) * 0.5):
                df[col] = df[col].astype("category")
        except Exception:
            pass
            
    return df


def build_in_clause(values: List[Any]) -> Tuple[str, List[Any]]:
    """Build a parameterized IN (... ) clause.
    
    Returns (sql_fragment, params_list).
    Example: build_in_clause(["a", "b", "c"]) -> ("IN (?, ?, ?)", ["a", "b", "c"])
    """
    if not values:
        return "IN (NULL)", []
    placeholders = ", ".join(["?"] * len(values))
    return f"IN ({placeholders})", values
