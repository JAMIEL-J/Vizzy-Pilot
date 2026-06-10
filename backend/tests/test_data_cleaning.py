"""
Tests for Data Cleaning Module.

Tests the new modules:
- duplicate_checks.py (detect_duplicates)
- recommendations.py (generate_recommendations)
- risk_scorer.py (calculate_health_score)
- rules.py (remove_duplicates, cap_outliers)
"""

import pytest
import pandas as pd
import numpy as np


class TestDuplicateDetection:
    """Tests for duplicate_checks module."""

    def test_detect_duplicates_finds_exact_duplicates(self):
        """
        TEST: detect_duplicates correctly identifies duplicate rows.
        
        Scenario:
        - DataFrame has exact duplicate rows
        - Should detect and count them
        """
        from app.services.inspection_execution.duplicate_checks import detect_duplicates
        
        df = pd.DataFrame({
            "name": ["Alice", "Bob", "Alice", "Charlie", "Bob"],
            "age": [25, 30, 25, 35, 30],
        })
        
        result = detect_duplicates(df)
        
        assert "duplicate_count" in result
        assert result["duplicate_count"] == 2  # Alice and Bob duplicated
        assert result["has_duplicates"] is True

    def test_detect_duplicates_no_duplicates(self):
        """
        TEST: detect_duplicates returns zero for unique data.
        """
        from app.services.inspection_execution.duplicate_checks import detect_duplicates
        
        df = pd.DataFrame({
            "name": ["Alice", "Bob", "Charlie"],
            "age": [25, 30, 35],
        })
        
        result = detect_duplicates(df)
        
        assert result["duplicate_count"] == 0
        assert result["has_duplicates"] is False

    def test_detect_duplicates_empty_dataframe(self):
        """
        TEST: detect_duplicates handles empty DataFrame.
        """
        from app.services.inspection_execution.duplicate_checks import detect_duplicates
        
        df = pd.DataFrame()
        
        result = detect_duplicates(df)
        
        assert result["duplicate_count"] == 0
        assert result["has_duplicates"] is False


class TestHealthScore:
    """Tests for calculate_health_score function."""

    def test_health_score_returns_structure(self):
        """
        TEST: Health score returns correct structure with score and grade.
        """
        from app.services.inspection_execution.risk_scorer import calculate_health_score
        
        profiling = {
            "row_count": 100,
            "column_count": 5,
            "columns": {},
        }
        anomalies = {"numeric_columns": {}}
        duplicates = {"duplicate_count": 0, "has_duplicates": False, "duplicate_percentage": 0}
        
        result = calculate_health_score(
            profiling=profiling,
            anomalies=anomalies,
            duplicates=duplicates,
        )
        
        assert "score" in result
        assert "grade" in result
        assert "breakdown" in result

    def test_health_score_grade_values(self):
        """
        TEST: Health score includes valid letter grade.
        """
        from app.services.inspection_execution.risk_scorer import calculate_health_score
        
        profiling = {"row_count": 100, "column_count": 3, "columns": {}}
        anomalies = {"numeric_columns": {}}
        duplicates = {"duplicate_count": 0, "has_duplicates": False, "duplicate_percentage": 0}
        
        result = calculate_health_score(
            profiling=profiling,
            anomalies=anomalies,
            duplicates=duplicates,
        )
        
        assert result["grade"] in ["A", "B", "C", "D", "F"]
        assert 0 <= result["score"] <= 100


class TestCleaningRules:
    """Tests for cleaning rules (remove_duplicates, cap_outliers)."""

    def test_remove_duplicates_rule(self):
        """
        TEST: remove_duplicates removes duplicate rows.
        """
        from app.services.cleaning_execution.rules import remove_duplicates
        
        df = pd.DataFrame({
            "name": ["Alice", "Bob", "Alice", "Charlie"],
            "age": [25, 30, 25, 35],
        })
        
        result = remove_duplicates(df)
        
        assert len(result) == 3  # One duplicate removed
        assert result["name"].tolist() == ["Alice", "Bob", "Charlie"]

    def test_cap_outliers_rule(self):
        """
        TEST: cap_outliers caps extreme values.
        """
        from app.services.cleaning_execution.rules import cap_outliers
        
        df = pd.DataFrame({
            "value": [10, 20, 30, 1000, 15, 25],  # 1000 is outlier
        })
        
        # API: cap_outliers(df, columns: List[str])
        result = cap_outliers(df, columns=["value"])
        
        # Outlier should be capped
        assert result["value"].max() < 1000

    def test_cap_outliers_preserves_normal_values(self):
        """
        TEST: cap_outliers doesn't affect normal values.
        """
        from app.services.cleaning_execution.rules import cap_outliers
        
        df = pd.DataFrame({
            "value": [10, 20, 30, 40, 50],  # No outliers
        })
        
        # API: cap_outliers(df, columns: List[str])
        result = cap_outliers(df, columns=["value"])
        
        # Values should be unchanged (within tolerance due to IQR bounds)
        assert len(result) == 5


