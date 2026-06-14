import logging
import asyncio
import json
from typing import List, Dict, Any, Optional, AsyncGenerator
import duckdb

from .duckdb_pipeline import run_duckdb_pipeline
from .pandas_pipeline import run_pandas_pipeline
from .query_cache import get_cached, set_cached

logger = logging.getLogger(__name__)

async def execute_dashboard_load(
    conn: duckdb.DuckDBPyConnection,
    chart_configs: List[Any],
    kpi_configs: Dict[str, Dict[str, Any]],
    filters: Dict[str, List[str]],
    target_column: Optional[str] = None,
    target_value: str = "all",
    dataset_id: str = "default",
    version_id: str = "default",
    table_name: str = "data"
) -> AsyncGenerator[Dict[str, Any], None]:
    """
    Orchestrate the execution of dashboard components and yield results as they arrive.
    Includes a caching layer to avoid redundant DB calls for identical filter sets.
    """
    
    filters_json = json.dumps(filters, sort_keys=True)
    
    # 1. Split chart configs by execution slot
    duckdb_charts = [c for c in chart_configs if c.execution_slot == "duckdb"]
    pandas_charts = {c.chart_id: c for c in chart_configs if c.execution_slot == "pandas"}
    config_map = {c.chart_id: c for c in chart_configs}
    
    logger.info(f"Routing execution: {len(duckdb_charts)} DuckDB charts, {len(pandas_charts)} Pandas charts")
    
    # 2. Create tasks for both pipelines
    duckdb_task = asyncio.create_task(run_duckdb_pipeline(
        conn=conn,
        chart_configs=duckdb_charts,
        kpi_configs=kpi_configs,
        filters=filters,
        target_column=target_column,
        target_value=target_value,
        dataset_id=dataset_id,
        table_name=table_name
    ))
    
    pandas_task = asyncio.create_task(run_pandas_pipeline(
        conn=conn,
        chart_configs=pandas_charts,
        filters=filters,
        target_column=target_column,
        target_value=target_value,
        dataset_id=dataset_id
    ))
    
    # 3. Wait for tasks to complete and yield results as they arrive
    for coro in asyncio.as_completed([duckdb_task, pandas_task]):
        result = await coro
        
        if isinstance(result, dict) and "charts" in result and "kpis" in result:
            # DuckDB results
            for kpi_id, kpi_data in result["kpis"].items():
                cache_key = f"{dataset_id}:{version_id}:{kpi_id}:{filters_json}"
                cached = get_cached(cache_key)
                if cached:
                    yield cached
                else:
                    res = {
                        "kpi_id": kpi_id,
                        "data": kpi_data,
                        "execution_slot": "duckdb"
                    }
                    set_cached(cache_key, res)
                    yield res

            for chart_id, chart_data in result["charts"].items():
                cache_key = f"{dataset_id}:{version_id}:{chart_id}:{filters_json}"
                cached = get_cached(cache_key)
                if cached:
                    yield cached
                else:
                    res = {
                        "chart_id": chart_id,
                        "data": chart_data,
                        "execution_slot": "duckdb",
                        "chart_type": config_map[chart_id].chart_type
                    }
                    set_cached(cache_key, res)
                    yield res
        
        elif isinstance(result, dict):
            # Pandas results
            for chart_id, chart_data in result.items():
                cache_key = f"{dataset_id}:{version_id}:{chart_id}:{filters_json}"
                cached = get_cached(cache_key)
                if cached:
                    yield cached
                else:
                    res = {
                        "chart_id": chart_id,
                        "data": chart_data,
                        "execution_slot": "pandas",
                        "chart_type": config_map[chart_id].chart_type
                    }
                    set_cached(cache_key, res)
                    yield res
