"""
SQL Transparency API routes.

Belongs to: API layer (Phase 4.1 - Analyst Capabilities)
Responsibility: Provide SQL transparency for analysts — execute, explain, and inspect queries
Restrictions: All queries go through the security sandbox; read-only access enforced
"""

from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.api.deps import DBSession, AuthenticatedUser
from app.core.logger import get_logger
from app.core.audit import record_audit_event
from app.services.dataset_version_service import get_latest_version
from app.services.analytics.duckdb_builder import get_or_build_duckdb, get_duckdb_connection
from app.services.security.sandbox import validate_sql, execute_sandboxed, QueryExecutionError

import duckdb
import pandas as pd

router = APIRouter()
logger = get_logger(__name__)


# =============================================================================
# Request / Response Schemas
# =============================================================================


class CanvasFilter(BaseModel):
    fieldName: str
    selectedValue: Any

class SQLExecuteRequest(BaseModel):
    """Request to execute a user-provided SQL query against a dataset."""
    sql: str = Field(..., min_length=1, max_length=10000)
    max_rows: int = Field(default=1000, ge=1, le=10000)
    timeout_seconds: int = Field(default=30, ge=5, le=120)
    filters: Optional[List[CanvasFilter]] = None


class SQLExecuteResponse(BaseModel):
    """Response from SQL execution with full transparency."""
    sql: str
    results: List[Dict[str, Any]]
    columns: List[str]
    row_count: int
    truncated: bool = False
    execution_time_ms: float = 0.0
    error: Optional[str] = None
    filter_omitted: bool = False


class SQLExplainRequest(BaseModel):
    """Request to get the query plan for a SQL statement."""
    sql: str = Field(..., min_length=1, max_length=10000)


class SQLExplainResponse(BaseModel):
    """Response with DuckDB query plan."""
    sql: str
    plan: str
    estimated_cardinality: Optional[int] = None
    error: Optional[str] = None


class SQLValidateRequest(BaseModel):
    """Request to validate a SQL query without executing it."""
    sql: str = Field(..., min_length=1, max_length=10000)


class SQLValidateResponse(BaseModel):
    """Response from SQL validation."""
    sql: str
    is_valid: bool
    reason: str = ""
    normalized_sql: Optional[str] = None


# =============================================================================
# Helpers
# =============================================================================

_get_duckdb_connection = get_duckdb_connection


def _df_to_records_safe(df: pd.DataFrame, max_rows: int) -> tuple[list[dict[str, Any]], bool]:
    """Convert DataFrame to list of dicts, handling NaN/Inf, with truncation flag."""
    import numpy as np

    if len(df) > max_rows:
        df = df.iloc[:max_rows]
        truncated = True
    else:
        truncated = False

    # ponytail: Vectorized C-level replacement eliminates O(N*C) iterrows Python object checks
    cleaned_df = df.replace([np.inf, -np.inf], np.nan).astype(object).where(pd.notnull(df), None)
    records = cleaned_df.to_dict(orient="records")
    return records, truncated


# =============================================================================
# Endpoints
# =============================================================================


