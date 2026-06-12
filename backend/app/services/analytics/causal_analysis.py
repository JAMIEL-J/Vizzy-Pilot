"""
Causal Analysis Service

Generates "Why" driver annotations using Pearson/Spearman correlation
to explain what's driving KPI movements.
"""

import logging
from typing import Dict, List, Optional, Any
from dataclasses import dataclass

import pandas as pd
import numpy as np
from scipy import stats

from app.core.logger import get_logger

logger = get_logger(__name__)


@dataclass
class DriverAnnotation:
    """A single driver annotation explaining a KPI movement."""
    kpi_name: str
    kpi_value: float
    driver_column: str
    correlation: float
    correlation_type: str  # "pearson" or "spearman"
    direction: str  # "positive" or "negative"
    strength: str  # "strong", "moderate", "weak"
    explanation: str
    confidence: str  # "high", "medium", "low"


def _compute_correlation(x: pd.Series, y: pd.Series, method: str = "pearson") -> float:
    """Compute correlation between two series, handling edge cases."""
    # Remove NaN values
    mask = x.notna() & y.notna()
    x_clean = x[mask]
    y_clean = y[mask]
    
    if len(x_clean) < 3:
        return 0.0
    
    # Check for constant values
    if x_clean.nunique() <= 1 or y_clean.nunique() <= 1:
        return 0.0
    
    try:
        if method == "pearson":
            corr, _ = stats.pearsonr(x_clean, y_clean)
        else:  # spearman
            corr, _ = stats.spearmanr(x_clean, y_clean)
        
        return corr if not np.isnan(corr) else 0.0
    except Exception:
        return 0.0


def _categorize_correlation_strength(corr: float) -> str:
    """Categorize correlation strength."""
    abs_corr = abs(corr)
    if abs_corr >= 0.7:
        return "strong"
    elif abs_corr >= 0.4:
        return "moderate"
    else:
        return "weak"


def _generate_explanation(
    kpi_name: str,
    driver_column: str,
    corr: float,
    strength: str,
    direction: str
) -> str:
    """Generate human-readable explanation for a driver."""
    direction_text = "increases" if direction == "positive" else "decreases"
    
    if strength == "strong":
        return f"{driver_column} has a strong {direction} correlation with {kpi_name}. When {driver_column} {direction_text}, {kpi_name} tends to {direction_text} as well."
    elif strength == "moderate":
        return f"{driver_column} shows a moderate {direction} relationship with {kpi_name}. Changes in {driver_column} are associated with {direction_text} changes in {kpi_name}."
    else:
        return f"{driver_column} has a weak {direction} correlation with {kpi_name}. The relationship exists but may not be the primary driver."


