from enum import Enum
from typing import Optional
from uuid import UUID
from datetime import datetime

from sqlmodel import Field

from .base import BaseModel


class SourceType(str, Enum):
    UPLOAD = "upload"
    SQL = "sql"
    CLEAN = "clean"


class DatasetVersion(BaseModel, table=True):
    __tablename__ = "dataset_versions"

    dataset_id: UUID = Field(nullable=False, index=True)
    version_number: int = Field(nullable=False)

    source_type: SourceType = Field(nullable=False)

    # RAW DATA location (csv saved on disk)
    source_reference: str = Field(nullable=False)

    # Build status for async ingestion pipeline
    status: Optional[str] = Field(default="ready", nullable=False)

    # CLEANED DATA location (csv saved on disk)
    cleaned_reference: Optional[str] = Field(default=None, nullable=True)

    row_count: Optional[int] = Field(default=None)
    schema_hash: str = Field(nullable=False)

    # Lightweight schema metadata for UI preview
    schema_metadata: Optional[str] = Field(default=None, nullable=True, sa_column_kwargs={"name": "schema_json"})

    # Versioning + approval metadata
    parent_version_id: Optional[UUID] = Field(default=None, nullable=True, index=True)
    change_type: Optional[str] = Field(default=None, nullable=True)
    approved_by: Optional[UUID] = Field(default=None, nullable=True)
    approved_at: Optional[datetime] = Field(default=None, nullable=True)

    # Cached chart configs for remap diffs / dashboard load
    chart_configs_json: Optional[str] = Field(default=None, nullable=True)

    # The validated mapping of semantic roles to actual columns
    # Format: {"revenue": "Tot_Rev", "date": "Date"}
    semantic_map_json: Optional[str] = Field(default=None, nullable=True)

    created_by: UUID = Field(nullable=False)
    is_active: bool = Field(default=True)
