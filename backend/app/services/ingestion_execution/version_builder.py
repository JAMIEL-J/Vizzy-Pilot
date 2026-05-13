from typing import Optional
from uuid import UUID

from sqlmodel import Session

from app.models.dataset_version import SourceType, DatasetVersion
from app.services.dataset_version_service import create_dataset_version
from app.core.exceptions import InvalidOperation


def build_dataset_version(
    session: Session,
    dataset_id: UUID,
    source_type: SourceType,
    source_reference: str,
    schema_hash: str,
    created_by: UUID,
    row_count: Optional[int] = None,
    status: str = "ready",
    schema_metadata: Optional[str] = None,
) -> DatasetVersion:
    """
    Create a new immutable DatasetVersion from ingested metadata.

    This function is the bridge between ingestion and governance.
    """
    if not schema_hash:
        raise InvalidOperation(
            operation="build_dataset_version",
            reason="Schema hash is required to create dataset version",
        )

    if not source_reference:
        raise InvalidOperation(
            operation="build_dataset_version",
            reason="Source reference is required",
        )

    return create_dataset_version(
        session=session,
        dataset_id=dataset_id,
        source_type=source_type,
        source_reference=source_reference,
        schema_hash=schema_hash,
        created_by=created_by,
        row_count=row_count,
        status=status,
        schema_metadata=schema_metadata,
    )
