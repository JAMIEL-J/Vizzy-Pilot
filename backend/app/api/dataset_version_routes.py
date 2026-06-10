import logging
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.api.deps import DBSession, RateLimitedUser
from app.services import dataset_version_service
from app.models.dataset_version import SourceType
from app.core.exceptions import (
    ResourceNotFound,
    AuthorizationError,
    InvalidOperation,
    ValidationError,
)


router = APIRouter()


# =========================
# Request / Response Models
# =========================

class VersionCreateRequest(BaseModel):
    source_type: SourceType
    source_reference: str
    schema_hash: str
    row_count: Optional[int] = None


class MappingCorrectionRequest(BaseModel):
    column: str
    proposed_role: str
    corrected_role: str


class MappingConfirmRequest(BaseModel):
    mappings: Dict[str, str]
    corrections: Optional[List[MappingCorrectionRequest]] = None


class VersionResponse(BaseModel):
    id: UUID
    dataset_id: UUID
    version_number: int
    source_type: SourceType
    source_reference: str
    row_count: Optional[int]
    schema_hash: str
    created_by: UUID
    is_active: bool
    semantic_map_json: Optional[str] = None
    parent_version_id: Optional[UUID] = None

    class Config:
        from_attributes = True


class VersionListResponse(BaseModel):
    versions: List[VersionResponse]


# =========================
# Routes
# =========================

@router.post("", response_model=VersionResponse, status_code=status.HTTP_201_CREATED)
def create_version(
    dataset_id: UUID,
    request: VersionCreateRequest,
    session: DBSession,
    current_user: RateLimitedUser,
) -> VersionResponse:
    try:
        version = dataset_version_service.create_dataset_version(
            session=session,
            dataset_id=dataset_id,
            source_type=request.source_type,
            source_reference=request.source_reference,
            schema_hash=request.schema_hash,
            row_count=request.row_count,
            created_by=UUID(current_user.user_id),
            role=current_user.role,
        )
        return VersionResponse.model_validate(version)

    except ResourceNotFound as e:
        raise HTTPException(status_code=404, detail=e.message)

    except AuthorizationError as e:
        raise HTTPException(status_code=403, detail=e.message)

    except InvalidOperation as e:
        raise HTTPException(status_code=409, detail=e.message)


@router.get("", response_model=VersionListResponse)
def list_versions(
    dataset_id: UUID,
    session: DBSession,
    current_user: RateLimitedUser,
) -> VersionListResponse:
    try:
        versions = dataset_version_service.list_versions_for_dataset(
            session=session,
            dataset_id=dataset_id,
        )
        return VersionListResponse(
            versions=[VersionResponse.model_validate(v) for v in versions]
        )

    except AuthorizationError as e:
        raise HTTPException(status_code=403, detail=e.message)


@router.get("/latest", response_model=VersionResponse)
def get_latest_version(
    dataset_id: UUID,
    session: DBSession,
    current_user: RateLimitedUser,
) -> VersionResponse:
    try:
        version = dataset_version_service.get_latest_version(
            session=session,
            dataset_id=dataset_id,
        )
        return VersionResponse.model_validate(version)

    except ResourceNotFound as e:
        raise HTTPException(status_code=404, detail=e.message)

    except AuthorizationError as e:
        raise HTTPException(status_code=403, detail=e.message)


@router.get("/{version_id}", response_model=VersionResponse)
def get_version(
    version_id: UUID,
    session: DBSession,
    current_user: RateLimitedUser,
) -> VersionResponse:
    try:
        version = dataset_version_service.get_version_by_id(
            session=session,
            version_id=version_id,
        )
        return VersionResponse.model_validate(version)

    except ResourceNotFound as e:
        raise HTTPException(status_code=404, detail=e.message)

    except AuthorizationError as e:
        raise HTTPException(status_code=403, detail=e.message)


@router.post("/{version_id}/propose-mapping")
async def propose_mapping(
    dataset_id: UUID,
    version_id: UUID,
    session: DBSession,
    current_user: RateLimitedUser,
) -> Dict[str, Any]:
    try:
        return await dataset_version_service.propose_semantic_mapping(
            session=session,
            version_id=version_id,
        )
    except ResourceNotFound as e:
        raise HTTPException(status_code=404, detail=e.message)
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=e.message)
    except Exception as e:
        logger = logging.getLogger(__name__)
        logger.exception("Unhandled error in propose_mapping")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{version_id}/confirm-mapping")
def confirm_mapping(
    dataset_id: UUID,
    version_id: UUID,
    request: MappingConfirmRequest,
    session: DBSession,
    current_user: RateLimitedUser,
) -> VersionResponse:
    logger = logging.getLogger(__name__)
    logger.info(f"Confirming mapping for dataset={dataset_id}, version={version_id}")
    try:
        version = dataset_version_service.confirm_semantic_mapping(
            session=session,
            version_id=version_id,
            confirmed_map=request.mappings,
            corrections=[c.model_dump() for c in request.corrections] if request.corrections else None,
            approved_by=UUID(current_user.user_id),
        )
        return VersionResponse.model_validate(version)
    except ResourceNotFound as e:
        logger.warning(f"Resource not found during confirm_mapping: {e.message}")
        raise HTTPException(status_code=404, detail=e.message)
    except ValidationError as e:
        logger.warning(f"Validation error during confirm_mapping: {e.message}")
        raise HTTPException(status_code=422, detail=e.message)
    except Exception as e:
        logger.exception("Unhandled error in confirm_mapping")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{version_id}/remap")
def remap_mapping_preview(
    dataset_id: UUID,
    version_id: UUID,
    request: MappingConfirmRequest,
    session: DBSession,
    current_user: RateLimitedUser,
) -> Dict[str, Any]:
    """
    Preview impact of remapping before confirmation.
    """
    try:
        return dataset_version_service.preview_remap_impact(
            session=session,
            version_id=version_id,
            proposed_map=request.mappings,
            user_id=UUID(current_user.user_id),
        )
    except ResourceNotFound as e:
        raise HTTPException(status_code=404, detail=e.message)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{version_id}/remap/confirm")
def remap_mapping_confirm(
    dataset_id: UUID,
    version_id: UUID,
    request: MappingConfirmRequest,
    session: DBSession,
    current_user: RateLimitedUser,
) -> VersionResponse:
    """
    Confirm remap and create a new DatasetVersion.
    """
    try:
        version = dataset_version_service.remap_semantic_mapping(
            session=session,
            version_id=version_id,
            confirmed_map=request.mappings,
            approved_by=UUID(current_user.user_id),
        )
        return VersionResponse.model_validate(version)
    except ResourceNotFound as e:
        raise HTTPException(status_code=404, detail=e.message)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
