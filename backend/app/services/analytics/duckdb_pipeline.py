import logging
from typing import List, Dict, Any, Tuple, Optional
import duckdb

from .duckdb_chart_builder import execute_chart_queries, build_kpi_query, execute_kpi_queries

logger = logging.getLogger(__name__)

async def run_duckdb_pipeline(
    conn: duckdb.DuckDBPyConnection,
    chart_configs: List[Any],
    kpi_configs: Dict[str, Dict[str, Any]],
    filters: Dict[str, List[str]],
    target_column: Optional[str] = None,
    target_value: str = "all",
    dataset_id: str = "default",
    table_name: str = "data"
) -> Dict[str, Any]:
    """
    Execute all DuckDB-slotted charts and KPIs.
    """
    # Convert list of configs to dict for the builder
    chart_map = {c.chart_id: c for c in chart_configs if c.execution_slot == "duckdb"}
    
    try:
        # 1. Execute Charts
        chart_results = execute_chart_queries(
            conn=conn,
            chart_configs=chart_map,
            filters=filters,
            target_column=target_column,
            target_value=target_value,
            table_name=table_name
        )
        
        # 2. Execute KPIs
        kpi_results = execute_kpi_queries(
            conn=conn,
            kpi_configs=kpi_configs,
            filters=filters,
            target_column=target_column,
            target_value=target_value,
            table_name=table_name
        )
        
        return {
            "charts": chart_results,
            "kpis": kpi_results
        }
    except Exception as e:
        logger.error(f"DuckDB pipeline failed: {e}")
        return {"charts": {}, "kpis": {}}
