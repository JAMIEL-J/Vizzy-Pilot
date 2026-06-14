"""Churn Analytics - extracted from generators.py"""

import logging
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from .models import ChartRecommendation
from .prioritization import _should_average_metric
from .titles import _beautify_column_name, _format_categorical_value, _get_binary_target_labels

logger = logging.getLogger(__name__)

def _build_target_rate_chart(
    df: pd.DataFrame,
    target_col: str,
    dim_col: str,
    title: str,
    reason: str,
) -> Optional[ChartRecommendation]:
    if not target_col or not dim_col:
        return None
    data = _get_churn_rate_by_segment(df, target_col, dim_col)
    if not data:
        return None
    return ChartRecommendation(
        slot='',
        title=title,
        chart_type='bar',
        data=data,
        confidence='HIGH',
        reason=reason,
        format_type='percent',
        dimension=dim_col,
        metric=target_col,
        aggregation='mean'
    )


def _get_churn_rate_by_segment(df, target_col, segment_col, limit=10):
    """Churn RATE % per segment — not raw counts."""
    try:
        pos = {'yes', 'true', '1', 'churned', 'churn', 'exited', 'attrition', 'left'}
        tmp = df[[target_col, segment_col]].dropna().copy()
        target_vals = tmp[target_col].astype(str).str.strip().str.lower().str.replace(r'\.0$', '', regex=True)
        
        # Auto-detect positive class: if values are 0/1 ints, '1' is positive
        unique_lower = set(target_vals.unique())
        if unique_lower <= {'0', '1'}:
            tmp['_c'] = (target_vals == '1').astype(int)
        else:
            tmp['_c'] = target_vals.isin(pos).astype(int)
            
        grp = tmp.groupby(segment_col)['_c'].agg(['sum', 'count'])
        grp['rate'] = (grp['sum'] / grp['count'] * 100).round(1)
        grp = grp.sort_values('rate', ascending=False).head(limit)
        
        result = []
        for k, v in grp['rate'].items():
            result.append({'name': _format_categorical_value(segment_col, k), 'value': float(v)})
        return result
    except Exception:
        return []


def _get_value_at_risk(df, target_col, segment_col, value_col, limit=10):
    """Sum of value_col from POSITIVE-class rows per segment (revenue at risk)."""
    try:
        pos = {'yes', 'true', '1', 'churned', 'churn', 'exited', 'attrition', 'left'}
        tmp = df[[target_col, segment_col, value_col]].dropna().copy()
        target_vals = tmp[target_col].astype(str).str.strip().str.lower().str.replace(r'\.0$', '', regex=True)
        unique_lower = set(target_vals.unique())
        if unique_lower <= {'0', '1'}:
            mask = target_vals == '1'
        else:
            mask = target_vals.isin(pos)
        churned = tmp[mask]
        grp = churned.groupby(segment_col)[value_col].sum().sort_values(ascending=False).head(limit)
        
        result = []
        for k, v in grp.items():
            result.append({'name': _format_categorical_value(segment_col, k), 'value': round(float(v), 2)})
        return result
    except Exception:
        return []