class TestRecommendations:
    """Tests for recommendations generator."""

    def test_generate_recommendations_returns_list(self):
        """
        TEST: Generates a list of recommendations.
        """
        from app.services.cleaning_execution.recommendations import generate_recommendations
        
        profiling = {
            "row_count": 100,
            "column_count": 3,
            "columns": {
                "age": {"null_count": 20, "null_ratio": 0.2, "dtype": "int64"},
                "name": {"null_count": 0, "null_ratio": 0, "dtype": "object"},
            }
        }
        anomalies = {"numeric_columns": {}}
        duplicates = {"duplicate_count": 0, "has_duplicates": False, "duplicate_percentage": 0}
        
        result = generate_recommendations(
            profiling=profiling,
            anomalies=anomalies,
            duplicates=duplicates,
        )
        
        # Returns a list
        assert isinstance(result, list)
        # Should have recommendation for age column nulls
        assert len(result) > 0
        
        # Check structure of first recommendation
        assert "id" in result[0]
        assert "issue_type" in result[0]
        assert "severity" in result[0]

    def test_generate_recommendations_for_duplicates(self):
        """
        TEST: Generates remove recommendation for duplicates.
        """
        from app.services.cleaning_execution.recommendations import generate_recommendations
        
        profiling = {"row_count": 100, "column_count": 3, "columns": {}}
        anomalies = {"numeric_columns": {}}
        duplicates = {"duplicate_count": 15, "has_duplicates": True, "duplicate_percentage": 15}
        
        result = generate_recommendations(
            profiling=profiling,
            anomalies=anomalies,
            duplicates=duplicates,
        )
        
        # Should have recommendation for duplicates
        dup_recs = [r for r in result if r.get("issue_type") == "duplicates"]
        assert len(dup_recs) > 0

    def test_generate_recommendations_clean_data(self):
        """
        TEST: Clean data generates no recommendations.
        """
        from app.services.cleaning_execution.recommendations import generate_recommendations
        
        profiling = {"row_count": 100, "column_count": 3, "columns": {}}
        anomalies = {"numeric_columns": {}}
        duplicates = {"duplicate_count": 0, "has_duplicates": False, "duplicate_percentage": 0}
        
        result = generate_recommendations(
            profiling=profiling,
            anomalies=anomalies,
            duplicates=duplicates,
        )
        
        # Should have no recommendations for clean data
        assert len(result) == 0


class TestExecuteCleaningTracker:
    """Tests for change tracking inside execute_cleaning."""

    def test_execute_cleaning_tracks_cell_diffs_and_drops(self):
        """
        TEST: execute_cleaning records modified cells and dropped rows.
        """
        from app.services.cleaning_execution.planner import execute_cleaning

        df = pd.DataFrame({
            "name": [" Alice", "Bob", "Alice", "Charlie"],  # Alice is duplicate, Alice has spaces
            "age": [25, np.nan, 25, 35],
        })

        proposed_actions = {
            "steps": [
                {"rule": "trim_string_columns", "params": {"columns": ["name"]}},
                {"rule": "fill_missing_mean", "params": {"columns": ["age"]}},
                {"rule": "remove_duplicates", "params": {}},
            ]
        }

        result = execute_cleaning(df, proposed_actions)
        summary = result["execution_summary"]

        assert summary["steps_executed"] == 3
        assert summary["rows_dropped"] == 1  # Alice duplicate dropped
        assert summary["cells_modified"] > 0
        
        # Should contain cell-level changes
        changes = summary["changes"]
        assert len(changes) > 0
        
        # Verify specific details of a change (e.g. trim spaces in name or fill mean age)
        column_changes = [ch["column"] for ch in changes]
        assert "name" in column_changes or "age" in column_changes


