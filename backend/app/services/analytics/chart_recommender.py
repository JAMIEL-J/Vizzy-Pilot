"""
Chart Recommender - Smart chart selection based on data signals and domain.

Recommends optimal chart types for the dataset.
Uses BI dashboard best practices to prioritize business-critical metrics.
"""

import logging
from typing import Dict, Any, List, Optional, Set
from dataclasses import dataclass
import warnings
import re
import pandas as pd
from .domain_detector import DomainType, detect_domain
from .column_filter import ColumnClassification, _clean_header, filter_columns
from .business_questions import get_smart_chart_title, get_tenure_group, get_tenure_group_order
from .outlier_detection import detect_outliers_iqr

class AggregationData(list):
    def __init__(self, data, outliers=None, data_without_outliers=None):
        super().__init__(data)
        self.outliers = outliers
        self.data_without_outliers = data_without_outliers

logger = logging.getLogger(__name__)


def _coerce_numeric_metric_series(series: pd.Series) -> pd.Series:
    """Coerce numeric-like metric strings (currency, commas, percentages) to numbers."""
    if pd.api.types.is_numeric_dtype(series):
        return pd.to_numeric(series, errors='coerce')

    s = series.astype(str).str.strip()
    # Handle accounting negatives like (1234.56)
    s = s.str.replace(r'^\((.*)\)$', r'-\1', regex=True)
    # Remove common numeric formatting symbols
    s = s.str.replace(r'[$,% ]', '', regex=True)
    return pd.to_numeric(s, errors='coerce')


def _safe_to_datetime(series: pd.Series) -> pd.Series:
    """Parse mixed date formats without noisy parser warnings."""
    if pd.api.types.is_datetime64_any_dtype(series):
        return series

    with warnings.catch_warnings():
        warnings.simplefilter("ignore", UserWarning)

        def _parse(dayfirst: bool) -> pd.Series:
            try:
                return pd.to_datetime(series, errors='coerce', format='mixed', dayfirst=dayfirst)
            except (TypeError, ValueError):
                return pd.to_datetime(series, errors='coerce', dayfirst=dayfirst)

        parsed_default = _parse(dayfirst=False)
        parsed_dayfirst = _parse(dayfirst=True)

        # Choose the parse that successfully converts more rows.
        # Tie-break in favor of month-first, which better matches common dashboard CSV exports.
        if parsed_dayfirst.notna().sum() > parsed_default.notna().sum():
            return parsed_dayfirst
        return parsed_default


# ============================================================================
# SMART TITLE SYSTEM - Map column names to professional businessterms
# ============================================================================

COLUMN_TO_BUSINESS_TERM = {
    # Shipping & Logistics
    'ship_mode': 'Shipping Method',
    'shipmode': 'Shipping Method',
    'ship_date': 'Ship Date',
    'shipdate': 'Ship Date',
    'shipping_type': 'Shipping Type',
    'days_for_shipment_scheduled': 'Scheduled Delivery Days',
    'days_for_shipment_real': 'Actual Delivery Days',
    'delivery_status': 'Delivery Status',
    'late_delivery_risk': 'Late Delivery Risk',
    
    # Products
    'product_name': 'Product',
    'productname': 'Product',
    'product': 'Product',
    'category': 'Product Category',
    'category_name': 'Category',
    'categoryname': 'Category',
    'sub_category': 'Subcategory',
    'subcategory': 'Subcategory',
    'sub-category': 'Subcategory',
    
    # Customers
    'customer_name': 'Customer',
    'customername': 'Customer',
    'customer_segment': 'Customer Segment',
    'segment': 'Customer Segment',
    'customer_id': 'Customer',
    
    # Geography
    'region': 'Region',
    'country': 'Country',
    'state': 'State',
    'city': 'City',
    'market': 'Market',
    'order_region': 'Order Region',
    'order_country': 'Order Country',
    'order_city': 'Order City',
    
    # Revenue Metrics
    'sales': 'Revenue',
    'revenue': 'Revenue',
    'profit': 'Profit',
    'quantity': 'Units Sold',
    'discount': 'Discount',
    'order_quantity': 'Order Quantity',
    'order_profit_per_order': 'Profit',
    'benefit_per_order': 'Profit',
    'sales_per_order': 'Revenue',
    'profit_per_order': 'Profit',
    
    # Orders
    'order_id': 'Order',
    'orderid': 'Order',
    'order_date': 'Order Date',
    'order_priority': 'Order Priority',
    'order_status': 'Order Status',
    
    # Churn/Telecom specific
    'tenure': 'Customer Tenure',
    'monthlycharges': 'Monthly Charges',
    'monthly_charges': 'Monthly Charges',
    'totalcharges': 'Total Charges',
    'total_charges': 'Total Charges',
    'seniorcitizen': 'Senior Citizen',
    'senior_citizen': 'Senior Citizen',
    'phoneservice': 'Phone Service',
    'phone_service': 'Phone Service',
    'internetservice': 'Internet Service',
    'internet_service': 'Internet Service',
    'onlinesecurity': 'Online Security',
    'online_security': 'Online Security',
    'onlinebackup': 'Online Backup',
    'online_backup': 'Online Backup',
    'techsupport': 'Tech Support',
    'tech_support': 'Tech Support',
    'streamingtv': 'Streaming TV',
    'streaming_tv': 'Streaming TV',
    'streamingmovies': 'Streaming Movies',
    'streaming_movies': 'Streaming Movies',
    'paperlessbilling': 'Paperless Billing',
    'paperless_billing': 'Paperless Billing',
    'paymenttype': 'Payment Method',
    'payment_type': 'Payment Method',
    'paymentmode': 'Payment Method',
    'payment_mode': 'Payment Method',
    'billingtype': 'Payment Method',
    'billing_type': 'Payment Method',
    'billingmethod': 'Payment Method',
    'billing_method': 'Payment Method',
    'invoicemethod': 'Payment Method',
    'invoice_method': 'Payment Method',
    'autopay': 'Auto Pay',
    'auto_pay': 'Auto Pay',
    'churn': 'Churn Status',
    
    # Healthcare
    'patient_id': 'Patient',
    'patient': 'Patient',
    'diagnosis': 'Diagnosis',
    'treatment': 'Treatment',
    'admission_type': 'Admission Type',
    'admission': 'Admission',
    'discharge_disposition': 'Discharge Status',
    'discharge': 'Discharge',
    'los': 'Length of Stay',
    'length_of_stay': 'Length of Stay',
    'readmission': 'Readmission',
    'mortality': 'Mortality',
    'clinical_score': 'Clinical Score',
    'hospital': 'Hospital',
    'physician': 'Physician',
    'drg': 'DRG',
    'icd': 'ICD Code',
    'medication': 'Medication',
    'vital_signs': 'Vital Signs',
    
    # Generic
    'type': 'Type',
    'status': 'Status',
    'gender': 'Gender',
    'contract': 'Contract Type',
    'payment_method': 'Payment Method',
    'paymentmethod': 'Payment Method',
}

# Low-value columns to EXCLUDE from primary charts (operational noise)
LOW_VALUE_COLUMN_PATTERNS = [
    'days_for_shipment', 'days_for_shipping', 'ship_date', 'order_date',
    'zipcode', 'postal_code',
    'row_id', 'row_number',
    'customer_id', 'order_id', 'product_id',
    'latitude', 'longitude',
    'customer_name', 'customername', 'first_name', 'last_name', 'firstname', 'lastname',
]

EXACT_LOW_VALUE_WORDS = {'zip', 'postal', 'index', 'lat', 'lng', 'geo', 'id'}

# Metric type prefixes for chart titles
METRIC_TYPE_PREFIX = {
    'revenue': 'Revenue',
    'sales': 'Revenue', 
    'profit': 'Profit',
    'quantity': 'Units',
    'discount': 'Discount',
    'count': 'Count',
    'order': 'Orders',
    'cost': 'Cost',
    'price': 'Price',
    'amount': 'Amount',
    'total': 'Total',
    'los': 'Days',
    'score': 'Score',
    'rate': 'Rate',
}

# DA Grade Metrics Categorization
AVG_KEYWORDS = [
    'age', 'tenure', 'rate', 'score', 'temperature', 'pressure', 'los', 
    'stay', 'margin', 'percentage', 'pct', 'ratio', 'price', 'discount',
    'satisfaction', 'nps', 'rating', 'prevalence', 'incidence', 'mortality',
    'probability', 'likelihood'
]

WHOLE_NUMBER_AVERAGE_KEYWORDS = [
    'age', 'tenure', 'duration', 'day', 'days', 'month', 'months', 'year', 'years', 'los', 'lengthofstay'
]

def _should_average_metric(metric: str) -> bool:
    """Return True if the metric should be aggregated using mean instead of sum."""
    if not metric:
        return False
    metric_lower = metric.lower().replace('-', '').replace('_', '').replace(' ', '')
    return any(kw in metric_lower for kw in AVG_KEYWORDS)


def _is_whole_number_average_metric(metric: Optional[str]) -> bool:
    """Return True when average values should be displayed as whole numbers."""
    if not metric:
        return False
    metric_lower = str(metric).lower().replace('-', '').replace('_', '').replace(' ', '')
    return any(kw in metric_lower for kw in WHOLE_NUMBER_AVERAGE_KEYWORDS)


def _round_mean_value(value: Any, metric: Optional[str]) -> float:
    """Apply metric-aware rounding for mean aggregations."""
    numeric_value = float(value)
    if _is_whole_number_average_metric(metric):
        return int(round(numeric_value))
    return round(numeric_value, 4)


def _infer_time_value_label(*candidates: Optional[str]) -> str:
    """Infer a human-readable time label for chart values."""
    combined = ' '.join(str(c or '').lower() for c in candidates)
    if 'age' in combined:
        return 'Age'
    if 'tenure' in combined or 'month' in combined:
        return 'Months'
    if 'year' in combined:
        return 'Years'
    return 'Days'


def _trend_aggregation_for_metric(metric: Optional[str]) -> str:
    """Return explicit trend aggregation for a metric."""
    return 'mean' if _should_average_metric(metric or '') else 'sum'

def _smart_aggregate(df: pd.DataFrame, group_col: str, metric_col: str, limit: int = 10) -> List[Dict[str, Any]]:
    """Smartly decide between SUM and MEAN based on metric nature."""
    # Ensure numeric normalization if it's currently a string/object
    if metric_col in df.columns and (df[metric_col].dtype == 'object' or df[metric_col].dtype == 'string'):
        df[metric_col] = pd.to_numeric(df[metric_col], errors='coerce')
        
    if _should_average_metric(metric_col):
        return _safe_groupby_mean(df, group_col, metric_col, limit)
    return _safe_groupby_sum(df, group_col, metric_col, limit)


def _beautify_column_name(col: str) -> str:
    """Convert column name to professional business term."""
    col_lower = col.lower().replace('-', '_')

    def _humanize_column_name(name: str) -> str:
        # Keep full source semantics while improving readability.
        # Examples: subscription_type -> Subscription Type, PaymentMethod -> Payment Method
        spaced = re.sub(r'(?<=[a-z0-9])(?=[A-Z])', ' ', str(name))
        spaced = spaced.replace('_', ' ').replace('-', ' ')
        normalized = re.sub(r'\s+', ' ', spaced).strip()
        return normalized.title()
    
    # Check exact match first
    if col_lower in COLUMN_TO_BUSINESS_TERM:
        return COLUMN_TO_BUSINESS_TERM[col_lower]

    # Check exact match without separators to catch camelCase/snake_case variations.
    compact_lower = ''.join(ch for ch in col_lower if ch.isalnum())
    for key, term in COLUMN_TO_BUSINESS_TERM.items():
        key_compact = ''.join(ch for ch in key.lower() if ch.isalnum())
        if key_compact == compact_lower:
            return term
    
    # Check partial match, but avoid generic short tokens that can over-trim names
    # (e.g., subscription_type should not collapse to just "Type").
    for pattern, term in COLUMN_TO_BUSINESS_TERM.items():
        if len(pattern) <= 6:
            continue
        if pattern in col_lower:
            return term
    
    # Default: preserve original column semantics with readable formatting.
    return _humanize_column_name(col)


def _get_metric_prefix(metric_col: str) -> str:
    """Get the business metric type for a column."""
    metric_lower = metric_col.lower().replace('_', '')
    
    for keyword, prefix in METRIC_TYPE_PREFIX.items():
        if keyword in metric_lower:
            return prefix
    
    return "Value"


def _is_low_value_column(col: str) -> bool:
    """Check if column should be excluded from primary charts."""
    col_lower = col.lower().replace('-', '_')
    if any(pattern in col_lower for pattern in LOW_VALUE_COLUMN_PATTERNS):
        return True
        
    words = col_lower.replace('_', ' ').split()
    if any(w in EXACT_LOW_VALUE_WORDS for w in words):
        return True
        
    if col_lower.endswith('_id') or col_lower == 'id':
        return True
        
    return False

def _create_smart_title(metric_col: Optional[str], dimension_col: str, chart_purpose: str = "") -> str:
    """Create a professional chart title with business context."""
    dim_name = _beautify_column_name(dimension_col)
    
    if metric_col:
        metric_name = _beautify_column_name(metric_col)
        
        # Determine if dimension is time-based
        is_time = any(kw in dim_name.lower() for kw in ['date', 'time', 'year', 'month', 'day', 'trend', 'quarter'])
        
        if is_time:
            return f"{metric_name} Trend Over Time"
            
        agg_prefix = "Average" if _should_average_metric(metric_col) else ""
        
        if agg_prefix == "Average":
            if any(kw in metric_name.lower() for kw in ['rate', 'ratio', 'percentage', 'avg']):
                return f"{metric_name} by {dim_name}"
            return f"Average {metric_name} by {dim_name}"
            
        return f"{metric_name} by {dim_name}"
    else:
        # Distribution chart
        return f"{dim_name} Distribution"