def _get_lifecycle_cohorts(df, numeric_col, target_col=None):
    """
    Bucket a numeric column into 4 quartile-based cohorts.
    Uses data-driven bins (not hardcoded 12/24/48 months).
    Returns churn rate per cohort if target_col provided, else counts.
    """
    try:
        import pandas as pd
        import numpy as np
        vals = pd.to_numeric(df[numeric_col], errors='coerce').dropna()
        if len(vals) < 10:
            return []

        # Calculate quartile boundaries from the actual data
        q25, q50, q75 = np.percentile(vals, [25, 50, 75])
        mx = vals.max()

        # Smart labels based on column name
        col_label = _beautify_column_name(numeric_col)
        labels = [
            f'Low {col_label} (≤{q25:.0f})',
            f'Mid-Low (≤{q50:.0f})',
            f'Mid-High (≤{q75:.0f})',
            f'High {col_label} (>{q75:.0f})'
        ]
        bins = [vals.min() - 1, q25, q50, q75, mx + 1]
        # Remove duplicate bins
        unique_bins = sorted(set(bins))
        if len(unique_bins) < 3:
            return []
        # Rebuild labels for unique bins
        if len(unique_bins) - 1 != len(labels):
            labels = [f'Group {i+1}' for i in range(len(unique_bins) - 1)]

        tmp = df[[numeric_col]].dropna().copy()
        tmp['_cohort'] = pd.cut(
            pd.to_numeric(tmp[numeric_col], errors='coerce'),
            bins=unique_bins,
            labels=labels[:len(unique_bins)-1],
            right=True, duplicates='drop'
        )
        if target_col and target_col in df.columns:
            pos = {'yes', 'true', '1', 'churned', 'churn', 'exited', 'attrition', 'left'}
            target_vals = df[target_col].astype(str).str.strip().str.lower().str.replace(r'\.0$', '', regex=True)
            unique_lower = set(target_vals.unique())
            if unique_lower <= {'0', '1'}:
                tmp['_c'] = (target_vals == '1').astype(int)
            else:
                tmp['_c'] = target_vals.isin(pos).astype(int)
            grp = tmp.groupby('_cohort', observed=True)['_c'].agg(['sum', 'count'])
            grp['rate'] = (grp['sum'] / grp['count'] * 100).round(1)
            return [{'name': str(k), 'value': float(v)} for k, v in grp['rate'].items() if pd.notna(v)]
        else:
            counts = tmp['_cohort'].value_counts().sort_index()
            return [{'name': str(k), 'value': int(v)} for k, v in counts.items()]
    except Exception:
        return []


def _find_highest_variance_dim(df, target_col, dimensions, exclude=None):
    """
    Find the dimension with the highest variance in churn rate across its categories.
    This is the "most impactful" segmentation axis — truly data-driven.
    """
    exclude = exclude or set()
    best_dim = None
    best_var = -1
    try:
        pos = {'yes', 'true', '1', 'churned', 'churn', 'exited', 'attrition', 'left'}
        target_vals = df[target_col].astype(str).str.strip().str.lower().str.replace(r'\.0$', '', regex=True)
        unique_lower = set(target_vals.unique())
        if unique_lower <= {'0', '1'}:
            is_positive = (target_vals == '1').astype(int)
        else:
            is_positive = target_vals.isin(pos).astype(int)

        for dim in dimensions:
            if dim in exclude or dim == target_col:
                continue
            nunique = df[dim].nunique()
            if nunique < 2 or nunique > 15:
                continue
            rates = df.groupby(dim).apply(
                lambda g: is_positive.loc[g.index].mean() * 100, include_groups=False
            )
            var = rates.var()
            if var > best_var:
                best_var = var
                best_dim = dim
    except Exception:
        pass
    return best_dim


def _get_stacked_churn_counts(df, target_col, segment_col, limit=10):
    """Stacked bar data: Yes/No counts per segment (categories = target values)."""
    try:
        pos = {'yes', 'true', '1', 'churned', 'churn', 'exited', 'attrition', 'left'}
        tmp = df[[target_col, segment_col]].dropna().copy()
        target_vals = tmp[target_col].astype(str).str.strip().str.lower().str.replace(r'\.0$', '', regex=True)
        unique_lower = set(target_vals.unique())
        if unique_lower <= {'0', '1'}:
            tmp['_pos'] = (target_vals == '1').astype(int)
        else:
            tmp['_pos'] = target_vals.isin(pos).astype(int)
        tmp['_neg'] = 1 - tmp['_pos']
        pos_label, neg_label = _get_binary_target_labels(target_col)

        grp = tmp.groupby(segment_col)[['_pos', '_neg']].sum()
        grp = grp.sort_values('_pos', ascending=False).head(limit)
        result = []
        for seg, row in grp.iterrows():
            name = _format_categorical_value(segment_col, str(seg))
            result.append({'name': name, 'positive': int(row['_pos']), 'negative': int(row['_neg'])})
        return result
    except Exception:
        return []


