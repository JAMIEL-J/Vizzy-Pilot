"""
BI Dashboard Prioritization - Rank metrics and dimensions by business importance.
"""

from typing import List, Optional

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

    prioritized.extend(remaining)
    return prioritized

def _pick_at_risk_metric(financial_metrics: List[str]) -> Optional[str]:
    """
    Select the best metric for churn "at risk" calculations.
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


def _metric_format_type(metric):
    """Determine the format type for a metric column."""
    if not metric:
        return None
    low = metric.lower().replace('_', '').replace('-', '').replace(' ', '')

    # Currency check FIRST — catches DailyRate, HourlyRate, MonthlyRate, MonthlyIncome etc.
    if any(tok in low for tok in [
        'revenue', 'sales', 'profit', 'cost', 'price', 'amount',
        'salary', 'pay', 'spend', 'budget', 'rent', 'charge',
        'income', 'wage', 'compensation', 'payroll',
        'dailyrate', 'hourlyrate', 'monthlyrate', 'monthlyincome',
        'annualincome', 'annualsalary', 'hourlypay', 'dailypay',
    ]):
        return 'currency'

    # Percent/rate check — only for statistical rates (attrition rate, churn rate, etc.)
    if any(tok in low for tok in [
        'ratio', 'percent', 'pct', 'conversion', 'attrition', 'turnover',
        'uptime', 'availability', 'sla', 'csat', 'percentsalaryhike', 'salaryhike',
    ]):
        return 'percentage'

    # "rate" alone — only if not already caught by currency above
    if 'rate' in low:
        return 'percentage'

    return None


def _get_metric_prefix(metric_col: str) -> str:
    """Get the business metric type for a column."""
    metric_lower = metric_col.lower().replace('_', '')

    for keyword, prefix in METRIC_TYPE_PREFIX.items():
        if keyword in metric_lower:
            return prefix

    return "Value"


def _infer_time_value_label(*candidates) -> str:
    """Infer a human-readable time label for chart values."""
    combined = ' '.join(str(c or '').lower() for c in candidates)
    if 'age' in combined:
        return 'Age'
    if 'tenure' in combined or 'month' in combined:
        return 'Months'
    if 'year' in combined:
        return 'Years'
    return 'Days'


def _trend_aggregation_for_metric(metric) -> str:
    """Return explicit trend aggregation for a metric."""
    return 'mean' if _should_average_metric(metric or '') else 'sum'