def _deduplicate_charts(charts: List['ChartRecommendation']) -> List['ChartRecommendation']:
    """Remove duplicate/similar charts to avoid repetition."""
    seen_combos: Set[str] = set()
    seen_titles: Set[str] = set()
    unique_charts = []
    
    for chart in charts:
        title_lower = chart.title.lower()
        if title_lower in seen_titles:
            continue
            
        # Dimension + Metric + Aggregation is the fingerprint of the chart's intelligence
        # We allow the same data to be shown in different types (e.g. Bar vs Donut) 
        # ONLY if the user explicitly overrides it, but the recommender should pick just one.
        # Fingerprint: dim + metric + agg
        dim = chart.dimension or ""
        met = chart.metric or ""
        agg = chart.aggregation or "sum"
        
        # If both dim and metric are missing, we fall back to title-based deduplication
        if not dim and not met:
            seen_titles.add(title_lower)
            unique_charts.append(chart)
            continue
            
        data_fingerprint = f"{dim}|{met}|{agg}"
        
        # If we already have a chart for this data, skip it
        # UNLESS it's a completely different category of chart (e.g. a time trend vs a categorical bar)
        type_ = chart.chart_type
        is_trend = type_ in ('line', 'area')
        
        # Unique key: data + whether it's a trend
        key = f"{data_fingerprint}|{is_trend}"
        
        if key in seen_combos:
            continue
            
        seen_combos.add(key)
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

def _prioritize_metrics(metrics: List[str]) -> List[str]:
    """Prioritize metrics based on BI importance - revenue first!"""
    prioritized = []
    remaining = metrics.copy()

    try:
        from .semantic_resolver import semantic_similarity
        def _is_match(col, keywords):
            return any(semantic_similarity(kw, col) >= 0.55 for kw in keywords)
    except ImportError:
        def _is_match(col, keywords):
            return any(kw in col.lower().replace('_', '') for kw in keywords)

    for tier_keywords in METRIC_PRIORITY_KEYWORDS:
        for metric in remaining[:]:
            if _is_match(metric, tier_keywords):
                prioritized.append(metric)
                remaining.remove(metric)

    # Add remaining metrics at the end
    prioritized.extend(remaining)
    return prioritized


def _prioritize_dimensions(dimensions: List[str]) -> List[str]:
    """Prioritize dimensions based on BI importance - business segments first!"""
    prioritized = []
    remaining = dimensions.copy()

    try:
        from .semantic_resolver import semantic_similarity
        def _is_match(col, keywords):
            return any(semantic_similarity(kw, col) >= 0.55 for kw in keywords)
    except ImportError:
        def _is_match(col, keywords):
            return any(kw in col.lower().replace('_', '') for kw in keywords)

    for tier_keywords in DIMENSION_PRIORITY_KEYWORDS:
        for dim in remaining[:]:
            if _is_match(dim, tier_keywords):
                prioritized.append(dim)
                remaining.remove(dim)

    # Add remaining dimensions at the end
    prioritized.extend(remaining)
    return prioritized


def _pick_at_risk_metric(financial_metrics: List[str]) -> Optional[str]:
    """
    Select the best metric for churn "at risk" calculations.

    Preference order:
    1) Total/annual/lifetime revenue-like columns (e.g. TotalCharges, AnnualRevenue)
    2) Generic revenue/value columns
    3) Monthly/periodic revenue-like columns as fallback
    """
    if not financial_metrics:
        return None

    def _norm(name: str) -> str:
        return ''.join(ch for ch in str(name).lower() if ch.isalnum())

    normalized = [(_norm(col), col) for col in financial_metrics]

    total_like = (
        'total', 'annual', 'yearly', 'arr', 'lifetime', 'ltv',
        'grossrevenue', 'totalrevenue', 'totalcharge', 'totalcharges'
    )
    revenue_like = (
        'revenue', 'sales', 'income', 'billing', 'amount', 'charge', 'charges', 'value'
    )
    monthly_like = ('monthly', 'month', 'mrr')

    for n, col in normalized:
        if any(tok in n for tok in total_like) and any(tok in n for tok in revenue_like):
            return col

    for n, col in normalized:
        if any(tok in n for tok in revenue_like) and not any(tok in n for tok in monthly_like):
            return col

    for n, col in normalized:
        if any(tok in n for tok in monthly_like) and any(tok in n for tok in revenue_like):
            return col

    return financial_metrics[0]
# ============================================================================
# GEO DETECTION HELPERS
# ============================================================================

US_STATE_ABBREVS = {
    'al', 'ak', 'az', 'ar', 'ca', 'co', 'ct', 'de', 'fl', 'ga',
    'hi', 'id', 'il', 'in', 'ia', 'ks', 'ky', 'la', 'me', 'md',
    'ma', 'mi', 'mn', 'ms', 'mo', 'mt', 'ne', 'nv', 'nh', 'nj',
    'nm', 'ny', 'nc', 'nd', 'oh', 'ok', 'or', 'pa', 'ri', 'sc',
    'sd', 'tn', 'tx', 'ut', 'vt', 'va', 'wa', 'wv', 'wi', 'wy', 'dc'
}

US_STATE_FULL_NAMES = {
    'alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado',
    'connecticut', 'delaware', 'florida', 'georgia', 'hawaii', 'idaho',
    'illinois', 'indiana', 'iowa', 'kansas', 'kentucky', 'louisiana',
    'maine', 'maryland', 'massachusetts', 'michigan', 'minnesota',
    'mississippi', 'missouri', 'montana', 'nebraska', 'nevada',
    'new hampshire', 'new jersey', 'new mexico', 'new york',
    'north carolina', 'north dakota', 'ohio', 'oklahoma', 'oregon',
    'pennsylvania', 'rhode island', 'south carolina', 'south dakota',
    'tennessee', 'texas', 'utah', 'vermont', 'virginia', 'washington',
    'west virginia', 'wisconsin', 'wyoming', 'district of columbia'
}

COUNTRY_KEYWORDS = {
    'usa', 'us', 'united states', 'uk', 'united kingdom', 'germany',
    'france', 'china', 'india', 'brazil', 'australia', 'canada',
    'japan', 'russia', 'mexico', 'italy', 'spain', 'south korea',
    'indonesia', 'argentina', 'turkey', 'netherlands', 'saudi arabia'
}


WORLD_KEYWORDS = {
    'usa', 'us', 'united states', 'uk', 'united kingdom', 'germany',
    'france', 'china', 'india', 'brazil', 'australia', 'canada',
    'japan', 'russia', 'mexico', 'italy', 'spain', 'south korea'
}

def _detect_map_type(col_values: List[str]) -> Optional[str]:
    """
    Detect the appropriate map type based on the values in a geo column.
    Returns: 'us_states', 'world'
    """
    if not col_values:
        return 'world'

    sample_raw = [str(v).lower().strip() for v in col_values[:100]] # Increased sample
    
    # 1. Check for explicit "World" indicators
    # If we see things like 'France' or 'China' or 'USA', it's almost certainly a world map
    world_indicator_matches = sum(1 for v in sample_raw if v in WORLD_KEYWORDS)
    if world_indicator_matches > 0:
        return 'world'

    # 2. Check for US State abbreviations (e.g. CA, TX, NY)
    abbrev_matches = sum(1 for v in sample_raw if v in US_STATE_ABBREVS)
    if abbrev_matches / max(len(sample_raw), 1) > 0.3: # Lowered threshold slightly
        return 'us_states'

    # 3. Check for US State full names
    full_matches = sum(1 for v in sample_raw if v in US_STATE_FULL_NAMES)
    if full_matches / max(len(sample_raw), 1) > 0.3: # Lowered threshold slightly
        return 'us_states'

    # 4. Require at least SOME matches to call it a world map, otherwise None
    if world_indicator_matches > 0 or abbrev_matches > 0 or full_matches > 0:
        return 'world'

    return None


@dataclass
class ChartRecommendation:
    """Represents a chart recommendation."""
    slot: str
    title: str
    chart_type: str  # bar, hbar, pie, donut, line, scatter, stacked, geo_map
    data: List[Dict[str, Any]]
    confidence: str
    reason: str
    categories: Optional[List[str]] = None  # For stacked charts
    geo_meta: Optional[Dict[str, Any]] = None  # For geo_map charts
    format_type: Optional[str] = None  # e.g., 'currency', 'percentage', 'number'
    value_label: Optional[str] = None  # What the value represents: 'Orders', 'Customers', etc.
    outliers: Optional[Dict[str, Any]] = None
    data_without_outliers: Optional[List[Dict[str, Any]]] = None
    dimension: Optional[str] = None
    metric: Optional[str] = None
    aggregation: Optional[str] = None  # 'sum', 'mean', 'count'
    granularity: Optional[str] = None  # 'year', 'ytd', 'month', 'week', 'day'
    section: Optional[str] = None
    variance_score: float = 0.0

    def __post_init__(self):
        if isinstance(self.data, AggregationData) and self.data.outliers:
            self.outliers = self.data.outliers
            self.data_without_outliers = self.data.data_without_outliers


def _to_trend_point_key(value: Any) -> tuple[str, str]:
    """Normalize a grouped date key to (month-year label, ISO date string)."""
    try:
        ts = pd.Timestamp(value)
        if pd.isna(ts):
            raise ValueError("NaT")
        return ts.strftime('%b %Y'), str(ts.date())
    except Exception:
        raw = str(value)
        return raw, raw


def _safe_groupby_sum(df: pd.DataFrame, group_col: str, value_col: str, limit: int = 10) -> List[Dict]:
    """Safely group by and sum, returning top N."""
    try:
        outlier_mask = detect_outliers_iqr(df, value_col)
        outliers = None
        data_clean = None
        if outlier_mask.sum() > 0:
            outliers = {"count": int(outlier_mask.sum()), "metric": value_col}
            cleaned = df[~outlier_mask].groupby(group_col)[value_col].sum().sort_values(ascending=False).head(limit)
            data_clean = [{"name": str(k), "value": float(v)} for k, v in cleaned.items()]

        grouped = df.groupby(group_col)[value_col].sum().sort_values(ascending=False).head(limit)
        return AggregationData([{"name": str(k), "value": float(v)} for k, v in grouped.items()], outliers, data_clean)
    except Exception:
        return AggregationData([])


def _safe_groupby_mean(df: pd.DataFrame, group_col: str, value_col: str, limit: int = 10) -> List[Dict]:
    """Safely group by and calculate mean, returning top N."""
    try:
        outlier_mask = detect_outliers_iqr(df, value_col)
        outliers = None
        data_clean = None
        if outlier_mask.sum() > 0:
            outliers = {"count": int(outlier_mask.sum()), "metric": value_col}
            cleaned = df[~outlier_mask].groupby(group_col)[value_col].mean().sort_values(ascending=False).head(limit)
            data_clean = [{"name": str(k), "value": _round_mean_value(v, value_col)} for k, v in cleaned.items()]

        grouped = df.groupby(group_col)[value_col].mean().sort_values(ascending=False).head(limit)
        return AggregationData([{"name": str(k), "value": _round_mean_value(v, value_col)} for k, v in grouped.items()], outliers, data_clean)
    except Exception:
        return AggregationData([])


def _safe_value_counts(df: pd.DataFrame, col: str, limit: int = 10) -> List[Dict]:
    """Safely get value counts with 'Others' aggregation."""
    try:
        counts = df[col].value_counts()
        top = counts.head(limit)
        result = [{"name": str(k), "value": int(v)} for k, v in top.items()]
        # Aggregate remaining into "Others" if they exist
        remaining = counts.iloc[limit:].sum() if len(counts) > limit else 0
        if remaining > 0:
            result.append({"name": "Others", "value": int(remaining)})
        return result
    except Exception:
        return []


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
        return [
            {
                "timestamp": _to_trend_point_key(k)[0],
                "date": _to_trend_point_key(k)[1],
                "value": float(v),
            }
            for k, v in trend.items()
            if pd.notna(v)
        ]
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
    """Get scatter plot data with optional labels for tooltips."""
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
            point = {
                "x": float(row[x_col]), 
                "y": float(row[y_col]),
                "xLabel": _beautify_column_name(x_col),
                "yLabel": _beautify_column_name(y_col)
            }
            # Add label for tooltip only if it's a meaningful name
            if label_col and label_col in row:
                label_val = str(row[label_col])[:30]  # Truncate long labels
                # Skip if it looks like an ID (short numeric or code-like)
                if len(label_val) > 5 or not label_val.replace('_', '').replace('-', '').isdigit():
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


def _smart_target_label(target_col):
    """Convert target column name to a domain-aware label."""
    name = target_col.lower().replace('_', '')
    if 'churn' in name:
        return 'Churn'
    elif 'exit' in name or 'exited' in name:
        return 'Exit'
    elif 'attrition' in name:
        return 'Attrition'
    elif 'cancel' in name:
        return 'Cancellation'
    elif 'left' in name or 'leave' in name:
        return 'Departure'
    elif 'default' in name:
        return 'Default'
    else:
        return _beautify_column_name(target_col)


def _format_categorical_value(col: str, value: Any) -> str:
    """Standardize categorical values (0/1 -> No/Yes, specific target maps)."""
    val_str = str(value).lower().strip().replace('.0', '')
    col_name = col.lower().replace('_', '').replace('-', '')
    
    # Binary pattern matching
    is_pos = val_str in {'1', 'yes', 'true', 'positive', 'churned', 'exited', 'attrition'}
    is_neg = val_str in {'0', 'no', 'false', 'negative', 'retained', 'stayed', 'active'}
    
    # Priority 1: Domain-specific labels for target-like columns
    if is_pos or is_neg:
        if 'churn' in col_name:
            return 'Churned' if is_pos else 'Retained'
        if 'exit' in col_name:
            return 'Exited' if is_pos else 'Stayed'
        if 'attrition' in col_name:
            return 'Left' if is_pos else 'Stayed'
        if 'default' in col_name:
            return 'Defaulted' if is_pos else 'Performing'
        
        # Generic Yes/No for any other 0/1 or Yes/No column
        return 'Yes' if is_pos else 'No'
        
    return str(value)


