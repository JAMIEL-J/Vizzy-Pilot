"""
Download and export routes.

Belongs to: API layer
Responsibility: File downloads and data exports
Restrictions: Thin controller - delegates to services
"""

from datetime import datetime
from pathlib import Path
from typing import List
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import FileResponse, StreamingResponse
import pandas as pd
from pydantic import BaseModel

from app.api.deps import DBSession, AuthenticatedUser
from app.core.storage import get_cleaned_data_path, get_raw_data_path
from app.core.exceptions import ResourceNotFound, AuthorizationError
from app.services import dataset_version_service, dataset_service
from app.core.audit import record_audit_event
from app.services.audit_service import get_user_audit_events


router = APIRouter()


class DownloadHistoryItem(BaseModel):
    """Schema for download history logs."""
    dataset_id: str
    dataset_name: str
    version_id: str
    version_number: int
    download_type: str
    timestamp: datetime


@router.get(
    "/datasets/downloads/history",
    response_model=List[DownloadHistoryItem],
    summary="Get user's download history",
)
def get_download_history(
    current_user: AuthenticatedUser,
) -> List[DownloadHistoryItem]:
    """
    Get the audit event log of dataset downloads for the current user.
    """
    events = get_user_audit_events(UUID(current_user.user_id))
    download_events = [
        e for e in events
        if e.get("event_type") == "DATASET_DOWNLOADED"
    ]
    
    history = []
    for e in download_events:
        metadata = e.get("metadata") or {}
        history.append(
            DownloadHistoryItem(
                dataset_id=e.get("resource_id") or "",
                dataset_name=metadata.get("dataset_name", "Unknown Dataset"),
                version_id=metadata.get("version_id", ""),
                version_number=metadata.get("version_number", 1),
                download_type=metadata.get("download_type", "raw"),
                timestamp=e.get("timestamp"),
            )
        )
    return history



@router.get(
    "/datasets/{dataset_id}/versions/{version_id}/download/raw",
    summary="Download raw dataset",
    response_class=FileResponse,
)
def download_raw_dataset(
    dataset_id: UUID,
    version_id: UUID,
    session: DBSession,
    current_user: AuthenticatedUser,
) -> FileResponse:
    """
    Download the original uploaded dataset as CSV.
    """
    # Validate ownership
    try:
        dataset = dataset_service.get_dataset_by_id(
            session=session,
            dataset_id=dataset_id,
            user_id=UUID(current_user.user_id),
            role=current_user.role,
        )
        version = dataset_version_service.get_version_by_id(
            session=session,
            version_id=version_id,
        )
        if version.dataset_id != dataset.id:
            raise HTTPException(status_code=404, detail="Version does not belong to dataset")
    except (ResourceNotFound, AuthorizationError) as e:
        raise HTTPException(status_code=404, detail=str(e))

    # Get file path
    if not version.source_reference or version.source_reference == "PENDING":
        raise HTTPException(status_code=404, detail="Raw data file not ready")

    file_path = Path(version.source_reference)

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Raw data file not found")

    record_audit_event(
        event_type="DATASET_DOWNLOADED",
        user_id=str(current_user.user_id),
        resource_type="Dataset",
        resource_id=str(dataset.id),
        metadata={
            "dataset_name": dataset.name,
            "version_id": str(version.id),
            "version_number": version.version_number,
            "download_type": "raw",
        },
    )

    return FileResponse(
        path=str(file_path),
        filename=f"raw_data_{version_id}.csv",
        media_type="text/csv",
    )



