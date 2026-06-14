from datetime import datetime
from typing import List, Optional
from uuid import UUID
import os
import json

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.api.deps import DBSession, RateLimitedUser
from app.services import dataset_service
from app.services.dataset_version_service import get_latest_version
from app.services.analytics.duckdb_builder import get_duckdb_build_status
from app.core.exceptions import (
    ResourceNotFound,
    AuthorizationError,
    InvalidOperation,
)
from app.core.audit import record_audit_event


router = APIRouter()


class DatasetCreateRequest(BaseModel):
    name: str
    description: Optional[str] = None


class DatasetResponse(BaseModel):
    id: UUID
    name: str
    description: Optional[str]
    owner_id: UUID
    is_active: bool
    created_at: datetime
    updated_at: datetime
    current_version_id: Optional[UUID] = None

    class Config:
        from_attributes = True


class DatasetListResponse(BaseModel):
    datasets: List[DatasetResponse]


class DuckDBStatusResponse(BaseModel):
    dataset_id: UUID
    version_id: UUID
    status: str
    ready: bool
    error: Optional[str] = None
    duckdb_path: Optional[str] = None


@router.post("", response_model=DatasetResponse, status_code=status.HTTP_201_CREATED)
def create_dataset(
    request: DatasetCreateRequest,
    session: DBSession,
    current_user: RateLimitedUser,
) -> DatasetResponse:
    try:
        owner_uuid = UUID(current_user.user_id)
        dataset = dataset_service.create_dataset(
            session=session,
            name=request.name,
            owner_id=owner_uuid,
            description=request.description,
        )
        return DatasetResponse.model_validate(dataset)
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication context: user id is not a valid UUID",
        )
    except InvalidOperation as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=e.message,
        )


@router.get("", response_model=DatasetListResponse)
def list_datasets(
    session: DBSession,
    current_user: RateLimitedUser,
) -> DatasetListResponse:
    datasets = dataset_service.list_datasets_with_details(
        session=session,
        user_id=UUID(current_user.user_id),
        role=current_user.role,
    )
    return DatasetListResponse(
        datasets=[DatasetResponse.model_validate(d) for d in datasets]
    )


@router.get("/{dataset_id}", response_model=DatasetResponse)
def get_dataset(
    dataset_id: UUID,
    session: DBSession,
    current_user: RateLimitedUser,
) -> DatasetResponse:
    try:
        dataset = dataset_service.get_dataset_details(
            session=session,
            dataset_id=dataset_id,
            user_id=UUID(current_user.user_id),
            role=current_user.role,
        )
        record_audit_event(
            event_type="DATASET_ACCESSED",
            user_id=str(current_user.user_id),
            resource_type="Dataset",
            resource_id=str(dataset_id),
            metadata={"action": "view_details", "dataset_name": dataset.get("name")},
        )
        return DatasetResponse.model_validate(dataset)
    except ResourceNotFound as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=e.message,
        )
    except AuthorizationError as e:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=e.message,
        )


@router.delete("/{dataset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_dataset(
    dataset_id: UUID,
    session: DBSession,
    current_user: RateLimitedUser,
) -> None:
    try:
        dataset_service.deactivate_dataset(
            session=session,
            dataset_id=dataset_id,
            user_id=UUID(current_user.user_id),
            role=current_user.role,
        )
    except ResourceNotFound as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=e.message,
        )
    except AuthorizationError as e:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=e.message,
        )
    except InvalidOperation as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=e.message,
        )


@router.get("/{dataset_id}/duckdb-status", response_model=DuckDBStatusResponse)
def get_dataset_duckdb_status(
    dataset_id: UUID,
    session: DBSession,
    current_user: RateLimitedUser,
) -> DuckDBStatusResponse:
    """Return DuckDB build status for latest active version of a dataset."""
    try:
        # Reuse existing dataset detail check to enforce ownership/access rules.
        dataset_service.get_dataset_details(
            session=session,
            dataset_id=dataset_id,
            user_id=UUID(current_user.user_id),
            role=current_user.role,
        )

        latest_version = get_latest_version(session=session, dataset_id=dataset_id)
        build_status = get_duckdb_build_status(dataset_id=dataset_id, version_id=latest_version.id)

        return DuckDBStatusResponse(
            dataset_id=dataset_id,
            version_id=latest_version.id,
            status=build_status.get("status", "building"),
            ready=build_status.get("status") == "ready",
            error=build_status.get("error"),
            duckdb_path=build_status.get("duckdb_path"),
        )
    except ResourceNotFound as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=e.message,
        )
    except AuthorizationError as e:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=e.message,
        )


class DatasetMetadataResponse(BaseModel):
    dataset_id: UUID
    version_id: UUID
    column_count: int
    columns: List[str]
    raw_size: int
    cleaned_size: Optional[int] = None


@router.get("/{dataset_id}/metadata", response_model=DatasetMetadataResponse)
def get_dataset_metadata(
    dataset_id: UUID,
    session: DBSession,
    current_user: RateLimitedUser,
) -> DatasetMetadataResponse:
    """Return column details and size metrics for latest version of a dataset."""
    try:
        # Enforce access checks
        dataset = dataset_service.get_dataset_details(
            session=session,
            dataset_id=dataset_id,
            user_id=UUID(current_user.user_id),
            role=current_user.role,
        )
        record_audit_event(
            event_type="DATASET_ACCESSED",
            user_id=str(current_user.user_id),
            resource_type="Dataset",
            resource_id=str(dataset_id),
            metadata={"action": "view_metadata", "dataset_name": dataset.get("name")},
        )

        latest_version = get_latest_version(session=session, dataset_id=dataset_id)
        
        raw_size = 0
        cleaned_size = None
        
        if latest_version.source_reference and os.path.exists(latest_version.source_reference):
            raw_size = os.path.getsize(latest_version.source_reference)
            
        if latest_version.cleaned_reference and os.path.exists(latest_version.cleaned_reference):
            cleaned_size = os.path.getsize(latest_version.cleaned_reference)
            
        columns = []
        if latest_version.schema_metadata:
            try:
                schema_cols = json.loads(latest_version.schema_metadata)
                columns = [col.get("name") for col in schema_cols if col.get("name")]
            except Exception:
                pass
                
        return DatasetMetadataResponse(
            dataset_id=dataset_id,
            version_id=latest_version.id,
            column_count=len(columns),
            columns=columns,
            raw_size=raw_size,
            cleaned_size=cleaned_size,
        )
    except ResourceNotFound as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=e.message,
        )
    except AuthorizationError as e:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=e.message,
        )
