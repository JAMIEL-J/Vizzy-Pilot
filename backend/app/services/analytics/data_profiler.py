"""
Data Profiler - Statistical analysis of dataset columns.

This service provides a non-LLM way to understand the 'nature' of data by analyzing
cardinality, distributions, and patterns. This profiling serves as the evidence
base for the Semantic Mapper.
"""

import pandas as pd
import numpy as np
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, asdict
import logging
import re

logger = logging.getLogger(__name__)

@dataclass
class ColumnProfile:
    column_name: str
    dtype: str
    cardinality: float
    unique_count: int
    is_numeric: bool
    is_datetime: bool
    is_categorical: bool
    is_identifier: bool
    samples: List[Any] = None

    # Numeric specific
    min_val: Optional[float] = None
    max_val: Optional[float] = None
    mean_val: Optional[float] = None
    std_val: Optional[float] = None
    is_binary: bool = False
    is_currency_pattern: bool = False

    # String specific
    top_values: List[Any] = None
    avg_length: Optional[float] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

class DataProfiler:
    def __init__(self, cardinality_threshold: float = 0.1, identifier_threshold: float = 0.9):
        """
        :param cardinality_threshold: If unique_count / total < threshold, it's considered categorical.
        :param identifier_threshold: If unique_count / total > threshold, it's considered an identifier.
        """
        self.cardinality_threshold = cardinality_threshold
        self.identifier_threshold = identifier_threshold

    def profile_dataframe(self, df: pd.DataFrame, sample_size: Optional[int] = None) -> Dict[str, ColumnProfile]:
        """
        Analyze all columns in the dataframe and return a mapping of column names to profiles.
        
        :param df: The input dataframe.
        :param sample_size: If provided, the dataframe will be sampled to this size before profiling.
        """
        if sample_size and len(df) > sample_size:
            logger.info(f"Sampling dataframe to {sample_size} rows for profiling.")
            df = df.sample(n=sample_size, random_state=42)
            
        profiles = {}
        for col in df.columns:
            profiles[col] = self.profile_column(df[col])
        return profiles

    def profile_column(self, series: pd.Series) -> ColumnProfile:
        """
        Analyze a single column and generate its profile.
        """
        name = series.name
        total_count = len(series)
        if total_count == 0:
            return ColumnProfile(name, "empty", 0, 0, False, False, False, False, samples=[])

        # Collect 5 representative samples (non-null), sanitized to JSON-safe types
        raw_samples = series.dropna().head(5).tolist()
        samples = [_to_json_safe(s) for s in raw_samples]

        # 1. Basic Type Detection
        dtype = str(series.dtype)

        # Try to coerce to datetime if it looks like one
        is_datetime = bool(pd.api.types.is_datetime64_any_dtype(series))
        if not is_datetime and not pd.api.types.is_numeric_dtype(series):
            try:
                pd.to_datetime(series.head(100), errors='raise', format='mixed')
                is_datetime = True
            except (ValueError, TypeError):
                is_datetime = False

        is_numeric = bool(pd.api.types.is_numeric_dtype(series))

        # 2. Cardinality Analysis
        unique_vals = series.unique()
        unique_count = int(len(unique_vals))
        cardinality = unique_count / total_count if total_count > 0 else 0

        # 3. Categorical vs Identifier logic
        # String columns with low cardinality are categorical; high are identifiers.
        is_categorical = False
        is_identifier = False

        if not is_datetime:
            if cardinality < self.cardinality_threshold:
                is_categorical = True
            elif cardinality > self.identifier_threshold:
                is_identifier = True

        # 4. Numeric Deep Dive
        min_val, max_val, mean_val, std_val, is_binary, is_currency_pattern = None, None, None, None, False, False

        if is_numeric:
            min_val = float(series.min()) if not pd.isna(series.min()) else None
            max_val = float(series.max()) if not pd.isna(series.max()) else None
            mean_val = float(series.mean()) if not pd.isna(series.mean()) else None
            std_val = float(series.std()) if not pd.isna(series.std()) else None

            # Check for binary (0/1 or True/False)
            unique_numeric = set(series.dropna().unique())
            if unique_numeric == {0, 1} or unique_numeric == {0.0, 1.0} or len(unique_numeric) == 1:
                is_binary = True

            # Check for currency patterns: positive values with consistent 2 decimal places
            if min_val is not None and min_val >= 0 and mean_val is not None and mean_val > 1:
                # Check if values commonly have 1 or 2 decimal places (Python floats drop trailing zeros)
                sample_vals = series.dropna().head(50)
                decimal_check = sample_vals.apply(lambda x: len(str(float(x)).split('.')[-1]) <= 2 if pd.notna(x) else False)
                is_currency_pattern = bool(decimal_check.mean() > 0.5)

        # 5. String Analysis
        top_values = None
        avg_length = None
        if not is_numeric and not is_datetime:
            top_values = [_to_json_safe(v) for v in series.value_counts().head(5).index.tolist()]
            avg_length = float(series.astype(str).str.len().mean())

        return ColumnProfile(
            column_name=name,
            dtype=dtype,
            cardinality=float(cardinality),
            unique_count=unique_count,
            is_numeric=is_numeric,
            is_datetime=is_datetime,
            is_categorical=is_categorical,
            is_identifier=is_identifier,
            min_val=min_val,
            max_val=max_val,
            mean_val=mean_val,
            std_val=std_val,
            is_binary=is_binary,
            is_currency_pattern=is_currency_pattern,
            top_values=top_values,
            avg_length=avg_length,
            samples=samples,
        )


def _to_json_safe(val):
    """Convert numpy/pandas scalar to JSON-serializable Python type."""
    if val is None:
        return None
    if isinstance(val, (np.integer,)):
        return int(val)
    if isinstance(val, (np.floating,)):
        return float(val)
    if isinstance(val, (np.bool_,)):
        return bool(val)
    if isinstance(val, (pd.Timestamp,)):
        return val.isoformat()
    if isinstance(val, (np.ndarray,)):
        return val.tolist()
    return val
