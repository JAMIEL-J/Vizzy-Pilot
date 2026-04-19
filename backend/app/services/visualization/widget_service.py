"""
Widget service module.

Belongs to: visualization services layer
Responsibility: Manage individual widget refresh and updates
Restrictions: Returns widget specifications only
"""

from typing import Any, Dict, List, Optional
import pandas as pd

from app.services.visualization.kpi_calculator import calculate_kpi, KPIType
from app.services.visualization.dashboard_filters import apply_filters
from app.services.visualization.chart_specs import build_chart_spec, ChartType
from app.core.logger import get_logger


logger = get_logger(__name__)


WHOLE_NUMBER_AVERAGE_KEYWORDS = [
    "age", "tenure", "duration", "day", "days", "month", "months", "year", "years", "los", "lengthofstay"
]


def _is_whole_number_metric(metric: Optional[str]) -> bool:
    token = str(metric or "").lower().replace("_", "").replace("-", "").replace(" ", "")
    if not token:
        return False
    return any(keyword in token for keyword in WHOLE_NUMBER_AVERAGE_KEYWORDS)


def _format_aggregate_value(value: Any, metric: Optional[str], aggregation: str) -> float:
    if not isinstance(value, (int, float)):
        return 0
    if aggregation == "avg" and _is_whole_number_metric(metric):
        return int(round(float(value)))
    return round(float(value), 2)


