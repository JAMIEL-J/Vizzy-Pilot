"""
Download and export routes.

Belongs to: API layer
Responsibility: File downloads and data exports
Restrictions: Thin controller - delegates to services
"""

from datetime import datetime
from pathlib import Path
from typing import List, Optional
from uuid import UUID
import re

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import FileResponse, StreamingResponse
import pandas as pd
from pydantic import BaseModel, Field

from app.api.deps import DBSession, AuthenticatedUser, verify_dataset_owner
from app.core.storage import get_cleaned_data_path, get_raw_data_path
from app.core.exceptions import ResourceNotFound, AuthorizationError
from app.services import dataset_version_service, dataset_service
from app.services.dataset_version_service import get_latest_version
from app.services.analytics.duckdb_builder import get_or_build_duckdb
from app.core.audit import record_audit_event
from app.services.audit_service import get_user_audit_events
import duckdb


router = APIRouter()


class DownloadHistoryItem(BaseModel):
    """Schema for download history logs."""
    dataset_id: str
    dataset_name: str
    version_id: str
    version_number: int
    download_type: str
    timestamp: datetime


@router.get(
    "/datasets/downloads/history",
    response_model=List[DownloadHistoryItem],
    summary="Get user's download history",
)
def get_download_history(
    current_user: AuthenticatedUser,
) -> List[DownloadHistoryItem]:
    """
    Get the audit event log of dataset downloads for the current user.
    """
    events = get_user_audit_events(UUID(current_user.user_id))
    download_events = [
        e for e in events
        if e.get("event_type") == "DATASET_DOWNLOADED"
    ]
    
    history = []
    for e in download_events:
        metadata = e.get("metadata") or {}
        history.append(
            DownloadHistoryItem(
                dataset_id=e.get("resource_id") or "",
                dataset_name=metadata.get("dataset_name", "Unknown Dataset"),
                version_id=metadata.get("version_id", ""),
                version_number=metadata.get("version_number", 1),
                download_type=metadata.get("download_type", "raw"),
                timestamp=e.get("timestamp"),
            )
        )
    return history



@router.get(
    "/datasets/{dataset_id}/versions/{version_id}/download/raw",
    summary="Download raw dataset",
    response_class=FileResponse,
)
def download_raw_dataset(
    dataset_id: UUID,
    version_id: UUID,
    session: DBSession,
    current_user: AuthenticatedUser,
) -> FileResponse:
    """
    Download the original uploaded dataset as CSV.
    """
    # Validate ownership
    try:
        dataset = dataset_service.get_dataset_by_id(
            session=session,
            dataset_id=dataset_id,
            user_id=UUID(current_user.user_id),
            role=current_user.role,
        )
        version = dataset_version_service.get_version_by_id(
            session=session,
            version_id=version_id,
        )
        if version.dataset_id != dataset.id:
            raise HTTPException(status_code=404, detail="Version does not belong to dataset")
    except (ResourceNotFound, AuthorizationError) as e:
        raise HTTPException(status_code=404, detail=str(e))

    # Get file path
    if not version.source_reference or version.source_reference == "PENDING":
        raise HTTPException(status_code=404, detail="Raw data file not ready")

    from app.services.storage import get_storage
    file_path = version.source_reference

    if not get_storage().exists(file_path):
        raise HTTPException(status_code=404, detail="Raw data file not found")

    record_audit_event(
        event_type="DATASET_DOWNLOADED",
        user_id=str(current_user.user_id),
        resource_type="Dataset",
        resource_id=str(dataset.id),
        metadata={
            "dataset_name": dataset.name,
            "version_id": str(version.id),
            "version_number": version.version_number,
            "download_type": "raw",
        },
    )

    from starlette.background import BackgroundTask
    import os
    local_path = get_storage().download_to_temp(file_path)
    return FileResponse(
        path=local_path,
        filename=f"raw_data_{version_id}.csv",
        media_type="text/csv",
        background=BackgroundTask(os.remove, local_path)
    )



