"""
Chart customization model.

Stores per-user chart overrides for a given dataset version.
"""

from typing import Optional
from uuid import UUID

from sqlmodel import Field, Column, JSON

from .base import BaseModel


class ChartCustomization(BaseModel, table=True):
    __tablename__ = "chart_customizations"

    dataset_version_id: UUID = Field(nullable=False, index=True)
    chart_id: str = Field(nullable=False, index=True)
    user_id: UUID = Field(nullable=False, index=True)

    customizations_json: dict = Field(default_factory=dict, sa_column=Column(JSON))