def _get_binary_target_labels(target_col: str) -> tuple[str, str]:
    """Return (positive_label, negative_label) for binary target columns."""
    col_name = str(target_col).lower().replace('_', '').replace('-', '')
    if 'churn' in col_name:
        return ('Churned', 'Retained')
    if 'exit' in col_name:
        return ('Exited', 'Stayed')
    if 'attrition' in col_name:
        return ('Attrited', 'Retained')
    if 'left' in col_name or 'leave' in col_name:
        return ('Left', 'Stayed')
    if 'cancel' in col_name:
        return ('Cancelled', 'Active')
    if 'default' in col_name:
        return ('Defaulted', 'Performing')
    return ('Positive', 'Negative')



# ---------------------------------------------------------------------------
# New DA-Grade Chart Helpers
# ---------------------------------------------------------------------------

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



def _generate_churn_charts(df, classification):
    """
    Fully domain-agnostic churn dashboard — works for Telco, Bank, Movie, HR, SaaS.

    Column resolution uses SEMANTIC ROLES derived from the data, not keyword matching:
      - primary_dim: dimension with highest churn rate variance (data-driven)
      - primary_metric: first metric from priority list (usually revenue/value)
      - secondary_metric: second metric
      - lifecycle_col: numeric column most likely representing time/age/tenure
      - binary_dims: dimensions with exactly 2 values (demographic splits)
      - multi_dims: dimensions with 3-8 values (product/service groupings)
    """
    charts = []
    target_col = classification.targets[0] if classification.targets else None
    if not target_col:
        return charts

    pm = _prioritize_metrics(classification.metrics)
    pd_ = _prioritize_dimensions(classification.dimensions)
    primary_dim = _find_highest_variance_dim(df, target_col, pd_)
    label = _smart_target_label(target_col)  # "Churn" / "Exit" / "Attrition" etc.

    # ── SEMANTIC ROLE ASSIGNMENT ──────────────────────────────────────

    # Helper lambdas for column classification
    lifecycle_hints = ['tenure', 'age', 'months', 'years', 'duration', 'days',
                       'yearsatcompany', 'accountage', 'lengthofstay', 'seniority',
                       'experience', 'vintage', 'period', 'totalworkingyears']
    senior_hints    = ['senior', 'seniorcitizen', 'seniorcitizenind']
    value_hints     = ['charge', 'revenue', 'spent', 'billing', 'income', 'balance',
                       'price', 'amount', 'salary', 'cost', 'fee']

    def _compact(col: str) -> str:
        return ''.join(ch for ch in str(col).lower() if ch.isalnum())

    def _looks_financial_name(col: str) -> bool:
        name = _compact(col)
        financial_tokens = (
            'charge', 'charges', 'monthlycharge', 'totalcharge', 'revenue', 'income',
            'billing', 'bill', 'balance', 'amount', 'salary', 'cost', 'fee', 'mrr', 'arr'
        )
        return any(tok in name for tok in financial_tokens)

    try:
        from .semantic_resolver import semantic_similarity
        
        def _semantic_check(col, hints, threshold=0.55):
            return any(semantic_similarity(h, col) >= threshold for h in hints)
            
        def _is_lifecycle(col):
            # Guard: avoid treating financial fields like MonthlyCharges as lifecycle.
            if _looks_financial_name(col):
                return False
            return _semantic_check(col, lifecycle_hints)
        def _is_senior(col):    return _semantic_check(col, senior_hints)
        def _is_financial(col): return _semantic_check(col, value_hints) and not _is_lifecycle(col)
    except ImportError:
        def _is_lifecycle(col):
            if _looks_financial_name(col):
                return False
            return any(h in col.lower().replace('_', '') for h in lifecycle_hints)
        def _is_senior(col):    return any(h in col.lower().replace('_', '') for h in senior_hints)
        def _is_financial(col): return any(h in col.lower() for h in value_hints) and not _is_lifecycle(col)

    # Split pm into financial vs non-financial to prevent tenure from being summed
    financial_metrics = [c for c in pm if _is_financial(c)]
    # Primary financial metric — strictly used for SUM-based financial charts (Revenue at Risk)
    primary_value_metric = financial_metrics[0] if financial_metrics else None
    secondary_metric = next((c for c in financial_metrics if c != primary_value_metric), None)

    # Lifecycle column — strictly for survival/cohort & average charts, NEVER summed for 'At Risk'
    lifecycle_col = None
    all_numeric = pm + [c for c in df.select_dtypes('number').columns if c not in pm and c != target_col]
    for hint in lifecycle_hints:
        match = next((c for c in all_numeric if hint in c.lower().replace('_', '')), None)
        if match:
            lifecycle_col = match
            break

    # If no financial metric found, we use the first available non-lifecycle metric for secondary charts,
    # but we will guard the 'At Risk' charts.
    if not primary_value_metric:
        primary_value_metric = next((c for c in pm if c != lifecycle_col and not _is_senior(c)), pm[0] if pm else None)

    # Monthly financial metric (e.g., MonthlyCharges/MRR) for explicit monthly churn views.
    monthly_value_metric = next(
        (
            c for c in financial_metrics
            if any(tok in ''.join(ch for ch in str(c).lower() if ch.isalnum()) for tok in ('monthly', 'month', 'mrr'))
        ),
        None
    )

    # Binary dimensions (exactly 2 unique values)
    binary_dims = [d for d in pd_ if df[d].nunique() == 2 and d != target_col]
    # SeniorCitizen is often classified as a metric (0/1 int) — rescue it into binary_dims
    senior_col_match = next((c for c in pm + pd_ if _is_senior(c)), None)
    if senior_col_match and senior_col_match not in binary_dims:
        binary_dims.insert(0, senior_col_match)  # Highest priority in binary_dims

    # Multi-value dimensions (3-8 categories)
    multi_dims = [d for d in pd_ if 2 < df[d].nunique() <= 8 and d != target_col]
    def _find_payment_dimension(dim_candidates: List[str]) -> Optional[str]:
        """Resolve a payment-like categorical dimension across churn schemas."""
        # 1) Prefer canonical mapper output when available.
        mapped = None
        if getattr(classification, "mappings", None):
            mapped = classification.mappings.get("attr_payment")
        if mapped and mapped in df.columns and mapped in dim_candidates and mapped != target_col:
            if df[mapped].nunique(dropna=True) >= 2:
                return mapped

        payment_keywords = [
            "payment", "payment method", "payment type", "billing", "billing method",
            "billing type", "invoice method", "card", "bank", "autopay", "auto pay",
            "mode of payment",
        ]

        # 2) Semantic resolution across candidate dimensions.
        try:
            from .semantic_resolver import semantic_similarity
            best_col = None
            best_score = 0.0
            for col in dim_candidates:
                if col == target_col or col not in df.columns:
                    continue
                nunique = df[col].nunique(dropna=True)
                if nunique < 2:
                    continue
                # Keep chart interpretable; payment method should be categorical, not near-ID.
                if nunique > max(40, int(len(df) * 0.35)):
                    continue

                score = max(semantic_similarity(keyword, col) for keyword in payment_keywords)
                if score > best_score:
                    best_score = score
                    best_col = col
            if best_col and best_score >= 0.55:
                return best_col
        except Exception:
            pass

        # 3) String fallback for environments where semantic resolver is unavailable.
        fallback_tokens = ("payment", "billing", "invoice", "card", "bank", "autopay")
        for col in dim_candidates:
            if col == target_col or col not in df.columns:
                continue
            if any(token in col.lower() for token in fallback_tokens):
                if df[col].nunique(dropna=True) >= 2:
                    return col

        return None

    payment_col_match = _find_payment_dimension(pd_)

    # Second-best dimension (different from primary_dim)
    secondary_dim = next((d for d in pd_ if d != primary_dim and d != target_col), None)

    # Third dimension
    tertiary_dim = None
    for d in pd_:
        if d not in (primary_dim, secondary_dim, target_col):
            tertiary_dim = d
            break

    chart_titles = set()
    pos_label, neg_label = _get_binary_target_labels(target_col)

    def add_chart(rec):
        if rec.title not in chart_titles:
            charts.append(rec)
            chart_titles.add(rec.title)
            logger.debug('[ADD] #%d %r', len(charts), rec.title)
        else:
            logger.debug('[DUP] %r', rec.title)

    # 1. Target Distribution — Hero donut
    data = _get_target_distribution(df, target_col)
    if data:
        add_chart(ChartRecommendation(
            slot='', title=f'{label} Overview', chart_type='donut',
            data=data, confidence='HIGH',
            reason=f'Tier 1: Overall {label.lower()} split',
            value_label='Customers',
            dimension=target_col, metric=None, aggregation='count'
        ))

    # 2. Guaranteed Payment Method view (rate + volume) when a payment-like dimension exists.
    if payment_col_match:
        payment_dim_label = (
            re.sub(r'\s+', ' ', re.sub(r'(?<=[a-z0-9])(?=[A-Z])', ' ', str(payment_col_match)).replace('_', ' ').replace('-', ' ')).strip().title()
            or _beautify_column_name(payment_col_match)
        )
        data = _get_churn_rate_by_segment(df, target_col, payment_col_match)
        if data:
            add_chart(ChartRecommendation(
                slot='', title=f'{label} Rate by {payment_dim_label} (%)',
                chart_type='bar', data=data, confidence='HIGH',
                reason=f'Tier 1: Payment-method risk profile for {label.lower()}',
                format_type='percentage',
                dimension=payment_col_match, metric=target_col, aggregation='mean',
                variance_score=float('inf')
            ))

        data = _get_churn_count_by_segment(df, target_col, payment_col_match)
        if data:
            add_chart(ChartRecommendation(
                slot='', title=f'{label} Count by {payment_dim_label}',
                chart_type='hbar', data=data, confidence='HIGH',
                reason=f'Tier 1: Payment-method volume context for {label.lower()}',
                dimension=payment_col_match, metric=target_col, aggregation='count'
            ))

    # 3. Rate by Primary Dimension (highest variance = most impactful)
    if primary_dim:
        data = _get_churn_rate_by_segment(df, target_col, primary_dim)
        if data:
            add_chart(ChartRecommendation(
                slot='', title=f'{label} Rate by {_beautify_column_name(primary_dim)} (%)',
                chart_type='bar', data=data, confidence='HIGH',
                reason=f'Tier 1: Highest-variance dimension for {label.lower()}',
                dimension=primary_dim, metric=target_col, aggregation='mean'
            ))

    # 4. Lifecycle Cohort Analysis (data-driven quartile buckets)
    if lifecycle_col:
        data = _get_lifecycle_cohorts(df, lifecycle_col, target_col)
        if data:
            add_chart(ChartRecommendation(
                slot='',
                title=f'{label} Rate by {_beautify_column_name(lifecycle_col)} Cohort (%)',
                chart_type='bar', data=data, confidence='HIGH',
                reason=f'Tier 1: When in the lifecycle do they leave?',
                format_type='percentage',
                dimension=lifecycle_col, metric=target_col, aggregation='mean'
            ))
    elif secondary_dim and secondary_dim != primary_dim:
        data = _get_churn_rate_by_segment(df, target_col, secondary_dim)
        if data:
            add_chart(ChartRecommendation(
                slot='', title=f'{label} Rate by {_beautify_column_name(secondary_dim)} (%)',
                chart_type='bar', data=data, confidence='HIGH',
                reason=f'Tier 1: {label} rate by secondary dimension',
                format_type='percentage',
                dimension=secondary_dim, metric=target_col, aggregation='mean'
            ))

    # ── TIER 2: FINANCIAL IMPACT ─────────────────────────────────────

    # 4. Value at Risk by Primary Dimension (STRICTLY FINANCIAL)
    impact_metric = _pick_at_risk_metric(financial_metrics)
    if impact_metric and primary_dim:
        data = _get_value_at_risk(df, target_col, primary_dim, impact_metric)
        if data:
            add_chart(ChartRecommendation(
                slot='',
                title=f'{_beautify_column_name(impact_metric)} at Risk by {_beautify_column_name(primary_dim)}',
                chart_type='bar', data=data, confidence='HIGH',
                reason=f'Tier 2: Financial impact of {label.lower()} by segment',
                format_type='currency',
                dimension=primary_dim, metric=impact_metric, aggregation='sum'
            ))

    # 4b. Monthly Value at Risk by Primary Dimension (explicit monthly counterpart)
    if monthly_value_metric and primary_dim and monthly_value_metric != impact_metric:
        data = _get_value_at_risk(df, target_col, primary_dim, monthly_value_metric)
        if data:
            add_chart(ChartRecommendation(
                slot='',
                title=f'{_beautify_column_name(monthly_value_metric)} at Risk by {_beautify_column_name(primary_dim)}',
                chart_type='bar', data=data, confidence='HIGH',
                reason=f'Tier 2: Monthly financial impact of {label.lower()} by segment',
                format_type='currency',
                dimension=primary_dim, metric=monthly_value_metric, aggregation='sum'
            ))

    # 5. Metric Distribution — Treemap
    dim_for_treemap = secondary_dim or primary_dim
    if primary_value_metric and dim_for_treemap:
        data = _smart_aggregate(df, dim_for_treemap, primary_value_metric)
        if data:
            add_chart(ChartRecommendation(
                slot='',
                title=_create_smart_title(primary_value_metric, dim_for_treemap),
                chart_type='treemap', data=data, confidence='HIGH',
                reason='Tier 2: Revenue/value share by segment',
                dimension=dim_for_treemap, metric=primary_value_metric, aggregation='sum'
            ))

    # 6. Avg Lifecycle/Value by Primary Dimension
    avg_metric = lifecycle_col or primary_value_metric
    if avg_metric and primary_dim:
        data = _smart_aggregate(df, primary_dim, avg_metric)
        if data:
            add_chart(ChartRecommendation(
                slot='',
                title=_create_smart_title(avg_metric, primary_dim),
                chart_type='hbar', data=data, confidence='HIGH',
                reason='Tier 2: Metric variance by segment',
                dimension=primary_dim, metric=avg_metric, aggregation='mean' if _should_average_metric(avg_metric) else 'sum'
            ))

    # ── TIER 3: PRODUCT/SERVICE ANALYSIS ─────────────────────────────

    # 7. Rate by best multi-value dimension (product/service/role)
    svc_dim = next((d for d in multi_dims if d not in (primary_dim, secondary_dim)), None) or secondary_dim
    if svc_dim:
        data = _get_churn_rate_by_segment(df, target_col, svc_dim)
        if data:
            add_chart(ChartRecommendation(
                slot='', title=f'{label} Rate by {_beautify_column_name(svc_dim)} (%)',
                chart_type='bar', data=data, confidence='HIGH',
                reason=f'Tier 3: Which {_beautify_column_name(svc_dim)} segments have highest {label.lower()}?',
                format_type='percentage',
                dimension=svc_dim, metric=target_col, aggregation='mean'
            ))

    # 8. Value at Risk by second multi-value dimension (STRICTLY FINANCIAL)
    impact_metric = financial_metrics[0] if financial_metrics else None
    svc_dim2 = next((d for d in multi_dims if d not in (primary_dim, svc_dim)), None)
    if svc_dim2 and impact_metric:
        data = _get_value_at_risk(df, target_col, svc_dim2, impact_metric)
        if data:
            add_chart(ChartRecommendation(
                slot='',
                title=f'{_beautify_column_name(impact_metric)} at Risk by {_beautify_column_name(svc_dim2)}',
                chart_type='hbar', data=data, confidence='HIGH',
                reason='Tier 3: Secondary financial risk view',
                format_type='currency',
                dimension=svc_dim2, metric=impact_metric, aggregation='sum'
            ))
    elif secondary_dim and impact_metric and secondary_dim != svc_dim:
        data = _get_value_at_risk(df, target_col, secondary_dim, impact_metric)
        if data:
            add_chart(ChartRecommendation(
                slot='',
                title=f'{_beautify_column_name(impact_metric)} at Risk by {_beautify_column_name(secondary_dim)}',
                chart_type='hbar', data=data, confidence='HIGH',
                reason=f'Tier 3: Value leakage by secondary dimension',
                format_type='currency',
                dimension=secondary_dim, metric=impact_metric, aggregation='sum'
            ))

    # 9. Rate by tertiary dimension or another product/service dim
    tier3_dim = tertiary_dim or next((d for d in pd_ if d not in (primary_dim, secondary_dim, svc_dim, svc_dim2) and d != target_col), None)
    if tier3_dim:
        data = _get_churn_rate_by_segment(df, target_col, tier3_dim)
        if data:
            add_chart(ChartRecommendation(
                slot='', title=f'{label} Rate by {_beautify_column_name(tier3_dim)} (%)',
                chart_type='bar', data=data, confidence='HIGH',
                reason=f'Tier 3: {label} across {_beautify_column_name(tier3_dim)}',
                dimension=tier3_dim, metric=target_col, aggregation='mean'
            ))
    elif secondary_metric and primary_dim:
        data = _safe_groupby_mean(df, primary_dim, secondary_metric)
        if data:
            add_chart(ChartRecommendation(
                slot='',
                title=f'Avg {_beautify_column_name(secondary_metric)} by {_beautify_column_name(primary_dim)}',
                chart_type='hbar', data=data, confidence='MEDIUM',
                reason='Tier 3: Secondary metric by primary dimension',
                dimension=primary_dim, metric=secondary_metric, aggregation='mean'
            ))

    # ── TIER 4: DEMOGRAPHIC PROFILE ──────────────────────────────────

    # 10. Distribution of a multi-value dimension (donut)
    # Prefer payment method for this chart if available
    profile_dim = payment_col_match or next((d for d in multi_dims if d != primary_dim), None) or (pd_[0] if pd_ else None)
    if profile_dim:
        rec = _distribution_chart(
            df, profile_dim,
            title=f'{_beautify_column_name(profile_dim)} Distribution',
            confidence='HIGH',
            reason=f'Tier 4: Population distribution by {_beautify_column_name(profile_dim)}',
            value_label='Customers'
        )
        if rec:
            add_chart(rec)

    # 11. Senior Citizen churn rate (guaranteed slot)
    #     then fall back to any other unused binary dimension
    # 11. Senior Citizen churn rate (guaranteed slot)
    used_dims = {primary_dim, secondary_dim, svc_dim, svc_dim2, tier3_dim, profile_dim}
    if senior_col_match:
        data = _get_churn_rate_by_segment(df, target_col, senior_col_match)
        if data:
            add_chart(ChartRecommendation(
                slot='', title=f'{label} Rate by {_beautify_column_name(senior_col_match)} (%)',
                chart_type='bar', data=data, confidence='HIGH',
                reason='Tier 4: Senior vs Non-Senior churn split',
                dimension=senior_col_match, metric=target_col, aggregation='mean'
            ))
    else:
        bin1 = next((d for d in binary_dims if d not in used_dims), binary_dims[0] if binary_dims else None)
        if bin1:
            data = _get_churn_rate_by_segment(df, target_col, bin1)
            if data:
                add_chart(ChartRecommendation(
                    slot='', title=f'{label} Rate by {_beautify_column_name(bin1)} (%)',
                    chart_type='bar', data=data, confidence='HIGH',
                    reason=f'Tier 4: Binary demographic split — {_beautify_column_name(bin1)}',
                    dimension=bin1, metric=target_col, aggregation='mean'
                ))

    # 12. A second binary/unused dimension
    used_dims_after_11 = used_dims | ({senior_col_match} if senior_col_match else set())
    bin2 = next((d for d in binary_dims if d not in used_dims_after_11 and d != senior_col_match), None)
    if not bin2:
        bin2 = next((d for d in pd_ if d not in used_dims_after_11 and d != target_col), None)
    if bin2:
        data = _get_churn_rate_by_segment(df, target_col, bin2)
        if data:
            add_chart(ChartRecommendation(
                slot='', title=f'{label} Rate by {_beautify_column_name(bin2)} (%)',
                chart_type='bar', data=data, confidence='MEDIUM',
                reason=f'Tier 4: Demographic/behavioral split — {_beautify_column_name(bin2)}',
                dimension=bin2, metric=target_col, aggregation='mean'
            ))
    elif primary_dim:
        rec = _distribution_chart(
            df, primary_dim,
            title=f'{_beautify_column_name(primary_dim)} Distribution',
            confidence='MEDIUM',
            reason='Tier 4: Segment distribution',
            value_label='Customers'
        )
        if rec:
            rec.dimension = primary_dim
            rec.aggregation = 'count'
            add_chart(rec)

    # ── TIER 5: BEHAVIORAL DEPTH ─────────────────────────────────────

    # 13. Metric correlations (Scatter)
    scatter_x = primary_value_metric or pm[0] if pm else None
    scatter_y = secondary_metric or (pm[1] if len(pm) > 1 else None) or lifecycle_col
    if scatter_x and scatter_y and scatter_x != scatter_y:
        data = _get_scatter_data(df, scatter_x, scatter_y, limit=200)
        if data:
            add_chart(ChartRecommendation(
                slot='',
                title=f'{_beautify_column_name(scatter_x)} vs {_beautify_column_name(scatter_y)}',
                chart_type='scatter', data=data, confidence='MEDIUM',
                reason='Tier 5: Correlation between key metrics',
                dimension=scatter_x, metric=scatter_y, aggregation='sum'
            ))

    # 14. Time trend OR Value at Risk by another dimension
    if classification.dates and primary_value_metric:
        date_col = classification.dates[0]
        data = _get_time_trend(
            df,
            date_col,
            primary_value_metric,
            aggregation=_trend_aggregation_for_metric(primary_value_metric),
        )
        if data:
            # Dynamically determine aggregation metadata to match _get_time_trend logic
            trend_agg = 'mean' if _should_average_metric(primary_value_metric) else 'sum'
            add_chart(ChartRecommendation(
                slot='',
                title=f'{_beautify_column_name(primary_value_metric)} Trend Over Time',
                chart_type='area', data=data, confidence='HIGH',
                reason='Tier 5: Trend analysis for seasonality',
                dimension=date_col, metric=primary_value_metric, aggregation=trend_agg
            ))
    elif secondary_metric and secondary_dim:
        data = _get_value_at_risk(df, target_col, secondary_dim, secondary_metric)
        if data:
            add_chart(ChartRecommendation(
                slot='',
                title=f'{_beautify_column_name(secondary_metric)} at Risk by {_beautify_column_name(secondary_dim)}',
                chart_type='hbar', data=data, confidence='MEDIUM',
                reason='Tier 5: Secondary value at risk',
                dimension=secondary_dim, metric=secondary_metric, aggregation='sum'
            ))
    elif primary_value_metric and len(pd_) > 1:
        dim = pd_[1] if pd_[0] == primary_dim else pd_[0]
        data = _safe_groupby_mean(df, dim, primary_value_metric)
        if data:
            add_chart(ChartRecommendation(
                slot='',
                title=f'Avg {_beautify_column_name(primary_value_metric)} by {_beautify_column_name(dim)}',
                chart_type='hbar', data=data, confidence='MEDIUM',
                reason='Tier 5: Metric depth fallback',
                dimension=dim, metric=primary_value_metric, aggregation='mean'
            ))

    # 15. Final coverage — exhaustive metric×dim search for any unused combo
    # Build full candidate list: all metrics (financial first, then lifecycle, then others)
    candidate_metrics_15 = (
        [c for c in financial_metrics if c not in (primary_value_metric, secondary_metric)]
        + ([lifecycle_col] if lifecycle_col else [])
        + [c for c in pm if c not in financial_metrics and c != lifecycle_col and not _is_senior(c)]
        + [primary_value_metric, secondary_metric]  # last resort: reuse financial with new dim
    )
    candidate_dims_15 = list(pd_)  # all dims, deduplication handles collisions

    added_15 = False
    for m15 in [c for c in candidate_metrics_15 if c]:  # skip None
        for d15 in candidate_dims_15:
            agg_label = 'Total' if m15 in financial_metrics else 'Avg'
            candidate_title = f'{agg_label} {_beautify_column_name(m15)} by {_beautify_column_name(d15)}'
            _used = candidate_title in chart_titles
            logger.debug('[C15] %r used=%s', candidate_title, _used)
            if _used:
                continue
            data = (_safe_groupby_sum(df, d15, m15) if m15 in financial_metrics
                    else _safe_groupby_mean(df, d15, m15))
            logger.debug('[C15]   data_ok=%s', bool(data))
            if data:
                add_chart(ChartRecommendation(
                    slot='', title=candidate_title,
                    chart_type='hbar', data=data, confidence='MEDIUM',
                    reason='Tier 5: Extended metric coverage',
                    dimension=d15, metric=m15, aggregation='sum' if m15 in financial_metrics else 'mean'
                ))
                added_15 = True
                break
        if added_15:
            break

    # Guaranteed final fallback — always works because title includes 'Distribution'
    if not added_15 and primary_value_metric and primary_dim:
        data = _safe_groupby_sum(df, primary_dim, primary_value_metric)
        if data:
            add_chart(ChartRecommendation(
                slot='',
                title=f'Total {_beautify_column_name(primary_value_metric)} Distribution by {_beautify_column_name(primary_dim)}',
                chart_type='treemap', data=data, confidence='MEDIUM',
                reason='Tier 5: Final summary view'
            ))


    # ── TIER 6: PROFESSIONAL DA DEPTH ────────────────────────────────

    # 16. Stacked Churn Counts by Primary Dimension (Yes/No volume split)
    if primary_dim:
        data = _get_stacked_churn_counts(df, target_col, primary_dim)
        if data:
            add_chart(ChartRecommendation(
                slot='', title=f'{label} Volume by {_beautify_column_name(primary_dim)}',
                chart_type='stacked_bar', data=data, confidence='HIGH',
                categories=[pos_label, neg_label],
                reason=f'Tier 6: Volume split — raw count of {pos_label.lower()} vs {neg_label.lower()} per segment',
                dimension=primary_dim, metric=target_col, aggregation='count'
            ))

    # 17. Positive vs Negative cohort — Avg Primary Metric Comparison
    if primary_value_metric:
        data = _get_churned_vs_retained_avg(df, target_col, primary_value_metric)
        if data:
            add_chart(ChartRecommendation(
                slot='',
                title=f'Avg {_beautify_column_name(primary_value_metric)}: {pos_label} vs {neg_label}',
                chart_type='bar', data=data, confidence='HIGH',
                reason=f'Tier 6: Price sensitivity — are {pos_label.lower()} users paying more or less?',
                dimension=target_col, metric=primary_value_metric, aggregation='mean'
            ))

    # 18. Churn Count by Secondary Dimension (volume, not rate)
    count_dim = secondary_dim or (multi_dims[0] if multi_dims else None)
    if count_dim and count_dim != primary_dim:
        data = _get_churn_count_by_segment(df, target_col, count_dim)
        if data:
            add_chart(ChartRecommendation(
                slot='',
                title=f'{label} Count by {_beautify_column_name(count_dim)}',
                chart_type='hbar', data=data, confidence='HIGH',
                reason=f'Tier 6: Where is the volume of {label.lower()} concentrated?',
                dimension=count_dim, metric=target_col, aggregation='count'
            ))

    # 19. Financial Cohort Analysis — churn rate by metric quartile
    cohort_metric = primary_value_metric or (financial_metrics[0] if financial_metrics else None)
    if cohort_metric and cohort_metric != lifecycle_col:
        data = _get_metric_cohort_analysis(df, cohort_metric, target_col)
        if data:
            add_chart(ChartRecommendation(
                slot='',
                title=f'{label} Rate by {_beautify_column_name(cohort_metric)} Range (%)',
                chart_type='bar', data=data, confidence='HIGH',
                reason='Tier 6: Do high-value customers churn more or less?',
                dimension=cohort_metric, metric=target_col, aggregation='mean'
            ))

    # 19b. Monthly Financial Cohort Analysis — explicit monthly counterpart
    if monthly_value_metric and monthly_value_metric != lifecycle_col and monthly_value_metric != cohort_metric:
        data = _get_metric_cohort_analysis(df, monthly_value_metric, target_col)
        if data:
            add_chart(ChartRecommendation(
                slot='',
                title=f'{label} Rate by {_beautify_column_name(monthly_value_metric)} Range (%)',
                chart_type='bar', data=data, confidence='HIGH',
                reason='Tier 6: Monthly financial cohort analysis',
                dimension=monthly_value_metric, metric=target_col, aggregation='mean'
            ))

    # 20. Positive vs Negative cohort — Avg Lifecycle/Tenure Comparison
    if lifecycle_col:
        data = _get_churned_vs_retained_avg(df, target_col, lifecycle_col)
        if data:
            add_chart(ChartRecommendation(
                slot='',
                title=f'Avg {_beautify_column_name(lifecycle_col)}: {pos_label} vs {neg_label}',
                chart_type='bar', data=data, confidence='HIGH',
                reason=f'Tier 6: Do long-lifecycle {pos_label.lower()} users differ from {neg_label.lower()} users?',
                dimension=target_col, metric=lifecycle_col, aggregation='mean'
            ))

    # 21. Bonus: Secondary metric cohort analysis (if different from primary)
    if secondary_metric and secondary_metric != cohort_metric:
        data = _get_metric_cohort_analysis(df, secondary_metric, target_col)
        if data:
            add_chart(ChartRecommendation(
                slot='',
                title=f'{label} Rate by {_beautify_column_name(secondary_metric)} Range (%)',
                chart_type='bar', data=data, confidence='MEDIUM',
                reason='Tier 6: Secondary metric cohort analysis',
                dimension=secondary_metric, metric=target_col, aggregation='mean'
            ))

    # 22. Bonus: Distribution of a new unused dimension (donut)
    all_used_dims = {primary_dim, secondary_dim, svc_dim, svc_dim2, tier3_dim, profile_dim, count_dim}
    bonus_dim = next((d for d in pd_ if d not in all_used_dims and d != target_col), None)
    if bonus_dim:
        rec = _distribution_chart(
            df, bonus_dim,
            title=f'{_beautify_column_name(bonus_dim)} Distribution',
            confidence='MEDIUM',
            reason='Tier 6: Additional segment breakdown',
            value_label='Customers'
        )
        if rec:
            rec.dimension = bonus_dim
            rec.aggregation = 'count'
            add_chart(rec)

    # 23. Extra View: Total Charges by Gender (User Request)
    # Search ALL columns for a more robust match, not just classification summaries
    gender_col = next((c for c in df.columns if 'gender' in str(c).lower()), None)
    total_vol_metric = next((c for c in df.columns if 'total' in str(c).lower() and ('charge' in str(c).lower() or 'revenue' in str(c).lower() or 'spent' in str(c).lower())), None)
    
    if gender_col and total_vol_metric:
        try:
            # Ensure metric is numeric for sum aggregation
            df[total_vol_metric] = pd.to_numeric(df[total_vol_metric], errors='coerce')
            data = _safe_groupby_sum(df, gender_col, total_vol_metric)
            if data and len(data) > 0:
                rec = ChartRecommendation(
                    slot='', 
                    title=f'Total {_beautify_column_name(total_vol_metric)} by {_beautify_column_name(gender_col)}',
                    chart_type='hbar', data=data, confidence='MEDIUM',
                    reason='Extra view: Total financial volume split by gender',
                    format_type='currency',
                    dimension=gender_col, metric=total_vol_metric, aggregation='sum'
                )
                rec.variance_score = float('inf')  # Force it to the top so it doesn't get truncated
                add_chart(rec)
        except Exception as e:
            logger.error(f"[USER-REQUEST] Failed to add custom chart: {e}")

    return charts

