"""
Dashboard generator module.

Auto-generates multi-widget BI dashboards powered by:
- domain_detector  → identifies dataset domain (Sales, Churn, Healthcare, etc.)
- column_filter    → classifies columns (metrics, dimensions, targets, dates)
- kpi_engine       → generates domain-specific KPIs with trends and formatting
- chart_recommender → smart chart selection with deduplication and geo maps

DuckDB-first: generate_overview_dashboard_duckdb() uses DuckDBReader for
accurate aggregations instead of relying on a pandas sample DataFrame.
"""

import logging
from typing import Any, Dict, List, Optional
import pandas as pd

from app.services.analytics.domain_detector import detect_domain, DomainType
from app.services.analytics.column_filter import filter_columns, filter_columns_duckdb
from app.services.analytics.kpi_engine import generate_kpis
from app.services.analytics.chart_recommender import recommend_charts

from app.services.analytics.dsl_layout_generator import generate_dsl_layout

logger = logging.getLogger(__name__)


def generate_overview_dashboard(
    df: pd.DataFrame,
    schema: Dict[str, Any],
    semantic_map_json: Optional[str] = None,
    all_columns: bool = False,
) -> Dict[str, Any]:
    """
    Generate a full BI dashboard with domain-aware KPIs and intelligent charts.
    """
    # ── 1. Domain Detection ──
    domain, domain_scores = detect_domain(df)
    logger.info(f"Dashboard domain: {domain.value} (scores: {domain_scores})")

    # ── 2. Column Classification ──
    classification = filter_columns(df, domain)

    if semantic_map_json:
        try:
            from app.services.analytics.role_resolver import normalize_to_col_role, invert_to_role_map
            from app.services.role_taxonomy import ROLE_TAXONOMY

            # Normalize to {column: role} regardless of stored format
            col_role_map = normalize_to_col_role(semantic_map_json)

            for col, role in col_role_map.items():
                if col not in df.columns:
                    continue

                # Clean from all lists before overriding to prevent duplicates
                if col in classification.metrics: classification.metrics.remove(col)
                if col in classification.dimensions: classification.dimensions.remove(col)
                if col in classification.dates: classification.dates.remove(col)
                if col in classification.targets: classification.targets.remove(col)
                if col in classification.excluded: classification.excluded.remove(col)

                # Look up role info from taxonomy
                role_lower = role.lower()
                role_info = ROLE_TAXONOMY.get(role_lower, {})
                affinity = role_info.get("affinity")

                if affinity == "time_series_x" or role_lower in ('date', 'datetime', 'year_month', 'fiscal_period'):
                    if col not in classification.dates:
                        classification.dates.append(col)
                elif affinity in ("measure_y", "gauge_measure") or role_lower in ('metric', 'revenue', 'cost', 'profit', 'quantity', 'amount'):
                    if col not in classification.metrics:
                        classification.metrics.append(col)
                elif affinity == "groupby_x" or role_lower in ('dimension', 'category', 'region'):
                    if col not in classification.dimensions:
                        classification.dimensions.append(col)
                elif role_lower == 'target':
                    if col not in classification.targets:
                        classification.targets.append(col)
                elif role_lower in ['excluded', 'identifier', 'generic', 'unclassified'] or affinity == 'filter_only':
                    if col not in classification.excluded:
                        classification.excluded.append(col)

                # Sync classification.mappings to keep chart recommender templates aligned
                ROLE_TO_CANONICAL = {
                    "date": "dim_date",
                    "datetime": "dim_date",
                    "year_month": "dim_date",
                    "fiscal_period": "dim_date",
                    "revenue": "metric_revenue",
                    "sales": "metric_revenue",
                    "profit": "metric_profit",
                    "quantity": "metric_qty",
                    "count": "metric_qty",
                    "geography": "dim_region",
                    "target": "attr_status"
                }
                canonical_key = ROLE_TO_CANONICAL.get(role_lower)
                if canonical_key:
                    classification.mappings[canonical_key] = col

                # Domain-aware mapping fallbacks
                if role_lower == "revenue":
                    if domain == DomainType.CHURN:
                        classification.mappings["metric_mrr"] = col
                    elif domain == DomainType.FINANCE:
                        classification.mappings["metric_income"] = col
                    else:
                        classification.mappings["metric_revenue"] = col
                elif role_lower == "target":
                    classification.mappings["attr_status"] = col
                elif role_lower in ("date", "datetime", "year_month", "fiscal_period"):
                    classification.mappings["dim_date"] = col
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

    # ── 4. Smart Chart Recommendations ──
    overrides = None
    if semantic_map_json:
        try:
            from app.services.analytics.role_resolver import invert_to_role_map
            # chart_recommender expects {role: column} format
            overrides = invert_to_role_map(semantic_map_json)
        except Exception:
            pass
    chart_dict = recommend_charts(df, domain, classification, overrides=overrides, all_columns=all_columns)

    # ── 5. Assemble DSL Layout Specification ──
    dsl_layout = generate_dsl_layout(
        domain=domain.value,
        classification=classification,
        kpi_dict=kpi_dict,
        chart_dict=chart_dict
    )
    # Add metadata and orchestrator expected fields
    dsl_layout["layout"] = "grid"
    dsl_layout["total_records"] = len(df)

    logger.info(f"Generated Dashboard DSL spec with {len(dsl_layout.get('widgets', []))} widgets")

    return {
        "dashboard": dsl_layout
    }


