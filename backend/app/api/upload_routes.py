from uuid import UUID
import json

from fastapi import APIRouter, UploadFile, File, HTTPException, status, BackgroundTasks

from app.api.deps import DBSession, RateLimitedUser
from app.services.ingestion_service import ingest_file_upload
from app.services.analytics.duckdb_builder import (
    build_duckdb_from_csv,
    mark_duckdb_building,
    mark_duckdb_failed,
    get_duckdb_build_status,
)
from app.services.dataset_version_service import get_latest_version
from app.core.exceptions import InvalidOperation, ResourceNotFound, AuthorizationError
from app.core.logger import get_logger


router = APIRouter()
logger = get_logger(__name__)


def _build_duckdb_background(dataset_id: UUID, version_id: UUID, csv_path: str):
    """Background task to build DuckDB file asynchronously."""
    import asyncio
    async def run_build():
        try:
            logger.info(f"[Background] Building DuckDB for dataset={dataset_id}, version={version_id}")
            await build_duckdb_from_csv(dataset_id, version_id, csv_path)
            _update_version_status(version_id, "ready")
            logger.info(f"[Background] DuckDB built successfully")
        except Exception as e:
            mark_duckdb_failed(dataset_id, version_id, str(e))
            _update_version_status(version_id, "error")
            logger.error(f"[Background] DuckDB build failed: {e}", exc_info=True)

    asyncio.run(run_build())



def _update_version_status(version_id: UUID, status: str) -> None:
    """Best-effort status update for DatasetVersion without reusing request session."""
    try:
        from app.models.database import get_session
        from app.services.dataset_version_service import get_version_by_id

        session_gen = get_session()
        session = next(session_gen)
        try:
            version = get_version_by_id(session=session, version_id=version_id)
            version.status = status
            session.add(version)
            session.commit()
        finally:
            session_gen.close()
    except Exception as e:
        logger.warning(f"Failed to update version status to '{status}': {e}")


@router.post(
    "/datasets/{dataset_id}/upload",
    status_code=status.HTTP_201_CREATED,
)
async def upload_dataset_file(
    dataset_id: UUID,
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = None,
    session: DBSession = None,
    current_user: RateLimitedUser = None,
):
    """
    Upload raw dataset file and create a new dataset version.

    - Validates file extension and size
    - Infers schema
    - Stores raw data
    - Creates immutable dataset version
    - **Builds DuckDB file in background** for PowerBI-like analytics

    Note: Current implementation reads file into memory for schema inference.
    Phase 1 migration will shift to stream-to-disk + lightweight schema extraction.
    """
    logger.info(f"Upload started: dataset_id={dataset_id}, filename={file.filename}, content_type={file.content_type}")
    
    try:
        # Stream file to ingestion service (avoid full memory load)
        try:
            file.file.seek(0, 2)
            file_size = file.file.tell()
            file.file.seek(0)
        except Exception:
            file_size = None

        if file_size == 0:
            raise InvalidOperation(
                operation="file_upload",
                reason="Empty file received",
                details="The uploaded file has 0 bytes. Please ensure the file is not empty.",
            )

        file_stream = file.file
        
        logger.info("Starting ingestion...")
        result = ingest_file_upload(
            session=session,
            dataset_id=dataset_id,
            user_id=UUID(current_user.user_id),
            role=current_user.role,
            file_stream=file_stream,
            filename=file.filename,
            file_size=file_size,
        )
        logger.info(f"Upload complete: version_id={result.get('version_id')}")

        # Build DuckDB file in background (doesn't block response)
        version_id = result.get('version_id')
        if version_id:
            # ingestion_service returns raw_path for uploaded CSV storage location
            csv_path = result.get('raw_path') or result.get('file_path') or result.get('source_reference')
            if csv_path and background_tasks:
                # Mark immediately so frontend can poll deterministic status right after upload.
                mark_duckdb_building(dataset_id, UUID(version_id))
                background_tasks.add_task(
                    _build_duckdb_background,
                    dataset_id=dataset_id,
                    version_id=UUID(version_id),
                    csv_path=csv_path
                )
                logger.info(f"Scheduled DuckDB build in background for version {version_id}")
            else:
                logger.warning(
                    "Skipped DuckDB background build scheduling: "
                    f"version_id={version_id}, csv_path_present={bool(csv_path)}, "
                    f"background_tasks_present={background_tasks is not None}"
                )

        return result

    except ResourceNotFound as e:
        logger.error(f"Resource not found: {e.message}")
        raise HTTPException(status_code=404, detail=e.message)

    except AuthorizationError as e:
        logger.error(f"Authorization error: {e.message}")
        raise HTTPException(status_code=403, detail=e.message)

    except InvalidOperation as e:
        logger.error(
            "Invalid operation: %s - %s (details=%s)",
            e.message,
            e.reason,
            e.details,
        )
        detail_payload = {"detail": e.message, "reason": e.reason}
        if e.details:
            detail_payload["details"] = e.details
        raise HTTPException(status_code=400, detail=detail_payload)
    
    except Exception as e:
        logger.exception(f"Unexpected error during upload: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@router.get(
    "/datasets/{dataset_id}/status",
    status_code=status.HTTP_200_OK,
)
def get_dataset_status(
    dataset_id: UUID,
    session: DBSession,
    current_user: RateLimitedUser,
):

    """
    Return dataset ingestion status for the latest version.

    Expected states: converting | ready | error
    Uses DuckDB build markers to infer readiness.
    """
    try:
        # Ensure access
        from app.services import dataset_service
        dataset_service.get_dataset_details(
            session=session,
            dataset_id=dataset_id,
            user_id=UUID(current_user.user_id),
            role=current_user.role,
        )

        latest_version = get_latest_version(session=session, dataset_id=dataset_id)
        build_status = get_duckdb_build_status(dataset_id=dataset_id, version_id=latest_version.id)

        status_map = {
            "ready": "ready",
            "building": "converting",
            "failed": "error",
        }

        mapped_status = status_map.get(build_status.get("status", "building"), "converting")

        return {
            "dataset_id": str(dataset_id),
            "version_id": str(latest_version.id),
            "status": mapped_status,
            "progress_pct": 0 if mapped_status != "ready" else 100,
            "error": build_status.get("error"),
            "schema": json.loads(latest_version.schema_metadata) if latest_version.schema_metadata else None,
            "row_count": latest_version.row_count,
        }
    except ResourceNotFound as e:
        logger.error(f"Resource not found: {e.message}")
        raise HTTPException(status_code=404, detail=e.message)
    except AuthorizationError as e:
        logger.error(f"Authorization error: {e.message}")
        raise HTTPException(status_code=403, detail=e.message)
