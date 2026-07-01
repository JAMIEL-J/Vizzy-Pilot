"""Recommender - extracted from generators.py"""
from .prioritization import _should_average_metric, _metric_format_type, _infer_time_value_label, _trend_aggregation_for_metric, _prioritize_metrics
from .titles import _clean_title, _is_low_value_column, _beautify_column_name, _create_smart_title
from .sanitization import _safe_to_datetime, _sanitize_chart_data, _coerce_numeric_metric_series
from .query_helpers import _get_time_trend, _to_trend_point_key, _distribution_chart, _normalize_percentage_chart_values, _deduplicate_charts, _smart_aggregate
from .domain_ops import _generate_geo_charts
from .churn_analytics import _build_target_rate_chart

import json
import logging
import re
import statistics
from typing import Any, Dict, List, Optional, Set, Tuple

import pandas as pd

from app.services.analytics.column_filter import ColumnClassification, _clean_header, filter_columns
from app.services.analytics.domain_detector import DomainType, detect_domain
from app.services.analytics.section_registry import assign_section
from app.services.role_taxonomy import ROLE_TAXONOMY

from .aggregators import _safe_groupby_mean, _safe_groupby_sum
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
from .churn_charts import _generate_churn_charts
from .domain_commercial import (
    _generate_ecommerce_charts,
    _generate_finance_charts,
    _generate_marketing_charts,
    _generate_sales_charts,
)
from .domain_ops import (
    _generate_customer_support_charts,
    _generate_cybersecurity_charts,
    _generate_generic_charts,
    _generate_geo_charts,
    _generate_it_operations_charts,
    _generate_logistics_charts,
    _generate_real_estate_charts,
)
from .domain_workforce import (
    _generate_education_charts,
    _generate_healthcare_charts,
    _generate_hr_charts,
    _infer_hr_metric_context,
)
from .geo import _detect_map_type
from .models import AggregationData, ChartRecommendation
from .prioritization import (
    _get_metric_prefix,
    _infer_time_value_label,
    _metric_format_type,
    _prioritize_metrics,
    _should_average_metric,
    _trend_aggregation_for_metric,
)
from .query_helpers import (
    _deduplicate_charts,
    _distribution_chart,
    _get_scatter_data,
    _get_target_by_segment,
    _get_target_distribution,
    _get_time_trend,
    _get_yoy_comparison,
    _get_ytd_comparison,
    _normalize_percentage_chart_values,
    _smart_aggregate,
    _to_trend_point_key,
)
from .sanitization import (
    _POISON_STRINGS,
    _coerce_numeric_metric_series,
    _is_poison_value,
    _safe_float,
    _safe_to_datetime,
    _sanitize_chart_data,
)
from .titles import (
    _beautify_column_name,
    _clean_title,
    _create_smart_title,
    _format_categorical_value,
    _is_low_value_column,
)

logger = logging.getLogger(__name__)

class ChartConfig:
    """Configuration for a chart to be executed by the hybrid engine."""
    chart_id: str
    chart_type: str  # line, bar, gauge, kpi, etc.
    x_col: Optional[str] = None
    y_col: Optional[str] = None
    execution_slot: str = "duckdb"  # "duckdb" or "pandas"
    title: str = ""
    aggregation: str = "sum"  # "sum", "mean", "count"
    numerator_col: Optional[str] = None  # For pandas ratio_pct
    denominator_col: Optional[str] = None # For pandas ratio_pct

def generate_chart_configs(semantic_map: Any) -> List[ChartConfig]:
    """
    Pure function. Takes approved semantic_map_json (string or dict).
    Returns list of ChartConfig objects with execution_slot assigned.
    No LLM calls inside this function ever.
    """
    configs = []
    
    # 1. Parse if it's a JSON string
    if isinstance(semantic_map, str):
        try:
            semantic_map = json.loads(semantic_map)
        except json.JSONDecodeError:
            return []

    # 2. Normalize to a list of mapping dicts
    if isinstance(semantic_map, dict):
        # If it's a role->column map: {"revenue": "Tot_Rev"}
        # We need to resolve the role's affinity/slot from ROLE_TAXONOMY
        mappings = []
        for role, col in semantic_map.items():
            role_info = ROLE_TAXONOMY.get(role, {"affinity": "none", "execution_slot": None})
            mappings.append({
                "column": col,
                "role": role,
                "affinity": role_info["affinity"],
                "execution_slot": role_info["execution_slot"]
            })
    elif isinstance(semantic_map, list):
        mappings = semantic_map
    else:
        return []
    
    date_cols = [m for m in mappings if m.get("role") in ("date", "datetime", "year_month") or m.get("affinity") == "time_series_x"]
    measure_cols = [m for m in mappings if m.get("affinity") == "measure_y"]
    category_cols = [m for m in mappings if m.get("affinity") == "groupby_x"]
    ratio_cols = [m for m in mappings if m.get("role") == "ratio_pct"]

    
    # Rule 1: Time series — date × measure (cap 3)
    if date_cols:
        primary_date = date_cols[0]["column"]
        for measure in measure_cols[:3]:
            chart_id = f"chart_{measure['column']}_{primary_date}_trend"
            configs.append(ChartConfig(
                chart_id=chart_id,
                chart_type="line",
                x_col=primary_date,
                y_col=measure["column"],
                execution_slot=measure.get("execution_slot", "duckdb"),
                title=f"{measure['column']} over time"
            ))
    
    # Rule 2: Bar charts — category × measure (1 per category col)
    for cat in category_cols[:2]:
        for measure in measure_cols[:2]:
            chart_id = f"chart_{measure['column']}_{cat['column']}_bar"
            configs.append(ChartConfig(
                chart_id=chart_id,
                chart_type="bar",
                x_col=cat["column"],
                y_col=measure["column"],
                execution_slot="duckdb",
                title=f"{measure['column']} by {cat['column']}"
            ))
    
    # Rule 3: Gauge charts — ratio_pct columns
    for ratio in ratio_cols:
        chart_id = f"chart_{ratio['column']}_gauge"
        configs.append(ChartConfig(
            chart_id=chart_id,
            chart_type="gauge",
            y_col=ratio["column"],
            execution_slot="pandas",  # always pandas for derived ratios
            title=ratio["column"]
        ))
    
    # Rule 4: KPI cards — count/score with no pairing
    for measure in measure_cols:
        if measure.get("role") in ("count", "score"):
            chart_id = f"chart_{measure['column']}_kpi"
            configs.append(ChartConfig(
                chart_id=chart_id,
                chart_type="kpi",
                y_col=measure["column"],
                execution_slot="duckdb",
                title=f"Total {measure['column']}"
            ))
            
    return configs

    def __post_init__(self):
        if isinstance(self.data, AggregationData) and self.data.outliers:
            self.outliers = self.data.outliers
            self.data_without_outliers = self.data.data_without_outliers


