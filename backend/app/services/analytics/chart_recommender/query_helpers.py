"""Query Helpers - extracted from generators.py"""
from .sanitization import _is_poison_value

import logging
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

from .aggregators import _safe_groupby_sum, _safe_groupby_mean, _safe_value_counts
from .models import ChartRecommendation
from .prioritization import _should_average_metric
from .sanitization import _POISON_STRINGS, _safe_float, _safe_to_datetime, _coerce_numeric_metric_series
from .titles import _beautify_column_name, _format_categorical_value

logger = logging.getLogger(__name__)

def _smart_aggregate(df: pd.DataFrame, group_col: str, metric_col: str, limit: int = 10) -> List[Dict[str, Any]]:
    """Smartly decide between SUM and MEAN based on metric nature."""
    # Ensure numeric normalization if it's currently a string/object
    if metric_col in df.columns and (df[metric_col].dtype == 'object' or df[metric_col].dtype == 'string'):
        df[metric_col] = pd.to_numeric(df[metric_col], errors='coerce')
        
    if _should_average_metric(metric_col):
        return _safe_groupby_mean(df, group_col, metric_col, limit)
    return _safe_groupby_sum(df, group_col, metric_col, limit)


def _deduplicate_charts(charts: List['ChartRecommendation']) -> List['ChartRecommendation']:
    """Remove duplicate/similar charts to avoid repetition.
    
    Rules:
    1. No duplicate titles
    2. No duplicate (dimension, metric, aggregation) fingerprints 
    3. For trend charts: only one trend per metric (different dates are still duplicates semantically)
    4. Preserve variance_score ordering when deduplicating
    """
    seen_combos: Set[str] = set()
    seen_titles: Set[str] = set()
    seen_trend_metrics: Set[str] = set()  # Track which metrics have trend charts
    unique_charts = []
    
    for chart in charts:
        title_lower = chart.title.lower()
        
        # Rule 1: Skip if we've seen this exact title
        if title_lower in seen_titles:
            continue
            
        dim = chart.dimension or ""
        met = chart.metric or ""
        agg = chart.aggregation or "sum"
        type_ = chart.chart_type
        
        # Rule 3: For trend charts, only allow ONE per metric
        # (different date columns showing same metric are semantic duplicates)
        is_trend = type_ in ('line', 'area')
        if is_trend and met:
            if met in seen_trend_metrics:
                continue  # Already have a trend for this metric
            seen_trend_metrics.add(met)
        
        # Rule 2: Skip if both dim and metric exist and we've seen this combo
        if dim and met:
            data_fingerprint = f"{dim}|{met}|{agg}"
            if data_fingerprint in seen_combos:
                continue
            seen_combos.add(data_fingerprint)
        
        # Rule 1: Track title
        seen_titles.add(title_lower)
        unique_charts.append(chart)
    
    return unique_charts


# ============================================================================
# BI DASHBOARD PRIORITIZATION
# As a BI dashboard builder, prioritize metrics in this order:
# 1. Revenue/Sales (most critical for business)
# 2. Cost/Expense (second most critical)
# 3. Profit/Margin (calculated importance)
# 4. Customer/Volume metrics
# 5. Engagement/Activity metrics
# 6. Other numerical columns
# ============================================================================

METRIC_PRIORITY_KEYWORDS = [
    # Tier 1: Revenue & Sales (highest priority) & Critical Health Outcomes
    ['revenue', 'sales', 'totalcharges', 'total_charges', 'income', 'gross', 'los', 'length_of_stay', 'mortality', 'readmission'],
    # Tier 2: Cost & Expense & Clinical Scores
    ['cost', 'expense', 'spending', 'monthlycharges', 'monthly_charges', 'price', 'score', 'rate', 'prevalence', 'incidence'],
    # Tier 3: Profit & Margins & Vital Measurements
    ['profit', 'margin', 'net', 'earning', 'vital', 'pressure', 'bmi', 'weight', 'temperature'],
    # Tier 4: Volume & Quantity 
    ['quantity', 'count', 'volume', 'orders', 'transactions', 'encounters', 'visits', 'admissions', 'discharges'],
    # Tier 5: Engagement & Activity
    ['tenure', 'clicks', 'impressions', 'views', 'sessions'],
]

DIMENSION_PRIORITY_KEYWORDS = [
    # Tier 1: Business Segmentation & Primary Health Classifications
    ['contract', 'segment', 'category', 'type', 'tier', 'plan', 'diagnosis', 'drg', 'condition', 'treatment'],
    # Tier 2: Customer/Patient Segments
    ['customer', 'patient', 'gender', 'age', 'region', 'country', 'demographics'],
    # Tier 3: Product/Service & Facilities/Staff
    ['product', 'service', 'internetservice', 'phoneservice', 'channel', 'hospital', 'clinic', 'physician', 'provider', 'ward'],
    # Tier 4: Payment/Method & Encounters
    ['payment', 'method', 'paymentmethod', 'payment_method', 'admission', 'discharge', 'encounter'],
    # Tier 5: Other categorical
    ['status', 'state', 'city', 'department'],
]

