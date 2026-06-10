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
async def execute_cleaning_plan(
    version_id: UUID,
    plan_id: UUID,
    session: DBSession,
    current_user: RateLimitedUser,
) -> Dict[str, Any]:
    """
    Execute an approved cleaning plan.
    Loads raw data, applies cleaning rules, saves cleaned CSV,
    creates a new DatasetVersion with source_type = "clean",
    and sets parent_version_id to the input version.
    """
    try:
        import uuid
        from app.models.dataset_version import SourceType
        from app.services.analytics.duckdb_builder import build_duckdb_from_csv
        from app.services.dataset_version_service import _get_next_version_number

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

        # Generate new version ID
        new_version_id = uuid.uuid4()
        new_version_number = _get_next_version_number(session, version.dataset_id)

        # Save cleaned CSV in new version folder
        cleaned_path = get_cleaned_data_path(
            dataset_id=version.dataset_id,
            version_id=new_version_id,
        )

        if not normalized_actions.get("steps"):
            df.to_csv(str(cleaned_path), index=False)
            rows_after = len(df)
            summary = {
                "steps_executed": 0,
                "rows_dropped": 0,
                "cells_modified": 0,
                "changes": [],
            }
        else:
            # Execute cleaning
            result = execute_cleaning(df, normalized_actions)
            cleaned_df: pd.DataFrame = result["cleaned_df"]
            cleaned_df.to_csv(str(cleaned_path), index=False)
            rows_after = len(cleaned_df)
            summary = result["execution_summary"]

        # Create new dataset version
        new_version = DatasetVersion(
            id=new_version_id,
            dataset_id=version.dataset_id,
            version_number=new_version_number,
            source_type=SourceType.CLEAN,
            source_reference=version.source_reference,
            cleaned_reference=str(cleaned_path),
            row_count=rows_after,
            schema_hash=version.schema_hash,
            schema_metadata=version.schema_metadata,
            semantic_map_json=version.semantic_map_json,
            parent_version_id=version.id,
            change_type="clean",
            created_by=UUID(current_user.user_id),
            is_active=True,
            status="ready",
            approved_by=UUID(current_user.user_id),
            approved_at=datetime.now(timezone.utc),
            chart_configs_json=version.chart_configs_json,
        )

        # Build DuckDB for the new cleaned version
        await build_duckdb_from_csv(
            dataset_id=new_version.dataset_id,
            version_id=new_version.id,
            csv_path=str(cleaned_path),
            force_rebuild=True
        )

        session.add(new_version)
        session.commit()
        session.refresh(new_version)

        now_str = datetime.now(timezone.utc).isoformat()
        return {
            "success": True,
            "version_id": str(new_version.id),
            "cleaned_path": str(cleaned_path),
            "rows_before": len(df),
            "rows_after": rows_after,
            "started_at": summary.get("started_at", now_str),
            "completed_at": summary.get("completed_at", now_str),
            **{k: v for k, v in summary.items() if k not in ("started_at", "completed_at")},
        }

    except ResourceNotFound as e:
        raise HTTPException(status_code=404, detail=e.message)

    except AuthorizationError as e:
        raise HTTPException(status_code=403, detail=e.message)

    except InvalidOperation as e:
        raise HTTPException(status_code=409, detail=e.message)

    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
