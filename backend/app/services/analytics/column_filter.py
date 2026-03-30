"""
Column Filter - Classifies and prioritizes columns for analytics.

Filters out noise (IDs, binary flags) and prioritizes business-relevant columns.
"""

from dataclasses import dataclass, field
from typing import List, Dict, Optional
import pandas as pd
from .domain_detector import DomainType


@dataclass
class ColumnClassification:
    """Classification result for dataset columns."""
    metrics: List[str] = field(default_factory=list)      # Numeric columns for KPIs
    dimensions: List[str] = field(default_factory=list)   # Categorical for grouping
    targets: List[str] = field(default_factory=list)      # Binary outcome columns
    dates: List[str] = field(default_factory=list)        # Date/time columns
    excluded: List[str] = field(default_factory=list)     # IDs, noise, etc.
    currency_columns: List[str] = field(default_factory=list) # Financial metrics
    mappings: Dict[str, str] = field(default_factory=dict)    # Standardized Canonical Keys (e.g., 'metric_revenue')
    modifiers: Dict[str, List[str]] = field(default_factory=dict) # Modifiers (rate, low_bound, etc.)


# Columns to always exclude
EXCLUDE_PATTERNS = [
    'id', 'uuid', 'guid', 'key', 'index', 'row', 'unnamed'
]

# Numeric columns that should NOT be treated as meaningful metrics
NOISE_METRIC_PATTERNS = [
    'room', 'bed', 'floor', 'ward_number', 'room_number', 'bed_number',
    'zipcode', 'zip_code', 'postal_code', 'phone_number', 'ssn'
]

# Binary flags to exclude from KPIs (use only for segmentation)
BINARY_FLAG_PATTERNS = [
    'senior', 'citizen', 'partner', 'dependent', 'flag', 'indicator',
    'is_', 'has_', 'was_'
]

from typing import Dict
from enum import Enum
from typing import List


# Standardized Canonical Schemas (Derived from ARCH.md)
DOMAIN_SCHEMAS: Dict[DomainType, Dict[str, List[str]]] = {
    DomainType.HEALTHCARE: {
        "metric_mortality": ["mortality", "deaths", "fatalities"],
        "metric_incidence": ["incidence", "new cases"],
        "metric_prevalence": ["prevalence"],
        "metric_population": ["population", "people", "demographic"],
        "metric_los": ["los", "length of stay", "duration"],
        "attr_diagnosis": ["diagnosis", "disease", "condition", "icd", "drg"],
        "attr_procedure": ["procedure", "treatment", "intervention"],
    },
    DomainType.SALES: {
        "metric_revenue": ["revenue", "sales", "gmv", "amount", "total"],
        "metric_profit": ["profit", "margin", "net", "earnings"],
        "metric_qty": ["quantity", "qty", "units", "count", "volume"],
        "metric_discount": ["discount", "rebate", "coupon", "reduction"],
        "attr_product": ["product", "item", "sku", "service"],
        "attr_category": ["category", "subcategory", "department", "type"],
        "attr_customer": ["customer", "client", "buyer", "account"],
        "attr_order": ["order", "invoice", "transaction", "ref"],
    },
    DomainType.CHURN: {
        "metric_tenure": ["tenure", "age", "months", "duration", "vintage"],
        "metric_mrr": ["mrr", "charges", "monthly", "billing"],
        "attr_contract": ["contract", "subscription", "plan", "tier"],
        "attr_status": ["churn", "status", "active", "cancel", "left"],
        "attr_payment": ["payment", "method", "card", "bank"],
    },
    DomainType.MARKETING: {
        "metric_spend": ["spend", "cost", "budget", "investment"],
        "metric_clicks": ["clicks", "taps"],
        "metric_impressions": ["impressions", "views"],
        "metric_conversions": ["conversions", "leads", "signups"],
        "attr_campaign": ["campaign", "promotion", "initiative"],
        "attr_channel": ["channel", "source", "medium", "network"],
    },
    DomainType.FINANCE: {
        "metric_income": ["income", "revenue", "earnings"],
        "metric_expense": ["expense", "costs", "spending"],
        "metric_balance": ["balance", "equity", "holding"],
    },
    DomainType.GENERIC: {
        "metric_value": ["value", "amount", "total", "count", "sum", "quantity"],
        "attr_type": ["category", "type", "group", "status", "name"]
    }
}

