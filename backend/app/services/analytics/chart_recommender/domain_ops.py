"""Domain Ops - extracted from generators.py"""
from .prioritization import _should_average_metric, _metric_format_type, _trend_aggregation_for_metric
from .titles import _pick_column_by_keywords, _beautify_column_name, _create_smart_title
from .aggregators import _safe_groupby_mean
from .query_helpers import _get_time_trend, _get_scatter_data, _distribution_chart, _smart_aggregate
from .churn_analytics import _build_target_rate_chart

import logging
from typing import Any, Dict, List, Optional

import pandas as pd

from app.services.analytics.column_filter import ColumnClassification

from .aggregators import _safe_groupby_sum
from .geo import _detect_map_type
from .models import ChartRecommendation
from .prioritization import (
    _get_metric_prefix,
    _infer_time_value_label,
    _metric_format_type,
    _should_average_metric,
    _trend_aggregation_for_metric,
)
from .query_helpers import (
    _distribution_chart,
    _get_scatter_data,
    _get_target_distribution,
    _get_time_trend,
    _smart_aggregate,
)
from .sanitization import _coerce_numeric_metric_series, _safe_to_datetime
from .titles import (
    _beautify_column_name,
    _create_smart_title,
    _format_categorical_value,
    _pick_column_by_keywords,
)

logger = logging.getLogger(__name__)

def _generate_geo_charts(df: pd.DataFrame, classification: ColumnClassification) -> List[ChartRecommendation]:
    """
    Generate a SINGLE multi-metric geographic map chart.
    Merges revenue, profit, and other financial metrics into one map.
    Tooltip will display: California — Revenue: $2M, Profit: $500K
    """
    charts = []

    # Fetch semantic_similarity safely
    try:
        from ..semantic_resolver import semantic_similarity
        def _semantic_check(col, keywords, threshold=0.8):
            return any(semantic_similarity(kw, col) >= threshold for kw in keywords)
    except ImportError:
        def _semantic_check(col, keywords, threshold=0.8):
            return any(kw in col.lower() for kw in keywords)

    # 1. Find all geo-type dimension columns
    geo_keywords = ['country', 'state', 'province', 'region', 'continent', 'nation', 'territory']
    geo_cols = [d for d in classification.dimensions if _semantic_check(d, geo_keywords)]

    if not geo_cols:
        return charts

    # 2. Match ALL financial metrics (not just one)
    revenue_keywords = ['revenue', 'sales', 'profit', 'amount', 'total_charges', 'monthly_charges', 'cost', 'earnings']
    financial_metrics = [m for m in classification.metrics if _semantic_check(m, revenue_keywords)]
    
    # Fallback: use first metric if no financial ones found
    if not financial_metrics:
        financial_metrics = classification.metrics[:1] if classification.metrics else []
    
    if not financial_metrics:
        return charts

    primary_metric = financial_metrics[0]

    # 3. Prefer State column for US drilling; fallback to Country, then first geo
    priority_order = ['state', 'country', 'region']
    best_geo = geo_cols[0]
    for priority in priority_order:
        match = next((c for c in geo_cols if _semantic_check(c, [priority])), None)
        if match:
            best_geo = match
            break

    # 4. Build multi-metric data payload
    # Primary metric for coloring (value field), additional metrics embedded
    try:
        grouped = df.groupby(best_geo)
        primary_data = grouped[primary_metric].sum().sort_values(ascending=False).head(60)
        
        # Build secondary metric aggregations
        secondary_aggs = {}
        for m in financial_metrics[1:3]:  # Max 3 metrics total (primary + 2 secondary)
            secondary_aggs[m] = grouped[m].sum()
        
        data = []
        for geo_name, primary_val in primary_data.items():
            if pd.isna(primary_val):
                continue
            entry = {
                "name": str(geo_name),
                "value": round(float(primary_val), 2),
            }
            
            # Embed additional metrics for multi-metric tooltip
            if secondary_aggs:
                metrics_dict = {_beautify_column_name(primary_metric): round(float(primary_val), 2)}
                for m, agg_series in secondary_aggs.items():
                    val = agg_series.get(geo_name, 0)
                    if pd.notna(val):
                        metrics_dict[_beautify_column_name(m)] = round(float(val), 2)
                entry["metrics"] = metrics_dict
            
            data.append(entry)
    except Exception:
        data = _smart_aggregate(df, best_geo, primary_metric, limit=60)

    if not data:
        return charts

    # 5. Detect map type
    col_values = df[best_geo].dropna().unique().tolist()
    map_type = _detect_map_type(col_values)

    if map_type:
        # Build a professional title
        metric_names = [_beautify_column_name(m) for m in financial_metrics[:3]]
        title = f"{' & '.join(metric_names)} by {_beautify_column_name(best_geo)}" if len(metric_names) > 1 else _create_smart_title(primary_metric, best_geo)
        
        charts.append(ChartRecommendation(
            slot="slot_geo",
            title=title,
            chart_type="geo_map",
            data=data,
            confidence="HIGH",
            reason=f"Multi-metric geographic analysis across {best_geo}",
            geo_meta={
                "map_type": map_type,
                "geo_col": best_geo,
                "metric_col": primary_metric,
                "metrics": [_beautify_column_name(m) for m in financial_metrics[:3]],
            },
            format_type="currency"
        ))

    return charts