def refresh_widget(
    df: pd.DataFrame,
    widget_spec: Dict[str, Any],
    filters: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """
    Refresh a single widget with current data.
    
    Args:
        df: Source DataFrame
        widget_spec: Widget specification with type and config
        filters: Optional filters to apply before refresh
        
    Returns:
        Updated widget specification with new data
    """
    # Apply filters if provided
    if filters:
        df = apply_filters(df, filters)
    
    widget_type = widget_spec.get("type", "")
    widget_id = widget_spec.get("id", "widget")
    config = widget_spec.get("config", {})
    
    try:
        if widget_type == "kpi":
            return _refresh_kpi_widget(df, widget_spec, config)
        elif widget_type == "bar":
            return _refresh_bar_widget(df, widget_spec, config)
        elif widget_type == "line":
            return _refresh_line_widget(df, widget_spec, config)
        elif widget_type == "pie":
            return _refresh_pie_widget(df, widget_spec, config)
        elif widget_type == "table":
            return _refresh_table_widget(df, widget_spec, config)
        else:
            logger.warning(f"Unknown widget type: {widget_type}")
            return widget_spec
            
    except Exception as e:
        logger.error(f"Failed to refresh widget {widget_id}: {e}")
        return {
            **widget_spec,
            "error": str(e),
        }


def refresh_all_widgets(
    df: pd.DataFrame,
    widgets: List[Dict[str, Any]],
    filters: Optional[List[Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
    """
    Refresh all widgets in a dashboard.
    
    Args:
        df: Source DataFrame
        widgets: List of widget specifications
        filters: Optional filters to apply
        
    Returns:
        List of updated widget specifications
    """
    # Apply filters once for all widgets
    if filters:
        df = apply_filters(df, filters)
    
    return [
        refresh_widget(df, widget, filters=None)  # Filters already applied
        for widget in widgets
    ]


def _refresh_kpi_widget(
    df: pd.DataFrame,
    widget_spec: Dict[str, Any],
    config: Dict[str, Any],
) -> Dict[str, Any]:
    """Refresh a KPI widget."""
    kpi_type = KPIType(config.get("kpi_type", "count"))
    column = config.get("column")
    
    result = calculate_kpi(
        df=df,
        kpi_type=kpi_type,
        column=column,
        filter_column=config.get("filter_column"),
        filter_value=config.get("filter_value"),
    )
    
    return {
        **widget_spec,
        "data": {
            "value": result["value"],
            "label": result.get("label"),
            "formatted": result.get("formatted"),
        },
    }


def _refresh_bar_widget(
    df: pd.DataFrame,
    widget_spec: Dict[str, Any],
    config: Dict[str, Any],
) -> Dict[str, Any]:
    """Refresh a bar chart widget."""
    group_by = config.get("group_by")
    metric = config.get("metric")
    aggregation = config.get("aggregation", "count")
    limit = config.get("limit", 10)
    
    if not group_by:
        return widget_spec
    
    if aggregation == "count":
        grouped = df[group_by].value_counts().head(limit)
        rows = [
            {"category": str(k), "value": int(v)}
            for k, v in grouped.items()
        ]
    else:
        if not metric:
            return widget_spec
        
        if aggregation == "sum":
            grouped = df.groupby(group_by)[metric].sum()
        elif aggregation == "avg":
            grouped = df.groupby(group_by)[metric].mean()
        else:
            grouped = df.groupby(group_by)[metric].count()
        
        grouped = grouped.sort_values(ascending=False).head(limit)
        rows = [
            {"category": str(k), "value": _format_aggregate_value(v, metric, aggregation)}
            for k, v in grouped.items()
        ]
    
    return {
        **widget_spec,
        "data": {"rows": rows},
    }


def _refresh_line_widget(
    df: pd.DataFrame,
    widget_spec: Dict[str, Any],
    config: Dict[str, Any],
) -> Dict[str, Any]:
    """Refresh a line chart widget."""
    time_column = config.get("time_column")
    metric = config.get("metric")
    granularity = config.get("granularity", "D")  # D=day, W=week, M=month
    
    if not time_column or not metric:
        return widget_spec
    
    try:
        df_copy = df[[time_column, metric]].copy()
        df_copy[time_column] = pd.to_datetime(df_copy[time_column], errors="coerce")
        df_copy = df_copy.dropna()
        
        if df_copy.empty:
            return {**widget_spec, "data": {"series": []}}
        
        grouped = (
            df_copy
            .groupby(pd.Grouper(key=time_column, freq=granularity))[metric]
            .mean()
            .reset_index()
        )
        
        series = [
            {
                "timestamp": row[time_column].isoformat(),
                "value": _format_aggregate_value(row[metric], metric, "avg"),
            }
            for _, row in grouped.iterrows()
            if pd.notna(row[metric])
        ]
        
        return {
            **widget_spec,
            "data": {"series": series},
        }
        
    except Exception as e:
        logger.error(f"Failed to refresh line widget: {e}")
        return widget_spec


def _refresh_pie_widget(
    df: pd.DataFrame,
    widget_spec: Dict[str, Any],
    config: Dict[str, Any],
) -> Dict[str, Any]:
    """Refresh a pie chart widget."""
    column = config.get("column")
    limit = config.get("limit", 6)
    
    if not column:
        return widget_spec
    
    value_counts = df[column].value_counts().head(limit)
    segments = [
        {"label": str(k), "value": int(v)}
        for k, v in value_counts.items()
    ]
    
    return {
        **widget_spec,
        "data": {"segments": segments},
    }


def _refresh_table_widget(
    df: pd.DataFrame,
    widget_spec: Dict[str, Any],
    config: Dict[str, Any],
) -> Dict[str, Any]:
    """Refresh a table widget."""
    columns = config.get("columns", list(df.columns)[:5])
    limit = config.get("limit", 50)
    
    subset = df[columns].head(limit)
    
    rows = subset.to_dict(orient="records")
    
    return {
        **widget_spec,
        "data": {
            "columns": columns,
            "rows": rows,
            "total_rows": len(df),
        },
    }


def create_widget_from_config(
    widget_type: str,
    config: Dict[str, Any],
    widget_id: Optional[str] = None,
    title: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Create a new widget specification from config.
    
    Args:
        widget_type: Type of widget (kpi, bar, line, pie, table)
        config: Widget configuration
        widget_id: Optional widget ID
        title: Optional widget title
        
    Returns:
        Widget specification
    """
    import hashlib
    import json
    
    if not widget_id:
        config_str = json.dumps(config, sort_keys=True)
        widget_id = hashlib.sha256(config_str.encode()).hexdigest()[:12]
    
    return {
        "id": widget_id,
        "type": widget_type,
        "title": title or f"{widget_type.capitalize()} Widget",
        "config": config,
        "data": {},
    }