def _generate_templated_charts(df: pd.DataFrame, classification: ColumnClassification) -> List[ChartRecommendation]:
    """
    Phase 3: Universal Key Router.
    Generates high-value charts based on canonical key combinations.
    """
    charts = []
    maps = classification.mappings
    mods = classification.modifiers
    
    # --- 1. UNCERTAINTY VIEW (Metric + Bounds) ---
    for canonical_key, col in maps.items():
        if not canonical_key.startswith('metric_'):
            continue
            
        low_bound = None
        high_bound = None
        for c, m in mods.items():
            if 'low_bound' in m and _clean_header(c) in _clean_header(col):
                low_bound = c
            if 'high_bound' in m and _clean_header(c) in _clean_header(col):
                high_bound = c
        
        if low_bound and high_bound and maps.get('dim_date'):
            date_col = maps['dim_date']
            data = []
            try:
                df_temp = df.copy()
                df_temp[date_col] = _safe_to_datetime(df_temp[date_col])
                df_temp = df_temp.dropna(subset=[date_col, col, low_bound, high_bound])
                df_temp = df_temp.sort_values(date_col)
                grouped = df_temp.groupby(pd.Grouper(key=date_col, freq='D')).mean().tail(30)
                for k, v in grouped.iterrows():
                    data.append({
                        "date": str(k.date()),
                        "value": round(float(v[col]), 2),
                        "low": round(float(v[low_bound]), 2),
                        "high": round(float(v[high_bound]), 2)
                    })
            except: pass
            
            if data:
                charts.append(ChartRecommendation(
                    slot='', title=f"{_beautify_column_name(col)} with Prediction Intervals",
                    chart_type="area_bounds", data=data, confidence="HIGH",
                    reason="Phase 5: DA-Grade Uncertainty analysis",
                    format_type="percentage" if _should_average_metric(col) else None,
                    dimension=date_col, metric=col, aggregation="mean"
                ))

    # --- 2. TEMPORAL TREND ---
    date_col = maps.get('dim_date')
    # Guard: Only generate trend charts if dim_date is a TRUE temporal column.
    # Prevents lifecycle metrics (tenure, age, duration) from being misused as time axes.
    if date_col:
        _non_temporal_keywords = (
            'tenure', 'age', 'duration', 'months', 'years', 'days', 'experience',
            'vintage', 'seniority', 'totalworkingyears', 'yearsatcompany', 'accountage',
        )
        date_col_clean = date_col.lower().replace('_', '').replace('-', '').replace(' ', '')
        is_true_date = not any(kw in date_col_clean for kw in _non_temporal_keywords)
        if not is_true_date:
            logger.debug('[TEMPLATE GUARD] Skipping trend: dim_date=%r looks like a lifecycle metric', date_col)
            date_col = None

    if date_col:
        # Only trend metrics that represent meaningful time-series values,
        # not lifecycle/tenure columns that produce flat/misleading trend lines.
        metrics = [v for k, v in maps.items() if k.startswith('metric_')][:2]
        trend_eligible = []
        for m in metrics:
            m_clean = m.lower().replace('_', '').replace('-', '').replace(' ', '')
            if any(kw in m_clean for kw in _non_temporal_keywords):
                logger.debug('[TEMPLATE GUARD] Skipping trend metric %r (lifecycle/tenure)', m)
                continue
            trend_eligible.append(m)

        for metric in trend_eligible:
            if any(metric == c.metric and c.chart_type == "area_bounds" for c in charts): continue
            data = _get_time_trend(
                df,
                date_col,
                metric,
                aggregation=_trend_aggregation_for_metric(metric),
            )
            if data:
                charts.append(ChartRecommendation(
                    slot='', title=_create_smart_title(metric, date_col),
                    chart_type="line", data=data, confidence="HIGH",
                    reason="Phase 5: Time-series pattern recognition",
                    format_type="percentage" if _should_average_metric(metric) else None,
                    dimension=date_col, metric=metric, aggregation="sum" if not _should_average_metric(metric) else "mean"
                ))

    # --- 3. ENTITY PERFORMANCE (e.g., Average Revenue by Product) ---
    entity_col = maps.get('attr_product') or maps.get('attr_category') or maps.get('attr_diagnosis') or (classification.dimensions[0] if classification.dimensions else None)
    primary_metric = maps.get('metric_revenue') or maps.get('metric_spend') or (classification.metrics[0] if classification.metrics else None)
    if entity_col and primary_metric:
        agg = "mean" if _should_average_metric(primary_metric) else "sum"
        data = _smart_aggregate(df, entity_col, primary_metric, limit=10)
        if data:
            charts.append(ChartRecommendation(
                slot='', title=_create_smart_title(primary_metric, entity_col),
                chart_type="hbar", data=data, confidence="HIGH",
                reason="Phase 5: Top-performer segmentation",
                format_type="currency" if "revenue" in primary_metric.lower() or "profit" in primary_metric.lower() else None,
                dimension=entity_col, metric=primary_metric, aggregation=agg
            ))

    # --- 4. GEOGRAPHIC HEATMAP ---
    geo_col = maps.get('dim_region') or maps.get('dim_country')
    if geo_col and primary_metric:
        agg = "mean" if _should_average_metric(primary_metric) else "sum"
        data = _smart_aggregate(df, geo_col, primary_metric, limit=20)
        if data:
            map_type = _detect_map_type([str(d['name']) for d in data])
            if map_type:
                charts.append(ChartRecommendation(
                    slot='', title=_create_smart_title(primary_metric, geo_col) + " Map",
                    chart_type="geo_map", data=data, confidence="HIGH",
                    reason="Phase 5: Spatial distribution analysis",
                    geo_meta={"map_type": map_type, "column": geo_col},
                    format_type="currency" if "revenue" in primary_metric.lower() else None,
                    dimension=geo_col, metric=primary_metric, aggregation=agg
                ))

    return charts

