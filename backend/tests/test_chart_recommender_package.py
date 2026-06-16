"""
Tests for the refactored chart_recommender package structure.

Verifies that the split from a single generators.py into 7 focused modules
still resolves all imports correctly and the public API works end-to-end.
"""

import importlib
import pkgutil
from typing import List, Set

import numpy as np
import pandas as pd
import pytest

from app.services.analytics.chart_recommender import (
    ChartConfig,
    ChartRecommendation,
    generate_chart_configs,
    recommend_charts,
)
from app.services.analytics.chart_recommender.recommender import (
    _generate_all_columns_charts,
    _generate_templated_charts,
)
from app.services.analytics.chart_recommender.query_helpers import (
    _deduplicate_charts,
    _distribution_chart,
    _get_scatter_data,
    _get_target_distribution,
    _get_target_by_segment,
    _get_time_trend,
    _normalize_percentage_chart_values,
    _smart_aggregate,
    _to_trend_point_key,
)
from app.services.analytics.chart_recommender.churn_analytics import (
    _build_target_rate_chart,
    _find_highest_variance_dim,
    _get_churn_rate_by_segment,
    _get_churned_vs_retained_avg,
    _get_churn_count_by_segment,
    _get_lifecycle_cohorts,
    _get_metric_cohort_analysis,
    _get_stacked_churn_counts,
    _get_value_at_risk,
)
from app.services.analytics.chart_recommender.churn_charts import _generate_churn_charts
from app.services.analytics.chart_recommender.domain_commercial import (
    _generate_ecommerce_charts,
    _generate_finance_charts,
    _generate_marketing_charts,
    _generate_sales_charts,
)
from app.services.analytics.chart_recommender.domain_workforce import (
    _generate_education_charts,
    _generate_healthcare_charts,
    _generate_hr_charts,
    _infer_hr_metric_context,
)
from app.services.analytics.chart_recommender.domain_ops import (
    _generate_customer_support_charts,
    _generate_cybersecurity_charts,
    _generate_generic_charts,
    _generate_geo_charts,
    _generate_it_operations_charts,
    _generate_logistics_charts,
    _generate_real_estate_charts,
)
from app.services.analytics.chart_recommender.sanitization import (
    _coerce_numeric_metric_series,
    _is_poison_value,
    _safe_float,
    _safe_to_datetime,
    _sanitize_chart_data,
)
from app.services.analytics.chart_recommender.titles import (
    _beautify_column_name,
    _create_smart_title,
    _format_categorical_value,
    _is_low_value_column,
    _pick_column_by_keywords,
    _smart_target_label,
)
from app.services.analytics.chart_recommender.prioritization import (
    _get_metric_prefix,
    _infer_time_value_label,
    _metric_format_type,
    _pick_at_risk_metric,
    _prioritize_dimensions,
    _prioritize_metrics,
    _round_mean_value,
    _should_average_metric,
    _trend_aggregation_for_metric,
)
from app.services.analytics.chart_recommender.aggregators import (
    _safe_groupby_mean,
    _safe_groupby_sum,
    _safe_value_counts,
)
from app.services.analytics.chart_recommender.geo import _detect_map_type
from app.services.analytics.chart_recommender.models import AggregationData


class TestPackageImports:
    """Every module in the package loads without errors."""

    def test_every_module_importable(self):
        """All 14 .py files in chart_recommender/ are importable."""
        import app.services.analytics.chart_recommender as pkg

        path = pkg.__path__
        names = [m.name for m in pkgutil.iter_modules(path)]
        # Exclude __init__
        expected = {
            "aggregators", "churn_analytics", "churn_charts",
            "domain_commercial", "domain_ops", "domain_workforce",
            "geo", "models", "prioritization",
            "query_helpers", "recommender", "sanitization", "titles",
        }
        for name in expected:
            mod = importlib.import_module(
                f"app.services.analytics.chart_recommender.{name}"
            )
            assert mod is not None

    def test_public_api_accessible(self):
        """The package __init__ exports the expected public API."""
        from app.services.analytics import chart_recommender as cr

        assert cr.ChartRecommendation is ChartRecommendation
        assert cr.ChartConfig is ChartConfig
        assert cr.generate_chart_configs is generate_chart_configs
        assert cr.recommend_charts is recommend_charts


