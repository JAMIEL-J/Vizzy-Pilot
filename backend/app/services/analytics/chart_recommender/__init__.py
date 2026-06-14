"""
Chart Recommender Package - Smart chart selection based on data signals and domain.

Recommends optimal chart types for the dataset using BI dashboard best practices.
"""

from .models import AggregationData, ChartRecommendation
from .recommender import ChartConfig, generate_chart_configs, recommend_charts

# Lazy-import helpers consumed by analytics_routes and other services
from .aggregators import _safe_groupby_mean, _safe_groupby_sum, _safe_value_counts
from .churn_analytics import (
    _get_churn_count_by_segment,
    _get_churn_rate_by_segment,
    _get_churned_vs_retained_avg,
    _get_lifecycle_cohorts,
    _get_stacked_churn_counts,
    _get_value_at_risk,
)
from .prioritization import _infer_time_value_label
from .query_helpers import _distribution_chart, _get_scatter_data, _get_time_trend, _smart_aggregate
from .sanitization import _safe_to_datetime
from .titles import _beautify_column_name, _format_categorical_value

__all__ = [
    "AggregationData",
    "ChartConfig",
    "ChartRecommendation",
    "generate_chart_configs",
    "recommend_charts",
]
