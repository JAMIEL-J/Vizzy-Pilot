"""
Dashboard generator module.

Auto-generates multi-widget BI dashboards powered by:
- domain_detector  → identifies dataset domain (Sales, Churn, Healthcare, etc.)
- column_filter    → classifies columns (metrics, dimensions, targets, dates)
- kpi_engine       → generates domain-specific KPIs with trends and formatting
- chart_recommender → smart chart selection with deduplication and geo maps
"""

import logging
from typing import Any, Dict, List, Optional
import pandas as pd

from app.services.analytics.domain_detector import detect_domain, DomainType
from app.services.analytics.column_filter import filter_columns
from app.services.analytics.kpi_engine import generate_kpis
from app.services.analytics.chart_recommender import recommend_charts

logger = logging.getLogger(__name__)


def generate_overview_dashboard(
    df: pd.DataFrame,
    schema: Dict[str, Any],
    semantic_map_json: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Generate a full BI dashboard with domain-aware KPIs and intelligent charts.
    """
    # ── 1. Domain Detection ──
    domain, domain_scores = detect_domain(df)
    logger.info(f"Dashboard domain: {domain.value} (scores: {domain_scores})")

    # ── 2. Column Classification ──
    classification = filter_columns(df, domain)

    # SEMANTIC OVERRIDE: If user confirmed a semantic map, force-override the heuristics.
    # This prevents "EXCLUDED" columns from blocking the dashboard if they have a role.
    if semantic_map_json:
        import json
        try:
            s_map = json.loads(semantic_map_json)
            for col, role in s_map.items():
                if col not in df.columns:
                    continue

                # Force removal from excluded list
                if col in classification.excluded:
                    classification.excluded.remove(col)

                # Assign to correct bucket based on role
                if role in ('revenue', 'cost', 'amount', 'profit'):
                    if col not in classification.metrics:
                        classification.metrics.append(col)
                elif role == 'date':
                    if col not in classification.dates:
                        classification.dates.append(col)
                elif role in ('category', 'identifier', 'region'):
                    if col not in classification.dimensions:
                        classification.dimensions.append(col)
                elif role == 'target':
                    if col not in classification.targets:
                        classification.targets.append(col)
        except Exception as e:
            logger.error(f"Failed to apply semantic override: {e}")

    logger.info(
        f"Classified columns — metrics: {classification.metrics}, "
        f"dimensions: {classification.dimensions}, "
        f"targets: {classification.targets}, "
        f"dates: {classification.dates}"
    )

    # ── 3. Domain-Specific KPIs ──
    kpi_dict = generate_kpis(df, domain, classification, semantic_map_json=semantic_map_json)
    kpi_widgets = _kpis_to_widgets(kpi_dict)
    logger.info(f"Generated {len(kpi_widgets)} KPIs")

    # ── 4. Smart Chart Recommendations ──
    chart_dict = recommend_charts(df, domain, classification, semantic_map_json=semantic_map_json)
    chart_widgets = _charts_to_widgets(chart_dict)
    logger.info(f"Generated {len(chart_widgets)} charts")

    # ── 5. Assemble Dashboard ──
    widgets = kpi_widgets + chart_widgets

    return {
        "dashboard": {
            "layout": "grid",
            "columns": 12,
            "domain": domain.value,
            "total_records": len(df),
            "widgets": widgets,
        }
    }


def _kpis_to_widgets(kpi_dict: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Convert kpi_engine output to dashboard widget format."""
    widgets = []
    for key, kpi in kpi_dict.items():
        widget = {
            "id": key,
            "type": "kpi",
            "title": kpi.get("title", "Metric"),
            "data": {
                "value": kpi.get("value"),
                "format": kpi.get("format", "number"),
                "is_percentage": kpi.get("is_percentage", False),
            },
            "confidence": kpi.get("confidence", "MEDIUM"),
            "reason": kpi.get("reason", ""),
        }
        # Add trend data if available
        if kpi.get("trend") is not None:
            widget["data"]["trend"] = kpi["trend"]
        if kpi.get("trend_label"):
            widget["data"]["trend_label"] = kpi["trend_label"]
        if kpi.get("subtitle"):
            widget["data"]["subtitle"] = kpi["subtitle"]
        if kpi.get("icon"):
            widget["icon"] = kpi["icon"]
        widgets.append(widget)
    return widgets


def _charts_to_widgets(chart_dict: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Convert chart_recommender output to dashboard widget format."""
    widgets = []
    for slot_key, chart in chart_dict.items():
        widget = {
            "id": slot_key,
            "type": chart.get("type", "bar"),
            "title": chart.get("title", "Chart"),
            "data": chart.get("data", {}),
            "confidence": chart.get("confidence", "MEDIUM"),
            "reason": chart.get("reason", ""),
            "is_percentage": chart.get("is_percentage", False),
            "section": chart.get("section", "Other Insights"),
        }
        if chart.get("categories"):
            widget["categories"] = chart["categories"]
        if chart.get("geo_meta"):
            widget["geo_meta"] = chart["geo_meta"]
        if chart.get("format_type"):
            widget["format_type"] = chart["format_type"]
        if chart.get("value_label"):
            widget["value_label"] = chart["value_label"]
        widgets.append(widget)
    return widgets


def build_single_chart(
    result: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Build a single chart output (not wrapped in dashboard).

    For intent_type = "analysis".
    """
    # Prioritize complex data structures over simple values
    if "rows" in result and result["rows"]:
        return {
            "chart": {
                "type": "bar",
                "title": "Distribution",
                "data": {"rows": result["rows"]},
            }
        }

    elif "series" in result and result["series"]:
        return {
            "chart": {
                "type": "line",
                "title": "Trend",
                "data": {"series": result["series"]},
            }
        }
        
    elif "value" in result:
        return {
            "chart": {
                "type": "kpi",
                "title": "Result",
                "data": {"value": result["value"]},
            }
        }

    raise ValueError("Unsupported result format")
