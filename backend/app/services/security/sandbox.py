import re
import duckdb
import sqlglot
from sqlglot import exp
import logging
import asyncio
from concurrent.futures import ThreadPoolExecutor
from typing import Tuple, Optional
import pandas as pd

logger = logging.getLogger(__name__)

BLOCKED_STATEMENTS = {
    "DROP", "DELETE", "UPDATE", "INSERT", "ALTER",
    "CREATE", "TRUNCATE", "REPLACE", "MERGE",
    "INSTALL", "LOAD", "ATTACH", "COPY", "EXPORT"
}

BLOCKED_PATTERNS = [
    r"read_csv\s*\(",
    r"read_parquet\s*\(",
    r"read_json\s*\(",
    r"glob\s*\(",
    r"httpfs",
    r"http://",
    r"https://",
    r"\/etc\/",
    r"\.\.\/",
    r"__import__",
    r"pg_read_file",
    r"COPY\s+.*\s+TO",
    r"EXPORT\s+DATABASE",
]

class QueryExecutionError(Exception):
    pass

_executor = ThreadPoolExecutor(max_workers=4)

def auto_quote_schema_columns(sql: str, known_columns: Optional[list[str]] = None) -> str:
    """
    Scans SQL for unquoted occurrences of schema column names containing spaces, hyphens,
    slashes, or special characters, and wraps them in double quotes.
    """
    if not sql or not known_columns:
        return sql
    fixed_sql = sql
    sorted_cols = sorted(known_columns, key=len, reverse=True)
    for col in sorted_cols:
        if any(char in col for char in (' ', '-', '/', '%', '#')) and not col.startswith('"'):
            escaped_col = re.escape(col)
            pattern = r'(?<!")\b' + escaped_col + r'\b(?!")'
            fixed_sql = re.sub(pattern, f'"{col}"', fixed_sql, flags=re.IGNORECASE)
    return fixed_sql

def validate_sql(
    sql: str,
    allowed_tables: str | list[str],
    known_columns: Optional[list[str]] = None
) -> Tuple[bool, str, Optional[exp.Expression]]:
    """
    Returns (is_valid, error_message, parsed_expression).
    Uses DuckDB AST parsing — not string matching.
    """
    if isinstance(allowed_tables, str):
        allowed_tables = [allowed_tables]

    sql = sql.strip()

    # Step 0: Auto-quote schema columns with spaces/hyphens if provided
    if known_columns:
        sql = auto_quote_schema_columns(sql, known_columns)

    # Step 0.1: Defense-in-depth: Run regex patterns
    for pattern in BLOCKED_PATTERNS:
        if re.search(pattern, sql, re.IGNORECASE):
            return False, f"Blocked pattern matched: {pattern}", None

    # Step 0.5: Multiple statements check via sqlglot
    try:
        parsed_statements = sqlglot.parse(sql, read="duckdb")
        if len(parsed_statements) > 1:
            return False, "Multiple statements are not allowed.", None
    except Exception as e:
        pass
    
    # Step 1: Parse via DuckDB — catches syntax errors using parameterized serialization query
    try:
        parsed_db = duckdb.execute("SELECT json_serialize_sql(?)", [sql])
        ast = parsed_db.fetchone()[0]
    except Exception as e:
        return False, f"Syntax error: {str(e)}", None
    
    # Step 2: AST must be a single SELECT statement at root
    import json
    tree = json.loads(ast)

    if tree.get("error") is True:
        err_msg = tree.get("error_message", "")
        if "Only SELECT statements can be serialized" in err_msg:
            return False, "Only SELECT statements permitted.", None
        return False, f"SQL error: {err_msg}", None

    statements = tree.get("statements", [])
    if len(statements) != 1:
        return False, "Only a single statement is allowed.", None
    if statements[0].get("node", {}).get("type") != "SELECT_NODE":
        return False, "Only SELECT statements permitted.", None
    
    # Step 3: Reject any table reference not in allowed_tables
    # Walk AST for all table references
    def extract_table_refs(node):
        refs = []
        if isinstance(node, dict):
            if node.get("type") in ("BASE_TABLE", "BASE_TABLE_REF"):
                refs.append(node.get("table_name", "").lower())
            for v in node.values():
                refs.extend(extract_table_refs(v))
        elif isinstance(node, list):
            for item in node:
                refs.extend(extract_table_refs(item))
        return refs
    
    table_refs = extract_table_refs(tree)
    
    # Exclude CTE aliases defined inside the query itself
    def extract_cte_aliases(node):
        aliases = []
        if isinstance(node, dict):
            if "cte_map" in node and isinstance(node["cte_map"], dict):
                m = node["cte_map"].get("map", [])
                for item in m:
                    if isinstance(item, dict) and "key" in item:
                        aliases.append(item["key"].lower())
            for v in node.values():
                aliases.extend(extract_cte_aliases(v))
        elif isinstance(node, list):
            for item in node:
                aliases.extend(extract_cte_aliases(item))
        return aliases
        
    cte_aliases = set(extract_cte_aliases(tree))
    allowed_lower = [t.lower() for t in allowed_tables]
    
    for ref in table_refs:
        if ref and ref not in allowed_lower and ref not in cte_aliases:
            return False, f"Unauthorized table: Table '{ref}' is not accessible in this dataset.", None
    
    # Step 4: Reject DuckDB file-access functions explicitly
    FORBIDDEN_FUNCTIONS = {
        "read_csv_auto", "read_csv", "read_parquet", "read_json",
        "read_json_auto", "scan_csv", "copy", "export_database",
        "import_database", "load", "install"
    }
    sql_upper = sql.upper()
    for fn in FORBIDDEN_FUNCTIONS:
        if fn.upper() in sql_upper:
            return False, f"Function '{fn}' is not permitted.", None
            
    # Parse via sqlglot to return the parsed expression for limit injection
    try:
        parsed_expr = sqlglot.parse_one(sql, read="duckdb")
    except Exception as e:
        return False, f"SQL parse failure: {str(e)}", None
    
    return True, "valid", parsed_expr