# =============================================================================
# Exhaustive Column Coverage
# =============================================================================

def _generate_all_columns_charts(
    df: pd.DataFrame,
    classification: ColumnClassification,
    curated_titles: Optional[Set[str]] = None,
    curated_pairs: Optional[Set[Tuple[str, str]]] = None,
    column_profiles: Optional[Dict[str, Any]] = None,
) -> List[ChartRecommendation]:
    """
    Generate meaningful column-coverage charts for EVERY column in the dataset.
    
    Unlike the original naive approach (one raw distribution per column), this
    builds SMART PAIRINGS: each column is shown in the context of its best
    analytical partner, producing actual business-intelligence charts.
    
    Strategy:
      - Metrics   → bar/hbar aggregated by the best available dimension
                     (e.g. "MonthlyCharges by Contract Type")
      - Dimensions → paired with a metric (e.g. "Avg MonthlyCharges by Region")
      - Dates     → trend line paired with a metric (e.g. "Revenue Over Time")
      - Last resort → meaningful percentile-tier bins (never raw numeric ranges)
      
    Deduplication (no repeated charts across tabs):
      *curated_titles* — set of chart titles from the Key Insights tab.
      When a metric×dimension pair already exists in curated charts,
      the function automatically picks a **different** dimension for
      the All Columns variant. The (2)/(3) suffix is never used for
      partial-duplicate titles — only for truly identical titles
      within All Columns.
      
    Coverage guarantee: every non-trivial column participates in at least 1 chart.
    6 charts per page via frontend pagination keeps scroll under control.
    """
    charts: List[ChartRecommendation] = []
    seen_titles: Set[str] = set()
    if curated_titles is None:
        curated_titles = set()
    if curated_pairs is None:
        curated_pairs = set()
    # Normalise to lowercase for case-insensitive matching
    curated_pairs_norm: Set[Tuple[str, str]] = {(m.lower(), d.lower()) for m, d in curated_pairs}

    def _unique_title(base: str, max_attempts: int = 20) -> str:
        base = _clean_title(base)
        if base not in seen_titles and base not in curated_titles:
            seen_titles.add(base)
            return base
        for i in range(2, max_attempts + 1):
            candidate = f"{base} ({i})"
            if candidate not in seen_titles and candidate not in curated_titles:
                seen_titles.add(candidate)
                return candidate
        return base

    # --------------------------------------------------------------------------
    #  HELPERS — meaningful / tiered bins (never raw number ranges)
    # --------------------------------------------------------------------------
    def _build_tier_chart(column: str, n_tiers: int = 5) -> Optional[ChartRecommendation]:
        """Create a chart using percentile-based tier bins with descriptive labels.
        
        Tier labels describe the segment (e.g. "Low", "Medium", "High")
        so the chart communicates *which* tier customers fall into, not
        a meaningless numeric range.
        """
        vals = df[column].dropna()
        if len(vals) < 6:
            return None
        # Tier labels — concise, business-meaningful
        tier_labels_map = {
            2: ["Low", "High"],
            3: ["Low", "Medium", "High"],
            4: ["Low", "Medium-Low", "Medium-High", "High"],
            5: ["Very Low", "Low", "Medium", "High", "Very High"],
        }
        labels = tier_labels_map.get(n_tiers, [f"Tier {i+1}" for i in range(n_tiers)])
        try:
            vals_clean = vals.reset_index(drop=True)
            # Use qcut for equal-frequency tiers
            cats = pd.qcut(vals_clean, q=len(labels), labels=labels, duplicates='drop')
            count_data = cats.value_counts().reset_index()
            count_data.columns = ['tier', 'count']
            tier_data = [{"name": str(r['tier']), "value": int(r['count'])} for _, r in count_data.iterrows()]
        except Exception:
            # If qcut fails (e.g. too many duplicates), use cut with equal-width tiers
            try:
                bins = pd.cut(vals_clean, bins=len(labels), labels=labels)
                count_data = bins.value_counts().reset_index()
                count_data.columns = ['tier', 'count']
                tier_data = [{"name": str(r['tier']), "value": int(r['count'])} for _, r in count_data.iterrows()]
            except Exception:
                return None

        fmt = _metric_format_type(column) or 'number'
        return ChartRecommendation(
            slot='',
            title=_unique_title(f"{_beautify_column_name(column)} Tier Distribution"),
            chart_type='hbar',
            data=tier_data,
            confidence='LOW',
            reason=f'Full coverage: {_beautify_column_name(column)} value tiers',
            dimension=column,
            metric=column,
            aggregation='count',
            format_type=fmt,
        )

    def _make_pairing_chart(
        dim: str,
        metric: str,
        used_dims: set,
        used_metrics: set,
    ) -> Optional[ChartRecommendation]:
        """Build a metric×dimension bar/hbar chart and register both columns."""
        if _should_average_metric(metric):
            data = _safe_groupby_mean(df, dim, metric, limit=10)
            agg = 'mean'
            prefix = 'Avg'
        else:
            data = _safe_groupby_sum(df, dim, metric, limit=10)
            agg = 'sum'
            prefix = 'Total'
        if not data:
            return None
        fmt = _metric_format_type(metric) or 'number'
        nunique = df[dim].nunique()
        title = _unique_title(f"{prefix} {_beautify_column_name(metric)} by {_beautify_column_name(dim)}")
        rec = ChartRecommendation(
            slot='', title=title,
            chart_type='hbar' if nunique > 5 else 'bar',
            data=data, confidence='MEDIUM',
            reason=f'Full coverage: {_beautify_column_name(metric)} across {_beautify_column_name(dim)}',
            dimension=dim, metric=metric, aggregation=agg,
            format_type=fmt,
        )
        used_dims.add(dim)
        used_metrics.add(metric)
        return rec

    # ------------------------------------------------------------------
    # 1.  BUILD CLEAN COLUMN POOLS
    # ------------------------------------------------------------------
    dims_all = [c for c in (classification.dimensions or []) if c in df.columns and not _is_low_value_column(c)]
    
    # Filter out demographic/ID columns that are numeric but act as dimensions (e.g., Age)
    raw_metrics = [c for c in (classification.metrics or []) if c in df.columns and not _is_low_value_column(c)]
    metrics_all = []
    for m in raw_metrics:
        m_lower = m.lower()
        if m_lower == 'age' or m_lower.endswith('_age') or m_lower.endswith(' age'):
            # Force into extra_cols so it acts as a dimension
            pass
        elif 'year' in m_lower or 'zip' in m_lower or 'id' in m_lower:
            pass
        else:
            metrics_all.append(m)
            
    dates_all = [c for c in (classification.dates or []) if c in df.columns and not _is_low_value_column(c)]

    # Also grab any column present in df that is numeric or has low-enough cardinality
    extra_cols = []
    for col in df.columns:
        if col not in dims_all and col not in metrics_all and col not in dates_all:
            if classification.excluded and col in classification.excluded:
                continue
            if not _is_low_value_column(col):
                extra_cols.append(col)

    # Prioritise metrics by BI importance
    pm = _prioritize_metrics(metrics_all)

    # ------------------------------------------------------------------
    # 2.  HELPERS: find best dimension / metric partners
    # ------------------------------------------------------------------
    def _best_dim_for_metric(
        metric: str,
        used_dims: set,
        strict: bool = True,
        allow_used: bool = False,
        forbidden_pairs: Optional[Set[Tuple[str, str]]] = None,
    ) -> Optional[str]:
        """Pick the dimension that best complements *metric*.
        
        *strict* (default True):
            cardinality 3-30, prefer 5-12.
        *strict=False*:
            cardinality 2-200, equal scoring — catches edge cases
            where no dimension fits the strict criteria.
        *allow_used*:
            also consider dimensions already used in previous pairings.
        *forbidden_pairs*:
            (metric, dimension) pairs that already exist in the curated
            Key Insights tab — skip these to avoid exact duplicates.
        """
        if forbidden_pairs is None:
            forbidden_pairs = set()
        best = None
        best_score = -1
        for d in dims_all:
            if not allow_used and d in used_dims:
                continue
            if d == metric:
                continue
            # Skip if this exact (metric, dim) pair already exists in Key Insights
            if (metric.lower(), d.lower()) in forbidden_pairs:
                continue
            try:
                n = df[d].nunique()
            except Exception:
                continue
            if strict:
                if n < 3 or n > 30:
                    continue
                score = 10 if 5 <= n <= 12 else (8 if 3 <= n <= 5 else 5)
            else:
                adaptive_limit = 200
                if column_profiles and d in column_profiles:
                    total_rows = column_profiles[d].get("unique_count", 0) / (column_profiles[d].get("cardinality", 1.0) or 1.0)
                    adaptive_limit = max(200, int(total_rows * 0.05))
                if n < 2 or n > adaptive_limit:
                    continue
                score = 6 if 2 <= n <= 5 else (8 if 5 < n <= 15 else (5 if 15 < n <= 50 else 3))
            if score > best_score:
                best_score = score
                best = d
        return best

    def _best_metric_for_dim(
        dim: str,
        used_metrics: set,
        allow_reuse: bool = False,
        forbidden_pairs: Optional[Set[Tuple[str, str]]] = None,
    ) -> Optional[str]:
        """Pick the highest-priority metric for *dim*.
        
        When *allow_reuse* is True, metrics already used in earlier pairings
        can still be used — charts focus on different primary columns,
        so metric reuse across charts is fine.
        """
        if forbidden_pairs is None:
            forbidden_pairs = set()
        pool = pm + [m for m in metrics_all if m not in pm]
        for m in pool:
            if m == dim:
                continue
            if (m.lower(), dim.lower()) in forbidden_pairs:
                continue
            if allow_reuse or m not in used_metrics:
                if m in df.columns and pd.api.types.is_numeric_dtype(df[m]):
                    return m
        # Ultimate fallback: any numeric column
        for m in df.columns:
            if m != dim and pd.api.types.is_numeric_dtype(df[m]):
                if (m.lower(), dim.lower()) not in forbidden_pairs:
                    return m
        return None

    # ------------------------------------------------------------------
    #   PHASE 0 — Full Combinations of Primary Metrics and Dimensions
    # ------------------------------------------------------------------
    # Ensure no pairing is missed between numeric and category columns
    used_dims_global: set = set()
    used_metrics_global: set = set()
    paired_dims: set = set()       # dimensions already paired with SOME metric in A

    for metric in pm:
        for dim in dims_all:
            if len(charts) >= 40:
                break
            if metric == dim:
                continue
            if (metric.lower(), dim.lower()) in curated_pairs_norm:
                continue
            
            try:
                nunique = df[dim].nunique()
            except Exception:
                continue
                
            adaptive_limit = 200
            if column_profiles and dim in column_profiles:
                total_rows = column_profiles[dim].get("unique_count", 0) / (column_profiles[dim].get("cardinality", 1.0) or 1.0)
                adaptive_limit = max(200, int(total_rows * 0.05))
            if nunique < 2 or nunique > adaptive_limit:
                continue
                
            rec = _make_pairing_chart(dim, metric, used_dims_global, used_metrics_global)
            if rec is not None:
                charts.append(rec)
                paired_dims.add(dim)

    # ------------------------------------------------------------------
    #   PHASE A — Pair each metric with its best dimension
    # ------------------------------------------------------------------    
    for metric in pm:
        if metric in used_metrics_global:
            continue

        # Try up to 3 strategies to find a dimension partner,
        # always avoiding (metric, dim) pairs already in Key Insights.
        for strategy in [
            (True,  False),   # 1: strict + fresh dims
            (False, False),   # 2: relaxed + fresh dims
            (False, True),    # 3: relaxed + ANY dim (even already paired)
        ]:
            dim = _best_dim_for_metric(metric, used_dims_global,
                                        strict=strategy[0],
                                        allow_used=strategy[1],
                                        forbidden_pairs=curated_pairs_norm)
            if dim is not None:
                break

        if dim is not None:
            rec = _make_pairing_chart(dim, metric, used_dims_global, used_metrics_global)
            if rec is not None:
                charts.append(rec)
                paired_dims.add(dim)
                continue

        # Absolute last resort — meaningful tier bins
        tier = _build_tier_chart(metric)
        if tier is not None:
            charts.append(tier)
            used_metrics_global.add(metric)

    # ------------------------------------------------------------------
    #   PHASE B — Cover remaining dimensions with a metric pairing
    # ------------------------------------------------------------------
    for dim in dims_all:
        if dim in used_dims_global:
            continue
        try:
            nunique = df[dim].nunique()
        except Exception:
            continue
        adaptive_limit = 200
        if column_profiles and dim in column_profiles:
            total_rows = column_profiles[dim].get("unique_count", 0) / (column_profiles[dim].get("cardinality", 1.0) or 1.0)
            adaptive_limit = max(200, int(total_rows * 0.05))
        if nunique < 2 or nunique > adaptive_limit:
            continue

        metric = _best_metric_for_dim(dim, used_metrics_global, allow_reuse=True, forbidden_pairs=curated_pairs_norm)
        if metric is not None:
            rec = _make_pairing_chart(dim, metric, used_dims_global, used_metrics_global)
            if rec is not None:
                charts.append(rec)
                continue

        # Fallback: try pairing with first available metric (direct call, no pre-check)
        fallback_metric = next((m for m in pm if m != dim), None) or next(
            (m for m in metrics_all if m != dim), None
        )
        if fallback_metric is not None:
            rec = _make_pairing_chart(dim, fallback_metric, used_dims_global, used_metrics_global)
            if rec is not None:
                charts.append(rec)
                continue

        # No metric found at all — distribution
        rec = _distribution_chart(
            df, dim,
            title=_unique_title(f"{_beautify_column_name(dim)} Distribution"),
            confidence='MEDIUM' if nunique <= 20 else 'LOW',
            reason=f'Full coverage: distribution of {_beautify_column_name(dim)}',
            value_label='Records',
        )
        if rec:
            charts.append(rec)
            used_dims_global.add(dim)

    # ------------------------------------------------------------------
    #   PHASE C — Cover remaining metrics (unpaired)
    # ------------------------------------------------------------------
    for metric in metrics_all:
        if metric in used_metrics_global:
            continue
        # Try tier distribution first (more meaningful than total KPI)
        tier = _build_tier_chart(metric)
        if tier is not None:
            charts.append(tier)
            used_metrics_global.add(metric)
            continue

        # Then simple total KPI
        if pd.api.types.is_numeric_dtype(df[metric]):
            try:
                total_val = pd.to_numeric(df[metric], errors='coerce').sum()
                if pd.notna(total_val) and total_val != 0:
                    fmt = _metric_format_type(metric) or 'number'
                    title = _unique_title(f"Total {_beautify_column_name(metric)}")
                    charts.append(ChartRecommendation(
                        slot='', title=title, chart_type='kpi',
                        data=[{"name": _beautify_column_name(metric), "value": round(float(total_val), 2)}],
                        confidence='LOW',
                        reason=f'Full coverage: total {_beautify_column_name(metric)}',
                        metric=metric, aggregation='sum',
                        format_type=fmt,
                    ))
                    used_metrics_global.add(metric)
                    continue
            except Exception:
                pass
        # On truly nothing: distribution
        rec = _distribution_chart(
            df, metric,
            title=_unique_title(f"{_beautify_column_name(metric)} Distribution"),
            confidence='LOW',
            reason=f'Full coverage: distribution of {_beautify_column_name(metric)}',
            value_label='Records',
        )
        if rec:
            charts.append(rec)
            used_metrics_global.add(metric)

    # ------------------------------------------------------------------
    #   PHASE D — Cover date columns (trend with best metric)
    #   IMPORTANT: Only generate ONE trend per metric (not per date column)
    #   to avoid "Revenue Over Time" duplicates on different date columns.
    # ------------------------------------------------------------------
    used_trends: Set[str] = set()  # Track metrics already used in trend charts
    
    for date_col in dates_all:
        if date_col in used_dims_global:
            continue
        
        # Try to pair with the best metric available (allow reuse)
        # BUT skip if this metric already has a trend chart
        metric = _best_metric_for_dim(date_col, used_metrics_global, allow_reuse=True, forbidden_pairs=curated_pairs_norm)
        if metric is not None and metric not in used_trends:
            trend_data = _get_time_trend(df, date_col, metric, aggregation=_trend_aggregation_for_metric(metric))
            if trend_data:
                fmt = _metric_format_type(metric) or 'number'
                title = _unique_title(f"{_beautify_column_name(metric)} Over Time")
                charts.append(ChartRecommendation(
                    slot='', title=title, chart_type='line',
                    data=trend_data, confidence='MEDIUM',
                    reason=f'Full coverage: {_beautify_column_name(metric)} trend over time',
                    dimension=date_col, metric=metric,
                    aggregation=_trend_aggregation_for_metric(metric),
                    format_type=fmt,
                ))
                used_trends.add(metric)  # Mark this metric as having a trend chart
                used_metrics_global.add(metric)
                continue
        
        # Fallback: record count trend
        try:
            df_temp = df.copy()
            df_temp[date_col] = _safe_to_datetime(df_temp[date_col])
            df_temp = df_temp.dropna(subset=[date_col])
            trend = df_temp.groupby(pd.Grouper(key=date_col, freq='MS')).size()
            trend_data = []
            for k, v in trend.items():
                ts_label, ts_date = _to_trend_point_key(k)
                if ts_label is None: continue
                trend_data.append({"timestamp": ts_label, "date": ts_date, "value": int(v)})
            if trend_data:
                title = _unique_title(f"Records Over Time")
                charts.append(ChartRecommendation(
                    slot='', title=title, chart_type='line',
                    data=trend_data, confidence='LOW',
                    reason=f'Full coverage: record count over time',
                    dimension=date_col, value_label='Records', aggregation='count',
                ))
        except Exception:
            pass

    # ------------------------------------------------------------------
    #   PHASE E — Cover extra / unclassified columns
    # ------------------------------------------------------------------
    for col in extra_cols:
        if col in used_dims_global or col in used_metrics_global:
            continue
        try:
            n = df[col].nunique()
        except Exception:
            continue
        if n < 2 or n > 100:
            continue
        
        rec = _distribution_chart(
            df, col,
            title=_unique_title(f"{_beautify_column_name(col)} Distribution"),
            confidence='LOW',
            reason=f'Full coverage: distribution of {_beautify_column_name(col)}',
            value_label='Records',
        )
        if rec:
            charts.append(rec)

    return charts


