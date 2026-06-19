"""
Models for the Chart Recommender system.
"""

from dataclasses import dataclass
from typing import Any, Dict, List, Optional

@dataclass
class AggregationData(list):
    def __init__(self, data, outliers=None, data_without_outliers=None):
        super().__init__(data)
        self.outliers = outliers
        self.data_without_outliers = data_without_outliers


@dataclass
class ChartRecommendation:
    slot: str
    title: str
    chart_type: str
    data: Any
    confidence: str
    reason: str
    format_type: Optional[str] = None
    value_label: Optional[str] = None
    dimension: Optional[str] = None
    metric: Optional[str] = None
    aggregation: Optional[str] = None
    categories: Optional[List[str]] = None
    geo_meta: Optional[Dict[str, Any]] = None
    granularity: Optional[str] = None
    section: Optional[str] = None
    variance_score: float = 0.0
    outliers: Optional[Dict[str, Any]] = None
    data_without_outliers: Optional[List[Dict[str, Any]]] = None

    def __post_init__(self):
        if isinstance(self.data, AggregationData) and self.data.outliers:
            self.outliers = self.data.outliers
            self.data_without_outliers = self.data.data_without_outliers
        
        # Clean title to avoid duplicate aggregation prefixes (like "Total Total Charges")
        if self.title:
            from .titles import _clean_title
            self.title = _clean_title(self.title)
