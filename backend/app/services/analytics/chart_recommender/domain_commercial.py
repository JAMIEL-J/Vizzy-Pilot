"""Domain Commercial - extracted from generators.py"""
from .prioritization import _should_average_metric, _trend_aggregation_for_metric, _get_metric_prefix
from .query_helpers import _get_ytd_comparison, _get_time_trend, _get_scatter_data, _distribution_chart, _smart_aggregate, _get_yoy_comparison
from .titles import _pick_column_by_keywords
from .aggregators import _safe_groupby_mean
from .domain_ops import _generate_generic_charts

import logging
from typing import Any, Dict, List, Optional

import pandas as pd

from app.services.analytics.column_filter import ColumnClassification

from .aggregators import _safe_groupby_sum
from .models import ChartRecommendation
from .prioritization import (
    _get_metric_prefix,
    _metric_format_type,
    _should_average_metric,
    _trend_aggregation_for_metric,
)
from .query_helpers import (
    _distribution_chart,
    _get_scatter_data,
    _get_time_trend,
    _get_yoy_comparison,
    _get_ytd_comparison,
    _smart_aggregate,
)
from .titles import _beautify_column_name, _create_smart_title

logger = logging.getLogger(__name__)

def _generate_sales_charts(df: pd.DataFrame, classification: ColumnClassification) -> List[ChartRecommendation]:
    """
    Tier 6 Data Analyst Grade E-commerce / Sales Dashboard.
    Highly dynamic: adapts to standard retail, B2B sales, SaaS, and marketplaces.
    """
    charts = []
    chart_titles = set()

    def add_chart(rec):
        if rec.title not in chart_titles:
            # We assign dynamic slots later, so leave empty for now
            rec.slot = '' 
            charts.append(rec)
            chart_titles.add(rec.title)

    # ========================================
    # DYNAMIC COLUMNS DETECTION (SEMANTIC ROLES)
    # ========================================
    pm = classification.metrics
    pd_ = classification.dimensions

    def _find_col(keywords, cols, exclude=None, min_unique=None, is_metric=True):
        exclude = exclude or []
        
        # Primary: Semantic mapping
        try:
            from ..semantic_resolver import semantic_similarity
            best_score = 0.0
            best_col = None

            for col in cols:
                col_lower = col.lower()
                if is_metric and ('date' in col_lower or 'time' in col_lower or 'year' in col_lower):
                    continue
                # Check exclusions
                col_norm = col_lower.replace('_', '').replace('-', '')
                if any(ex in col_norm for ex in exclude):
                    continue
                
                # Check cardinality constraint
                if min_unique and df[col].nunique() < min_unique:
                    continue

                for kw in keywords:
                    score = semantic_similarity(kw, col)
                    if score > best_score:
                        best_score = score
                        best_col = col

            if best_col and best_score >= 0.55:
                return best_col
        except ImportError:
            pass

        # Fallback: Substring matching
        for col in cols:
            col_lower = col.lower()
            if is_metric and ('date' in col_lower or 'time' in col_lower or 'year' in col_lower):
                continue
            col_norm = col_lower.replace('_', '').replace('-', '')
            if any(kw in col_norm for kw in keywords):
                if not any(ex in col_norm for ex in exclude):
                    if min_unique:
                        if df[col].nunique() >= min_unique:
                            return col
                    else:
                        return col
        return None

    revenue_col = _find_col(['revenue', 'sales', 'amount', 'total', 'gmv'], pm, is_metric=True)
    if not revenue_col:
        revenue_col = _find_col(['revenue', 'sales', 'amount', 'total', 'gmv'], df.columns, is_metric=True)
    if not revenue_col:
        revenue_col = pm[0] if pm else None

    qty_col = _find_col(['quantity', 'qty', 'units', 'count', 'volume'], pm, is_metric=True)
    if not qty_col:
        qty_col = _find_col(['quantity', 'qty', 'units', 'count', 'volume'], df.columns, is_metric=True)

    profit_col = _find_col(['profit', 'margin', 'net', 'earnings'], pm, is_metric=True)
    if not profit_col:
        profit_col = _find_col(['profit', 'margin', 'net', 'earnings'], df.columns, is_metric=True)

    discount_col = _find_col(['discount', 'rebate', 'reduction', 'coupon'], pm, is_metric=True)
    if not discount_col:
        discount_col = _find_col(['discount', 'rebate', 'reduction', 'coupon'], df.columns, is_metric=True)

    cost_col = _find_col(['cost', 'cogs', 'expense'], pm, is_metric=True)
    if not cost_col:
        cost_col = _find_col(['cost', 'cogs', 'expense'], df.columns, is_metric=True)

    product_col = _find_col(['product', 'item', 'sku', 'service'], pd_, is_metric=False)
    category_col = _find_col(['category', 'subcategory', 'segment', 'department', 'type', 'group'], pd_, is_metric=False)
    segment_col = _find_col(['segment', 'type', 'group', 'class', 'channel'], pd_, exclude=['category', 'product', 'customer', 'order'], is_metric=False)
    
    # Stricter detection for high-cardinality entities
    entity_excludes = ['segment', 'type', 'group', 'class', 'region', 'state', 'tier', 'status', 'category', 'profile', 'city', 'country', 'zip', 'postal', 'zone']
    customer_col = _find_col(['customer', 'client', 'buyer', 'account', 'user', 'email'], pd_, exclude=entity_excludes, min_unique=5, is_metric=False)
    order_col = _find_col(['order', 'invoice', 'receipt', 'transaction', 'cart'], pd_, exclude=entity_excludes, min_unique=5, is_metric=False)
    
    # Robust date column detection fallback
    date_col = None
    if classification.dates:
        date_col = classification.dates[0]
    else:
        # Fallback: look for any column in df that contains "date", "time", "year", or has datetime/date-like values
        for col in df.columns:
            col_lower = col.lower()
            if 'date' in col_lower or 'time' in col_lower or 'year' in col_lower or pd.api.types.is_datetime64_any_dtype(df[col]):
                if not any(ex in col_lower for ex in ['ship', 'delivery', 'late', 'risk']):
                    date_col = col
                    break
        if not date_col and df.columns:
            for col in df.columns:
                col_lower = col.lower()
                if 'date' in col_lower or 'time' in col_lower or pd.api.types.is_datetime64_any_dtype(df[col]):
                    date_col = col
                    break

    # Geo columns
    country_col = _find_col(['country', 'nation'], pd_, is_metric=False)
    state_col = _find_col(['state', 'province'], pd_, is_metric=False)
    city_col = _find_col(['city', 'town'], pd_, is_metric=False)
    region_col = _find_col(['region', 'market', 'territory', 'zone'], pd_, is_metric=False)
    geo_col = country_col or state_col or region_col or city_col

    # Fallback dim
    primary_dim = category_col or product_col or geo_col or (pd_[0] if pd_ else None)
    secondary_dim = next((d for d in pd_ if d not in (primary_dim, customer_col, order_col)), None)

    # ── TIER 1: EXECUTIVE OVERVIEW (HERO CHARTS) ─────────────────────
    
    # 1. Top Segments by Revenue (Bar/HBar)
    hero_dim = product_col or category_col or primary_dim
    if hero_dim and revenue_col:
        data = _smart_aggregate(df, hero_dim, revenue_col, limit=10)
        if data:
            add_chart(ChartRecommendation(
                slot='', title=_create_smart_title(revenue_col, hero_dim),
                chart_type="hbar", data=data, confidence="HIGH",
                reason="Hero Chart: Best-selling segments by revenue",
                format_type="currency",
                dimension=hero_dim, metric=revenue_col, aggregation="sum"
            ))

    # 2. Geographic Revenue Distribution — handled by _generate_geo_charts (multi-metric)

    # 3. Time Intelligence (Line/Area)
    if date_col:
        if revenue_col:
            data = _get_time_trend(
                df,
                date_col,
                revenue_col,
                aggregation=_trend_aggregation_for_metric(revenue_col),
            )
            if data:
                add_chart(ChartRecommendation(
                    slot='', title=_create_smart_title(revenue_col, date_col),
                    chart_type='line', data=data, confidence='HIGH',
                    reason='Tier 1: Sales velocity and seasonality',
                    format_type="currency",
                    dimension=date_col, metric=revenue_col, aggregation="sum"
                ))
        if profit_col:
            data = _get_time_trend(
                df,
                date_col,
                profit_col,
                aggregation=_trend_aggregation_for_metric(profit_col),
            )
            if data:
                add_chart(ChartRecommendation(
                    slot='', title=_create_smart_title(profit_col, date_col),
                    chart_type='line', data=data, confidence='HIGH',
                    reason='Tier 1: Profit trend over time',
                    format_type="currency",
                    dimension=date_col, metric=profit_col, aggregation="sum"
                ))
            
    # 4. Growth Benchmarking (YoY/YTD)
    if date_col and revenue_col:
        yoy_data = _get_yoy_comparison(df, date_col, revenue_col)
        if yoy_data:
            add_chart(ChartRecommendation(
                slot='', title=f"Year-over-Year {_beautify_column_name(revenue_col)}",
                chart_type="bar", data=yoy_data, confidence="HIGH",
                reason="Macro Growth: Annual performance trajectory",
                format_type="currency",
                dimension=date_col, metric=revenue_col, aggregation="sum",
                granularity="year"
            ))
        
        ytd_data = _get_ytd_comparison(df, date_col, revenue_col)
        if ytd_data:
            add_chart(ChartRecommendation(
                slot='', title=f"Year-to-Date {_beautify_column_name(revenue_col)} Benchmark",
                chart_type="bar", data=ytd_data, confidence="HIGH",
                reason="Strategic Target: Current year performance vs same period last year",
                format_type="currency",
                dimension=date_col, metric=revenue_col, aggregation="sum",
                granularity="ytd"
            ))

    # 5. Categorical Mix (Donut)
    mix_dim = category_col or secondary_dim
    if mix_dim and revenue_col:
        data = _smart_aggregate(df, mix_dim, revenue_col)
        if data:
            add_chart(ChartRecommendation(
                slot='', title=f"{_beautify_column_name(revenue_col)} Composition by {_beautify_column_name(mix_dim)}",
                chart_type="donut", data=data, confidence="HIGH",
                reason="Categorical composition of revenue",
                format_type="currency",
                dimension=mix_dim, metric=revenue_col, aggregation="sum"
            ))

    # ── KEY PROFIT & SALES CHARTS ACROSS ALL CORE DIMENSIONS ──────────
    core_dims = {
        "category": category_col,
        "product": product_col,
        "geography": geo_col,
        "segment": segment_col
    }

    for dim_label, dim in core_dims.items():
        if not dim:
            continue
        # Add Sales/Revenue chart for this core dimension if it's not the hero dimension
        if revenue_col and dim != hero_dim:
            data = _smart_aggregate(df, dim, revenue_col, limit=10)
            if data:
                add_chart(ChartRecommendation(
                    slot='', title=_create_smart_title(revenue_col, dim),
                    chart_type="hbar" if dim_label in ("product", "geography") else "bar",
                    data=data, confidence="HIGH",
                    reason=f"Key Insight: Revenue distribution across {dim_label}",
                    format_type="currency",
                    dimension=dim, metric=revenue_col, aggregation="sum"
                ))
        
        # Add Profit chart for this core dimension
        if profit_col:
            # We skip Category Profitability if Category is category_col (as it is generated as the primary below)
            if dim == (category_col or primary_dim):
                continue
            data = _smart_aggregate(df, dim, profit_col, limit=10)
            if data:
                add_chart(ChartRecommendation(
                    slot='', title=_create_smart_title(profit_col, dim),
                    chart_type="hbar" if dim_label in ("product", "geography") else "bar",
                    data=data, confidence="HIGH",
                    reason=f"Key Insight: Bottom-line profitability across {dim_label}",
                    format_type="currency",
                    dimension=dim, metric=profit_col, aggregation="sum"
                ))

    # ── TIER 2: ADVANCED PROFITABILITY & ECONOMICS ───────────────────
    
    # 6. Profitability per Segment
    if profit_col:
        p_dim = category_col or primary_dim
        if p_dim:
            data = _smart_aggregate(df, p_dim, profit_col, limit=10)
            if data:
                add_chart(ChartRecommendation(
                    slot='', title=_create_smart_title(profit_col, p_dim),
                    chart_type="bar", data=data, confidence="HIGH",
                    reason="Bottom-line analysis per segment",
                    format_type="currency",
                    dimension=p_dim, metric=profit_col, aggregation="sum"
                ))

    # 7. Unit Economics (Margins & Discounts)
    if revenue_col and profit_col and category_col:
        try:
            cat_group = df.groupby(category_col)[[profit_col, revenue_col]].sum().reset_index()
            cat_group = cat_group[cat_group[revenue_col] > 0]
            cat_group['margin_pct'] = (cat_group[profit_col] / cat_group[revenue_col]) * 100
            top_margins = cat_group.sort_values('margin_pct', ascending=False).head(10)
            data = top_margins.rename(columns={category_col: 'name', 'margin_pct': 'value'}).to_dict('records')
            if data:
                add_chart(ChartRecommendation(
                    slot='', title=f"Profit Margin (%) by {_beautify_column_name(category_col)}",
                    chart_type="hbar", data=data, confidence="HIGH",
                    reason="Unit Economics: Which segments are actually profitable?",
                    format_type="percentage",
                    dimension=None, metric=None, aggregation=None
                ))
        except: pass

    # 6. Discount Impact
    if discount_col and revenue_col:
        d_dim = category_col or secondary_dim or geo_col
        if d_dim:
            data = _safe_groupby_sum(df, d_dim, discount_col, limit=10)
            if data:
                add_chart(ChartRecommendation(
                    slot='', title=f"{_beautify_column_name(discount_col)} Value by {_beautify_column_name(d_dim)}",
                    chart_type="bar", data=data, confidence="HIGH",
                    reason="Revenue Leakage: Where are we losing margin?",
                    format_type="currency",
                    dimension=d_dim, metric=discount_col, aggregation="sum"
                ))

    # 7. Discount vs Profit Scatter
    if discount_col and profit_col:
        data = _get_scatter_data(df, discount_col, profit_col)
        if data:
            add_chart(ChartRecommendation(
                slot='', title=f"{_beautify_column_name(discount_col)} vs {_beautify_column_name(profit_col)}",
                chart_type="scatter", data=data, confidence="MEDIUM",
                reason="Promotional Effectiveness: Do discounts kill profitability?",
                format_type="currency",
                dimension=discount_col, metric=profit_col, aggregation="sum"
            ))

    # ── TIER 3: CUSTOMER-CENTRIC (RFM Proxies) ─────────────
    
    if customer_col:
        # 8. Purchase Frequency
        if order_col:
            try:
                order_counts = df.groupby(customer_col)[order_col].nunique()
                bins = [0, 1, 2, 5, 100000]
                labels = ['1 Order', '2 Orders', '3-5 Orders', '5+ Orders']
                freq_dist = pd.cut(order_counts, bins=bins, labels=labels).value_counts().reset_index()
                freq_dist.columns = ['name', 'value']
                data = freq_dist.to_dict('records')
                # Filter out zeroes
                data = [d for d in data if d['value'] > 0]
                if data:
                    add_chart(ChartRecommendation(
                        slot='', title=f"{_beautify_column_name(customer_col)} Purchase Frequency",
                        chart_type="donut", data=data, confidence="HIGH",
                        reason="Customer Loyalty: One-time buyers vs. Repeat customers",
                        format_type="number",
                        value_label='Customers'
                    ))
            except Exception:
                pass

        # 9. Top Customers by Revenue
        if revenue_col:
            data = _smart_aggregate(df, customer_col, revenue_col, limit=10)
            if data:
                add_chart(ChartRecommendation(
                    slot='', title=_create_smart_title(revenue_col, customer_col),
                    chart_type="hbar", data=data, confidence="HIGH",
                    reason="Client Concentration: High-value VIP customers",
                    format_type="currency",
                    dimension=customer_col, metric=revenue_col, aggregation="sum"
                ))

        # 10. Avg Order Value (AOV)
        if order_col and revenue_col and category_col:
            try:
                aov_df = df.groupby(category_col).agg({revenue_col: 'sum', order_col: 'nunique'}).reset_index()
                aov_df = aov_df[aov_df[order_col] > 0]
                aov_df['AOV'] = aov_df[revenue_col] / aov_df[order_col]
                data = aov_df.sort_values('AOV', ascending=False).head(10).rename(columns={category_col: 'name', 'AOV': 'value'}).to_dict('records')
                if data:
                    add_chart(ChartRecommendation(
                        slot='', title=f"Avg. {_beautify_column_name(order_col)} Value by {_beautify_column_name(category_col)}",
                        chart_type="bar", data=data, confidence="HIGH",
                        reason="Basket Size: Which segments spend more per checkout?",
                        format_type="currency"
                    ))
            except Exception:
                pass

    # ── TIER 4: OPERATIONAL & GEOGRAPHIC VOLUME ──────────────────────

    # 11. Geographic Spread
    if geo_col and revenue_col:
        data = _smart_aggregate(df, geo_col, revenue_col, limit=10)
        if data:
            add_chart(ChartRecommendation(
                slot='', title=_create_smart_title(revenue_col, geo_col),
                chart_type="hbar", data=data, confidence="HIGH",
                reason="Market Penetration: Top performing regions",
                format_type="currency",
                dimension=geo_col, metric=revenue_col, aggregation="sum"
            ))
            
    # 12. Quantity Trend
    if date_col and qty_col:
        data = _get_time_trend(
            df,
            date_col,
            qty_col,
            aggregation=_trend_aggregation_for_metric(qty_col),
        )
        if data:
            add_chart(ChartRecommendation(
                slot='', title=f"{_get_metric_prefix(qty_col)} Movement Trend",
                chart_type="line", data=data, confidence="MEDIUM",
                reason="Operational Volume Forecasting",
                format_type="number",
                dimension=date_col, metric=qty_col, aggregation="sum", granularity="month"
            ))

    # 13. Top Products by Quantity
    if product_col and qty_col:
        data = _smart_aggregate(df, product_col, qty_col, limit=10)
        if data:
            add_chart(ChartRecommendation(
                slot='', title=_create_smart_title(qty_col, product_col),
                chart_type="hbar", data=data, confidence="MEDIUM",
                reason="Velocity: Products with highest movement/turnover",
                format_type="number",
                dimension=product_col, metric=qty_col, aggregation="sum"
            ))

    # ── TIER 5: SMART FALLBACKS (Ensure 15+ rich charts) ─────────────
    
    extra_dims = [d for d in pd_ if d not in (product_col, category_col, geo_col, customer_col, order_col)]
    for i, edim in enumerate(extra_dims):
        if len(charts) >= 22:
            break
            
        # Segment Distribution
        rec = _distribution_chart(
            df, edim,
            title=f"{_beautify_column_name(edim)} Breakdown",
            confidence="MEDIUM",
            reason="Data Diversity: Exploring secondary segments",
            value_label='Orders'
        )
        if rec:
            add_chart(rec)
            
        # Metric by Extra Dim
        if revenue_col:
            data = _safe_groupby_sum(df, edim, revenue_col, limit=10)
            if data:
                add_chart(ChartRecommendation(
                    slot='', title=f"{_get_metric_prefix(revenue_col)} by {_beautify_column_name(edim)}",
                    chart_type="hbar", data=data, confidence="MEDIUM",
                    reason="Deep Dive: Uncovering hidden revenue pockets",
                    dimension=edim, metric=revenue_col, aggregation="sum"
                ))
    
    # Fill remaining slots using secondary metrics with primary dimensions
    for metric in pm:
        if len(charts) >= 22:
            break
        if metric in (revenue_col, qty_col, profit_col, discount_col, cost_col):
            continue
            
        if category_col:
             data = _safe_groupby_sum(df, category_col, metric, limit=10)
             if data:
                 add_chart(ChartRecommendation(
                     slot='', title=f"{_beautify_column_name(metric)} by {_beautify_column_name(category_col)}",
                     chart_type="bar", data=data, confidence="LOW",
                     reason="Exhaustive metric coverage fallback",
                     dimension=category_col, metric=metric, aggregation="sum"
                 ))

    # Final guarantee to ensure we don't fall short if data is extremely simple
    if primary_dim and qty_col and len(charts) < 15:
        data = _safe_groupby_sum(df, primary_dim, qty_col)
        if data:
             add_chart(ChartRecommendation(
                 slot='', title=f"{_get_metric_prefix(qty_col)} breakdown by {_beautify_column_name(primary_dim)}",
                 chart_type="donut", data=data, confidence="LOW",
                 reason="Volume breakdown"
             ))

    # Slot normalization
    for i, c in enumerate(charts):
        c.slot = f"slot_{i+1}"

    return charts


