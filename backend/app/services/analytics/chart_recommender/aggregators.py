"""
Safe aggregation helpers for chart data.
"""

import pandas as pd
from typing import List, Dict, Any
from .models import AggregationData
from .sanitization import _safe_float, _is_poison_value
from .prioritization import _should_average_metric, _round_mean_value
from ..outlier_detection import detect_outliers_iqr

def _safe_groupby_sum(df: pd.DataFrame, group_col: str, value_col: str, limit: int = 10) -> AggregationData:
    """Safely group by and sum, returning top N. Drops NaN keys/values."""
    try:
        work = df.dropna(subset=[group_col, value_col])
        outlier_mask = detect_outliers_iqr(work, value_col)
        
        outliers = None
        data_clean = None
        if outlier_mask.sum() > 0:
            outliers = {"count": int(outlier_mask.sum()), "metric": value_col}
            cleaned = work[~outlier_mask].groupby(group_col)[value_col].sum().sort_values(ascending=False).head(limit)
            data_clean = [{"name": str(k), "value": _safe_float(v)} for k, v in cleaned.items() if not _is_poison_value(k)]

        grouped = work.groupby(group_col)[value_col].sum().sort_values(ascending=False).head(limit)
        result = [{"name": str(k), "value": _safe_float(v)} for k, v in grouped.items() if not _is_poison_value(k)]
        return AggregationData(result, outliers, data_clean)
    except Exception:
        return AggregationData([])

def _safe_groupby_mean(df: pd.DataFrame, group_col: str, value_col: str, limit: int = 10) -> AggregationData:
    """Safely group by and calculate mean, returning top N. Drops NaN keys/values."""
    try:
        work = df.dropna(subset=[group_col, value_col])
        outlier_mask = detect_outliers_iqr(work, value_col)
        
        outliers = None
        data_clean = None
        if outlier_mask.sum() > 0:
            outliers = {"count": int(outlier_mask.sum()), "metric": value_col}
            cleaned = work[~outlier_mask].groupby(group_col)[value_col].mean().sort_values(ascending=False).head(limit)
            data_clean = [{"name": str(k), "value": _round_mean_value(v, value_col)} for k, v in cleaned.items() if not _is_poison_value(k) and pd.notna(v)]

        grouped = work.groupby(group_col)[value_col].mean().sort_values(ascending=False).head(limit)
        result = [{"name": str(k), "value": _round_mean_value(v, value_col)} for k, v in grouped.items() if not _is_poison_value(k) and pd.notna(v)]
        return AggregationData(result, outliers, data_clean)
    except Exception:
        return AggregationData([])

def _safe_value_counts(df: pd.DataFrame, col: str, limit: int = 10) -> List[Dict]:
    """Safely get value counts with 'Others' aggregation. Drops NaN/NaT keys."""
    try:
        from .sanitization import _POISON_STRINGS
        counts = df[col].dropna().value_counts()
        # Filter out poison string values from the index
        counts = counts[~counts.index.astype(str).str.strip().str.lower().isin(_POISON_STRINGS)]
        top = counts.head(limit)
        result = [{"name": str(k), "value": int(v)} for k, v in top.items()]
        # Aggregate remaining into "Others" if they exist
        remaining = counts.iloc[limit:].sum() if len(counts) > limit else 0
        if remaining > 0:
            result.append({"name": "Others", "value": int(remaining)})
        return result
    except Exception:
        return []
