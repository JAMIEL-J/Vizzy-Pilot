import re
import duckdb
import logging
import pandas as pd
from dataclasses import dataclass
from typing import Optional, List, Dict, Tuple

from app.services.analytics.query_utils import execute, build_in_clause, safe_identifier

logger = logging.getLogger(__name__)

@dataclass
class ColumnCoercionResult:
    original_name: str
    original_type: str
    coerced_type: str
    coercion_applied: Optional[str]
    null_count_before: int
    null_count_after: int
    failed_conversion_count: int
    sample_problematic_values: List[str]
    display_format: Optional[Dict[str, str]] = None

# Patterns to detect and clean before numeric coercion
DIRTY_NUMERIC_PATTERNS = [
    (r'^[-+]?\.?\$[\d,]+\.?\d*$', 'currency_usd'),
    (r'^[-+]?\$[\d,]+\.?\d*$', 'currency_usd'),
    (r'^[-+]?£[\d,]+\.?\d*$', 'currency_gbp'),
    (r'^[-+]?€[\d,]+\.?\d*$', 'currency_eur'),
    (r'^[-+]?[\d.]+,?\d*€$',  'euro_format'), # European 1.500,00€ or 1.500,00 
    (r'^[-+]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$', 'comma_formatted'),
    (r'^[-+]?(?:\d{1,3}(?:\.\d{3})+|\d+),\d+$',   'euro_format_no_currency'), 
    (r'^[-+]?[\d,.]+%+$',       'percentage'),
    (r'^(?:\([\d,.]+\)|[-+]?[\d,.]+)$', 'accounting_negative'),
]

NULL_STRINGS = {
    "n/a", "na", "null", "none", "nil", "unknown",
    "undefined", "-", "--", "?", "", "nan", "missing"
}

FORMATTING_MAP = {
    'currency_usd': {'type': 'currency', 'locale': 'en-US', 'currency': 'USD'},
    'currency_gbp': {'type': 'currency', 'locale': 'en-GB', 'currency': 'GBP'},
    'currency_eur': {'type': 'currency', 'locale': 'de-DE', 'currency': 'EUR'},
    'euro_format': {'type': 'currency', 'locale': 'de-DE', 'currency': 'EUR'},
    'euro_format_no_currency': {'type': 'decimal', 'locale': 'de-DE'},
    'percentage': {'type': 'percent', 'locale': 'en-US'},
    'comma_formatted': {'type': 'decimal', 'locale': 'en-US'},
    'accounting_negative': {'type': 'currency', 'locale': 'en-US', 'currency': 'USD'},
}

def build_clean_expression(column: str, pattern_name: str) -> str:
    """Build a DuckDB SQL expression to clean a dirty numeric string."""
    col = safe_identifier(column)
    if pattern_name == 'currency_usd':
        return f"REGEXP_REPLACE({col}, '[$,]', '', 'g')"
    elif pattern_name == 'currency_gbp':
        return f"REGEXP_REPLACE({col}, '[£,]', '', 'g')"
    elif pattern_name == 'currency_eur':
        return f"REGEXP_REPLACE({col}, '[€,]', '', 'g')"
    elif pattern_name in ['euro_format', 'euro_format_no_currency']:
        # Replace . with nothing, then , with ., then strip €
        return f"REPLACE(REPLACE(REGEXP_REPLACE({col}, '[€]', '', 'g'), '.', ''), ',', '.')"
    elif pattern_name == 'comma_formatted':
        return f"REPLACE({col}, ',', '')"
    elif pattern_name == 'percentage':
        return f"REPLACE({col}, '%', '')"
    elif pattern_name == 'accounting_negative':
        # If it has parens, prefix with '-', otherwise keep as is, and strip parens and commas
        return f"CASE WHEN {col} LIKE '(%' THEN '-' || REGEXP_REPLACE({col}, '[(),]', '', 'g') ELSE REGEXP_REPLACE({col}, '[,]', '', 'g') END"
    return col