def _generate_marketing_charts(df: pd.DataFrame, classification: ColumnClassification) -> List[ChartRecommendation]:
    """Generate dynamic, schema-agnostic charts tailored for Marketing datasets."""
    charts: List[ChartRecommendation] = []

    def add_chart(rec: Optional[ChartRecommendation]) -> None:
        if rec:
            charts.append(rec)

    pm = [c for c in classification.metrics if c in df.columns]
    pd_ = [c for c in classification.dimensions if c in df.columns]
    dates = [c for c in classification.dates if c in df.columns]

    if not pm:
        charts.extend(_generate_generic_charts(df, classification))
        return charts

    def ncol(col: str) -> str:
        return col.lower().replace('_', '').replace('-', '')

    def is_id_like(col: str) -> bool:
        low = ncol(col)
        if low.endswith('id') or low in {'id', 'uuid', 'guid', 'key', 'index'}:
            return True
        return 'campaignid' in low or 'adid' in low

    def metric_role(col: str) -> str:
        low = ncol(col)
        if _should_average_metric(col) or any(k in low for k in ['ctr', 'cvr', 'rate', 'ratio', 'percent', 'pct']):
            return 'rate'
        if any(k in low for k in ['spend', 'cost', 'budget', 'revenue', 'income']):
            return 'currency'
        if any(k in low for k in ['impression', 'view', 'click', 'conversion', 'lead', 'signup', 'session', 'visit', 'reach']):
            return 'volume'
        return 'numeric'

    # Choose dimensions that are interpretable for grouped visuals.
    dim_candidates: List[str] = []
    for d in pd_:
        if is_id_like(d):
            continue
        try:
            nunique = int(df[d].nunique(dropna=True))
        except Exception:
            continue
        if 2 <= nunique <= 50:
            dim_candidates.append(d)

    preferred_dim_tokens = ['channel', 'source', 'medium', 'campaign', 'creative', 'audience', 'placement', 'region']
    dim_candidates.sort(key=lambda d: (0 if any(tok in ncol(d) for tok in preferred_dim_tokens) else 1, len(d)))
    primary_dim = dim_candidates[0] if dim_candidates else (pd_[0] if pd_ else None)

    rate_metrics = [m for m in pm if metric_role(m) == 'rate']
    currency_metrics = [m for m in pm if metric_role(m) == 'currency']
    volume_metrics = [m for m in pm if metric_role(m) == 'volume']
    numeric_metrics = [m for m in pm if metric_role(m) == 'numeric']

    # 1) Grouped performance charts by a strong marketing dimension.
    if primary_dim:
        for m in currency_metrics[:2]:
            data = _safe_groupby_sum(df, primary_dim, m)
            add_chart(ChartRecommendation(
                '', f'{_beautify_column_name(m)} by {_beautify_column_name(primary_dim)}', 'hbar', data,
                'HIGH', 'Budget/revenue allocation by segment', format_type='currency',
                dimension=primary_dim, metric=m, aggregation='sum'
            ))

        for m in rate_metrics[:2]:
            data = _safe_groupby_mean(df, primary_dim, m)
            add_chart(ChartRecommendation(
                '', f'{_beautify_column_name(m)} by {_beautify_column_name(primary_dim)} (%)', 'bar', data,
                'HIGH', 'Rate performance by segment', format_type='percentage',
                dimension=primary_dim, metric=m, aggregation='mean'
            ))

        for m in volume_metrics[:2]:
            data = _safe_groupby_sum(df, primary_dim, m)
            add_chart(ChartRecommendation(
                '', f'{_beautify_column_name(m)} by {_beautify_column_name(primary_dim)}', 'bar', data,
                'MEDIUM', 'Volume distribution by segment', format_type='number',
                dimension=primary_dim, metric=m, aggregation='sum'
            ))

    # 2) Funnel efficiency scatter using best available spend vs conversion-like pair.
    spend_metric = next((m for m in currency_metrics if any(k in ncol(m) for k in ['spend', 'cost', 'budget'])), None)
    conv_metric = next((m for m in pm if any(k in ncol(m) for k in ['conversion', 'lead', 'signup', 'cvr'])), None)
    if spend_metric and conv_metric:
        conv_role = metric_role(conv_metric)
        scatter_data = _get_scatter_data(df, spend_metric, conv_metric, label_col=primary_dim)
        add_chart(ChartRecommendation(
            '', f'{_beautify_column_name(spend_metric)} vs {_beautify_column_name(conv_metric)}', 'scatter', scatter_data,
            'HIGH', 'Acquisition efficiency and spend-performance balance',
            format_type='percentage' if conv_role == 'rate' else 'number',
            dimension=spend_metric, metric=conv_metric,
            aggregation='mean' if conv_role == 'rate' else 'sum',
            section='Key Insights'
        ))

        # 2.5) Cost Per Acquisition (CPA) / Efficiency Insight
        try:
            if primary_dim:
                grouped = df.groupby(primary_dim, observed=True).agg({spend_metric: 'sum', conv_metric: 'sum'}).reset_index()
                grouped['CPA'] = grouped[spend_metric] / grouped[conv_metric].replace(0, pd.NA)
                grouped = grouped.dropna(subset=['CPA']).sort_values('CPA').head(10)
                
                if not grouped.empty:
                    cpa_data = [{'name': str(row[primary_dim]), 'value': round(float(row['CPA']), 2)} for _, row in grouped.iterrows()]
                    add_chart(ChartRecommendation(
                        '', f'Cost Per Acquisition (CPA) by {_beautify_column_name(primary_dim)}', 'bar', cpa_data,
                        'HIGH', 'Critical marketing efficiency metric (Lower CPA is better)',
                        format_type='currency',
                        dimension=primary_dim, metric='CPA',
                        aggregation='mean',
                        section='Key Insights'
                    ))
        except Exception:
            pass

    # 3) Trend charts for representative metrics.
    if dates:
        date_col = dates[0]
        trend_metrics = (volume_metrics[:1] + rate_metrics[:1] + currency_metrics[:1])
        if not trend_metrics:
            trend_metrics = pm[:2]

        for m in trend_metrics[:3]:
            role = metric_role(m)
            trend_data = _get_time_trend(df, date_col, m, aggregation=_trend_aggregation_for_metric(m))
            add_chart(ChartRecommendation(
                '', _create_smart_title(m, date_col), 'line', trend_data,
                'HIGH', 'Temporal performance monitoring',
                format_type='percentage' if role == 'rate' else 'currency' if role == 'currency' else 'number',
                dimension=date_col, metric=m,
                aggregation='mean' if role == 'rate' else 'sum'
            ))

    # 4) Category distribution fallback for key dimensions.
    for dim in dim_candidates[:3]:
        rec = _distribution_chart(
            df, dim,
            title=f'{_beautify_column_name(dim)} Distribution',
            confidence='MEDIUM',
            reason='Audience/channel mix coverage',
            value_label='Records'
        )
        add_chart(rec)

    charts.extend(_generate_generic_charts(df, classification))
    return charts


