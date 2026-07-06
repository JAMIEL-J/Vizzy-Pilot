from datetime import datetime, timezone
from typing import Any, Dict

import pandas as pd

from app.services.cleaning_execution.pipeline import CleaningPipeline
from app.services.cleaning_execution.guardrails import PostFlightValidator


def execute_cleaning(
    df: pd.DataFrame,
    proposed_actions: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Orchestrate execution of an approved cleaning plan.

    Validates proposed_actions is not empty.
    Runs pre-flight safety and sparsity checks.
    Builds and executes the plan using CleaningPipeline (with in-flight safety guardrails).
    Compares raw vs cleaned Health Scores in a post-flight validation step.

    Returns:
        {
            "cleaned_df": DataFrame,
            "execution_summary": {
                "steps_executed": int,
                "started_at": str,
                "completed_at": str,
                "rows_dropped": int,
                "cells_modified": int,
                "changes": list,
                "preflight": dict,
                "postflight": dict,
                "columns_affected": list,
                "lineage": list
            }
        }
    """
    if not proposed_actions:
        raise ValueError("proposed_actions cannot be empty")

    started_at = datetime.now(timezone.utc).isoformat()

    # 1. Pre-flight checks
    validator = PostFlightValidator()
    preflight_report = validator.run_preflight_checks(df)

    # 2. Pipeline execution
    steps = proposed_actions.get("steps", [])
    pipeline = CleaningPipeline(steps)
    
    # Inject temporary tracking index
    df_with_idx = df.copy(deep=False)
    df_with_idx["_vizzy_row_idx"] = range(len(df_with_idx))
    
    cleaned_df = pipeline.execute(df_with_idx, validator=validator)
    
    # Calculate differences
    original_len = len(df)
    remaining_len = len(cleaned_df)
    rows_dropped = original_len - remaining_len
    
    changes = []
    
    # Align rows that were not dropped to compare cell changes
    if remaining_len > 0:
        original_aligned = df.loc[cleaned_df["_vizzy_row_idx"]].reset_index(drop=True)
        cleaned_aligned = cleaned_df.reset_index(drop=True)
        
        common_cols = [c for c in df.columns if c in cleaned_df.columns and c != "_vizzy_row_idx"]
        
        for col in common_cols:
            # Handle float comparisons containing NaN safely
            diff_mask = (original_aligned[col] != cleaned_aligned[col]) & ~(
                original_aligned[col].isna() & cleaned_aligned[col].isna()
            )
            diff_indices = diff_mask.to_numpy().nonzero()[0]
            
            for idx in diff_indices:
                orig_row_idx = int(cleaned_df["_vizzy_row_idx"].iloc[idx])
                changes.append({
                    "row": orig_row_idx,
                    "column": col,
                    "original": None if pd.isna(original_aligned[col].iloc[idx]) else str(original_aligned[col].iloc[idx]),
                    "cleaned": None if pd.isna(cleaned_aligned[col].iloc[idx]) else str(cleaned_aligned[col].iloc[idx])
                })
                # Limit detailed log to avoid huge payloads
                if len(changes) >= 500:
                    break
            if len(changes) >= 500:
                break
                
    # Clean up the temporary column
    if "_vizzy_row_idx" in cleaned_df.columns:
        cleaned_df = cleaned_df.drop(columns=["_vizzy_row_idx"])
        
    completed_at = datetime.now(timezone.utc).isoformat()

    # 3. Post-flight validation
    postflight_report = validator.validate_postflight(df, cleaned_df)

    # Summarize metrics
    total_cells_modified = sum(e.cells_modified for e in pipeline.lineage_events)
    affected_cols = set()
    for e in pipeline.lineage_events:
        affected_cols.update(e.columns_affected)

    return {
        "cleaned_df": cleaned_df,
        "execution_summary": {
            "steps_executed": len(pipeline.lineage_events),
            "started_at": started_at,
            "completed_at": completed_at,
            "rows_dropped": rows_dropped,
            "cells_modified": total_cells_modified,
            "changes": changes,
            "preflight": preflight_report,
            "postflight": postflight_report,
            "columns_affected": sorted(list(affected_cols)),
            "lineage": [e.to_dict() for e in pipeline.lineage_events]
        },
    }
