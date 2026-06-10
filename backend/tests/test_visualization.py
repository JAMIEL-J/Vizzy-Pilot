"""
Unit Tests for Visualization Module

Tests: services/visualization/chart_specs.py
       services/visualization/dashboard_generator.py

This module is responsible for:
- Building chart specifications (KPI, Bar, Line, Pie, Table, Scatter, Area, Heatmap)
- Auto-generating multi-widget dashboards from data structure
- Converting analysis results to frontend-ready JSON
"""

import pytest
import pandas as pd


class TestChartSpecs:
    """Tests for chart specification builders."""

    def test_build_kpi_chart(self):
        """
        TEST: KPI chart spec is correctly structured.
        
        ARCHITECTURE NOTE:
        - KPI charts display single values (totals, averages)
        - Used for dashboard header metrics
        """
        from app.services.visualization.chart_specs import build_chart_spec, ChartType
        
        result = build_chart_spec(
            chart_type=ChartType.KPI,
            title="Total Sales",
            data={"value": 10000},
        )
        
        assert result["type"] == "kpi"
        assert result["title"] == "Total Sales"
        assert result["value"] == 10000

    def test_build_bar_chart(self):
        """
        TEST: Bar chart spec is correctly structured.
        
        ARCHITECTURE NOTE:
        - Bar charts show categorical distributions
        - x_field: category column, y_field: numeric value
        """
        from app.services.visualization.chart_specs import build_chart_spec, ChartType
        
        result = build_chart_spec(
            chart_type=ChartType.BAR,
            title="Sales by Region",
            data={"rows": [{"region": "North", "sales": 5000}]},
            config={"x_field": "region", "y_field": "sales"},
        )
        
        assert result["type"] == "bar"
        assert result["title"] == "Sales by Region"

    def test_build_line_chart(self):
        """
        TEST: Line chart spec is correctly structured.
        
        ARCHITECTURE NOTE:
        - Line charts show time-series trends
        - series: list of {timestamp, value} points
        """
        from app.services.visualization.chart_specs import build_chart_spec, ChartType
        
        result = build_chart_spec(
            chart_type=ChartType.LINE,
            title="Sales Trend",
            data={"series": [{"timestamp": "2024-01", "value": 1000}]},
        )
        
        assert result["type"] == "line"
        assert result["title"] == "Sales Trend"

    def test_build_pie_chart(self):
        """TEST: Pie chart spec is correctly structured."""
        from app.services.visualization.chart_specs import build_chart_spec, ChartType
        
        result = build_chart_spec(
            chart_type=ChartType.PIE,
            title="Market Share",
            data={"slices": [{"label": "A", "value": 60}]},
        )
        
        assert result["type"] == "pie"


class TestDashboardGenerator:
    """Tests for auto-dashboard generation."""

    def test_generate_overview_dashboard_structure(self, sample_dataframe):
        """
        TEST: Dashboard has correct structure.
        
        ARCHITECTURE NOTE:
        - Dashboard uses 12-column grid layout
        - Widgets are auto-positioned by frontend
        """
        from app.services.visualization.dashboard_generator import generate_overview_dashboard
        
        result = generate_overview_dashboard(
            df=sample_dataframe,
            schema={},
        )
        
        assert "dashboard" in result
        assert result["dashboard"]["layout"] == "grid"
        assert result["dashboard"]["columns"] == 12
        assert "widgets" in result["dashboard"]

    def test_generate_dashboard_includes_kpi(self, sample_dataframe):
        """
        TEST: Dashboard auto-generates KPI widgets.
        
        ARCHITECTURE NOTE:
        - Total row count KPI always included
        - Numeric columns get AVG KPIs (max 3)
        """
        from app.services.visualization.dashboard_generator import generate_overview_dashboard
        
        result = generate_overview_dashboard(
            df=sample_dataframe,
            schema={},
        )
        
        widgets = result["dashboard"]["widgets"]
        kpi_widgets = [w for w in widgets if w["type"] == "kpi"]
        
        assert len(kpi_widgets) >= 1  # At least total rows KPI

    def test_generate_dashboard_includes_bar_charts(self, sample_dataframe):
        """
        TEST: Dashboard auto-generates bar charts for categorical columns.
        
        ARCHITECTURE NOTE:
        - Categorical columns (object dtype) get bar charts
        - Shows top 5 values by count
        """
        from app.services.visualization.dashboard_generator import generate_overview_dashboard
        
        result = generate_overview_dashboard(
            df=sample_dataframe,
            schema={},
        )
        
        widgets = result["dashboard"]["widgets"]
        bar_widgets = [w for w in widgets if w["type"] in ("bar", "hbar")]
        
        # 'region' and 'name' are categorical
        assert len(bar_widgets) >= 1

    def test_build_single_chart_from_result(self):
        """
        TEST: Single chart builder handles different result formats.
        
        ARCHITECTURE NOTE:
        - Used for intent_type = "analysis" (not dashboard)
        - Auto-detects chart type from result structure
        """
        from app.services.visualization.dashboard_generator import build_single_chart
        
        # KPI result
        kpi_result = {"value": 1500}
        kpi_chart = build_single_chart(kpi_result)
        assert kpi_chart["chart"]["type"] == "kpi"
        
        # Distribution result
        dist_result = {"rows": [{"category": "A", "count": 10}]}
        dist_chart = build_single_chart(dist_result)
        assert dist_chart["chart"]["type"] == "bar"
        
        # Time series result
        time_result = {"series": [{"timestamp": "2024-01", "value": 100}]}
        time_chart = build_single_chart(time_result)
        assert time_chart["chart"]["type"] == "line"
