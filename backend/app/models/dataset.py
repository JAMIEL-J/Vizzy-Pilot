"""
Dataset database model.

Belongs to: models layer
Responsibility: Dataset data contract only
Restrictions: No business logic, no file handling, no API concerns
"""

from typing import Optional
from uuid import UUID

from sqlmodel import Field

from .base import BaseModel


class Dataset(BaseModel, table=True):
    """Dataset model - logical data asset owned by a user."""

    __tablename__ = "datasets"

    name: str = Field(nullable=False, max_length=255)
    description: Optional[str] = Field(default=None, nullable=True)
    owner_id: UUID = Field(nullable=False, index=True, foreign_key="users.id")
    is_active: bool = Field(default=True, nullable=False)
