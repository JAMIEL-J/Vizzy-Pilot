"""
DSL Layout Generator - Generates declarative dashboard configurations.
"""

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

class GridLayout(BaseModel):
    x: int = Field(..., description="X coordinate in a 12-column grid")
    y: int = Field(..., description="Y coordinate")
    w: int = Field(..., description="Grid width")
    h: int = Field(..., description="Grid height")

class DataBindings(BaseModel):
    dimension: Optional[str] = Field(None, description="Group-by dimension column")
    metric: Optional[str] = Field(None, description="Aggregate metric column")
    aggregation: Optional[str] = Field(None, description="Aggregation function (e.g. SUM, AVG, COUNT)")
    format: Optional[str] = Field(None, description="Formatting type (e.g. currency, percentage, number)")
    granularity: Optional[str] = Field(None, description="Temporal aggregation granularity")

class Widget(BaseModel):
    id: str = Field(..., description="Unique identifier for the widget")
    type: str = Field(..., description="Widget type (e.g., kpi, bar, line, pie, donut, geo_map)")
    title: str = Field(..., description="Display title for the widget")
    grid_layout: GridLayout = Field(..., description="Layout placement parameters")
    bindings: DataBindings = Field(..., description="Data schema query bindings")
    config: Dict[str, Any] = Field(default_factory=dict, description="Visual options and styles")
    confidence: str = Field("MEDIUM", description="Recommendation confidence level")
    reason: Optional[str] = Field(None, description="Confidence explanation")
    initial_data: Optional[Any] = Field(None, description="Pre-computed initial data payload")
    # Compatibility fields to ensure existing components and tests function during rollout
    data: Optional[Any] = Field(None, description="Compatibility data payload")
    categories: Optional[List[str]] = Field(None, description="Compatibility chart categories")
    geo_meta: Optional[Dict[str, Any]] = Field(None, description="Compatibility geo metadata")
    format_type: Optional[str] = Field(None, description="Compatibility format type")
    value_label: Optional[str] = Field(None, description="Compatibility value label")
    section: Optional[str] = Field(None, description="Compatibility dashboard section")

class DashboardDSL(BaseModel):
    domain: str = Field(..., description="Detected dashboard domain")
    columns: int = Field(12, description="Total columns in grid")
    widgets: List[Widget] = Field(default_factory=list, description="List of widgets")

def get_dsl_json_schema() -> Dict[str, Any]:
    """Return the JSON schema representing the Dashboard DSL structure."""
    return DashboardDSL.model_json_schema()

def validate_dsl_layout(layout_dict: Dict[str, Any]) -> bool:
    """Validate a layout dictionary against the DashboardDSL model."""
    try:
        DashboardDSL(**layout_dict)
        return True
    except Exception as e:
        raise ValueError(f"DSL Layout Validation Failed: {e}")

def generate_dsl_layout(
    domain: str,
    classification: Any,
    kpi_dict: Dict[str, Any],
    chart_dict: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Generate a declarative Dashboard DSL layout spec based on KPIs and charts.
    """
    widgets = []
    
    # 1. Grid Positioning State
    current_x = 0
    current_y = 0
    
    # 2. Process KPIs (w: 3, h: 2)
    for key, kpi in kpi_dict.items():
        # Map format
        format_val = kpi.get("format", "number")
        if kpi.get("is_percentage"):
            format_val = "percentage"
            
        bindings = DataBindings(
            metric=kpi.get("metric"),
            aggregation=kpi.get("aggregation", "sum"),
            format=format_val
        )
        
        layout = GridLayout(x=current_x, y=current_y, w=3, h=2)
        
        # Build config & compatibility data
        config = {}
        comp_data = {
            "value": kpi.get("value"),
            "format": format_val,
            "is_percentage": kpi.get("is_percentage", False),
        }
        
        if kpi.get("trend") is not None:
            config["trend"] = kpi["trend"]
            comp_data["trend"] = kpi["trend"]
        if kpi.get("trend_label"):
            config["trend_label"] = kpi["trend_label"]
            comp_data["trend_label"] = kpi["trend_label"]
        if kpi.get("subtitle"):
            config["subtitle"] = kpi["subtitle"]
            comp_data["subtitle"] = kpi["subtitle"]
        if kpi.get("icon"):
            config["icon"] = kpi["icon"]
            
        widget = Widget(
            id=key,
            type="kpi",
            title=kpi.get("title", "Metric"),
            grid_layout=layout,
            bindings=bindings,
            config=config,
            confidence=kpi.get("confidence", "MEDIUM"),
            reason=kpi.get("reason", ""),
            initial_data={"value": kpi.get("value")},
            data=comp_data
        )
        widgets.append(widget)
        
        current_x += 3
        if current_x >= 12:
            current_x = 0
            current_y += 2
            
    # Wrap KPI row if ended in middle
    if current_x > 0:
        current_x = 0
        current_y += 2
        
    # 3. Process Charts
    for slot_key, chart in chart_dict.items():
        chart_type = str(chart.get("type", "bar")).lower()
        
        # Determine width and height
        # Wide layouts for geo_maps, scatters, or explicit wide types
        if chart_type in ("geo_map", "map", "scatter") or "wide" in slot_key:
            w, h = 12, 4
        else:
            w, h = 6, 4
            
        if w == 12:
            if current_x > 0:
                current_x = 0
                current_y += 4
            layout = GridLayout(x=0, y=current_y, w=12, h=4)
            current_y += 4
        else:
            layout = GridLayout(x=current_x, y=current_y, w=6, h=4)
            current_x += 6
            if current_x >= 12:
                current_x = 0
                current_y += 4
                
        # Format mapping
        format_val = chart.get("format_type", "number")
        if chart.get("is_percentage"):
            format_val = "percentage"
            
        bindings = DataBindings(
            dimension=chart.get("dimension"),
            metric=chart.get("metric"),
            aggregation=chart.get("aggregation", "sum"),
            format=format_val,
            granularity=chart.get("granularity")
        )
        
        # Build config
        config = {}
        if chart.get("categories"):
            config["categories"] = chart["categories"]
        if chart.get("geo_meta"):
            config["geo_meta"] = chart["geo_meta"]
        if chart.get("value_label"):
            config["value_label"] = chart["value_label"]
        if chart.get("section"):
            config["section"] = chart["section"]
            
        widget = Widget(
            id=slot_key,
            type=chart_type,
            title=chart.get("title", "Chart"),
            grid_layout=layout,
            bindings=bindings,
            config=config,
            confidence=chart.get("confidence", "MEDIUM"),
            reason=chart.get("reason", ""),
            initial_data=chart.get("data", []),
            data=chart.get("data", []),
            categories=chart.get("categories"),
            geo_meta=chart.get("geo_meta"),
            format_type=format_val,
            value_label=chart.get("value_label"),
            section=chart.get("section", "Other Insights")
        )
        widgets.append(widget)
        
    dsl = DashboardDSL(
        domain=domain,
        columns=12,
        widgets=widgets
    )
    
    return dsl.model_dump()