class TestQueryHelpers:
    def test_smart_aggregate(self):
        df = pd.DataFrame({"g": ["a", "a", "b"], "v": [10, 20, 30]})
        result = _smart_aggregate(df, "g", "v")
        assert isinstance(result, list)
        assert len(result) == 2

    def test_deduplicate_charts(self):
        c1 = ChartRecommendation(slot="", title="A", chart_type="bar", data=[], confidence="HIGH", reason="r")
        c2 = ChartRecommendation(slot="", title="A", chart_type="bar", data=[], confidence="HIGH", reason="r")
        deduped = _deduplicate_charts([c1, c2])
        assert len(deduped) == 1

    def test_to_trend_point_key(self):
        k, d = _to_trend_point_key("2024-01-15")
        assert isinstance(k, str)
        assert isinstance(d, str)

    def test_normalize_percentage(self):
        data = [{"name": "a", "value": 0.25}]
        out = _normalize_percentage_chart_values(data)
        assert out[0]["value"] == 25.0

    def test_get_target_distribution(self):
        df = pd.DataFrame({"t": [0, 1, 1, 0, 1]})
        result = _get_target_distribution(df, "t")
        assert isinstance(result, list)
        assert len(result) > 0

    def test_distribution_chart(self):
        df = pd.DataFrame({"col": ["x", "y", "z", "x"]})
        chart = _distribution_chart(df, "col", "Test")
        assert chart is not None
        assert chart.chart_type in ("pie", "donut", "hbar")

    def test_get_target_by_segment(self):
        df = pd.DataFrame({"t": [0, 1, 0, 1], "s": ["a", "a", "b", "b"]})
        result = _get_target_by_segment(df, "t", "s")
        assert isinstance(result, list)

    def test_get_time_trend(self):
        df = pd.DataFrame({
            "d": pd.date_range("2024-01-01", periods=10, freq="D"),
            "v": range(10),
        })
        result = _get_time_trend(df, "d", "v")
        assert isinstance(result, list)

    def test_get_scatter_data(self):
        df = pd.DataFrame({"x": [1, 2, 3], "y": [4, 5, 6]})
        result = _get_scatter_data(df, "x", "y")
        assert isinstance(result, list)


class TestChurnAnalytics:
    def test_get_churn_rate_by_segment(self, simple_df):
        df, _, _, _ = simple_df
        result = _get_churn_rate_by_segment(df, "target", "segment")
        assert isinstance(result, list)

    def test_find_highest_variance_dim(self, simple_df):
        df, _, _, _ = simple_df
        result = _find_highest_variance_dim(df, "target", ["segment"])
        assert result == "segment"

    def test_build_target_rate_chart(self, simple_df):
        df, _, _, _ = simple_df
        chart = _build_target_rate_chart(df, "target", "segment", "Test", "reason")
        assert chart is None or isinstance(chart, ChartRecommendation)


class TestDomainCommercial:
    def test_domain_functions_importable(self):
        assert callable(_generate_sales_charts)
        assert callable(_generate_marketing_charts)
        assert callable(_generate_finance_charts)
        assert callable(_generate_ecommerce_charts)


class TestDomainWorkforce:
    def test_domain_functions_importable(self):
        assert callable(_generate_healthcare_charts)
        assert callable(_generate_hr_charts)
        assert callable(_generate_education_charts)
        assert callable(_infer_hr_metric_context)


class TestDomainOps:
    def test_domain_functions_importable(self):
        assert callable(_generate_geo_charts)
        assert callable(_generate_generic_charts)
        assert callable(_generate_logistics_charts)
        assert callable(_generate_real_estate_charts)
        assert callable(_generate_customer_support_charts)
        assert callable(_generate_it_operations_charts)
        assert callable(_generate_cybersecurity_charts)


class TestSanitization:
    def test_is_poison_value(self):
        assert _is_poison_value("nan")
        assert not _is_poison_value(42)

    def test_safe_float(self):
        assert _safe_float("3.14") == 3.14
        assert _safe_float("abc", 0.0) == 0.0

    def test_coerce_numeric(self):
        s = pd.Series(["1", "2", "3"])
        result = _coerce_numeric_metric_series(s)
        assert result.dtype.kind in ("i", "f")

    def test_safe_to_datetime(self):
        s = pd.Series(["2024-01-01", "2024-02-01"])
        result = _safe_to_datetime(s)
        assert pd.api.types.is_datetime64_any_dtype(result)

    def test_sanitize_chart_data(self):
        data = [{"name": "a", "value": "nan"}]
        result = _sanitize_chart_data(data)
        assert len(result) == 0


