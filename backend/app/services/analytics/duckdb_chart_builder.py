"""
DuckDB Chart Query Builder.

Generates optimized SQL queries for dashboard charts using DuckDB.
Replaces pandas aggregations with columnar SQL queries (PowerBI approach).
"""
import logging
from typing import Dict, Any, List, Optional, Tuple
import duckdb

logger = logging.getLogger(__name__)


# Semantic binary groups used for robust filter matching across text/numeric encodings.
_POSITIVE_KEYWORDS = {
    '1', '1.0', '1.00', 'yes', 'true', 'y', 'positive',
    'churned', 'churn', 'exited', 'attrited', 'left',
    'cancelled', 'canceled', 'defaulted', 'inactive'
}
_NEGATIVE_KEYWORDS = {
    '0', '0.0', '0.00', 'no', 'false', 'n', 'negative',
    'retained', 'stayed', 'active', 'performing'
}


def _normalize_filter_token(value: Any) -> str:
    return str(value).strip().lower() if value is not None else ''


def _binary_bucket(value: Any) -> Optional[str]:
    """Map semantic binary values to '__pos__' / '__neg__' buckets."""
    token = _normalize_filter_token(value)
    if not token:
        return None
    if token in _POSITIVE_KEYWORDS:
        return '__pos__'
    if token in _NEGATIVE_KEYWORDS:
        return '__neg__'
    return None


def _binary_sql_condition(column: str, bucket: str) -> str:
    """Build SQL condition for semantic binary bucket, tolerant to numeric/text encodings."""
    col_text = f'LOWER(TRIM(CAST("{column}" AS VARCHAR)))'
    if bucket == '__pos__':
        pos_list = ', '.join([f"'{v}'" for v in sorted(_POSITIVE_KEYWORDS)])
        return f'({col_text} IN ({pos_list}) OR TRY_CAST("{column}" AS DOUBLE) = 1)'
    neg_list = ', '.join([f"'{v}'" for v in sorted(_NEGATIVE_KEYWORDS)])
    return f'({col_text} IN ({neg_list}) OR TRY_CAST("{column}" AS DOUBLE) = 0)'


def _normalize_aggregation(aggregation: Optional[str], default: str = 'COUNT') -> str:
    """Normalize aggregation aliases to SQL-safe canonical forms."""
    agg = str(aggregation or default).strip().upper()
    alias_map = {
        'MEAN': 'AVG',
        'AVERAGE': 'AVG',
        'COUNT_DISTINCT': 'COUNT',
    }
    return alias_map.get(agg, agg)


