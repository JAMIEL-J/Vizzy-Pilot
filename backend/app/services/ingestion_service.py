"""
Ingestion service module.

Orchestrates file and SQL ingestion with proper validation,
schema inference, and transactional safety.
"""

from pathlib import Path
from typing import Any, BinaryIO, Dict, Optional
from uuid import UUID

import json
from sqlmodel import Session

from app.core.config import get_settings
from app.core.exceptions import InvalidOperation, ResourceNotFound
from app.core.storage import get_raw_data_path
from app.core.audit import record_audit_event
from app.models.dataset import Dataset
from app.models.dataset_version import DatasetVersion, SourceType
from app.models.user import UserRole
from app.services.ingestion_execution.file_loader import load_from_upload, load_csv_sample, validate_file
from app.services.ingestion_execution.file_loader import _validate_file_extension, _validate_file_size
from app.services.ingestion_execution.schema_inference import infer_schema
from app.services.dataset_version_service import create_dataset_version


def ingest_file_upload(
    *,
    session: Session,
    dataset_id: UUID,
    user_id: UUID,
    role: UserRole,
    file_stream: BinaryIO,
    filename: str,
    file_size: Optional[int],
) -> Dict[str, Any]:
    """
    Ingest a file upload with proper validation and transactional safety.

    Steps:
    1. Validate dataset ownership
    2. Validate file (extension, size)
    3. Load DataFrame
    4. Infer schema
    5. Save raw file
    6. Create dataset version
    7. Record audit event

    Raises:
        ResourceNotFound: if dataset doesn't exist
        AuthorizationError: if user doesn't own dataset
        InvalidOperation: if validation fails
    """
    # 1. Validate dataset ownership
    dataset = session.get(Dataset, dataset_id)
    if not dataset or not dataset.is_active:
        raise ResourceNotFound("Dataset", str(dataset_id))

    if role != UserRole.ADMIN and dataset.owner_id != user_id:
        raise InvalidOperation(
            operation="ingest_file",
            reason="You do not own this dataset",
        )

    # 2. Validate file extension and size
    ext = _validate_file_extension(filename)
    if file_size is not None:
        _validate_file_size(file_size)

    # 3. Lightweight CSV ingestion path (no full-file load)
    if ext == "csv":
        try:
            try:
                file_stream.seek(0)
            except Exception:
                pass

            sample_df = load_csv_sample(file_stream, nrows=5)
            schema = infer_schema(sample_df)

            try:
                file_stream.seek(0)
            except Exception:
                pass

            version = create_dataset_version(
                session=session,
                dataset_id=dataset_id,
                source_type=SourceType.UPLOAD,
                source_reference="PENDING",
                schema_hash=schema["schema_hash"],
                created_by=user_id,
                role=role,
                row_count=None,
                status="converting",
                schema_metadata=json.dumps(schema.get("columns", [])),
            )

            raw_path = get_raw_data_path(dataset_id, version.id)
            max_size_bytes = get_settings().storage.max_file_size_mb * 1024 * 1024
            _stream_to_path(file_stream, raw_path, max_size_bytes=max_size_bytes)

            row_count = _count_csv_rows(raw_path)

            version.source_reference = str(raw_path)
            version.row_count = row_count
            version.status = "converting"
            session.add(version)
            session.commit()
            session.refresh(version)

            df = None
        except Exception as e:
            if "version" in locals():
                version.is_active = False
                session.add(version)
                session.commit()
            raise InvalidOperation(
                operation="ingest_file",
                reason="Failed to ingest CSV file",
                details=str(e),
            )
    else:
        # 3b. Legacy ingestion for non-CSV formats (full load)
        validate_file(filename=filename, file_size=file_size or 0)

        df = load_from_upload(
            file_stream=file_stream,
            filename=filename,
            file_size=file_size or 0,
        )

        schema = infer_schema(df)

        version = create_dataset_version(
            session=session,
            dataset_id=dataset_id,
            source_type=SourceType.UPLOAD,
            source_reference="PENDING",
            schema_hash=schema["schema_hash"],
            created_by=user_id,
            role=role,
            row_count=len(df),
            status="converting",
            schema_metadata=json.dumps(schema.get("columns", [])),
        )

        try:
            raw_path = get_raw_data_path(dataset_id, version.id)
            df.to_csv(raw_path, index=False)

            version.source_reference = str(raw_path)
            version.status = "converting"
            session.add(version)
            session.commit()
            session.refresh(version)

        except Exception as e:
            version.is_active = False
            session.add(version)
            session.commit()
            raise InvalidOperation(
                operation="ingest_file",
                reason="Failed to save file to storage",
                details=str(e),
            )

    # 8. Audit
    record_audit_event(
        event_type="FILE_INGESTED",
        user_id=str(user_id),
        resource_type="DatasetVersion",
        resource_id=str(version.id),
        metadata={
            "dataset_id": str(dataset_id),
            "filename": filename,
            "row_count": version.row_count,
        },
    )

    return {
        "dataset_id": str(dataset_id),
        "version_id": str(version.id),
        "version_number": version.version_number,
        "row_count": version.row_count,
        "schema_hash": schema["schema_hash"],
        "raw_path": str(raw_path),
        "schema": schema.get("columns", []),
    }