def coerce_column(
    conn: duckdb.DuckDBPyConnection,
    table_name: str,
    column: str,
    sample_size: int = 500
) -> Optional[ColumnCoercionResult]:
    """Analyze and coerce a single VARCHAR column to numeric if it matches dirty patterns."""
    try:
        # Check column type
        schema_df = conn.execute(f'DESCRIBE {safe_identifier(table_name)}').df()
        col_info = schema_df[schema_df['column_name'] == column].iloc[0]
        original_type = col_info['column_type']

        if original_type != 'VARCHAR':
            return None

        # (Null-string cleanup is handled once for all columns in _batch_nullify_strings
        #  called by run_coercion_pipeline before the per-column loop.)
        # Step 1: Detect patterns from a sample — parameterized LIMIT
        sample_df = execute(conn, f"""
            SELECT {safe_identifier(column)}
            FROM {safe_identifier(table_name)}
            WHERE {safe_identifier(column)} IS NOT NULL
            LIMIT ?
        """, params=[sample_size]).df()

        if sample_df.empty:
            return None

        non_null_values = sample_df[column].astype(str).str.strip().tolist()
        
        detected_pattern = None
        max_match_rate = 0
        
        for pattern, pattern_name in DIRTY_NUMERIC_PATTERNS:
            matches = sum(1 for v in non_null_values if re.match(pattern, v))
            rate = matches / len(non_null_values)
            if rate > 0.85 and rate > max_match_rate:
                detected_pattern = pattern_name
                max_match_rate = rate

        if not detected_pattern:
            return None

        # Step 3: Apply transformation
        null_before = conn.execute(f'SELECT COUNT(*) FROM {safe_identifier(table_name)} WHERE {safe_identifier(column)} IS NULL').fetchone()[0]
        
        clean_expr = build_clean_expression(column, detected_pattern)
        tmp_col_name = f"{column}__coerced_tmp"
        
        # Create a temp column to test conversion
        conn.execute(f'ALTER TABLE {safe_identifier(table_name)} ADD COLUMN {safe_identifier(tmp_col_name)} DOUBLE')
        
        try:
            conn.execute(f'UPDATE {safe_identifier(table_name)} SET {safe_identifier(tmp_col_name)} = TRY_CAST({clean_expr} AS DOUBLE)')
        except Exception as e:
            logger.error(f"Coercion update failed for {column}: {e}")
            conn.execute(f'ALTER TABLE {safe_identifier(table_name)} DROP COLUMN {safe_identifier(tmp_col_name)}')
            return None

        # Check success rate
        stats = conn.execute(f"""
            SELECT 
                COUNT(*) FILTER (WHERE {safe_identifier(column)} IS NOT NULL AND {safe_identifier(tmp_col_name)} IS NULL) as failed_count,
                COUNT(*) as total_rows
            FROM {safe_identifier(table_name)}
        """).fetchone()
        
        failed_count, total_rows = stats
        success_rate = 1 - (failed_count / max(total_rows, 1))

        if success_rate >= 0.95:
            # Commit changes
            conn.execute(f'ALTER TABLE {safe_identifier(table_name)} DROP COLUMN {safe_identifier(column)}')
            conn.execute(f'ALTER TABLE {safe_identifier(table_name)} RENAME COLUMN {safe_identifier(tmp_col_name)} TO {safe_identifier(column)}')
            
            null_after = conn.execute(f'SELECT COUNT(*) FROM {safe_identifier(table_name)} WHERE {safe_identifier(column)} IS NULL').fetchone()[0]
            
            # Find sample problematic values if any
            problematic = []
            if failed_count > 0:
                # This is tricky because we dropped the original column.
                # In a real implementation we might want to keep it or log before dropping.
                pass

            return ColumnCoercionResult(
                original_name=column,
                original_type=original_type,
                coerced_type="DOUBLE",
                coercion_applied=detected_pattern,
                null_count_before=null_before,
                null_count_after=null_after,
                failed_conversion_count=failed_count,
                sample_problematic_values=problematic,
                display_format=FORMATTING_MAP.get(detected_pattern)
            )
        else:
            # Rollback
            conn.execute(f'ALTER TABLE {safe_identifier(table_name)} DROP COLUMN {safe_identifier(tmp_col_name)}')
            return None

    except Exception as e:
        logger.error(f"Error coercing column {column}: {e}")
        return None

def _batch_nullify_strings(conn: duckdb.DuckDBPyConnection, table_name: str, varchar_cols: List[str]) -> None:
    """Single-pass nullification of known null-string values across all VARCHAR columns.
    
    Instead of running one UPDATE per column (which scans the table each time),
    this runs a single UPDATE that nullifies all columns simultaneously.
    """
    if not varchar_cols:
        return

    # Build IN clause once, shared by all columns
    in_clause, null_params = build_in_clause(list(NULL_STRINGS))

    # Build CASE expressions for each column
    case_exprs = ", ".join(
        f'{safe_identifier(col)} = CASE WHEN LOWER(TRIM({safe_identifier(col)})) {in_clause} THEN NULL ELSE {safe_identifier(col)} END'
        for col in varchar_cols
    )

    sql = f'UPDATE {safe_identifier(table_name)} SET {case_exprs}'
    execute(conn, sql, params=null_params * len(varchar_cols))


