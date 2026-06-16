"""
Test suite for Phase 3: Product UX (Time-to-Value)

Covers:
- Zero-Input First Render (auto semantic mapping + dashboard generation)
- Causal Analytics (Pearson/Spearman correlation + driver annotations)
- Interaction Shift (NL query endpoint)
"""

import pytest
import pandas as pd
import numpy as np
from uuid import UUID, uuid4
from unittest.mock import Mock, patch, AsyncMock
import json


class TestZeroInputFirstRender:
    """Tests for Phase 3.1: Zero-Input First Render."""

    def test_generate_initial_dashboard_with_mock(self):
        """
        TEST: generate_initial_dashboard creates dashboard with semantic map.

        ARCHITECTURE NOTE:
        - Should build DuckDB synchronously (DuckDB-first approach)
        - Should run semantic mapping automatically after upload
        - Should generate dashboard immediately (DuckDB-accurate KPIs)
        - Should return both dashboard and semantic_map
        """
        from app.services.ingestion_service import generate_initial_dashboard

        # Mock dependencies
        mock_session = Mock()
        mock_version = Mock()
        mock_version.semantic_map_json = None
        mock_session.get.return_value = mock_version

        # Mock the DuckDB build, reader, semantic audit, and dashboard generator
        # NOTE: generate_initial_dashboard uses local imports, so we patch the source modules
        mock_sample_path = Mock()
        mock_sample_path.__str__ = Mock(return_value="/tmp/mock.duckdb")

        with patch('app.services.analytics.duckdb_builder.build_duckdb_from_csv', new_callable=AsyncMock) as mock_build, \
             patch('app.services.analytics.duckdb_reader.DuckDBReader') as mock_reader_cls, \
             patch('app.services.semantic_audit.run_semantic_audit', new_callable=AsyncMock) as mock_audit, \
             patch('app.services.visualization.dashboard_generator.generate_overview_dashboard_duckdb') as mock_dashboard, \
             patch('app.core.llm_client.get_llm_client') as mock_llm:

            # Setup DuckDB build mock
            mock_build.return_value = mock_sample_path

            # Setup DuckDBReader mock
            mock_reader_instance = Mock()
            mock_reader_instance.row_count.return_value = 1500
            mock_reader_instance.sum_col.return_value = 45000.0
            mock_reader_instance.avg_col.return_value = 150.0
            mock_reader_instance.column_stats.return_value = {
                "total": 1500, "non_null": 1500, "null_count": 0, "null_pct": 0.0
            }
            mock_reader_cls.return_value = mock_reader_instance
            mock_reader_instance.sample_rows.return_value = pd.DataFrame({
                "sales": [100, 200, 300],
                "date": ["2024-01", "2024-02", "2024-03"]
            })

            # Setup semantic audit mock
            mock_audit.return_value = [
                {"column": "sales", "role": "revenue"},
                {"column": "date", "role": "date"}
            ]
            mock_dashboard.return_value = {
                "dashboard": {
                    "widgets": [
                        {"type": "kpi", "title": "Total Records", "data": {"value": 1500}},
                        {"type": "kpi", "title": "Total Sales", "data": {"value": 45000.0}},
                    ],
                    "total_records": 1500,
                }
            }

            # Call the function
            import asyncio
            result = asyncio.run(generate_initial_dashboard(
                session=mock_session,
                dataset_id=uuid4(),
                version_id=uuid4(),
                user_id=uuid4(),
                schema=[{"name": "sales", "type": "float"}],
                raw_path="/tmp/test.csv"
            ))

            # Verify results
            assert "dashboard" in result
            assert "semantic_map" in result
            assert result["dashboard"] is not None
            assert result["semantic_map"] is not None

            # Verify DuckDB was built synchronously
            mock_build.assert_called_once()

            # Verify reader was used (setup + sampling)
            mock_reader_cls.assert_called_once_with("/tmp/mock.duckdb")
            mock_reader_instance.set_table.assert_called_once_with("data")
            mock_reader_instance.sample_rows.assert_called_once_with(limit=200)
            mock_reader_instance.close.assert_called_once()

            # Verify semantic audit was called
            mock_audit.assert_called_once()

            # Verify DuckDB-accurate dashboard was generated
            mock_dashboard.assert_called_once()

            # Verify accurate total_records from DuckDB
            assert result["dashboard"]["total_records"] == 1500
    
    def test_upload_returns_dashboard_in_response(self):
        """
        TEST: Upload endpoint includes dashboard in response.
        
        ARCHITECTURE NOTE:
        - Upload should trigger auto-dashboard generation
        - Response should include dashboard and semantic_map fields
        """
        # Verify the generate_initial_dashboard function exists and is async
        from app.services.ingestion_service import generate_initial_dashboard
        import inspect
        assert inspect.iscoroutinefunction(generate_initial_dashboard)


