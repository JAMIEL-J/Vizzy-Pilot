"""
DatasetTable service.

CRUD operations for DatasetTable entities within a DatasetVersion.
"""

from typing import List, Optional
from uuid import UUID

from sqlmodel import Session, select

from app.models.dataset_table import DatasetTable
from app.models.dataset_version import DatasetVersion
from app.core.exceptions import ResourceNotFound
from app.core.logger import get_logger

logger = get_logger(__name__)


def create_dataset_table(
    session: Session,
    version_id: UUID,
    table_name: str,
    original_filename: str,
    source_reference: str,
    row_count: Optional[int] = None,
    schema_metadata: Optional[str] = None,
    is_primary: bool = True,
    display_order: int = 0,
) -> DatasetTable:
    """Create a new DatasetTable entry for a version."""
    table = DatasetTable(
        version_id=version_id,
        table_name=table_name,
        original_filename=original_filename,
        source_reference=source_reference,
        row_count=row_count,
        schema_metadata=schema_metadata,
        is_primary=is_primary,
        display_order=display_order,
    )
    session.add(table)
    session.commit()
    session.refresh(table)
    return table


def list_tables_for_version(
    session: Session,
    version_id: UUID,
) -> List[DatasetTable]:
    """List all tables for a dataset version, ordered by display_order."""
    statement = (
        select(DatasetTable)
        .where(DatasetTable.version_id == version_id)
        .order_by(DatasetTable.display_order)
    )
    return list(session.exec(statement).all())


def get_primary_table(
    session: Session,
    version_id: UUID,
) -> Optional[DatasetTable]:
    """Get the primary table for a version (first uploaded table)."""
    statement = (
        select(DatasetTable)
        .where(
            DatasetTable.version_id == version_id,
            DatasetTable.is_primary == True,
        )
        .limit(1)
    )
    return session.exec(statement).first()


def get_table_count(
    session: Session,
    version_id: UUID,
) -> int:
    """Count tables in a version."""
    from sqlmodel import func
    result = session.exec(
        select(func.count(DatasetTable.id)).where(
            DatasetTable.version_id == version_id
        )
    ).first()
    return result or 0


def get_active_table_name(
    session: Session,
    version_id: UUID,
) -> str:
    """Resolve the active table/view name for analytics queries.

    Priority:
    1. active_join_view on DatasetVersion (if join view exists)
    2. Primary DatasetTable.table_name (if DatasetTable rows exist)
    3. DatasetVersion.duckdb_table_name (legacy fallback)
    4. "data" (final fallback)
    """
    version = session.get(DatasetVersion, version_id)
    if not version:
        return "data"

    # 1. Join view takes priority
    if version.active_join_view:
        return version.active_join_view

    # 2. Primary DatasetTable
    primary = get_primary_table(session, version_id)
    if primary:
        return primary.table_name

    # 3. Legacy field
    if version.duckdb_table_name:
        return version.duckdb_table_name

    # 4. Final fallback
    return "data"