def build_filter_where_clause(
    filters: Dict[str, List[str]],
    target_column: Optional[str] = None,
    target_value: str = "all"
) -> Tuple[str, List[Any]]:
    """
    Build SQL WHERE clause from filters.

    Returns:
        (where_clause, params) tuple for parameterized query
    """
    conditions = []
    params = []

    # Target value filter (Churned/Retained tabs)
    if target_column and target_value and target_value.lower() != "all":
        target_norm = _normalize_filter_token(target_value)
        target_bucket = _binary_bucket(target_norm)

        if target_bucket:
            conditions.append(_binary_sql_condition(target_column, target_bucket))
        else:
            conditions.append(f'LOWER(TRIM(CAST("{target_column}" AS VARCHAR))) = ?')
            params.append(target_norm)

    # Column filters
    for column, values in filters.items():
        if not values:
            continue

        # Check if any value is a range filter
        range_conditions = []
        scalar_values = []

        for val in values:
            val_str = str(val).strip()

            # Range patterns: "21-46", ">= 46", "<= 46", "> 46", "< 46"
            if '-' in val_str and val_str[0] != '-':  # Range like "21-46"
                parts = val_str.split('-')
                if len(parts) == 2:
                    try:
                        min_val = float(parts[0].strip())
                        max_val = float(parts[1].strip())
                        range_conditions.append(f'(TRY_CAST("{column}" AS DOUBLE) BETWEEN ? AND ?)')
                        params.extend([min_val, max_val])
                        continue
                    except ValueError:
                        pass
            elif val_str.startswith('>='):
                try:
                    min_val = float(val_str[2:].strip())
                    range_conditions.append(f'TRY_CAST("{column}" AS DOUBLE) >= ?')
                    params.append(min_val)
                    continue
                except ValueError:
                    pass
            elif val_str.startswith('<='):
                try:
                    max_val = float(val_str[2:].strip())
                    range_conditions.append(f'TRY_CAST("{column}" AS DOUBLE) <= ?')
                    params.append(max_val)
                    continue
                except ValueError:
                    pass
            elif val_str.startswith('>') and not val_str.startswith('>='):
                try:
                    min_val = float(val_str[1:].strip())
                    range_conditions.append(f'TRY_CAST("{column}" AS DOUBLE) > ?')
                    params.append(min_val)
                    continue
                except ValueError:
                    pass
            elif val_str.startswith('<') and not val_str.startswith('<='):
                try:
                    max_val = float(val_str[1:].strip())
                    range_conditions.append(f'TRY_CAST("{column}" AS DOUBLE) < ?')
                    params.append(max_val)
                    continue
                except ValueError:
                    pass

            # Scalar value; normalize for robust text matching.
            scalar_values.append(str(val).strip().lower())

        # Combine scalar and range conditions for this column
        col_conditions = []
        if scalar_values:
            # Semantic binary matching for values like yes/no/true/false/1/0/churned/retained.
            # This is dynamic and column-agnostic (no hardcoded column names).
            bucket_values = {_binary_bucket(v) for v in scalar_values}
            bucket_values.discard(None)

            if bucket_values:
                if '__pos__' in bucket_values:
                    col_conditions.append(_binary_sql_condition(column, '__pos__'))
                if '__neg__' in bucket_values:
                    col_conditions.append(_binary_sql_condition(column, '__neg__'))

                # Keep any non-binary scalar values as exact matches.
                exact_scalar_values = [v for v in scalar_values if _binary_bucket(v) is None]
                if exact_scalar_values:
                    placeholders = ','.join(['?'] * len(exact_scalar_values))
                    col_conditions.append(
                        f'LOWER(TRIM(CAST("{column}" AS VARCHAR))) IN ({placeholders})'
                    )
                    params.extend(exact_scalar_values)
            else:
                placeholders = ','.join(['?'] * len(scalar_values))
                col_conditions.append(
                    f'LOWER(TRIM(CAST("{column}" AS VARCHAR))) IN ({placeholders})'
                )
                params.extend(scalar_values)

        col_conditions.extend(range_conditions)

        if col_conditions:
            conditions.append(f"({' OR '.join(col_conditions)})")

    where_clause = ' AND '.join(conditions) if conditions else '1=1'
    return where_clause, params


def build_chart_query(
    chart_config: Dict[str, Any],
    filters: Dict[str, List[str]],
    target_column: Optional[str] = None,
    target_value: str = "all",
    table_name: str = "data"
) -> Tuple[str, List[Any]]:
    """
    Build SQL query for a single chart based on its configuration.

    Args:
        chart_config: Chart configuration (dimension, metric, aggregation, type, etc.)
        filters: Active filters {column: [values]}
        target_column: Target column for churn/outcome analysis
        target_value: Target tab value ("all", "churned", "retained")
        table_name: DuckDB table name

    Returns:
        (query, params) tuple for parameterized execution
    """
    dimension = chart_config.get('dimension')
    metric = chart_config.get('metric')
    aggregation = _normalize_aggregation(chart_config.get('aggregation'), default='COUNT')
    chart_type = chart_config.get('type', 'bar')
    is_date = chart_config.get('is_date', False)

    where_clause, params = build_filter_where_clause(filters, target_column, target_value)

    # Base query components
    select_parts = []
    group_by_parts = []
    order_by = ""
    limit_clause = ""

    if chart_type == 'scatter':
        # Scatter plot: return x, y pairs
        x_col = dimension or chart_config.get('x_column')
        y_col = metric or chart_config.get('y_column')

        if x_col and y_col:
            return f'''
                SELECT
                    "{x_col}" as x,
                    "{y_col}" as y,
                    '{x_col}' as xLabel,
                    '{y_col}' as yLabel
                FROM "{table_name}"
                WHERE {where_clause}
                    AND "{x_col}" IS NOT NULL
                    AND "{y_col}" IS NOT NULL
                LIMIT 1000
            ''', params
        else:
            return f'SELECT 1 as x, 1 as y LIMIT 0', []  # Empty result

    if dimension:
        # Categorical breakdown
        if is_date:
            # Match chat analytics trend SQL semantics: month-level time buckets.
            select_parts.append(f'DATE_TRUNC(\'month\', TRY_CAST("{dimension}" AS DATE)) as date')
            group_by_parts.append('1')
            order_by = 'ORDER BY date'
            limit_clause = ''
        else:
            select_parts.append(f'CAST("{dimension}" AS VARCHAR) as name')
            group_by_parts.append('1')
            order_by = 'ORDER BY value DESC'
            limit_clause = 'LIMIT 10'  # Top 10 categories

    # Aggregation
    if metric:
        if aggregation == 'COUNT':
            select_parts.append(f'COUNT("{metric}") as value')
        elif aggregation in ['SUM', 'AVG', 'MIN', 'MAX']:
            select_parts.append(f'{aggregation}(TRY_CAST("{metric}" AS DOUBLE)) as value')
        else:
            select_parts.append(f'SUM(TRY_CAST("{metric}" AS DOUBLE)) as value')
    else:
        # Count rows
        select_parts.append('COUNT(*) as value')

    if not select_parts:
        return f'SELECT 1 as value LIMIT 0', []  # Empty

    group_clause = f"GROUP BY {', '.join(group_by_parts)}" if group_by_parts else ""

    query = f'''
        SELECT {', '.join(select_parts)}
        FROM "{table_name}"
        WHERE {where_clause}
        {group_clause}
        {order_by}
        {limit_clause}
    '''

    return query.strip(), params