@router.get(
    "/datasets/{dataset_id}/versions/{version_id}/download/cleaned",
    summary="Download cleaned dataset",
    response_class=FileResponse,
)
def download_cleaned_dataset(
    dataset_id: UUID,
    version_id: UUID,
    session: DBSession,
    current_user: AuthenticatedUser,
) -> FileResponse:
    """
    Download the cleaned dataset as CSV.
    
    The cleaned dataset includes all transformations from the cleaning plan.
    """
    # Validate ownership
    try:
        dataset = dataset_service.get_dataset_by_id(
            session=session,
            dataset_id=dataset_id,
            user_id=UUID(current_user.user_id),
            role=current_user.role,
        )
        version = dataset_version_service.get_version_by_id(
            session=session,
            version_id=version_id,
        )
        if version.dataset_id != dataset.id:
            raise HTTPException(status_code=404, detail="Version does not belong to dataset")
    except (ResourceNotFound, AuthorizationError) as e:
        raise HTTPException(status_code=404, detail=str(e))

    if not version.cleaned_reference:
        raise HTTPException(status_code=400, detail="Dataset has not been cleaned yet")

    # Get file path
    from app.services.storage import get_storage
    file_path = version.cleaned_reference

    if not get_storage().exists(file_path):
        raise HTTPException(status_code=404, detail="Cleaned data file not found")

    record_audit_event(
        event_type="DATASET_DOWNLOADED",
        user_id=str(current_user.user_id),
        resource_type="Dataset",
        resource_id=str(dataset.id),
        metadata={
            "dataset_name": dataset.name,
            "version_id": str(version.id),
            "version_number": version.version_number,
            "download_type": "cleaned",
        },
    )

    from starlette.background import BackgroundTask
    import os
    local_path = get_storage().download_to_temp(file_path)
    return FileResponse(
        path=local_path,
        filename=f"cleaned_data_{version_id}.csv",
        media_type="text/csv",
        background=BackgroundTask(os.remove, local_path)
    )


@router.get(
    "/datasets/{dataset_id}/download/raw",
    summary="Download latest raw dataset",
    response_class=FileResponse,
)
def download_latest_raw_dataset(
    dataset_id: UUID,
    session: DBSession,
    current_user: AuthenticatedUser,
) -> FileResponse:
    """
    Download the original uploaded dataset for the latest version as CSV.
    """
    # Validate ownership
    try:
        dataset = dataset_service.get_dataset_by_id(
            session=session,
            dataset_id=dataset_id,
            user_id=UUID(current_user.user_id),
            role=current_user.role,
        )
        version = dataset_version_service.get_latest_version(
            session=session,
            dataset_id=dataset.id,
        )
    except (ResourceNotFound, AuthorizationError) as e:
        raise HTTPException(status_code=404, detail=str(e))

    # Get file path
    if not version.source_reference or version.source_reference == "PENDING":
        raise HTTPException(status_code=404, detail="Raw data file not ready")

    from app.services.storage import get_storage
    file_path = version.source_reference

    if not get_storage().exists(file_path):
        raise HTTPException(status_code=404, detail="Raw data file not found")

    record_audit_event(
        event_type="DATASET_DOWNLOADED",
        user_id=str(current_user.user_id),
        resource_type="Dataset",
        resource_id=str(dataset.id),
        metadata={
            "dataset_name": dataset.name,
            "version_id": str(version.id),
            "version_number": version.version_number,
            "download_type": "raw",
        },
    )

    from starlette.background import BackgroundTask
    import os
    local_path = get_storage().download_to_temp(file_path)
    return FileResponse(
        path=local_path,
        filename=f"raw_data_latest.csv",
        media_type="text/csv",
        background=BackgroundTask(os.remove, local_path)
    )