def _generate_generic_charts(df: pd.DataFrame, classification: ColumnClassification) -> List[ChartRecommendation]:
    """Generate charts for Generic/Unknown domain."""
    charts = []
    
    # 1. Primary analysis
    if classification.metrics and classification.dimensions:
        metric = classification.metrics[0]
        dim = classification.dimensions[0]
        data = _smart_aggregate(df, dim, metric)
        if data:
            charts.append(ChartRecommendation(
                slot="slot_1", title=_create_smart_title(metric, dim),
                chart_type="bar", data=data, confidence="MEDIUM",
                reason="Primary metric breakdown",
                dimension=dim, metric=metric,
                aggregation="mean" if _should_average_metric(metric) else "sum"
            ))
    
    # 2. Secondary analysis
    if len(classification.metrics) > 1 and len(classification.dimensions) > 1:
        metric = classification.metrics[1]
        dim = classification.dimensions[1]
        data = _smart_aggregate(df, dim, metric)
        if data:
            charts.append(ChartRecommendation(
                slot="slot_2", title=_create_smart_title(metric, dim),
                chart_type="hbar", data=data, confidence="MEDIUM",
                reason="Secondary analysis",
                dimension=dim, metric=metric,
                aggregation="mean" if _should_average_metric(metric) else "sum"
            ))
    
    # 3. Time trend
    if classification.dates and classification.metrics:
        date_col = classification.dates[0]
        metric = classification.metrics[0]
        data = _get_time_trend(
            df,
            date_col,
            metric,
            aggregation=_trend_aggregation_for_metric(metric),
        )
        if data:
            charts.append(ChartRecommendation(
                slot="slot_3", title=_create_smart_title(metric, date_col),
                chart_type="line", data=data, confidence="MEDIUM",
                reason="Time series analysis",
                dimension=date_col, metric=metric,
                aggregation="sum" if not _should_average_metric(metric) else "mean"
            ))
    
    # 4. Correlation
    if len(classification.metrics) >= 2:
        m1, m2 = classification.metrics[:2]
        data = _get_scatter_data(df, m1, m2)
        if data:
            charts.append(ChartRecommendation(
                slot="slot_4", title=_create_smart_title(m1, "") + " vs " + _beautify_column_name(m2),
                chart_type="scatter", data=data, confidence="MEDIUM",
                reason="Metric correlation",
                dimension=m1, metric=m2, aggregation="sum"
            ))
    
    # 5+. Distributions
    for dim in classification.dimensions:
        if len(charts) >= 12: break
        rec = _distribution_chart(
            df, dim, title=f"{_beautify_column_name(dim)} Distribution",
            confidence="MEDIUM", reason="Category distribution", value_label='Records'
        )
        if rec:
            rec.slot = f"slot_{len(charts) + 1}"
            charts.append(rec)
    
    return charts


# =============================================================================
# Main Entry Point
# =============================================================================


