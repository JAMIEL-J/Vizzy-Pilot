from uuid import UUID
import json
import re
import os
import sys
import importlib.util

# Windows libmagic DLL lookup support
if os.name == 'nt':
    spec = importlib.util.find_spec('magic')
    if spec:
        magic_dir = os.path.dirname(spec.origin)
        libmagic_dir = os.path.join(magic_dir, 'libmagic')
        if os.path.exists(libmagic_dir):
            os.environ['PATH'] = libmagic_dir + os.pathsep + os.environ.get('PATH', '')
            if hasattr(os, 'add_dll_directory'):
                try:
                    os.add_dll_directory(libmagic_dir)
                except Exception:
                    pass

import magic

from fastapi import APIRouter, UploadFile, File, HTTPException, status, BackgroundTasks

from app.api.deps import DBSession, RateLimitedUser
from app.services.ingestion_service import ingest_file_upload, generate_initial_dashboard
from app.services.analytics.duckdb_builder import (
    build_duckdb_from_csv,
    mark_duckdb_building,
    mark_duckdb_failed,
    get_duckdb_build_status,
)
from app.services.dataset_version_service import get_latest_version
from app.core.exceptions import InvalidOperation, ResourceNotFound, AuthorizationError
from app.core.logger import get_logger
from app.core.config import get_settings


router = APIRouter()
logger = get_logger(__name__)

# --- File upload security constants ---

ALLOWED_EXTENSIONS = {".csv", ".tsv", ".txt", ".json", ".parquet", ".xlsx", ".xls"}
ALLOWED_CONTENT_TYPES = {
    "text/csv",
    "text/tab-separated-values",
    "text/plain",
    "application/json",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "application/octet-stream",  # Some clients send this for binary files
}

# Magic bytes for common file types (first bytes)
FILE_SIGNATURES = {
    b"PK\x03\x04": "zip-based",      # xlsx, docx, etc.
    b"%PDF": "pdf",
    b"\xd0\xcf\x11\xe0": "ole",      # old xls format
    b"RIFF": "wav",                  # not CSV but harmless
}

MAX_FILENAME_LENGTH = 255


def _sanitize_filename(filename: str) -> str:
    """Sanitize filename to prevent path traversal and dangerous names."""
    if not filename:
        return "uploaded_file"
    # Remove path separators
    filename = re.sub(r"[/\\]|\x00", "", filename)
    # Remove potentially dangerous characters
    filename = re.sub(r'[<>:"|?*]', "", filename)
    # Limit length
    filename = filename[:MAX_FILENAME_LENGTH]
    if not filename or filename.startswith("."):
        filename = "uploaded_file"
    return filename


def _validate_file_security(file: UploadFile, max_size_mb: int) -> None:
    """
    Validate file extension, content-type, size, and magic bytes.
    Raises HTTPException if validation fails.
    """
    settings = get_settings()
    
    # 1. Validate filename
    safe_name = _sanitize_filename(file.filename or "")
    if safe_name != (file.filename or ""):
        logger.warning(f"Filename sanitized: '{file.filename}' -> '{safe_name}'")
        file.filename = safe_name
    
    # 2. Validate file extension
    ext = ""
    if "." in (file.filename or ""):
        ext = "." + (file.filename or "").rsplit(".", 1)[-1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type not allowed. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )
    
    # 3. Validate content-type (advisory - don't block if client misreports)
    content_type = file.content_type or ""
    if content_type and content_type not in ALLOWED_CONTENT_TYPES:
        logger.warning(
            f"Unexpected content-type '{content_type}' for file '{file.filename}'. "
            "Proceeding with upload but may fail during processing."
        )
    
    # 4. Inspect magic bytes for signature check
    try:
        # Read the first 2048 bytes for magic check
        chunk = file.file.read(2048)
        file.file.seek(0)
        
        detected_mime = magic.from_buffer(chunk, mime=True)
        
        # Reject executable signatures
        if chunk.startswith(b"MZ") or chunk.startswith(b"\x7fELF") or detected_mime in {
            "application/x-dosexec",
            "application/x-executable",
            "application/x-sharedlib",
            "application/x-msdownload",
        } or "executable" in detected_mime:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Malicious executable file signature detected.",
            )
            
        # Reject binary signatures for text-based extensions
        if ext in {".csv", ".tsv", ".txt", ".json"}:
            if not (detected_mime.startswith("text/") or detected_mime in {"application/json", "application/csv"}):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Binary file signature detected. Expected a text-based format, but detected mime type was {detected_mime}.",
                )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error validating file signature: {e}")
    
    # 5. Validate file size
    if max_size_mb > 0:
        try:
            file.file.seek(0, 2)
            size = file.file.tell()
            file.file.seek(0)
            max_bytes = max_size_mb * 1024 * 1024
            if size > max_bytes:
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail=f"File too large. Maximum size: {max_size_mb}MB",
                )
        except HTTPException:
            raise
        except Exception:
            pass  # Size check is best-effort


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
    
    # Security: validate file type, extension, and size
    settings = get_settings()
    _validate_file_security(file, settings.storage.max_file_size_mb)
    
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
        
        # Generate initial dashboard with auto semantic mapping (Zero-Input First Render)
        version_id = result.get('version_id')
        dashboard_data = None
        if version_id:
            csv_path = result.get('raw_path') or result.get('file_path') or result.get('source_reference')
            if csv_path:
                try:
                    dashboard_data = await generate_initial_dashboard(
                        session=session,
                        dataset_id=dataset_id,
                        version_id=UUID(version_id),
                        user_id=UUID(current_user.user_id),
                        schema=result.get('schema', []),
                        raw_path=csv_path,
                    )
                    logger.info(f"Initial dashboard generated for version {version_id}")
                except Exception as e:
                    logger.warning(f"Failed to generate initial dashboard: {e}")
        
        # Build DuckDB file in background (doesn't block response)
        if version_id:
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
        
        # Include dashboard in response
        if dashboard_data:
            result["dashboard"] = dashboard_data.get("dashboard")
            result["semantic_map"] = dashboard_data.get("semantic_map")
        
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
