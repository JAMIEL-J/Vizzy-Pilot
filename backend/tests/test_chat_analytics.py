"""
Tests for Chat Analytics Module.

Tests the new modules:
- chart_explainer.py (generate_chart_explanation)
- response_formatter.py (format_analysis_response, format_dashboard_response)
"""

import pytest


class TestResponseFormatter:
    """Tests for response_formatter module."""

    def test_format_analysis_response_structure(self):
        """
        TEST: format_analysis_response returns correct structure.
        """
        from app.services.llm.response_formatter import format_analysis_response
        
        result = format_analysis_response(
            query="What is total sales?",
            chart_spec={"type": "kpi", "data": {"value": 1000}},
            explanation={
                "summary": "Total sales is $1000",
                "explanation": "The total sales across all records is $1000.",
                "key_insight": "Sales are performing well.",
                "followup_questions": ["How does this compare to last month?"],
            },
            intent_type="analysis",
        )
        
        assert "message" in result
        assert "chart" in result
        assert "explanation" in result
        assert "followup_suggestions" in result
        assert "metadata" in result

    def test_format_analysis_response_has_message(self):
        """
        TEST: Response includes natural language message.
        """
        from app.services.llm.response_formatter import format_analysis_response
        
        result = format_analysis_response(
            query="Show sales by region",
            chart_spec={"type": "bar", "data": {}},
            explanation={"summary": "Sales breakdown by region"},
            intent_type="analysis",
        )
        
        assert result["message"] == "Sales breakdown by region"

    def test_format_analysis_response_fallback_message(self):
        """
        TEST: Falls back to default message if no summary.
        """
        from app.services.llm.response_formatter import format_analysis_response
        
        result = format_analysis_response(
            query="Show sales",
            chart_spec={"type": "bar", "data": {}},
            explanation={},  # No summary
            intent_type="analysis",
        )
        
        assert result["message"] != ""  # Should have fallback

    def test_format_dashboard_response_structure(self):
        """
        TEST: format_dashboard_response returns correct structure.
        """
        from app.services.llm.response_formatter import format_dashboard_response
        
        result = format_dashboard_response(
            query="Give me an overview",
            dashboard_spec={"widgets": [{}, {}, {}]},
            widget_count=3,
        )
        
        assert "message" in result
        assert "dashboard" in result
        assert "3 visualizations" in result["message"]

    def test_format_error_response(self):
        """
        TEST: format_error_response handles errors gracefully.
        """
        from app.services.llm.response_formatter import format_error_response
        
        result = format_error_response(
            query="Invalid query",
            error_message="Could not understand query",
        )
        
        assert "error" in result
        assert result["error"] is True
        assert "Could not understand query" in result["message"]
        assert "followup_suggestions" in result

    def test_format_response_preserves_chart_spec(self):
        """
        TEST: Chart spec is preserved in response.
        """
        from app.services.llm.response_formatter import format_analysis_response
        
        chart_spec = {
            "type": "bar",
            "title": "Sales by Region",
            "data": {"x": ["East", "West"], "y": [100, 200]},
        }
        
        result = format_analysis_response(
            query="Sales by region",
            chart_spec=chart_spec,
            explanation={"summary": "Test"},
            intent_type="analysis",
        )
        
        assert result["chart"] == chart_spec

    def test_format_response_limits_followups(self):
        """
        TEST: Follow-up suggestions are limited to 3.
        """
        from app.services.llm.response_formatter import format_analysis_response
        
        result = format_analysis_response(
            query="Test",
            chart_spec={"type": "kpi"},
            explanation={
                "summary": "Test",
                "followup_questions": ["Q1?", "Q2?", "Q3?", "Q4?", "Q5?"],
            },
            intent_type="analysis",
        )
        
        assert len(result["followup_suggestions"]) <= 3


class TestChartExplainer:
    """Tests for chart_explainer module (fallback only, no LLM calls)."""

    def test_fallback_explanation_bar_chart(self):
        """
        TEST: Fallback explanation for bar chart.
        """
        from app.services.llm.chart_explainer import _generate_fallback_explanation
        
        chart_data = {
            "title": "Sales by Region",
            "x": ["East", "West", "North"],
            "y": [100, 200, 150],
        }
        
        result = _generate_fallback_explanation("bar", chart_data)
        
        assert "summary" in result
        assert "explanation" in result
        assert "West" in result["explanation"]  # Should mention highest

    def test_fallback_explanation_line_chart(self):
        """
        TEST: Fallback explanation for line chart.
        """
        from app.services.llm.chart_explainer import _generate_fallback_explanation
        
        chart_data = {
            "title": "Sales Trend",
            "y": [100, 120, 150, 180, 200],
        }
        
        result = _generate_fallback_explanation("line", chart_data)
        
        assert "trend" in result["summary"].lower()
        assert "increasing" in result["explanation"]

    def test_fallback_explanation_pie_chart(self):
        """
        TEST: Fallback explanation for pie chart.
        """
        from app.services.llm.chart_explainer import _generate_fallback_explanation
        
        chart_data = {
            "title": "Market Share",
            "labels": ["A", "B", "C"],
            "values": [50, 30, 20],
        }
        
        result = _generate_fallback_explanation("pie", chart_data)
        
        assert "distribution" in result["summary"].lower()
        assert "A" in result["explanation"]  # Should mention largest

    def test_fallback_explanation_kpi(self):
        """
        TEST: Fallback explanation for KPI.
        """
        from app.services.llm.chart_explainer import _generate_fallback_explanation
        
        chart_data = {
            "title": "Total Revenue",
            "value": 50000,
        }
        
        result = _generate_fallback_explanation("kpi", chart_data)
        
        assert "50,000" in result["summary"]

    def test_fallback_includes_followup_questions(self):
        """
        TEST: Fallback includes follow-up questions.
        """
        from app.services.llm.chart_explainer import _generate_fallback_explanation
        
        result = _generate_fallback_explanation("bar", {"title": "Test"})
        
        assert "followup_questions" in result
        assert len(result["followup_questions"]) >= 1


