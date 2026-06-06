"""
User database model.

Belongs to: models layer
Responsibility: User data contract only
Restrictions: No auth logic, no password hashing, no API concerns
"""

from enum import Enum
from typing import Optional

from sqlmodel import Field

from .base import BaseModel


class UserRole(str, Enum):
    """User role enum."""

    USER = "user"
    ADMIN = "admin"


class User(BaseModel, table=True):
    """User model - ownership root for datasets."""

    __tablename__ = "users"

    email: str = Field(
        unique=True,
        index=True,
        nullable=False,
        max_length=255,
    )
    name: Optional[str] = Field(default=None, max_length=120)
    hashed_password: str = Field(nullable=False)
    role: UserRole = Field(default=UserRole.USER, nullable=False)
    is_active: bool = Field(default=True, nullable=False)
    llm_settings: Optional[str] = Field(default=None, nullable=True)

