"""
MappingCorrection — Stores user corrections to LLM-proposed semantic mappings.
Used as few-shot examples in future proposals for the same dataset.
"""
from uuid import UUID
from typing import Optional

from sqlmodel import Field

from .base import BaseModel


class MappingCorrection(BaseModel, table=True):
    __tablename__ = "mapping_corrections"

    dataset_id: UUID = Field(nullable=False, index=True)
    version_id: UUID = Field(nullable=False)
    column_name: str = Field(nullable=False)
    proposed_role: str = Field(nullable=False)
    corrected_role: str = Field(nullable=False)
    column_dtype: Optional[str] = Field(default=None, nullable=True)
    corrected_by: UUID = Field(nullable=False)