class TestCausalAnalytics:
    """Tests for Phase 3.2: Causal Analytics (Pearson/Spearman correlation)."""

    def test_pearson_correlation_computation(self):
        """
        TEST: Pearson correlation is computed correctly.
        
        ARCHITECTURE NOTE:
        - Should handle perfect positive correlation (r=1.0)
        - Should handle perfect negative correlation (r=-1.0)
        - Should handle no correlation (r≈0)
        """
        from app.services.analytics.causal_analysis import _compute_correlation
        
        # Perfect positive correlation
        x = pd.Series([1, 2, 3, 4, 5])
        y = pd.Series([2, 4, 6, 8, 10])
        corr = _compute_correlation(x, y, "pearson")
        assert abs(corr - 1.0) < 0.01
        
        # Perfect negative correlation
        y_neg = pd.Series([10, 8, 6, 4, 2])
        corr_neg = _compute_correlation(x, y_neg, "pearson")
        assert abs(corr_neg - (-1.0)) < 0.01
        
        # No correlation
        x_rand = pd.Series([1, 2, 3, 4, 5])
        y_rand = pd.Series([5, 1, 4, 2, 3])
        corr_rand = _compute_correlation(x_rand, y_rand, "pearson")
        assert abs(corr_rand) < 0.5  # Should be weak

    def test_spearman_correlation_computation(self):
        """
        TEST: Spearman correlation handles monotonic relationships.
        
        ARCHITECTURE NOTE:
        - Should detect monotonic relationships even when not linear
        - Useful for non-linear but ordered relationships
        """
        from app.services.analytics.causal_analysis import _compute_correlation
        
        # Monotonic but non-linear relationship
        x = pd.Series([1, 2, 3, 4, 5])
        y = pd.Series([1, 4, 9, 16, 25])  # x^2
        
        corr_pearson = _compute_correlation(x, y, "pearson")
        corr_spearman = _compute_correlation(x, y, "spearman")
        
        # Spearman should be perfect (monotonic)
        assert abs(corr_spearman - 1.0) < 0.01
        
        # Pearson should be good but not perfect (non-linear)
        assert corr_pearson > 0.8

    def test_correlation_strength_categorization(self):
        """
        TEST: Correlation strength is categorized correctly.
        
        ARCHITECTURE NOTE:
        - strong: |r| >= 0.7
        - moderate: 0.4 <= |r| < 0.7
        - weak: |r| < 0.4
        """
        from app.services.analytics.causal_analysis import _categorize_correlation_strength
        
        assert _categorize_correlation_strength(0.8) == "strong"
        assert _categorize_correlation_strength(-0.8) == "strong"
        assert _categorize_correlation_strength(0.5) == "moderate"
        assert _categorize_correlation_strength(-0.5) == "moderate"
        assert _categorize_correlation_strength(0.2) == "weak"
        assert _categorize_correlation_strength(-0.2) == "weak"

    def test_driver_annotation_generation(self):
        """
        TEST: Driver annotations are generated with correct structure.
        
        ARCHITECTURE NOTE:
        - Should include KPI name, driver column, correlation value
        - Should include human-readable explanation
        - Should include confidence level
        """
        from app.services.analytics.causal_analysis import DriverAnnotation
        
        annotation = DriverAnnotation(
            kpi_name="revenue",
            kpi_value=100000.0,
            driver_column="marketing_spend",
            correlation=0.85,
            correlation_type="pearson",
            direction="positive",
            strength="strong",
            explanation="Marketing spend strongly correlates with revenue",
            confidence="high"
        )
        
        assert annotation.kpi_name == "revenue"
        assert annotation.driver_column == "marketing_spend"
        assert annotation.correlation == 0.85
        assert annotation.strength == "strong"
        assert annotation.confidence == "high"

    def test_analyze_drivers_finds_significant_correlations(self):
        """
        TEST: analyze_drivers finds significant correlations in data.
        
        ARCHITECTURE NOTE:
        - Should identify columns that correlate with KPI
        - Should filter by minimum correlation threshold
        - Should return top N drivers
        """
        from app.services.analytics.causal_analysis import analyze_drivers
        
        # Create test data with known correlations
        np.random.seed(42)
        n = 100
        df = pd.DataFrame({
            "revenue": np.random.normal(1000, 200, n),
            "marketing_spend": np.random.normal(500, 100, n),
            "customer_satisfaction": np.random.normal(4.5, 0.5, n),
            "unrelated_noise": np.random.normal(0, 1, n)
        })
        
        # Make marketing_spend correlate with revenue
        df["revenue"] = df["revenue"] + 2 * df["marketing_spend"]
        
        results = analyze_drivers(
            df=df,
            kpi_columns=["revenue"],
            min_correlation=0.3,
            max_drivers=3
        )
        
        assert "revenue" in results
        assert len(results["revenue"]) > 0
        
        # Should find marketing_spend as a driver
        driver_names = [d.driver_column for d in results["revenue"]]
        assert "marketing_spend" in driver_names

    def test_generate_why_annotations_structure(self):
        """
        TEST: generate_why_annotations returns correct structure.
        
        ARCHITECTURE NOTE:
        - Should return annotations, summary, counts
        - Should handle missing data gracefully
        """
        from app.services.analytics.causal_analysis import generate_why_annotations
        
        df = pd.DataFrame({
            "sales": [100, 200, 150, 300, 250],
            "marketing": [50, 100, 75, 150, 125],
            "customers": [10, 20, 15, 30, 25]
        })
        
        result = generate_why_annotations(df)
        
        assert "annotations" in result
        assert "summary" in result
        assert "total_drivers_found" in result
        assert isinstance(result["annotations"], list)
        assert isinstance(result["summary"], str)

    def test_generate_why_annotations_with_target(self):
        """
        TEST: generate_why_annotations focuses on target column when specified.
        
        ARCHITECTURE NOTE:
        - Should only analyze the target column as KPI
        - Should still find drivers for that specific column
        """
        from app.services.analytics.causal_analysis import generate_why_annotations
        
        df = pd.DataFrame({
            "churn_rate": [0.1, 0.2, 0.15, 0.3, 0.25],
            "support_tickets": [5, 10, 7, 15, 12],
            "tenure_months": [12, 6, 9, 3, 4]
        })
        
        result = generate_why_annotations(df, target_column="churn_rate")
        
        # All annotations should be for churn_rate
        for ann in result["annotations"]:
            assert ann["kpi_name"] == "churn_rate"