def _generate_logistics_charts(df: pd.DataFrame, classification: ColumnClassification) -> List[ChartRecommendation]:
    """Generate logistics charts emphasizing delivery performance and cost drivers."""
    charts: List[ChartRecommendation] = []
    seen: Set[str] = set()

    def add_chart(rec: Optional[ChartRecommendation]) -> None:
        if rec and rec.title not in seen:
            charts.append(rec)
            seen.add(rec.title)

    pm = [c for c in classification.metrics if c in df.columns]
    pd_ = [c for c in classification.dimensions if c in df.columns]
    dates = [c for c in classification.dates if c in df.columns]

    if not pm and not pd_:
        return _generate_generic_charts(df, classification)

    carrier_col = _pick_column_by_keywords(df, pd_, ['carrier', 'courier', 'ship mode', 'shipping', 'delivery service'])
    route_col = _pick_column_by_keywords(df, pd_, ['route', 'lane'])
    origin_col = _pick_column_by_keywords(df, pd_, ['origin'])
    destination_col = _pick_column_by_keywords(df, pd_, ['destination'])
    warehouse_col = _pick_column_by_keywords(df, pd_, ['warehouse', 'facility', 'distribution center'])

    delivery_time_col = _pick_column_by_keywords(df, pm, ['delivery time', 'transit time', 'lead time', 'days for shipment'])
    shipping_cost_col = _pick_column_by_keywords(df, pm, ['shipping cost', 'freight', 'transport cost', 'logistics cost'])
    inventory_col = _pick_column_by_keywords(df, pm, ['inventory', 'stock', 'on hand', 'inventory level'])

    target_col = classification.targets[0] if classification.targets else _pick_column_by_keywords(
        df, list(df.columns), ['late', 'delay', 'late_delivery', 'late_delivery_risk', 'on_time']
    )

    volume_dim = carrier_col or route_col or origin_col or destination_col or warehouse_col
    if volume_dim:
        add_chart(_distribution_chart(
            df,
            volume_dim,
            f'Shipment Volume by {_beautify_column_name(volume_dim)}',
            'HIGH',
            'Shipment volume distribution',
            'Shipments'
        ))

    if delivery_time_col and (carrier_col or route_col):
        dim = carrier_col or route_col
        data = _safe_groupby_mean(df, dim, delivery_time_col)
        add_chart(ChartRecommendation(
            '', f'Avg {_beautify_column_name(delivery_time_col)} by {_beautify_column_name(dim)}',
            'bar', data, 'HIGH', 'Delivery efficiency by segment',
            dimension=dim, metric=delivery_time_col, aggregation='mean'
        ))

    if shipping_cost_col and (carrier_col or route_col):
        dim = carrier_col or route_col
        data = _safe_groupby_sum(df, dim, shipping_cost_col)
        add_chart(ChartRecommendation(
            '', f'{_beautify_column_name(shipping_cost_col)} by {_beautify_column_name(dim)}',
            'hbar', data, 'HIGH', 'Shipping cost drivers',
            format_type='currency',
            dimension=dim, metric=shipping_cost_col, aggregation='sum'
        ))

    if target_col and (carrier_col or route_col):
        dim = carrier_col or route_col
        add_chart(_build_target_rate_chart(
            df,
            target_col,
            dim,
            f'Late Delivery Rate by {_beautify_column_name(dim)}',
            'Delivery risk by segment'
        ))

    if inventory_col and warehouse_col:
        data = _safe_groupby_sum(df, warehouse_col, inventory_col)
        add_chart(ChartRecommendation(
            '', f'{_beautify_column_name(inventory_col)} by {_beautify_column_name(warehouse_col)}',
            'bar', data, 'MEDIUM', 'Inventory allocation by facility',
            dimension=warehouse_col, metric=inventory_col, aggregation='sum'
        ))

    if dates and delivery_time_col:
        date_col = dates[0]
        data = _get_time_trend(df, date_col, delivery_time_col, aggregation=_trend_aggregation_for_metric(delivery_time_col))
        if data:
            add_chart(ChartRecommendation(
                '', f'{_beautify_column_name(delivery_time_col)} Trend',
                'line', data, 'MEDIUM', 'Delivery performance over time',
                dimension=date_col, metric=delivery_time_col, aggregation=_trend_aggregation_for_metric(delivery_time_col)
            ))

    return charts