@router.post(
    "/sql/execute",
    response_model=SQLExecuteResponse,
    summary="Execute a SQL query against a dataset (read-only, sandboxed)",
)
async def execute_sql_query(
    dataset_id: UUID,
    request: SQLExecuteRequest,
    session: DBSession,
    current_user: AuthenticatedUser,
) -> SQLExecuteResponse:
    """
    Execute a user-provided SQL query against the dataset's DuckDB.

    The query is validated through the security sandbox:
    - Only SELECT statements allowed
    - No writes, drops, or side effects
    - Table access scoped to the dataset
    - Timeout enforced

    Returns the SQL used, results, column names, and execution metadata.
    """
    from app.api.deps import verify_dataset_owner
    import time

    # Ownership check
    await verify_dataset_owner(
        dataset_id=dataset_id,
        session=session,
        current_user=current_user,
    )

    # Load dataset version
    latest_version = get_latest_version(session=session, dataset_id=dataset_id)
    if not latest_version:
        raise HTTPException(status_code=404, detail="Dataset version not found")

    file_path = (
        latest_version.cleaned_reference
        if latest_version.cleaned_reference
        else latest_version.source_reference
    )

    conn = None
    try:
        conn = await _get_duckdb_connection(dataset_id, latest_version.id, file_path)

        # Use the sandboxed execution path
        start_time = time.monotonic()
        try:
            result_df = await execute_sandboxed(
                conn=conn,
                sql=request.sql,
                table_name="data",
                max_rows=request.max_rows,
                timeout_seconds=request.timeout_seconds,
            )
            elapsed_ms = (time.monotonic() - start_time) * 1000

            records, truncated = _df_to_records_safe(result_df, request.max_rows)
            columns = result_df.columns.tolist()

            import hashlib
            query_hash = hashlib.sha256(request.sql.encode("utf-8")).hexdigest()
            record_audit_event(
                event_type="QUERY_EXECUTED",
                user_id=str(current_user.user_id),
                resource_type="Dataset",
                resource_id=str(dataset_id),
                metadata={
                    "query_hash": query_hash,
                    "row_count": len(records),
                    "truncated": truncated,
                },
            )

            return SQLExecuteResponse(
                sql=request.sql,
                results=records,
                columns=columns,
                row_count=len(records),
                truncated=truncated,
                execution_time_ms=round(elapsed_ms, 1),
            )
        except QueryExecutionError as e:
            elapsed_ms = (time.monotonic() - start_time) * 1000
            import hashlib
            query_hash = hashlib.sha256(request.sql.encode("utf-8")).hexdigest()
            record_audit_event(
                event_type="QUERY_EXECUTED",
                user_id=str(current_user.user_id),
                resource_type="Dataset",
                resource_id=str(dataset_id),
                metadata={
                    "query_hash": query_hash,
                    "row_count": 0,
                    "error": str(e),
                },
            )
            return SQLExecuteResponse(
                sql=request.sql,
                results=[],
                columns=[],
                row_count=0,
                execution_time_ms=round(elapsed_ms, 1),
                error=str(e),
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("[SQL EXECUTE] Unexpected error: %s", e)
        raise HTTPException(
            status_code=500,
            detail=f"Error executing SQL: {str(e)}",
        )
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass


@router.post(
    "/sql/explain",
    response_model=SQLExplainResponse,
    summary="Get the query plan for a SQL statement",
)
async def explain_sql_query(
    dataset_id: UUID,
    request: SQLExplainRequest,
    session: DBSession,
    current_user: AuthenticatedUser,
) -> SQLExplainResponse:
    """
    Return the DuckDB EXPLAIN plan for a SQL query.

    Validates the query first (must be SELECT-only, sandboxed).
    Then runs EXPLAIN without actually executing the query.
    """
    from app.api.deps import verify_dataset_owner

    # Ownership check
    await verify_dataset_owner(
        dataset_id=dataset_id,
        session=session,
        current_user=current_user,
    )

    # Validate the SQL first
    is_valid, reason, parsed = validate_sql(request.sql, "data")
    if not is_valid:
        return SQLExplainResponse(
            sql=request.sql,
            plan="",
            error=f"SQL validation failed: {reason}",
        )

    # Load dataset version
    latest_version = get_latest_version(session=session, dataset_id=dataset_id)
    if not latest_version:
        raise HTTPException(status_code=404, detail="Dataset version not found")

    file_path = (
        latest_version.cleaned_reference
        if latest_version.cleaned_reference
        else latest_version.source_reference
    )

    conn = None
    try:
        conn = await _get_duckdb_connection(dataset_id, latest_version.id, file_path)

        # Run EXPLAIN
        explain_sql = f"EXPLAIN {request.sql}"
        try:
            result = conn.execute(explain_sql)
            plan_rows = result.fetchall()
            # DuckDB EXPLAIN returns rows with (name, plan_text) or just plan text
            plan_text = "\n".join(
                str(row[1]) if len(row) > 1 else str(row[0])
                for row in plan_rows
            )

            # Try to get estimated cardinality from the plan
            estimated_card = None
            try:
                import re
                card_result = conn.execute(
                    f"EXPLAIN SELECT * FROM ({request.sql}) _subq LIMIT 0"
                ).fetchall()
                for row in card_result:
                    row_text = str(row)
                    if "cardinality" in row_text.lower():
                        match = re.search(r"cardinality.*?(\d+)", row_text, re.IGNORECASE)
                        if match:
                            estimated_card = int(match.group(1))
            except Exception:
                pass

            return SQLExplainResponse(
                sql=request.sql,
                plan=plan_text,
                estimated_cardinality=estimated_card,
            )
        except Exception as e:
            return SQLExplainResponse(
                sql=request.sql,
                plan="",
                error=f"EXPLAIN failed: {str(e)}",
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("[SQL EXPLAIN] Unexpected error: %s", e)
        raise HTTPException(
            status_code=500,
            detail=f"Error explaining SQL: {str(e)}",
        )
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass


@router.post(
    "/sql/validate",
    response_model=SQLValidateResponse,
    summary="Validate a SQL query without executing it",
)
async def validate_sql_query(
    dataset_id: UUID,
    request: SQLValidateRequest,
    session: DBSession,
    current_user: AuthenticatedUser,
) -> SQLValidateResponse:
    """
    Validate a SQL query for syntax and security without executing it.

    Checks:
    - SQL syntax is valid (parseable by sqlglot)
    - Only SELECT statements allowed
    - No blocked patterns (file access, DDL, etc.)
    - Table references scoped to the dataset
    """
    from app.api.deps import verify_dataset_owner

    # Ownership check
    await verify_dataset_owner(
        dataset_id=dataset_id,
        session=session,
        current_user=current_user,
    )

    is_valid, reason, parsed = validate_sql(request.sql, "data")

    normalized_sql = None
    if is_valid and parsed is not None:
        try:
            normalized_sql = parsed.sql(dialect="duckdb")
        except Exception:
            normalized_sql = request.sql

    return SQLValidateResponse(
        sql=request.sql,
        is_valid=is_valid,
        reason=reason,
        normalized_sql=normalized_sql,
    )