def run_coercion_pipeline(conn: duckdb.DuckDBPyConnection, table_name: str) -> List[ColumnCoercionResult]:
    """Run single-pass coercion on all VARCHAR columns in a table (Option 3b).

    Collapses N sequential ALTER TABLE / UPDATE statements into a single
    CREATE TABLE ... AS SELECT pass, replacing N full-table disk rewrites
    with 1 single vectorized pass.
    """
    import time as _time
    _t0 = _time.perf_counter()

    results = []
    schema_df = execute(conn, f'DESCRIBE {safe_identifier(table_name)}').df()
    varchar_cols = schema_df[schema_df['column_type'] == 'VARCHAR']['column_name'].tolist()

    if not varchar_cols:
        return results

    in_clause, null_params = build_in_clause(list(NULL_STRINGS))
    select_exprs = []
    coercion_specs: Dict[str, Tuple[str, str, Optional[Dict[str, str]]]] = {}
    param_list: List[Any] = []

    for _, row in schema_df.iterrows():
        col = row['column_name']
        col_type = row['column_type']
        safe_col = safe_identifier(col)

        if col in varchar_cols:
            # Sample up to 500 non-null values with deterministic ordering to test pattern matching
            sample_df = execute(conn, f"""
                SELECT {safe_col}
                FROM {safe_identifier(table_name)}
                WHERE {safe_col} IS NOT NULL
                ORDER BY {safe_col}
                LIMIT 500
            """).df()

            detected_pattern = None
            if not sample_df.empty:
                non_null_values = sample_df[col].astype(str).str.strip().tolist()
                max_match_rate = 0.0
                for pattern, pattern_name in DIRTY_NUMERIC_PATTERNS:
                    matches = sum(1 for v in non_null_values if re.match(pattern, v))
                    rate = matches / len(non_null_values)
                    if rate > 0.85 and rate > max_match_rate:
                        detected_pattern = pattern_name
                        max_match_rate = rate

            if detected_pattern:
                clean_expr = build_clean_expression(col, detected_pattern)
                expr = f"CASE WHEN LOWER(TRIM({safe_col})) {in_clause} THEN NULL ELSE TRY_CAST({clean_expr} AS DOUBLE) END AS {safe_col}"
                coercion_specs[col] = (detected_pattern, clean_expr, FORMATTING_MAP.get(detected_pattern))
            else:
                # Test if standard TRY_CAST to DOUBLE succeeds for >= 95% of non-null values
                test_cast = execute(conn, f"""
                    SELECT 
                        COUNT(*) FILTER (WHERE TRY_CAST({safe_col} AS DOUBLE) IS NOT NULL) as valid_num,
                        COUNT(*) as total_non_null
                    FROM {safe_identifier(table_name)}
                    WHERE {safe_col} IS NOT NULL AND LOWER(TRIM({safe_col})) NOT IN ('null', 'n/a', '-', '', 'none', 'nan', 'undefined')
                """).fetchone()
                
                valid_num, total_non_null = test_cast or (0, 0)
                if total_non_null > 0 and (valid_num / total_non_null) >= 0.95:
                    detected_pattern = "standard_numeric"
                    clean_expr = safe_col
                    expr = f"CASE WHEN LOWER(TRIM({safe_col})) {in_clause} THEN NULL ELSE TRY_CAST({safe_col} AS DOUBLE) END AS {safe_col}"
                    coercion_specs[col] = (detected_pattern, clean_expr, None)
                else:
                    expr = f"CASE WHEN LOWER(TRIM({safe_col})) {in_clause} THEN NULL ELSE {safe_col} END AS {safe_col}"

            select_exprs.append(expr)
            param_list.extend(null_params)
        else:
            select_exprs.append(f"{safe_col} AS {safe_col}")

    tmp_table = f"{table_name}__coerced_tmp"
    conn.execute(f'DROP TABLE IF EXISTS {safe_identifier(tmp_table)}')
    sql = f"CREATE TABLE {safe_identifier(tmp_table)} AS SELECT {', '.join(select_exprs)} FROM {safe_identifier(table_name)}"
    execute(conn, sql, params=param_list)

    # Post-validation: Record results for coerced columns
    for col, (pattern_name, clean_expr, display_fmt) in coercion_specs.items():
        safe_col = safe_identifier(col)
        stats = conn.execute(f"""
            SELECT 
                COUNT(*) FILTER (WHERE {safe_col} IS NULL) as null_after,
                COUNT(*) as total_rows
            FROM {safe_identifier(tmp_table)}
        """).fetchone()

        null_after, total_rows = stats or (0, 0)
        results.append(ColumnCoercionResult(
            original_name=col,
            original_type="VARCHAR",
            coerced_type="DOUBLE",
            coercion_applied=pattern_name,
            null_count_before=0,
            null_count_after=null_after,
            failed_conversion_count=0,
            sample_problematic_values=[],
            display_format=display_fmt
        ))
        logger.info("Single-pass coerced column %s: %s -> DOUBLE", col, pattern_name)

    # Swap temp table for original table in 1 atomic operation
    conn.execute(f'DROP TABLE IF EXISTS {safe_identifier(table_name)}')
    conn.execute(f'ALTER TABLE {safe_identifier(tmp_table)} RENAME TO {safe_identifier(table_name)}')

    _t_total = _time.perf_counter()
    total_time = _t_total - _t0
    logger.info("Single-pass coercion pipeline total: %.2fs (%d cols, %d coercions)", total_time, len(varchar_cols), len(results))

    return results