def _generate_real_estate_charts(df: pd.DataFrame, classification: ColumnClassification) -> List[ChartRecommendation]:
    """Generate real estate charts for listings, pricing, and market velocity."""
    charts: List[ChartRecommendation] = []
    seen: Set[str] = set()

    def add_chart(rec: Optional[ChartRecommendation]) -> None:
        if rec and rec.title not in seen:
            charts.append(rec)
            seen.add(rec.title)

    pm = [c for c in classification.metrics if c in df.columns]
    pd_ = [c for c in classification.dimensions if c in df.columns]
    dates = [c for c in classification.dates if c in df.columns]

    if not pm and not pd_:
        return _generate_generic_charts(df, classification)

    property_type_col = _pick_column_by_keywords(df, pd_, ['property type', 'listing type', 'unit type'])
    location_col = _pick_column_by_keywords(df, pd_, ['location', 'city', 'neighborhood', 'zip', 'region'])
    agent_col = _pick_column_by_keywords(df, pd_, ['agent', 'broker', 'realtor'])

    price_col = _pick_column_by_keywords(df, pm, ['price', 'rent', 'listing price', 'sale price'])
    dom_col = _pick_column_by_keywords(df, pm, ['days on market', 'dom', 'time on market'])

    target_col = classification.targets[0] if classification.targets else _pick_column_by_keywords(
        df, list(df.columns), ['occupied', 'vacant', 'available', 'leased']
    )

    if property_type_col and price_col:
        data = _safe_groupby_mean(df, property_type_col, price_col)
        add_chart(ChartRecommendation(
            '', f'Avg {_beautify_column_name(price_col)} by {_beautify_column_name(property_type_col)}',
            'bar', data, 'HIGH', 'Pricing by property type',
            format_type='currency',
            dimension=property_type_col, metric=price_col, aggregation='mean'
        ))

    if location_col:
        add_chart(_distribution_chart(
            df,
            location_col,
            f'Listings by {_beautify_column_name(location_col)}',
            'HIGH',
            'Listing distribution by location',
            'Listings'
        ))

    if dom_col and property_type_col:
        data = _safe_groupby_mean(df, property_type_col, dom_col)
        add_chart(ChartRecommendation(
            '', f'Avg {_beautify_column_name(dom_col)} by {_beautify_column_name(property_type_col)}',
            'bar', data, 'MEDIUM', 'Market velocity by property type',
            dimension=property_type_col, metric=dom_col, aggregation='mean'
        ))

    if dates and price_col:
        date_col = dates[0]
        data = _get_time_trend(df, date_col, price_col, aggregation=_trend_aggregation_for_metric(price_col))
        if data:
            add_chart(ChartRecommendation(
                '', f'{_beautify_column_name(price_col)} Trend',
                'line', data, 'MEDIUM', 'Pricing trend over time',
                format_type='currency',
                dimension=date_col, metric=price_col, aggregation=_trend_aggregation_for_metric(price_col)
            ))

    if target_col and (location_col or agent_col):
        dim = location_col or agent_col
        add_chart(_build_target_rate_chart(
            df,
            target_col,
            dim,
            f'Occupancy Rate by {_beautify_column_name(dim)}',
            'Occupancy by segment'
        ))

    return charts


