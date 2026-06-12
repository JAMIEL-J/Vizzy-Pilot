import logging
from typing import List, Dict, Any, Tuple, Optional
import pandas as pd
import duckdb

from .duckdb_chart_builder import build_filter_where_clause, get_parsed_date_expr
from .query_utils import safe_identifier

logger = logging.getLogger(__name__)

def build_preagg_sql(config: Dict[str, Any], dataset_id: str, filters: Dict[str, List[str]], target_column: Optional[str] = None, target_value: str = "all") -> Tuple[str, List[Any]]:
    """
    Build pre-aggregation query for ratio_pct derived metrics.
    Returns (query_sql, params) that fetches numerator and denominator.
    """
    table = f"dataset_{dataset_id}"
    where_clause, params = build_filter_where_clause(filters, target_column, target_value)
    
    # We assume the config has numerator_col and denominator_col
    # If not provided, we use defaults or raise error
    num_col = config.get("numerator_col")
    den_col = config.get("denominator_col")
    x_col = config.get("dimension")
    
    if not num_col or not den_col or not x_col:
        raise ValueError("Missing numerator_col, denominator_col, or dimension in chart config")

    # Validate SQL identifiers to prevent injection
    num_col_quoted = safe_identifier(num_col)
    den_col_quoted = safe_identifier(den_col)
    safe_identifier(x_col)  # Validate column format

    parsed_date_expr = get_parsed_date_expr(x_col)
    # Use date_trunc for time series consistency
    sql = f'''
        SELECT 
            DATE_TRUNC('month', {parsed_date_expr}) as period,
            SUM(TRY_CAST({num_col_quoted} AS DOUBLE)) as numerator,
            SUM(TRY_CAST({den_col_quoted} AS DOUBLE)) as denominator
        FROM "{table}"
        WHERE {where_clause}
        GROUP BY 1
        ORDER BY 1
    '''
    return sql, params

def apply_formula(config: Dict[str, Any], df: pd.DataFrame) -> pd.DataFrame:
    """
    Apply ratio formula on pre-aggregated data.
    Handles zero denominators by replacing with NaN and then dropping.
    """
    if df.empty:
        return df
        
    # Replace 0 with NaN to avoid inf
    df["denominator"] = df["denominator"].replace(0, pd.NA)
    
    # Calculate ratio
    df["value"] = df["numerator"] / df["denominator"]
    
    # Drop rows where value is NaN (prevents JSON serialization failure)
    df = df.dropna(subset=["value"])
    
    return df[["period", "value"]]

async def run_pandas_pipeline(
    conn: duckdb.DuckDBPyConnection,
    chart_configs: Dict[str, Dict[str, Any]],
    filters: Dict[str, List[str]],
    target_column: Optional[str] = None,
    target_value: str = "all",
    dataset_id: str = "default"
) -> Dict[str, List[Dict[str, Any]]]:
    """
    Orchestrate the Pandas pipeline for derived metrics.
    """
    results = {}
    
    for chart_id, config in chart_configs.items():
        if config.get("execution_slot") != "pandas":
            continue
            
        try:
            sql, params = build_preagg_sql(config, dataset_id, filters, target_column, target_value)
            df = conn.execute(sql, params).df()
            
            final_df = apply_formula(config, df)
            
            # Convert to list of dicts for frontend
            results[chart_id] = final_df.to_dict(orient='records')
            
        except Exception as e:
            logger.error(f"Pandas pipeline failed for {chart_id}: {e}")
            results[chart_id] = []
            
    return results
