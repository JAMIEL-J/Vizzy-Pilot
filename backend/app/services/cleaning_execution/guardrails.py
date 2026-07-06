from typing import Any, Dict
import pandas as pd
from app.services.inspection_execution.inspector import run_inspection

class HardStopException(Exception):
    """Raised when in-flight validation fails and execution must stop immediately."""
    pass


class PostFlightValidator:
    """Validator that performs pre-flight, in-flight, and post-flight validation checks."""
    def run_preflight_checks(self, df: pd.DataFrame) -> Dict[str, Any]:
        """
        Run checks on raw data:
        - Sparsity check: identifies columns with > 90% null values.
        - Type check: detects mixed type columns.
        """
        sparsity_issues = {}
        type_issues = {}
        
        for col in df.columns:
            if col == "_vizzy_row_idx":
                continue
            
            # Sparsity check
            total_len = len(df)
            null_count = df[col].isna().sum()
            null_ratio = null_count / total_len if total_len > 0 else 0
            if null_ratio > 0.9:
                sparsity_issues[col] = float(null_ratio)
            
            # Type check (mixed types)
            # Filter out null values for type check to avoid false positives with float (NaN)
            non_null_vals = df[col].dropna()
            if not non_null_vals.empty:
                unique_types = {type(val).__name__ for val in non_null_vals}
                if len(unique_types) > 1:
                    type_issues[col] = sorted(list(unique_types))

        return {
            "passed": len(sparsity_issues) == 0 and len(type_issues) == 0,
            "sparsity_issues": sparsity_issues,
            "type_issues": type_issues,
        }

    def check_inflight(self, original_len: int, current_len: int) -> None:
        """
        Safety check: if rows dropped is > 5% of total dataset and the dataset length > 100 rows,
        raise a custom HardStopException.
        """
        rows_dropped = original_len - current_len
        if original_len > 100:
            dropped_percentage = rows_dropped / original_len
            if dropped_percentage > 0.05:
                raise HardStopException(
                    f"Safety Guardrail: Dropped {rows_dropped} rows ({dropped_percentage:.2%}), "
                    f"which exceeds the safety limit of 5.00% for datasets > 100 rows."
                )

    def validate_postflight(self, raw_df: pd.DataFrame, cleaned_df: pd.DataFrame) -> Dict[str, Any]:
        """
        Compare raw vs cleaned health scores.
        Flag status as "Unstable" if health score decreases.
        """
        if raw_df.empty:
            return {"status": "Stable", "raw_score": 0, "cleaned_score": 0}
            
        if cleaned_df.empty:
            raw_insp = run_inspection(raw_df)
            raw_score = raw_insp["health_score"]["score"]
            return {
                "status": "Unstable",
                "raw_score": raw_score,
                "cleaned_score": 0,
                "reason": "Cleaned dataset is empty."
            }

        raw_insp = run_inspection(raw_df)
        cleaned_insp = run_inspection(cleaned_df)

        raw_score = raw_insp["health_score"]["score"]
        cleaned_score = cleaned_insp["health_score"]["score"]

        status = "Stable"
        if cleaned_score < raw_score:
            status = "Unstable"

        return {
            "status": status,
            "raw_score": raw_score,
            "cleaned_score": cleaned_score,
        }
