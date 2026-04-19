"""
KPI Engine - Generates calculated KPIs based on domain and data.

Provides domain-specific KPIs with calculated metrics (rates, ratios, comparisons).
"""

import logging
import re
from typing import Dict, Any, List, Optional
from dataclasses import dataclass
import warnings
import pandas as pd
from .domain_detector import DomainType
from .column_filter import ColumnClassification

logger = logging.getLogger(__name__)


def _safe_to_datetime(series: pd.Series) -> pd.Series:
    """Parse mixed date formats without noisy parser warnings."""
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", UserWarning)
        try:
            return pd.to_datetime(series, errors='coerce', format='mixed', dayfirst=True)
        except (TypeError, ValueError):
            return pd.to_datetime(series, errors='coerce', dayfirst=True)


def _beautify_column_name(col: str) -> str:
    """Convert column name to professional business term."""
    # Basic cleanup: totalcharges -> Total Charges, monthly_charges -> Monthly Charges
    # This is a local copy of the formatter to avoid circular imports
    return col.replace('_', ' ').replace('-', ' ').title()


@dataclass
class KPI:
    """Represents a single KPI."""
    key: str
    title: str
    value: Any
    format: str  # number, currency, percent, text
    icon: str    # icon type for frontend
    confidence: str  # HIGH, MEDIUM, LOW
    reason: str
    trend: Optional[float] = None  # percentage change (e.g., 14.5 for +14.5%)
    trend_label: Optional[str] = None  # e.g., "vs Last Month"
    subtitle: Optional[str] = None  # e.g., "209 unique orders"


def _find_column(df: pd.DataFrame, keywords: List[str], classification: ColumnClassification, search_excluded: bool = False) -> Optional[str]:
    """Find a column matching any of the keywords using fuzzy semantic matching."""
    all_cols = classification.metrics + classification.dimensions + classification.targets
    if search_excluded:
        all_cols = all_cols + classification.excluded

    # Primary: semantic resolver (handles abbreviations, CamelCase, fuzzy)
    try:
        from .semantic_resolver import find_column as semantic_find
        result = semantic_find(keywords, all_cols, threshold=0.55)
        if result:
            return result
    except ImportError:
        pass

    # Fallback: simple substring matching
    for keyword in keywords:
        for col in all_cols:
            if keyword.lower() in col.lower().replace("_", ""):
                return col
    return None


def _safe_sum(df: pd.DataFrame, col: str) -> float:
    """Safely sum a column with numeric coercion."""
    if col and col in df.columns:
        return float(pd.to_numeric(df[col], errors='coerce').sum())
    return 0.0


def _safe_mean(df: pd.DataFrame, col: str) -> float:
    """Safely calculate mean of a column with numeric coercion."""
    if col and col in df.columns:
        return float(pd.to_numeric(df[col], errors='coerce').mean())
    return 0.0


def _normalized_col(col: str) -> str:
    return str(col).lower().replace("_", "").replace("-", "").strip()


def _is_effectively_numeric(series: pd.Series) -> bool:
    """Treat numeric-like string columns as numeric if enough values coerce."""
    if pd.api.types.is_numeric_dtype(series):
        return True
    coerced = pd.to_numeric(series, errors='coerce')
    return coerced.notna().mean() >= 0.5


def _is_lifecycle_column(col: str) -> bool:
    normalized_words = re.sub(r'[^a-z0-9]+', ' ', str(col).lower()).strip()
    compact_name = _normalized_col(col)

    explicit_compound_fields = {
        'accountage',
        'yearsatcompany',
        'totalworkingyears',
        'lengthofstay',
        'monthsofservice',
        'monthstenure',
        'tenuremonths',
    }
    if compact_name in explicit_compound_fields:
        return True

    # Word-boundary matching avoids false positives like "monthlycharges".
    lifecycle_pattern = re.compile(
        r'\b(age|tenure|duration|experience|seniority|vintage|months?|years?|days?)\b'
    )
    if lifecycle_pattern.search(normalized_words):
        return True

    return bool(re.search(r'\b(account age|length of stay)\b', normalized_words))


def _is_financial_column(col: str) -> bool:
    name = _normalized_col(col)
    financial_tokens = [
        'revenue', 'sales', 'amount', 'charge', 'charges', 'monthlycharge',
        'billing', 'bill', 'income', 'salary', 'balance', 'limit', 'cost',
        'fee', 'spend', 'payment', 'mrr', 'arr', 'arpu', 'ltv', 'clv'
    ]
    return any(tok in name for tok in financial_tokens)


def _pick_best_churn_value_metric(candidates: List[str]) -> Optional[str]:
    """
    Select best monetary metric for churn KPIs.

    Preference order:
    1) Total/annual/lifetime revenue-like columns (e.g. TotalCharges, AnnualRevenue)
    2) Generic revenue/value columns that are not monthly
    3) Monthly revenue-like columns as fallback
    """
    if not candidates:
        return None

    normalized = [(_normalized_col(c), c) for c in candidates]

    total_like = (
        'total', 'annual', 'yearly', 'arr', 'lifetime', 'ltv',
        'totalrevenue', 'grossrevenue', 'totalcharge', 'totalcharges'
    )
    revenue_like = (
        'revenue', 'sales', 'income', 'billing', 'amount', 'charge', 'charges', 'value'
    )
    monthly_like = ('monthly', 'month', 'mrr')

    for n, c in normalized:
        if any(t in n for t in total_like) and any(t in n for t in revenue_like):
            return c

    for n, c in normalized:
        if any(t in n for t in revenue_like) and not any(t in n for t in monthly_like):
            return c

    for n, c in normalized:
        if any(t in n for t in monthly_like) and any(t in n for t in revenue_like):
            return c

    return candidates[0]


def _count_target_positive(df: pd.DataFrame, target_col: str) -> int:
    """Count positive cases in target column."""
    if not target_col or target_col not in df.columns:
        return 0
    
    positive_keywords = ['yes', 'true', '1', 'churned', 'converted', 'active', 'positive']
    
    for val in df[target_col].dropna().unique():
        if str(val).lower() in positive_keywords:
            return int((df[target_col].astype(str).str.lower() == str(val).lower()).sum())
    
    # No recognized positive keyword found — return 0 instead of guessing
    logger.warning(
        "Could not detect positive class for column '%s' (unique values: %s). Returning 0.",
        target_col,
        list(df[target_col].dropna().unique()[:10]),
    )
    return 0


_MARKETING_POSITIVE_KEYWORDS = {
    '1', '1.0', 'yes', 'true', 'converted', 'conversion', 'won', 'success', 'qualified'
}
_MARKETING_NEGATIVE_KEYWORDS = {
    '0', '0.0', 'no', 'false', 'not converted', 'lost', 'failed', 'unqualified'
}


def _to_numeric_series(series: pd.Series) -> pd.Series:
    """Coerce common numeric-like strings (currency/percent) into numeric values."""
    if pd.api.types.is_numeric_dtype(series):
        return pd.to_numeric(series, errors='coerce')

    cleaned = (
        series.astype(str)
        .str.strip()
        .str.replace(r'[$£€₹,]', '', regex=True)
        .str.replace('%', '', regex=False)
    )
    return pd.to_numeric(cleaned, errors='coerce')


def _is_rate_metric_name(col: str) -> bool:
    """Detect whether a metric name semantically represents a rate/ratio."""
    name = _normalized_col(col)
    rate_tokens = [
        'rate', 'ratio', 'percentage', 'percent', 'pct',
        'ctr', 'cvr', 'clickthrough', 'conversionrate'
    ]
    return any(tok in name for tok in rate_tokens)


def _infer_rate_scale(values: pd.Series) -> Optional[str]:
    """Infer whether rate values are stored as ratios (0-1) or percents (0-100)."""
    vals = values.dropna()
    if vals.empty:
        return None

    q95 = float(vals.quantile(0.95))
    q05 = float(vals.quantile(0.05))

    # Typical ratio scale: 0.00 - 1.00
    if -0.05 <= q05 and q95 <= 1.5:
        return 'ratio'

    # Typical percent scale: 0.0 - 100.0
    if -5.0 <= q05 and q95 <= 100.0:
        return 'percent'

    return None


