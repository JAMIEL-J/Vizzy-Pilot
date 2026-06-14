"""
DatasetTable database model.

Belongs to: models layer
Responsibility: Per-table metadata within a DatasetVersion (multi-table support)
Restrictions: No business logic, no file handling, no API concerns
"""

from typing import Optional
from uuid import UUID

from sqlmodel import Field

from .base import BaseModel


class DatasetTable(BaseModel, table=True):
    """Represents a single table within a dataset version.

    A DatasetVersion can contain multiple tables (CSVs).
    Each table is loaded into the shared DuckDB file under its own name.
    """

    __tablename__ = "dataset_tables"

    version_id: UUID = Field(nullable=False, index=True)
    table_name: str = Field(nullable=False, max_length=255)
    original_filename: str = Field(nullable=False, max_length=255)
    source_reference: str = Field(nullable=False)
    row_count: Optional[int] = Field(default=None)
    schema_metadata: Optional[str] = Field(default=None, nullable=True)
    is_primary: bool = Field(default=True, nullable=False)
    display_order: int = Field(default=0, nullable=False)
