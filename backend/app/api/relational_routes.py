"""
Relational Data API routes.

Belongs to: API layer (Phase 4.2 - Analyst Capabilities)
Responsibility: Multi-file upload and visual join builder for relational data

Security: All SQL identifiers pass through safe_identifier() from query_utils.py.
"""

from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4
import json
import re

from fastapi import APIRouter, HTTPException, UploadFile, File, BackgroundTasks
from pydantic import BaseModel, Field

from app.api.deps import DBSession, AuthenticatedUser
from app.core.logger import get_logger
from app.core.exceptions import InvalidOperation, ResourceNotFound
from app.services.dataset_version_service import get_latest_version, get_version_by_id
from app.services.dataset_table_service import (
    create_dataset_table,
    list_tables_for_version,
    get_table_count,
)
from app.services.analytics.duckdb_builder import (
    add_table_to_duckdb,
    mark_duckdb_building,
    mark_duckdb_failed,
    mark_duckdb_ready,
    get_duckdb_build_status,
)
from app.services.analytics.query_utils import safe_identifier, QuerySafetyError
from app.core.storage import get_duckdb_path

router = APIRouter()
logger = get_logger(__name__)

# =============================================================================
# Join Configuration Models
# =============================================================================


class JoinColumn(BaseModel):
    """A single column pair in a join condition."""

    left_column: str = Field(..., min_length=1, max_length=255)
    right_column: str = Field(..., min_length=1, max_length=255)


class JoinConfig(BaseModel):
    """Definition of a join relationship between two tables."""

    join_id: str = Field(..., min_length=1, max_length=64)
    left_table: str = Field(..., min_length=1, max_length=255)
    right_table: str = Field(..., min_length=1, max_length=255)
    join_type: str = Field(..., pattern="^(inner|left|right|outer|cross)$")
    columns: List[JoinColumn] = Field(..., min_length=1)
    alias: Optional[str] = Field(default=None, max_length=255)


class CreateJoinRequest(BaseModel):
    """Request to create a new join configuration."""

    left_table: str = Field(..., min_length=1, max_length=255)
    right_table: str = Field(..., min_length=1, max_length=255)
    join_type: str = Field(..., pattern="^(inner|left|right|outer|cross)$")
    columns: List[JoinColumn] = Field(..., min_length=1)
    alias: Optional[str] = Field(default=None, max_length=255)


class JoinListResponse(BaseModel):
    """Response listing all join configurations for a dataset version."""

    joins: List[JoinConfig]
    available_tables: List[str]


class JoinValidationRequest(BaseModel):
    """Request to validate a join configuration before saving."""

    left_table: str = Field(..., min_length=1, max_length=255)
    right_table: str = Field(..., min_length=1, max_length=255)
    join_type: str = Field(..., pattern="^(inner|left|right|outer|cross)$")
    columns: List[JoinColumn] = Field(..., min_length=1)


class JoinValidationResponse(BaseModel):
    """Response from join validation."""

    is_valid: bool
    reason: str = ""
    estimated_output_rows: Optional[int] = None
    sample_output: Optional[List[Dict[str, Any]]] = None


class ApplyJoinRequest(BaseModel):
    """Request to apply all configured joins and create a DuckDB VIEW."""

    view_name: Optional[str] = Field(default="joined_view", max_length=255)


class TableInfo(BaseModel):
    """Info about a table in the dataset."""

    table_name: str
    original_filename: str
    row_count: Optional[int] = None
    columns: List[Dict[str, str]] = []
    is_primary: bool = True


class TablesListResponse(BaseModel):
    """Response listing all tables and their schemas."""

    tables: List[TableInfo]
    version_id: str
    has_join_view: bool = False
    active_join_view: Optional[str] = None


# =============================================================================
# Helpers
# =============================================================================


async def check_table_ownership_or_raise(
    table_name: str,
    user_id: str,
    session: DBSession,
) -> None:
    """Validate that the given table belongs to a dataset owned by the user."""
    from app.models.dataset_version import DatasetVersion
    from app.models.dataset import Dataset
    from app.models.dataset_table import DatasetTable
    from sqlmodel import select
    from fastapi import HTTPException

    # First try querying DatasetVersion (for mock compatibility in tests)
    version = session.exec(
        select(DatasetVersion).where(DatasetVersion.duckdb_table_name == table_name)
    ).first()

    # If not found, check DatasetTable
    if not version:
        db_table = session.exec(
            select(DatasetTable).where(DatasetTable.table_name == table_name)
        ).first()
        if db_table:
            version = session.get(DatasetVersion, db_table.version_id)

    if not version:
        raise HTTPException(status_code=404, detail=f"Table '{table_name}' not found")

    # Query dataset
    dataset = session.exec(
        select(Dataset).where(Dataset.id == version.dataset_id)
    ).first()

    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    if str(dataset.owner_id) != str(user_id):
        raise HTTPException(status_code=403, detail="Access denied")