@router.get(
    "/datasets/{dataset_id}/download/cleaned",
    summary="Download latest cleaned dataset",
    response_class=FileResponse,
)
def download_latest_cleaned_dataset(
    dataset_id: UUID,
    session: DBSession,
    current_user: AuthenticatedUser,
) -> FileResponse:
    """
    Download the latest cleaned dataset as CSV.
    """
    # Validate ownership
    try:
        dataset = dataset_service.get_dataset_by_id(
            session=session,
            dataset_id=dataset_id,
            user_id=UUID(current_user.user_id),
            role=current_user.role,
        )
        version = dataset_version_service.get_latest_version(
            session=session,
            dataset_id=dataset.id,
        )
    except (ResourceNotFound, AuthorizationError) as e:
        raise HTTPException(status_code=404, detail=str(e))

    if not version.cleaned_reference:
        raise HTTPException(status_code=400, detail="Dataset has not been cleaned yet")

    # Get file path
    from app.services.storage import get_storage
    file_path = version.cleaned_reference

    if not get_storage().exists(file_path):
        raise HTTPException(status_code=404, detail="Cleaned data file not found")

    record_audit_event(
        event_type="DATASET_DOWNLOADED",
        user_id=str(current_user.user_id),
        resource_type="Dataset",
        resource_id=str(dataset.id),
        metadata={
            "dataset_name": dataset.name,
            "version_id": str(version.id),
            "version_number": version.version_number,
            "download_type": "cleaned",
        },
    )

    from starlette.background import BackgroundTask
    import os
    local_path = get_storage().download_to_temp(file_path)
    return FileResponse(
        path=local_path,
        filename=f"cleaned_data_latest.csv",
        media_type="text/csv",
        background=BackgroundTask(os.remove, local_path)
    )


# =============================================================================
# Phase 4.3: Data Portability — Chart & Query Export
# =============================================================================


import sqlglot
from sqlglot import exp
import os

MAX_EXPORT_ROWS = int(os.getenv("VIZZY_MAX_EXPORT_ROWS", "500000"))

def enforce_export_limit(sql: str, max_rows: int = MAX_EXPORT_ROWS) -> str:
    """
    If the query has no LIMIT clause, append one.
    If it has a LIMIT higher than max_rows, replace it.
    Uses DuckDB AST — not string matching.
    """
    try:
        parsed = sqlglot.parse_one(sql, read="duckdb")
    except Exception:
        # Fallback wrapper
        return f"SELECT * FROM ({sql}) LIMIT {max_rows}"
    
    # Unwrap any outer Subquery parentheses
    node = parsed
    while isinstance(node, exp.Subquery):
        node = node.this
        
    if isinstance(node, (exp.Select, exp.Union)):
        limit_node = node.args.get("limit")
        if limit_node:
            try:
                limit_val = int(limit_node.expression.name)
                if limit_val > max_rows:
                    limit_node.set("expression", exp.Literal.number(max_rows))
            except Exception:
                limit_node.set("expression", exp.Literal.number(max_rows))
        else:
            node.set("limit", exp.Limit(expression=exp.Literal.number(max_rows)))
    else:
        parsed = sqlglot.parse_one(f"SELECT * FROM ({sql}) LIMIT {max_rows}", read="duckdb")
        
    return parsed.sql(dialect="duckdb")


class QueryExportRequest(BaseModel):
    """Request to export query results as CSV/TSV."""
    sql: str = Field(..., min_length=1, max_length=10000)
    format: str = Field(default="csv", pattern="^(csv|tsv)$")
    filename: Optional[str] = Field(default=None, max_length=255)


