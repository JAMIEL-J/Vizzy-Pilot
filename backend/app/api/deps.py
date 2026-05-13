from typing import Annotated, Generator

from fastapi import Depends
from sqlmodel import Session

from app.core.security import (
    CurrentUser,
    UserRole,
    get_current_user,
    get_current_user_from_header_or_query,
    require_role,
)
from app.core.rate_limit import check_rate_limit
from app.models.database import engine


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