def _rate_series_to_percent(series: pd.Series, weight_series: Optional[pd.Series] = None) -> Optional[float]:
    """Convert a rate-like series to a percent value, optionally weighted by exposure."""
    values = _to_numeric_series(series)
    if values.dropna().empty:
        return None

    if weight_series is not None:
        weights = _to_numeric_series(weight_series)
        mask = values.notna() & weights.notna() & (weights > 0)
        if mask.any():
            weighted_mean = float((values[mask] * weights[mask]).sum() / weights[mask].sum())
            scale = _infer_rate_scale(values[mask])
            if scale == 'ratio':
                return weighted_mean * 100.0
            if scale == 'percent':
                return weighted_mean

    mean_val = float(values.mean())
    scale = _infer_rate_scale(values)
    if scale == 'ratio':
        return mean_val * 100.0
    if scale == 'percent':
        return mean_val

    return None


def _binary_positive_share_percent(series: pd.Series) -> Optional[float]:
    """Return positive-class share (%) for binary encoded series, otherwise None."""
    numeric = _to_numeric_series(series)
    numeric_coverage = float(numeric.notna().mean())

    if numeric_coverage >= 0.8:
        unique_vals = set(numeric.dropna().round(6).unique().tolist())
        if unique_vals and unique_vals.issubset({0.0, 1.0}):
            denominator = int(numeric.notna().sum())
            if denominator > 0:
                return float((numeric == 1).sum() / denominator * 100.0)

    normalized = series.astype(str).str.strip().str.lower()
    normalized = normalized[~normalized.isin({'', 'nan', 'none', 'null'})]
    if normalized.empty:
        return None

    unique_tokens = set(normalized.unique().tolist())
    valid_tokens = _MARKETING_POSITIVE_KEYWORDS | _MARKETING_NEGATIVE_KEYWORDS
    if unique_tokens and unique_tokens.issubset(valid_tokens):
        return float(normalized.isin(_MARKETING_POSITIVE_KEYWORDS).mean() * 100.0)

    return None


def _marketing_metric_role(col: str) -> str:
    """Classify marketing metric semantics for dynamic KPI generation."""
    name = _normalized_col(col)

    if _is_rate_metric_name(col) or any(tok in name for tok in ['engagementrate', 'bouncerate', 'openrate']):
        return 'percent_rate'

    if any(tok in name for tok in ['roas', 'returnonadspend']):
        return 'ratio'

    if any(tok in name for tok in ['roi', 'returnoninvestment']):
        return 'percent_rate'

    if any(tok in name for tok in ['cpc', 'cpa', 'cpm', 'cpl', 'cpv', 'costper', 'spendper']):
        return 'currency_avg'

    if any(tok in name for tok in ['spend', 'cost', 'budget', 'revenue', 'income']):
        return 'currency_sum'

    if any(tok in name for tok in ['impression', 'view', 'click', 'conversion', 'lead', 'signup', 'session', 'visit', 'reach']):
        return 'volume_sum'

    if any(tok in name for tok in ['score', 'index', 'quality']):
        return 'number_avg'

    return 'number_sum'


def _marketing_metric_icon(role: str, col: str) -> str:
    name = _normalized_col(col)
    if 'click' in name:
        return 'mouse-pointer'
    if 'impression' in name or 'view' in name or 'reach' in name:
        return 'eye'
    if 'conversion' in name or 'lead' in name or 'signup' in name:
        return 'check-circle'
    if role in {'percent_rate', 'ratio'}:
        return 'target'
    if role.startswith('currency'):
        return 'dollar'
    return 'bar-chart'


def _is_identifier_like_metric(col: str) -> bool:
    """Return True when a metric name looks like an identifier/code rather than a business measure."""
    name = _normalized_col(col)
    if not name:
        return False

    identifier_tokens = ['id', 'key', 'uuid', 'guid', 'index', 'row', 'record', 'code']
    if name in {'id', 'key', 'uuid', 'guid', 'index', 'row'}:
        return True

    if name.endswith('_id') or name.endswith('id'):
        return True

    if any(token in name for token in ['campaignid', 'adid', 'userid', 'customerid', 'orderid', 'productid']):
        return True

    # Split on non-alphanumerics to avoid false positives like 'paid'.
    words = re.sub(r'[^a-z0-9]+', ' ', name).split()
    return any(word in identifier_tokens for word in words)


def _marketing_groupby_aggregate(df: pd.DataFrame, dim_col: str, metric_col: str, role: str) -> Optional[pd.Series]:
    """Compute a robust grouped aggregate for marketing insight KPIs."""
    if dim_col not in df.columns or metric_col not in df.columns:
        return None

    frame = pd.DataFrame({
        '_dim': df[dim_col],
        '_metric': _to_numeric_series(df[metric_col]),
    }).dropna(subset=['_dim', '_metric'])

    if frame.empty:
        return None

    if role == 'percent_rate':
        grouped = frame.groupby('_dim')['_metric'].mean()
        if grouped.empty:
            return None

        # If grouped means look ratio-scale, convert to percent-scale for KPI display.
        scale = _infer_rate_scale(grouped)
        if scale == 'ratio':
            grouped = grouped * 100.0
        return grouped

    if role in {'currency_avg', 'number_avg', 'ratio'}:
        return frame.groupby('_dim')['_metric'].mean()

    return frame.groupby('_dim')['_metric'].sum()


def _find_marketing_entity_identifier(df: pd.DataFrame, classification: ColumnClassification) -> Optional[tuple[str, str]]:
    """Find a marketing entity identifier column and return (column_name, entity_label)."""
    ordered_cols: List[str] = []
    for col in (classification.excluded or []) + (classification.dimensions or []) + (classification.metrics or []):
        if col in df.columns and col not in ordered_cols:
            ordered_cols.append(col)

    entity_map = [
        ('campaign', 'Campaigns'),
        ('adgroup', 'Ad Groups'),
        ('adset', 'Ad Sets'),
        ('creative', 'Creatives'),
        ('keyword', 'Keywords'),
        ('placement', 'Placements'),
        ('channel', 'Channels'),
        ('source', 'Sources'),
        ('ad', 'Ads'),
    ]
    identifier_hints = ['id', 'key', 'code', 'name']

    for col in ordered_cols:
        name = _normalized_col(col)
        if not name:
            continue

        matched_entity = next((label for token, label in entity_map if token in name), None)
        if not matched_entity:
            continue

        if not any(h in name for h in identifier_hints):
            continue

        non_null = int(df[col].notna().sum())
        if non_null <= 0:
            continue

        return col, matched_entity

    return None


# =============================================================================
# Domain-Specific KPI Generators
# =============================================================================


