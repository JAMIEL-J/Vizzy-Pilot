"""
Metadata Profiler - Analyzes dataset columns to generate physical, logical, and semantic metadata.
"""

import re
from typing import Any, Dict, List
import pandas as pd

from app.services.analytics.domain_detector import DomainType

# Regex for common semantic tagging
SEMANTIC_PATTERNS = {
    "financial:monetary": [r"revenue", r"sales", r"profit", r"cost", r"spend", r"budget", r"income", r"salary", r"price", r"charge", r"amount"],
    "geo:region": [r"region", r"state", r"province", r"territory", r"market", r"zone"],
    "geo:city": [r"city", r"town", r"village"],
    "geo:country": [r"country", r"nation"],
    "identity:surrogate": [r"id", r"uuid", r"guid", r"key", r"index", r"row_number", r"unnamed"],
    "temporal:period": [r"date", r"time", r"timestamp", r"year", r"month", r"quarter", r"period", r"day"],
}

# Values that indicate boolean status
BOOLEAN_WORDS = {"true", "false", "yes", "no", "y", "n", "1", "0", "1.0", "0.0"}

def profile_dataset(df: pd.DataFrame) -> Dict[str, Dict[str, Any]]:
    """
    Profiles a pandas DataFrame and returns metadata for each column.
    """
    metadata = {}
    row_count = len(df)

    for col in df.columns:
        series = df[col]
        non_null_series = series.dropna()
        null_count = row_count - len(non_null_series)
        null_ratio = null_count / row_count if row_count > 0 else 1.0

        unique_count = non_null_series.nunique()
        cardinality = unique_count / row_count if row_count > 0 else 0.0

        # Determine physical type
        physical_type = str(series.dtype)

        # Detect logical type
        logical_type = "categorical"
        if pd.api.types.is_numeric_dtype(series):
            # Check if it behaves like a boolean flag
            unique_vals = set(non_null_series.unique())
            if unique_vals.issubset({0, 1, 0.0, 1.0}):
                logical_type = "boolean"
            else:
                logical_type = "numeric"
        elif pd.api.types.is_datetime64_any_dtype(series):
            logical_type = "temporal"
        else:
            # Check if it behaves like a boolean string
            unique_vals_str = {str(x).strip().lower() for x in non_null_series.unique()[:10]}
            if unique_vals_str.issubset(BOOLEAN_WORDS) and len(unique_vals_str) > 0:
                logical_type = "boolean"

        # Semantic tagging based on patterns and data properties
        semantic_tags = []
        col_lower = col.lower().replace("_", " ").replace("-", " ")
        for tag, patterns in SEMANTIC_PATTERNS.items():
            if any(re.search(pat, col_lower) for pat in patterns):
                semantic_tags.append(tag)

        # Statistical heuristics for ID detection
        if logical_type != "numeric" and cardinality > 0.95 and "identity:surrogate" not in semantic_tags:
            semantic_tags.append("identity:surrogate")

        # Format detection
        format_type = "number"
        if logical_type == "temporal" or "temporal:period" in semantic_tags:
            format_type = "date"
        elif "financial:monetary" in semantic_tags:
            format_type = "currency"
        elif any(x in col_lower for x in ["ratio", "percent", "pct", "rate", "ctr", "cvr", "csat", "sla"]):
            format_type = "percentage"

        metadata[col] = {
            "physical_type": physical_type,
            "logical_type": logical_type,
            "null_ratio": null_ratio,
            "cardinality": cardinality,
            "unique_count": unique_count,
            "semantic_tags": semantic_tags,
            "format_type": format_type,
        }

    return metadata