class TestIntegration:
    """Integration tests for chat analytics flow."""

    def test_full_response_pipeline(self):
        """
        TEST: Full pipeline from chart to formatted response.
        """
        from app.services.llm.chart_explainer import _generate_fallback_explanation
        from app.services.llm.response_formatter import format_analysis_response
        
        # Step 1: Generate chart spec
        chart_spec = {
            "type": "bar",
            "title": "Sales by Region",
            "data": {"x": ["East", "West"], "y": [100, 200]},
        }
        
        # Step 2: Generate explanation
        explanation = _generate_fallback_explanation("bar", chart_spec["data"])
        
        # Step 3: Format response
        response = format_analysis_response(
            query="Show sales by region",
            chart_spec=chart_spec,
            explanation=explanation,
            intent_type="analysis",
        )
        
        # Verify complete response
        assert response["message"] != ""
        assert response["chart"]["type"] == "bar"
        assert "summary" in response["explanation"]
        assert len(response["followup_suggestions"]) > 0
        assert response["metadata"]["intent_type"] == "analysis"


class TestPercentageFormatting:
    """Tests for percentage formatting helper functions in chat routes."""

    def test_is_percentage_kpi(self):
        from app.api.chat_routes import _is_percentage_kpi
        
        # Test detection by metadata
        spec_meta = {"column_metadata": {"metric": {"display_format": {"type": "percent"}}}}
        assert _is_percentage_kpi("val", spec_meta) is True
        
        # Test detection by label keywords
        assert _is_percentage_kpi("churn rate", {}) is True
        assert _is_percentage_kpi("net margin", {}) is True
        assert _is_percentage_kpi("conversion ratio", {}) is True
        assert _is_percentage_kpi("percentage of users", {}) is True
        assert _is_percentage_kpi("pct_change", {}) is True
        
        # Test exclusions (daily pay rate, etc.)
        assert _is_percentage_kpi("daily rate", {}) is False
        assert _is_percentage_kpi("hourly rate", {}) is False
        assert _is_percentage_kpi("revenue", {}) is False

    def test_format_percentage_value(self):
        from app.api.chat_routes import _format_percentage_value
        
        # Non-numeric values should return as-is
        assert _format_percentage_value("N/A") == "N/A"
        
        # Fractions/ratios (<= 1.0) should be multiplied by 100
        assert _format_percentage_value(0.2674) == "26.74%"
        assert _format_percentage_value(0.05) == "5%"
        assert _format_percentage_value(-0.125) == "-12.5%"
        
        # Already scaled percentages (> 1.0) should just be formatted with %
        assert _format_percentage_value(26.74) == "26.74%"
        assert _format_percentage_value(75) == "75%"
        assert _format_percentage_value(-15.6) == "-15.6%"
        assert _format_percentage_value(0.0) == "0%"

    def test_build_numbered_metric_summary_with_percentage(self):
        from app.api.chat_routes import _build_numbered_metric_summary
        
        data_rows = [{"churn_rate": 0.2674, "total_sales": 5000}]
        columns = ["churn_rate", "total_sales"]
        column_metadata = {
            "churn_rate": {"display_format": {"type": "percent"}},
            "total_sales": {"display_format": {"type": "currency"}}
        }
        
        summary = _build_numbered_metric_summary(data_rows, columns, column_metadata)
        assert "**Churn Rate:** 26.74%" in summary
        assert "**Total Sales:** $5,000" in summary or "**Total Sales:** $5K" in summary or "**Total Sales:** $5,000.00" in summary

    def test_auto_upgrade_kpi(self):
        from app.services.visualization.nl2sql_chart_builder import _auto_chart_type
        
        # Exact 1 row with numeric values and no dimensions should upgrade to kpi
        assert _auto_chart_type("table", [{"churn_rate": 26.54, "retention_rate": 73.46}], ["churn_rate", "retention_rate"]) == "kpi"
        assert _auto_chart_type("bar", [{"val": 10}], ["val"]) == "kpi"
        
        # 1 row but has non-numeric dimensions should not upgrade to kpi
        assert _auto_chart_type("table", [{"name": "A", "val": 10}], ["name", "val"]) == "bar"
        # Multiple rows should not upgrade to kpi
        assert _auto_chart_type("table", [{"val": 10}, {"val": 20}], ["val"]) == "table"