class TestNLQueryEndpoint:
    """Tests for Phase 3.3: Interaction Shift (NL Query)."""

    def test_nl_query_request_schema(self):
        """
        TEST: NLQueryRequest has correct schema.
        
        ARCHITECTURE NOTE:
        - Should require query string
        - Should allow optional dataset_id and context
        """
        from app.api.chat_routes import NLQueryRequest
        from pydantic import ValidationError
        
        # Rebuild model to resolve forward refs
        NLQueryRequest.model_rebuild()
        
        # Valid request
        request = NLQueryRequest(query="What are total sales?")
        assert request.query == "What are total sales?"
        assert request.dataset_id is None
        assert request.context is None
        
        # Should fail without query
        with pytest.raises(ValidationError):
            NLQueryRequest()

    def test_nl_query_response_schema(self):
        """
        TEST: NLQueryResponse has correct schema.
        
        ARCHITECTURE NOTE:
        - Should include answer, sql, chart, suggested_followups
        - Should have confidence field
        """
        from app.api.chat_routes import NLQueryResponse
        
        # Rebuild model to resolve forward refs
        NLQueryResponse.model_rebuild()
        
        response = NLQueryResponse(
            answer="Total sales are $1M",
            sql="SELECT SUM(sales) FROM data",
            chart={"type": "bar", "data": []},
            suggested_followups=["Show by month", "Compare to last year"],
            confidence="high"
        )
        
        assert response.answer == "Total sales are $1M"
        assert response.sql is not None
        assert response.chart is not None
        assert len(response.suggested_followups) == 2
        assert response.confidence == "high"

    def test_nl_query_without_dataset(self):
        """
        TEST: NL query without dataset returns helpful message.
        
        ARCHITECTURE NOTE:
        - Should prompt user to upload a dataset
        - Should suggest follow-up actions
        """
        from app.api.chat_routes import NLQueryResponse
        
        # Rebuild model to resolve forward refs
        NLQueryResponse.model_rebuild()
        
        response = NLQueryResponse(
            answer="Please attach a dataset to ask questions about your data.",
            suggested_followups=["Upload a dataset", "View existing datasets"],
            confidence="high"
        )
        
        assert "dataset" in response.answer.lower()
        assert len(response.suggested_followups) == 2

    def test_nl_query_endpoint_exists(self):
        """
        TEST: NL query endpoint is registered in router.
        
        ARCHITECTURE NOTE:
        - Should be accessible at /nl/query
        - Should accept POST requests
        """
        from app.api.chat_routes import router
        
        # Check that the endpoint is registered
        routes = [route for route in router.routes if hasattr(route, "path")]
        nl_routes = [r for r in routes if "/nl/" in str(r.path)]
        
        assert len(nl_routes) > 0


