from typing import Any, Dict
import pandas as pd
from app.services.cleaning_execution.pipeline import CleaningPipeline

def execute_plan(
    df: pd.DataFrame,
    proposed_actions: Dict[str, Any],
) -> pd.DataFrame:
    """
    Apply a validated cleaning execution plan to a DataFrame via CleaningPipeline.
    """
    steps = proposed_actions.get("steps", [])
    pipeline = CleaningPipeline(steps)
    return pipeline.execute(df)
