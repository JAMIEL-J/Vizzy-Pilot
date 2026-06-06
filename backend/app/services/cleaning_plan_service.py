from datetime import datetime, timezone
from typing import Any, Dict
from uuid import UUID

from sqlmodel import Session, select

from app.models.cleaning_plan import CleaningPlan
from app.models.dataset import Dataset
from app.models.dataset_version import DatasetVersion
from app.models.user import UserRole
from app.core.exceptions import (
    InvalidOperation,
    ResourceNotFound,
    AuthorizationError,
)
from app.core.audit import record_audit_event


def _assert_version_access(
    session: Session,
    version: DatasetVersion,
    user_id: UUID,
    role: UserRole,
) -> None:
    """Ensure user has access to the dataset version."""
    if role == UserRole.ADMIN:
        return

    dataset = session.get(Dataset, version.dataset_id)

    if not dataset or dataset.owner_id != user_id:
        raise AuthorizationError(
            message="Access denied",
            details="You do not have access to this dataset version",
        )


def create_cleaning_plan(
    session: Session,
    dataset_version_id: UUID,
    proposed_actions: Dict[str, Any],
    user_id: UUID,
    role: UserRole,
) -> CleaningPlan:
    """
    Create a cleaning plan for a dataset version.
    Only one active plan per version is allowed.
    """
    version = session.get(DatasetVersion, dataset_version_id)
    if not version or not version.is_active:
        raise ResourceNotFound("DatasetVersion", str(dataset_version_id))

    _assert_version_access(session, version, user_id, role)

    existing = session.exec(
        select(CleaningPlan).where(
            CleaningPlan.dataset_version_id == dataset_version_id,
            CleaningPlan.is_active == True,
        )
    ).first()

    if existing:
        # Soft-deactivate the existing plan to allow creating a new one with new selections
        existing.is_active = False
        session.add(existing)

    plan = CleaningPlan(
        dataset_version_id=dataset_version_id,
        proposed_actions=proposed_actions,
        approved=False,
        approved_by=None,
        approved_at=None,
        is_active=True,
    )

    session.add(plan)
    session.commit()
    session.refresh(plan)

    record_audit_event(
        event_type="CLEANING_PLAN_CREATED",
        user_id=str(user_id),
        resource_type="CleaningPlan",
        resource_id=str(plan.id),
        metadata={"dataset_version_id": str(dataset_version_id)},
    )

    return plan


def approve_cleaning_plan(
    session: Session,
    plan_id: UUID,
    user_id: UUID,
    role: UserRole,
) -> CleaningPlan:
    """
    Approve a cleaning plan.
    Approval is irreversible.
    """
    plan = session.get(CleaningPlan, plan_id)
    if not plan or not plan.is_active:
        raise ResourceNotFound("CleaningPlan", str(plan_id))

    if plan.approved:
        raise InvalidOperation(
            operation="approve_cleaning_plan",
            reason="Cleaning plan is already approved",
        )

    version = session.get(DatasetVersion, plan.dataset_version_id)
    if not version or not version.is_active:
        raise ResourceNotFound("DatasetVersion", str(plan.dataset_version_id))

    _assert_version_access(session, version, user_id, role)

    plan.approved = True
    plan.approved_by = user_id
    plan.approved_at = datetime.now(timezone.utc)

    session.add(plan)
    session.commit()
    session.refresh(plan)

    record_audit_event(
        event_type="CLEANING_PLAN_APPROVED",
        user_id=str(user_id),
        resource_type="CleaningPlan",
        resource_id=str(plan.id),
        metadata={"dataset_version_id": str(plan.dataset_version_id)},
    )

    return plan


def get_cleaning_plan_for_version(
    session: Session,
    dataset_version_id: UUID,
    user_id: UUID,
    role: UserRole,
) -> CleaningPlan:
    """Get the active cleaning plan for a dataset version."""
    version = session.get(DatasetVersion, dataset_version_id)
    if not version or not version.is_active:
        raise ResourceNotFound("DatasetVersion", str(dataset_version_id))

    _assert_version_access(session, version, user_id, role)

    plan = session.exec(
        select(CleaningPlan).where(
            CleaningPlan.dataset_version_id == dataset_version_id,
            CleaningPlan.is_active == True,
        )
    ).first()

    if not plan:
        raise ResourceNotFound(
            "CleaningPlan",
            f"dataset_version_id={dataset_version_id}",
        )

    return plan


def get_plan_by_id(session: Session, plan_id: UUID) -> CleaningPlan:
    """Get a cleaning plan by its ID."""
    plan = session.get(CleaningPlan, plan_id)
    if not plan or not plan.is_active:
        raise ResourceNotFound("CleaningPlan", str(plan_id))
    return plan
