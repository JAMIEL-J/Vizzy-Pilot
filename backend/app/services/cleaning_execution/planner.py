from datetime import datetime, timezone
from typing import Any, Dict

import pandas as pd

from app.services.cleaning_execution.rule_engine import build_execution_plan
from app.services.cleaning_execution.executor import execute_plan


def execute_cleaning(
    df: pd.DataFrame,
    proposed_actions: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Orchestrate execution of an approved cleaning plan.

    Validates proposed_actions is not empty.
    Builds execution plan using rule_engine.
    Executes plan using executor.
    Captures start and end timestamps in UTC ISO format.

    Returns:
        {
            "cleaned_df": DataFrame,
            "execution_summary": {
                "steps_executed": int,
                "started_at": str,
                "completed_at": str,
                "rows_dropped": int,
                "cells_modified": int,
                "changes": list
            }
        }
    """
    if not proposed_actions:
        raise ValueError("proposed_actions cannot be empty")

    started_at = datetime.now(timezone.utc).isoformat()

    execution_plan = build_execution_plan(proposed_actions)
    
    # Inject temporary tracking index
    df_with_idx = df.copy()
    df_with_idx["_vizzy_row_idx"] = range(len(df_with_idx))
    
    cleaned_df = execute_plan(df_with_idx, execution_plan)
    
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

    return {
        "cleaned_df": cleaned_df,
        "execution_summary": {
            "steps_executed": len(execution_plan),
            "started_at": started_at,
            "completed_at": completed_at,
            "rows_dropped": rows_dropped,
            "cells_modified": len(changes),
            "changes": changes,
        },
    }