UNIVERSAL_SCHEMA: Dict[str, List[str]] = {
    "dim_date": ["date", "time", "year", "month", "quarter", "period", "timestamp"],
    "dim_country": ["country", "nation"],
    "dim_region": ["region", "state", "province", "territory", "city", "zone"],
}

# Keep for backward compatibility with priority sorting logic
DOMAIN_PRIORITY_COLUMNS = {
    d: {
        "metrics": [kw for k, kws in v.items() if k.startswith('metric') for kw in kws],
        "dimensions": [kw for k, kws in v.items() if k.startswith('attr') for kw in kws]
    } for d, v in DOMAIN_SCHEMAS.items()
}

# Phase IV: Stop-Word Stripping
STOP_WORDS = {
    'the', 'of', 'number', 'estimated', 'during', 'in', 'a', 'cases', 'values',
    'total', 'for', 'by', 'at', 'on', 'with'
}

def _clean_header(col: str) -> str:
    """Strip noise words from column header before scoring."""
    col_lower = col.lower().replace('_', ' ').replace('-', ' ')
    # Remove units in parentheses or brackets (e.g. "Revenue (USD)")
    import re
    col_lower = re.sub(r'[\(\[].*?[\)\]]', '', col_lower)
    
    words = col_lower.split()
    cleaned_words = [w for w in words if w not in STOP_WORDS]
    return " ".join(cleaned_words)


# Phase II-C: Attribute Modifiers
MODIFIER_PATTERNS = {
    'low_bound': [r'low', r'min', r'lower', r'2\.5', r'bottom', r'minimum'],
    'high_bound': [r'high', r'max', r'upper', r'97\.5', r'top', r'maximum'],
    'rate': [r'rate', r'ratio', r'percent', r'pct', r'per\s*100k', r'frequency'],
    'average': [r'avg', r'average', r'mean']
}

def _detect_modifiers(col: str) -> List[str]:
    """Detect architectural modifiers in column names."""
    import re
    col_lower = col.lower().replace('_', ' ').replace('-', ' ')
    detected = []
    
    for mod, patterns in MODIFIER_PATTERNS.items():
        if any(re.search(p, col_lower) for p in patterns):
            detected.append(mod)
            
    return detected


# Columns to always exclude
EXACT_EXCLUDE_WORDS = {
    'id', 'uuid', 'guid', 'key', 'index', 'row', 'unnamed', 'zip', 'postal', 'code', 'phone'
}

# Keep for backward compatibility with priority sorting logic

def _is_identifier_column(df: pd.DataFrame, col: str) -> bool:
    """Check if column is likely an ID/key column."""
    col_lower = col.lower()
    
    # Phase 3: Statistical Fingerprinting
    if len(df) == 0: return False
    
    unique_count = df[col].nunique()
    cardinality = unique_count / len(df)
    
    # 1. C > 0.9 and String -> ID (Ignore)
    if cardinality > 0.9 and df[col].dtype not in ['int64', 'float64', 'int32', 'float32']:
        return True
    
    # Check name patterns for fallback noise elimination (the "dirty data" safeguard)
    words = col_lower.replace('_', ' ').replace('-', ' ').split()
    has_exclude_word = any(w in EXACT_EXCLUDE_WORDS for w in words)
    is_id_suffix = col_lower.endswith('_id') or col_lower.endswith('id')
    
    if (has_exclude_word or is_id_suffix or 'unnamed' in col_lower) and cardinality > 0.5:
        return True
            
    # Check if numeric with extreme high uniqueness (likely ID)
    if df[col].dtype in ['int64', 'float64']:
        if cardinality > 0.95 and ('id' in words or is_id_suffix):
            return True
    
    return False


def _is_binary_flag(df: pd.DataFrame, col: str) -> bool:
    """Check if column is a binary flag (0/1 or Yes/No) to exclude from KPIs."""
    col_lower = col.lower()
    
    # Check name patterns
    if any(pattern in col_lower for pattern in BINARY_FLAG_PATTERNS):
        return True
    
    # Check if numeric with only 0/1 values
    if df[col].dtype in ['int64', 'float64']:
        unique_vals = set(df[col].dropna().unique())
        if unique_vals.issubset({0, 1, 0.0, 1.0}):
            # Exception: don't exclude target-like columns
            target_keywords = ['churn', 'target', 'outcome', 'converted', 'default']
            if not any(kw in col_lower for kw in target_keywords):
                return True
    
    return False


