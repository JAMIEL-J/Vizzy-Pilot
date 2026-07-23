"""Churn Charts - extracted from generators.py"""
from .churn_analytics import _find_highest_variance_dim, _get_value_at_risk, _get_churned_vs_retained_avg, _get_churn_count_by_segment, _get_stacked_churn_counts, _get_churn_rate_by_segment, _get_lifecycle_cohorts, _get_metric_cohort_analysis
from .titles import _get_binary_target_labels, _smart_target_label, _beautify_column_name, _create_smart_title

import logging
import re
from typing import Any, Dict, List, Optional

import pandas as pd

from .churn_analytics import (
    _build_target_rate_chart,
    _find_highest_variance_dim,
    _get_churn_count_by_segment,
    _get_churn_rate_by_segment,
    _get_churned_vs_retained_avg,
    _get_lifecycle_cohorts,
    _get_metric_cohort_analysis,
    _get_stacked_churn_counts,
    _get_value_at_risk,
)
from .models import ChartRecommendation
from .prioritization import _pick_at_risk_metric, _prioritize_dimensions, _prioritize_metrics, _should_average_metric, _trend_aggregation_for_metric
from .query_helpers import _get_target_distribution, _smart_aggregate, _distribution_chart, _get_scatter_data, _get_time_trend
from .aggregators import _safe_groupby_mean, _safe_groupby_sum
from .titles import (
    _beautify_column_name,
    _create_smart_title,
    _format_categorical_value,
    _get_binary_target_labels,
    _smart_target_label,
)

logger = logging.getLogger(__name__)