def _to_trend_point_key(value: Any) -> tuple[str, str]:
    """Normalize a grouped date key to (month-year label, ISO date string)."""
    try:
        ts = pd.Timestamp(value)
        if pd.isna(ts):
            return None, None  # Signal caller to skip this point
        return ts.strftime('%b %Y'), str(ts.date())
    except Exception:
        raw = str(value)
        if raw.strip().lower() in _POISON_STRINGS:
            return None, None
        return raw, raw


def _normalize_percentage_chart_values(data: Any) -> Any:
    """Convert ratio-scale chart values (0-1) to percent-scale values (0-100)."""
    if not isinstance(data, list) or not data:
        return data

    numeric_values = []
    for row in data:
        if not isinstance(row, dict):
            continue
        value = row.get("value")
        if isinstance(value, (int, float)):
            numeric_values.append(float(value))

    if not numeric_values:
        return data

    max_abs = max(abs(v) for v in numeric_values)
    # Only scale when values clearly look like ratios.
    if max_abs > 1.0:
        return data

    normalized = []
    for row in data:
        if isinstance(row, dict) and isinstance(row.get("value"), (int, float)):
            normalized.append({**row, "value": round(float(row["value"]) * 100.0, 2)})
        else:
            normalized.append(row)
    return normalized


def _get_target_distribution(df: pd.DataFrame, target_col: str) -> List[Dict]:
    """Get target column distribution with domain-aware labels."""
    if not target_col or target_col not in df.columns:
        return []
    data = _safe_value_counts(df, target_col, limit=5)
    for d in data:
        d['name'] = _format_categorical_value(target_col, d['name'])
    return data


def _distribution_chart(
    df: pd.DataFrame,
    col: str,
    title: str,
    confidence: str = "MEDIUM",
    reason: str = "",
    value_label: str = "Records",
    prefer_pie: bool = True,
) -> Optional[ChartRecommendation]:
    """
    DA-grade cardinality router for distribution charts.

    Rules:
      <= 5 unique  ->  pie (clean, all values shown)
      6 - 14       ->  donut (top values + Others bucket)
      15+          ->  hbar (top 15, horizontal bar for readability)
    """
    if col not in df.columns:
        return None

    nuniq = df[col].nunique()
    if nuniq < 1:
        return None

    if nuniq <= 5:
        data = _safe_value_counts(df, col, limit=5)
        chart_type = "pie" if prefer_pie else "donut"
    elif nuniq <= 14:
        data = _safe_value_counts(df, col, limit=10)
        chart_type = "donut"
    else:
        data = _safe_value_counts(df, col, limit=10)
        data = [d for d in data if d["name"] != "Others"]
        chart_type = "hbar"

    if not data:
        return None

    # Format categorical values with column-specific semantics (Yes/No for Partner, etc.)
    for d in data:
        d['name'] = _format_categorical_value(col, d['name'])

    return ChartRecommendation(
        slot="",
        title=title,
        chart_type=chart_type,
        data=data,
        confidence=confidence,
        reason=reason,
        value_label=value_label,
        dimension=col,
        metric=None,
        aggregation="count"
    )

def _get_target_by_segment(df: pd.DataFrame, target_col: str, segment_col: str) -> List[Dict]:
    """Get target counts by segment."""
    if not target_col or not segment_col:
        return []
    
    try:
        positive_keywords = ['yes', 'true', '1', 'churned', 'converted', 'active']
        df_temp = df.copy()
        df_temp['_positive'] = df_temp[target_col].astype(str).str.lower().isin(positive_keywords).astype(int)
        grouped = df_temp.groupby(segment_col)['_positive'].sum().sort_values(ascending=False).head(10)
        return [{"name": str(k), "value": int(v)} for k, v in grouped.items()]
    except Exception:
        return []


def _get_time_trend(df: pd.DataFrame, date_col: str, value_col: str, aggregation: Optional[str] = None) -> List[Dict]:
    """Get time trend data."""
    if not date_col or not value_col:
        return []
    
    try:
        df_temp = df.copy()
        df_temp[date_col] = _safe_to_datetime(df_temp[date_col])
        # Force numeric metric values for stable trend aggregation.
        if value_col in df_temp.columns:
            df_temp[value_col] = _coerce_numeric_metric_series(df_temp[value_col])

        df_temp = df_temp.dropna(subset=[date_col, value_col])
        df_temp = df_temp.sort_values(date_col)
        
        # Always compute trend at month-year granularity for dashboard consistency.
        freq = 'MS'  # Monthly (month start)
            
        agg = str(aggregation or '').strip().lower()
        if agg in {'avg', 'mean'}:
            trend = df_temp.groupby(pd.Grouper(key=date_col, freq=freq))[value_col].mean()
        elif agg == 'count':
            trend = df_temp.groupby(pd.Grouper(key=date_col, freq=freq))[value_col].count()
        elif _should_average_metric(value_col):
            trend = df_temp.groupby(pd.Grouper(key=date_col, freq=freq))[value_col].mean()
        else:
            trend = df_temp.groupby(pd.Grouper(key=date_col, freq=freq))[value_col].sum()
        result = []
        for k, v in trend.items():
            if not pd.notna(v):
                continue
            ts_label, ts_date = _to_trend_point_key(k)
            if ts_label is None:
                continue  # Skip NaT / poison timestamps
            result.append({
                "timestamp": ts_label,
                "date": ts_date,
                "value": _safe_float(v),
            })
        return result
    except Exception:
        return []

