import pytest
import pandas as pd
import numpy as np
from unittest.mock import patch
from app.services.cleaning_execution.auditor import LineageTracker
from app.services.cleaning_execution.base import LineageEvent
from app.services.cleaning_execution.guardrails import PostFlightValidator, HardStopException

def test_lineage_tracker():
    tracker = LineageTracker()
    event1 = LineageEvent("trim", ["col1"], 0, 10, "2026-07-06T00:00:00", {})
    event2 = LineageEvent("duplicates", ["col1", "col2"], 5, 0, "2026-07-06T00:01:00", {})
    
    tracker.record_event(event1)
    tracker.record_event(event2)
    
    summary = tracker.get_summary()
    assert summary["steps_executed"] == 2
    assert summary["rows_dropped"] == 5
    assert summary["cells_modified"] == 10
    assert summary["columns_affected"] == ["col1", "col2"]


def test_preflight_checks():
    validator = PostFlightValidator()
    
    # 1. Sparsity check
    df_sparse = pd.DataFrame({
        "sparse_col": [None] * 95 + [1, 2, 3, 4, 5],
        "normal_col": list(range(100))
    })
    pre_res1 = validator.run_preflight_checks(df_sparse)
    assert not pre_res1["passed"]
    assert "sparse_col" in pre_res1["sparsity_issues"]

    # 2. Mixed type check
    df_mixed = pd.DataFrame({
        "mixed_col": [1, "two", 3.0, "four"],
        "normal_col": [1, 2, 3, 4]
    })
    pre_res2 = validator.run_preflight_checks(df_mixed)
    assert not pre_res2["passed"]
    assert "mixed_col" in pre_res2["type_issues"]


def test_inflight_hard_stop():
    validator = PostFlightValidator()
    
    # Dataset > 100 rows, dropped > 5% (e.g. 10 out of 110)
    with pytest.raises(HardStopException, match="Safety Guardrail: Dropped"):
        validator.check_inflight(original_len=110, current_len=100)

    # Dataset > 100 rows, dropped <= 5% (e.g. 5 out of 110)
    # Should not raise exception
    validator.check_inflight(original_len=110, current_len=105)

    # Dataset <= 100 rows, dropped > 5% (e.g. 10 out of 50)
    # Should not raise exception (only triggers when dataset length > 100)
    validator.check_inflight(original_len=50, current_len=40)


def test_postflight_validation_unstable():
    validator = PostFlightValidator()
    
    # Scenario: health score decreases, should flag as "Unstable"
    with patch("app.services.cleaning_execution.guardrails.run_inspection") as mock_inspect:
        # Mock health score returning 90 for raw, 80 for cleaned
        mock_inspect.side_effect = [
            {"health_score": {"score": 90}},
            {"health_score": {"score": 80}}
        ]
        
        raw_df = pd.DataFrame({"col": [1, 2, 3]})
        cleaned_df = pd.DataFrame({"col": [1, 2]})
        
        post_res = validator.validate_postflight(raw_df, cleaned_df)
        assert post_res["status"] == "Unstable"
        assert post_res["raw_score"] == 90
        assert post_res["cleaned_score"] == 80

        # Scenario: health score remains same/increases, should flag as "Stable"
        mock_inspect.side_effect = [
            {"health_score": {"score": 80}},
            {"health_score": {"score": 85}}
        ]
        post_res2 = validator.validate_postflight(raw_df, cleaned_df)
        assert post_res2["status"] == "Stable"
        assert post_res2["raw_score"] == 80
        assert post_res2["cleaned_score"] == 85