def _generate_churn_charts(df, classification, column_profiles: Optional[Dict[str, Dict[str, Any]]] = None):
    """
    Fully domain-agnostic churn dashboard — works for Telco, Bank, Movie, HR, SaaS.

    Column resolution uses SEMANTIC ROLES derived from the data, not keyword matching:
      - primary_dim: dimension with highest churn rate variance (data-driven)
      - primary_metric: first metric from priority list (usually revenue/value)
      - secondary_metric: second metric
      - lifecycle_col: numeric column most likely representing time/age/tenure
      - binary_dims: dimensions with exactly 2 values (demographic splits)
      - multi_dims: dimensions with 3-8 values (product/service groupings)
    """
    # ponytail: pre-computed cardinality lookup avoids full dataframe nunique scanning
    def _get_unique_count(col: str) -> int:
        if column_profiles and col in column_profiles:
            p = column_profiles[col]
            return int(p.get("distinct_count", p.get("unique_count", 0)))
        if col in df.columns:
            return int(df[col].nunique(dropna=True))
        return 0

    charts = []
    target_col = classification.targets[0] if classification.targets else None

    # Fallback: discover churn target from data when classification missed it.
    # This catches numeric 0/1 churn columns that column_filter may have
    # classified as metrics or binary flags instead of targets.
    if not target_col:
        churn_target_keywords = [
            'churn', 'churned', 'exited', 'attrition', 'attrited',
            'left', 'default', 'defaulted', 'complain',
        ]
        for col in df.columns:
            col_clean = col.lower().replace('_', '').replace('-', '').replace(' ', '')
            if any(kw in col_clean for kw in churn_target_keywords):
                if _get_unique_count(col) <= 5:
                    target_col = col
                    logger.info('[CHURN TARGET FALLBACK] Using %r as target (discovered from data)', col)
                    break
    if not target_col:
        return charts

    pm = _prioritize_metrics(classification.metrics)
    pd_ = _prioritize_dimensions(classification.dimensions)
    primary_dim = _find_highest_variance_dim(df, target_col, pd_)
    label = _smart_target_label(target_col)  # "Churn" / "Exit" / "Attrition" etc.

    # ── SEMANTIC ROLE ASSIGNMENT ──────────────────────────────────────

    # Helper lambdas for column classification
    lifecycle_hints = ['tenure', 'age', 'months', 'years', 'duration', 'days',
                       'yearsatcompany', 'accountage', 'lengthofstay', 'seniority',
                       'experience', 'vintage', 'period', 'totalworkingyears']
    senior_hints    = ['senior', 'seniorcitizen', 'seniorcitizenind']
    value_hints     = ['charge', 'revenue', 'spent', 'billing', 'income', 'balance',
                       'price', 'amount', 'salary', 'cost', 'fee']

    def _compact(col: str) -> str:
        return ''.join(ch for ch in str(col).lower() if ch.isalnum())

    def _looks_financial_name(col: str) -> bool:
        name = _compact(col)
        financial_tokens = (
            'charge', 'charges', 'monthlycharge', 'totalcharge', 'revenue', 'income',
            'billing', 'bill', 'balance', 'amount', 'salary', 'cost', 'fee', 'mrr', 'arr'
        )
        return any(tok in name for tok in financial_tokens)

    try:
        from ..semantic_resolver import semantic_similarity
        
        def _semantic_check(col, hints, threshold=0.55):
            return any(semantic_similarity(h, col) >= threshold for h in hints)
            
        def _is_lifecycle(col):
            # Guard: avoid treating financial fields like MonthlyCharges as lifecycle.
            if _looks_financial_name(col):
                return False
            return _semantic_check(col, lifecycle_hints)
        def _is_senior(col):    return _semantic_check(col, senior_hints)
        def _is_financial(col): return _semantic_check(col, value_hints) and not _is_lifecycle(col)
    except ImportError:
        def _is_lifecycle(col):
            if _looks_financial_name(col):
                return False
            return any(h in col.lower().replace('_', '') for h in lifecycle_hints)
        def _is_senior(col):    return any(h in col.lower().replace('_', '') for h in senior_hints)
        def _is_financial(col): return any(h in col.lower() for h in value_hints) and not _is_lifecycle(col)

    # Split pm into financial vs non-financial to prevent tenure from being summed
    financial_metrics = [c for c in pm if _is_financial(c)]
    # Primary financial metric — strictly used for SUM-based financial charts (Revenue at Risk)
    primary_value_metric = financial_metrics[0] if financial_metrics else None
    secondary_metric = next((c for c in financial_metrics if c != primary_value_metric), None)

    # Lifecycle column — strictly for survival/cohort & average charts, NEVER summed for 'At Risk'
    lifecycle_col = None
    all_numeric = pm + [c for c in df.select_dtypes('number').columns if c not in pm and c != target_col]
    for hint in lifecycle_hints:
        match = next((c for c in all_numeric if hint in c.lower().replace('_', '')), None)
        if match:
            lifecycle_col = match
            break

    # If no financial metric found, we use the first available non-lifecycle metric for secondary charts,
    # but we will guard the 'At Risk' charts.
    if not primary_value_metric:
        primary_value_metric = next((c for c in pm if c != lifecycle_col and not _is_senior(c)), pm[0] if pm else None)

    # Monthly financial metric (e.g., MonthlyCharges/MRR) for explicit monthly churn views.
    monthly_value_metric = next(
        (
            c for c in financial_metrics
            if any(tok in ''.join(ch for ch in str(c).lower() if ch.isalnum()) for tok in ('monthly', 'month', 'mrr'))
        ),
        None
    )

    # Binary dimensions (exactly 2 unique values)
    binary_dims = list(getattr(classification, "binary_dims", [])) or [d for d in pd_ if _get_unique_count(d) == 2 and d != target_col]
    # SeniorCitizen is often classified as a metric (0/1 int) — rescue it into binary_dims
    senior_col_match = next((c for c in pm + pd_ if _is_senior(c)), None)
    if senior_col_match and senior_col_match not in binary_dims:
        binary_dims.insert(0, senior_col_match)  # Highest priority in binary_dims

    # Multi-value dimensions (3-8 categories)
    multi_dims = [d for d in pd_ if 2 < _get_unique_count(d) <= 8 and d != target_col]
    def _find_payment_dimension(dim_candidates: List[str]) -> Optional[str]:
        """Resolve a payment-like categorical dimension across churn schemas."""
        # 1) Prefer canonical mapper output when available.
        mapped = None
        if getattr(classification, "mappings", None):
            mapped = classification.mappings.get("attr_payment")
        if mapped and mapped in df.columns and mapped in dim_candidates and mapped != target_col:
            if _get_unique_count(mapped) >= 2:
                return mapped

        payment_keywords = [
            "payment", "payment method", "payment type", "billing", "billing method",
            "billing type", "invoice method", "card", "bank", "autopay", "auto pay",
            "mode of payment",
        ]

        # 2) Semantic resolution across candidate dimensions.
        try:
            from ..semantic_resolver import semantic_similarity
            best_col = None
            best_score = 0.0
            for col in dim_candidates:
                if col == target_col or col not in df.columns:
                    continue
                nunique = _get_unique_count(col)
                if nunique < 2:
                    continue
                # Keep chart interpretable; payment method should be categorical, not near-ID.
                if nunique > max(40, int(len(df) * 0.35)):
                    continue

                score = max(semantic_similarity(keyword, col) for keyword in payment_keywords)
                if score > best_score:
                    best_score = score
                    best_col = col
            if best_col and best_score >= 0.55:
                return best_col
        except Exception:
            pass

        # 3) String fallback for environments where semantic resolver is unavailable.
        fallback_tokens = ("payment", "billing", "invoice", "card", "bank", "autopay")
        for col in dim_candidates:
            if col == target_col or col not in df.columns:
                continue
            if any(token in col.lower() for token in fallback_tokens):
                if _get_unique_count(col) >= 2:
                    return col

        return None

    payment_col_match = _find_payment_dimension(pd_)

    # Second-best dimension (different from primary_dim)
    secondary_dim = next((d for d in pd_ if d != primary_dim and d != target_col), None)

    # Third dimension
    tertiary_dim = None
    for d in pd_:
        if d not in (primary_dim, secondary_dim, target_col):
            tertiary_dim = d
            break

    chart_titles = set()
    pos_label, neg_label = _get_binary_target_labels(target_col)

    def add_chart(rec):
        if rec.title not in chart_titles:
            charts.append(rec)
            chart_titles.add(rec.title)
            logger.debug('[ADD] #%d %r', len(charts), rec.title)
        else:
            logger.debug('[DUP] %r', rec.title)

    # 1. Target Distribution — Hero donut
    data = _get_target_distribution(df, target_col)
    if data:
        add_chart(ChartRecommendation(
            slot='', title=f'{label} Overview', chart_type='donut',
            data=data, confidence='HIGH',
            reason=f'Tier 1: Overall {label.lower()} split',
            value_label='Customers',
            dimension=target_col, metric=None, aggregation='count'
        ))

    # 2. Guaranteed Payment Method view (rate + volume) when a payment-like dimension exists.
    if payment_col_match:
        payment_dim_label = (
            re.sub(r'\s+', ' ', re.sub(r'(?<=[a-z0-9])(?=[A-Z])', ' ', str(payment_col_match)).replace('_', ' ').replace('-', ' ')).strip().title()
            or _beautify_column_name(payment_col_match)
        )
        data = _get_churn_rate_by_segment(df, target_col, payment_col_match)
        if data:
            add_chart(ChartRecommendation(
                slot='', title=f'{label} Rate by {payment_dim_label} (%)',
                chart_type='bar', data=data, confidence='HIGH',
                reason=f'Tier 1: Payment-method risk profile for {label.lower()}',
                format_type='percentage',
                dimension=payment_col_match, metric=target_col, aggregation='mean',
                variance_score=float('inf')
            ))

        data = _get_churn_count_by_segment(df, target_col, payment_col_match)
        if data:
            add_chart(ChartRecommendation(
                slot='', title=f'{label} Count by {payment_dim_label}',
                chart_type='hbar', data=data, confidence='HIGH',
                reason=f'Tier 1: Payment-method volume context for {label.lower()}',
                dimension=payment_col_match, metric=target_col, aggregation='count'
            ))

    # 3. Rate by Primary Dimension (highest variance = most impactful)
    if primary_dim:
        data = _get_churn_rate_by_segment(df, target_col, primary_dim)
        if data:
            add_chart(ChartRecommendation(
                slot='', title=f'{label} Rate by {_beautify_column_name(primary_dim)} (%)',
                chart_type='bar', data=data, confidence='HIGH',
                reason=f'Tier 1: Highest-variance dimension for {label.lower()}',
                dimension=primary_dim, metric=target_col, aggregation='mean'
            ))

    # 4. Lifecycle Cohort Analysis (data-driven quartile buckets)
    if lifecycle_col:
        data = _get_lifecycle_cohorts(df, lifecycle_col, target_col)
        if data:
            add_chart(ChartRecommendation(
                slot='',
                title=f'{label} Rate by {_beautify_column_name(lifecycle_col)} Cohort (%)',
                chart_type='bar', data=data, confidence='HIGH',
                reason=f'Tier 1: When in the lifecycle do they leave?',
                format_type='percentage',
                dimension=lifecycle_col, metric=target_col, aggregation='mean'
            ))
    elif secondary_dim and secondary_dim != primary_dim:
        data = _get_churn_rate_by_segment(df, target_col, secondary_dim)
        if data:
            add_chart(ChartRecommendation(
                slot='', title=f'{label} Rate by {_beautify_column_name(secondary_dim)} (%)',
                chart_type='bar', data=data, confidence='HIGH',
                reason=f'Tier 1: {label} rate by secondary dimension',
                format_type='percentage',
                dimension=secondary_dim, metric=target_col, aggregation='mean'
            ))

    # ── TIER 2: FINANCIAL IMPACT ─────────────────────────────────────

    # 4. Value at Risk by Primary Dimension (STRICTLY FINANCIAL)
    impact_metric = _pick_at_risk_metric(financial_metrics)
    if impact_metric and primary_dim:
        data = _get_value_at_risk(df, target_col, primary_dim, impact_metric)
        if data:
            add_chart(ChartRecommendation(
                slot='',
                title=f'{_beautify_column_name(impact_metric)} at Risk by {_beautify_column_name(primary_dim)}',
                chart_type='bar', data=data, confidence='HIGH',
                reason=f'Tier 2: Financial impact of {label.lower()} by segment',
                format_type='currency',
                dimension=primary_dim, metric=impact_metric, aggregation='sum'
            ))

    # 4b. Monthly Value at Risk by Primary Dimension (explicit monthly counterpart)
    if monthly_value_metric and primary_dim and monthly_value_metric != impact_metric:
        data = _get_value_at_risk(df, target_col, primary_dim, monthly_value_metric)
        if data:
            add_chart(ChartRecommendation(
                slot='',
                title=f'{_beautify_column_name(monthly_value_metric)} at Risk by {_beautify_column_name(primary_dim)}',
                chart_type='bar', data=data, confidence='HIGH',
                reason=f'Tier 2: Monthly financial impact of {label.lower()} by segment',
                format_type='currency',
                dimension=primary_dim, metric=monthly_value_metric, aggregation='sum'
            ))

    # 5. Metric Distribution — Treemap
    dim_for_treemap = secondary_dim or primary_dim
    if primary_value_metric and dim_for_treemap:
        data = _smart_aggregate(df, dim_for_treemap, primary_value_metric)
        if data:
            add_chart(ChartRecommendation(
                slot='',
                title=_create_smart_title(primary_value_metric, dim_for_treemap),
                chart_type='treemap', data=data, confidence='HIGH',
                reason='Tier 2: Revenue/value share by segment',
                dimension=dim_for_treemap, metric=primary_value_metric, aggregation='sum'
            ))

    # 6. Avg Lifecycle/Value by Primary Dimension
    avg_metric = lifecycle_col or primary_value_metric
    if avg_metric and primary_dim:
        data = _smart_aggregate(df, primary_dim, avg_metric)
        if data:
            add_chart(ChartRecommendation(
                slot='',
                title=_create_smart_title(avg_metric, primary_dim),
                chart_type='hbar', data=data, confidence='HIGH',
                reason='Tier 2: Metric variance by segment',
                dimension=primary_dim, metric=avg_metric, aggregation='mean' if _should_average_metric(avg_metric) else 'sum'
            ))

    # ── TIER 3: PRODUCT/SERVICE ANALYSIS ─────────────────────────────

    # 7. Rate by best multi-value dimension (product/service/role)
    svc_dim = next((d for d in multi_dims if d not in (primary_dim, secondary_dim)), None) or secondary_dim
    if svc_dim:
        data = _get_churn_rate_by_segment(df, target_col, svc_dim)
        if data:
            add_chart(ChartRecommendation(
                slot='', title=f'{label} Rate by {_beautify_column_name(svc_dim)} (%)',
                chart_type='bar', data=data, confidence='HIGH',
                reason=f'Tier 3: Which {_beautify_column_name(svc_dim)} segments have highest {label.lower()}?',
                format_type='percentage',
                dimension=svc_dim, metric=target_col, aggregation='mean'
            ))

    # 8. Value at Risk by second multi-value dimension (STRICTLY FINANCIAL)
    impact_metric = financial_metrics[0] if financial_metrics else None
    svc_dim2 = next((d for d in multi_dims if d not in (primary_dim, svc_dim)), None)
    if svc_dim2 and impact_metric:
        data = _get_value_at_risk(df, target_col, svc_dim2, impact_metric)
        if data:
            add_chart(ChartRecommendation(
                slot='',
                title=f'{_beautify_column_name(impact_metric)} at Risk by {_beautify_column_name(svc_dim2)}',
                chart_type='hbar', data=data, confidence='HIGH',
                reason='Tier 3: Secondary financial risk view',
                format_type='currency',
                dimension=svc_dim2, metric=impact_metric, aggregation='sum'
            ))
    elif secondary_dim and impact_metric and secondary_dim != svc_dim:
        data = _get_value_at_risk(df, target_col, secondary_dim, impact_metric)
        if data:
            add_chart(ChartRecommendation(
                slot='',
                title=f'{_beautify_column_name(impact_metric)} at Risk by {_beautify_column_name(secondary_dim)}',
                chart_type='hbar', data=data, confidence='HIGH',
                reason=f'Tier 3: Value leakage by secondary dimension',
                format_type='currency',
                dimension=secondary_dim, metric=impact_metric, aggregation='sum'
            ))

    # 9. Rate by tertiary dimension or another product/service dim
    tier3_dim = tertiary_dim or next((d for d in pd_ if d not in (primary_dim, secondary_dim, svc_dim, svc_dim2) and d != target_col), None)
    if tier3_dim:
        data = _get_churn_rate_by_segment(df, target_col, tier3_dim)
        if data:
            add_chart(ChartRecommendation(
                slot='', title=f'{label} Rate by {_beautify_column_name(tier3_dim)} (%)',
                chart_type='bar', data=data, confidence='HIGH',
                reason=f'Tier 3: {label} across {_beautify_column_name(tier3_dim)}',
                dimension=tier3_dim, metric=target_col, aggregation='mean'
            ))
    elif secondary_metric and primary_dim:
        data = _safe_groupby_mean(df, primary_dim, secondary_metric)
        if data:
            add_chart(ChartRecommendation(
                slot='',
                title=f'Avg {_beautify_column_name(secondary_metric)} by {_beautify_column_name(primary_dim)}',
                chart_type='hbar', data=data, confidence='MEDIUM',
                reason='Tier 3: Secondary metric by primary dimension',
                dimension=primary_dim, metric=secondary_metric, aggregation='mean'
            ))

    # ── TIER 4: DEMOGRAPHIC PROFILE ──────────────────────────────────

    # 10. Distribution of a multi-value dimension (donut)
    # Prefer payment method for this chart if available
    profile_dim = payment_col_match or next((d for d in multi_dims if d != primary_dim), None) or (pd_[0] if pd_ else None)
    if profile_dim:
        rec = _distribution_chart(
            df, profile_dim,
            title=f'{_beautify_column_name(profile_dim)} Distribution',
            confidence='HIGH',
            reason=f'Tier 4: Population distribution by {_beautify_column_name(profile_dim)}',
            value_label='Customers'
        )
        if rec:
            add_chart(rec)

    # 11. Senior Citizen churn rate (guaranteed slot)
    #     then fall back to any other unused binary dimension
    # 11. Senior Citizen churn rate (guaranteed slot)
    used_dims = {primary_dim, secondary_dim, svc_dim, svc_dim2, tier3_dim, profile_dim}
    if senior_col_match:
        data = _get_churn_rate_by_segment(df, target_col, senior_col_match)
        if data:
            add_chart(ChartRecommendation(
                slot='', title=f'{label} Rate by {_beautify_column_name(senior_col_match)} (%)',
                chart_type='bar', data=data, confidence='HIGH',
                reason='Tier 4: Senior vs Non-Senior churn split',
                dimension=senior_col_match, metric=target_col, aggregation='mean'
            ))
    else:
        bin1 = next((d for d in binary_dims if d not in used_dims), binary_dims[0] if binary_dims else None)
        if bin1:
            data = _get_churn_rate_by_segment(df, target_col, bin1)
            if data:
                add_chart(ChartRecommendation(
                    slot='', title=f'{label} Rate by {_beautify_column_name(bin1)} (%)',
                    chart_type='bar', data=data, confidence='HIGH',
                    reason=f'Tier 4: Binary demographic split — {_beautify_column_name(bin1)}',
                    dimension=bin1, metric=target_col, aggregation='mean'
                ))

    # 12. A second binary/unused dimension
    used_dims_after_11 = used_dims | ({senior_col_match} if senior_col_match else set())
    bin2 = next((d for d in binary_dims if d not in used_dims_after_11 and d != senior_col_match), None)
    if not bin2:
        bin2 = next((d for d in pd_ if d not in used_dims_after_11 and d != target_col), None)
    if bin2:
        data = _get_churn_rate_by_segment(df, target_col, bin2)
        if data:
            add_chart(ChartRecommendation(
                slot='', title=f'{label} Rate by {_beautify_column_name(bin2)} (%)',
                chart_type='bar', data=data, confidence='MEDIUM',
                reason=f'Tier 4: Demographic/behavioral split — {_beautify_column_name(bin2)}',
                dimension=bin2, metric=target_col, aggregation='mean'
            ))
    elif primary_dim:
        rec = _distribution_chart(
            df, primary_dim,
            title=f'{_beautify_column_name(primary_dim)} Distribution',
            confidence='MEDIUM',
            reason='Tier 4: Segment distribution',
            value_label='Customers'
        )
        if rec:
            rec.dimension = primary_dim
            rec.aggregation = 'count'
            add_chart(rec)

    # ── TIER 5: BEHAVIORAL DEPTH ─────────────────────────────────────

    # 13. Metric correlations (Scatter)
    scatter_x = primary_value_metric or pm[0] if pm else None
    scatter_y = secondary_metric or (pm[1] if len(pm) > 1 else None) or lifecycle_col
    if scatter_x and scatter_y and scatter_x != scatter_y:
        data = _get_scatter_data(df, scatter_x, scatter_y, limit=200)
        if data:
            add_chart(ChartRecommendation(
                slot='',
                title=f'{_beautify_column_name(scatter_x)} vs {_beautify_column_name(scatter_y)}',
                chart_type='scatter', data=data, confidence='MEDIUM',
                reason='Tier 5: Correlation between key metrics',
                dimension=scatter_x, metric=scatter_y, aggregation='sum'
            ))

    # 14. Time trend OR Value at Risk by another dimension
    # Guard: Only generate trend charts when we have a TRUE financial metric,
    # not lifecycle columns like tenure/age which produce misleading trend lines.
    _has_valid_trend_metric = (
        classification.dates
        and primary_value_metric
        and not _is_lifecycle(primary_value_metric)
    )
    if _has_valid_trend_metric:
        date_col = classification.dates[0]
        data = _get_time_trend(
            df,
            date_col,
            primary_value_metric,
            aggregation=_trend_aggregation_for_metric(primary_value_metric),
        )
        if data:
            # Dynamically determine aggregation metadata to match _get_time_trend logic
            trend_agg = 'mean' if _should_average_metric(primary_value_metric) else 'sum'
            add_chart(ChartRecommendation(
                slot='',
                title=f'{_beautify_column_name(primary_value_metric)} Trend Over Time',
                chart_type='area', data=data, confidence='HIGH',
                reason='Tier 5: Trend analysis for seasonality',
                dimension=date_col, metric=primary_value_metric, aggregation=trend_agg
            ))
    elif secondary_metric and secondary_dim:
        data = _get_value_at_risk(df, target_col, secondary_dim, secondary_metric)
        if data:
            add_chart(ChartRecommendation(
                slot='',
                title=f'{_beautify_column_name(secondary_metric)} at Risk by {_beautify_column_name(secondary_dim)}',
                chart_type='hbar', data=data, confidence='MEDIUM',
                reason='Tier 5: Secondary value at risk',
                dimension=secondary_dim, metric=secondary_metric, aggregation='sum'
            ))
    elif primary_value_metric and len(pd_) > 1:
        dim = pd_[1] if pd_[0] == primary_dim else pd_[0]
        data = _safe_groupby_mean(df, dim, primary_value_metric)
        if data:
            add_chart(ChartRecommendation(
                slot='',
                title=f'Avg {_beautify_column_name(primary_value_metric)} by {_beautify_column_name(dim)}',
                chart_type='hbar', data=data, confidence='MEDIUM',
                reason='Tier 5: Metric depth fallback',
                dimension=dim, metric=primary_value_metric, aggregation='mean'
            ))

    # 15. Final coverage — exhaustive metric×dim search for any unused combo
    # Build full candidate list: all metrics (financial first, then lifecycle, then others)
    candidate_metrics_15 = (
        [c for c in financial_metrics if c not in (primary_value_metric, secondary_metric)]
        + ([lifecycle_col] if lifecycle_col else [])
        + [c for c in pm if c not in financial_metrics and c != lifecycle_col and not _is_senior(c)]
        + [primary_value_metric, secondary_metric]  # last resort: reuse financial with new dim
    )
    candidate_dims_15 = list(pd_)  # all dims, deduplication handles collisions

    added_15 = False
    for m15 in [c for c in candidate_metrics_15 if c]:  # skip None
        for d15 in candidate_dims_15:
            agg_label = 'Total' if m15 in financial_metrics else 'Avg'
            candidate_title = f'{agg_label} {_beautify_column_name(m15)} by {_beautify_column_name(d15)}'
            _used = candidate_title in chart_titles
            logger.debug('[C15] %r used=%s', candidate_title, _used)
            if _used:
                continue
            data = (_safe_groupby_sum(df, d15, m15) if m15 in financial_metrics
                    else _safe_groupby_mean(df, d15, m15))
            logger.debug('[C15]   data_ok=%s', bool(data))
            if data:
                add_chart(ChartRecommendation(
                    slot='', title=candidate_title,
                    chart_type='hbar', data=data, confidence='MEDIUM',
                    reason='Tier 5: Extended metric coverage',
                    dimension=d15, metric=m15, aggregation='sum' if m15 in financial_metrics else 'mean'
                ))
                added_15 = True
                break
        if added_15:
            break

    # Guaranteed final fallback — always works because title includes 'Distribution'
    if not added_15 and primary_value_metric and primary_dim:
        data = _safe_groupby_sum(df, primary_dim, primary_value_metric)
        if data:
            add_chart(ChartRecommendation(
                slot='',
                title=f'Total {_beautify_column_name(primary_value_metric)} Distribution by {_beautify_column_name(primary_dim)}',
                chart_type='treemap', data=data, confidence='MEDIUM',
                reason='Tier 5: Final summary view'
            ))


    # ── TIER 6: PROFESSIONAL DA DEPTH ────────────────────────────────

    # 16. Stacked Churn Counts by Primary Dimension (Yes/No volume split)
    if primary_dim:
        data = _get_stacked_churn_counts(df, target_col, primary_dim)
        if data:
            add_chart(ChartRecommendation(
                slot='', title=f'{label} Volume by {_beautify_column_name(primary_dim)}',
                chart_type='stacked_bar', data=data, confidence='HIGH',
                categories=[pos_label, neg_label],
                reason=f'Tier 6: Volume split — raw count of {pos_label.lower()} vs {neg_label.lower()} per segment',
                dimension=primary_dim, metric=target_col, aggregation='count'
            ))

    # 17. Positive vs Negative cohort — Avg Primary Metric Comparison
    if primary_value_metric:
        data = _get_churned_vs_retained_avg(df, target_col, primary_value_metric)
        if data:
            add_chart(ChartRecommendation(
                slot='',
                title=f'Avg {_beautify_column_name(primary_value_metric)}: {pos_label} vs {neg_label}',
                chart_type='bar', data=data, confidence='HIGH',
                reason=f'Tier 6: Price sensitivity — are {pos_label.lower()} users paying more or less?',
                dimension=target_col, metric=primary_value_metric, aggregation='mean'
            ))

    # 18. Churn Count by Secondary Dimension (volume, not rate)
    count_dim = secondary_dim or (multi_dims[0] if multi_dims else None)
    if count_dim and count_dim != primary_dim:
        data = _get_churn_count_by_segment(df, target_col, count_dim)
        if data:
            add_chart(ChartRecommendation(
                slot='',
                title=f'{label} Count by {_beautify_column_name(count_dim)}',
                chart_type='hbar', data=data, confidence='HIGH',
                reason=f'Tier 6: Where is the volume of {label.lower()} concentrated?',
                dimension=count_dim, metric=target_col, aggregation='count'
            ))

    # 19. Financial Cohort Analysis — churn rate by metric quartile
    cohort_metric = primary_value_metric or (financial_metrics[0] if financial_metrics else None)
    if cohort_metric and cohort_metric != lifecycle_col:
        data = _get_metric_cohort_analysis(df, cohort_metric, target_col)
        if data:
            add_chart(ChartRecommendation(
                slot='',
                title=f'{label} Rate by {_beautify_column_name(cohort_metric)} Range (%)',
                chart_type='bar', data=data, confidence='HIGH',
                reason='Tier 6: Do high-value customers churn more or less?',
                dimension=cohort_metric, metric=target_col, aggregation='mean'
            ))

    # 19b. Monthly Financial Cohort Analysis — explicit monthly counterpart
    if monthly_value_metric and monthly_value_metric != lifecycle_col and monthly_value_metric != cohort_metric:
        data = _get_metric_cohort_analysis(df, monthly_value_metric, target_col)
        if data:
            add_chart(ChartRecommendation(
                slot='',
                title=f'{label} Rate by {_beautify_column_name(monthly_value_metric)} Range (%)',
                chart_type='bar', data=data, confidence='HIGH',
                reason='Tier 6: Monthly financial cohort analysis',
                dimension=monthly_value_metric, metric=target_col, aggregation='mean'
            ))

    # 20. Positive vs Negative cohort — Avg Lifecycle/Tenure Comparison
    if lifecycle_col:
        data = _get_churned_vs_retained_avg(df, target_col, lifecycle_col)
        if data:
            add_chart(ChartRecommendation(
                slot='',
                title=f'Avg {_beautify_column_name(lifecycle_col)}: {pos_label} vs {neg_label}',
                chart_type='bar', data=data, confidence='HIGH',
                reason=f'Tier 6: Do long-lifecycle {pos_label.lower()} users differ from {neg_label.lower()} users?',
                dimension=target_col, metric=lifecycle_col, aggregation='mean'
            ))

    # 21. Bonus: Secondary metric cohort analysis (if different from primary)
    if secondary_metric and secondary_metric != cohort_metric:
        data = _get_metric_cohort_analysis(df, secondary_metric, target_col)
        if data:
            add_chart(ChartRecommendation(
                slot='',
                title=f'{label} Rate by {_beautify_column_name(secondary_metric)} Range (%)',
                chart_type='bar', data=data, confidence='MEDIUM',
                reason='Tier 6: Secondary metric cohort analysis',
                dimension=secondary_metric, metric=target_col, aggregation='mean'
            ))

    # 22. Bonus: Distribution of a new unused dimension (donut)
    all_used_dims = {primary_dim, secondary_dim, svc_dim, svc_dim2, tier3_dim, profile_dim, count_dim}
    bonus_dim = next((d for d in pd_ if d not in all_used_dims and d != target_col), None)
    if bonus_dim:
        rec = _distribution_chart(
            df, bonus_dim,
            title=f'{_beautify_column_name(bonus_dim)} Distribution',
            confidence='MEDIUM',
            reason='Tier 6: Additional segment breakdown',
            value_label='Customers'
        )
        if rec:
            rec.dimension = bonus_dim
            rec.aggregation = 'count'
            add_chart(rec)

    # 23. Extra View: Total Charges by Gender (User Request)
    # Search ALL columns for a more robust match, not just classification summaries
    gender_col = next((c for c in df.columns if 'gender' in str(c).lower()), None)
    total_vol_metric = next((c for c in df.columns if 'total' in str(c).lower() and ('charge' in str(c).lower() or 'revenue' in str(c).lower() or 'spent' in str(c).lower())), None)
    
    if gender_col and total_vol_metric:
        try:
            # Ensure metric is numeric for sum aggregation
            df[total_vol_metric] = pd.to_numeric(df[total_vol_metric], errors='coerce')
            data = _safe_groupby_sum(df, gender_col, total_vol_metric)
            if data and len(data) > 0:
                rec = ChartRecommendation(
                    slot='', 
                    title=f'Total {_beautify_column_name(total_vol_metric)} by {_beautify_column_name(gender_col)}',
                    chart_type='hbar', data=data, confidence='MEDIUM',
                    reason='Extra view: Total financial volume split by gender',
                    format_type='currency',
                    dimension=gender_col, metric=total_vol_metric, aggregation='sum'
                )
                rec.variance_score = float('inf')  # Force it to the top so it doesn't get truncated
                add_chart(rec)
        except Exception as e:
            logger.error(f"[USER-REQUEST] Failed to add custom chart: {e}")

    return charts