def _generate_sales_charts(df: pd.DataFrame, classification: ColumnClassification) -> List[ChartRecommendation]:
    """
    Tier 6 Data Analyst Grade E-commerce / Sales Dashboard.
    Highly dynamic: adapts to standard retail, B2B sales, SaaS, and marketplaces.
    """
    charts = []
    chart_titles = set()

    def add_chart(rec):
        if rec.title not in chart_titles:
            # We assign dynamic slots later, so leave empty for now
            rec.slot = '' 
            charts.append(rec)
            chart_titles.add(rec.title)

    # ========================================
    # DYNAMIC COLUMNS DETECTION (SEMANTIC ROLES)
    # ========================================
    pm = classification.metrics
    pd_ = classification.dimensions

    def _find_col(keywords, cols, exclude=None, min_unique=None):
        exclude = exclude or []
        
        # Primary: Semantic mapping
        try:
            from .semantic_resolver import semantic_similarity
            best_score = 0.0
            best_col = None

            for col in cols:
                # Check exclusions
                col_norm = col.lower().replace('_', '').replace('-', '')
                if any(ex in col_norm for ex in exclude):
                    continue
                
                # Check cardinality constraint
                if min_unique and df[col].nunique() < min_unique:
                    continue

                for kw in keywords:
                    score = semantic_similarity(kw, col)
                    if score > best_score:
                        best_score = score
                        best_col = col

            if best_col and best_score >= 0.55:
                return best_col
        except ImportError:
            pass

        # Fallback: Substring matching
        for col in cols:
            col_lower = col.lower().replace('_', '').replace('-', '')
            if any(kw in col_lower for kw in keywords):
                if not any(ex in col_lower for ex in exclude):
                    if min_unique:
                        if df[col].nunique() >= min_unique:
                            return col
                    else:
                        return col
        return None

    revenue_col = _find_col(['revenue', 'sales', 'amount', 'total', 'gmv'], pm) or (pm[0] if pm else None)
    qty_col = _find_col(['quantity', 'qty', 'units', 'count', 'volume'], pm)
    profit_col = _find_col(['profit', 'margin', 'net', 'earnings'], pm)
    discount_col = _find_col(['discount', 'rebate', 'reduction', 'coupon'], pm)
    cost_col = _find_col(['cost', 'cogs', 'expense'], pm)

    product_col = _find_col(['product', 'item', 'sku', 'service'], pd_)
    category_col = _find_col(['category', 'subcategory', 'segment', 'department', 'type', 'group'], pd_)
    
    # Stricter detection for high-cardinality entities
    entity_excludes = ['segment', 'type', 'group', 'class', 'region', 'state', 'tier', 'status', 'category', 'profile', 'city', 'country', 'zip', 'postal', 'zone']
    customer_col = _find_col(['customer', 'client', 'buyer', 'account', 'user', 'email'], pd_, exclude=entity_excludes, min_unique=5)
    order_col = _find_col(['order', 'invoice', 'receipt', 'transaction', 'cart'], pd_, exclude=entity_excludes, min_unique=5)
    
    date_col = classification.dates[0] if classification.dates else None

    # Geo columns
    country_col = _find_col(['country', 'nation'], pd_)
    state_col = _find_col(['state', 'province'], pd_)
    city_col = _find_col(['city', 'town'], pd_)
    region_col = _find_col(['region', 'market', 'territory', 'zone'], pd_)
    geo_col = country_col or state_col or region_col or city_col

    # Fallback dim
    primary_dim = category_col or product_col or geo_col or (pd_[0] if pd_ else None)
    secondary_dim = next((d for d in pd_ if d not in (primary_dim, customer_col, order_col)), None)

    # ── TIER 1: EXECUTIVE OVERVIEW (HERO CHARTS) ─────────────────────
    
    # 1. Top Segments by Revenue (Bar/HBar)
    hero_dim = product_col or category_col or primary_dim
    if hero_dim and revenue_col:
        data = _smart_aggregate(df, hero_dim, revenue_col, limit=10)
        if data:
            add_chart(ChartRecommendation(
                slot='', title=_create_smart_title(revenue_col, hero_dim),
                chart_type="hbar", data=data, confidence="HIGH",
                reason="Hero Chart: Best-selling segments by revenue",
                format_type="currency",
                dimension=hero_dim, metric=revenue_col, aggregation="sum"
            ))

    # 2. Geographic Revenue Distribution — handled by _generate_geo_charts (multi-metric)

    # 3. Time Intelligence (Line/Area)
    if date_col and revenue_col:
        data = _get_time_trend(
            df,
            date_col,
            revenue_col,
            aggregation=_trend_aggregation_for_metric(revenue_col),
        )
        if data:
            add_chart(ChartRecommendation(
                slot='', title=_create_smart_title(revenue_col, date_col),
                chart_type='line', data=data, confidence='HIGH',
                reason='Tier 1: Sales velocity and seasonality',
                format_type="currency",
                dimension=date_col, metric=revenue_col, aggregation="sum"
            ))
            
    # 4. Growth Benchmarking (YoY/YTD)
    if date_col and revenue_col:
        yoy_data = _get_yoy_comparison(df, date_col, revenue_col)
        if yoy_data:
            add_chart(ChartRecommendation(
                slot='', title=f"Year-over-Year {_beautify_column_name(revenue_col)}",
                chart_type="bar", data=yoy_data, confidence="HIGH",
                reason="Macro Growth: Annual performance trajectory",
                format_type="currency",
                dimension=date_col, metric=revenue_col, aggregation="sum",
                granularity="year"
            ))
        
        ytd_data = _get_ytd_comparison(df, date_col, revenue_col)
        if ytd_data:
            add_chart(ChartRecommendation(
                slot='', title=f"Year-to-Date {_beautify_column_name(revenue_col)} Benchmark",
                chart_type="bar", data=ytd_data, confidence="HIGH",
                reason="Strategic Target: Current year performance vs same period last year",
                format_type="currency",
                dimension=date_col, metric=revenue_col, aggregation="sum",
                granularity="ytd"
            ))

    # 5. Categorical Mix (Donut)
    mix_dim = category_col or secondary_dim
    if mix_dim and revenue_col:
        data = _smart_aggregate(df, mix_dim, revenue_col)
        if data:
            add_chart(ChartRecommendation(
                slot='', title=f"{_beautify_column_name(revenue_col)} Composition by {_beautify_column_name(mix_dim)}",
                chart_type="donut", data=data, confidence="HIGH",
                reason="Categorical composition of revenue",
                format_type="currency",
                dimension=mix_dim, metric=revenue_col, aggregation="sum"
            ))

    # ── TIER 2: ADVANCED PROFITABILITY & ECONOMICS ───────────────────
    
    # 6. Profitability per Segment
    if profit_col:
        p_dim = category_col or primary_dim
        if p_dim:
            data = _smart_aggregate(df, p_dim, profit_col, limit=10)
            if data:
                add_chart(ChartRecommendation(
                    slot='', title=_create_smart_title(profit_col, p_dim),
                    chart_type="bar", data=data, confidence="HIGH",
                    reason="Bottom-line analysis per segment",
                    format_type="currency",
                    dimension=p_dim, metric=profit_col, aggregation="sum"
                ))

    # 7. Unit Economics (Margins & Discounts)
    if revenue_col and profit_col and category_col:
        try:
            cat_group = df.groupby(category_col)[[profit_col, revenue_col]].sum().reset_index()
            cat_group = cat_group[cat_group[revenue_col] > 0]
            cat_group['margin_pct'] = (cat_group[profit_col] / cat_group[revenue_col]) * 100
            top_margins = cat_group.sort_values('margin_pct', ascending=False).head(10)
            data = top_margins.rename(columns={category_col: 'name', 'margin_pct': 'value'}).to_dict('records')
            if data:
                add_chart(ChartRecommendation(
                    slot='', title=f"Profit Margin (%) by {_beautify_column_name(category_col)}",
                    chart_type="hbar", data=data, confidence="HIGH",
                    reason="Unit Economics: Which segments are actually profitable?",
                    format_type="percentage",
                    dimension=None, metric=None, aggregation=None
                ))
        except: pass

    # 6. Discount Impact
    if discount_col and revenue_col:
        d_dim = category_col or secondary_dim or geo_col
        if d_dim:
            data = _safe_groupby_sum(df, d_dim, discount_col, limit=10)
            if data:
                add_chart(ChartRecommendation(
                    slot='', title=f"{_beautify_column_name(discount_col)} Value by {_beautify_column_name(d_dim)}",
                    chart_type="bar", data=data, confidence="HIGH",
                    reason="Revenue Leakage: Where are we losing margin?",
                    format_type="currency",
                    dimension=d_dim, metric=discount_col, aggregation="sum"
                ))

    # 7. Discount vs Profit Scatter
    if discount_col and profit_col:
        data = _get_scatter_data(df, discount_col, profit_col)
        if data:
            add_chart(ChartRecommendation(
                slot='', title=f"{_beautify_column_name(discount_col)} vs {_beautify_column_name(profit_col)}",
                chart_type="scatter", data=data, confidence="MEDIUM",
                reason="Promotional Effectiveness: Do discounts kill profitability?",
                format_type="currency",
                dimension=discount_col, metric=profit_col, aggregation="sum"
            ))

    # ── TIER 3: CUSTOMER-CENTRIC (RFM Proxies) ─────────────
    
    if customer_col:
        # 8. Purchase Frequency
        if order_col:
            try:
                order_counts = df.groupby(customer_col)[order_col].nunique()
                bins = [0, 1, 2, 5, 100000]
                labels = ['1 Order', '2 Orders', '3-5 Orders', '5+ Orders']
                freq_dist = pd.cut(order_counts, bins=bins, labels=labels).value_counts().reset_index()
                freq_dist.columns = ['name', 'value']
                data = freq_dist.to_dict('records')
                # Filter out zeroes
                data = [d for d in data if d['value'] > 0]
                if data:
                    add_chart(ChartRecommendation(
                        slot='', title=f"{_beautify_column_name(customer_col)} Purchase Frequency",
                        chart_type="donut", data=data, confidence="HIGH",
                        reason="Customer Loyalty: One-time buyers vs. Repeat customers",
                        format_type="number",
                        value_label='Customers'
                    ))
            except Exception:
                pass

        # 9. Top Customers by Revenue
        if revenue_col:
            data = _smart_aggregate(df, customer_col, revenue_col, limit=10)
            if data:
                add_chart(ChartRecommendation(
                    slot='', title=_create_smart_title(revenue_col, customer_col),
                    chart_type="hbar", data=data, confidence="HIGH",
                    reason="Client Concentration: High-value VIP customers",
                    format_type="currency",
                    dimension=customer_col, metric=revenue_col, aggregation="sum"
                ))

        # 10. Avg Order Value (AOV)
        if order_col and revenue_col and category_col:
            try:
                aov_df = df.groupby(category_col).agg({revenue_col: 'sum', order_col: 'nunique'}).reset_index()
                aov_df = aov_df[aov_df[order_col] > 0]
                aov_df['AOV'] = aov_df[revenue_col] / aov_df[order_col]
                data = aov_df.sort_values('AOV', ascending=False).head(10).rename(columns={category_col: 'name', 'AOV': 'value'}).to_dict('records')
                if data:
                    add_chart(ChartRecommendation(
                        slot='', title=f"Avg. {_beautify_column_name(order_col)} Value by {_beautify_column_name(category_col)}",
                        chart_type="bar", data=data, confidence="HIGH",
                        reason="Basket Size: Which segments spend more per checkout?",
                        format_type="currency"
                    ))
            except Exception:
                pass

    # ── TIER 4: OPERATIONAL & GEOGRAPHIC VOLUME ──────────────────────

    # 11. Geographic Spread
    if geo_col and revenue_col:
        data = _smart_aggregate(df, geo_col, revenue_col, limit=10)
        if data:
            add_chart(ChartRecommendation(
                slot='', title=_create_smart_title(revenue_col, geo_col),
                chart_type="hbar", data=data, confidence="HIGH",
                reason="Market Penetration: Top performing regions",
                format_type="currency",
                dimension=geo_col, metric=revenue_col, aggregation="sum"
            ))
            
    # 12. Quantity Trend
    if date_col and qty_col:
        data = _get_time_trend(
            df,
            date_col,
            qty_col,
            aggregation=_trend_aggregation_for_metric(qty_col),
        )
        if data:
            add_chart(ChartRecommendation(
                slot='', title=f"{_get_metric_prefix(qty_col)} Movement Trend",
                chart_type="line", data=data, confidence="MEDIUM",
                reason="Operational Volume Forecasting",
                format_type="number",
                dimension=date_col, metric=qty_col, aggregation="sum", granularity="month"
            ))

    # 13. Top Products by Quantity
    if product_col and qty_col:
        data = _smart_aggregate(df, product_col, qty_col, limit=10)
        if data:
            add_chart(ChartRecommendation(
                slot='', title=_create_smart_title(qty_col, product_col),
                chart_type="hbar", data=data, confidence="MEDIUM",
                reason="Velocity: Products with highest movement/turnover",
                format_type="number",
                dimension=product_col, metric=qty_col, aggregation="sum"
            ))

    # ── TIER 5: SMART FALLBACKS (Ensure 15+ rich charts) ─────────────
    
    extra_dims = [d for d in pd_ if d not in (product_col, category_col, geo_col, customer_col, order_col)]
    for i, edim in enumerate(extra_dims):
        if len(charts) >= 22:
            break
            
        # Segment Distribution
        rec = _distribution_chart(
            df, edim,
            title=f"{_beautify_column_name(edim)} Breakdown",
            confidence="MEDIUM",
            reason="Data Diversity: Exploring secondary segments",
            value_label='Orders'
        )
        if rec:
            add_chart(rec)
            
        # Metric by Extra Dim
        if revenue_col:
            data = _safe_groupby_sum(df, edim, revenue_col, limit=10)
            if data:
                add_chart(ChartRecommendation(
                    slot='', title=f"{_get_metric_prefix(revenue_col)} by {_beautify_column_name(edim)}",
                    chart_type="hbar", data=data, confidence="MEDIUM",
                    reason="Deep Dive: Uncovering hidden revenue pockets",
                    dimension=edim, metric=revenue_col, aggregation="sum"
                ))
    
    # Fill remaining slots using secondary metrics with primary dimensions
    for metric in pm:
        if len(charts) >= 22:
            break
        if metric in (revenue_col, qty_col, profit_col, discount_col, cost_col):
            continue
            
        if category_col:
             data = _safe_groupby_sum(df, category_col, metric, limit=10)
             if data:
                 add_chart(ChartRecommendation(
                     slot='', title=f"{_beautify_column_name(metric)} by {_beautify_column_name(category_col)}",
                     chart_type="bar", data=data, confidence="LOW",
                     reason="Exhaustive metric coverage fallback",
                     dimension=category_col, metric=metric, aggregation="sum"
                 ))

    # Final guarantee to ensure we don't fall short if data is extremely simple
    if primary_dim and qty_col and len(charts) < 15:
        data = _safe_groupby_sum(df, primary_dim, qty_col)
        if data:
             add_chart(ChartRecommendation(
                 slot='', title=f"{_get_metric_prefix(qty_col)} breakdown by {_beautify_column_name(primary_dim)}",
                 chart_type="donut", data=data, confidence="LOW",
                 reason="Volume breakdown"
             ))

    # Slot normalization
    for i, c in enumerate(charts):
        c.slot = f"slot_{i+1}"

    return charts