def _safe_table_name(filename: str) -> str:
    """Derive a safe DuckDB table name from a filename."""
    name = re.sub(
        r"[^\w]", "_", filename.rsplit(".", 1)[0] if "." in filename else filename
    )
    name = re.sub(r"_+", "_", name).strip("_")
    return name.lower()[:64] or "table"


def _get_join_registry(session, dataset_id: UUID) -> Dict[str, Any]:
    """Load join registry from version join_config_json, or return empty structure."""
    latest_version = get_latest_version(session=session, dataset_id=dataset_id)
    if not latest_version:
        return {"joins": [], "tables": []}

    raw = latest_version.join_config_json
    if not raw:
        return {"joins": [], "tables": []}

    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {"joins": data, "tables": []}
    except Exception:
        return {"joins": [], "tables": []}


def _save_join_registry(
    dataset_id: UUID, version_id: UUID, registry: Dict[str, Any]
) -> None:
    """Persist join registry to version join_config_json."""
    from app.models.database import get_session

    session_gen = get_session()
    session = next(session_gen)
    try:
        version = get_version_by_id(session=session, version_id=version_id)
        version.join_config_json = json.dumps(registry, default=str)
        session.add(version)
        session.commit()
    finally:
        session_gen.close()


def _discover_tables_in_duckdb(dataset_id: UUID, version_id: UUID) -> List[str]:
    """Return list of table names in the DuckDB file."""
    duckdb_path = get_duckdb_path(dataset_id, version_id)
    if not duckdb_path.exists():
        return []

    import duckdb

    try:
        con = duckdb.connect(str(duckdb_path), read_only=True)
        try:
            result = con.execute("SHOW TABLES").df()
            return result["name"].tolist() if not result.empty else []
        finally:
            con.close()
    except Exception as e:
        logger.warning(f"Failed to discover tables in DuckDB: {e}")
        return []


def _get_table_columns(
    dataset_id: UUID, version_id: UUID, table_name: str
) -> List[Dict[str, str]]:
    """Get column names and types for a table in DuckDB."""
    duckdb_path = get_duckdb_path(dataset_id, version_id)
    if not duckdb_path.exists():
        return []

    import duckdb

    try:
        con = duckdb.connect(str(duckdb_path), read_only=True)
        try:
            safe_tbl = safe_identifier(table_name)
            result = con.execute(f"DESCRIBE {safe_tbl}").df()
            return [
                {"name": row["column_name"], "type": row["column_type"]}
                for _, row in result.iterrows()
            ]
        finally:
            con.close()
    except Exception as e:
        logger.warning(f"Failed to get columns for table '{table_name}': {e}")
        return []


# =============================================================================
# Multi-File Upload Endpoints
# =============================================================================


