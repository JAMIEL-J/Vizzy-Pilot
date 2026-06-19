"""
Smart Title System - Map column names to professional business terms.
"""

import re
from typing import Optional, Tuple

import pandas as pd

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
    
    # HR
    'employee_number': 'Employee Number',
    'employee_id': 'Employee',
    'headcount': 'Headcount',
    'attrition': 'Attrition',
    'turnover': 'Turnover',
    'business_travel': 'Business Travel',
    'job_role': 'Job Role',
    'job_level': 'Job Level',
    'department': 'Department',
    'overtime': 'Overtime',
    'performance_rating': 'Performance Rating',
    'years_at_company': 'Years At Company',
    'yearsatcompany': 'Years At Company',
    
    # Logistics
    'carrier': 'Carrier',
    'route': 'Route',
    'origin': 'Origin',
    'destination': 'Destination',
    'warehouse': 'Warehouse',
    'delivery_time': 'Delivery Time',
    'transit_time': 'Transit Time',
    'shipping_cost': 'Shipping Cost',
    'freight_cost': 'Freight Cost',
    
    # Education
    'student_id': 'Student',
    'program': 'Program',
    'course': 'Course',
    'gpa': 'GPA',
    'attendance': 'Attendance',
    'graduation_status': 'Graduation Status',
    
    # Ecommerce
    'cart': 'Cart',
    'checkout': 'Checkout',
    'sessions': 'Sessions',
    'conversion_rate': 'Conversion Rate',
    'device': 'Device',
    'channel': 'Channel',
    
    # Real Estate
    'listing_price': 'Listing Price',
    'property_type': 'Property Type',
    'days_on_market': 'Days on Market',
    'dom': 'Days on Market',
    'sqft': 'Square Feet',
    
    # Customer Support
    'ticket': 'Ticket',
    'ticket_id': 'Ticket',
    'csat': 'CSAT',
    'sla': 'SLA',
    'resolution_time': 'Resolution Time',
    'response_time': 'Response Time',
    
    # IT Operations
    'uptime': 'Uptime',
    'downtime': 'Downtime',
    'cpu': 'CPU Utilization',
    'memory': 'Memory Usage',
    'latency': 'Latency',
    'incident': 'Incident',
    
    # Cybersecurity
    'alert': 'Alert',
    'threat': 'Threat',
    'vulnerability': 'Vulnerability',
    'severity': 'Severity',
    'risk_score': 'Risk Score',
    'mttr': 'Mean Time To Remediate',
    
    # Generic
    'type': 'Type',
    'status': 'Status',
    'gender': 'Gender',
    'contract': 'Contract Type',
    'payment_method': 'Payment Method',
    'paymentmethod': 'Payment Method',
}

def _humanize_column_name(name: str) -> str:
    """Convert column name to professional business term."""
    spaced = re.sub(r'(?<=[a-z0-9])(?=[A-Z])', ' ', str(name))
    spaced = spaced.replace('_', ' ').replace('-', ' ')
    normalized = re.sub(r'\s+', ' ', spaced).strip()
    return normalized.title()

def _beautify_column_name(col: str) -> str:
    """Convert column name to professional business term."""
    col_lower = col.lower().replace('-', '_')
    
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
    for pattern, term in COLUMN_TO_BUSINESS_TERM.items():
        if len(pattern) <= 6:
            continue
        if pattern in col_lower:
            return term
    
    # Default: preserve original column semantics with readable formatting.
    return _humanize_column_name(col)

def _clean_title(title: str) -> str:
    """Clean chart title to avoid duplicate aggregation prefixes (e.g. 'Total Total Charges')."""
    if not title:
        return title
    t = title.strip()
    # Replace starting "Total Total " (case-insensitive) with "Total "
    t = re.sub(r'^(Total)\s+(Total\s+)', r'\2', t, flags=re.IGNORECASE)
    # Replace starting "Total Totalcharges" with "Total Charges"
    t = re.sub(r'^(Total)\s+(Totalcharges)', 'Total Charges', t, flags=re.IGNORECASE)
    # Replace starting "Avg Average " or "Average Average " with "Average "
    t = re.sub(r'^(Avg|Average)\s+(Average\s+)', r'\2', t, flags=re.IGNORECASE)
    # Replace starting "Avg Avg " with "Avg "
    t = re.sub(r'^(Avg)\s+(Avg\s+)', r'\2', t, flags=re.IGNORECASE)
    return t

def _create_smart_title(metric_col: Optional[str], dimension_col: str, chart_purpose: str = "") -> str:
    """Create a professional chart title with business context."""
    dim_name = _beautify_column_name(dimension_col)
    
    if metric_col:
        metric_name = _beautify_column_name(metric_col)
        
        # Determine if dimension is time-based
        is_time = any(kw in dim_name.lower() for kw in ['date', 'time', 'year', 'month', 'day', 'trend', 'quarter'])
        
        if is_time:
            res = f"{metric_name} Trend Over Time"
        else:
            # This logic depends on _should_average_metric which is in prioritization.py
            # We'll handle the aggregation prefix in the caller or import it.
            # For now, we'll keep it simple and let the caller handle the "Average" prefix.
            res = f"{metric_name} by {dim_name}"
    else:
        # Distribution chart
        res = f"{dim_name} Distribution"
        
    return _clean_title(res)


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


def _pick_column_by_keywords(
    df,
    columns,
    keywords,
    exclude=None,
    min_unique=None,
):
    """Pick the best matching column from a list using semantic or substring matching."""
    if not columns:
        return None

    exclude = exclude or []
    exclude_norm = [e.lower().replace('_', '').replace('-', '').replace(' ', '') for e in exclude]

    def _col_norm(col: str) -> str:
        return col.lower().replace('_', '').replace('-', '').replace(' ', '')

    try:
        from .semantic_resolver import semantic_similarity

        best_score = 0.0
        best_col = None
        for col in columns:
            col_norm = _col_norm(col)
            if any(ex in col_norm for ex in exclude_norm):
                continue
            if min_unique and col in df.columns and df[col].nunique() < min_unique:
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

    for col in columns:
        col_norm = _col_norm(col)
        if any(ex in col_norm for ex in exclude_norm):
            continue
        if min_unique and col in df.columns and df[col].nunique() < min_unique:
            continue
        if any(kw in col_norm for kw in keywords):
            return col

    return None


def _format_categorical_value(col: str, value) -> str:
    """Standardize categorical values (0/1 -> No/Yes, specific target maps)."""
    val_str = str(value).lower().strip().replace('.0', '')
    col_name = col.lower().replace('_', '').replace('-', '')
    
    is_pos = val_str in {'1', 'yes', 'true', 'positive', 'churned', 'exited', 'attrition'}
    is_neg = val_str in {'0', 'no', 'false', 'negative', 'retained', 'stayed', 'active'}
    
    if is_pos or is_neg:
        if 'churn' in col_name:
            return 'Churned' if is_pos else 'Retained'
        if 'exit' in col_name:
            return 'Exited' if is_pos else 'Stayed'
        if 'attrition' in col_name:
            return 'Left' if is_pos else 'Stayed'
        if 'default' in col_name:
            return 'Defaulted' if is_pos else 'Performing'
        return 'Yes' if is_pos else 'No'
        
    return str(value)


def _get_binary_target_labels(target_col: str) -> Tuple[str, str]:
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