def _get_churned_vs_retained_avg(df, target_col, metric_col):
    """Compare avg of metric_col between churned and retained groups."""
    try:
        pos = {'yes', 'true', '1', 'churned', 'churn', 'exited', 'attrition', 'left'}
        tmp = df[[target_col, metric_col]].dropna().copy()
        target_vals = tmp[target_col].astype(str).str.strip().str.lower().str.replace(r'\.0$', '', regex=True)
        unique_lower = set(target_vals.unique())
        if unique_lower <= {'0', '1'}:
            mask = target_vals == '1'
        else:
            mask = target_vals.isin(pos)
        avg_churned = tmp.loc[mask, metric_col].mean()
        avg_retained = tmp.loc[~mask, metric_col].mean()
        import pandas as pd
        if pd.notna(avg_churned) and pd.notna(avg_retained):
            pos_label, neg_label = _get_binary_target_labels(target_col)
            return [
                {'name': pos_label, 'value': round(float(avg_churned), 2)},
                {'name': neg_label, 'value': round(float(avg_retained), 2)}
            ]
        return []
    except Exception:
        return []


def _get_churn_count_by_segment(df, target_col, segment_col, limit=10):
    """Raw count of positive-class (churned) per segment — volume, not rate."""
    try:
        pos = {'yes', 'true', '1', 'churned', 'churn', 'exited', 'attrition', 'left'}
        tmp = df[[target_col, segment_col]].dropna().copy()
        target_vals = tmp[target_col].astype(str).str.strip().str.lower().str.replace(r'\.0$', '', regex=True)
        unique_lower = set(target_vals.unique())
        if unique_lower <= {'0', '1'}:
            tmp['_c'] = (target_vals == '1').astype(int)
        else:
            tmp['_c'] = target_vals.isin(pos).astype(int)
        grp = tmp.groupby(segment_col)['_c'].sum().sort_values(ascending=False).head(limit)
        result = []
        for k, v in grp.items():
            name = _format_categorical_value(segment_col, str(k))
            result.append({'name': name, 'value': int(v)})
        return result
    except Exception:
        return []


def _get_metric_cohort_analysis(df, metric_col, target_col, n_bins=4, limit=8):
    """Quartile-bin a metric and show churn rate per bin — like lifecycle but for any metric."""
    try:
        import numpy as np
        import pandas as pd
        vals = pd.to_numeric(df[metric_col], errors='coerce').dropna()
        if len(vals) < 20:
            return []
        quantiles = np.linspace(0, 100, n_bins + 1)
        edges = np.percentile(vals, quantiles)
        edges = sorted(set([round(e, 1) for e in edges]))
        if len(edges) < 3:
            return []
        col_label = _beautify_column_name(metric_col)
        labels = []
        for i in range(len(edges) - 1):
            labels.append(f'{col_label} {edges[i]:.0f}–{edges[i+1]:.0f}')
        tmp = df[[metric_col]].copy()
        tmp['_cohort'] = pd.cut(pd.to_numeric(tmp[metric_col], errors='coerce'),
                                bins=edges, labels=labels[:len(edges)-1],
                                right=True, include_lowest=True, duplicates='drop')
        if target_col and target_col in df.columns:
            pos = {'yes', 'true', '1', 'churned', 'churn', 'exited', 'attrition', 'left'}
            target_vals = df[target_col].astype(str).str.strip().str.lower().str.replace(r'\.0$', '', regex=True)
            unique_lower = set(target_vals.unique())
            if unique_lower <= {'0', '1'}:
                tmp['_c'] = (target_vals == '1').astype(int)
            else:
                tmp['_c'] = target_vals.isin(pos).astype(int)
            grp = tmp.groupby('_cohort', observed=True)['_c'].agg(['sum', 'count'])
            grp['rate'] = (grp['sum'] / grp['count'] * 100).round(1)
            return [{'name': str(k), 'value': float(v)} for k, v in grp['rate'].items() if pd.notna(v)]
        return []
    except Exception:
        return []