@router.get(
    "/datasets/{dataset_id}/versions/{version_id}/download/cleaned",
    summary="Download cleaned dataset",
    response_class=FileResponse,
)
def download_cleaned_dataset(
    dataset_id: UUID,
    version_id: UUID,
    session: DBSession,
    current_user: AuthenticatedUser,
) -> FileResponse:
    """
    Download the cleaned dataset as CSV.
    
    The cleaned dataset includes all transformations from the cleaning plan.
    """
    # Validate ownership
    try:
        dataset = dataset_service.get_dataset_by_id(
            session=session,
            dataset_id=dataset_id,
            user_id=UUID(current_user.user_id),
            role=current_user.role,
        )
        version = dataset_version_service.get_version_by_id(
            session=session,
            version_id=version_id,
        )
        if version.dataset_id != dataset.id:
            raise HTTPException(status_code=404, detail="Version does not belong to dataset")
    except (ResourceNotFound, AuthorizationError) as e:
        raise HTTPException(status_code=404, detail=str(e))

    if not version.cleaned_reference:
        raise HTTPException(status_code=400, detail="Dataset has not been cleaned yet")

    # Get file path
    file_path = Path(version.cleaned_reference)

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Cleaned data file not found")

    record_audit_event(
        event_type="DATASET_DOWNLOADED",
        user_id=str(current_user.user_id),
        resource_type="Dataset",
        resource_id=str(dataset.id),
        metadata={
            "dataset_name": dataset.name,
            "version_id": str(version.id),
            "version_number": version.version_number,
            "download_type": "cleaned",
        },
    )

    return FileResponse(
        path=str(file_path),
        filename=f"cleaned_data_{version_id}.csv",
        media_type="text/csv",
    )


@router.get(
    "/datasets/{dataset_id}/download/raw",
    summary="Download latest raw dataset",
    response_class=FileResponse,
)
def download_latest_raw_dataset(
    dataset_id: UUID,
    session: DBSession,
    current_user: AuthenticatedUser,
) -> FileResponse:
    """
    Download the original uploaded dataset for the latest version as CSV.
    """
    # Validate ownership
    try:
        dataset = dataset_service.get_dataset_by_id(
            session=session,
            dataset_id=dataset_id,
            user_id=UUID(current_user.user_id),
            role=current_user.role,
        )
        version = dataset_version_service.get_latest_version(
            session=session,
            dataset_id=dataset.id,
        )
    except (ResourceNotFound, AuthorizationError) as e:
        raise HTTPException(status_code=404, detail=str(e))

    # Get file path
    if not version.source_reference or version.source_reference == "PENDING":
        raise HTTPException(status_code=404, detail="Raw data file not ready")

    file_path = Path(version.source_reference)

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Raw data file not found")

    record_audit_event(
        event_type="DATASET_DOWNLOADED",
        user_id=str(current_user.user_id),
        resource_type="Dataset",
        resource_id=str(dataset.id),
        metadata={
            "dataset_name": dataset.name,
            "version_id": str(version.id),
            "version_number": version.version_number,
            "download_type": "raw",
        },
    )

    return FileResponse(
        path=str(file_path),
        filename=f"raw_data_latest.csv",
        media_type="text/csv",
    )


@router.get(
    "/datasets/{dataset_id}/download/cleaned",
    summary="Download latest cleaned dataset",
    response_class=FileResponse,
)
def download_latest_cleaned_dataset(
    dataset_id: UUID,
    session: DBSession,
    current_user: AuthenticatedUser,
) -> FileResponse:
    """
    Download the latest cleaned dataset as CSV.
    """
    # Validate ownership
    try:
        dataset = dataset_service.get_dataset_by_id(
            session=session,
            dataset_id=dataset_id,
            user_id=UUID(current_user.user_id),
            role=current_user.role,
        )
        version = dataset_version_service.get_latest_version(
            session=session,
            dataset_id=dataset.id,
        )
    except (ResourceNotFound, AuthorizationError) as e:
        raise HTTPException(status_code=404, detail=str(e))

    if not version.cleaned_reference:
        raise HTTPException(status_code=400, detail="Dataset has not been cleaned yet")

    # Get file path
    file_path = Path(version.cleaned_reference)

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Cleaned data file not found")

    record_audit_event(
        event_type="DATASET_DOWNLOADED",
        user_id=str(current_user.user_id),
        resource_type="Dataset",
        resource_id=str(dataset.id),
        metadata={
            "dataset_name": dataset.name,
            "version_id": str(version.id),
            "version_number": version.version_number,
            "download_type": "cleaned",
        },
    )

    return FileResponse(
        path=str(file_path),
        filename=f"cleaned_data_latest.csv",
        media_type="text/csv",
    )
