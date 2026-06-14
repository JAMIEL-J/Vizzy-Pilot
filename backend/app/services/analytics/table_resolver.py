"""
Table Name Resolver.

Single-responsibility utility to determine which DuckDB table/view
to query for analytics operations.

Centralizes the resolution logic so all analytics modules use
the same priority chain.
"""

from typing import Optional
from uuid import UUID

from sqlmodel import Session

from app.core.logger import get_logger

logger = get_logger(__name__)


def resolve_table_name(
    version_id: UUID,
    session: Session,
) -> str:
    """Determine which DuckDB table/view to query.

    Priority:
    1. version.active_join_view (if a join view exists)
    2. Primary DatasetTable.table_name (if DatasetTable rows exist)
    3. version.duckdb_table_name (legacy fallback)
    4. "data" (final fallback)
    """
    from app.models.dataset_version import DatasetVersion
    from app.services.dataset_table_service import get_primary_table

    version = session.get(DatasetVersion, version_id)
    if not version:
        logger.warning(f"Version {version_id} not found, falling back to 'data'")
        return "data"

    # 1. Join view takes priority
    if version.active_join_view:
        logger.debug(f"Using join view '{version.active_join_view}' for version {version_id}")
        return version.active_join_view

    # 2. Primary DatasetTable
    try:
        primary = get_primary_table(session, version_id)
        if primary:
            logger.debug(f"Using primary table '{primary.table_name}' for version {version_id}")
            return primary.table_name
    except Exception as e:
        logger.debug(f"DatasetTable lookup failed (may not exist yet): {e}")

    # 3. Legacy field
    if version.duckdb_table_name:
        return version.duckdb_table_name

    # 4. Final fallback
    return "data"


def resolve_table_name_from_version(version) -> str:
    """Lightweight resolver when you already have the version object.

    Does NOT query DatasetTable (avoids extra DB hit).
    Use this in hot paths where session access is expensive.

    Priority:
    1. version.active_join_view
    2. version.duckdb_table_name
    3. "data"
    """
    if version and version.active_join_view:
        return version.active_join_view
    if version and version.duckdb_table_name:
        return version.duckdb_table_name
    return "data"
