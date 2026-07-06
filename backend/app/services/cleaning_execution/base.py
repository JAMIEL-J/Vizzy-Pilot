from abc import ABC, abstractmethod
from typing import Dict, Any, List
import pandas as pd

class LineageEvent:
    """Tracks the lineage event details of an executed cleaning operator."""
    def __init__(
        self,
        operator_name: str,
        columns_affected: List[str],
        rows_dropped: int,
        cells_modified: int,
        timestamp: str,
        details: Dict[str, Any],
    ):
        self.operator_name = operator_name
        self.columns_affected = columns_affected
        self.rows_dropped = rows_dropped
        self.cells_modified = cells_modified
        self.timestamp = timestamp
        self.details = details

    def to_dict(self) -> Dict[str, Any]:
        return {
            "operator_name": self.operator_name,
            "columns_affected": self.columns_affected,
            "rows_dropped": self.rows_dropped,
            "cells_modified": self.cells_modified,
            "timestamp": self.timestamp,
            "details": self.details,
        }


class CleanOperator(ABC):
    """Abstract base class for all cleaning operators."""
    def __init__(self, params: Dict[str, Any]):
        self.params = params
        self.validate_params()
        self.rows_dropped = 0
        self.cells_modified = 0
        self.columns_affected: List[str] = []

    @abstractmethod
    def validate_params(self) -> None:
        """Validate input parameters for the operator. Raise ValueError on failure."""
        pass

    @abstractmethod
    def execute(self, df: pd.DataFrame) -> pd.DataFrame:
        """Execute the cleaning operator on the dataframe, returning a modified/new dataframe."""
        pass

    def get_impact_metrics(self) -> Dict[str, Any]:
        """Return impact metrics dictionary."""
        return {
            "rows_dropped": self.rows_dropped,
            "cells_modified": self.cells_modified,
            "columns_affected": self.columns_affected,
        }
