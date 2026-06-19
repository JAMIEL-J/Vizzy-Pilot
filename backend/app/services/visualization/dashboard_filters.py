"""
Dashboard filters module.

Belongs to: visualization services layer
Responsibility: Apply filters to dashboard data
Restrictions: Returns filtered DataFrame and filter metadata
"""

from typing import Any, Dict, List, Optional, Union
from enum import Enum
import pandas as pd

from app.core.logger import get_logger


logger = get_logger(__name__)


class FilterOperator(str, Enum):
    """Supported filter operators."""
    EQUALS = "eq"
    NOT_EQUALS = "neq"
    GREATER_THAN = "gt"
    GREATER_THAN_OR_EQUAL = "gte"
    LESS_THAN = "lt"
    LESS_THAN_OR_EQUAL = "lte"
    CONTAINS = "contains"
    NOT_CONTAINS = "not_contains"
    IN = "in"
    NOT_IN = "not_in"
    IS_NULL = "is_null"
    IS_NOT_NULL = "is_not_null"
    BETWEEN = "between"


def apply_filter(
    df: pd.DataFrame,
    column: str,
    operator: FilterOperator,
    value: Any,
) -> pd.DataFrame:
    """
    Apply a single filter to DataFrame.
    
    Args:
        df: Source DataFrame
        column: Column to filter on
        operator: Filter operator
        value: Filter value(s)
        
    Returns:
        Filtered DataFrame
    """
    if column not in df.columns:
        logger.warning(f"Column '{column}' not found in DataFrame")
        return df
    
    col = df[column]
    
    if operator == FilterOperator.EQUALS:
        return df[col == value]
    
    elif operator == FilterOperator.NOT_EQUALS:
        return df[col != value]
    
    elif operator == FilterOperator.GREATER_THAN:
        return df[col > value]
    
    elif operator == FilterOperator.GREATER_THAN_OR_EQUAL:
        return df[col >= value]
    
    elif operator == FilterOperator.LESS_THAN:
        return df[col < value]
    
    elif operator == FilterOperator.LESS_THAN_OR_EQUAL:
        return df[col <= value]
    
    elif operator == FilterOperator.CONTAINS:
        return df[col.astype(str).str.contains(str(value), case=False, na=False)]
    
    elif operator == FilterOperator.NOT_CONTAINS:
        return df[~col.astype(str).str.contains(str(value), case=False, na=False)]
    
    elif operator == FilterOperator.IN:
        if not isinstance(value, list):
            value = [value]
        return df[col.isin(value)]
    
    elif operator == FilterOperator.NOT_IN:
        if not isinstance(value, list):
            value = [value]
        return df[~col.isin(value)]
    
    elif operator == FilterOperator.IS_NULL:
        return df[col.isna()]
    
    elif operator == FilterOperator.IS_NOT_NULL:
        return df[col.notna()]
    
    elif operator == FilterOperator.BETWEEN:
        if not isinstance(value, (list, tuple)) or len(value) != 2:
            raise ValueError("BETWEEN requires a list of [min, max]")
        return df[(col >= value[0]) & (col <= value[1])]
    
    else:
        raise ValueError(f"Unsupported operator: {operator}")


def apply_filters(
    df: pd.DataFrame,
    filters: List[Dict[str, Any]],
) -> pd.DataFrame:
    """
    Apply multiple filters to DataFrame.
    
    Args:
        df: Source DataFrame
        filters: List of filter specifications
            [{"column": "status", "operator": "eq", "value": "active"}, ...]
            
    Returns:
        Filtered DataFrame
    """
    result = df.copy()
    
    for f in filters:
        try:
            column = f.get("column")
            operator = FilterOperator(f.get("operator", "eq"))
            value = f.get("value")
            
            result = apply_filter(result, column, operator, value)
            
        except Exception as e:
            logger.warning(f"Failed to apply filter {f}: {e}")
            continue
    
    return result


def get_filter_options(
    df: pd.DataFrame,
    column: str,
    max_options: int = 50,
) -> Dict[str, Any]:
    """
    Get available filter options for a column.
    
    Args:
        df: Source DataFrame
        column: Column to get options for
        max_options: Maximum number of options to return
        
    Returns:
        {
            "column": str,
            "dtype": str,
            "options": [...] for categorical,
            "min": value for numeric,
            "max": value for numeric,
        }
    """
    if column not in df.columns:
        return {"column": column, "error": "Column not found"}
    
    col = df[column]
    dtype = str(col.dtype)
    
    result = {
        "column": column,
        "dtype": dtype,
        "null_count": int(col.isna().sum()),
        "total_count": len(col),
    }
    
    # Numeric columns
    if pd.api.types.is_numeric_dtype(col):
        result["min"] = float(col.min()) if col.notna().any() else None
        result["max"] = float(col.max()) if col.notna().any() else None
        result["mean"] = float(col.mean()) if col.notna().any() else None
        result["filter_type"] = "range"
        
    # Categorical/object columns
    elif pd.api.types.is_object_dtype(col) or pd.api.types.is_string_dtype(col) or isinstance(col.dtype, pd.CategoricalDtype):
        value_counts = col.value_counts().head(max_options)
        result["options"] = [
            {"value": str(v), "count": int(c)}
            for v, c in value_counts.items()
        ]
        result["unique_count"] = int(col.nunique())
        result["filter_type"] = "select"
        
    # DateTime columns
    elif pd.api.types.is_datetime64_any_dtype(col):
        result["min"] = col.min().isoformat() if col.notna().any() else None
        result["max"] = col.max().isoformat() if col.notna().any() else None
        result["filter_type"] = "date_range"
        
    # Boolean columns
    elif pd.api.types.is_bool_dtype(col):
        result["options"] = [
            {"value": True, "count": int(col.sum())},
            {"value": False, "count": int((~col).sum())},
        ]
        result["filter_type"] = "boolean"
        
    else:
        result["filter_type"] = "text"
    
    return result


def get_all_filter_options(
    df: pd.DataFrame,
    exclude_columns: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    """
    Get filter options for all columns in DataFrame.
    
    Args:
        df: Source DataFrame
        exclude_columns: Columns to exclude
        
    Returns:
        List of filter options for each column
    """
    exclude = exclude_columns or []
    
    return [
        get_filter_options(df, col)
        for col in df.columns
        if col not in exclude
    ]


def build_filter_summary(
    original_count: int,
    filtered_count: int,
    filters: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Build a summary of applied filters.
    """
    return {
        "original_count": original_count,
        "filtered_count": filtered_count,
        "removed_count": original_count - filtered_count,
        "retention_rate": round((filtered_count / original_count) * 100, 2) if original_count > 0 else 0,
        "active_filters": len(filters),
        "filters": filters,
    }