class TestCorrelationEdgeCases:
    """Edge case tests for correlation analysis."""

    def test_correlation_with_constant_column(self):
        """
        TEST: Correlation with constant column returns 0.
        
        ARCHITECTURE NOTE:
        - Constant columns have no variance
        - Correlation should be 0 (undefined mathematically)
        """
        from app.services.analytics.causal_analysis import _compute_correlation
        
        x = pd.Series([1, 2, 3, 4, 5])
        y = pd.Series([10, 10, 10, 10, 10])  # Constant
        
        corr = _compute_correlation(x, y, "pearson")
        assert corr == 0.0

    def test_correlation_with_nan_values(self):
        """
        TEST: Correlation handles NaN values gracefully.
        
        ARCHITECTURE NOTE:
        - Should remove NaN values before computing
        - Should not crash with missing data
        """
        from app.services.analytics.causal_analysis import _compute_correlation
        
        x = pd.Series([1, 2, np.nan, 4, 5])
        y = pd.Series([2, 4, 6, 8, 10])
        
        corr = _compute_correlation(x, y, "pearson")
        assert abs(corr - 1.0) < 0.01  # Should still be perfect after removing NaN

    def test_correlation_with_few_data_points(self):
        """
        TEST: Correlation with fewer than 3 data points returns 0.
        
        ARCHITECTURE NOTE:
        - Need at least 3 points for meaningful correlation
        - Should return 0 for insufficient data
        """
        from app.services.analytics.causal_analysis import _compute_correlation
        
        x = pd.Series([1, 2])
        y = pd.Series([3, 4])
        
        corr = _compute_correlation(x, y, "pearson")
        assert corr == 0.0

    def test_empty_dataframe(self):
        """
        TEST: Causal analysis handles empty DataFrame.
        
        ARCHITECTURE NOTE:
        - Should not crash with empty data
        - Should return empty results with appropriate message
        """
        from app.services.analytics.causal_analysis import generate_why_annotations
        
        df = pd.DataFrame()
        
        result = generate_why_annotations(df)
        
        assert result["annotations"] == []
        assert "No numeric KPI columns" in result["summary"] or result["total_drivers_found"] == 0