# ──────────────────────────────────────────────────────────────
# DuckDB-native dashboard generation
# ──────────────────────────────────────────────────────────────


def generate_overview_dashboard_duckdb(

    df: pd.DataFrame,
    reader: "DuckDBReader",
    schema: Dict[str, Any],
    semantic_map_json: Optional[str] = None,
    all_columns: bool = False,
) -> Dict[str, Any]:
    """
    Generate dashboard using DuckDB for accurate aggregations.

    DuckDB-first replacement for generate_overview_dashboard() that:
    1. Uses the sample df for domain detection, column classification, and chart
       recommendations (these depend on column types and data patterns, which a
       200-row sample represents accurately).
    2. Uses DuckDBReader for KPI value computation (sum, avg, count, etc.) so
       dashboard metrics reflect the FULL dataset, not just the sample.
    3. Uses DuckDB reader for accurate total_records in the DSL layout.
    """
    # ── 1. Domain Detection ──
    domain, domain_scores = detect_domain(df)
    logger.info(f"Dashboard domain: {domain.value} (scores: {domain_scores})")

    # ── 2. Column Classification (DuckDB-profiled cardinality) ──
    classification = filter_columns_duckdb(df, domain, reader)

    # 2b. Apply semantic overrides (same logic as generate_overview_dashboard)
    if semantic_map_json:
        try:
            from app.services.analytics.role_resolver import normalize_to_col_role, invert_to_role_map
            from app.services.role_taxonomy import ROLE_TAXONOMY

            col_role_map = normalize_to_col_role(semantic_map_json)

            for col, role in col_role_map.items():
                if col not in df.columns:
                    continue

                if col in classification.metrics:
                    classification.metrics.remove(col)
                if col in classification.dimensions:
                    classification.dimensions.remove(col)
                if col in classification.dates:
                    classification.dates.remove(col)
                if col in classification.targets:
                    classification.targets.remove(col)
                if col in classification.excluded:
                    classification.excluded.remove(col)

                role_lower = role.lower()
                role_info = ROLE_TAXONOMY.get(role_lower, {})
                affinity = role_info.get("affinity")

                if affinity == "time_series_x" or role_lower in (
                    "date", "datetime", "year_month", "fiscal_period"
                ):
                    if col not in classification.dates:
                        classification.dates.append(col)
                elif affinity in ("measure_y", "gauge_measure") or role_lower in (
                    "metric", "revenue", "cost", "profit", "quantity", "amount"
                ):
                    if col not in classification.metrics:
                        classification.metrics.append(col)
                elif affinity == "groupby_x" or role_lower in (
                    "dimension", "category", "region"
                ):
                    if col not in classification.dimensions:
                        classification.dimensions.append(col)
                elif role_lower == "target":
                    if col not in classification.targets:
                        classification.targets.append(col)
                elif role_lower in ["excluded", "identifier", "generic", "unclassified"] or affinity == "filter_only":
                    if col not in classification.excluded:
                        classification.excluded.append(col)

                ROLE_TO_CANONICAL = {
                    "date": "dim_date",
                    "datetime": "dim_date",
                    "year_month": "dim_date",
                    "fiscal_period": "dim_date",
                    "revenue": "metric_revenue",
                    "sales": "metric_revenue",
                    "profit": "metric_profit",
                    "quantity": "metric_qty",
                    "count": "metric_qty",
                    "geography": "dim_region",
                    "target": "attr_status",
                }
                canonical_key = ROLE_TO_CANONICAL.get(role_lower)
                if canonical_key:
                    classification.mappings[canonical_key] = col

                if role_lower == "revenue":
                    if domain == DomainType.CHURN:
                        classification.mappings["metric_mrr"] = col
                    elif domain == DomainType.FINANCE:
                        classification.mappings["metric_income"] = col
                    else:
                        classification.mappings["metric_revenue"] = col
                elif role_lower == "target":
                    classification.mappings["attr_status"] = col
                elif role_lower in ("date", "datetime", "year_month", "fiscal_period"):
                    classification.mappings["dim_date"] = col
        except Exception as e:
            logger.error(f"Failed to apply semantic override: {e}")

    logger.info(
        f"Classified columns — metrics: {classification.metrics}, "
        f"dimensions: {classification.dimensions}, "
        f"targets: {classification.targets}, "
        f"dates: {classification.dates}"
    )

    # ── 3. DuckDB-accurate KPIs ──
    # Uses generate_kpis_duckdb() from kpi_engine.py which routes all
    # _safe_sum / _safe_mean / _count_target_positive calls through
    # DuckDBReader, so domain-specific KPIs (churn rate, conversion,
    # ARPU, etc.) get accurate values from the FULL dataset.
    from app.services.analytics.kpi_engine import generate_kpis_duckdb

    kpi_dict = generate_kpis_duckdb(
        reader=reader,
        domain=domain,
        classification=classification,
        sample_df=df,
        semantic_map_json=semantic_map_json,
    )

    # ── 4. Smart Chart Recommendations (DuckDB-accurate cardinality) ──
    overrides = None
    if semantic_map_json:
        try:
            from app.services.analytics.role_resolver import invert_to_role_map
            overrides = invert_to_role_map(semantic_map_json)
        except Exception:
            pass

    # Compute DuckDB-accurate column profiles for better chart type decisions
    column_profiles = None
    try:
        from app.services.analytics.metadata_profiler import profile_dataset_duckdb
        column_profiles = profile_dataset_duckdb(reader, list(df.columns))
    except Exception:
        pass

    chart_dict = recommend_charts(
        df, domain, classification,
        overrides=overrides,
        column_profiles=column_profiles,
        all_columns=all_columns,
    )

    # ── 5. Assemble DSL Layout Specification ──
    dsl_layout = generate_dsl_layout(
        domain=domain.value,
        classification=classification,
        kpi_dict=kpi_dict,
        chart_dict=chart_dict,
    )
    dsl_layout["layout"] = "grid"

    # Accurate total_records from DuckDB
    try:
        dsl_layout["total_records"] = reader.row_count()
    except Exception:
        dsl_layout["total_records"] = len(df)

    logger.info(
        f"Generated DuckDB Dashboard DSL spec with "
        f"{len(dsl_layout.get('widgets', []))} widgets"
    )

    # Strip data from charts so the frontend is forced to fetch the true DuckDB data
    if "widgets" in dsl_layout:
        for widget in dsl_layout["widgets"]:
            if widget.get("type") != "kpi" and "data" in widget:
                widget["data"] = []


    from app.services.analytics import get_domain_confidence
    confidence = get_domain_confidence(domain_scores)

    return {
        "dashboard": dsl_layout,
        "domain": domain,
        "confidence": confidence,
        "classification": classification,
        "kpis": kpi_dict,
        "charts": chart_dict,
        "total_rows": reader.row_count(),
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