@router.post(
    "/datasets/{dataset_id}/export/query",
    summary="Export query results as CSV or TSV",
)
async def export_query_results(
    dataset_id: UUID,
    request: QueryExportRequest,
    session: DBSession,
    current_user: AuthenticatedUser,
) -> StreamingResponse:
    """
    Execute a SQL query and stream the results as a downloadable CSV or TSV file.

    The query is validated through the security sandbox (SELECT-only, read-only).
    This allows exporting any subset or transformation of the dataset.

    Use this endpoint to:
    - Export filtered data
    - Export joined data from multiple tables
    - Export results of a custom SQL query
    """
    from app.services.security.sandbox import validate_sql, execute_sandboxed, QueryExecutionError
    import csv
    import io

    # Ownership check
    await verify_dataset_owner(
        dataset_id=dataset_id,
        session=session,
        current_user=current_user,
    )

    latest_version = get_latest_version(session=session, dataset_id=dataset_id)
    if not latest_version:
        raise HTTPException(status_code=404, detail="Dataset version not found")

    file_path = (
        latest_version.cleaned_reference
        if latest_version.cleaned_reference
        else latest_version.source_reference
    )

    # Discover available tables
    from app.services.storage import get_storage
    from app.core.storage import get_duckdb_path
    available_tables = ["data"]
    duckdb_path = get_duckdb_path(dataset_id, latest_version.id)
    if get_storage().exists(duckdb_path):
        try:
            local_path = get_storage().download_to_temp(duckdb_path)
            try:
                con_temp = duckdb.connect(str(local_path), read_only=True)
                try:
                    res_temp = con_temp.execute("SHOW TABLES").df()
                    if not res_temp.empty:
                        available_tables = res_temp["name"].tolist()
                finally:
                    con_temp.close()
            finally:
                get_storage().cleanup_temp(local_path)
        except Exception:
            pass

    # Validate SQL
    is_valid, reason, parsed = validate_sql(request.sql, available_tables)
    if not is_valid:
        raise HTTPException(status_code=400, detail=f"SQL validation failed: {reason}")

    # Enforce limit in SQL
    limited_sql = enforce_export_limit(request.sql, MAX_EXPORT_ROWS)

    duckdb_path = await get_or_build_duckdb(dataset_id, latest_version.id, file_path)
    local_duckdb_path = get_storage().download_to_temp(duckdb_path)
    conn = duckdb.connect(str(local_duckdb_path), read_only=True)
    try:
        # Execute query (without sandbox timeout for export — use a generous limit)
        try:
            result = conn.execute(limited_sql)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Query execution failed: {str(e)}")

        columns = [desc[0] for desc in result.description]
        rows = result.fetchall()

        # Build filename
        safe_name = re.sub(r"[^\w\-]", "_", request.filename or "export_query")
        if not safe_name.endswith(f".{request.format}"):
            safe_name = f"{safe_name}.{request.format}"

        # Choose delimiter
        delimiter = "\t" if request.format == "tsv" else ","

        # Stream response
        def generate():
            """Yield CSV/TSV rows as they are generated."""
            import numpy as np

            output = io.StringIO()
            writer = csv.writer(output, delimiter=delimiter, lineterminator="\n")

            # Write header
            writer.writerow(columns)
            yield output.getvalue()
            output.seek(0)
            output.truncate(0)

            # Write data rows
            for row in rows:
                # Replace NaN/Inf with empty string
                clean_row = []
                for val in row:
                    if isinstance(val, float) and (np.isnan(val) or np.isinf(val)):
                        clean_row.append("")
                    else:
                        clean_row.append(val)
                writer.writerow(clean_row)
                yield output.getvalue()
                output.seek(0)
                output.truncate(0)

        media_type = "text/tab-separated-values" if request.format == "tsv" else "text/csv"

        record_audit_event(
            event_type="DATA_EXPORTED",
            user_id=str(current_user.user_id),
            resource_type="Dataset",
            resource_id=str(dataset_id),
            metadata={
                "export_type": "query",
                "row_count": len(rows),
                "format": request.format,
                "filename": safe_name,
            },
        )

        return StreamingResponse(
            generate(),
            media_type=media_type,
            headers={
                "Content-Disposition": f'attachment; filename="{safe_name}"',
                "X-Result-Row-Count": str(len(rows)),
            },
        )

    finally:
        conn.close()
        try:
            get_storage().cleanup_temp(local_duckdb_path)
        except Exception:
            pass