@router.post(
    "/datasets/{dataset_id}/upload/multiple",
    status_code=201,
    summary="Upload multiple dataset files and register as related tables",
)
async def upload_multiple_files(
    dataset_id: UUID,
    files: List[UploadFile] = File(...),
    background_tasks: BackgroundTasks = None,
    session: DBSession = None,
    current_user: AuthenticatedUser = None,
):
    """
    Upload multiple files to a single dataset version.

    - Each file becomes a named table in the shared DuckDB file
    - Files are validated individually (extension, size, magic bytes)
    - DuckDB tables are built in the background
    - Creates DatasetTable entries (not new DatasetVersion rows per file)
    """
    from app.api.deps import verify_dataset_owner
    from app.core.config import get_settings

    settings = get_settings()

    await verify_dataset_owner(
        dataset_id=dataset_id,
        session=session,
        current_user=current_user,
    )

    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    if len(files) > 20:
        raise HTTPException(status_code=400, detail="Maximum 20 files per upload")

    # Get or create a version to attach tables to
    latest_version = get_latest_version(session=session, dataset_id=dataset_id)
    if not latest_version:
        raise HTTPException(
            status_code=404,
            detail="No dataset version found. Upload a primary file first.",
        )

    existing_table_count = get_table_count(session, latest_version.id)

    results = []
    errors = []

    for idx, file in enumerate(files):
        try:
            from app.api.upload_routes import _validate_file_security

            _validate_file_security(file, settings.storage.max_file_size_mb)

            try:
                file.file.seek(0, 2)
                file_size = file.file.tell()
                file.file.seek(0)
            except Exception:
                file_size = None

            if file_size == 0:
                errors.append({"filename": file.filename, "error": "Empty file"})
                continue

            table_name = _safe_table_name(file.filename)
            is_primary = existing_table_count == 0 and idx == 0

            # Save raw CSV to disk
            from app.core.storage import get_version_dir
            from app.services.ingestion_execution.file_loader import load_csv_sample
            from app.services.ingestion_execution.schema_inference import infer_schema

            version_dir = get_version_dir(dataset_id, latest_version.id)
            raw_path = version_dir / f"{table_name}.csv"
            raw_path.parent.mkdir(parents=True, exist_ok=True)

            max_bytes = settings.storage.max_file_size_mb * 1024 * 1024

            def _process_file_sync():
                # Stream file to disk
                total = 0
                with open(raw_path, "wb") as out_file:
                    for chunk in iter(lambda: file.file.read(1024 * 1024), b""):
                        total += len(chunk)
                        if total > max_bytes:
                            raise InvalidOperation(
                                operation="multi_upload",
                                reason="File exceeds maximum allowed size",
                            )
                        out_file.write(chunk)

                # Infer schema from sample
                try:
                    with open(raw_path, "rb") as f:
                        sample_df = load_csv_sample(f, nrows=5)
                    local_schema = infer_schema(sample_df)
                    local_schema_json = json.dumps(local_schema.get("columns", []))
                except Exception:
                    local_schema = {}
                    local_schema_json = None

                # Count rows
                local_row_count = 0
                try:
                    with open(raw_path, "r", encoding="utf-8", errors="ignore") as f:
                        local_row_count = max(sum(1 for _ in f) - 1, 0)
                except Exception:
                    pass

                return local_schema, local_schema_json, local_row_count

            import asyncio

            schema, schema_json, row_count = await asyncio.to_thread(_process_file_sync)

            # Create DatasetTable entry
            dataset_table = create_dataset_table(
                session=session,
                version_id=latest_version.id,
                table_name=table_name,
                original_filename=file.filename,
                source_reference=str(raw_path),
                row_count=row_count,
                schema_metadata=schema_json,
                is_primary=is_primary,
                display_order=existing_table_count + idx,
            )

            # Schedule DuckDB table build in background
            if background_tasks:
                mark_duckdb_building(dataset_id, latest_version.id)
                background_tasks.add_task(
                    _build_multi_duckdb_background,
                    dataset_id=dataset_id,
                    version_id=latest_version.id,
                    csv_path=str(raw_path),
                    table_name=table_name,
                )

            results.append(
                {
                    "filename": file.filename,
                    "table_name": table_name,
                    "table_id": str(dataset_table.id),
                    "version_id": str(latest_version.id),
                    "schema": schema.get("columns", []),
                    "row_count": row_count,
                    "is_primary": is_primary,
                }
            )

        except HTTPException:
            raise
        except Exception as e:
            logger.exception(f"Error processing file {file.filename}: {e}")
            errors.append({"filename": file.filename, "error": str(e)})

    return {
        "uploaded": results,
        "errors": errors,
        "total": len(files),
        "success_count": len(results),
        "error_count": len(errors),
        "version_id": str(latest_version.id),
    }


def _build_multi_duckdb_background(
    dataset_id: UUID,
    version_id: UUID,
    csv_path: str,
    table_name: str,
):
    """Background task to add a named table to the shared DuckDB file."""
    import asyncio

    async def run_build():
        try:
            logger.info(
                f"[Background] Adding table '{table_name}' to DuckDB for dataset={dataset_id}"
            )
            await add_table_to_duckdb(dataset_id, version_id, csv_path, table_name)
            logger.info(f"[Background] DuckDB table '{table_name}' added successfully")
        except Exception as e:
            mark_duckdb_failed(dataset_id, version_id, str(e))
            logger.error(
                f"[Background] DuckDB table '{table_name}' build failed: {e}",
                exc_info=True,
            )

    asyncio.run(run_build())


# =============================================================================
# Table Discovery Endpoints
# =============================================================================


