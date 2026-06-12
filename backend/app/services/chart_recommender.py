from typing import List, Dict, Any, Optional
import json
from pydantic import BaseModel, Field

from app.services.role_taxonomy import ROLE_TAXONOMY

class ChartConfig(BaseModel):
    chart_id: str
    title: str
    type: str
    dimension: Optional[str] = None
    metric: Optional[str] = None
    aggregation: str = "sum"
    execution_slot: str
    section: str = "General Insights"

def generate_chart_configs(semantic_map_json: str) -> List[ChartConfig]:
    """
    Pure function that takes a confirmed semantic map and recommends a set of charts.
    Handles both {role: column} (legacy) and {column: role} (new) formats.
    Rules:
    - date x measure -> time series (line)
    - category x measure -> bar chart
    - ratio_pct -> gauge
    - count/score -> KPI card
    """
    if not semantic_map_json:
        return []

    try:
        from app.services.analytics.role_resolver import normalize_to_col_role
        col_role_map = normalize_to_col_role(semantic_map_json)
    except Exception:
        return []

    if not col_role_map:
        return []

    configs = []
    
    # Extract columns by role group — iterating (col, role) so ALL columns are included
    dates = [col for col, role in col_role_map.items() if ROLE_TAXONOMY.get(role, {}).get("affinity") == "time_series_x"]
    categories = [col for col, role in col_role_map.items() if ROLE_TAXONOMY.get(role, {}).get("affinity") == "groupby_x"]
    measures = [col for col, role in col_role_map.items() if ROLE_TAXONOMY.get(role, {}).get("affinity") == "measure_y"]
    gauges = [col for col, role in col_role_map.items() if ROLE_TAXONOMY.get(role, {}).get("affinity") == "gauge_measure"]
    kpis = [col for col, role in col_role_map.items() if role in ["count", "score"]]

    # 1. Time Series: date x measure (cap 3)
    if dates and measures:
        date_col = dates[0]
        for i, measure_col in enumerate(measures[:3]):
            configs.append(ChartConfig(
                chart_id=f"ts_{i}",
                title=f"{measure_col} over {date_col}",
                type="line",
                dimension=date_col,
                metric=measure_col,
                aggregation="sum",
                execution_slot="duckdb",
                section="Trends"
            ))

    # 2. Bar Charts: category x measure
    if categories and measures:
        cat_col = categories[0]
        for i, measure_col in enumerate(measures[:3]):
            configs.append(ChartConfig(
                chart_id=f"bar_{i}",
                title=f"{measure_col} by {cat_col}",
                type="bar",
                dimension=cat_col,
                metric=measure_col,
                aggregation="sum",
                execution_slot="duckdb",
                section="Breakdowns"
            ))

    # 3. Gauges: ratio_pct
    for i, gauge_col in enumerate(gauges):
        configs.append(ChartConfig(
            chart_id=f"gauge_{i}",
            title=f"Average {gauge_col}",
            type="gauge",
            metric=gauge_col,
            aggregation="avg",
            execution_slot="pandas",
            section="Performance"
        ))

    # 4. KPI Cards: count/score
    for i, kpi_col in enumerate(kpis):
        configs.append(ChartConfig(
            chart_id=f"kpi_{i}",
            title=f"Total {kpi_col}",
            type="kpi",
            metric=kpi_col,
            aggregation="sum",
            execution_slot="duckdb",
            section="Overview"
        ))

    return configs
