from typing import List, Optional
from uuid import UUID

from sqlmodel import Session, select, func,desc
from app.models.dataset_version import DatasetVersion

from app.models.dataset import Dataset
from app.models.user import UserRole
from app.core.exceptions import (
    InvalidOperation,
    ResourceNotFound,
    AuthorizationError,
)
from app.core.audit import record_audit_event


def _assert_dataset_access(
    dataset: Dataset,
    user_id: UUID,
    role: UserRole,
) -> None:
    """
    Ensure the user has access to the dataset.
    Owners and admins are allowed.
    """
    if role == UserRole.ADMIN:
        return

    if dataset.owner_id != user_id:
        raise AuthorizationError(
            message="Access denied",
            details="You do not have access to this dataset",
        )


def create_dataset(
    session: Session,
    name: str,
    owner_id: UUID,
    description: Optional[str] = None,
) -> Dataset:
    """
    Create a new dataset owned by a user.
    Dataset names must be unique per owner.
    """
    existing = session.exec(
        select(Dataset).where(
            Dataset.owner_id == owner_id,
            Dataset.name == name,
            Dataset.is_active == True,
        )
    ).first()

    if existing:
        raise InvalidOperation(
            operation="create_dataset",
            reason="Dataset with this name already exists for this user",
        )

    dataset = Dataset(
        name=name,
        description=description,
        owner_id=owner_id,
        is_active=True,
    )

    session.add(dataset)
    session.commit()
    session.refresh(dataset)

    record_audit_event(
        event_type="DATASET_CREATED",
        user_id=str(owner_id),
        resource_type="Dataset",
        resource_id=str(dataset.id),
        metadata={"name": name},
    )

    return dataset


def get_dataset_by_id(
    session: Session,
    dataset_id: UUID,
    user_id: UUID,
    role: UserRole,
) -> Dataset:
    """
    Fetch a dataset by ID with access control.
    """
    dataset = session.get(Dataset, dataset_id)

    if not dataset or not dataset.is_active:
        raise ResourceNotFound("Dataset", str(dataset_id))

    _assert_dataset_access(dataset, user_id, role)

    return dataset


def list_datasets_for_user(
    session: Session,
    user_id: UUID,
    role: UserRole,
) -> List[Dataset]:
    """
    List datasets visible to the user.
    Admins see all active datasets.
    """
    if role == UserRole.ADMIN:
        statement = select(Dataset).where(Dataset.is_active == True)
    else:
        statement = select(Dataset).where(
            Dataset.owner_id == user_id,
            Dataset.is_active == True,
        )

    return list(session.exec(statement).all())


def list_datasets_with_details(
    session: Session,
    user_id: UUID,
    role: UserRole,
) -> List[dict]:
    """
    List datasets with extra details (current_version_id).
    """
    datasets = list_datasets_for_user(session, user_id, role)
    if not datasets:
        return []

    dataset_ids = [d.id for d in datasets]

    # Fetch max version_number for each dataset
    subquery = (
        select(
            DatasetVersion.dataset_id,
            func.max(DatasetVersion.version_number).label("max_version")
        )
        .where(DatasetVersion.dataset_id.in_(dataset_ids))
        .group_by(DatasetVersion.dataset_id)
        .subquery()
    )

    # Fetch the actual latest DatasetVersion objects
    latest_versions = session.exec(
        select(DatasetVersion)
        .join(
            subquery,
            (DatasetVersion.dataset_id == subquery.c.dataset_id) &
            (DatasetVersion.version_number == subquery.c.max_version)
        )
    ).all()

    version_map = {v.dataset_id: v.id for v in latest_versions}

    results = []
    for d in datasets:
        d_dict = d.model_dump()
        d_dict['current_version_id'] = version_map.get(d.id)
        results.append(d_dict)
    return results


def get_dataset_details(
    session: Session,
    dataset_id: UUID,
    user_id: UUID,
    role: UserRole,
) -> dict:
    """
    Get dataset with extra details.
    """
    dataset = get_dataset_by_id(session, dataset_id, user_id, role)
    
    latest_version = session.exec(
        select(DatasetVersion)
        .where(DatasetVersion.dataset_id == dataset.id)
        .order_by(desc(DatasetVersion.version_number))
    ).first()

    d_dict = dataset.model_dump()
    d_dict['current_version_id'] = latest_version.id if latest_version else None
    return d_dict


def deactivate_dataset(
    session: Session,
    dataset_id: UUID,
    user_id: UUID,
    role: UserRole,
) -> Dataset:
    """
    Deactivate (soft delete) a dataset.
    """
    dataset = session.get(Dataset, dataset_id)

    if not dataset:
        raise ResourceNotFound("Dataset", str(dataset_id))

    _assert_dataset_access(dataset, user_id, role)

    if not dataset.is_active:
        raise InvalidOperation(
            operation="deactivate_dataset",
            reason="Dataset is already inactive",
        )

    dataset.is_active = False
    session.add(dataset)
    session.commit()
    session.refresh(dataset)

    record_audit_event(
        event_type="DATASET_DEACTIVATED",
        user_id=str(user_id),
        resource_type="Dataset",
        resource_id=str(dataset.id),
    )


def check_dataset_access(
    session: Session,
    dataset_id: UUID,
    user_id: UUID,
    role: UserRole = UserRole.USER,
) -> bool:
    """
    Check if a user has access to a dataset.
    Returns True if access is allowed, False otherwise.
    """
    try:
        get_dataset_by_id(session, dataset_id, user_id, role)
        return True
    except (ResourceNotFound, AuthorizationError):
        return False