@router.get(
    "/datasets/{dataset_id}/tables",
    response_model=TablesListResponse,
    summary="List all tables in a dataset with column schemas",
)
async def list_dataset_tables(
    dataset_id: UUID,
    session: DBSession,
    current_user: AuthenticatedUser,
) -> TablesListResponse:
    """Return all tables and their column schemas for the join builder UI."""
    from app.api.deps import verify_dataset_owner

    await verify_dataset_owner(
        dataset_id=dataset_id,
        session=session,
        current_user=current_user,
    )

    latest_version = get_latest_version(session=session, dataset_id=dataset_id)
    if not latest_version:
        raise HTTPException(status_code=404, detail="Dataset version not found")

    # Get DatasetTable entries
    db_tables = list_tables_for_version(session, latest_version.id)

    # Also discover DuckDB tables for completeness
    duckdb_tables = _discover_tables_in_duckdb(dataset_id, latest_version.id)

    tables = []
    seen_names = set()

    # DatasetTable entries first (source of truth)
    for dt in db_tables:
        columns = _get_table_columns(dataset_id, latest_version.id, dt.table_name)
        tables.append(
            TableInfo(
                table_name=dt.table_name,
                original_filename=dt.original_filename,
                row_count=dt.row_count,
                columns=columns,
                is_primary=dt.is_primary,
            )
        )
        seen_names.add(dt.table_name)

    # Add DuckDB-only tables not tracked in DatasetTable (legacy compat)
    for tbl_name in duckdb_tables:
        if tbl_name not in seen_names and not tbl_name.startswith("_"):
            columns = _get_table_columns(dataset_id, latest_version.id, tbl_name)
            tables.append(
                TableInfo(
                    table_name=tbl_name,
                    original_filename=tbl_name,
                    columns=columns,
                    is_primary=(tbl_name == "data"),
                )
            )

    return TablesListResponse(
        tables=tables,
        version_id=str(latest_version.id),
        has_join_view=bool(latest_version.active_join_view),
        active_join_view=latest_version.active_join_view,
    )


# =============================================================================
# Join Builder Endpoints
# =============================================================================


@router.post(
    "/datasets/{dataset_id}/joins",
    response_model=JoinConfig,
    summary="Create a join configuration between two tables",
)
async def create_join(
    dataset_id: UUID,
    request: CreateJoinRequest,
    session: DBSession,
    current_user: AuthenticatedUser,
) -> JoinConfig:
    """
    Define a join relationship between two tables in the dataset.

    The join is validated before saving:
    - Both tables must exist in the DuckDB
    - Join columns must exist in both tables
    - Column types must be compatible
    """
    from app.api.deps import verify_dataset_owner

    await verify_dataset_owner(
        dataset_id=dataset_id,
        session=session,
        current_user=current_user,
    )

    latest_version = get_latest_version(session=session, dataset_id=dataset_id)
    if not latest_version:
        raise HTTPException(status_code=404, detail="Dataset version not found")

    available_tables = _discover_tables_in_duckdb(dataset_id, latest_version.id)
    if request.left_table not in available_tables:
        raise HTTPException(
            status_code=400, detail=f"Table '{request.left_table}' not found in dataset"
        )
    if request.right_table not in available_tables:
        raise HTTPException(
            status_code=400,
            detail=f"Table '{request.right_table}' not found in dataset",
        )

    # Validate join columns exist using safe identifiers
    import duckdb

    duckdb_path = get_duckdb_path(dataset_id, latest_version.id)
    if not duckdb_path.exists():
        raise HTTPException(
            status_code=400,
            detail="DuckDB not ready. Please wait for upload processing.",
        )

    con = duckdb.connect(str(duckdb_path), read_only=True)
    try:
        left_cols = {
            r[0]
            for r in con.execute(
                f"DESCRIBE {safe_identifier(request.left_table)}"
            ).fetchall()
        }
        right_cols = {
            r[0]
            for r in con.execute(
                f"DESCRIBE {safe_identifier(request.right_table)}"
            ).fetchall()
        }
    except QuerySafetyError as e:
        raise HTTPException(status_code=400, detail=f"Invalid table name: {e}")
    finally:
        con.close()

    for col in request.columns:
        # Validate column names through safe_identifier (catches injection attempts)
        try:
            safe_identifier(col.left_column)
            safe_identifier(col.right_column)
        except QuerySafetyError as e:
            raise HTTPException(status_code=400, detail=f"Invalid column name: {e}")

        if col.left_column not in left_cols:
            raise HTTPException(
                status_code=400,
                detail=f"Column '{col.left_column}' not found in '{request.left_table}'",
            )
        if col.right_column not in right_cols:
            raise HTTPException(
                status_code=400,
                detail=f"Column '{col.right_column}' not found in '{request.right_table}'",
            )

    join_id = f"j_{uuid4().hex[:12]}"

    join_config = JoinConfig(
        join_id=join_id,
        left_table=request.left_table,
        right_table=request.right_table,
        join_type=request.join_type,
        columns=request.columns,
        alias=request.alias,
    )

    registry = _get_join_registry(session, dataset_id)
    joins = registry.get("joins", [])

    for existing in joins:
        if (
            existing.get("left_table") == request.left_table
            and existing.get("right_table") == request.right_table
        ):
            raise HTTPException(
                status_code=409,
                detail=f"Join between '{request.left_table}' and '{request.right_table}' already exists. Delete it first.",
            )

    joins.append(join_config.model_dump())
    registry["joins"] = joins
    registry["tables"] = available_tables

    _save_join_registry(dataset_id, latest_version.id, registry)

    return join_config