def _generate_geo_charts(df: pd.DataFrame, classification: ColumnClassification) -> List[ChartRecommendation]:
    """
    Generate a SINGLE multi-metric geographic map chart.
    Merges revenue, profit, and other financial metrics into one map.
    Tooltip will display: California — Revenue: $2M, Profit: $500K
    """
    charts = []

    # Fetch semantic_similarity safely
    try:
        from .semantic_resolver import semantic_similarity
        def _semantic_check(col, keywords, threshold=0.8):
            return any(semantic_similarity(kw, col) >= threshold for kw in keywords)
    except ImportError:
        def _semantic_check(col, keywords, threshold=0.8):
            return any(kw in col.lower() for kw in keywords)

    # 1. Find all geo-type dimension columns
    geo_keywords = ['country', 'state', 'province', 'region', 'continent', 'nation', 'territory']
    geo_cols = [d for d in classification.dimensions if _semantic_check(d, geo_keywords)]

    if not geo_cols:
        return charts

    # 2. Match ALL financial metrics (not just one)
    revenue_keywords = ['revenue', 'sales', 'profit', 'amount', 'total_charges', 'monthly_charges', 'cost', 'earnings']
    financial_metrics = [m for m in classification.metrics if _semantic_check(m, revenue_keywords)]
    
    # Fallback: use first metric if no financial ones found
    if not financial_metrics:
        financial_metrics = classification.metrics[:1] if classification.metrics else []
    
    if not financial_metrics:
        return charts

    primary_metric = financial_metrics[0]

    # 3. Prefer State column for US drilling; fallback to Country, then first geo
    priority_order = ['state', 'country', 'region']
    best_geo = geo_cols[0]
    for priority in priority_order:
        match = next((c for c in geo_cols if _semantic_check(c, [priority])), None)
        if match:
            best_geo = match
            break

    # 4. Build multi-metric data payload
    # Primary metric for coloring (value field), additional metrics embedded
    try:
        grouped = df.groupby(best_geo)
        primary_data = grouped[primary_metric].sum().sort_values(ascending=False).head(60)
        
        # Build secondary metric aggregations
        secondary_aggs = {}
        for m in financial_metrics[1:3]:  # Max 3 metrics total (primary + 2 secondary)
            secondary_aggs[m] = grouped[m].sum()
        
        data = []
        for geo_name, primary_val in primary_data.items():
            if pd.isna(primary_val):
                continue
            entry = {
                "name": str(geo_name),
                "value": round(float(primary_val), 2),
            }
            
            # Embed additional metrics for multi-metric tooltip
            if secondary_aggs:
                metrics_dict = {_beautify_column_name(primary_metric): round(float(primary_val), 2)}
                for m, agg_series in secondary_aggs.items():
                    val = agg_series.get(geo_name, 0)
                    if pd.notna(val):
                        metrics_dict[_beautify_column_name(m)] = round(float(val), 2)
                entry["metrics"] = metrics_dict
            
            data.append(entry)
    except Exception:
        data = _smart_aggregate(df, best_geo, primary_metric, limit=60)

    if not data:
        return charts

    # 5. Detect map type
    col_values = df[best_geo].dropna().unique().tolist()
    map_type = _detect_map_type(col_values)

    if map_type:
        # Build a professional title
        metric_names = [_beautify_column_name(m) for m in financial_metrics[:3]]
        title = f"{' & '.join(metric_names)} by {_beautify_column_name(best_geo)}" if len(metric_names) > 1 else _create_smart_title(primary_metric, best_geo)
        
        charts.append(ChartRecommendation(
            slot="slot_geo",
            title=title,
            chart_type="geo_map",
            data=data,
            confidence="HIGH",
            reason=f"Multi-metric geographic analysis across {best_geo}",
            geo_meta={
                "map_type": map_type,
                "geo_col": best_geo,
                "metric_col": primary_metric,
                "metrics": [_beautify_column_name(m) for m in financial_metrics[:3]],
            },
            format_type="currency"
        ))

    return charts