def _get_yoy_comparison(df: pd.DataFrame, date_col: str, value_col: str) -> List[Dict]:
    """Get Year-over-Year comparison data."""
    if not date_col or not value_col:
        return []
        
    try:
        df_temp = df.dropna(subset=[date_col, value_col]).copy()
        dates = _safe_to_datetime(df_temp[date_col])
        valid_mask = dates.notna()
        df_temp = df_temp[valid_mask]
        dates = dates[valid_mask]
        
        if df_temp.empty:
            return []
            
        df_temp['year'] = dates.dt.year
        
        # Only do YoY if we have multiple years
        if df_temp['year'].nunique() < 2:
            return []
            
        if _should_average_metric(value_col):
            grp = df_temp.groupby('year')[value_col].mean().sort_index()
        else:
            grp = df_temp.groupby('year')[value_col].sum().sort_index()
        return [{"name": str(k), "value": float(v)} for k, v in grp.items() if pd.notna(v)]
    except Exception:
        return []

def _get_ytd_comparison(df: pd.DataFrame, date_col: str, value_col: str) -> List[Dict]:
    """Get Year-to-Date comparison data for the current vs previous year."""
    if not date_col or not value_col:
        return []
        
    try:
        df_temp = df.dropna(subset=[date_col, value_col]).copy()
        dates = _safe_to_datetime(df_temp[date_col])
        valid_mask = dates.notna()
        df_temp = df_temp[valid_mask]
        dates = dates[valid_mask]
        
        if df_temp.empty:
            return []
        
        # Extract date properties
        max_date = dates.max()
        current_year = max_date.year
        prev_year = current_year - 1
        
        df_temp['year'] = dates.dt.year
        # Handle leap years safely
        df_temp['month_day'] = dates.dt.strftime('%m%d')
        max_month_day = max_date.strftime('%m%d')
        
        # Filter for YTD (Jan 1 to max_month_day in both years)
        ytd_df = df_temp[(df_temp['month_day'] <= max_month_day) & (df_temp['year'].isin([current_year, prev_year]))]
        
        if ytd_df.empty or ytd_df['year'].nunique() < 1: # Require at least current year
            return []
            
        if _should_average_metric(value_col):
            grp = ytd_df.groupby('year')[value_col].mean().sort_index()
        else:
            grp = ytd_df.groupby('year')[value_col].sum().sort_index()
            
        return [{"name": f"{int(k)} YTD", "value": float(v)} for k, v in grp.items() if pd.notna(v)]
    except Exception:
        return []


def _get_scatter_data(df: pd.DataFrame, x_col: str, y_col: str, limit: int = 100, label_col: Optional[str] = None) -> List[Dict]:
    """Get scatter plot data with optional labels for tooltips. Filters NaN/inf."""
    try:
        # Find a good label column if not specified - prioritize names over IDs
        if label_col is None:
            # Priority 1: Human-readable names (product, category, name)
            name_keywords = ['productname', 'product_name', 'itemname', 'item_name', 'name', 
                            'category', 'subcategory', 'description', 'title']
            for col in df.columns:
                col_lower = col.lower().replace('_', '').replace('-', '')
                if any(kw.replace('_', '') in col_lower for kw in name_keywords):
                    # Avoid columns that are just "name" but are IDs
                    if df[col].dtype == 'object' and df[col].str.len().mean() > 3:
                        label_col = col
                        break
            
            # Priority 2: Skip IDs entirely - they're not useful for humans
            # Only use IDs as last resort if no name columns found
        
        # Sample data
        cols_to_use = [x_col, y_col]
        if label_col and label_col in df.columns:
            cols_to_use.append(label_col)
        
        sample = df[cols_to_use].dropna().head(limit)
        
        result = []
        for _, row in sample.iterrows():
            x_val = _safe_float(row[x_col], default=None)
            y_val = _safe_float(row[y_col], default=None)
            # Skip rows where either coordinate is NaN/inf after coercion
            if not pd.notna(x_val) or not pd.notna(y_val):
                continue
            point = {
                "x": x_val, 
                "y": y_val,
                "xLabel": _beautify_column_name(x_col),
                "yLabel": _beautify_column_name(y_col)
            }
            # Add label for tooltip only if it's a meaningful name
            if label_col and label_col in row:
                label_val = str(row[label_col])[:30]  # Truncate long labels
                if _is_poison_value(label_val):
                    pass  # Don't add poison labels
                elif len(label_val) > 5 or not label_val.replace('_', '').replace('-', '').isdigit():
                    point["label"] = label_val
            result.append(point)
        
        return result
    except Exception:
        return []


# =============================================================================

# =============================================================================
# Domain-Specific Chart Generators
# =============================================================================

# ---------------------------------------------------------------------------
# Churn Helpers (domain-agnostic)
# ---------------------------------------------------------------------------

