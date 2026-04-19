"""
KPI calculator module.

Belongs to: visualization services layer
Responsibility: Calculate various KPI metrics from DataFrame
Restrictions: Returns structured KPI data only
"""

from typing import Any, Dict, List, Optional, Union
from enum import Enum
import pandas as pd
import numpy as np

from app.core.logger import get_logger


logger = get_logger(__name__)


WHOLE_NUMBER_AVERAGE_KEYWORDS = [
    "age", "tenure", "duration", "day", "days", "month", "months", "year", "years", "los", "lengthofstay"
]


def _is_whole_number_metric_column(column: Optional[str]) -> bool:
    token = str(column or "").lower().replace("_", "").replace("-", "").replace(" ", "")
    if not token:
        return False
    return any(keyword in token for keyword in WHOLE_NUMBER_AVERAGE_KEYWORDS)


class KPIType(str, Enum):
    """Supported KPI calculation types."""
    COUNT = "count"
    SUM = "sum"
    AVERAGE = "average"
    MEDIAN = "median"
    MIN = "min"
    MAX = "max"
    UNIQUE_COUNT = "unique_count"
    PERCENTAGE = "percentage"
    RATIO = "ratio"
    GROWTH = "growth"


def calculate_kpi(
    df: pd.DataFrame,
    kpi_type: KPIType,
    column: Optional[str] = None,
    filter_column: Optional[str] = None,
    filter_value: Optional[Any] = None,
    compare_column: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Calculate a KPI metric from DataFrame.
    
    Args:
        df: Source DataFrame
        kpi_type: Type of KPI calculation
        column: Column to calculate metric on
        filter_column: Optional column to filter by
        filter_value: Optional value to filter on
        compare_column: For ratio/percentage, the comparison column
        
    Returns:
        {
            "value": number,
            "label": str,
            "formatted": str,
            "change": number (optional)
        }
    """
    # Apply filter if specified
    if filter_column and filter_value is not None:
        df = df[df[filter_column] == filter_value]
    
    if df.empty:
        return {"value": 0, "label": "No Data", "formatted": "0"}
    
    # Calculate based on KPI type
    if kpi_type == KPIType.COUNT:
        value = len(df)
        label = "Total Count"
        
    elif kpi_type == KPIType.SUM:
        if not column:
            raise ValueError("Column required for SUM KPI")
        value = float(df[column].sum())
        label = f"Total {column}"
        
    elif kpi_type == KPIType.AVERAGE:
        if not column:
            raise ValueError("Column required for AVERAGE KPI")
        raw_value = float(df[column].mean())
        value = int(round(raw_value)) if _is_whole_number_metric_column(column) else raw_value
        label = f"Avg {column}"
        
    elif kpi_type == KPIType.MEDIAN:
        if not column:
            raise ValueError("Column required for MEDIAN KPI")
        value = float(df[column].median())
        label = f"Median {column}"
        
    elif kpi_type == KPIType.MIN:
        if not column:
            raise ValueError("Column required for MIN KPI")
        value = float(df[column].min())
        label = f"Min {column}"
        
    elif kpi_type == KPIType.MAX:
        if not column:
            raise ValueError("Column required for MAX KPI")
        value = float(df[column].max())
        label = f"Max {column}"
        
    elif kpi_type == KPIType.UNIQUE_COUNT:
        if not column:
            raise ValueError("Column required for UNIQUE_COUNT KPI")
        value = int(df[column].nunique())
        label = f"Unique {column}"
        
    elif kpi_type == KPIType.PERCENTAGE:
        if not column or not filter_value:
            raise ValueError("Column and filter_value required for PERCENTAGE KPI")
        total = len(df)
        matching = len(df[df[column] == filter_value])
        value = round((matching / total) * 100, 2) if total > 0 else 0
        label = f"{filter_value} %"
        
    elif kpi_type == KPIType.RATIO:
        if not column or not compare_column:
            raise ValueError("Column and compare_column required for RATIO KPI")
        sum_a = df[column].sum()
        sum_b = df[compare_column].sum()
        value = round(sum_a / sum_b, 2) if sum_b != 0 else 0
        label = f"{column}/{compare_column}"
        
    elif kpi_type == KPIType.GROWTH:
        if not column:
            raise ValueError("Column required for GROWTH KPI")
        # Compare first half to second half
        mid = len(df) // 2
        first_half = df[column].iloc[:mid].sum()
        second_half = df[column].iloc[mid:].sum()
        if first_half != 0:
            value = round(((second_half - first_half) / first_half) * 100, 2)
        else:
            value = 0
        label = f"{column} Growth"
        
    else:
        raise ValueError(f"Unsupported KPI type: {kpi_type}")
    
    # Format value
    formatted = _format_value(value, kpi_type)
    
    return {
        "value": value,
        "label": label,
        "formatted": formatted,
    }


def calculate_multiple_kpis(
    df: pd.DataFrame,
    kpi_specs: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """
    Calculate multiple KPIs from a list of specifications.
    
    Args:
        df: Source DataFrame
        kpi_specs: List of KPI specifications
        
    Returns:
        List of calculated KPI results
    """
    results = []
    
    for spec in kpi_specs:
        try:
            kpi_type = KPIType(spec.get("type", "count"))
            result = calculate_kpi(
                df=df,
                kpi_type=kpi_type,
                column=spec.get("column"),
                filter_column=spec.get("filter_column"),
                filter_value=spec.get("filter_value"),
                compare_column=spec.get("compare_column"),
            )
            result["id"] = spec.get("id", f"kpi_{len(results)}")
            result["title"] = spec.get("title", result["label"])
            results.append(result)
        except Exception as e:
            logger.warning(f"Failed to calculate KPI: {e}")
            results.append({
                "id": spec.get("id", f"kpi_{len(results)}"),
                "value": None,
                "label": "Error",
                "formatted": "N/A",
                "error": str(e),
            })
    
    return results


def auto_generate_kpis(df: pd.DataFrame, max_kpis: int = 4) -> List[Dict[str, Any]]:
    """
    Auto-generate sensible KPIs based on DataFrame structure.
    
    Args:
        df: Source DataFrame
        max_kpis: Maximum number of KPIs to generate
        
    Returns:
        List of auto-generated KPIs
    """
    kpis = []
    
    # 1. Total row count
    kpis.append({
        "id": "kpi_total",
        "type": "kpi",
        "title": "Total Records",
        "value": len(df),
        "label": "Total Records",
        "formatted": _format_value(len(df), KPIType.COUNT),
    })
    
    # 2. Find numeric columns for sum/avg
    numeric_cols = df.select_dtypes(include=["int64", "float64"]).columns.tolist()
    
    for col in numeric_cols[:2]:  # Max 2 numeric KPIs
        avg_val = float(df[col].mean())
        avg_value_out = int(round(avg_val)) if _is_whole_number_metric_column(col) else round(avg_val, 2)
        kpis.append({
            "id": f"kpi_avg_{col}",
            "type": "kpi",
            "title": f"Avg {col}",
            "value": avg_value_out,
            "label": f"Avg {col}",
            "formatted": _format_value(avg_value_out, KPIType.AVERAGE),
        })
    
    # 3. Unique count for first categorical column
    cat_cols = df.select_dtypes(include=["object", "category"]).columns.tolist()
    if cat_cols and len(kpis) < max_kpis:
        col = cat_cols[0]
        unique_count = int(df[col].nunique())
        kpis.append({
            "id": f"kpi_unique_{col}",
            "type": "kpi",
            "title": f"Unique {col}",
            "value": unique_count,
            "label": f"Unique {col}",
            "formatted": _format_value(unique_count, KPIType.UNIQUE_COUNT),
        })
    
    return kpis[:max_kpis]


def _format_value(value: Union[int, float], kpi_type: KPIType) -> str:
    """Format KPI value for display."""
    if value is None:
        return "N/A"
    
    if kpi_type in [KPIType.PERCENTAGE, KPIType.GROWTH]:
        return f"{value:+.1f}%" if kpi_type == KPIType.GROWTH else f"{value:.1f}%"
    
    if kpi_type == KPIType.RATIO:
        return f"{value:.2f}x"
    
    if isinstance(value, float):
        if value.is_integer():
            return f"{int(value):,}"
        if abs(value) >= 1_000_000:
            return f"{value/1_000_000:.1f}M"
        elif abs(value) >= 1_000:
            return f"{value/1_000:.1f}K"
        else:
            return f"{value:,.2f}"
    
    if isinstance(value, int):
        if value >= 1_000_000:
            return f"{value/1_000_000:.1f}M"
        elif value >= 1_000:
            return f"{value/1_000:.1f}K"
        else:
            return f"{value:,}"
    
    return str(value)