def recommend_charts(df: pd.DataFrame, domain: DomainType, classification: ColumnClassification, overrides: Optional[Dict[str, Any]] = None, all_columns: bool = False, column_profiles: Optional[Dict[str, Dict[str, Any]]] = None) -> Dict[str, Any]:
    """
    Recommend charts based on domain and data classification.
    
    When `column_profiles` is provided (from profile_dataset_duckdb()), its
    DuckDB-accurate cardinality values are used to refine the classification:
    dimensions with very high full-dataset cardinality are excluded (they would
    produce unusably wide charts), and low-cardinality numeric columns are
    promoted to dimensions.
    
    Returns dict of charts for API response.
    """
    if overrides is None:
        overrides = {}
        
    # Apply manual domain override if provided
    if overrides and "selected_domain" in overrides:
        sd = overrides["selected_domain"]
        if sd and sd.lower() != 'auto':
            try:
                domain = DomainType(sd.lower())
                # If domain changed, we must re-classify
                classification = filter_columns(df, domain)
            except ValueError:
                logger.warning(f"Invalid domain override '{sd}', using detected: {domain}")
    elif domain is None:
        domain, _ = detect_domain(df)
        classification = classification or filter_columns(df, domain)
    elif classification is None:
        classification = filter_columns(df, domain)

    # ── P1 Fix: Refine classification with DuckDB-accurate cardinality ──
    if column_profiles:
        new_dims = list(classification.dimensions)
        new_metrics = list(classification.metrics)
        new_excluded = list(classification.excluded)

        for col, profile in column_profiles.items():
            card = profile.get("cardinality", 0)
            if col in new_dims and card > 0.3:
                # High cardinality dimension -> would produce unusably wide charts
                new_dims.remove(col)
                if col not in new_excluded:
                    new_excluded.append(col)
                logger.debug("P1: Moved high-cardinality col '%s' (card=%.3f) from dims to excluded", col, card)
            elif col in new_metrics and card < 0.02 and card > 0:
                # Very low cardinality numeric -> actually a categorical dimension
                new_metrics.remove(col)
                if col not in new_dims:
                    new_dims.append(col)
                logger.debug("P1: Moved low-cardinality col '%s' (card=%.3f) from metrics to dims", col, card)

        classification = ColumnClassification(
            metrics=new_metrics,
            dimensions=new_dims,
            targets=classification.targets,
            dates=classification.dates,
            excluded=new_excluded,
            mappings=classification.mappings,
        )

    # PRE-FILTER & NORMALIZATION
    # Ensure numeric columns in string format are normalized
    # Drop NaN/NaT residues after coercion to prevent poison data in charts
    # ========================================
    df = df.copy()
    for col in classification.metrics:
        if col in df.columns:
            df[col] = _coerce_numeric_metric_series(df[col])
    
    for col in classification.dates:
        if col in df.columns:
            df[col] = _safe_to_datetime(df[col])

    # Replace string 'nan'/'NaT'/'None' in dimension columns with actual NaN
    # so that pandas dropna() in helpers can catch them
    for col in classification.dimensions:
        if col in df.columns and df[col].dtype == 'object':
            mask = df[col].astype(str).str.strip().str.lower().isin(_POISON_STRINGS)
            if mask.any():
                df.loc[mask, col] = pd.NA

    filtered_metrics = [m for m in classification.metrics if not _is_low_value_column(m)]
    filtered_dimensions = [d for d in classification.dimensions if not _is_low_value_column(d)]
    
    # Create filtered classification (preserve original for reference)
    from .. import section_registry
    from ..section_registry import assign_section
    filtered_classification = ColumnClassification(
        metrics=filtered_metrics or classification.metrics[:3],  # Fallback to first 3 if all filtered
        dimensions=filtered_dimensions or classification.dimensions[:3],
        targets=classification.targets,
        dates=classification.dates,
        excluded=classification.excluded,
        mappings=classification.mappings
    )
    
    generators = {
        DomainType.SALES: _generate_sales_charts,
        DomainType.CHURN: _generate_churn_charts,
        DomainType.MARKETING: _generate_marketing_charts,
        DomainType.FINANCE: _generate_finance_charts,
        DomainType.HEALTHCARE: _generate_healthcare_charts,
        DomainType.HR: _generate_hr_charts,
        DomainType.LOGISTICS: _generate_logistics_charts,
        DomainType.EDUCATION: _generate_education_charts,
        DomainType.ECOMMERCE: _generate_ecommerce_charts,
        DomainType.REAL_ESTATE: _generate_real_estate_charts,
        DomainType.CUSTOMER_SUPPORT: _generate_customer_support_charts,
        DomainType.IT_OPERATIONS: _generate_it_operations_charts,
        DomainType.CYBERSECURITY: _generate_cybersecurity_charts,
        DomainType.GENERIC: _generate_generic_charts,
    }
    
    generator = generators.get(domain, _generate_generic_charts)
    charts = generator(df, filtered_classification)
    
    # ========================================
    # PHASE 3: Analytical Templates (Deterministic)
    # These override generic heuristics with high-value business patterns
    # ========================================
    template_charts = _generate_templated_charts(df, classification)
    geo_charts = _generate_geo_charts(df, classification)
    
    # ── Orchestrate Chart Priority ──
    # Priority: 1. Geo (if hero) 2. Templates 3. Domain-Specific 4. Generic
    charts = template_charts + charts
    
    if geo_charts:
        charts = geo_charts + charts
    
    # ========================================
    # POST-FILTER: Deduplicate similar charts
    # Prevents repetitive charts with same dimension
    # ========================================
    charts = _deduplicate_charts(charts)

    # ========================================
    # EXHAUSTIVE TARGET × CATEGORICAL PAIRING
    # Ensure every categorical dimension is paired with the target column.
    # Domain generators only cover ~6-8 key dimensions; this phase catches ALL.
    # ========================================
    target_col = classification.targets[0] if classification.targets else None
    if target_col and target_col in df.columns:
        # Collect dimensions already paired with target in existing charts
        already_paired_dims = set()
        for c in charts:
            if c.metric and c.dimension:
                # Chart pairs target with this dimension (target as metric)
                if c.metric.lower() == target_col.lower():
                    already_paired_dims.add(c.dimension.lower())
                # Chart pairs dimension with target (target as dimension)
                if c.dimension.lower() == target_col.lower():
                    already_paired_dims.add(c.metric.lower())

        # Build pool of ALL categorical columns (dims + low-cardinality extras)
        all_categoricals = []
        for col in classification.dimensions:
            if col in df.columns and col.lower() != target_col.lower():
                all_categoricals.append(col)
        # Also include low-cardinality numeric columns not in dims
        for col in df.columns:
            if col.lower() == target_col.lower():
                continue
            if col.lower() in [c.lower() for c in all_categoricals]:
                continue
            try:
                nuniq = df[col].nunique()
                if 2 <= nuniq <= 20 and col not in classification.metrics:
                    all_categoricals.append(col)
            except Exception:
                pass

        # Generate target-rate chart for every uncovered categorical
        existing_titles = {c.title.lower() for c in charts if c.title}
        for dim_col in all_categoricals:
            if dim_col.lower() in already_paired_dims:
                continue
            try:
                nuniq = df[dim_col].nunique()
                if nuniq < 2 or nuniq > 50:
                    continue
            except Exception:
                continue

            rec = _build_target_rate_chart(
                df, target_col, dim_col,
                title=f'{_beautify_column_name(target_col)} Rate by {_beautify_column_name(dim_col)} (%)',
                reason=f'Exhaustive coverage: {_beautify_column_name(target_col)} rate across {_beautify_column_name(dim_col)}',
            )
            if rec and rec.title.lower() not in existing_titles:
                existing_titles.add(rec.title.lower())
                charts.append(rec)

    # Filter out single-column distribution charts from Key Insights (unless it's the target column)
    key_insight_charts = []
    for chart in charts:
        is_single_col_dist = (
            chart.aggregation == "count"
            and chart.metric is None
            and chart.dimension
            and chart.chart_type in ("pie", "donut", "hbar", "bar")
            and (target_col is None or chart.dimension.lower() != target_col.lower())
        )
        if getattr(chart, 'is_domain_specific', False):
            is_single_col_dist = False
            
        if not is_single_col_dist:
            key_insight_charts.append(chart)
    charts = key_insight_charts

    # Assign sections based on registry
    for chart in charts:
        assignment = assign_section(
            chart_type=chart.chart_type,
            metric=chart.metric,
            dimension=chart.dimension,
            domain=domain.value,
            title=chart.title,
        )
        chart.section = assignment.section

    # ========================================
    # PHASE 4: Competitive Scoring (The "Expert" Choice)
    # Ranks charts by identifying which dimension creates the highest
    # mathematical spread (variance) in the target metric.
    # ========================================
    import statistics
    for chart in charts:
        try:
            # Keep complex visualizations and manually pinned charts pinned highly
            if getattr(chart, 'variance_score', 0) == float('inf') or chart.chart_type in ('scatter', 'area_bounds', 'line', 'map', 'geo_map'):
                chart.variance_score = float('inf')
                continue
            elif chart.data and isinstance(chart.data, list):
                # Calculate the standard deviation (spread) of the grouped values
                values = [float(d.get('value', 0)) for d in chart.data if 'value' in d and d.get('value') is not None]
                if len(values) > 1:
                    chart.variance_score = statistics.stdev(values)
                else:
                    chart.variance_score = 0
            else:
                chart.variance_score = 0
        except Exception:
            chart.variance_score = 0
            
    # Sort descending by variance to surface highest-impact insights
    charts.sort(key=lambda x: getattr(x, 'variance_score', 0), reverse=True)
    
    # No hard cap — all target×categorical pairings are included
    
    # ========================================
    # ALL COLUMNS MODE: exhaustive coverage
    # ========================================
    all_columns_result = {}
    if all_columns:
        curated_chart_titles = {c.title for c in charts if c.title}
        curated_pairs = {(c.metric, c.dimension) for c in charts if c.metric and c.dimension}
        all_col_charts = _generate_all_columns_charts(
            df, classification,
            curated_titles=curated_chart_titles,
            curated_pairs=curated_pairs,
            column_profiles=column_profiles,
        )
        all_col_charts = _deduplicate_charts(all_col_charts)
        for i, chart in enumerate(all_col_charts):
            slot = f"col_{i + 1}"
            sanitized_data = _sanitize_chart_data(chart.data)
            if not sanitized_data:
                continue
            
            format_type = getattr(chart, "format_type", None)
            if not format_type:
                title_lower = chart.title.lower()
                percentage_keywords = ["rate", "margin", "percent", "%", "ratio", "proportion"]
                if any(kw in title_lower for kw in percentage_keywords):
                    format_type = "percentage"
                elif any(kw in title_lower for kw in ['tenure', 'age', 'duration', 'months', 'years', 'days']):
                    format_type = "number"
                    if not getattr(chart, "value_label", None):
                        chart.value_label = _infer_time_value_label(title_lower, getattr(chart, "metric", None), getattr(chart, "dimension", None))

            all_columns_result[slot] = {
                "title": chart.title,
                "type": chart.chart_type,
                "data": sanitized_data,
                "confidence": chart.confidence,
                "reason": chart.reason,
                "section": "All Columns",
            }
            if chart.dimension:
                all_columns_result[slot]["dimension"] = chart.dimension
            if chart.metric:
                all_columns_result[slot]["metric"] = chart.metric
            if chart.aggregation:
                all_columns_result[slot]["aggregation"] = chart.aggregation
            if chart.value_label:
                all_columns_result[slot]["value_label"] = chart.value_label
            if format_type:
                all_columns_result[slot]["format_type"] = format_type
                if format_type == "percentage":
                    all_columns_result[slot]["data"] = _normalize_percentage_chart_values(all_columns_result[slot].get("data"))
            if getattr(chart, "outliers", None):
                all_columns_result[slot]["outliers"] = chart.outliers
                all_columns_result[slot]["data_without_outliers"] = _sanitize_chart_data(chart.data_without_outliers)
                if format_type == "percentage":
                    all_columns_result[slot]["data_without_outliers"] = _normalize_percentage_chart_values(all_columns_result[slot].get("data_without_outliers"))
    
    # Convert to dict format for API
    result = {}
    for i, chart in enumerate(charts):
        # Reassign slots after deduplication
        slot = f"slot_{i + 1}"
        
        # Apply Overrides
        slot_override = overrides.get(slot, {})
        if slot_override:
            # 1. Type Override
            if "type" in slot_override:
                chart.chart_type = slot_override["type"]
            
            # 2. Aggregation Override
            if "aggregation" in slot_override and chart.dimension and chart.metric:
                new_agg = slot_override["aggregation"]
                if new_agg != chart.aggregation:
                    if new_agg == "sum":
                        chart.data = _safe_groupby_sum(df, chart.dimension, chart.metric)
                        chart.aggregation = "sum"
                    elif new_agg == "mean":
                        chart.data = _safe_groupby_mean(df, chart.dimension, chart.metric)
                        chart.aggregation = "mean"
                    
                    # Refresh outlier detection for new aggregation
                    if isinstance(chart.data, AggregationData):
                        chart.outliers = chart.data.outliers
                        chart.data_without_outliers = chart.data.data_without_outliers

        # Smart unit detection
        format_type = getattr(chart, "format_type", None)
        title_lower = chart.title.lower()
        if not format_type:
            percentage_keywords = ["rate", "margin", "percent", "%", "ratio", "proportion"]
            if any(kw in title_lower for kw in percentage_keywords):
                format_type = "percentage"
            elif any(kw in title_lower for kw in ['tenure', 'age', 'duration', 'months', 'years', 'days']):
                format_type = "number"
                if not getattr(chart, "value_label", None):
                    chart.value_label = _infer_time_value_label(title_lower, getattr(chart, "metric", None), getattr(chart, "dimension", None))
        
        # Final safety net: sanitize all chart data before serialization
        sanitized_data = _sanitize_chart_data(chart.data)
        
        # Skip charts that have no data after sanitization
        if not sanitized_data:
            continue
        
        # Override title with beautified semantic roles if present
        title = chart.title
        if overrides:
            from ...role_taxonomy import ROLE_TAXONOMY
            valid_roles = set(ROLE_TAXONOMY.keys())
            for role, col in overrides.items():
                if role in valid_roles and isinstance(col, str) and role not in ('unclassified', 'generic', 'none'):
                    role_beautified = role.replace('_', ' ').replace('-', ' ').title()
                    col_beautified = _beautify_column_name(col)
                    import re
                    title = re.sub(re.escape(col_beautified), role_beautified, title, flags=re.IGNORECASE)
                    title = re.sub(re.escape(col), role_beautified, title, flags=re.IGNORECASE)

        result[slot] = {
            "title": title,
            "type": chart.chart_type,
            "data": sanitized_data,
            "confidence": chart.confidence,
            "reason": chart.reason,
            "is_percentage": format_type == "percentage",
            "section": getattr(chart, "section", "Other Insights"),
        }
        if chart.dimension:
            result[slot]["dimension"] = chart.dimension
        if chart.metric:
            result[slot]["metric"] = chart.metric
        if chart.categories:
            result[slot]["categories"] = chart.categories
        if chart.geo_meta:
            result[slot]["geo_meta"] = chart.geo_meta
        if format_type:
            result[slot]["format_type"] = format_type
            if format_type == "percentage":
                result[slot]["data"] = _normalize_percentage_chart_values(result[slot].get("data"))
                if "data_without_outliers" in result[slot]:
                    result[slot]["data_without_outliers"] = _normalize_percentage_chart_values(result[slot].get("data_without_outliers"))
        if getattr(chart, "value_label", None):
            result[slot]["value_label"] = chart.value_label
        if getattr(chart, "outliers", None):
            result[slot]["outliers"] = chart.outliers
            result[slot]["data_without_outliers"] = _sanitize_chart_data(chart.data_without_outliers)
        if chart.aggregation:
            result[slot]["aggregation"] = chart.aggregation
        if chart.granularity:
            result[slot]["granularity"] = chart.granularity
    
    if all_columns:
        return {
            "charts": result,
            "all_columns_charts": all_columns_result,
            "all_columns_count": len(all_columns_result),
        }
    return result