def _generate_generic_charts(df: pd.DataFrame, classification: ColumnClassification) -> List[ChartRecommendation]:
    """Generate charts for Generic/Unknown domain."""
    charts = []
    
    # 1. Primary analysis
    if classification.metrics and classification.dimensions:
        metric = classification.metrics[0]
        dim = classification.dimensions[0]
        data = _smart_aggregate(df, dim, metric)
        if data:
            charts.append(ChartRecommendation(
                slot="slot_1", title=_create_smart_title(metric, dim),
                chart_type="bar", data=data, confidence="MEDIUM",
                reason="Primary metric breakdown",
                dimension=dim, metric=metric,
                aggregation="mean" if _should_average_metric(metric) else "sum"
            ))
    
    # 2. Secondary analysis
    if len(classification.metrics) > 1 and len(classification.dimensions) > 1:
        metric = classification.metrics[1]
        dim = classification.dimensions[1]
        data = _smart_aggregate(df, dim, metric)
        if data:
            charts.append(ChartRecommendation(
                slot="slot_2", title=_create_smart_title(metric, dim),
                chart_type="hbar", data=data, confidence="MEDIUM",
                reason="Secondary analysis",
                dimension=dim, metric=metric,
                aggregation="mean" if _should_average_metric(metric) else "sum"
            ))
    
    # 3. Time trend
    if classification.dates and classification.metrics:
        date_col = classification.dates[0]
        metric = classification.metrics[0]
        data = _get_time_trend(
            df,
            date_col,
            metric,
            aggregation=_trend_aggregation_for_metric(metric),
        )
        if data:
            charts.append(ChartRecommendation(
                slot="slot_3", title=_create_smart_title(metric, date_col),
                chart_type="line", data=data, confidence="MEDIUM",
                reason="Time series analysis",
                dimension=date_col, metric=metric,
                aggregation="sum" if not _should_average_metric(metric) else "mean"
            ))
    
    # 4. Correlation
    if len(classification.metrics) >= 2:
        m1, m2 = classification.metrics[:2]
        data = _get_scatter_data(df, m1, m2)
        if data:
            charts.append(ChartRecommendation(
                slot="slot_4", title=_create_smart_title(m1, "") + " vs " + _beautify_column_name(m2),
                chart_type="scatter", data=data, confidence="MEDIUM",
                reason="Metric correlation",
                dimension=m1, metric=m2, aggregation="sum"
            ))
    
    # 5+. Distributions
    for dim in classification.dimensions:
        if len(charts) >= 12: break
        rec = _distribution_chart(
            df, dim, title=f"{_beautify_column_name(dim)} Distribution",
            confidence="MEDIUM", reason="Category distribution", value_label='Records'
        )
        if rec:
            rec.slot = f"slot_{len(charts) + 1}"
            charts.append(rec)
    
    return charts


# =============================================================================
# Main Entry Point
# =============================================================================


