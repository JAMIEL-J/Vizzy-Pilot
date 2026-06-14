"""
Saved dashboard routes.

Belongs to: API layer
Responsibility: CRUD operations for saved dashboards
Restrictions: Thin controller - all logic delegated to service
"""

from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.api.deps import DBSession, AuthenticatedUser
from app.models.saved_dashboard import SavedDashboard
from app.core.exceptions import ResourceNotFound, AuthorizationError
from app.core.audit import record_audit_event
from sqlmodel import select, col


router = APIRouter()


# =============================================================================
# Request/Response Schemas
# =============================================================================


class SaveDashboardRequest(BaseModel):
    """Request to save a dashboard."""
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(default=None, max_length=1000)
    dataset_id: Optional[UUID] = None
    dataset_version_id: Optional[UUID] = None
    config: dict = Field(default_factory=dict)
    is_public: bool = False


class UpdateDashboardRequest(BaseModel):
    """Request to update a dashboard."""
    name: Optional[str] = Field(default=None, max_length=255)
    description: Optional[str] = Field(default=None, max_length=1000)
    config: Optional[dict] = None
    is_public: Optional[bool] = None


class DashboardResponse(BaseModel):
    """Response for a saved dashboard."""
    id: UUID
    user_id: UUID
    name: str
    description: Optional[str] = None
    dataset_id: Optional[UUID] = None
    dataset_version_id: Optional[UUID] = None
    config: dict
    is_public: bool

    class Config:
        from_attributes = True


class DashboardListResponse(BaseModel):
    """Response for listing dashboards."""
    dashboards: List[DashboardResponse]
    total: int


# =============================================================================
# Routes
# =============================================================================


@router.post(
    "/dashboards",
    response_model=DashboardResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Save a dashboard",
)
def save_dashboard(
    request: SaveDashboardRequest,
    session: DBSession,
    current_user: AuthenticatedUser,
) -> DashboardResponse:
    """
    Save a dashboard configuration.
    
    The config should contain the full dashboard spec including widgets.
    """
    dashboard = SavedDashboard(
        user_id=UUID(current_user.user_id),
        name=request.name,
        description=request.description,
        dataset_id=request.dataset_id,
        dataset_version_id=request.dataset_version_id,
        config=request.config,
        is_public=request.is_public,
    )

    session.add(dashboard)
    session.commit()
    session.refresh(dashboard)

    record_audit_event(
        event_type="DASHBOARD_SAVED",
        user_id=current_user.user_id,
        resource_type="SavedDashboard",
        resource_id=str(dashboard.id),
    )

    return DashboardResponse.model_validate(dashboard)


@router.get(
    "/dashboards",
    response_model=DashboardListResponse,
    summary="List saved dashboards",
)
def list_dashboards(
    session: DBSession,
    current_user: AuthenticatedUser,
    include_public: bool = True,
    limit: int = 50,
) -> DashboardListResponse:
    """
    List user's saved dashboards.
    
    Optionally include public dashboards from other users.
    """
    # User's own dashboards
    query = select(SavedDashboard).where(
        SavedDashboard.user_id == UUID(current_user.user_id)
    )

    if include_public:
        # Also include public dashboards
        query = select(SavedDashboard).where(
            (SavedDashboard.user_id == UUID(current_user.user_id)) |
            (SavedDashboard.is_public == True)
        )

    query = query.order_by(col(SavedDashboard.updated_at).desc()).limit(limit)
    dashboards = list(session.exec(query).all())

    return DashboardListResponse(
        dashboards=[DashboardResponse.model_validate(d) for d in dashboards],
        total=len(dashboards),
    )


@router.get(
    "/dashboards/{dashboard_id}",
    response_model=DashboardResponse,
    summary="Get a saved dashboard",
)
def get_dashboard(
    dashboard_id: UUID,
    session: DBSession,
    current_user: AuthenticatedUser,
) -> DashboardResponse:
    """
    Get a specific saved dashboard.
    """
    dashboard = session.get(SavedDashboard, dashboard_id)

    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")

    # Check access
    if dashboard.user_id != UUID(current_user.user_id) and not dashboard.is_public:
        raise HTTPException(status_code=403, detail="Access denied")

    if dashboard.dataset_id:
        record_audit_event(
            event_type="DATASET_ACCESSED",
            user_id=str(current_user.user_id),
            resource_type="Dataset",
            resource_id=str(dashboard.dataset_id),
            metadata={"action": "load_dashboard", "dashboard_id": str(dashboard.id), "dashboard_name": dashboard.name},
        )

    return DashboardResponse.model_validate(dashboard)


@router.patch(
    "/dashboards/{dashboard_id}",
    response_model=DashboardResponse,
    summary="Update a saved dashboard",
)
def update_dashboard(
    dashboard_id: UUID,
    request: UpdateDashboardRequest,
    session: DBSession,
    current_user: AuthenticatedUser,
) -> DashboardResponse:
    """
    Update a saved dashboard.
    """
    dashboard = session.get(SavedDashboard, dashboard_id)

    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")

    if dashboard.user_id != UUID(current_user.user_id):
        raise HTTPException(status_code=403, detail="Access denied")

    # Update fields
    if request.name is not None:
        dashboard.name = request.name
    if request.description is not None:
        dashboard.description = request.description
    if request.config is not None:
        dashboard.config = request.config
    if request.is_public is not None:
        dashboard.is_public = request.is_public

    session.add(dashboard)
    session.commit()
    session.refresh(dashboard)

    return DashboardResponse.model_validate(dashboard)


@router.delete(
    "/dashboards/{dashboard_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a saved dashboard",
)
def delete_dashboard(
    dashboard_id: UUID,
    session: DBSession,
    current_user: AuthenticatedUser,
) -> None:
    """
    Delete a saved dashboard.
    """
    dashboard = session.get(SavedDashboard, dashboard_id)

    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")

    if dashboard.user_id != UUID(current_user.user_id):
        raise HTTPException(status_code=403, detail="Access denied")

    session.delete(dashboard)
    session.commit()

    record_audit_event(
        event_type="DASHBOARD_DELETED",
        user_id=current_user.user_id,
        resource_type="SavedDashboard",
        resource_id=str(dashboard_id),
    )
