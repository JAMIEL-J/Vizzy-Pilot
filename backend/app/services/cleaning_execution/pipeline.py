from datetime import datetime, timezone
from typing import List, Dict, Any
import pandas as pd
from app.services.cleaning_execution.operators import (
    TrimOperator,
    DuplicateOperator,
    ImputeOperator,
    CapOutlierOperator
)
from app.services.cleaning_execution.base import LineageEvent

class CleaningPipeline:
    """Orchestrates the logical execution of cleaning operators in order."""
    def __init__(self, steps: List[Dict[str, Any]]):
        self.steps = steps
        # Logical sequence sorting: Trim -> Duplicates -> Impute -> Cap
        self.sorted_steps = self._sort_steps(steps)
        self.lineage_events: List[LineageEvent] = []

    def _sort_steps(self, steps: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        def get_priority(step: Dict[str, Any]) -> int:
            rule = step.get("rule", "")
            if rule == "trim_string_columns":
                return 0
            elif rule == "remove_duplicates":
                return 1
            elif rule in ("fill_missing_mean", "fill_missing_median"):
                return 2
            elif rule == "cap_outliers":
                return 3
            return 4
        
        # Python's sort is stable, keeping the user's defined order within same priority
        return sorted(steps, key=get_priority)

    def execute(self, df: pd.DataFrame, validator: Any = None) -> pd.DataFrame:
        result = df
        original_len = len(df)
        self.lineage_events = []

        for step in self.sorted_steps:
            rule_name = step.get("rule")
            params = step.get("params", {}).copy()

            if rule_name == "trim_string_columns":
                op = TrimOperator(params)
            elif rule_name == "remove_duplicates":
                op = DuplicateOperator(params)
            elif rule_name == "fill_missing_mean":
                params["method"] = "mean"
                op = ImputeOperator(params)
            elif rule_name == "fill_missing_median":
                params["method"] = "median"
                op = ImputeOperator(params)
            elif rule_name == "cap_outliers":
                op = CapOutlierOperator(params)
            else:
                raise ValueError(f"Unknown rule: {rule_name}")

            result = op.execute(result)
            
            # In-flight validation check
            if validator is not None:
                validator.check_inflight(original_len, len(result))

            metrics = op.get_impact_metrics()
            event = LineageEvent(
                operator_name=rule_name,
                columns_affected=metrics["columns_affected"],
                rows_dropped=metrics["rows_dropped"],
                cells_modified=metrics["cells_modified"],
                timestamp=datetime.now(timezone.utc).isoformat(),
                details=step,
            )
            self.lineage_events.append(event)

        return result