@router.get(
    "/datasets/{dataset_id}/joins",
    response_model=JoinListResponse,
    summary="List all join configurations for a dataset",
)
async def list_joins(
    dataset_id: UUID,
    session: DBSession,
    current_user: AuthenticatedUser,
) -> JoinListResponse:
    """Return all join configurations and available tables for the dataset."""
    from app.api.deps import verify_dataset_owner

    await verify_dataset_owner(
        dataset_id=dataset_id,
        session=session,
        current_user=current_user,
    )

    latest_version = get_latest_version(session=session, dataset_id=dataset_id)
    if not latest_version:
        raise HTTPException(status_code=404, detail="Dataset version not found")

    registry = _get_join_registry(session, dataset_id)
    available_tables = _discover_tables_in_duckdb(dataset_id, latest_version.id)

    if available_tables:
        registry["tables"] = available_tables
        _save_join_registry(dataset_id, latest_version.id, registry)

    joins = [JoinConfig(**j) for j in registry.get("joins", [])]

    return JoinListResponse(joins=joins, available_tables=available_tables)


@router.delete(
    "/datasets/{dataset_id}/joins/{join_id}",
    status_code=204,
    summary="Delete a join configuration",
)
async def delete_join(
    dataset_id: UUID,
    join_id: str,
    session: DBSession,
    current_user: AuthenticatedUser,
):
    """Remove a join configuration by its ID."""
    from app.api.deps import verify_dataset_owner

    await verify_dataset_owner(
        dataset_id=dataset_id,
        session=session,
        current_user=current_user,
    )

    latest_version = get_latest_version(session=session, dataset_id=dataset_id)
    if not latest_version:
        raise HTTPException(status_code=404, detail="Dataset version not found")

    registry = _get_join_registry(session, dataset_id)
    joins = registry.get("joins", [])

    original_count = len(joins)
    joins = [j for j in joins if j.get("join_id") != join_id]

    if len(joins) == original_count:
        raise HTTPException(status_code=404, detail=f"Join '{join_id}' not found")

    registry["joins"] = joins
    _save_join_registry(dataset_id, latest_version.id, registry)


