import pandas as pd
from typing import Any, Dict
from uuid import UUID

from app.core.storage import get_cleaned_data_path
from app.services.cleaning_execution.executor import execute_plan


def execute_and_save_cleaning(
    *,
    df: pd.DataFrame,
    proposed_actions: Dict[str, Any],
    dataset_id: UUID,
    version_id: UUID,
) -> Dict[str, Any]:
    if not proposed_actions:
        raise ValueError("proposed_actions cannot be empty")

    cleaned_df = execute_plan(df, proposed_actions)

    cleaned_path = get_cleaned_data_path(dataset_id, version_id)
    from app.services.storage import get_storage
    import tempfile, uuid, os
    tmp_path = os.path.join(tempfile.gettempdir(), f"csv_{uuid.uuid4().hex}")
    
    try:
        cleaned_df.to_csv(tmp_path, index=False)
        with open(tmp_path, "rb") as f:
            get_storage().save(cleaned_path, f)
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

    return {
        "cleaned_path": str(cleaned_path),
        "rows": len(cleaned_df),
        "steps_executed": len(proposed_actions.get("steps", [])),
    }
