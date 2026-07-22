from typing import Any, Dict, List
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.api.deps import DBSession, RateLimitedUser
from app.services import analysis_service
from app.core.exceptions import (
    ResourceNotFound,
    AuthorizationError,
    InvalidOperation,
)


router = APIRouter()


# =========================
# Request / Response Models
# =========================

class AnalysisRunRequest(BaseModel):
    """
    Request to execute an analysis under a specific contract.
    """
    analysis_contract_id: UUID
    parameters: Dict[str, Any]


class AnalysisResultResponse(BaseModel):
    id: UUID
    dataset_version_id: UUID
    analysis_contract_id: UUID
    result_payload: Dict[str, Any]
    generated_by: UUID
    is_active: bool

    class Config:
        from_attributes = True


class AnalysisResultListResponse(BaseModel):
    results: List[AnalysisResultResponse]


# =========================
# Routes
# =========================

@router.post(
    "",
    response_model=AnalysisResultResponse,
    status_code=status.HTTP_201_CREATED,
)
def run_analysis(
    version_id: UUID,
    request: AnalysisRunRequest,
    session: DBSession,
    current_user: RateLimitedUser,
) -> AnalysisResultResponse:
    """
    Execute analysis for a dataset version under an active analysis contract.
    """
    try:
        result = analysis_service.create_analysis_result(
            session=session,
            dataset_version_id=version_id,
            analysis_contract_id=request.analysis_contract_id,
            result_payload=request.parameters,
            user_id=UUID(current_user.user_id),
            role=current_user.role,
        )
        return AnalysisResultResponse.model_validate(result)

    except ResourceNotFound as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=e.message)

    except AuthorizationError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=e.message)

    except InvalidOperation as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=e.message)


@router.get(
    "",
    response_model=AnalysisResultListResponse,
)
def list_analysis_results(
    version_id: UUID,
    session: DBSession,
    current_user: RateLimitedUser,
) -> AnalysisResultListResponse:
    """
    List all analysis results for a dataset version.
    """
    try:
        results = analysis_service.list_results_for_version(
            session=session,
            dataset_version_id=version_id,
            user_id=UUID(current_user.user_id),
            role=current_user.role,
        )
        return AnalysisResultListResponse(
            results=[AnalysisResultResponse.model_validate(r) for r in results]
        )

    except ResourceNotFound as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=e.message)

    except AuthorizationError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=e.message)


@router.get(
    "/{result_id}",
    response_model=AnalysisResultResponse,
)
def get_analysis_result(
    result_id: UUID,
    session: DBSession,
    current_user: RateLimitedUser,
) -> AnalysisResultResponse:
    """
    Fetch a specific analysis result by ID.
    """
    try:
        result = analysis_service.get_result_by_id(
            session=session,
            result_id=result_id,
            user_id=UUID(current_user.user_id),
            role=current_user.role,
        )
        return AnalysisResultResponse.model_validate(result)

    except ResourceNotFound as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=e.message)

    except AuthorizationError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=e.message)


class NLQueryRequest(BaseModel):
    query: str


@router.post(
    "/nl-analysis",
    status_code=status.HTTP_200_OK,
)
def run_nl_analysis(
    version_id: UUID,
    request: NLQueryRequest,
    session: DBSession,
    current_user: RateLimitedUser,
):
    """
    Run natural language analysis on a dataset version.
    """
    from app.services.analysis_orchestrator import run_analysis_orchestration

    try:
        result = run_analysis_orchestration(
            session=session,
            dataset_version_id=version_id,
            user_id=UUID(current_user.user_id),
            role=current_user.role,
            query=request.query,
        )
        return result

    except ResourceNotFound as e:
        raise HTTPException(status_code=404, detail=e.message)

    except InvalidOperation as e:
        raise HTTPException(status_code=400, detail=e.message)