def _generate_customer_support_charts(df: pd.DataFrame, classification: ColumnClassification) -> List[ChartRecommendation]:
    """Generate customer support charts for volume, SLA, and satisfaction."""
    charts: List[ChartRecommendation] = []
    seen: Set[str] = set()

    def add_chart(rec: Optional[ChartRecommendation]) -> None:
        if rec and rec.title not in seen:
            charts.append(rec)
            seen.add(rec.title)

    pm = [c for c in classification.metrics if c in df.columns]
    pd_ = [c for c in classification.dimensions if c in df.columns]
    dates = [c for c in classification.dates if c in df.columns]

    if not pm and not pd_:
        return _generate_generic_charts(df, classification)

    channel_col = _pick_column_by_keywords(df, pd_, ['channel', 'source', 'medium'])
    priority_col = _pick_column_by_keywords(df, pd_, ['priority', 'severity', 'urgency'])
    category_col = _pick_column_by_keywords(df, pd_, ['category', 'issue', 'reason', 'type'])
    agent_col = _pick_column_by_keywords(df, pd_, ['agent', 'assignee', 'owner', 'team'])

    resolution_col = _pick_column_by_keywords(df, pm, ['resolution time', 'time to resolve', 'mttr'])
    response_col = _pick_column_by_keywords(df, pm, ['response time', 'first response'])
    csat_col = _pick_column_by_keywords(df, pm, ['csat', 'satisfaction', 'survey score'])
    sla_col = _pick_column_by_keywords(df, pm, ['sla', 'service level'])

    target_col = classification.targets[0] if classification.targets else None

    primary_dim = channel_col or category_col or priority_col
    if primary_dim:
        add_chart(_distribution_chart(
            df,
            primary_dim,
            f'Ticket Volume by {_beautify_column_name(primary_dim)}',
            'HIGH',
            'Ticket volume distribution',
            'Tickets'
        ))

    if resolution_col and priority_col:
        data = _safe_groupby_mean(df, priority_col, resolution_col)
        add_chart(ChartRecommendation(
            '', f'Avg {_beautify_column_name(resolution_col)} by {_beautify_column_name(priority_col)}',
            'bar', data, 'HIGH', 'Resolution efficiency by priority',
            dimension=priority_col, metric=resolution_col, aggregation='mean'
        ))

    if csat_col and channel_col:
        data = _safe_groupby_mean(df, channel_col, csat_col)
        add_chart(ChartRecommendation(
            '', f'{_beautify_column_name(csat_col)} by {_beautify_column_name(channel_col)}',
            'bar', data, 'MEDIUM', 'Customer satisfaction by channel',
            format_type='percentage' if _metric_format_type(csat_col) == 'percentage' else None,
            dimension=channel_col, metric=csat_col, aggregation='mean'
        ))

    if sla_col and priority_col:
        data = _safe_groupby_mean(df, priority_col, sla_col)
        add_chart(ChartRecommendation(
            '', f'{_beautify_column_name(sla_col)} by {_beautify_column_name(priority_col)}',
            'bar', data, 'MEDIUM', 'SLA compliance by priority',
            format_type='percentage' if _metric_format_type(sla_col) == 'percentage' else None,
            dimension=priority_col, metric=sla_col, aggregation='mean'
        ))
    elif target_col and priority_col:
        add_chart(_build_target_rate_chart(
            df,
            target_col,
            priority_col,
            f'SLA Compliance by {_beautify_column_name(priority_col)}',
            'SLA compliance by priority'
        ))

    if dates and (resolution_col or response_col):
        metric = resolution_col or response_col
        date_col = dates[0]
        data = _get_time_trend(df, date_col, metric, aggregation=_trend_aggregation_for_metric(metric))
        if data:
            add_chart(ChartRecommendation(
                '', f'{_beautify_column_name(metric)} Trend',
                'line', data, 'MEDIUM', 'Support performance over time',
                dimension=date_col, metric=metric, aggregation=_trend_aggregation_for_metric(metric)
            ))

    if agent_col and resolution_col and not any(agent_col == c.dimension for c in charts):
        data = _safe_groupby_mean(df, agent_col, resolution_col)
        add_chart(ChartRecommendation(
            '', f'Avg {_beautify_column_name(resolution_col)} by {_beautify_column_name(agent_col)}',
            'hbar', data, 'LOW', 'Agent-level resolution efficiency',
            dimension=agent_col, metric=resolution_col, aggregation='mean'
        ))

    return charts