class TestTitles:
    def test_beautify_column_name(self):
        assert "Revenue" == _beautify_column_name("total_revenue")
        assert "Monthly Charges" == _beautify_column_name("monthly_charges")

    def test_create_smart_title(self):
        title = _create_smart_title("revenue", "region")
        assert isinstance(title, str)

    def test_is_low_value_column(self):
        assert _is_low_value_column("id")
        assert not _is_low_value_column("revenue")

    def test_format_categorical_value(self):
        result = _format_categorical_value("gender", 0)
        assert isinstance(result, str)

    def test_smart_target_label(self):
        label = _smart_target_label("churn")
        assert isinstance(label, str)


class TestPrioritization:
    def test_should_average(self):
        assert _should_average_metric("average_salary")
        assert _should_average_metric("attrition_rate")
        assert not _should_average_metric("total_revenue")

    def test_metric_format_type(self):
        fmt = _metric_format_type("revenue")
        assert fmt in ("currency", "percent", "number", None)

    def test_get_metric_prefix(self):
        prefix = _get_metric_prefix("revenue")
        assert isinstance(prefix, str)


class TestAggregators:
    def test_safe_groupby_sum(self, simple_df):
        df, _, _, _ = simple_df
        result = _safe_groupby_sum(df, "segment", "value")
        assert isinstance(result, list)

    def test_safe_groupby_mean(self, simple_df):
        df, _, _, _ = simple_df
        result = _safe_groupby_mean(df, "segment", "value")
        assert isinstance(result, list)

    def test_safe_value_counts(self, simple_df):
        df, _, _, _ = simple_df
        result = _safe_value_counts(df, "segment")
        assert isinstance(result, list)


class TestGeo:
    def test_detect_map_type(self):
        assert _detect_map_type(["CA", "NY", "TX"]) == "us_states"


class TestGeneratorsCrossModule:
    """Verifies cross-module resolution — functions in different files call each other."""

    def test_recommend_charts_e2e(self):
        """End-to-end: recommend_charts resolves all domain generators via recommender.py."""
        df = pd.DataFrame({
            "segment": ["A", "B", "A", "B"],
            "value": [100, 200, 150, 250],
            "date": pd.date_range("2024-01-01", periods=4, freq="D"),
        })
        from app.services.analytics.column_filter import ColumnClassification
        from app.services.analytics.domain_detector import DomainType
        classification = ColumnClassification(
            metrics=["value"],
            dimensions=["segment"],
            targets=[],
            dates=["date"],
            excluded=[],
            mappings={},
        )
        result = recommend_charts(df, DomainType.GENERIC, classification)
        assert isinstance(result, dict)
        assert "slot_1" in result

    def test_templated_charts_invokes_query_helpers(self, simple_classification):
        """_generate_templated_charts (recommender.py) calls _safe_to_datetime (sanitization.py)."""
        df = pd.DataFrame({
            "date": pd.date_range("2024-01-01", periods=10, freq="D"),
            "metric_total": range(10),
            "metric_low": [0.5] * 10,
            "metric_high": [1.5] * 10,
        })
        simple_classification.mappings = {
            "dim_date": "date",
            "metric_1": "metric_total",
        }
        simple_classification.modifiers = {
            "low": {"low_bound": "metric_low"},
            "high": {"high_bound": "metric_high"},
        }
        charts = _generate_templated_charts(df, simple_classification)
        assert isinstance(charts, list)

    def test_all_columns_charts_calls_aggregators_and_prioritization(self):
        """_generate_all_columns_charts calls _safe_groupby_mean, _should_average_metric, etc."""
        from app.services.analytics.column_filter import ColumnClassification
        df = pd.DataFrame({
            "segment": ["A", "B", "A", "B"],
            "value": [100, 200, 150, 250],
            "cat": ["x", "y", "x", "y"],
        })
        classification = ColumnClassification(
            metrics=["value"],
            dimensions=["segment", "cat"],
            targets=[],
            dates=[],
            excluded=[],
            mappings={},
        )
        charts = _generate_all_columns_charts(df, classification)
        assert isinstance(charts, list)
        assert len(charts) > 0


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def simple_df():
    df = pd.DataFrame({
        "segment": ["A", "B", "A", "B", "A"],
        "value": [100, 200, 150, 250, 300],
        "target": [0, 1, 0, 1, 0],
    })
    yield df, ["segment"], ["value"], ["target"]


@pytest.fixture
def simple_classification():
    """Minimal ColumnClassification for testing."""
    from app.services.analytics.column_filter import ColumnClassification
    return ColumnClassification(
        metrics=[],
        dimensions=[],
        targets=[],
        dates=[],
        excluded=[],
        mappings={},
    )