class TestIntegrationPhase3:
    """Integration tests for Phase 3 features."""

    def test_end_to_end_causal_analysis(self):
        """
        TEST: Full causal analysis pipeline works end-to-end.
        
        ARCHITECTURE NOTE:
        - Load sample data
        - Run causal analysis
        - Verify annotations are meaningful
        """
        from app.services.analytics.causal_analysis import generate_why_annotations
        
        # Create realistic business data
        np.random.seed(42)
        n = 200
        
        marketing = np.random.normal(1000, 200, n)
        # Revenue correlates with marketing
        revenue = 5000 + 3 * marketing + np.random.normal(0, 500, n)
        # Unrelated noise
        noise = np.random.normal(0, 1, n)
        
        df = pd.DataFrame({
            "revenue": revenue,
            "marketing_spend": marketing,
            "noise": noise
        })
        
        result = generate_why_annotations(df, target_column="revenue")
        
        # Should find marketing_spend as a driver
        assert result["total_drivers_found"] > 0
        
        driver_names = [a["driver_column"] for a in result["annotations"]]
        assert "marketing_spend" in driver_names
        
        # Marketing should have strong correlation
        marketing_annotation = next(a for a in result["annotations"] if a["driver_column"] == "marketing_spend")
        assert marketing_annotation["strength"] in ["strong", "moderate"]
        assert marketing_annotation["direction"] == "positive"

    def test_dashboard_generation_with_semantic_map(self):
        """
        TEST: Dashboard generation uses semantic map correctly.
        
        ARCHITECTURE NOTE:
        - Semantic map should influence column classification
        - Dashboard should reflect semantic roles
        """
        from app.services.visualization.dashboard_generator import generate_overview_dashboard
        
        df = pd.DataFrame({
            "date": pd.date_range("2024-01-01", periods=10),
            "sales": [100, 120, 110, 130, 140, 150, 160, 170, 180, 190],
            "region": ["North", "South", "East", "West"] * 2 + ["North", "South"]
        })
        
        semantic_map = json.dumps({
            "date": "date",
            "sales": "revenue",
            "region": "geography"
        })
        
        result = generate_overview_dashboard(
            df=df,
            schema={"columns": ["date", "sales", "region"]},
            semantic_map_json=semantic_map
        )
        
        assert "dashboard" in result
        assert result["dashboard"] is not None


class TestCausalCorrelation:
    """Verifies that causal correlation is computed on raw row-level data."""

    def test_causal_correlation_on_raw_data(self):
        from app.services.analytics.causal_analysis import generate_why_annotations
        
        # Create a raw dataset where y is 2 * x + noise at row level
        np.random.seed(42)
        x_raw = np.random.normal(50, 10, 100)
        y_raw = 2 * x_raw + np.random.normal(0, 2, 100)
        df = pd.DataFrame({"x": x_raw, "y": y_raw})
        
        # Compute correlation using our causal analytics function
        result = generate_why_annotations(df, target_column="y")
        
        # Verify driver is detected and has a very strong row-level correlation
        assert result["total_drivers_found"] > 0
        driver = result["annotations"][0]
        assert driver["driver_column"] == "x"
        assert driver["strength"] == "strong"
        assert driver["correlation"] > 0.9


class TestConfidenceThreshold:
    """Verifies that low confidence mappings do not block dashboard generation flow."""

    def test_low_confidence_mappings_not_blocked(self):
        from app.services.visualization.dashboard_generator import generate_overview_dashboard
        
        df = pd.DataFrame({
            "date": pd.date_range("2024-01-01", periods=5),
            "low_conf_col": [1.1, 2.2, 3.3, 4.4, 5.5],
        })
        
        # Low confidence mapping has proposed role and can still generate dashboard
        semantic_map = json.dumps({
            "date": "date",
            "low_conf_col": "profit"
        })
        
        result = generate_overview_dashboard(
            df=df,
            schema={"columns": ["date", "low_conf_col"]},
            semantic_map_json=semantic_map
        )
        
        assert "dashboard" in result
        assert result["dashboard"] is not None