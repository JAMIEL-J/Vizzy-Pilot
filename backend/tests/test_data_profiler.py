import pytest
import pandas as pd
import numpy as np
from app.services.analytics.data_profiler import DataProfiler

def test_categorical_detection():
    # Dataset with a clear categorical column (Low cardinality)
    df = pd.DataFrame({
        "region": ["North", "South", "North", "East", "West", "South", "North", "East"] * 10,
        "id": range(80)
    })
    profiler = DataProfiler()
    profiles = profiler.profile_dataframe(df)

    assert profiles["region"].is_categorical is True
    assert profiles["region"].is_identifier is False
    assert profiles["id"].is_identifier is True
    assert profiles["id"].is_categorical is False

def test_numeric_profiling():
    # Dataset with revenue (metric) and binary (target)
    df = pd.DataFrame({
        "revenue": [100.50, 200.00, 150.75, 300.20, 100.00] * 10,
        "is_churned": [0, 1, 0, 0, 1] * 10,
        "age": [25, 34, 45, 23, 67] * 10
    })
    profiler = DataProfiler()
    profiles = profiler.profile_dataframe(df)

    assert profiles["revenue"].is_numeric is True
    assert profiles["revenue"].is_currency_pattern is True
    assert profiles["is_churned"].is_binary is True
    assert profiles["age"].is_numeric is True
    assert profiles["age"].is_binary is False

def test_datetime_detection():
    df = pd.DataFrame({
        "date": pd.to_datetime(["2023-01-01", "2023-01-02", "2023-01-03"] * 10),
        "text": ["foo", "bar", "baz"] * 10
    })
    profiler = DataProfiler()
    profiles = profiler.profile_dataframe(df)

    assert profiles["date"].is_datetime is True
    assert profiles["text"].is_datetime is False

def test_empty_dataframe():
    df = pd.DataFrame()
    profiler = DataProfiler()
    profiles = profiler.profile_dataframe(df)
    assert profiles == {}

def test_single_column_df():
    df = pd.DataFrame({"val": [1, 1, 1, 1]})
    profiler = DataProfiler()
    profiles = profiler.profile_dataframe(df)
    assert profiles["val"].is_binary is True