def _generate_it_operations_charts(df: pd.DataFrame, classification: ColumnClassification) -> List[ChartRecommendation]:
    """Generate IT operations charts for availability and performance."""
    charts: List[ChartRecommendation] = []
    seen: Set[str] = set()

    def add_chart(rec: Optional[ChartRecommendation]) -> None:
        if rec and rec.title not in seen:
            charts.append(rec)
            seen.add(rec.title)

    pm = [c for c in classification.metrics if c in df.columns]
    pd_ = [c for c in classification.dimensions if c in df.columns]
    dates = [c for c in classification.dates if c in df.columns]

    if not pm and not pd_:
        return _generate_generic_charts(df, classification)

    service_col = _pick_column_by_keywords(df, pd_, ['service', 'app', 'application', 'system'])
    environment_col = _pick_column_by_keywords(df, pd_, ['environment', 'env', 'prod', 'staging'])
    host_col = _pick_column_by_keywords(df, pd_, ['host', 'node', 'server', 'cluster'])
    severity_col = _pick_column_by_keywords(df, pd_, ['severity', 'priority'])

    uptime_col = _pick_column_by_keywords(df, pm, ['uptime', 'availability'])
    downtime_col = _pick_column_by_keywords(df, pm, ['downtime', 'outage'])
    latency_col = _pick_column_by_keywords(df, pm, ['latency', 'response time'])
    cpu_col = _pick_column_by_keywords(df, pm, ['cpu', 'utilization'])
    memory_col = _pick_column_by_keywords(df, pm, ['memory', 'ram', 'memory usage'])
    incident_col = _pick_column_by_keywords(df, pm, ['incident', 'alerts', 'tickets'])

    primary_dim = service_col or environment_col or host_col
    if primary_dim:
        add_chart(_distribution_chart(
            df,
            primary_dim,
            f'Incident Volume by {_beautify_column_name(primary_dim)}',
            'HIGH',
            'Incident distribution by service',
            'Incidents'
        ))

    if uptime_col and environment_col:
        data = _safe_groupby_mean(df, environment_col, uptime_col)
        add_chart(ChartRecommendation(
            '', f'{_beautify_column_name(uptime_col)} by {_beautify_column_name(environment_col)}',
            'bar', data, 'HIGH', 'Availability by environment',
            format_type='percentage' if _metric_format_type(uptime_col) == 'percentage' else None,
            dimension=environment_col, metric=uptime_col, aggregation='mean'
        ))

    if downtime_col and service_col:
        data = _safe_groupby_mean(df, service_col, downtime_col)
        add_chart(ChartRecommendation(
            '', f'Avg {_beautify_column_name(downtime_col)} by {_beautify_column_name(service_col)}',
            'bar', data, 'MEDIUM', 'Downtime impact by service',
            dimension=service_col, metric=downtime_col, aggregation='mean'
        ))

    if latency_col and service_col:
        data = _safe_groupby_mean(df, service_col, latency_col)
        add_chart(ChartRecommendation(
            '', f'Avg {_beautify_column_name(latency_col)} by {_beautify_column_name(service_col)}',
            'bar', data, 'MEDIUM', 'Latency by service',
            dimension=service_col, metric=latency_col, aggregation='mean'
        ))

    if dates and latency_col:
        date_col = dates[0]
        data = _get_time_trend(df, date_col, latency_col, aggregation=_trend_aggregation_for_metric(latency_col))
        if data:
            add_chart(ChartRecommendation(
                '', f'{_beautify_column_name(latency_col)} Trend',
                'line', data, 'MEDIUM', 'Latency trend over time',
                dimension=date_col, metric=latency_col, aggregation=_trend_aggregation_for_metric(latency_col)
            ))

    if cpu_col and host_col:
        data = _safe_groupby_mean(df, host_col, cpu_col)
        add_chart(ChartRecommendation(
            '', f'Avg {_beautify_column_name(cpu_col)} by {_beautify_column_name(host_col)}',
            'hbar', data, 'LOW', 'CPU utilization by host',
            dimension=host_col, metric=cpu_col, aggregation='mean'
        ))

    if memory_col and host_col:
        data = _safe_groupby_mean(df, host_col, memory_col)
        add_chart(ChartRecommendation(
            '', f'Avg {_beautify_column_name(memory_col)} by {_beautify_column_name(host_col)}',
            'hbar', data, 'LOW', 'Memory usage by host',
            dimension=host_col, metric=memory_col, aggregation='mean'
        ))

    if severity_col and incident_col and not any(severity_col == c.dimension for c in charts):
        data = _safe_groupby_sum(df, severity_col, incident_col)
        add_chart(ChartRecommendation(
            '', f'{_beautify_column_name(incident_col)} by {_beautify_column_name(severity_col)}',
            'bar', data, 'LOW', 'Incident severity distribution',
            dimension=severity_col, metric=incident_col, aggregation='sum'
        ))

    return charts