def _is_date_column(df: pd.DataFrame, col: str) -> bool:
    """Check if column is a date/time column."""
    if df[col].dtype in ['datetime64[ns]', 'datetime64']:
        return True
    
    col_lower = col.lower().replace('_', '').replace(' ', '')
    
    # Exclude money, charge, and duration columns from being falsely flagged as dates
    exclude_keywords = ['charge', 'cost', 'price', 'amount', 'fee', 'balance', 'salary', 'income', 'revenue', 'tenure', 'duration', 'age', 'mrr']
    if any(kw in col_lower for kw in exclude_keywords):
        return False
        
    temporal_keywords = ['date', 'time', 'datetime', 'timestamp', 'created', 'updated', 'shipped', 'opened', 'closed', 'year', 'month', 'quarter', 'period', 'discharge', 'admitted']
    if any(kw in col_lower for kw in temporal_keywords):
        import pandas as pd
        try:
            # For strings, try parsing
            sample = df[col].dropna().astype(str).head(100)
            if sample.empty: return False
            parsed = pd.to_datetime(sample, errors='coerce')
            
            # If parsing failed or is very sparse, try with dayfirst=True
            if parsed.notna().mean() < 0.4:
                parsed_df = pd.to_datetime(sample, errors='coerce', dayfirst=True)
                if parsed_df.notna().mean() > parsed.notna().mean():
                    parsed = parsed_df

            # Require at least 40% valid parsed dates if it's explicitly named 'date', 'time', etc.
            if parsed.notna().mean() > 0.4:
                return True
        except:
            pass
            
        # Special case for integer-based temporal columns or string periods (e.g. "Q1", "Jan")
        if any(kw in col_lower for kw in ['year', 'month', 'quarter', 'period']):
            # Verify it's not just a random high-cardinality number
            if df[col].nunique() < 20 or (df[col].dtype in ['int64', 'int32'] and df[col].max() < 2100 and df[col].min() > 1900):
                return True
            
    return False


def _is_target_column(df: pd.DataFrame, col: str) -> bool:
    """Check if column is a target/outcome column."""
    col_lower = col.lower().replace('_', '').replace('-', '')
    target_keywords = ['churn', 'target', 'outcome', 'status', 'default', 'converted', 'label', 'class', 'exited', 'attrition', 'left', 'complain']
    
    if any(kw in col_lower for kw in target_keywords):
        if df[col].nunique() <= 5:  # Limited categories
            return True
    
    return False


def _get_column_priority(df: pd.DataFrame, col: str, domain: DomainType) -> int:
    """
    Get priority score using the High-Level Engine Formula:
    Score = (Primary * 5) + (Secondary * 3) + (TypeMatch * 2)
    """
    domain_schema = DOMAIN_SCHEMAS.get(domain, DOMAIN_SCHEMAS.get(DomainType.GENERIC, {}))
    cleaned_col = _clean_header(col)
    is_numeric = df[col].dtype in ['int64', 'float64', 'int32', 'float32']
    
    best_total_score = 0
    
    try:
        from .semantic_resolver import semantic_similarity
        
        for canonical_key, keywords in domain_schema.items():
            primary_score = 0
            secondary_score = 0
            
            # Simplified for priority scoring: treats the first keyword as "Primary"
            # In a full multi-keyword map, this would be more granular.
            primary_kw = keywords[0] if keywords else ""
            secondary_kws = keywords[1:] if len(keywords) > 1 else []
            
            # Primary Keyword (Weight 5)
            p_sim = semantic_similarity(primary_kw, cleaned_col) if primary_kw else 0
            if p_sim >= 0.65:
                primary_score = 5
            
            # Secondary Keywords (Weight 3)
            for skw in secondary_kws:
                s_sim = semantic_similarity(skw, cleaned_col)
                if s_sim >= 0.65:
                    secondary_score = 3
                    break
            
            # TypeMatch (Weight 2)
            is_metric_key = canonical_key.startswith('metric')
            type_match = 2 if (is_metric_key and is_numeric) or (not is_metric_key and not is_numeric) else 0
            
            # Total Score
            total_score = primary_score + secondary_score + type_match
            if total_score > best_total_score:
                best_total_score = total_score
                
        return best_total_score
        
    except ImportError:
        # Simple fallback
        for canonical_key, keywords in domain_schema.items():
            score = 0
            if any(kw in cleaned_col for kw in [keywords[0]]): score += 5
            if any(kw in cleaned_col for kw in keywords[1:]): score += 3
            if canonical_key.startswith('metric') == is_numeric: score += 2
            if score > best_total_score:
                best_total_score = score
        return best_total_score