def _generate_marketing_charts(df: pd.DataFrame, classification: ColumnClassification) -> List[ChartRecommendation]:
    """Generate dynamic, schema-agnostic charts tailored for Marketing datasets."""
    charts: List[ChartRecommendation] = []

    def add_chart(rec: Optional[ChartRecommendation]) -> None:
        if rec:
            charts.append(rec)

    pm = [c for c in classification.metrics if c in df.columns]
    pd_ = [c for c in classification.dimensions if c in df.columns]
    dates = [c for c in classification.dates if c in df.columns]

    if not pm:
        charts.extend(_generate_generic_charts(df, classification))
        return charts

    def ncol(col: str) -> str:
        return col.lower().replace('_', '').replace('-', '')

    def is_id_like(col: str) -> bool:
        low = ncol(col)
        if low.endswith('id') or low in {'id', 'uuid', 'guid', 'key', 'index'}:
            return True
        return 'campaignid' in low or 'adid' in low

    def metric_role(col: str) -> str:
        low = ncol(col)
        if _should_average_metric(col) or any(k in low for k in ['ctr', 'cvr', 'rate', 'ratio', 'percent', 'pct']):
            return 'rate'
        if any(k in low for k in ['spend', 'cost', 'budget', 'revenue', 'income']):
            return 'currency'
        if any(k in low for k in ['impression', 'view', 'click', 'conversion', 'lead', 'signup', 'session', 'visit', 'reach']):
            return 'volume'
        return 'numeric'

    # Choose dimensions that are interpretable for grouped visuals.
    dim_candidates: List[str] = []
    for d in pd_:
        if is_id_like(d):
            continue
        try:
            nunique = int(df[d].nunique(dropna=True))
        except Exception:
            continue
        if 2 <= nunique <= 50:
            dim_candidates.append(d)

    preferred_dim_tokens = ['channel', 'source', 'medium', 'campaign', 'creative', 'audience', 'placement', 'region']
    dim_candidates.sort(key=lambda d: (0 if any(tok in ncol(d) for tok in preferred_dim_tokens) else 1, len(d)))
    primary_dim = dim_candidates[0] if dim_candidates else (pd_[0] if pd_ else None)

    rate_metrics = [m for m in pm if metric_role(m) == 'rate']
    currency_metrics = [m for m in pm if metric_role(m) == 'currency']
    volume_metrics = [m for m in pm if metric_role(m) == 'volume']
    numeric_metrics = [m for m in pm if metric_role(m) == 'numeric']

    # 1) Grouped performance charts by a strong marketing dimension.
    if primary_dim:
        for m in currency_metrics[:2]:
            data = _safe_groupby_sum(df, primary_dim, m)
            add_chart(ChartRecommendation(
                '', f'{_beautify_column_name(m)} by {_beautify_column_name(primary_dim)}', 'hbar', data,
                'HIGH', 'Budget/revenue allocation by segment', format_type='currency',
                dimension=primary_dim, metric=m, aggregation='sum'
            ))

        for m in rate_metrics[:2]:
            data = _safe_groupby_mean(df, primary_dim, m)
            add_chart(ChartRecommendation(
                '', f'{_beautify_column_name(m)} by {_beautify_column_name(primary_dim)} (%)', 'bar', data,
                'HIGH', 'Rate performance by segment', format_type='percentage',
                dimension=primary_dim, metric=m, aggregation='mean'
            ))

        for m in volume_metrics[:2]:
            data = _safe_groupby_sum(df, primary_dim, m)
            add_chart(ChartRecommendation(
                '', f'{_beautify_column_name(m)} by {_beautify_column_name(primary_dim)}', 'bar', data,
                'MEDIUM', 'Volume distribution by segment', format_type='number',
                dimension=primary_dim, metric=m, aggregation='sum'
            ))

    # 2) Funnel efficiency scatter using best available spend vs conversion-like pair.
    spend_metric = next((m for m in currency_metrics if any(k in ncol(m) for k in ['spend', 'cost', 'budget'])), None)
    conv_metric = next((m for m in pm if any(k in ncol(m) for k in ['conversion', 'lead', 'signup', 'cvr'])), None)
    if spend_metric and conv_metric:
        conv_role = metric_role(conv_metric)
        scatter_data = _get_scatter_data(df, spend_metric, conv_metric, label_col=primary_dim)
        add_chart(ChartRecommendation(
            '', f'{_beautify_column_name(spend_metric)} vs {_beautify_column_name(conv_metric)}', 'scatter', scatter_data,
            'HIGH', 'Acquisition efficiency and spend-performance balance',
            format_type='percentage' if conv_role == 'rate' else 'number',
            dimension=spend_metric, metric=conv_metric,
            aggregation='mean' if conv_role == 'rate' else 'sum'
        ))

    # 3) Trend charts for representative metrics.
    if dates:
        date_col = dates[0]
        trend_metrics = (volume_metrics[:1] + rate_metrics[:1] + currency_metrics[:1])
        if not trend_metrics:
            trend_metrics = pm[:2]

        for m in trend_metrics[:3]:
            role = metric_role(m)
            trend_data = _get_time_trend(df, date_col, m, aggregation=_trend_aggregation_for_metric(m))
            add_chart(ChartRecommendation(
                '', _create_smart_title(m, date_col), 'line', trend_data,
                'HIGH', 'Temporal performance monitoring',
                format_type='percentage' if role == 'rate' else 'currency' if role == 'currency' else 'number',
                dimension=date_col, metric=m,
                aggregation='mean' if role == 'rate' else 'sum'
            ))

    # 4) Category distribution fallback for key dimensions.
    for dim in dim_candidates[:3]:
        rec = _distribution_chart(
            df, dim,
            title=f'{_beautify_column_name(dim)} Distribution',
            confidence='MEDIUM',
            reason='Audience/channel mix coverage',
            value_label='Records'
        )
        add_chart(rec)

    charts.extend(_generate_generic_charts(df, classification))
    return charts


def _generate_finance_charts(df: pd.DataFrame, classification: ColumnClassification) -> List[ChartRecommendation]:
    """Generate charts tailored for the Finance domain."""
    charts = []
    def add_chart(rec):
        if rec: charts.append(rec)

    pm = classification.metrics
    pd_ = classification.dimensions
    dates = classification.dates

    income_col = next((c for c in pm if 'income' in c.lower() or 'revenue' in c.lower()), None)
    expense_col = next((c for c in pm if 'expense' in c.lower() or 'cost' in c.lower()), None)
    
    dept_col = next((c for c in pd_ if 'department' in c.lower() or 'dept' in c.lower()), None)
    cat_col = next((c for c in pd_ if 'categor' in c.lower() or 'type' in c.lower()), None)
    primary_dim = dept_col or cat_col or (pd_[0] if pd_ else None)

    if primary_dim and income_col:
        data = _safe_groupby_sum(df, primary_dim, income_col)
        add_chart(ChartRecommendation('', f'Income by {_beautify_column_name(primary_dim)}', 'bar', data, 'HIGH', 'Revenue sources', format_type='currency', dimension=primary_dim, metric=income_col, aggregation='sum'))

    if primary_dim and expense_col:
        data = _safe_groupby_sum(df, primary_dim, expense_col)
        add_chart(ChartRecommendation('', f'Expenses by {_beautify_column_name(primary_dim)}', 'donut', data, 'HIGH', 'Cost centers', format_type='currency', dimension=primary_dim, metric=expense_col, aggregation='sum'))

    if dates and income_col:
        data = _get_time_trend(
            df,
            dates[0],
            income_col,
            aggregation=_trend_aggregation_for_metric(income_col),
        )
        add_chart(ChartRecommendation('', 'Cash Flow Trend', 'line', data, 'HIGH', 'Historical cashflow', format_type='currency', dimension=dates[0], metric=income_col, aggregation='sum'))
        
    charts.extend(_generate_generic_charts(df, classification))
    return charts


def _generate_healthcare_charts(df: pd.DataFrame, classification: ColumnClassification) -> List[ChartRecommendation]:
    """Generate operational/clinical charts for the Healthcare domain.
    
    Priority order:
    1. Condition Distribution (Bar) — where to focus expertise
    2. Avg Age by Condition (Bar) — demographic risk factors
    3. Insurance Provider Breakdown (Donut) — payer mix / revenue source
    4. Billing by Condition (HBar) — highest cost conditions
    5. Admission Types (Pie) — intake method breakdown
    6. Billing Trend (Line) — revenue timeline
    7. Admissions Over Time (Line) — patient volume trend
    8. Gender (Pie) — demographics
    
    Explicitly EXCLUDED: Blood Type (clutter for general dashboards).
    """
    charts = []
    def add_chart(rec):
        if rec: charts.append(rec)

    pm = classification.metrics
    pd_ = classification.dimensions
    dates = classification.dates

    # Detect columns
    cost_col = next((c for c in pm if any(kw in c.lower() for kw in ['cost', 'charge', 'bill'])), None)
    age_col = next((c for c in pm if 'age' in c.lower()), None)
    los_col = next((c for c in pm if 'los' in c.lower() or 'stay' in c.lower()), None)
    
    condition_col = next((c for c in pd_ if any(kw in c.lower() for kw in ['condition', 'diagnos', 'disease'])), None)
    insurance_col = next((c for c in pd_ if 'insurance' in c.lower()), None)
    admission_type_col = next((c for c in pd_ if 'admission' in c.lower()), None)
    gender_col = next((c for c in pd_ if 'gender' in c.lower() or 'sex' in c.lower()), None)
    dept_col = next((c for c in pd_ if 'department' in c.lower() or 'ward' in c.lower()), None)
    hospital_col = next((c for c in pd_ if 'hospital' in c.lower() or 'facility' in c.lower() or 'clinic' in c.lower()), None)
    doctor_col = next((c for c in pd_ if any(kw in c.lower() for kw in ['doctor', 'physician', 'provider'])), None)
    medication_col = next((c for c in pd_ if 'medication' in c.lower() or 'drug' in c.lower() or 'medicine' in c.lower()), None)

    # ── 1. Condition Distribution (Bar) ──────────────────────────────────────
    if condition_col:
        add_chart(_distribution_chart(
            df, condition_col,
            'Top Medical Conditions', 'HIGH',
            'Identifies where expertise and equipment should be focused',
            'Patients', prefer_pie=False
        ))

    # ── 2. Avg Age by Condition (Bar) ────────────────────────────────────────
    if age_col and condition_col:
        data = _safe_groupby_mean(df, condition_col, age_col)
        if data:
            add_chart(ChartRecommendation(
                '', 'Avg Patient Age by Condition', 'bar', data, 'HIGH',
                'Correlates age groups with illnesses to predict patient surges',
                format_type='number', value_label='Years',
                dimension=condition_col, metric=age_col, aggregation='mean'
            ))

    # ── 3. Insurance Provider Breakdown (Donut) ──────────────────────────────
    if insurance_col:
        if cost_col:
            data = _safe_groupby_sum(df, insurance_col, cost_col)
            add_chart(ChartRecommendation(
                '', 'Revenue by Insurance Provider', 'donut', data, 'HIGH',
                'Payer mix — which insurers dominate your revenue stream',
                format_type='currency', value_label='Revenue',
                dimension=insurance_col, metric=cost_col, aggregation='sum'
            ))
        else:
            add_chart(_distribution_chart(
                df, insurance_col,
                'Insurance Provider Breakdown', 'HIGH',
                'Payer mix by patient count', 'Patients', prefer_pie=False
            ))

    # ── 4. Billing by Condition (HBar) ───────────────────────────────────────
    if condition_col and cost_col:
        data = _safe_groupby_sum(df, condition_col, cost_col)
        if data:
            add_chart(ChartRecommendation(
                '', 'Total Billing by Condition', 'hbar', data, 'HIGH',
                'Highest cost conditions driving facility expenses',
                format_type='currency', value_label='Billing Amount',
                dimension=condition_col, metric=cost_col, aggregation='sum'
            ))

    # ── 5. Admission Types (Pie) ─────────────────────────────────────────────
    if admission_type_col:
        add_chart(_distribution_chart(
            df, admission_type_col,
            'Admission Types', 'HIGH',
            'Emergency vs Elective vs Urgent intake breakdown',
            'Patients', prefer_pie=True
        ))

    # ── 6. Billing Trend Over Time (Line) ────────────────────────────────────
    if dates and cost_col:
        data = _get_time_trend(
            df,
            dates[0],
            cost_col,
            aggregation=_trend_aggregation_for_metric(cost_col),
        )
        if data:
            add_chart(ChartRecommendation(
                '', 'Hospital Billing Trend', 'line', data, 'HIGH',
                'Revenue timeline to track financial health',
                format_type='currency', value_label='Billing',
                dimension=dates[0], metric=cost_col, aggregation='sum'
            ))

    # ── 7. Patient Admissions Over Time (Line) ───────────────────────────────
    if dates:
        try:
            date_col = dates[0]
            df_temp = df.copy()
            df_temp[date_col] = _safe_to_datetime(df_temp[date_col])
            df_temp = df_temp.dropna(subset=[date_col])

            trend = df_temp.groupby(pd.Grouper(key=date_col, freq='MS')).size()
            data = [
                {
                    "timestamp": _to_trend_point_key(k)[0],
                    "date": _to_trend_point_key(k)[1],
                    "value": int(v),
                }
                for k, v in trend.items()
            ]
            if data:
                add_chart(ChartRecommendation(
                    '', 'Patient Admissions Over Time', 'area', data, 'HIGH',
                    'Patient volume trend over time',
                    format_type='number', value_label='Admissions',
                    dimension=date_col, metric=None, aggregation='count'
                ))
        except Exception:
            pass

    # ── 8. Gender Demographics (Pie) ─────────────────────────────────────────
    if gender_col:
        add_chart(_distribution_chart(
            df, gender_col,
            'Patient Demographics (Gender)', 'MEDIUM',
            'Gender distribution of patient population',
            'Patients', prefer_pie=True
        ))

    # ── 9. Avg LOS by Department/Condition (HBar) ───────────────────────────
    primary_dim = dept_col or condition_col
    if primary_dim and los_col:
        data = _safe_groupby_mean(df, primary_dim, los_col)
        if data:
            add_chart(ChartRecommendation(
                '', f'Avg Length of Stay by {_beautify_column_name(primary_dim)}', 'hbar',
                data, 'HIGH', 'Resource utilization efficiency',
                format_type='number', value_label='Days',
                dimension=primary_dim, metric=los_col, aggregation='mean'
            ))

    # ── 10. Billing by Admission Type (Bar) ──────────────────────────────────
    if admission_type_col and cost_col:
        data = _safe_groupby_sum(df, admission_type_col, cost_col)
        if data:
            add_chart(ChartRecommendation(
                '', 'Billing by Admission Type', 'bar', data, 'HIGH',
                'Cost comparison across intake methods',
                format_type='currency', value_label='Billing Amount',
                dimension=admission_type_col, metric=cost_col, aggregation='sum'
            ))
    # ── 11. Billing by Hospital (HBar) ─────────────────────────────────────────
    if hospital_col and cost_col:
        data = _safe_groupby_sum(df, hospital_col, cost_col)
        if data:
            add_chart(ChartRecommendation(
                '', f'Total Billing by {_beautify_column_name(hospital_col)}', 'hbar', data, 'HIGH',
                'Revenue distribution across facilities',
                format_type='currency', value_label='Billing Amount',
                dimension=hospital_col, metric=cost_col, aggregation='sum'
            ))

    # ── 12. Top Doctors by Patient Volume (Bar) ──────────────────────────────
    if doctor_col:
        add_chart(_distribution_chart(
            df, doctor_col,
            f'Top {_beautify_column_name(doctor_col)}s by Patient Volume', 'HIGH',
            'Workload distribution across physicians',
            'Patients', prefer_pie=False
        ))

    # ── 13. Medication Distribution (Bar/Donut) ──────────────────────────────
    if medication_col:
        add_chart(_distribution_chart(
            df, medication_col,
            f'Top Prescribed {_beautify_column_name(medication_col)}s', 'HIGH',
            'Most common prescriptions in the facility',
            'Prescriptions', prefer_pie=df[medication_col].nunique() <= 6
        ))

    # ── EXHAUSTIVE DIMENSION COVERAGE ──────────────────────────────────────────
    # For every recognized dimension that hasn't been used in a chart above,
    # generate a distribution chart + a metric cross-tab so no insight is missed.
    MAX_CHARTS = 20
    used_dims = {condition_col, insurance_col, admission_type_col, dept_col,
                 gender_col, hospital_col, doctor_col, medication_col}
    used_dims.discard(None)  # Remove None entries
    
    avail_dims = [d for d in pd_ if d not in used_dims]
    primary_metric = cost_col or (pm[0] if pm else None)  # Best available metric
    
    for dim in avail_dims:
        if len(charts) >= MAX_CHARTS:
            break
        nunique = df[dim].nunique()
        if nunique < 2 or nunique > 50:
            continue  # Skip useless (1 value) or too noisy (>50) dimensions
        
        # Distribution chart for this dimension
        add_chart(_distribution_chart(
            df, dim,
            f'{_beautify_column_name(dim)} Distribution', 'MEDIUM',
            f'Patient distribution by {_beautify_column_name(dim)}',
            'Count', prefer_pie=nunique <= 5
        ))
        
        # Metric cross-tab: pair with the best available metric
        if primary_metric and len(charts) < MAX_CHARTS:
            agg = 'mean' if _should_average_metric(primary_metric) else 'sum'
            data = _safe_groupby_mean(df, dim, primary_metric) if agg == 'mean' else _safe_groupby_sum(df, dim, primary_metric)
            if data:
                add_chart(ChartRecommendation(
                    '', f'{_beautify_column_name(primary_metric)} by {_beautify_column_name(dim)}',
                    'bar' if nunique < 8 else 'hbar', data, 'MEDIUM',
                    f'{_beautify_column_name(primary_metric)} breakdown across {_beautify_column_name(dim)}',
                    dimension=dim, metric=primary_metric, aggregation=agg
                ))

    # Assign slot numbers
    for i, chart in enumerate(charts):
        chart.slot = f"slot_{i + 1}"
    
    return charts