def _generate_sales_kpis(df: pd.DataFrame, classification: ColumnClassification) -> List[KPI]:
    """Generate KPIs for Sales domain - answers key business questions."""
    kpis = []
    
    # Find key columns
    revenue_col = _find_column(df, ['revenue', 'sales', 'amount', 'total_sales', 'totalsales'], classification)
    profit_col = _find_column(df, ['profit', 'gross_profit', 'net_profit'], classification)
    quantity_col = _find_column(df, ['quantity', 'qty', 'units', 'volume', 'order_quantity', 'ordered'], classification)
    discount_col = _find_column(df, ['discount', 'discount_amount', 'discount_percent'], classification)
    customer_col = _find_column(df, ['customer', 'customerid', 'customer_id', 'client'], classification)
    
    # Improved Order Identifier Logic:
    # 1. Search for explicit ID/Number columns first
    order_col = _find_column(df, ['orderid', 'order_id', 'invoiceid', 'invoice_no', 'invoiceno', 'orderno', 'order_number', 'transaction_id', 'transactionid'], classification, search_excluded=True)
    
    # 2. Fallback to broader terms if no explicit ID found
    if not order_col:
        order_col = _find_column(df, ['order', 'invoice', 'transaction', 'ref'], classification, search_excluded=True)

    # 3. False Positive Check (Line Item IDs vs Grouping IDs):
    # If the column is unique for every row (cardinality 1:1), it's likely a Line ID.
    # We should prefer a column that has SOME duplicates (grouping items into orders).
    if order_col:
        nunique = df[order_col].nunique()
        if nunique == len(df) and len(df) > 1:
            # This is a Line ID. Try to find a Grouping ID (Invoice/OrderNo)
            # We search for the same keywords but exclude the current 1:1 column
            broader_keywords = ['orderid', 'invoice', 'orderno', 'parent_id', 'transactionid']
            # Create a temporary classification with the current col removed
            temp_classification = ColumnClassification(
                metrics=[m for m in classification.metrics if m != order_col],
                dimensions=[d for d in classification.dimensions if d != order_col],
                excluded=[e for e in classification.excluded if e != order_col],
                targets=classification.targets
            )
            broader_col = _find_column(df, broader_keywords, temp_classification, search_excluded=True)
            if broader_col and broader_col != order_col:
                # Only switch if the broader col isn't also 1:1
                if df[broader_col].nunique() < len(df):
                    order_col = broader_col

    # 4. Cardinality Guard: Still reject extremely low cardinality (likely categories)
    if order_col:
        nunique = df[order_col].nunique()
        if len(df) > 50 and nunique < 5:
            order_col = None
    
    total_orders = df[order_col].nunique() if order_col else len(df)
    product_col = _find_column(df, ['product', 'item', 'sku', 'category'], classification)
    region_col = _find_column(df, ['region', 'market', 'zone', 'territory'], classification)
    state_col = _find_column(df, ['state', 'province'], classification)

    # Fallback discovery from dimensions when semantic search misses.
    if not product_col or not region_col or not state_col:
        for dim in classification.dimensions:
            dim_lower = dim.lower().replace('_', '')
            if not product_col and any(kw in dim_lower for kw in ['product', 'item', 'sku', 'category']):
                product_col = dim
            if not region_col and any(kw in dim_lower for kw in ['region', 'market', 'zone', 'territory']):
                region_col = dim
            if not state_col and any(kw in dim_lower for kw in ['state', 'province']):
                state_col = dim

    total_customers = df[customer_col].nunique() if customer_col else None
    
    # =========================================================================
    # TIME-SERIES PREPARATION (for MoM / Comparative KPIs)
    # =========================================================================
    date_col = classification.dates[0] if classification.dates else None
    
    # We create two dataframes: df_curr (last 30 days of data footprint) and df_prev (prior 30 days)
    df_curr = df
    df_prev = None
    has_trend = False
    
    # YTD Dataframes
    df_ytd_curr = None
    df_ytd_prev = None
    df_full_prev_year = None
    
    if date_col and date_col in df.columns:
        try:
            # Safely coercing to datetime just for the bounding box
            dates = _safe_to_datetime(df[date_col])
            if not dates.isna().all():
                max_date = dates.max()
                
                # Slicing blocks
                curr_start = max_date - pd.Timedelta(days=30)
                prev_start = curr_start - pd.Timedelta(days=30)
                
                mask_curr = (dates > curr_start) & (dates <= max_date)
                mask_prev = (dates > prev_start) & (dates <= curr_start)
                
                df_curr_slice = df[mask_curr]
                df_prev_slice = df[mask_prev]
                
                # Only activate trend logic if we actually captured data in both windows
                if len(df_curr_slice) > 0 and len(df_prev_slice) > 0:
                    df_curr = df_curr_slice
                    df_prev = df_prev_slice
                    has_trend = True
                    
                # YTD DataFrames — apples-to-apples comparison
                # Both years filtered to same month-day window
                try:
                    df_ts = df.copy()
                    df_ts['__year'] = dates.dt.year
                    df_ts['__month_day'] = dates.dt.strftime('%m%d')
                    
                    max_md = max_date.strftime('%m%d')
                    curr_yr = max_date.year
                    prev_yr = curr_yr - 1
                    
                    # YTD: Jan 1 to current date equivalent in each year
                    df_ytd_curr = df_ts[(df_ts['__year'] == curr_yr) & (df_ts['__month_day'] <= max_md)]
                    df_ytd_prev = df_ts[(df_ts['__year'] == prev_yr) & (df_ts['__month_day'] <= max_md)]
                    
                    # Full previous year (for reference KPI only)
                    df_full_prev_year = df_ts[df_ts['__year'] == prev_yr]
                except Exception as e:
                    logger.warning(f"YoY/YTD prep failed: {e}")
                    pass
        except Exception as e:
            logger.warning(f"Time-series scoping failed: {e}")
            pass
            
    def _calc_trend(curr_val: float, prev_val: float) -> Optional[float]:
        """Calculates percentage shift natively"""
        if prev_val == 0 or prev_val is None or pd.isna(prev_val):
            return None
        return round(((curr_val - prev_val) / prev_val) * 100, 1)

    # =========================================================================
    # BUSINESS QUESTION: "Are we growing?"
    # =========================================================================
    
    # 1. Total Revenue (Primary KPI)
    total_revenue = 0
    if revenue_col:
        total_revenue = _safe_sum(df, revenue_col)
        
        # Calculate Trend (prefer YTD trend for executive view if available)
        trend = None
        trend_label = None
        
        if df_ytd_curr is not None and not df_ytd_curr.empty:
            ytd_curr_rev = _safe_sum(df_ytd_curr, revenue_col)
            ytd_prev_rev = _safe_sum(df_ytd_prev, revenue_col) if df_ytd_prev is not None else 0
            trend = _calc_trend(ytd_curr_rev, ytd_prev_rev)
            if trend is not None:
                trend_label = "YoY (YTD)"
        
        if trend is None and has_trend and df_prev is not None:
            curr_rev = _safe_sum(df_curr, revenue_col)
            prev_rev = _safe_sum(df_prev, revenue_col)
            trend = _calc_trend(curr_rev, prev_rev)
            if trend is not None:
                trend_label = "30d momentum"
            
        kpis.append(KPI(
            key="total_revenue",
            title="Total Revenue",
            value=total_revenue,
            format="currency",
            icon="dollar",
            confidence="HIGH",
            reason="Sum of all revenue in dataset",
            trend=trend,
            trend_label=trend_label
        ))
        
        # New KPIs for YTD and Last Year Revenue
        try:
            if df_ytd_curr is not None and not df_ytd_curr.empty:
                ytd_curr_rev = _safe_sum(df_ytd_curr, revenue_col)
                kpis.append(KPI(
                    key="ytd_revenue",
                    title="YTD Revenue",
                    value=ytd_curr_rev,
                    format="currency",
                    icon="activity",
                    confidence="HIGH",
                    reason=f"Revenue from Jan 1 to {max_date.strftime('%b %d') if 'max_date' in locals() else 'today'}"
                ))
                
            if df_full_prev_year is not None and not df_full_prev_year.empty:
                full_prev_rev = _safe_sum(df_full_prev_year, revenue_col)
                kpis.append(KPI(
                    key="prev_year_revenue",
                    title="Previous Year Revenue",
                    value=full_prev_rev,
                    format="currency",
                    icon="calendar",
                    confidence="HIGH",
                    reason="Total bottom-line from the complete previous year"
                ))
        except Exception as e:
            logger.warning(f"Failed to append YTD/YoY cards: {e}")
    
    # 2. Sales Volume (Quantity)
    if quantity_col:
        total_quantity = _safe_sum(df, quantity_col)
        
        trend = None
        if has_trend and df_prev is not None:
            curr_qty = _safe_sum(df_curr, quantity_col)
            prev_qty = _safe_sum(df_prev, quantity_col)
            trend = _calc_trend(curr_qty, prev_qty)
            
        kpis.append(KPI(
            key="sales_volume",
            title="Sales Volume",
            value=int(total_quantity),
            format="number",
            icon="package",
            confidence="HIGH",
            reason="Total units sold",
            trend=trend,
            trend_label="30d momentum" if trend is not None else None
        ))
    
    # 3. Average Order Value (AOV)
    if revenue_col and total_orders > 0:
        aov = total_revenue / total_orders
        
        trend = None
        if has_trend and df_prev is not None and df_curr is not None:
            curr_orders = df_curr[order_col].nunique() if order_col and order_col in df_curr.columns else len(df_curr)
            prev_orders = df_prev[order_col].nunique() if order_col and order_col in df_prev.columns else len(df_prev)
            
            curr_aov = _safe_sum(df_curr, revenue_col) / curr_orders if curr_orders > 0 else 0
            prev_aov = _safe_sum(df_prev, revenue_col) / prev_orders if prev_orders > 0 else 0
            trend = _calc_trend(curr_aov, prev_aov)
            
        kpis.append(KPI(
            key="aov",
            title="Avg Order Value",
            value=round(aov, 2),
            format="currency",
            icon="shopping-cart",
            confidence="HIGH",
            reason="Revenue / Orders",
            trend=trend,
            trend_label="30d momentum" if trend is not None else None
        ))
    
    # =========================================================================
    # BUSINESS QUESTION: "Where is revenue leaking?"
    # =========================================================================
    
    # 4. Gross Margin %
    if profit_col and revenue_col and total_revenue > 0:
        total_profit = _safe_sum(df, profit_col)
        margin = (total_profit / total_revenue) * 100
        kpis.append(KPI(
            key="gross_margin",
            title="Gross Margin",
            value=round(margin, 1),
            format="percent",
            icon="percent",
            confidence="HIGH",
            reason="Profit / Revenue × 100"
        ))
    
    # 5. Discount Impact %
    if discount_col and revenue_col and total_revenue > 0:
        total_discount = _safe_sum(df, discount_col)
        # Check if discount is a ratio (mean < 1 means values like 0.2, 0.15)
        col_mean = _safe_mean(df, discount_col)
        if col_mean < 1:  # It's a ratio/percentage column
            discount_impact = col_mean * 100  # Average discount rate
        else:
            discount_impact = (total_discount / total_revenue) * 100
        kpis.append(KPI(
            key="discount_impact",
            title="Discount Impact",
            value=round(discount_impact, 1),
            format="percent",
            icon="alert-triangle",
            confidence="HIGH",
            reason="Avg discount rate" if col_mean < 1 else "Discount / Revenue"
        ))
    
    # 6. Total Profit
    if profit_col:
        total_profit = _safe_sum(df, profit_col)
        kpis.append(KPI(
            key="total_profit",
            title="Total Profit",
            value=total_profit,
            format="currency",
            icon="trending-up",
            confidence="HIGH",
            reason="Sum of profit"
        ))
    
    # =========================================================================
    # BUSINESS QUESTION: "What drives performance?"
    # =========================================================================
    
    # 7. Revenue per Customer
    if revenue_col and total_customers and total_customers > 0:
        rev_per_customer = total_revenue / total_customers
        kpis.append(KPI(
            key="revenue_per_customer",
            title="Revenue/Customer",
            value=round(rev_per_customer, 2),
            format="currency",
            icon="users",
            confidence="HIGH",
            reason="Revenue / Unique Customers"
        ))
    
    # 8. Total Orders
    # Main value = total records (line items).
    # Subtitle = unique order identifiers (if found).
    total_records = len(df)
    order_subtitle = None
    order_reason = "Total transaction line items"
    
    if order_col:
        unique_count = df[order_col].nunique()
        order_subtitle = f"{unique_count:,} unique orders"
        order_reason = f"Line items grouped by {order_col} ({unique_count} distinct)"

    kpis.append(KPI(
        key="total_orders",
        title="Total Orders",
        value=total_records,
        format="number",
        icon="shopping-cart",
        confidence="HIGH",
        reason=order_reason,
        subtitle=order_subtitle
    ))
    
    # 9. Top Region (Revenue-based if available, otherwise transaction volume)
    if region_col:
        try:
            if revenue_col and revenue_col in df.columns:
                top_region = df.groupby(region_col)[revenue_col].sum().idxmax()
                top_region_reason = "Region with highest revenue"
            else:
                top_region = df[region_col].value_counts().idxmax()
                top_region_reason = "Region with highest transaction volume"
            if len(str(top_region)) > 20:
                top_region = str(top_region)[:17] + "..."
            kpis.append(KPI(
                key="top_region",
                title="Top Region",
                value=str(top_region),
                format="text",
                icon="map",
                confidence="HIGH",
                reason=top_region_reason
            ))
        except:
            pass

    # 10. Top Performing State (Revenue-based if available, otherwise transaction volume)
    if state_col:
        try:
            if revenue_col and revenue_col in df.columns:
                top_state = df.groupby(state_col)[revenue_col].sum().idxmax()
                top_state_reason = "State with highest revenue"
            else:
                top_state = df[state_col].value_counts().idxmax()
                top_state_reason = "State with highest transaction volume"

            if len(str(top_state)) > 24:
                top_state = str(top_state)[:21] + "..."

            kpis.append(KPI(
                key="top_state",
                title="Top Performing State",
                value=str(top_state),
                format="text",
                icon="map-pin",
                confidence="HIGH",
                reason=top_state_reason
            ))
        except:
            pass
    
    # 11. Best Seller (prefer revenue; fallback to quantity/volume)
    if product_col:
        try:
            if revenue_col and revenue_col in df.columns:
                top_product = df.groupby(product_col)[revenue_col].sum().idxmax()
                top_product_reason = "Product with highest revenue"
            elif quantity_col and quantity_col in df.columns:
                top_product = df.groupby(product_col)[quantity_col].sum().idxmax()
                top_product_reason = "Product with highest units sold"
            else:
                top_product = df[product_col].value_counts().idxmax()
                top_product_reason = "Most frequently sold product"

            if len(str(top_product)) > 20:
                top_product = str(top_product)[:17] + "..."
            kpis.append(KPI(
                key="best_seller",
                title="Best Seller",
                value=str(top_product),
                format="text",
                icon="star",
                confidence="HIGH",
                reason=top_product_reason
            ))
        except:
            pass
    
    # =========================================================================
    # BUSINESS QUESTION: "Are customers buying more or just once?" (E-commerce)
    # =========================================================================
    
    # 11. Repeat Purchase Rate
    if customer_col and order_col:
        try:
            orders_per_customer = df.groupby(customer_col)[order_col].nunique()
            repeat_customers = (orders_per_customer > 1).sum()
            if total_customers and total_customers > 0:
                repeat_rate = (repeat_customers / total_customers) * 100
                kpis.append(KPI(
                    key="repeat_rate",
                    title="Repeat Rate",
                    value=round(repeat_rate, 1),
                    format="percent",
                    icon="refresh-cw",
                    confidence="HIGH",
                    reason="Customers with 2+ orders"
                ))
        except:
            pass
    
    # 12. Avg Orders per Customer (key customer behavior metric)
    if customer_col and total_customers and total_customers > 0:
        avg_orders = total_orders / total_customers
        kpis.append(KPI(
            key="avg_orders_per_customer",
            title="Orders/Customer",
            value=round(avg_orders, 1),
            format="number",
            icon="shopping-bag",
            confidence="HIGH",
            reason="Orders / Unique Customers"
        ))
    
    return kpis