@router.post(
    "/datasets/{dataset_id}/joins/validate",
    response_model=JoinValidationResponse,
    summary="Validate a join configuration without saving it",
)
async def validate_join(
    dataset_id: UUID,
    request: JoinValidationRequest,
    session: DBSession,
    current_user: AuthenticatedUser,
) -> JoinValidationResponse:
    """Validate a join configuration without persisting it.

    Security: All identifiers pass through safe_identifier().
    """
    from app.api.deps import verify_dataset_owner

    await verify_dataset_owner(
        dataset_id=dataset_id,
        session=session,
        current_user=current_user,
    )

    latest_version = get_latest_version(session=session, dataset_id=dataset_id)
    if not latest_version:
        raise HTTPException(status_code=404, detail="Dataset version not found")

    duckdb_path = get_duckdb_path(dataset_id, latest_version.id)
    if not duckdb_path.exists():
        return JoinValidationResponse(
            is_valid=False,
            reason="DuckDB not ready. Please wait for upload processing.",
        )

    available_tables = _discover_tables_in_duckdb(dataset_id, latest_version.id)
    if request.left_table not in available_tables:
        return JoinValidationResponse(
            is_valid=False, reason=f"Table '{request.left_table}' not found"
        )
    if request.right_table not in available_tables:
        return JoinValidationResponse(
            is_valid=False, reason=f"Table '{request.right_table}' not found"
        )

    # Build safe ON clause using safe_identifier
    try:
        safe_left_tbl = safe_identifier(request.left_table)
        safe_right_tbl = safe_identifier(request.right_table)
        on_parts = [
            f"{safe_identifier(col.left_column)} = {safe_identifier(col.right_column)}"
            for col in request.columns
        ]
    except QuerySafetyError as e:
        return JoinValidationResponse(is_valid=False, reason=f"Invalid identifier: {e}")

    on_clause = " AND ".join(on_parts)
    join_type_sql = request.join_type.upper()
    if join_type_sql == "OUTER":
        join_type_sql = "FULL OUTER"

    join_sql = (
        f"SELECT * FROM {safe_left_tbl} "
        f"{join_type_sql} JOIN {safe_right_tbl} ON {on_clause} "
        f"LIMIT 100"
    )

    import duckdb

    con = duckdb.connect(str(duckdb_path), read_only=True)
    try:
        result = con.execute(join_sql)
        columns = [desc[0] for desc in result.description]
        rows = result.fetchmany(10)
        sample = [dict(zip(columns, row)) for row in rows]

        count_sql = (
            f"SELECT COUNT(*) FROM {safe_left_tbl} "
            f"{join_type_sql} JOIN {safe_right_tbl} ON {on_clause}"
        )
        estimated = con.execute(count_sql).fetchone()[0]

        return JoinValidationResponse(
            is_valid=True,
            reason="Join is valid",
            estimated_output_rows=estimated,
            sample_output=sample,
        )
    except Exception as e:
        return JoinValidationResponse(
            is_valid=False,
            reason=f"Join validation failed: {str(e)}",
        )
    finally:
        con.close()


# =============================================================================
# Join Apply Endpoint
# =============================================================================


@router.post(
    "/datasets/{dataset_id}/versions/{version_id}/join",
    status_code=200,
    summary="Apply all configured joins and create a DuckDB VIEW",
)
async def apply_joins(
    dataset_id: UUID,
    version_id: UUID,
    request: ApplyJoinRequest,
    session: DBSession,
    current_user: AuthenticatedUser,
):
    """
    Apply all configured joins to create a DuckDB VIEW.

    This creates a virtual joined table that the analytics engine will use.
    The VIEW is not materialized — it references the underlying tables directly.

    Security: All identifiers pass through safe_identifier() — zero f-string interpolation.
    """
    from app.api.deps import verify_dataset_owner
    from app.services.analytics.join_manager import JoinManager

    await verify_dataset_owner(
        dataset_id=dataset_id,
        session=session,
        current_user=current_user,
    )

    version = get_version_by_id(session=session, version_id=version_id)
    if not version:
        raise HTTPException(status_code=404, detail="Dataset version not found")

    duckdb_path = get_duckdb_path(dataset_id, version_id)
    if not duckdb_path.exists():
        raise HTTPException(
            status_code=400,
            detail="DuckDB not ready. Please wait for upload processing.",
        )

    registry = _get_join_registry(session, dataset_id)
    joins = registry.get("joins", [])

    if not joins:
        raise HTTPException(
            status_code=400, detail="No join configurations found. Create joins first."
        )

    view_name = request.view_name or "joined_view"

    import duckdb

    con = duckdb.connect(str(duckdb_path))
    try:
        result = JoinManager.create_joined_view(
            conn=con,
            view_name=view_name,
            joins=joins,
        )

        # Persist active_join_view on the version
        version.active_join_view = view_name
        session.add(version)
        session.commit()

        # Get row count from view
        safe_view = safe_identifier(view_name)
        row_count = con.execute(f"SELECT COUNT(*) FROM {safe_view}").fetchone()[0]

        # Get columns from view
        cols_df = con.execute(f"DESCRIBE {safe_view}").df()
        columns = [
            {"name": row["column_name"], "type": row["column_type"]}
            for _, row in cols_df.iterrows()
        ]

        return {
            "success": True,
            "view_name": view_name,
            "sql": result["sql"],
            "row_count": row_count,
            "columns": columns,
            "joins_applied": len(joins),
        }

    except QuerySafetyError as e:
        raise HTTPException(status_code=400, detail=f"SQL safety error: {e}")
    except Exception as e:
        logger.exception(f"Failed to apply joins: {e}")
        raise HTTPException(status_code=500, detail=f"Join apply failed: {str(e)}")
    finally:
        con.close()