def _generate_templated_charts(df: pd.DataFrame, classification: ColumnClassification) -> List[ChartRecommendation]:
    """
    Phase 3: Universal Key Router.
    Generates high-value charts based on canonical key combinations.
    """
    charts = []
    maps = classification.mappings
    mods = classification.modifiers
    
    # --- 1. UNCERTAINTY VIEW (Metric + Bounds) ---
    for canonical_key, col in maps.items():
        if not canonical_key.startswith('metric_'):
            continue
            
        low_bound = None
        high_bound = None
        for c, m in mods.items():
            if 'low_bound' in m and _clean_header(c) in _clean_header(col):
                low_bound = c
            if 'high_bound' in m and _clean_header(c) in _clean_header(col):
                high_bound = c
        
        if low_bound and high_bound and maps.get('dim_date'):
            date_col = maps['dim_date']
            data = []
            try:
                df_temp = df.copy()
                df_temp[date_col] = _safe_to_datetime(df_temp[date_col])
                df_temp = df_temp.dropna(subset=[date_col, col, low_bound, high_bound])
                df_temp = df_temp.sort_values(date_col)
                grouped = df_temp.groupby(pd.Grouper(key=date_col, freq='D')).mean().tail(30)
                for k, v in grouped.iterrows():
                    data.append({
                        "date": str(k.date()),
                        "value": round(float(v[col]), 2),
                        "low": round(float(v[low_bound]), 2),
                        "high": round(float(v[high_bound]), 2)
                    })
            except: pass
            
            if data:
                charts.append(ChartRecommendation(
                    slot='', title=f"{_beautify_column_name(col)} with Prediction Intervals",
                    chart_type="area_bounds", data=data, confidence="HIGH",
                    reason="Phase 5: DA-Grade Uncertainty analysis",
                    format_type="percentage" if _should_average_metric(col) else None,
                    dimension=date_col, metric=col, aggregation="mean"
                ))

    # --- 2. TEMPORAL TREND ---
    date_col = maps.get('dim_date')
    if date_col:
        metrics = [v for k, v in maps.items() if k.startswith('metric_')][:2]
        for metric in metrics:
            if any(metric == c.metric and c.chart_type == "area_bounds" for c in charts): continue
            data = _get_time_trend(
                df,
                date_col,
                metric,
                aggregation=_trend_aggregation_for_metric(metric),
            )
            if data:
                charts.append(ChartRecommendation(
                    slot='', title=_create_smart_title(metric, date_col),
                    chart_type="line", data=data, confidence="HIGH",
                    reason="Phase 5: Time-series pattern recognition",
                    format_type="percentage" if _should_average_metric(metric) else None,
                    dimension=date_col, metric=metric, aggregation="sum" if not _should_average_metric(metric) else "mean"
                ))

    # --- 3. ENTITY PERFORMANCE (e.g., Average Revenue by Product) ---
    entity_col = maps.get('attr_product') or maps.get('attr_category') or maps.get('attr_diagnosis') or (classification.dimensions[0] if classification.dimensions else None)
    primary_metric = maps.get('metric_revenue') or maps.get('metric_spend') or (classification.metrics[0] if classification.metrics else None)
    if entity_col and primary_metric:
        agg = "mean" if _should_average_metric(primary_metric) else "sum"
        data = _smart_aggregate(df, entity_col, primary_metric, limit=10)
        if data:
            charts.append(ChartRecommendation(
                slot='', title=_create_smart_title(primary_metric, entity_col),
                chart_type="hbar", data=data, confidence="HIGH",
                reason="Phase 5: Top-performer segmentation",
                format_type="currency" if "revenue" in primary_metric.lower() or "profit" in primary_metric.lower() else None,
                dimension=entity_col, metric=primary_metric, aggregation=agg
            ))

    # --- 4. GEOGRAPHIC HEATMAP ---
    geo_col = maps.get('dim_region') or maps.get('dim_country')
    if geo_col and primary_metric:
        agg = "mean" if _should_average_metric(primary_metric) else "sum"
        data = _smart_aggregate(df, geo_col, primary_metric, limit=20)
        if data:
            map_type = _detect_map_type([str(d['name']) for d in data])
            if map_type:
                charts.append(ChartRecommendation(
                    slot='', title=_create_smart_title(primary_metric, geo_col) + " Map",
                    chart_type="geo_map", data=data, confidence="HIGH",
                    reason="Phase 5: Spatial distribution analysis",
                    geo_meta={"map_type": map_type, "column": geo_col},
                    format_type="currency" if "revenue" in primary_metric.lower() else None,
                    dimension=geo_col, metric=primary_metric, aggregation=agg
                ))

    return charts

def recommend_charts(df: pd.DataFrame, domain: DomainType, classification: ColumnClassification, overrides: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Recommend charts based on domain and data classification.
    
    Returns dict of charts for API response.
    """
    if overrides is None:
        overrides = {}
        
    # Apply manual domain override if provided
    if overrides and "selected_domain" in overrides:
        sd = overrides["selected_domain"]
        if sd and sd.lower() != 'auto':
            try:
                domain = DomainType(sd.lower())
                # If domain changed, we must re-classify
                classification = filter_columns(df, domain)
            except ValueError:
                logger.warning(f"Invalid domain override '{sd}', using detected: {domain}")
    elif domain is None:
        domain, _ = detect_domain(df)
        classification = classification or filter_columns(df, domain)
    elif classification is None:
        classification = filter_columns(df, domain)
    # PRE-FILTER & NORMALIZATION
    # Ensure numeric columns in string format are normalized
    # ========================================
    df = df.copy()
    for col in classification.metrics:
        if col in df.columns:
            df[col] = _coerce_numeric_metric_series(df[col])
    
    for col in classification.dates:
        if col in df.columns:
            df[col] = _safe_to_datetime(df[col])

    filtered_metrics = [m for m in classification.metrics if not _is_low_value_column(m)]
    filtered_dimensions = [d for d in classification.dimensions if not _is_low_value_column(d)]
    
    # Create filtered classification (preserve original for reference)
    from . import section_registry
    from .section_registry import assign_section
    filtered_classification = ColumnClassification(
        metrics=filtered_metrics or classification.metrics[:3],  # Fallback to first 3 if all filtered
        dimensions=filtered_dimensions or classification.dimensions[:3],
        targets=classification.targets,
        dates=classification.dates,
        excluded=classification.excluded,
        mappings=classification.mappings
    )
    
    generators = {
        DomainType.SALES: _generate_sales_charts,
        DomainType.CHURN: _generate_churn_charts,
        DomainType.MARKETING: _generate_marketing_charts,
        DomainType.FINANCE: _generate_finance_charts,
        DomainType.HEALTHCARE: _generate_healthcare_charts,
        DomainType.GENERIC: _generate_generic_charts,
    }
    
    generator = generators.get(domain, _generate_generic_charts)
    charts = generator(df, filtered_classification)
    
    # ========================================
    # PHASE 3: Analytical Templates (Deterministic)
    # These override generic heuristics with high-value business patterns
    # ========================================
    template_charts = _generate_templated_charts(df, classification)
    geo_charts = _generate_geo_charts(df, classification)
    
    # ── Orchestrate Chart Priority ──
    # Priority: 1. Geo (if hero) 2. Templates 3. Domain-Specific 4. Generic
    charts = template_charts + charts
    
    if geo_charts:
        charts = geo_charts + charts
    
    # ========================================
    # POST-FILTER: Deduplicate similar charts
    # Prevents repetitive charts with same dimension
    # ========================================
    charts = _deduplicate_charts(charts)

    # Assign sections based on registry
    for chart in charts:
        assignment = assign_section(
            chart_type=chart.chart_type,
            metric=chart.metric,
            dimension=chart.dimension,
            domain=domain.value,
            title=chart.title,
        )
        chart.section = assignment.section

    # ========================================
    # PHASE 4: Competitive Scoring (The "Expert" Choice)
    # Ranks charts by identifying which dimension creates the highest
    # mathematical spread (variance) in the target metric.
    # ========================================
    import statistics
    for chart in charts:
        try:
            # Keep complex visualizations and manually pinned charts pinned highly
            if getattr(chart, 'variance_score', 0) == float('inf') or chart.chart_type in ('scatter', 'area_bounds', 'line', 'map', 'geo_map'):
                chart.variance_score = float('inf')
                continue
            elif chart.data and isinstance(chart.data, list):
                # Calculate the standard deviation (spread) of the grouped values
                values = [float(d.get('value', 0)) for d in chart.data if 'value' in d and d.get('value') is not None]
                if len(values) > 1:
                    chart.variance_score = statistics.stdev(values)
                else:
                    chart.variance_score = 0
            else:
                chart.variance_score = 0
        except Exception:
            chart.variance_score = 0
            
    # Sort descending by variance to surface highest-impact insights
    charts.sort(key=lambda x: getattr(x, 'variance_score', 0), reverse=True)
    
    # Allow up to 25 charts — churn domain produces 15 analytically distinct charts
    charts = charts[:25]
    
    # Convert to dict format for API
    result = {}
    for i, chart in enumerate(charts):
        # Reassign slots after deduplication
        slot = f"slot_{i + 1}"
        
        # Apply Overrides
        slot_override = overrides.get(slot, {})
        if slot_override:
            # 1. Type Override
            if "type" in slot_override:
                chart.chart_type = slot_override["type"]
            
            # 2. Aggregation Override
            if "aggregation" in slot_override and chart.dimension and chart.metric:
                new_agg = slot_override["aggregation"]
                if new_agg != chart.aggregation:
                    if new_agg == "sum":
                        chart.data = _safe_groupby_sum(df, chart.dimension, chart.metric)
                        chart.aggregation = "sum"
                    elif new_agg == "mean":
                        chart.data = _safe_groupby_mean(df, chart.dimension, chart.metric)
                        chart.aggregation = "mean"
                    
                    # Refresh outlier detection for new aggregation
                    if isinstance(chart.data, AggregationData):
                        chart.outliers = chart.data.outliers
                        chart.data_without_outliers = chart.data.data_without_outliers

        # Smart unit detection
        format_type = getattr(chart, "format_type", None)
        title_lower = chart.title.lower()
        if not format_type:
            percentage_keywords = ["rate", "margin", "percent", "%", "ratio", "proportion"]
            if any(kw in title_lower for kw in percentage_keywords):
                format_type = "percentage"
            elif any(kw in title_lower for kw in ['tenure', 'age', 'duration', 'months', 'years', 'days']):
                format_type = "number"
                if not getattr(chart, "value_label", None):
                    chart.value_label = _infer_time_value_label(title_lower, getattr(chart, "metric", None), getattr(chart, "dimension", None))
        
        result[slot] = {
            "title": chart.title,
            "type": chart.chart_type,
            "data": chart.data,
            "confidence": chart.confidence,
            "reason": chart.reason,
            "is_percentage": format_type == "percentage",
            "section": getattr(chart, "section", "Other Insights"),
        }
        if chart.dimension:
            result[slot]["dimension"] = chart.dimension
        if chart.metric:
            result[slot]["metric"] = chart.metric
        if chart.categories:
            result[slot]["categories"] = chart.categories
        if chart.geo_meta:
            result[slot]["geo_meta"] = chart.geo_meta
        if format_type:
            result[slot]["format_type"] = format_type
            if format_type == "percentage":
                result[slot]["data"] = _normalize_percentage_chart_values(result[slot].get("data"))
                if "data_without_outliers" in result[slot]:
                    result[slot]["data_without_outliers"] = _normalize_percentage_chart_values(result[slot].get("data_without_outliers"))
        if getattr(chart, "value_label", None):
            result[slot]["value_label"] = chart.value_label
        if getattr(chart, "outliers", None):
            result[slot]["outliers"] = chart.outliers
            result[slot]["data_without_outliers"] = chart.data_without_outliers
        if chart.aggregation:
            result[slot]["aggregation"] = chart.aggregation
        if chart.granularity:
            result[slot]["granularity"] = chart.granularity
    
    return result

