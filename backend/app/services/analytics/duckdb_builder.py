"""
DuckDB Builder Service.

Responsibility: Create and manage persistent DuckDB files for dashboard analytics
Async-compatible for background processing during upload
"""
import logging
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Dict, Any
from uuid import UUID
import duckdb

from app.core.storage import get_duckdb_path
from app.services.analytics.db_engine import DBEngine

logger = logging.getLogger(__name__)


def _get_duckdb_status_marker_paths(dataset_id: UUID, version_id: UUID) -> Dict[str, Path]:
    """Return marker file paths used to track asynchronous DuckDB build state."""
    # We must use local disk for markers even if S3 is used for DuckDB file
    from app.core.config import get_settings
    import os
    version_dir = Path(get_settings().storage.data_dir) / str(dataset_id) / str(version_id)
    os.makedirs(version_dir, exist_ok=True)
    return {
        "building": version_dir / ".duckdb_building",
        "failed": version_dir / ".duckdb_failed.json",
    }


def mark_duckdb_building(dataset_id: UUID, version_id: UUID) -> None:
    """Mark DuckDB build as in progress."""
    markers = _get_duckdb_status_marker_paths(dataset_id, version_id)
    markers["building"].touch(exist_ok=True)
    if markers["failed"].exists():
        markers["failed"].unlink()


def mark_duckdb_ready(dataset_id: UUID, version_id: UUID) -> None:
    """Mark DuckDB build as ready and clear transient error/build markers."""
    markers = _get_duckdb_status_marker_paths(dataset_id, version_id)
    if markers["building"].exists():
        markers["building"].unlink()
    if markers["failed"].exists():
        markers["failed"].unlink()