@router.get(
    "/datasets/{dataset_id}/export/table/{table_name}",
    summary="Export a DuckDB table as CSV or TSV",
)
async def export_table(
    dataset_id: UUID,
    table_name: str,
    format: str = "csv",
    session: DBSession = None,
    current_user: AuthenticatedUser = None,
) -> StreamingResponse:
    """
    Export an entire table (or view) from the dataset's DuckDB as CSV or TSV.

    Use this to:
    - Export a specific uploaded file's data
    - Export a joined dataset
    - Export any derived table created via SQL ingestion
    """
    import csv
    import io
    import numpy as np
    from app.services.analytics.query_utils import safe_identifier

    if format not in ("csv", "tsv"):
        raise HTTPException(status_code=400, detail="Format must be 'csv' or 'tsv'")

    # Ownership check
    await verify_dataset_owner(
        dataset_id=dataset_id,
        session=session,
        current_user=current_user,
    )

    latest_version = get_latest_version(session=session, dataset_id=dataset_id)
    if not latest_version:
        raise HTTPException(status_code=404, detail="Dataset version not found")

    file_path = (
        latest_version.cleaned_reference
        if latest_version.cleaned_reference
        else latest_version.source_reference
    )

    duckdb_path = await get_or_build_duckdb(dataset_id, latest_version.id, file_path)
    from app.services.storage import get_storage
    if not get_storage().exists(duckdb_path):
        raise HTTPException(status_code=404, detail="DuckDB not ready. Please wait for processing.")

    local_duckdb_path = get_storage().download_to_temp(duckdb_path)
    conn = duckdb.connect(str(local_duckdb_path), read_only=True)
    try:
        # Verify table exists
        tables = conn.execute("SHOW TABLES").df()["name"].tolist()
        if table_name not in tables:
            raise HTTPException(status_code=404, detail=f"Table '{table_name}' not found")

        # Row count limit check before streaming starts
        count_res = conn.execute(f'SELECT COUNT(*) FROM {safe_identifier(table_name)}').fetchone()
        row_count = count_res[0] if count_res else 0
        if row_count > MAX_EXPORT_ROWS:
            raise HTTPException(
                status_code=400,
                detail=f"Table has {row_count:,} rows. Export is limited to "
                       f"{MAX_EXPORT_ROWS:,} rows. Use /export/query with LIMIT "
                       f"to export a subset."
            )

        # Fetch all data
        result = conn.execute(f'SELECT * FROM {safe_identifier(table_name)}')
        columns = [desc[0] for desc in result.description]
        rows = result.fetchall()

        safe_name = re.sub(r"[^\w\-]", "_", table_name)
        safe_name = f"{safe_name}.{format}"
        delimiter = "\t" if format == "tsv" else ","
        media_type = "text/tab-separated-values" if format == "tsv" else "text/csv"

        def generate():
            output = io.StringIO()
            writer = csv.writer(output, delimiter=delimiter, lineterminator="\n")

            writer.writerow(columns)
            yield output.getvalue()
            output.seek(0)
            output.truncate(0)

            for row in rows:
                clean_row = []
                for val in row:
                    if isinstance(val, float) and (np.isnan(val) or np.isinf(val)):
                        clean_row.append("")
                    else:
                        clean_row.append(val)
                writer.writerow(clean_row)
                yield output.getvalue()
                output.seek(0)
                output.truncate(0)

        record_audit_event(
            event_type="DATA_EXPORTED",
            user_id=str(current_user.user_id),
            resource_type="Dataset",
            resource_id=str(dataset_id),
            metadata={
                "export_type": "table",
                "table_name": table_name,
                "row_count": len(rows),
                "format": format,
                "filename": safe_name,
            },
        )

        return StreamingResponse(
            generate(),
            media_type=media_type,
            headers={
                "Content-Disposition": f'attachment; filename="{safe_name}"',
                "X-Result-Row-Count": str(len(rows)),
            },
        )

    finally:
        conn.close()
        try:
            get_storage().cleanup_temp(local_duckdb_path)
        except Exception:
            pass