def _generate_churn_kpis(df: pd.DataFrame, classification: ColumnClassification) -> List[KPI]:
    """Generate KPIs for Churn domain - works for Telco, Banking, SaaS, HR."""
    kpis = []
    
    # Find key columns using semantic hints
    target_col = classification.targets[0] if classification.targets else None
    
    # Build numeric candidate pool first, then apply strict semantic gates.
    numeric_candidates: List[str] = []
    for col in (classification.metrics + classification.dimensions):
        if col in df.columns and _is_effectively_numeric(df[col]):
            numeric_candidates.append(col)

    # Financial metric must be explicitly finance-like and not lifecycle/demographic.
    financial_candidates = [
        c for c in numeric_candidates
        if _is_financial_column(c) and not _is_lifecycle_column(c)
    ]
    value_col = _pick_best_churn_value_metric(financial_candidates)

    # Lifecycle metric (used for "at churn" average) prefers tenure/duration over age.
    tenure_like = [
        c for c in numeric_candidates
        if any(tok in _normalized_col(c) for tok in ['tenure', 'month', 'duration', 'yearsatcompany', 'experience', 'seniority'])
    ]
    age_like = [c for c in numeric_candidates if 'age' in _normalized_col(c)]
    lifecycle_col = (tenure_like[0] if tenure_like else (age_like[0] if age_like else None))

    contract_col = _find_column(df, ['contract', 'subscription_type', 'membership'], classification)
    
    # Churn Mask Detection (Handles strings "Yes", booleans True, and numeric 1/0)
    positive_keywords = ['yes', 'true', '1', '1.0', 'churned', 'exited', 'left', 'positive']
    churned_mask = None
    if target_col:
        mask_series = df[target_col].astype(str).str.lower().str.strip()
        churned_mask = mask_series.isin(positive_keywords)
        
    total_customers = len(df)
    churned_count = churned_mask.sum() if churned_mask is not None else 0
    
    # ── PRIMARY KPIs ──────────────────────────────────────────────────────────
    
    # 1. Total Base
    kpis.append(KPI(
        key="total_base",
        title="Total Customers" if 'tenure' in str(lifecycle_col).lower() else "Total Employees" if 'yearsatcompany' in str(lifecycle_col).lower() else "Total Base",
        value=total_customers,
        format="number",
        icon="users",
        confidence="HIGH",
        reason="Total record count in dataset"
    ))
    
    # 2. Churn / Attrition Rate
    if target_col and total_customers > 0:
        churn_rate = (churned_count / total_customers) * 100
        label = "Attrition" if 'attrition' in target_col.lower() else "Left" if 'left' in target_col.lower() else "Churn"
        kpis.append(KPI(
            key="churn_rate",
            title=f"{label} Rate",
            value=round(churn_rate, 1),
            format="percent",
            icon="trending-down",
            confidence="HIGH",
            reason=f"Percentage of customers where {target_col} indicates departure"
        ))
    
    # 3. Value at Risk (The financial impact)
    if value_col and churned_mask is not None:
        vals = pd.to_numeric(df.loc[churned_mask, value_col], errors='coerce')
        val_at_risk = vals.sum() if not vals.isna().all() else 0
        if val_at_risk > 0:
            kpis.append(KPI(
                key="value_at_risk",
                title=f"{_beautify_column_name(value_col)} at Risk",
                value=float(val_at_risk),
                format="currency" if any(h in value_col.lower() for h in ['charge', 'balance', 'salary', 'income']) else "number",
                icon="alert-triangle",
                confidence="HIGH",
                reason=f"Sum of {value_col} for customers identified as churned"
            ))

    # 4. Average Tenure / Age
    if lifecycle_col and churned_mask is not None:
        avg_tenure_churned = pd.to_numeric(df.loc[churned_mask, lifecycle_col], errors='coerce').mean()
        if pd.notna(avg_tenure_churned):
            normalized_lifecycle = _normalized_col(lifecycle_col)
            is_age_metric = 'age' in normalized_lifecycle
            is_year_metric = is_age_metric or any(tok in normalized_lifecycle for tok in ['year', 'years', 'yearsatcompany', 'totalworkingyears'])
            is_month_metric = any(tok in normalized_lifecycle for tok in ['month', 'months', 'monthsofservice', 'monthstenure', 'tenuremonths'])

            if is_year_metric:
                unit = 'years'
            elif is_month_metric:
                unit = 'months'
            else:
                unit = 'units'

            title_base = "Avg Age at Churn" if is_age_metric else "Avg Tenure at Churn"
            title = title_base if unit == 'units' else f"{title_base} ({unit.title()})"
            value_rounded = round(float(avg_tenure_churned), 1)
            kpis.append(KPI(
                key="tenure_at_churn",
                title=title,
                value=value_rounded,
                format="number",
                icon="clock",
                confidence="HIGH",
                reason=f"Mean {lifecycle_col} for churned users",
                subtitle=f"{value_rounded} {unit}"
            ))

    # 5. Domain Specifics (Banking Risk)
    credit_col = _find_column(df, ['creditscore', 'credit_score'], classification)
    if credit_col and churned_mask is not None:
        avg_credit_churned = pd.to_numeric(df.loc[churned_mask, credit_col], errors='coerce').mean()
        if pd.notna(avg_credit_churned):
            kpis.append(KPI(
                key="credit_risk",
                title="Avg Credit Score (Churn)",
                value=int(avg_credit_churned),
                format="number",
                icon="briefcase",
                confidence="HIGH",
                reason=f"Average {credit_col} for exited customers"
            ))

    # 6. Retention Rate (Holistic view)
    if target_col and total_customers > 0:
        retention_rate = ((total_customers - churned_count) / total_customers) * 100
        kpis.append(KPI(
            key="retention_rate",
            title="Retention Rate",
            value=round(retention_rate, 1),
            format="percent",
            icon="trending-up",
            confidence="HIGH",
            reason="Inverse of the churn rate"
        ))

    # 7. ARPU (Average Revenue Per User)
    arpu = 0
    if value_col:
        arpu = _safe_mean(df, value_col)
        if arpu > 0:
            kpis.append(KPI(
                key="arpu",
                title="ARPU",
                value=round(float(arpu), 2),
                format="currency" if value_col and any(h in value_col.lower() for h in ['charge', 'balance', 'salary', 'income']) else "number",
                icon="user-plus",
                confidence="HIGH",
                reason=f"Average {_beautify_column_name(value_col)} per customer",
                subtitle="Avg Revenue Per User"
            ))

    # 8. Customer Lifetime Value (LTV)
    # LTV = ARPU / Churn Rate
    if arpu > 0 and 'churn_rate' in locals() and churn_rate > 0:
        ltv = arpu / (churn_rate / 100)
        kpis.append(KPI(
            key="ltv",
            title="Estimated LTV",
            value=round(float(ltv), 2),
            format="currency" if value_col and any(h in value_col.lower() for h in ['charge', 'balance', 'salary', 'income']) else "number",
            icon="trending-up",
            confidence="MEDIUM",
            reason="ARPU / Churn Rate",
            subtitle="Customer Lifetime Value"
        ))
    elif arpu > 0 and lifecycle_col:
        # Fallback LTV estimate based on tenure if no churn detected
        avg_tenure = _safe_mean(df, lifecycle_col)
        ltv = arpu * avg_tenure
        kpis.append(KPI(
            key="ltv",
            title="Projected LTV",
            value=round(float(ltv), 2),
            format="currency" if value_col and any(h in value_col.lower() for h in ['charge', 'balance', 'salary', 'income']) else "number",
            icon="trending-up",
            confidence="LOW",
            reason="ARPU × Avg Tenure",
            subtitle="Projected Lifetime Value"
        ))

    # 9. Support Intensity (Tickets/Calls)
    ticket_col = _find_column(df, ['ticket', 'complaint', 'incident', 'call', 'support', 'issue'], classification)
    if ticket_col:
        total_tickets = _safe_sum(df, ticket_col)
        avg_tickets = total_tickets / total_customers if total_customers > 0 else 0
        kpis.append(KPI(
            key="support_intensity",
            title="Avg Support Tickets",
            value=round(float(avg_tickets), 2),
            format="number",
            icon="help-circle",
            confidence="HIGH",
            reason=f"Mean of {ticket_col} per customer",
            subtitle=f"{int(total_tickets)} total tickets"
        ))

    # 10. Service Ops KPIs (Tech/Admin tickets) for senior-level churn diagnostics
    tech_ticket_col = _find_column(
        df,
        ['techticket', 'tech_ticket', 'tech tickets', 'technicalticket', 'technical_ticket'],
        classification,
        search_excluded=True,
    )
    admin_ticket_col = _find_column(
        df,
        ['adminticket', 'admin_ticket', 'admin tickets', 'administrativeticket', 'administrative_ticket'],
        classification,
        search_excluded=True,
    )

    if tech_ticket_col and tech_ticket_col in df.columns:
        total_tech_tickets = _safe_sum(df, tech_ticket_col)
        kpis.append(KPI(
            key="total_tech_tickets",
            title="Total Tech Tickets",
            value=int(round(total_tech_tickets)),
            format="number",
            icon="settings",
            confidence="HIGH",
            reason=f"Sum of {tech_ticket_col}"
        ))

    if admin_ticket_col and admin_ticket_col in df.columns:
        total_admin_tickets = _safe_sum(df, admin_ticket_col)
        kpis.append(KPI(
            key="total_admin_tickets",
            title="Total Admin Tickets",
            value=int(round(total_admin_tickets)),
            format="number",
            icon="briefcase",
            confidence="HIGH",
            reason=f"Sum of {admin_ticket_col}"
        ))

    if tech_ticket_col and admin_ticket_col and tech_ticket_col in df.columns and admin_ticket_col in df.columns:
        tech_total = _safe_sum(df, tech_ticket_col)
        admin_total = _safe_sum(df, admin_ticket_col)
        total_service_tickets = tech_total + admin_total
        if total_service_tickets > 0:
            tech_share = (tech_total / total_service_tickets) * 100
            kpis.append(KPI(
                key="tech_ticket_share",
                title="Tech Ticket Share",
                value=round(tech_share, 1),
                format="percent",
                icon="pie-chart",
                confidence="HIGH",
                reason="Tech tickets / (Tech + Admin) × 100"
            ))

    # 11. High Value Churners (Count of churned customers above 75th percentile of value)
    if value_col and churned_mask is not None:
        try:
            q75 = df[value_col].quantile(0.75)
            high_value_churners = df[churned_mask & (df[value_col] > q75)]
            if len(high_value_churners) > 0:
                kpis.append(KPI(
                    key="hv_churners",
                    title="High Value Churners",
                    value=len(high_value_churners),
                    format="number",
                    icon="users",
                    confidence="MEDIUM",
                    reason=f"Count of churned users in top 25% of {value_col}",
                    subtitle=f"Above {round(q75, 0)} {value_col}"
                ))
        except:
            pass

    return kpis