def sanitize_error_message(error: str, table_name: str) -> str:
    """Remove sensitive information from error messages."""
    # Remove file paths
    error = re.sub(r"\/[\w\/\.]+", "[path_redacted]", error)
    # Remove internal table names
    error = error.replace(table_name, "[table_redacted]")
    return error

async def execute_sandboxed(
    conn: duckdb.DuckDBPyConnection,
    sql: str,
    table_name: str,
    max_rows: int = 10000,
    timeout_seconds: int = 30
) -> pd.DataFrame:
    """Execute SQL query in a sandboxed thread with timeout."""
    
    known_cols = []
    try:
        describe_df = conn.execute(f'DESCRIBE "{table_name}"').df()
        if "column_name" in describe_df.columns:
            known_cols = describe_df["column_name"].tolist()
            sql = auto_quote_schema_columns(sql, known_cols)
    except Exception as e:
        logger.debug(f"Could not fetch column names for auto-quoting: {e}")

    is_valid, reason, parsed = validate_sql(sql, table_name, known_columns=known_cols)
    if not is_valid:
        logger.warning(f"SQL Validation Failed: {reason} | SQL: {sql}")
        raise QueryExecutionError(f"SQL validation failed: {reason}")

    # Inject row limit via AST
    limited_sql = parsed.limit(max_rows).sql(dialect="duckdb")
    
    def _execute():
        try:
            logger.debug(f"Executing Sandboxed SQL: {limited_sql}")
            return conn.execute(limited_sql).df()
        except Exception as e:
            sanitized = sanitize_error_message(str(e), table_name)
            logger.error(f"DuckDB Execution Error: {str(e)}")
            raise QueryExecutionError(sanitized)

    try:
        # Use asyncio.wait_for with run_in_executor for thread-safe timeout
        return await asyncio.wait_for(
            asyncio.get_event_loop().run_in_executor(_executor, _execute),
            timeout=timeout_seconds
        )
    except asyncio.TimeoutError:
        logger.error(f"Query Timeout: {sql}")
        raise QueryExecutionError(f"Query exceeded {timeout_seconds}s limit")
    except Exception as e:
        if not isinstance(e, QueryExecutionError):
            logger.error(f"Unexpected Execution Error: {str(e)}")
            raise QueryExecutionError(f"Unexpected execution error: {str(e)}")
        raise