def mark_duckdb_failed(dataset_id: UUID, version_id: UUID, error: str) -> None:
    """Persist failed build state and error details for API polling."""
    markers = _get_duckdb_status_marker_paths(dataset_id, version_id)
    if markers["building"].exists():
        markers["building"].unlink()

    payload = {
        "status": "failed",
        "error": str(error),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    markers["failed"].write_text(json.dumps(payload), encoding="utf-8")


from app.services.storage import get_storage

def get_duckdb_build_status(dataset_id: UUID, version_id: UUID) -> Dict[str, Any]:
    """Return one of: building, ready, failed."""
    duckdb_path = get_duckdb_path(dataset_id, version_id)
    markers = _get_duckdb_status_marker_paths(dataset_id, version_id)

    if get_storage().exists(duckdb_path):
        return {"status": "ready", "error": None, "duckdb_path": str(duckdb_path)}

    if markers["failed"].exists():
        try:
            payload = json.loads(markers["failed"].read_text(encoding="utf-8"))
            return {
                "status": "failed",
                "error": payload.get("error", "DuckDB build failed"),
                "updated_at": payload.get("updated_at"),
                "duckdb_path": str(duckdb_path),
            }
        except Exception:
            return {
                "status": "failed",
                "error": "DuckDB build failed",
                "duckdb_path": str(duckdb_path),
            }

    # Treat unknown/no-marker + no-file as building to keep frontend polling simple.
    return {"status": "building", "error": None, "duckdb_path": str(duckdb_path)}


async def build_duckdb_from_csv(
    dataset_id: UUID,
    version_id: UUID,
    csv_path: str,
    table_name: str = "data",
    force_rebuild: bool = False
) -> Path:
    """
    Create a persistent DuckDB file from CSV data.

    This is the "PowerBI data model" equivalent - load once, query many times.

    Args:
        dataset_id: Dataset UUID
        version_id: Version UUID
        csv_path: Path to source CSV file
        force_rebuild: If True, rebuild even if file exists

    Returns:
        Path to created DuckDB file

    Usage:
        # During upload:
        duckdb_path = build_duckdb_from_csv(dataset_id, version_id, csv_path)

        # Dashboard & Chat both read from it:
        db = DBEngine(db_path=str(duckdb_path))
        db.load_csv("data", csv_path)  # Fast - DuckDB caches
    """
    duckdb_path = get_duckdb_path(dataset_id, version_id)

    # Check if already exists
    if get_storage().exists(duckdb_path) and not force_rebuild:
        logger.info(f"DuckDB file already exists: {duckdb_path}")
        mark_duckdb_ready(dataset_id, version_id)
        return duckdb_path

    logger.info(f"Building DuckDB file from {csv_path} → {duckdb_path}")

    try:
        mark_duckdb_building(dataset_id, version_id)

        # Create database engine pointing to persistent file
        db_engine = DBEngine(db_path=str(duckdb_path))

        from app.services.storage import get_storage
        local_csv_path = get_storage().download_to_temp(csv_path)

        try:
            # Load CSV into DuckDB (creates table + runs coercion pipeline)
            await db_engine.load_csv(table_name, local_csv_path, storage_key=csv_path)
        finally:
            get_storage().cleanup_temp(local_csv_path)
            # Close connection to finalize file
            db_engine.close()

        mark_duckdb_ready(dataset_id, version_id)

        file_size_mb = 0 / 1024 / 1024
        logger.info(f"✅ DuckDB file created: {duckdb_path} ({file_size_mb:.2f} MB)")

        return duckdb_path

    except Exception as e:
        logger.error(f"Failed to build DuckDB file: {e}")
        # Clean up partial file if it exists
        if get_storage().exists(duckdb_path):
            try:
                get_storage().delete(duckdb_path)
            except Exception as unlink_err:
                logger.warning(f"Failed to delete partial DuckDB file: {unlink_err}")
        mark_duckdb_failed(dataset_id, version_id, str(e))
        raise RuntimeError(f"DuckDB build failed: {e}")


async def get_or_build_duckdb(dataset_id: UUID, version_id: UUID, csv_path: str) -> Path:
    """
    Get existing DuckDB file, or build if missing.

    Idempotent - safe to call multiple times.
    """
    duckdb_path = get_duckdb_path(dataset_id, version_id)

    if get_storage().exists(duckdb_path):
        return duckdb_path

    return await build_duckdb_from_csv(dataset_id, version_id, csv_path)


def duckdb_exists(dataset_id: UUID, version_id: UUID) -> bool:
    """Check if DuckDB file exists for this version."""
    from app.services.storage import get_storage
    return get_storage().exists(get_duckdb_path(dataset_id, version_id))


async def add_table_to_duckdb(
    dataset_id: UUID,
    version_id: UUID,
    csv_path: str,
    table_name: str,
) -> Path:
    """Add a new table to an existing DuckDB file.

    If the DuckDB file doesn't exist, creates it with the table.
    If it exists, appends the table (replaces if same name exists).
    """
    duckdb_path = get_duckdb_path(dataset_id, version_id)

    logger.info(f"Adding table '{table_name}' from {csv_path} → {duckdb_path}")

    try:
        mark_duckdb_building(dataset_id, version_id)

        from app.services.storage import get_storage
        local_csv_path = get_storage().download_to_temp(csv_path)

        try:
            db_engine = DBEngine(db_path=str(duckdb_path))
            await db_engine.load_csv(table_name, local_csv_path, storage_key=csv_path)
            db_engine.close()
        finally:
            get_storage().cleanup_temp(local_csv_path)

        mark_duckdb_ready(dataset_id, version_id)

        file_size_mb = 0 / 1024 / 1024
        logger.info(f"✅ Table '{table_name}' added to DuckDB ({file_size_mb:.2f} MB total)")

        return duckdb_path

    except Exception as e:
        logger.error(f"Failed to add table '{table_name}' to DuckDB: {e}")
        mark_duckdb_failed(dataset_id, version_id, str(e))
        raise RuntimeError(f"DuckDB table add failed: {e}")