def _generate_finance_charts(df: pd.DataFrame, classification: ColumnClassification) -> List[ChartRecommendation]:
    """Generate charts tailored for the Finance domain."""
    charts = []
    def add_chart(rec):
        if rec: charts.append(rec)

    pm = classification.metrics
    pd_ = classification.dimensions
    dates = classification.dates

    income_col = next((c for c in pm if 'income' in c.lower() or 'revenue' in c.lower()), None)
    expense_col = next((c for c in pm if 'expense' in c.lower() or 'cost' in c.lower()), None)
    
    dept_col = next((c for c in pd_ if 'department' in c.lower() or 'dept' in c.lower()), None)
    cat_col = next((c for c in pd_ if 'categor' in c.lower() or 'type' in c.lower()), None)
    primary_dim = dept_col or cat_col or (pd_[0] if pd_ else None)

    if primary_dim and income_col:
        data = _safe_groupby_sum(df, primary_dim, income_col)
        add_chart(ChartRecommendation('', f'Income by {_beautify_column_name(primary_dim)}', 'bar', data, 'HIGH', 'Revenue sources', format_type='currency', dimension=primary_dim, metric=income_col, aggregation='sum'))

    if primary_dim and expense_col:
        data = _safe_groupby_sum(df, primary_dim, expense_col)
        add_chart(ChartRecommendation('', f'Expenses by {_beautify_column_name(primary_dim)}', 'donut', data, 'HIGH', 'Cost centers', format_type='currency', dimension=primary_dim, metric=expense_col, aggregation='sum'))

    if dates and income_col:
        data = _get_time_trend(
            df,
            dates[0],
            income_col,
            aggregation=_trend_aggregation_for_metric(income_col),
        )
        add_chart(ChartRecommendation('', 'Cash Flow Trend', 'line', data, 'HIGH', 'Historical cashflow', format_type='currency', dimension=dates[0], metric=income_col, aggregation='sum'))
        
    charts.extend(_generate_generic_charts(df, classification))
    return charts