def _generate_marketing_kpis(df: pd.DataFrame, classification: ColumnClassification) -> List[KPI]:
    """Generate KPIs for Marketing domain."""
    kpis = []

    # Primary volume columns
    imp_col = _find_column(df, ['impression', 'impressions', 'views'], classification)
    click_col = _find_column(df, ['click', 'clicks'], classification)
    entity_identifier = _find_marketing_entity_identifier(df, classification)

    # Conversion candidates (volume/count vs explicit rate)
    metric_and_target_cols = classification.metrics + classification.targets
    conv_rate_col = next(
        (
            c for c in metric_and_target_cols
            if (
                'cvr' in _normalized_col(c)
                or 'conversionrate' in _normalized_col(c)
                or ('conversion' in _normalized_col(c) and _is_rate_metric_name(c))
            )
        ),
        None,
    )

    conv_col = next(
        (
            c for c in metric_and_target_cols
            if any(tok in _normalized_col(c) for tok in ['conversion', 'converted', 'lead', 'signup'])
            and c != conv_rate_col
            and not _is_rate_metric_name(c)
        ),
        None,
    )
    if not conv_col:
        conv_col = _find_column(df, ['conversion', 'conversions', 'converted', 'lead', 'leads', 'signup', 'signups'], classification)
        if conv_col == conv_rate_col:
            conv_col = None

    # Optional explicit CTR column
    ctr_col = next(
        (
            c for c in metric_and_target_cols
            if 'ctr' in _normalized_col(c)
            or ('click' in _normalized_col(c) and _is_rate_metric_name(c))
        ),
        None,
    )

    # 1) Total Impressions
    total_imp = _safe_sum(df, imp_col) if imp_col else 0.0
    if imp_col:
        kpis.append(KPI(
            key="impressions",
            title="Total Impressions",
            value=int(total_imp),
            format="number",
            icon="eye",
            confidence="HIGH",
            reason=f"Sum of {imp_col}"
        ))

    # 2) Total Clicks
    total_clicks = _safe_sum(df, click_col) if click_col else 0.0
    if click_col:
        kpis.append(KPI(
            key="clicks",
            title="Total Clicks",
            value=int(total_clicks),
            format="number",
            icon="mouse-pointer",
            confidence="HIGH",
            reason=f"Sum of {click_col}"
        ))

    # 3) CTR (ratio from volumes preferred, fallback to explicit rate column)
    ctr_value: Optional[float] = None
    ctr_reason: Optional[str] = None
    if imp_col and total_imp > 0 and click_col:
        ctr_value = (total_clicks / total_imp) * 100.0
        ctr_reason = "Clicks / Impressions × 100"
    elif ctr_col:
        ctr_value = _rate_series_to_percent(df[ctr_col], weight_series=df[imp_col] if imp_col else None)
        if ctr_value is not None:
            ctr_reason = (
                f"Weighted avg {_beautify_column_name(ctr_col)} (by impressions)"
                if imp_col else f"Average {_beautify_column_name(ctr_col)}"
            )

    if ctr_value is not None:
        kpis.append(KPI(
            key="ctr",
            title="Click-Through Rate",
            value=round(float(ctr_value), 2),
            format="percent",
            icon="target",
            confidence="HIGH",
            reason=ctr_reason or "CTR"
        ))

    # 4) Conversion Rate (dynamic: explicit rate col, binary converted flag, or volume ratio)
    conversion_rate: Optional[float] = None
    conversion_reason: Optional[str] = None

    if conv_rate_col:
        conv_weights = df[click_col] if click_col else (df[imp_col] if imp_col else None)
        conversion_rate = _rate_series_to_percent(df[conv_rate_col], weight_series=conv_weights)
        if conversion_rate is not None:
            if click_col:
                conversion_reason = f"Weighted avg {_beautify_column_name(conv_rate_col)} (by clicks)"
            elif imp_col:
                conversion_reason = f"Weighted avg {_beautify_column_name(conv_rate_col)} (by impressions)"
            else:
                conversion_reason = f"Average {_beautify_column_name(conv_rate_col)}"

    if conversion_rate is None and conv_col:
        # Binary converted flags (Yes/No, 1/0) should be treated as positive share.
        binary_share = _binary_positive_share_percent(df[conv_col])
        if binary_share is not None:
            conversion_rate = binary_share
            conversion_reason = f"Positive class share in {_beautify_column_name(conv_col)}"
        else:
            total_conv = _safe_sum(df, conv_col)
            if click_col and total_clicks > 0:
                conversion_rate = (total_conv / total_clicks) * 100.0
                conversion_reason = f"Sum {_beautify_column_name(conv_col)} / Clicks × 100"
            elif imp_col and total_imp > 0:
                conversion_rate = (total_conv / total_imp) * 100.0
                conversion_reason = f"Sum {_beautify_column_name(conv_col)} / Impressions × 100"
            else:
                # Final fallback: in case conversion values are actually precomputed rates.
                fallback_rate = _rate_series_to_percent(df[conv_col])
                if fallback_rate is not None:
                    conversion_rate = fallback_rate
                    conversion_reason = f"Average {_beautify_column_name(conv_col)}"

    if conversion_rate is not None:
        kpis.append(KPI(
            key="conversion_rate",
            title="Conversion Rate",
            value=round(float(conversion_rate), 2),
            format="percent",
            icon="check-circle",
            confidence="HIGH",
            reason=conversion_reason or "Conversion performance"
        ))

    # 4.5) Entity volume KPI from identifier columns (count-based, never sum IDs/codes)
    if entity_identifier:
        entity_col, entity_label = entity_identifier
        non_null_count = int(df[entity_col].notna().sum())
        distinct_count = int(df[entity_col].nunique(dropna=True))
        use_distinct = distinct_count > 0 and distinct_count < non_null_count
        entity_count_value = distinct_count if use_distinct else non_null_count
        count_reason = (
            f"Distinct count of {entity_col}"
            if use_distinct
            else f"Non-null count of {entity_col}"
        )
        entity_key = re.sub(r'[^a-z0-9]+', '_', _normalized_col(entity_col)).strip('_')
        kpis.append(KPI(
            key=f"entity_count_{entity_key}",
            title=f"Total {entity_label}",
            value=entity_count_value,
            format="number",
            icon="list",
            confidence="HIGH",
            reason=count_reason,
        ))

    # 5+) Dynamic metric KPIs so marketing dashboards adapt to any schema.
    used_metrics = {c for c in [imp_col, click_col, ctr_col, conv_col, conv_rate_col] if c}
    dynamic_metric_kpis: List[KPI] = []

    for metric_col in classification.metrics:
        if metric_col in used_metrics or metric_col not in df.columns:
            continue
        if not _is_effectively_numeric(df[metric_col]):
            continue
        if _is_identifier_like_metric(metric_col):
            continue

        role = _marketing_metric_role(metric_col)
        metric_name = _beautify_column_name(metric_col)
        key_stub = re.sub(r'[^a-z0-9]+', '_', _normalized_col(metric_col)).strip('_')
        icon = _marketing_metric_icon(role, metric_col)

        kpi_value: Optional[float] = None
        kpi_format = 'number'
        title_prefix = 'Total'
        reason = ''

        if role == 'percent_rate':
            kpi_value = _rate_series_to_percent(df[metric_col])
            kpi_format = 'percent'
            title_prefix = 'Avg'
            reason = f"Average {metric_name} (normalized to percent)"
        elif role == 'ratio':
            kpi_value = _safe_mean(df, metric_col)
            kpi_format = 'number'
            title_prefix = 'Avg'
            reason = f"Average {metric_name}"
        elif role == 'currency_avg':
            kpi_value = _safe_mean(df, metric_col)
            kpi_format = 'currency'
            title_prefix = 'Avg'
            reason = f"Mean of {metric_col}"
        elif role == 'currency_sum':
            kpi_value = _safe_sum(df, metric_col)
            kpi_format = 'currency'
            title_prefix = 'Total'
            reason = f"Sum of {metric_col}"
        elif role == 'number_avg':
            kpi_value = _safe_mean(df, metric_col)
            kpi_format = 'number'
            title_prefix = 'Avg'
            reason = f"Mean of {metric_col}"
        else:
            kpi_value = _safe_sum(df, metric_col)
            kpi_format = 'number'
            title_prefix = 'Total'
            reason = f"Sum of {metric_col}"

        if kpi_value is None:
            continue

        if kpi_format == 'number' and role == 'volume_sum':
            value_out: Any = int(round(float(kpi_value)))
        elif kpi_format == 'number' and title_prefix == 'Avg' and _is_lifecycle_column(metric_col):
            value_out = int(round(float(kpi_value)))
        elif kpi_format == 'number' and title_prefix == 'Avg':
            value_out = round(float(kpi_value), 2)
        elif kpi_format == 'number':
            value_out = round(float(kpi_value), 1)
        else:
            value_out = round(float(kpi_value), 2)

        dynamic_metric_kpis.append(KPI(
            key=f"mkt_{title_prefix.lower()}_{key_stub}",
            title=f"{title_prefix} {metric_name}",
            value=value_out,
            format=kpi_format,
            icon=icon,
            confidence='MEDIUM',
            reason=reason,
            subtitle='x multiple' if role == 'ratio' else None,
        ))

    kpis.extend(dynamic_metric_kpis)

    # 6+) Dynamic top segment KPI for campaign/channel/source-style dimensions.
    dim_priority = [
        'channel', 'source', 'medium', 'campaign', 'adgroup', 'creative', 'audience', 'region'
    ]
    segment_dim = next(
        (
            dim for token in dim_priority
            for dim in classification.dimensions
            if token in _normalized_col(dim) and dim in df.columns
        ),
        None,
    )

    if segment_dim:
        benchmark_candidates = [
            c for c in [conv_col, click_col, imp_col] + classification.metrics
            if c and c in df.columns
        ]

        benchmark_metric = next((c for c in benchmark_candidates if c in df.columns), None)
        if benchmark_metric:
            bench_role = _marketing_metric_role(benchmark_metric)
            grouped = _marketing_groupby_aggregate(df, segment_dim, benchmark_metric, bench_role)
            if grouped is not None and not grouped.empty:
                top_segment = str(grouped.idxmax())
                top_value = float(grouped.max())

                bench_format = 'number'
                if bench_role == 'percent_rate':
                    bench_format = 'percent'
                elif bench_role.startswith('currency'):
                    bench_format = 'currency'

                if bench_format == 'number' and bench_role in {'volume_sum', 'number_sum'}:
                    top_value_out: Any = int(round(top_value))
                else:
                    top_value_out = round(top_value, 2)

                kpis.append(KPI(
                    key=f"top_{re.sub(r'[^a-z0-9]+', '_', _normalized_col(segment_dim)).strip('_')}",
                    title=f"Top {_beautify_column_name(segment_dim)}",
                    value=top_segment,
                    format='text',
                    icon='trophy',
                    confidence='MEDIUM',
                    reason=f"Highest {_beautify_column_name(benchmark_metric)} by segment",
                    subtitle=f"{_beautify_column_name(benchmark_metric)}: {top_value_out}{'%' if bench_format == 'percent' else ''}",
                ))
    
    return kpis


