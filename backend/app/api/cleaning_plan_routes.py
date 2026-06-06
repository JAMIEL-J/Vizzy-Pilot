from datetime import datetime, timezone
from typing import Dict, Any
from uuid import UUID

import pandas as pd
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.api.deps import DBSession, RateLimitedUser
from app.services import cleaning_plan_service
from app.services.ingestion_execution.file_loader import _read_csv_with_encodings
from app.services.cleaning_execution.planner import execute_cleaning
from app.core.storage import get_cleaned_data_path
from app.models.dataset_version import DatasetVersion
from app.core.exceptions import (
    ResourceNotFound,
    AuthorizationError,
    InvalidOperation,
)


router = APIRouter()


# =========================
# Request / Response Models
# =========================

class CleaningPlanCreateRequest(BaseModel):
    proposed_actions: Dict[str, Any]


class CleaningPlanResponse(BaseModel):
    id: UUID
    dataset_version_id: UUID
    proposed_actions: Dict[str, Any]
    approved: bool
    approved_by: UUID | None
    approved_at: datetime | None
    is_active: bool

    class Config:
        from_attributes = True


# =========================
# Routes
# =========================

@router.post(
    "",
    response_model=CleaningPlanResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_cleaning_plan(
    version_id: UUID,
    request: CleaningPlanCreateRequest,
    session: DBSession,
    current_user: RateLimitedUser,
) -> CleaningPlanResponse:
    """
    Create a cleaning plan proposal for a dataset version.
    Plan is NOT executed automatically.
    """
    try:
        plan = cleaning_plan_service.create_cleaning_plan(
            session=session,
            dataset_version_id=version_id,
            proposed_actions=request.proposed_actions,
            user_id=UUID(current_user.user_id),
            role=current_user.role,
        )
        return CleaningPlanResponse.model_validate(plan)

    except ResourceNotFound as e:
        raise HTTPException(status_code=404, detail=e.message)

    except AuthorizationError as e:
        raise HTTPException(status_code=403, detail=e.message)

    except InvalidOperation as e:
        raise HTTPException(status_code=409, detail=e.message)


@router.get(
    "",
    response_model=CleaningPlanResponse,
)
def get_cleaning_plan(
    version_id: UUID,
    session: DBSession,
    current_user: RateLimitedUser,
) -> CleaningPlanResponse:
    """Fetch the active cleaning plan for a dataset version."""
    try:
        plan = cleaning_plan_service.get_cleaning_plan_for_version(
            session=session,
            dataset_version_id=version_id,
            user_id=UUID(current_user.user_id),
            role=current_user.role,
        )
        return CleaningPlanResponse.model_validate(plan)

    except ResourceNotFound as e:
        raise HTTPException(status_code=404, detail=e.message)

    except AuthorizationError as e:
        raise HTTPException(status_code=403, detail=e.message)


@router.post(
    "/{plan_id}/approve",
    response_model=CleaningPlanResponse,
)
def approve_cleaning_plan(
    version_id: UUID,
    plan_id: UUID,
    session: DBSession,
    current_user: RateLimitedUser,
) -> CleaningPlanResponse:
    """
    Explicitly approve a cleaning plan.
    This action is irreversible.
    """
    try:
        plan = cleaning_plan_service.approve_cleaning_plan(
            session=session,
            plan_id=plan_id,
            user_id=UUID(current_user.user_id),
            role=current_user.role,
        )
        return CleaningPlanResponse.model_validate(plan)

    except ResourceNotFound as e:
        raise HTTPException(status_code=404, detail=e.message)

    except AuthorizationError as e:
        raise HTTPException(status_code=403, detail=e.message)

    except InvalidOperation as e:
        raise HTTPException(status_code=409, detail=e.message)


def _convert_actions_to_steps(proposed_actions: Dict[str, Any]) -> Dict[str, Any]:
    """
    Convert frontend format:
      {"fill_missing": [{"column": "age", "method": "mean"}],
       "drop_rows": ["col1"],
       "remove_duplicates": true,
       "cap_outliers": ["col2"]}

    To rule-engine format:
      {"steps": [{"rule": "fill_missing_mean", "params": {"columns": ["age"]}}]}
    """
    # If already in steps format, pass through
    if "steps" in proposed_actions:
        return proposed_actions

    steps = []

    # Fill missing values
    for entry in proposed_actions.get("fill_missing", []):
        col = entry.get("column")
        method = entry.get("method", "mean")
        if col:
            rule = f"fill_missing_{method}"  # fill_missing_mean or fill_missing_median
            steps.append({"rule": rule, "params": {"columns": [col]}})

    # Drop rows with nulls
    drop_cols = proposed_actions.get("drop_rows", [])
    if drop_cols:
        steps.append({
            "rule": "drop_rows_with_nulls",
            "params": {"columns": drop_cols},
        })

    # Remove duplicates
    if proposed_actions.get("remove_duplicates"):
        steps.append({
            "rule": "remove_duplicates",
            "params": {},
        })

    # Cap outliers
    cap_cols = proposed_actions.get("cap_outliers", [])
    if cap_cols:
        steps.append({
            "rule": "cap_outliers",
            "params": {"columns": cap_cols},
        })

    # Trim strings (always run if present)
    trim_cols = proposed_actions.get("trim_strings", [])
    if trim_cols:
        steps.append({
            "rule": "trim_string_columns",
            "params": {"columns": trim_cols},
        })

    return {"steps": steps}


@router.post(
    "/preview",
    status_code=status.HTTP_200_OK,
    summary="Preview a cleaning plan on a sample of raw data",
)
def preview_cleaning_plan(
    version_id: UUID,
    request: CleaningPlanCreateRequest,
    session: DBSession,
    current_user: RateLimitedUser,
) -> Dict[str, Any]:
    """
    Dry-run clean-up on a sample of the dataset version's raw data.
    Does NOT save files or create versions.
    """
    try:
        version = session.get(DatasetVersion, version_id)
        if not version or not version.is_active:
            raise ResourceNotFound("DatasetVersion", str(version_id))

        # Load first 200 rows of raw data
        raw_path = version.source_reference
        df = _read_csv_with_encodings(raw_path, nrows=200)

        # Convert actions
        normalized_actions = _convert_actions_to_steps(request.proposed_actions)

        if not normalized_actions.get("steps"):
            original_records = df.replace({pd.NA: None}).where(pd.notnull(df), None).to_dict(orient="records")
            now_str = datetime.now(timezone.utc).isoformat()
            return {
                "success": True,
                "original_data": original_records,
                "cleaned_data": original_records,
                "rows_before": len(df),
                "rows_after": len(df),
                "steps_executed": 0,
                "started_at": now_str,
                "completed_at": now_str,
                "rows_dropped": 0,
                "cells_modified": 0,
                "changes": [],
            }

        # Execute cleaning on the sample
        result = execute_cleaning(df, normalized_actions)

        # Build original data & cleaned data records lists
        # (Handling NaNs so they can be JSON serialized safely)
        df_cleaned = result["cleaned_df"]
        
        original_records = df.replace({pd.NA: None}).where(pd.notnull(df), None).to_dict(orient="records")
        cleaned_records = df_cleaned.replace({pd.NA: None}).where(pd.notnull(df_cleaned), None).to_dict(orient="records")

        return {
            "success": True,
            "original_data": original_records,
            "cleaned_data": cleaned_records,
            "rows_before": len(df),
            "rows_after": len(df_cleaned),
            **result["execution_summary"],
        }
    except ResourceNotFound as e:
        raise HTTPException(status_code=404, detail=e.message)
    except AuthorizationError as e:
        raise HTTPException(status_code=403, detail=e.message)
    except InvalidOperation as e:
        raise HTTPException(status_code=409, detail=e.message)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.post(
    "/{plan_id}/execute",
    status_code=status.HTTP_200_OK,
    summary="Execute an approved cleaning plan",
)
def execute_cleaning_plan(
    version_id: UUID,
    plan_id: UUID,
    session: DBSession,
    current_user: RateLimitedUser,
) -> Dict[str, Any]:
    """
    Execute an approved cleaning plan.
    Loads raw data, applies cleaning rules, saves cleaned CSV,
    and updates DatasetVersion.cleaned_reference.
    """
    try:
        plan = cleaning_plan_service.get_plan_by_id(session, plan_id)

        if not plan.approved:
            raise InvalidOperation(
                operation="execute_cleaning_plan",
                reason="Cleaning plan must be approved before execution",
            )

        version = session.get(DatasetVersion, plan.dataset_version_id)
        if not version or not version.is_active:
            raise ResourceNotFound("DatasetVersion", str(plan.dataset_version_id))

        # Load raw data
        raw_path = version.source_reference
        df = _read_csv_with_encodings(raw_path)

        # Convert frontend actions → rule-engine steps format
        normalized_actions = _convert_actions_to_steps(plan.proposed_actions)

        if not normalized_actions.get("steps"):
            cleaned_path = get_cleaned_data_path(
                dataset_id=version.dataset_id,
                version_id=version.id,
            )
            df.to_csv(str(cleaned_path), index=False)
            
            # Persist reference on version
            version.cleaned_reference = str(cleaned_path)
            session.add(version)
            session.commit()
            
            now_str = datetime.now(timezone.utc).isoformat()
            return {
                "success": True,
                "cleaned_path": str(cleaned_path),
                "rows_before": len(df),
                "rows_after": len(df),
                "steps_executed": 0,
                "started_at": now_str,
                "completed_at": now_str,
                "rows_dropped": 0,
                "cells_modified": 0,
                "changes": [],
            }

        # Execute cleaning
        result = execute_cleaning(df, normalized_actions)
        cleaned_df: pd.DataFrame = result["cleaned_df"]

        # Save cleaned CSV
        cleaned_path = get_cleaned_data_path(
            dataset_id=version.dataset_id,
            version_id=version.id,
        )
        cleaned_df.to_csv(str(cleaned_path), index=False)

        # Persist reference on version
        version.cleaned_reference = str(cleaned_path)
        session.add(version)
        session.commit()

        return {
            "success": True,
            "cleaned_path": str(cleaned_path),
            "rows_before": len(df),
            "rows_after": len(cleaned_df),
            **result["execution_summary"],
        }

    except ResourceNotFound as e:
        raise HTTPException(status_code=404, detail=e.message)

    except AuthorizationError as e:
        raise HTTPException(status_code=403, detail=e.message)

    except InvalidOperation as e:
        raise HTTPException(status_code=409, detail=e.message)

    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