def ingest_sql_query(
    *,
    session: Session,
    dataset_id: UUID,
    user_id: UUID,
    role: UserRole,
    query: str,
    external_engine: Optional[Any] = None,
) -> Dict[str, Any]:
    """
    Ingest data from SQL query with validation and transactional safety.

    Steps:
    1. Validate dataset ownership
    2. Validate and execute query
    3. Infer schema
    4. Save as CSV
    5. Create dataset version
    6. Record audit event
    """
    from app.services.ingestion_execution.db_connector import load_from_database

    # 1. Validate dataset ownership
    dataset = session.get(Dataset, dataset_id)
    if not dataset or not dataset.is_active:
        raise ResourceNotFound("Dataset", str(dataset_id))

    if role != UserRole.ADMIN and dataset.owner_id != user_id:
        raise InvalidOperation(
            operation="ingest_sql",
            reason="You do not own this dataset",
        )

    # 2. Execute query
    engine = external_engine or session.get_bind()
    df = load_from_database(engine=engine, query=query)

    # 3. Infer schema
    schema = infer_schema(df)

    # 4. Create version
    version = create_dataset_version(
        session=session,
        dataset_id=dataset_id,
        source_type=SourceType.SQL,
        source_reference="PENDING",
        schema_hash=schema["schema_hash"],
        created_by=user_id,
        row_count=len(df),
        status="converting",
        schema_metadata=json.dumps(schema.get("columns", [])),
    )

    # 5. Save to CSV
    try:
        raw_path = get_raw_data_path(dataset_id, version.id)
        df.to_csv(raw_path, index=False)

        version.source_reference = str(raw_path)
        version.status = "converting"
        session.add(version)
        session.commit()
        session.refresh(version)

    except Exception as e:
        version.is_active = False
        session.add(version)
        session.commit()
        raise InvalidOperation(
            operation="ingest_sql",
            reason="Failed to save data to storage",
            details=str(e),
        )

    # 6. Audit
    record_audit_event(
        event_type="SQL_INGESTED",
        user_id=str(user_id),
        resource_type="DatasetVersion",
        resource_id=str(version.id),
        metadata={
            "dataset_id": str(dataset_id),
            "row_count": len(df),
        },
    )

    return {
        "dataset_id": str(dataset_id),
        "version_id": str(version.id),
        "version_number": version.version_number,
        "row_count": len(df),
        "schema_hash": schema["schema_hash"],
        "raw_path": str(raw_path),
        "schema": schema.get("columns", []),
    }


def _stream_to_path(file_stream: BinaryIO, dest_path: Path, max_size_bytes: int) -> int:
    """Stream file content to disk, enforcing max size."""
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    total = 0
    with open(dest_path, "wb") as out_file:
        for chunk in iter(lambda: file_stream.read(1024 * 1024), b""):
            total += len(chunk)
            if total > max_size_bytes:
                raise InvalidOperation(
                    operation="ingest_file",
                    reason="File exceeds maximum allowed size",
                    details=f"Maximum size: {get_settings().storage.max_file_size_mb}MB",
                )
            out_file.write(chunk)
    return total


def _count_csv_rows(file_path: Path) -> int:
    """Count rows in CSV file (excluding header)."""
    with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
        return max(sum(1 for _ in f) - 1, 0)


async def generate_initial_dashboard(
    *,
    session: Session,
    dataset_id: UUID,
    version_id: UUID,
    user_id: UUID,
    schema: List[Dict[str, Any]],
    raw_path: str,
) -> Dict[str, Any]:
    """
    Generate initial dashboard with auto semantic mapping after file upload.
    
    This provides "Zero-Input First Render" - immediate dashboard without
    requiring manual semantic audit.
    
    Steps:
    1. Run semantic audit (LLM-based column classification)
    2. Generate dashboard using the semantic map
    3. Save semantic map to version
    4. Return dashboard data
    """
    from app.services.semantic_audit import run_semantic_audit
    from app.services.visualization.dashboard_generator import generate_overview_dashboard
    from app.services.analytics.csv_loader import safe_read_csv
    from app.core.llm_client import get_llm_client
    import json
    
    # Load data for semantic mapping and dashboard generation
    df = safe_read_csv(raw_path)
    
    # Get LLM client for semantic mapping
    llm_client = get_llm_client()
    
    # Run semantic audit to get column mappings
    try:
        mappings = await run_semantic_audit(
            dataset_id=str(dataset_id),
            version_id=str(version_id),
            schema=schema,
            llm_router=llm_client,
        )
        
        # Convert mappings to semantic_map_json format
        semantic_map = {m["column"]: m["role"] for m in mappings if "column" in m and "role" in m}
        semantic_map_json = json.dumps(semantic_map)
        
        # Update version with semantic map
        version = session.get(DatasetVersion, version_id)
        if version:
            version.semantic_map_json = semantic_map_json
            session.add(version)
            session.commit()
    except Exception as e:
        # If semantic mapping fails, continue without it
        semantic_map_json = None
    
    # Generate dashboard
    try:
        dashboard_result = generate_overview_dashboard(
            df=df,
            schema={"columns": schema},
            semantic_map_json=semantic_map_json,
        )
        
        return {
            "dashboard": dashboard_result.get("dashboard"),
            "semantic_map": semantic_map_json,
        }
    except Exception as e:
        return {
            "dashboard": None,
            "semantic_map": semantic_map_json,
            "error": str(e),
        }