def _generate_finance_kpis(df: pd.DataFrame, classification: ColumnClassification) -> List[KPI]:
    """Generate KPIs for Finance domain."""
    kpis = []
    
    # 1. Total Income/Revenue
    income_col = _find_column(df, ['income', 'revenue', 'total', 'amount'], classification)
    if income_col:
        total_income = _safe_sum(df, income_col)
        kpis.append(KPI(
            key="total_income",
            title="Total Income",
            value=total_income,
            format="currency",
            icon="dollar",
            confidence="HIGH",
            reason=f"Sum of {income_col}"
        ))
    
    # 2. Total Expenses
    expense_col = _find_column(df, ['expense', 'cost', 'spending'], classification)
    if expense_col:
        total_expense = _safe_sum(df, expense_col)
        kpis.append(KPI(
            key="total_expenses",
            title="Total Expenses",
            value=total_expense,
            format="currency",
            icon="credit-card",
            confidence="HIGH",
            reason=f"Sum of {expense_col}"
        ))
        
        # 3. Net Income (Calculated)
        if income_col:
            net_income = total_income - total_expense
            kpis.append(KPI(
                key="net_income",
                title="Net Income",
                value=net_income,
                format="currency",
                icon="trending-up" if net_income >= 0 else "trending-down",
                confidence="HIGH",
                reason="Income - Expenses"
            ))
    
    # 4. Transaction Count
    kpis.append(KPI(
        key="transactions",
        title="Total Transactions",
        value=len(df),
        format="number",
        icon="list",
        confidence="HIGH",
        reason="Row count"
    ))
    
    return kpis