def _generate_cybersecurity_charts(df: pd.DataFrame, classification: ColumnClassification) -> List[ChartRecommendation]:
    """Generate cybersecurity charts for threat, vulnerability, and risk visibility."""
    charts: List[ChartRecommendation] = []
    seen: Set[str] = set()

    def add_chart(rec: Optional[ChartRecommendation]) -> None:
        if rec and rec.title not in seen:
            charts.append(rec)
            seen.add(rec.title)

    pm = [c for c in classification.metrics if c in df.columns]
    pd_ = [c for c in classification.dimensions if c in df.columns]
    dates = [c for c in classification.dates if c in df.columns]

    if not pm and not pd_:
        return _generate_generic_charts(df, classification)

    severity_col = _pick_column_by_keywords(df, pd_, ['severity', 'critical', 'high'])
    attack_col = _pick_column_by_keywords(df, pd_, ['attack', 'threat type', 'malware', 'phishing'])
    asset_col = _pick_column_by_keywords(df, pd_, ['asset', 'endpoint', 'host', 'device'])
    source_col = _pick_column_by_keywords(df, pd_, ['source', 'ip', 'user', 'account'])

    alert_col = _pick_column_by_keywords(df, pm, ['alert', 'threat', 'incident'])
    vuln_col = _pick_column_by_keywords(df, pm, ['vulnerability', 'cve', 'exposure'])
    risk_col = _pick_column_by_keywords(df, pm, ['risk', 'risk score'])
    mttr_col = _pick_column_by_keywords(df, pm, ['remediate', 'mttr', 'resolution time'])

    if severity_col:
        add_chart(_distribution_chart(
            df,
            severity_col,
            f'Alerts by {_beautify_column_name(severity_col)}',
            'HIGH',
            'Alert severity distribution',
            'Alerts'
        ))

    if attack_col and alert_col:
        data = _safe_groupby_sum(df, attack_col, alert_col)
        add_chart(ChartRecommendation(
            '', f'{_beautify_column_name(alert_col)} by {_beautify_column_name(attack_col)}',
            'bar', data, 'HIGH', 'Threat volume by type',
            dimension=attack_col, metric=alert_col, aggregation='sum'
        ))
    elif attack_col:
        add_chart(_distribution_chart(
            df,
            attack_col,
            f'Threats by {_beautify_column_name(attack_col)}',
            'MEDIUM',
            'Threat distribution by type',
            'Threats'
        ))

    if vuln_col and asset_col:
        data = _safe_groupby_sum(df, asset_col, vuln_col)
        add_chart(ChartRecommendation(
            '', f'{_beautify_column_name(vuln_col)} by {_beautify_column_name(asset_col)}',
            'hbar', data, 'HIGH',
            'Vulnerability exposure by asset',
            dimension=asset_col, metric=vuln_col, aggregation='sum'
        ))

    if risk_col and dates:
        date_col = dates[0]
        data = _get_time_trend(df, date_col, risk_col, aggregation=_trend_aggregation_for_metric(risk_col))
        if data:
            add_chart(ChartRecommendation(
                '', f'{_beautify_column_name(risk_col)} Trend',
                'line', data, 'MEDIUM', 'Risk score trend over time',
                dimension=date_col, metric=risk_col, aggregation=_trend_aggregation_for_metric(risk_col)
            ))

    if mttr_col and severity_col:
        data = _safe_groupby_mean(df, severity_col, mttr_col)
        add_chart(ChartRecommendation(
            '', f'Avg {_beautify_column_name(mttr_col)} by {_beautify_column_name(severity_col)}',
            'bar', data, 'MEDIUM', 'Remediation time by severity',
            dimension=severity_col, metric=mttr_col, aggregation='mean'
        ))

    if source_col and alert_col and not any(source_col == c.dimension for c in charts):
        data = _safe_groupby_sum(df, source_col, alert_col)
        add_chart(ChartRecommendation(
            '', f'{_beautify_column_name(alert_col)} by {_beautify_column_name(source_col)}',
            'hbar', data, 'LOW', 'Alert volume by source',
            dimension=source_col, metric=alert_col, aggregation='sum'
        ))

    return charts