def filter_columns(df: pd.DataFrame, domain: DomainType) -> ColumnClassification:
    """
    Classify and filter columns based on domain and column characteristics.
    
    Returns prioritized lists of metrics, dimensions, targets, dates, and excluded columns.
    """
    classification = ColumnClassification()
    
    # Attempt to convert object columns that look like numbers (e.g., TotalCharges with empty strings)
    df_typed = df.copy()
    
    # Phase 1: The Expert Sanitizer
    for col in df_typed.select_dtypes(include=['object']).columns:
        try:
            # Clean dirty strings (spaces, currencies, percentages)
            clean_str = df_typed[col].astype(str).str.replace(r'[$,% ]', '', regex=True)
            converted = pd.to_numeric(clean_str, errors='coerce')
            
            # Statistical fingerprint: if >80% are valid numbers, force it as a measure
            if len(df_typed) > 0 and (converted.notna().sum() / len(df_typed)) > 0.8:
                df_typed[col] = converted.fillna(0)
            else:
                # Standard fallback for standard sparsity
                valid_ratio = converted.notna().sum() / df_typed[col].notna().sum() if df_typed[col].notna().sum() > 0 else 0
                if valid_ratio > 0.5:
                    df_typed[col] = converted
        except Exception:
            pass
    
    # ── PRE-COMPUTE: Domain-Protected Columns ──────────────────────────────
    # Build a set of keywords from the domain schema's attr_* entries.
    # Columns matching these are PROTECTED from the identifier exclusion check
    # so that domain-critical dimensions (Hospital, Doctor, Diagnosis) survive.
    domain_schema = DOMAIN_SCHEMAS.get(domain, {})
    _domain_attr_kws = []
    for key, kws in domain_schema.items():
        if key.startswith('attr_'):
            _domain_attr_kws.extend(kws)
    # Also add universal healthcare keywords that should never be excluded
    if domain == DomainType.HEALTHCARE:
        _domain_attr_kws.extend(['hospital', 'doctor', 'physician', 'clinic', 'facility', 'provider', 'ward', 'department'])
    
    def _is_domain_protected(col_name: str) -> bool:
        """Check if column matches any domain-critical attribute keyword."""
        col_norm = col_name.lower().replace('_', '').replace('-', '').replace(' ', '')
        return any(kw.replace('_', '').replace(' ', '') in col_norm for kw in _domain_attr_kws)
    
    for col in df_typed.columns:
        # Check exclusions first — but SKIP for domain-protected columns
        if _is_identifier_column(df_typed, col) and not _is_domain_protected(col):
            classification.excluded.append(col)
            continue
        
        # Check dates
        if _is_date_column(df_typed, col):
            classification.dates.append(col)
            continue
        
        # Check targets
        if _is_target_column(df_typed, col):
            classification.targets.append(col)
            continue
        
        # Classify remaining columns
        if df_typed[col].dtype in ['int64', 'float64', 'int32', 'float32']:
            # Numeric column
            col_norm = col.lower().replace('_', '').replace('-', '').replace(' ', '')
            is_noise_metric = any(p.replace('_', '') in col_norm for p in NOISE_METRIC_PATTERNS)
            if _is_binary_flag(df_typed, col):
                classification.excluded.append(col)  # Exclude binary flags from metrics
            elif is_noise_metric:
                classification.excluded.append(col)  # Room/Bed numbers are not meaningful metrics
            else:
                classification.metrics.append(col)
        else:
            # Categorical column
            unique_count = df_typed[col].nunique()
            col_lower = col.lower().replace('_', '').replace('-', '')
            
            # Special handling: Use semantic matching for product/geo/customer detection
            # This handles fuzzy names like "Prod_Nm", "CustCity", "RegionCode"
            try:
                from .semantic_resolver import semantic_similarity

                def _semantic_match(keywords, col_name, threshold=0.55):
                    return any(semantic_similarity(kw, col_name) >= threshold for kw in keywords)
            except ImportError:
                def _semantic_match(keywords, col_name, threshold=0.55):
                    col_norm = col_name.lower().replace('_', '').replace('-', '')
                    return any(kw in col_norm for kw in keywords)

            product_keywords = ['product', 'productname', 'item', 'sku', 'category', 'subcategory', 'segment', 'brand', 'type']
            is_important_dim = _semantic_match(product_keywords, col)

            geo_keywords = ['country', 'state', 'city', 'region', 'province', 'territory', 'district', 'location', 'market', 'zone']
            is_geo_col = _semantic_match(geo_keywords, col, threshold=0.8)

            customer_keywords = ['customername', 'customer_name', 'firstname', 'lastname', 'clientname']
            is_customer_name = _semantic_match(customer_keywords, col)
            
            # Dynamically derive domain-critical dimensions from the schema
            domain_schema = DOMAIN_SCHEMAS.get(domain, {})
            domain_kws = []
            for key, kws in domain_schema.items():
                if key.startswith('attr_'):
                    domain_kws.extend(kws)
            is_domain_dim = _semantic_match(domain_kws, col) if domain_kws else False
            
            unique_count = df_typed[col].nunique()
            cardinality = unique_count / len(df_typed) if len(df_typed) > 0 else 0

            if (is_important_dim and domain == DomainType.SALES) or is_domain_dim:
                # Force include important business dimensions for the detected domain
                classification.dimensions.append(col)
            elif is_geo_col:
                # Force include geo columns for ALL domains — needed for geo map charts
                classification.dimensions.append(col)
            elif is_customer_name and unique_count > 100:
                # Only exclude customer names if it's high-cardinality noise
                classification.excluded.append(col)
            else:
                # Phase 3: Statistical Fingerprinting (Dimension Assignment)
                # Loosen 'Expert' limits: max unique count 500 for better filtering, max cardinality 0.2
                if unique_count > 1 and (cardinality < 0.2 or unique_count < 500):
                    classification.dimensions.append(col)
                else:
                    classification.excluded.append(col)  # Too many categories, noise
    
    # Sort by domain priority
    classification.metrics.sort(key=lambda x: _get_column_priority(df_typed, x, domain), reverse=True)
    classification.dimensions.sort(key=lambda x: _get_column_priority(df_typed, x, domain), reverse=True)
    
    # Component: Attribute Modifier Detection
    for col in df_typed.columns:
        mods = _detect_modifiers(col)
        if mods:
            classification.modifiers[col] = mods

    # ── Phase 2: Canonical Mapping Engine ──
    try:
        from .semantic_resolver import semantic_similarity
        
        # 1. Map Universal Schema (Date, Geo)
        for canonical_key, keywords in UNIVERSAL_SCHEMA.items():
            if canonical_key == 'dim_date' and classification.dates:
                classification.mappings[canonical_key] = classification.dates[0]
                continue
            elif canonical_key == 'dim_date':
                continue # No valid date columns

            best_col = None
            best_score = 0
            for col in classification.dimensions: # Only search in verified dimensions
                score = max(semantic_similarity(kw, col) for kw in keywords)
                if score > best_score and score >= 0.8:
                    best_score = score
                    best_col = col
            if best_col:
                classification.mappings[canonical_key] = best_col

        # 2. Map Domain-Specific Schema
        domain_schema = DOMAIN_SCHEMAS.get(domain, {})
        for canonical_key, keywords in domain_schema.items():
            best_col = None
            best_score = 0
            for col in df_typed.columns:
                if col in classification.excluded: continue
                
                # Phase IV: Hard Logic Constraints
                # 1. Type Guard
                is_numeric = df_typed[col].dtype in ['int64', 'float64', 'int32', 'float32']
                is_metric_key = canonical_key.startswith('metric')
                if is_metric_key and not is_numeric:
                    continue # Reject non-numeric for metric keys
                
                # 2. Score Calculation
                cleaned_col = _clean_header(col)
                score = 0
                
                # Formula: (Primary*5) + (Secondary*3) + (TypeMatch*2.0)
                p_sim = semantic_similarity(keywords[0], cleaned_col)
                if p_sim >= 0.7: score += (p_sim * 5.0)
                
                if len(keywords) > 1:
                    s_sim = max(semantic_similarity(kw, cleaned_col) for kw in keywords[1:])
                    if s_sim >= 0.6: score += (s_sim * 3.0)
                
                # TypeMatch (Continuous logic)
                if is_metric_key == is_numeric: score += 2.0
                
                # 3. Minimum Threshold (Expert Grade)
                if score >= 4.0 and score > best_score:
                    best_score = score
                    best_col = col
                    
            if best_col:
                classification.mappings[canonical_key] = best_col

    except Exception as e:
        logger.error(f"Canonical mapping failed: {e}")
    
    return classification

