from uuid import UUID

from fastapi import APIRouter, HTTPException, status

from app.api.deps import DBSession, RateLimitedUser
from app.services import inspection_service
from app.models.inspection_report import RiskLevel
from app.core.exceptions import (
    ResourceNotFound,
    AuthorizationError,
    InvalidOperation,
)


router = APIRouter()


# =========================
# Response Models
# =========================

from pydantic import BaseModel
from typing import Dict, Any


class InspectionResponse(BaseModel):
    id: UUID
    dataset_version_id: UUID
    issues_detected: Dict[str, Any]
    risk_level: RiskLevel
    summary: str
    generated_by: str
    is_active: bool

    class Config:
        from_attributes = True


# =========================
# Routes
# =========================

@router.post(
    "",
    response_model=InspectionResponse,
    status_code=status.HTTP_201_CREATED,
)
def run_inspection(
    version_id: UUID,
    session: DBSession,
    current_user: RateLimitedUser,
) -> InspectionResponse:
    """
    Trigger inspection for a dataset version.
    Inspection is system-generated and immutable.
    """
    try:
        report = inspection_service.run_inspection(
            session=session,
            dataset_version_id=version_id,
            user_id=UUID(current_user.user_id),
            role=current_user.role,
        )
        return InspectionResponse.model_validate(report)

    except ResourceNotFound as e:
        raise HTTPException(status_code=404, detail=e.message)

    except AuthorizationError as e:
        raise HTTPException(status_code=403, detail=e.message)

    except InvalidOperation as e:
        detail = e.message
        if e.details:
            detail = f"{detail}: {e.details}"
        raise HTTPException(status_code=409, detail=detail)


@router.get(
    "",
    response_model=InspectionResponse,
)
def get_inspection_report(
    version_id: UUID,
    session: DBSession,
    current_user: RateLimitedUser,
) -> InspectionResponse:
    """Fetch inspection report for a dataset version."""
    try:
        report = inspection_service.get_inspection_report_for_version(
            session=session,
            dataset_version_id=version_id,
            user_id=UUID(current_user.user_id),
            role=current_user.role,
        )
        if report is None:
            raise HTTPException(status_code=404, detail="Inspection report not found for this dataset version")
        return InspectionResponse.model_validate(report)

    except ResourceNotFound as e:
        raise HTTPException(status_code=404, detail=e.message)

    except AuthorizationError as e:
        raise HTTPException(status_code=403, detail=e.message)