def _generate_ecommerce_charts(df: pd.DataFrame, classification: ColumnClassification) -> List[ChartRecommendation]:
    """Generate ecommerce charts focused on revenue, conversion, and funnel health."""
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

    category_col = _pick_column_by_keywords(df, pd_, ['category', 'subcategory', 'product', 'sku', 'item'])
    channel_col = _pick_column_by_keywords(df, pd_, ['channel', 'source', 'medium', 'campaign'])
    device_col = _pick_column_by_keywords(df, pd_, ['device', 'platform', 'browser'])
    region_col = _pick_column_by_keywords(df, pd_, ['region', 'country', 'state', 'city', 'market'])

    revenue_col = _pick_column_by_keywords(df, pm, ['revenue', 'sales', 'amount', 'gmv', 'total'])
    orders_col = _pick_column_by_keywords(df, pm, ['orders', 'order count', 'transactions', 'purchases'])
    conversion_col = _pick_column_by_keywords(df, pm, ['conversion', 'cvr', 'conversion rate'])
    abandonment_col = _pick_column_by_keywords(df, pm, ['abandon', 'cart abandonment', 'abandoned'])

    if category_col and revenue_col:
        data = _smart_aggregate(df, category_col, revenue_col, limit=10)
        add_chart(ChartRecommendation(
            '', f'{_beautify_column_name(revenue_col)} by {_beautify_column_name(category_col)}',
            'hbar', data, 'HIGH', 'Revenue mix by category',
            format_type='currency',
            dimension=category_col, metric=revenue_col, aggregation=_trend_aggregation_for_metric(revenue_col)
        ))

    if channel_col:
        if orders_col:
            data = _smart_aggregate(df, channel_col, orders_col, limit=10)
            add_chart(ChartRecommendation(
                '', f'{_beautify_column_name(orders_col)} by {_beautify_column_name(channel_col)}',
                'bar', data, 'HIGH', 'Order volume by channel',
                dimension=channel_col, metric=orders_col, aggregation=_trend_aggregation_for_metric(orders_col)
            ))
        else:
            add_chart(_distribution_chart(
                df,
                channel_col,
                f'Orders by {_beautify_column_name(channel_col)}',
                'MEDIUM',
                'Order volume by channel',
                'Orders'
            ))

    if conversion_col and channel_col:
        data = _safe_groupby_mean(df, channel_col, conversion_col)
        add_chart(ChartRecommendation(
            '', f'{_beautify_column_name(conversion_col)} by {_beautify_column_name(channel_col)}',
            'bar', data, 'HIGH', 'Conversion efficiency by channel',
            format_type='percentage',
            dimension=channel_col, metric=conversion_col, aggregation='mean'
        ))

    if abandonment_col and (device_col or channel_col):
        dim = device_col or channel_col
        data = _safe_groupby_mean(df, dim, abandonment_col)
        add_chart(ChartRecommendation(
            '', f'{_beautify_column_name(abandonment_col)} by {_beautify_column_name(dim)}',
            'bar', data, 'MEDIUM', 'Cart abandonment by segment',
            format_type='percentage',
            dimension=dim, metric=abandonment_col, aggregation='mean'
        ))

    if dates and revenue_col:
        date_col = dates[0]
        data = _get_time_trend(df, date_col, revenue_col, aggregation=_trend_aggregation_for_metric(revenue_col))
        if data:
            add_chart(ChartRecommendation(
                '', f'{_beautify_column_name(revenue_col)} Trend',
                'line', data, 'MEDIUM', 'Revenue trend over time',
                format_type='currency',
                dimension=date_col, metric=revenue_col, aggregation=_trend_aggregation_for_metric(revenue_col)
            ))

    if region_col and revenue_col:
        data = _smart_aggregate(df, region_col, revenue_col, limit=10)
        add_chart(ChartRecommendation(
            '', f'{_beautify_column_name(revenue_col)} by {_beautify_column_name(region_col)}',
            'bar', data, 'MEDIUM', 'Geographic revenue distribution',
            format_type='currency',
            dimension=region_col, metric=revenue_col, aggregation=_trend_aggregation_for_metric(revenue_col)
        ))

    return charts