def _generate_healthcare_kpis(df: pd.DataFrame, classification: ColumnClassification) -> List[KPI]:
    """Generate operational/clinical KPIs for Healthcare domain."""
    kpis = []
    
    # Detect key columns
    patient_col = _find_column(df, ['patient', 'patientid', 'name'], classification)
    age_col = _find_column(df, ['age'], classification)
    condition_col = _find_column(df, ['condition', 'diagnosis', 'disease', 'medical_condition'], classification)
    insurance_col = _find_column(df, ['insurance', 'provider', 'insurance_provider'], classification)
    cost_col = _find_column(df, ['cost', 'charge', 'charges', 'bill', 'billing', 'billing_amount'], classification)
    
    total_patients = df[patient_col].nunique() if patient_col else len(df)
    
    # 1. Patient Volume
    kpis.append(KPI(
        key="patient_volume",
        title="Patient Volume",
        value=total_patients,
        format="number",
        icon="users",
        confidence="HIGH",
        reason="Unique patients" if patient_col else "Total records",
        subtitle=f"{len(df)} total visits"
    ))
    
    # 2. Average Age
    if age_col:
        avg_age = _safe_mean(df, age_col)
        kpis.append(KPI(
            key="avg_age",
            title="Avg Patient Age",
            value=round(avg_age, 1),
            format="number",
            icon="activity",
            confidence="HIGH",
            reason=f"Mean of {age_col}",
            subtitle="Demographic indicator"
        ))
    
    # 3. Condition Prevalence (Top 3 chronic conditions as % of total)
    if condition_col and condition_col in df.columns:
        try:
            top3 = df[condition_col].value_counts().head(3)
            top3_count = int(top3.sum())
            top3_pct = round((top3_count / len(df)) * 100, 1) if len(df) > 0 else 0
            top3_names = ", ".join(top3.index.tolist())
            kpis.append(KPI(
                key="condition_prevalence",
                title="Top 3 Conditions",
                value=top3_pct,
                format="percent",
                icon="alert-circle",
                confidence="HIGH",
                reason=f"Top 3 conditions cover {top3_pct}% of patients",
                subtitle=top3_names
            ))
        except Exception:
            pass
    
    # 4. Insurance Coverage Ratio
    if insurance_col and insurance_col in df.columns:
        try:
            total_rows = len(df)
            # Self-pay detection
            self_pay_keywords = ['self', 'self-pay', 'selfpay', 'none', 'no insurance', 'uninsured', 'cash']
            insured = df[~df[insurance_col].astype(str).str.lower().str.strip().isin(self_pay_keywords)]
            coverage_pct = round((len(insured) / total_rows) * 100, 1) if total_rows > 0 else 0
            kpis.append(KPI(
                key="insurance_coverage",
                title="Insurance Coverage",
                value=coverage_pct,
                format="percent",
                icon="shield",
                confidence="HIGH",
                reason=f"Patients with insurance coverage",
                subtitle=f"{len(insured)} of {total_rows} covered"
            ))
        except Exception:
            pass
    
    # 5. Total Billing
    if cost_col:
        total_cost = _safe_sum(df, cost_col)
        kpis.append(KPI(
            key="total_billing",
            title="Total Billing",
            value=total_cost,
            format="currency",
            icon="dollar",
            confidence="HIGH",
            reason=f"Sum of {cost_col}"
        ))
    
    return kpis


