import pytest
import pandas as pd
import numpy as np
from app.services.cleaning_execution.pipeline import CleaningPipeline

def test_pipeline_sorting():
    steps = [
        {"rule": "cap_outliers", "params": {"columns": ["val"]}},
        {"rule": "fill_missing_mean", "params": {"columns": ["val"]}},
        {"rule": "remove_duplicates", "params": {}},
        {"rule": "trim_string_columns", "params": {}},
    ]
    pipeline = CleaningPipeline(steps)
    sorted_rules = [step["rule"] for step in pipeline.sorted_steps]
    # Expected order: trim -> duplicates -> impute -> cap
    assert sorted_rules == [
        "trim_string_columns",
        "remove_duplicates",
        "fill_missing_mean",
        "cap_outliers"
    ]


def test_pipeline_execution():
    df = pd.DataFrame({
        "str_col": ["  abc  ", "def", None, "def"],
        "num_col": [1.0, np.nan, 3.0, 100.0],
        "unmodified": [10, 20, 30, 40]
    })

    steps = [
        {"rule": "cap_outliers", "params": {"columns": ["num_col"], "multiplier": 1.5}},
        {"rule": "fill_missing_mean", "params": {"columns": ["num_col"]}},
        {"rule": "remove_duplicates", "params": {"subset": ["str_col"]}},
        {"rule": "trim_string_columns", "params": {"columns": ["str_col"]}},
    ]

    pipeline = CleaningPipeline(steps)
    res = pipeline.execute(df)

    # Let's check results:
    # 1. Trim: "  abc  " -> "abc", "def" -> "def", None -> None, "def" -> "def"
    # 2. Duplicates (on subset "str_col"): drops the last "def" (which is index 3)
    # Remaining: rows 0, 1, 2
    # 3. Impute: num_col row 1 is nan. Remaining num_col is [1.0, NaN, 3.0]. Mean is 2.0. So row 1 becomes 2.0.
    # 4. Cap outliers: Q1 of [1.0, 2.0, 3.0] is 1.5, Q3 is 2.5, IQR is 1.0. Upper bound is 2.5 + 1.5 = 4.0. Lower is 1.5 - 1.5 = 0.0.
    # (Since 100.0 was in row 3 which was dropped in duplicates step, there is no high outlier left to cap, but let's check values)
    assert res["str_col"].tolist() == ["abc", "def", None]
    assert res["num_col"].tolist() == [1.0, 2.0, 3.0]

    # Lineage events
    assert len(pipeline.lineage_events) == 4
    assert pipeline.lineage_events[0].operator_name == "trim_string_columns"
    assert pipeline.lineage_events[1].operator_name == "remove_duplicates"
    assert pipeline.lineage_events[2].operator_name == "fill_missing_mean"
    assert pipeline.lineage_events[3].operator_name == "cap_outliers"


def test_selective_copying_memory_efficiency():
    df = pd.DataFrame({
        "num_col": [1.0, np.nan, 3.0, 4.0],
        "unmodified": [10, 20, 30, 40]
    })

    steps = [
        {"rule": "fill_missing_mean", "params": {"columns": ["num_col"]}}
    ]

    pipeline = CleaningPipeline(steps)
    res = pipeline.execute(df)

    # Verify that num_col was copied/modified
    assert not np.shares_memory(df["num_col"].values, res["num_col"].values)

    # Verify that unmodified shares memory (selective copying/shallow copy holds references)
    assert np.shares_memory(df["unmodified"].values, res["unmodified"].values)
