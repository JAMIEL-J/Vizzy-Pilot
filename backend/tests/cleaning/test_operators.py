import pytest
import pandas as pd
import numpy as np
from app.services.cleaning_execution.operators import (
    TrimOperator,
    DuplicateOperator,
    ImputeOperator,
    CapOutlierOperator
)

def test_trim_operator():
    df = pd.DataFrame({
        "str_col": ["  abc  ", "def", None, "ghi "],
        "num_col": [1, 2, 3, 4]
    })
    
    # Trim all string columns
    op = TrimOperator(params={})
    res = op.execute(df)
    assert res["str_col"].tolist() == ["abc", "def", None, "ghi"]
    metrics = op.get_impact_metrics()
    assert metrics["cells_modified"] == 2
    assert metrics["columns_affected"] == ["str_col"]

    # Test invalid columns param
    with pytest.raises(ValueError):
        TrimOperator(params={"columns": "not a list"})

    # Test columns parameter and missing columns
    op2 = TrimOperator(params={"columns": ["missing_col"]})
    with pytest.raises(ValueError, match="Columns not found"):
        op2.execute(df)


def test_duplicate_operator():
    df = pd.DataFrame({
        "a": [1, 1, 2, 2],
        "b": [10, 10, 20, 30]
    })

    # Default remove duplicates (all columns)
    op = DuplicateOperator(params={})
    res = op.execute(df)
    assert len(res) == 3
    assert op.get_impact_metrics()["rows_dropped"] == 1

    # Subset remove duplicates
    op2 = DuplicateOperator(params={"subset": ["a"]})
    res2 = op2.execute(df)
    assert len(res2) == 2
    assert op2.get_impact_metrics()["rows_dropped"] == 2

    # Invalid keep parameter
    with pytest.raises(ValueError):
        DuplicateOperator(params={"keep": "invalid"})


def test_impute_operator():
    df = pd.DataFrame({
        "numeric": [1.0, np.nan, 3.0, 4.0],
        "category": ["a", "b", "c", "d"]
    })

    # Test validate: non-numeric columns raise ValueError
    with pytest.raises(ValueError, match="Non-numeric columns"):
        op = ImputeOperator(params={"columns": ["category"], "method": "mean"})
        op.execute(df)

    # Impute numeric col with mean (mean of 1, 3, 4 is 8/3 = 2.666...)
    op_mean = ImputeOperator(params={"columns": ["numeric"], "method": "mean"})
    res_mean = op_mean.execute(df)
    assert round(res_mean["numeric"].iloc[1], 2) == 2.67
    assert op_mean.get_impact_metrics()["cells_modified"] == 1

    # Impute numeric col with median (median of 1, 3, 4 is 3.0)
    op_median = ImputeOperator(params={"columns": ["numeric"], "method": "median"})
    res_median = op_median.execute(df)
    assert res_median["numeric"].iloc[1] == 3.0
    assert op_median.get_impact_metrics()["cells_modified"] == 1


def test_cap_outlier_operator():
    # 10 values, Q1=3.25, Q3=7.75, IQR=4.5. Bounds with multiplier=1.5: [3.25 - 6.75 = -3.5, 7.75 + 6.75 = 14.5]
    df = pd.DataFrame({
        "values": [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 100.0],
        "category": ["a"] * 10
    })

    # Test non-numeric raises ValueError
    with pytest.raises(ValueError, match="Non-numeric columns"):
        op = CapOutlierOperator(params={"columns": ["category"]})
        op.execute(df)

    # Cap outliers default multiplier (1.5)
    op = CapOutlierOperator(params={"columns": ["values"]})
    res = op.execute(df)
    # Upper bound should cap 100.0
    assert res["values"].max() < 100.0
    assert op.get_impact_metrics()["cells_modified"] == 1

    # Cap outliers configurable multiplier
    op2 = CapOutlierOperator(params={"columns": ["values"], "multiplier": 25.0})
    res2 = op2.execute(df)
    # With a multiplier of 25, 100 should not be capped
    assert res2["values"].max() == 100.0
    assert op2.get_impact_metrics()["cells_modified"] == 0


def test_remove_outlier_operator():
    from app.services.cleaning_execution.operators import RemoveOutlierOperator
    df = pd.DataFrame({
        "values": [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 100.0],
        "category": ["a"] * 10
    })

    # Test non-numeric raises ValueError
    with pytest.raises(ValueError, match="Non-numeric columns"):
        op = RemoveOutlierOperator(params={"columns": ["category"]})
        op.execute(df)

    # Remove outliers default multiplier (1.5)
    op = RemoveOutlierOperator(params={"columns": ["values"]})
    res = op.execute(df)
    # Row with 100.0 should be dropped
    assert len(res) == 9
    assert res["values"].max() == 9.0
    assert op.get_impact_metrics()["rows_dropped"] == 1