def execute_chart_queries(
    conn: duckdb.DuckDBPyConnection,
    chart_configs: Dict[str, Dict[str, Any]],
    filters: Dict[str, List[str]],
    target_column: Optional[str] = None,
    target_value: str = "all"
) -> Dict[str, List[Dict[str, Any]]]:
    """
    Execute all chart queries and return results.

    Returns:
        Dict mapping chart_id -> list of data rows
    """
    results = {}

    for chart_id, config in chart_configs.items():
        try:
            query, params = build_chart_query(
                chart_config=config,
                filters=filters,
                target_column=target_column,
                target_value=target_value
            )

            logger.info("[DUCKDB QUERY] chart_id=%s sql=%s params=%s", chart_id, query, params)

            df = conn.execute(query, params).df()
            logger.info("[DUCKDB RESULT] chart_id=%s rows=%s", chart_id, len(df))
            results[chart_id] = df.to_dict(orient='records')

        except Exception as e:
            logger.error(f"Chart query failed for {chart_id}: {e}")
            results[chart_id] = []

    return results


def build_kpi_query(
    kpi_config: Dict[str, Any],
    filters: Dict[str, List[str]],
    target_column: Optional[str] = None,
    target_value: str = "all",
    table_name: str = "data"
) -> Tuple[str, List[Any]]:
    """
    Build SQL query for a single KPI.

    Args:
        kpi_config: KPI configuration (column, aggregation, format)
        filters: Active filters
        target_column: Target column
        target_value: Target value
        table_name: DuckDB table

    Returns:
        (query, params) tuple for parameterized execution
    """
    column = kpi_config.get('column')
    aggregation = _normalize_aggregation(kpi_config.get('aggregation'), default='COUNT')

    where_clause, params = build_filter_where_clause(filters, target_column, target_value)

    if aggregation == 'COUNT':
        if column:
            agg_expr = f'COUNT("{column}")'
        else:
            agg_expr = 'COUNT(*)'
    elif aggregation in ['SUM', 'AVG', 'MIN', 'MAX']:
        agg_expr = f'{aggregation}(TRY_CAST("{column}" AS DOUBLE))'
    else:
        agg_expr = f'SUM(TRY_CAST("{column}" AS DOUBLE))'

    return f'''
        SELECT {agg_expr} as value
        FROM "{table_name}"
        WHERE {where_clause}
    ''', params


def execute_kpi_queries(
    conn: duckdb.DuckDBPyConnection,
    kpi_configs: Dict[str, Dict[str, Any]],
    filters: Dict[str, List[str]],
    target_column: Optional[str] = None,
    target_value: str = "all"
) -> Dict[str, Any]:
    """
    Execute all KPI queries and return results.

    Returns:
        Dict mapping kpi_id -> kpi value/config
    """
    results = {}

    for kpi_id, config in kpi_configs.items():
        try:
            query, params = build_kpi_query(
                kpi_config=config,
                filters=filters,
                target_column=target_column,
                target_value=target_value
            )

            result = conn.execute(query, params).fetchone()
            value = result[0] if result else 0

            results[kpi_id] = {
                **config,
                'value': value
            }

        except Exception as e:
            logger.error(f"KPI query failed for {kpi_id}: {e}")
            results[kpi_id] = {**config, 'value': 0}

    return results