def _generate_generic_kpis(df: pd.DataFrame, classification: ColumnClassification) -> List[KPI]:
    """Generate generic KPIs when domain is unknown."""
    kpis = []
    
    # 1. Total Records
    kpis.append(KPI(
        key="total_records",
        title="Total Records",
        value=len(df),
        format="number",
        icon="database",
        confidence="HIGH",
        reason="Row count"
    ))
    
    # 2. Primary Metric Sum (first metric column)
    if classification.metrics:
        primary_metric = classification.metrics[0]
        total = _safe_sum(df, primary_metric)
        kpis.append(KPI(
            key="primary_total",
            title=f"Total {primary_metric.replace('_', ' ').title()}",
            value=total,
            format="currency" if any(kw in primary_metric.lower() for kw in ['amount', 'price', 'revenue', 'cost']) else "number",
            icon="bar-chart",
            confidence="MEDIUM",
            reason=f"Sum of {primary_metric}"
        ))
        
        # 3. Primary Metric Average
        avg = _safe_mean(df, primary_metric)
        kpis.append(KPI(
            key="primary_avg",
            title=f"Avg {primary_metric.replace('_', ' ').title()}",
            value=round(avg, 2),
            format="number",
            icon="trending-up",
            confidence="MEDIUM",
            reason=f"Mean of {primary_metric}"
        ))
    
    # 4. Target distribution if exists
    if classification.targets:
        target_col = classification.targets[0]
        positive_count = _count_target_positive(df, target_col)
        rate = (positive_count / len(df)) * 100 if len(df) > 0 else 0
        kpis.append(KPI(
            key="target_rate",
            title=f"{target_col.replace('_', ' ').title()} Rate",
            value=round(rate, 1),
            format="percent",
            icon="pie-chart",
            confidence="HIGH",
            reason=f"Positive / Total × 100"
        ))
    
    return kpis


def _kpi_confidence_score(confidence: str) -> int:
    score_map = {
        "HIGH": 3,
        "MEDIUM": 2,
        "LOW": 1,
    }
    return score_map.get(str(confidence or "").upper(), 0)


def _dedupe_kpis(kpis: List[KPI]) -> List[KPI]:
    """Remove duplicate KPIs by key/title while preserving first occurrence order."""
    out: List[KPI] = []
    seen_keys = set()
    seen_titles = set()

    for k in kpis:
        key = str(getattr(k, "key", "") or "").strip().lower()
        title = str(getattr(k, "title", "") or "").strip().lower()

        if key and key in seen_keys:
            continue
        if title and title in seen_titles:
            continue

        if key:
            seen_keys.add(key)
        if title:
            seen_titles.add(title)
        out.append(k)

    return out


def _dynamic_kpi_limit(
    df: pd.DataFrame,
    domain: DomainType,
    classification: ColumnClassification,
    available_count: int,
) -> int:
    """Compute KPI count dynamically from dataset signal strength and domain complexity."""
    if available_count <= 0:
        return 0

    metric_count = len(set(classification.metrics or []))
    target_count = len(set(classification.targets or []))
    date_count = len(set(classification.dates or []))

    # Dimensions with usable cardinality often provide meaningful KPI context.
    low_card_dims = 0
    for dim in classification.dimensions or []:
        if dim in df.columns:
            try:
                nunique = int(df[dim].nunique(dropna=True))
                if 2 <= nunique <= 20:
                    low_card_dims += 1
            except Exception:
                continue

    signal_count = metric_count + target_count + date_count + min(low_card_dims, 3)

    domain_baseline = {
        DomainType.SALES: 6,
        DomainType.CHURN: 6,
        DomainType.MARKETING: 4,
        DomainType.FINANCE: 4,
        DomainType.HEALTHCARE: 5,
        DomainType.GENERIC: 3,
    }.get(domain, 3)

    dynamic_target = domain_baseline + max(0, signal_count - 1) // 2
    if len(df) >= 50_000:
        dynamic_target += 1

    # Keep within practical UI limits and available KPI count.
    dynamic_target = max(3, min(14, dynamic_target))
    return min(available_count, dynamic_target)


def _kpi_priority_bonus(kpi: KPI, domain: DomainType) -> int:
    """Domain-aware boost so executive-friendly KPIs are retained under dynamic limits."""
    text = f"{getattr(kpi, 'key', '')} {getattr(kpi, 'title', '')}".lower()
    bonus = 0

    if domain == DomainType.CHURN:
        churn_priority = [
            'churn rate', 'retention rate', 'value at risk', 'total tech tickets',
            'total admin tickets', 'support tickets', 'arpu', 'ltv', 'tech ticket share'
        ]
        for token in churn_priority:
            if token in text:
                bonus += 3

    if domain == DomainType.SALES:
        sales_priority = [
            'total revenue', 'total profit', 'avg order value', 'sales volume',
            'best seller', 'top region', 'top performing state', 'revenue/customer'
        ]
        for token in sales_priority:
            if token in text:
                bonus += 3

    if domain == DomainType.MARKETING:
        marketing_priority = [
            'click-through rate', 'conversion rate', 'total impressions',
            'total clicks', 'total spend', 'total budget', 'top channel',
            'top source', 'top campaign', 'total campaigns', 'total ads',
            'total ad groups', 'total ad sets', 'total creatives', 'total keywords'
        ]
        for token in marketing_priority:
            if token in text:
                bonus += 3

    return bonus


def _select_top_kpis(kpis: List[KPI], limit: int, domain: DomainType) -> List[KPI]:
    """Select most meaningful KPIs by confidence + domain priority, then preserve original order."""
    if limit <= 0 or not kpis:
        return []
    if len(kpis) <= limit:
        return kpis

    indexed = list(enumerate(kpis))
    indexed.sort(
        key=lambda item: (
            -_kpi_priority_bonus(item[1], domain),
            -_kpi_confidence_score(getattr(item[1], "confidence", "")),
            item[0],
        )
    )
    selected_idx = sorted(i for i, _ in indexed[:limit])
    return [kpis[i] for i in selected_idx]


# =============================================================================
# Main Entry Point
# =============================================================================


def generate_kpis(df: pd.DataFrame, domain: DomainType, classification: ColumnClassification) -> Dict[str, Any]:
    """
    Generate KPIs based on domain and data classification.
    
    Returns dict of KPIs for API response.
    """
    generators = {
        DomainType.SALES: _generate_sales_kpis,
        DomainType.CHURN: _generate_churn_kpis,
        DomainType.MARKETING: _generate_marketing_kpis,
        DomainType.FINANCE: _generate_finance_kpis,
        DomainType.HEALTHCARE: _generate_healthcare_kpis,
        DomainType.GENERIC: _generate_generic_kpis,
    }
    
    generator = generators.get(domain, _generate_generic_kpis)
    kpis = generator(df, classification)
    kpis = _dedupe_kpis(kpis)
    dynamic_limit = _dynamic_kpi_limit(df, domain, classification, len(kpis))
    kpis = _select_top_kpis(kpis, dynamic_limit, domain)
    
    # Convert to dict format for API
    result = {}
    for i, kpi in enumerate(kpis):
        val = kpi.value
        fmt = kpi.format
        title_lower = kpi.title.lower()
        
        # Smart detection: if format is not set, look at title
        if not fmt:
            percentage_keywords = ["rate", "margin", "percent", "ratio", "proportion", "share"]
            if any(kw in title_lower for kw in percentage_keywords):
                fmt = "percent"
                
        # Smart scaling: if format is percent and value is a ratio (0-1), scale it
        if fmt == "percent" and isinstance(val, (int, float)) and -1.0 <= val <= 1.0:
            val = val * 100
            
        result[f"kpi_{i}"] = {
            "title": kpi.title,
            "value": val,
            "format": fmt,
            "is_percentage": fmt == "percent",
            "icon": kpi.icon,
            "confidence": kpi.confidence,
            "reason": kpi.reason
        }
        if getattr(kpi, 'trend', None) is not None:
            result[f"kpi_{i}"]["trend"] = kpi.trend
        if getattr(kpi, 'trend_label', None) is not None:
            result[f"kpi_{i}"]["trend_label"] = kpi.trend_label
        if getattr(kpi, 'subtitle', None) is not None:
            result[f"kpi_{i}"]["subtitle"] = kpi.subtitle
    
    return result
