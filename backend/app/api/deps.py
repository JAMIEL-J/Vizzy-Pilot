from typing import Annotated, Generator, Optional
from uuid import UUID

from fastapi import Depends, Header, Query
from sqlmodel import Session, select

from app.core.security import (
    CurrentUser,
    UserRole,
    get_current_user,
    get_current_user_from_header_or_query,
    require_role,
    verify_resource_ownership,
)
from app.core.rate_limit import check_rate_limit
from app.models.database import engine
from app.models.dataset import Dataset
from app.models.dataset_version import DatasetVersion
from app.core.exceptions import ResourceNotFound

# ... (rest of the file)


def get_db() -> Generator[Session, None, None]:
    """Provide a database session."""
    with Session(engine) as session:
        yield session


DBSession = Annotated[Session, Depends(get_db)]


AuthenticatedUser = Annotated[
    CurrentUser,
    Depends(get_current_user),
]


AuthenticatedUserHeaderOrQuery = Annotated[
    CurrentUser,
    Depends(get_current_user_from_header_or_query),
]


RateLimitedUser = Annotated[
    CurrentUser,
    Depends(check_rate_limit),
]


AdminUser = Annotated[
    CurrentUser,
    Depends(require_role(UserRole.ADMIN)),
]


async def verify_dataset_owner(
    dataset_id: UUID,
    session: DBSession,
    current_user: AuthenticatedUser,
) -> Dataset:
    """
    Dependency to verify that the current user owns the requested dataset.
    Returns the Dataset object if ownership is verified.
    """
    dataset = session.get(Dataset, dataset_id)
    if not dataset:
        raise ResourceNotFound("Dataset", str(dataset_id))
    
    verify_resource_ownership(
        resource_owner_id=str(dataset.owner_id),
        current_user=current_user
    )
    
    return dataset


async def verify_dataset_version_owner(
    version_id: UUID,
    session: DBSession,
    current_user: AuthenticatedUser,
) -> DatasetVersion:
    """
    Dependency to verify that the current user owns the dataset associated with a version.
    Returns the DatasetVersion object if ownership is verified.
    """
    version = session.get(DatasetVersion, version_id)
    if not version:
        raise ResourceNotFound("DatasetVersion", str(version_id))
    
    # Verify ownership of the parent dataset
    await verify_dataset_owner(
        dataset_id=version.dataset_id,
        session=session,
        current_user=current_user
    )
    
    return version


DatasetOwner = Annotated[
    Dataset,
    Depends(verify_dataset_owner),
]

DatasetVersionOwner = Annotated[
    DatasetVersion,
    Depends(verify_dataset_version_owner),
]