def analyze_drivers(
    df: pd.DataFrame,
    kpi_columns: List[str],
    potential_drivers: Optional[List[str]] = None,
    min_correlation: float = 0.3,
    max_drivers: int = 5,
) -> Dict[str, List[DriverAnnotation]]:
    """
    Analyze drivers for given KPI columns using correlation analysis.
    
    Args:
        df: DataFrame with dataset
        kpi_columns: Columns to analyze as KPIs
        potential_drivers: Columns to consider as potential drivers (default: all numeric except KPIs)
        min_correlation: Minimum absolute correlation to include
        max_drivers: Maximum number of drivers per KPI
        
    Returns:
        Dictionary mapping KPI name to list of driver annotations
    """
    results = {}
    
    # Get numeric columns
    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    
    for kpi in kpi_columns:
        if kpi not in numeric_cols:
            logger.warning(f"KPI column {kpi} is not numeric, skipping")
            continue
        
        # Determine potential drivers
        if potential_drivers:
            drivers = [d for d in potential_drivers if d in numeric_cols and d != kpi]
        else:
            drivers = [c for c in numeric_cols if c != kpi]
        
        if not drivers:
            continue
        
        annotations = []
        
        for driver in drivers:
            # Try Pearson first
            pearson_corr = _compute_correlation(df[kpi], df[driver], "pearson")
            
            # If Pearson is weak, try Spearman (monotonic relationship)
            if abs(pearson_corr) < 0.5:
                spearman_corr = _compute_correlation(df[kpi], df[driver], "spearman")
                # Use the stronger correlation
                if abs(spearman_corr) > abs(pearson_corr):
                    corr = spearman_corr
                    corr_type = "spearman"
                else:
                    corr = pearson_corr
                    corr_type = "pearson"
            else:
                corr = pearson_corr
                corr_type = "pearson"
            
            # Skip if below threshold
            if abs(corr) < min_correlation:
                continue
            
            strength = _categorize_correlation_strength(corr)
            direction = "positive" if corr > 0 else "negative"
            
            # Get current KPI value
            kpi_value = df[kpi].mean()
            
            annotation = DriverAnnotation(
                kpi_name=kpi,
                kpi_value=kpi_value,
                driver_column=driver,
                correlation=round(corr, 3),
                correlation_type=corr_type,
                direction=direction,
                strength=strength,
                explanation=_generate_explanation(kpi, driver, corr, strength, direction),
                confidence="high" if abs(corr) >= 0.5 else "medium" if abs(corr) >= 0.3 else "low"
            )
            annotations.append(annotation)
        
        # Sort by absolute correlation and take top N
        annotations.sort(key=lambda x: abs(x.correlation), reverse=True)
        results[kpi] = annotations[:max_drivers]
    
    return results


def generate_why_annotations(
    df: pd.DataFrame,
    target_column: Optional[str] = None,
    classification: Optional[Dict[str, List[str]]] = None,
) -> Dict[str, Any]:
    """
    Generate "Why" driver annotations for a dataset.
    
    This is the main entry point for causal analytics.
    
    Args:
        df: DataFrame with dataset
        target_column: Optional target/outcome column to focus on
        classification: Optional column classification from semantic mapping
        
    Returns:
        Dictionary with driver annotations and summary
    """
    # Determine KPI columns
    if classification and "metrics" in classification:
        kpi_columns = [c for c in classification["metrics"] if c in df.columns]
    else:
        # Default: all numeric columns
        kpi_columns = df.select_dtypes(include=[np.number]).columns.tolist()
    
    if target_column and target_column in df.columns:
        # If target is specified, focus on it
        if target_column not in kpi_columns:
            # Try to convert to numeric
            try:
                df[target_column] = pd.to_numeric(df[target_column], errors="coerce")
                kpi_columns = [target_column]
            except Exception:
                pass
        else:
            kpi_columns = [target_column]
    
    if not kpi_columns:
        return {
            "annotations": [],
            "summary": "No numeric KPI columns found for analysis",
            "total_drivers_found": 0
        }
    
    # Analyze drivers
    driver_results = analyze_drivers(df, kpi_columns)
    
    # Flatten results
    all_annotations = []
    for kpi, annotations in driver_results.items():
        all_annotations.extend(annotations)
    
    # Generate summary
    total_drivers = len(all_annotations)
    strong_drivers = sum(1 for a in all_annotations if a.strength == "strong")
    
    summary = f"Found {total_drivers} significant drivers across {len(driver_results)} KPIs. {strong_drivers} strong correlations identified."
    
    # Convert to serializable format
    serializable_annotations = []
    for ann in all_annotations:
        serializable_annotations.append({
            "kpi_name": ann.kpi_name,
            "kpi_value": ann.kpi_value,
            "driver_column": ann.driver_column,
            "correlation": ann.correlation,
            "correlation_type": ann.correlation_type,
            "direction": ann.direction,
            "strength": ann.strength,
            "explanation": ann.explanation,
            "confidence": ann.confidence
        })
    
    return {
        "annotations": serializable_annotations,
        "summary": summary,
        "total_drivers_found": total_drivers,
        "strong_correlations": strong_drivers
    }