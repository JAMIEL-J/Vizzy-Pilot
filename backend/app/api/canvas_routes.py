"""
Canvas workspace API routes.

Belongs to: API layer (Canvas)
Responsibility: Lightweight schema loader and SQL execution for the Canvas UI
Restrictions: Read-only access; all queries go through the security sandbox
"""

import json
import time
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import select

from app.api.deps import DBSession, AuthenticatedUser, RateLimitedUser
from app.api.sql_transparency_routes import (
    SQLExecuteRequest,
    SQLExecuteResponse,
    _get_duckdb_connection,
    _df_to_records_safe,
)
from app.core.logger import get_logger
from app.models.dataset import Dataset
from app.services.dataset_version_service import get_latest_version
from app.services.security.sandbox import execute_sandboxed, QueryExecutionError
import sqlglot

router = APIRouter()
logger = get_logger(__name__)

# Type keywords used for column classification
_NUMERIC_TYPES = frozenset({
    "int", "integer", "smallint", "tinyint", "bigint", "hugeint",
    "float", "double", "real", "decimal", "numeric",
    "int8", "int16", "int32", "int64", "uint8", "uint16", "uint32", "uint64",
    "float4", "float8", "ubigint", "uinteger", "usmallint", "utinyint",
})
_DATE_TYPES = frozenset({
    "date", "time", "timestamp", "timestamptz", "timestamp_s",
    "timestamp_ms", "timestamp_ns", "interval",
    "timestamp with time zone",
})


# =============================================================================
# Request / Response Schemas
# =============================================================================


class CanvasColumnSchema(BaseModel):
    """Single column descriptor for the Canvas UI."""
    name: str
    dtype: str  # raw DuckDB type
    category: str  # 'Metrics' | 'Dimensions' | 'Dates'
    formula: str | None = None

class CanvasSchemaResponse(BaseModel):
    """Lightweight schema payload consumed by the Canvas workspace."""
    dataset_id: str
    version_id: str
    dataset_name: str
    columns: List[CanvasColumnSchema]
    row_count: int


# =============================================================================
# Helpers
# =============================================================================


def _classify_dtype(dtype: str, name: str = "") -> str:
    """Classify a DuckDB type string into Metrics / Dates / Dimensions."""
    lower_name = name.lower().strip()
    # Check column name keywords first for dirty metrics (e.g. TotalCharges stored as string)
    metric_keywords = {"charge", "amount", "sales", "revenue", "profit", "cost", "price", "total", "margin"}
    if any(k in lower_name for k in metric_keywords):
        return "Metrics"

    lower = dtype.lower().strip()
    # Check numeric types (prefix match handles e.g. "DECIMAL(18,2)")
    for keyword in _NUMERIC_TYPES:
        if lower == keyword or lower.startswith(keyword + "("):
            return "Metrics"
    # Check date/time types
    for keyword in _DATE_TYPES:
        if lower == keyword or lower.startswith(keyword + "("):
            return "Dates"
    return "Dimensions"


# =============================================================================
# Endpoints
# =============================================================================


@router.get(
    "/schema",
    response_model=CanvasSchemaResponse,
    summary="Get column schema for the Canvas workspace",
)
async def get_canvas_schema(
    dataset_id: UUID,
    session: DBSession,
    current_user: AuthenticatedUser,
) -> CanvasSchemaResponse:
    """
    Return the column schema for the dataset's latest version.

    Lightweight alternative to getDuckdbStatus — returns only the column
    metadata needed by the Canvas UI without triggering heavy build-status
    lookups or recommendations generation.
    """
    from app.api.deps import verify_dataset_owner

    await verify_dataset_owner(
        dataset_id=dataset_id,
        session=session,
        current_user=current_user,
    )

    # Fetch dataset name
    dataset = session.exec(
        select(Dataset).where(Dataset.id == dataset_id)
    ).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    # Fetch latest version
    latest_version = get_latest_version(session=session, dataset_id=dataset_id)
    if not latest_version:
        raise HTTPException(status_code=404, detail="Dataset version not found")

    # Parse schema_metadata JSON → list of {name, dtype}
    raw_schema: List[Dict[str, str]] = []
    if latest_version.schema_metadata:
        try:
            raw_schema = json.loads(latest_version.schema_metadata)
        except (json.JSONDecodeError, TypeError):
            logger.warning(
                "[CANVAS SCHEMA] Failed to parse schema_metadata for version %s",
                latest_version.id,
            )

    columns = [
        CanvasColumnSchema(
            name=col["name"],
            dtype=col["dtype"],
            category=_classify_dtype(col["dtype"], col["name"]),
            formula=col.get("formula")
        )
        for col in raw_schema
        if "name" in col and "dtype" in col
    ]

    return CanvasSchemaResponse(
        dataset_id=str(dataset_id),
        version_id=str(latest_version.id),
        dataset_name=dataset.name,
        columns=columns,
        row_count=latest_version.row_count,
    )

def _inject_filters_into_sql(sql: str, filters: list, schema_columns: list = None) -> str:
    if not filters:
        return sql
    
    # Build lookup map for formulas
    formula_map = {}
    if schema_columns:
        for c in schema_columns:
            if "name" in c and c.get("formula"):
                formula_map[c["name"]] = c["formula"]

    # Parse the original query directly so we inject into the actual base table or CTE where columns exist
    parsed = sqlglot.parse_one(sql, read="duckdb")
    for f in filters:
      col = getattr(f, "fieldName", None)
      if col is None and isinstance(f, dict):
          col = f.get("fieldName")
      val = getattr(f, "selectedValue", None)
      if val is None and isinstance(f, dict):
          val = f.get("selectedValue")
          
      if not col or val is None:
          continue

      # Resolve fuzzy matches against schema column names to prevent aliasing Binder Errors (e.g. "segment" -> "customer_segment")
      resolved_col = col
      if schema_columns:
          schema_names = []
          for c in schema_columns:
              if isinstance(c, dict) and "name" in c:
                  schema_names.append(c["name"])
              elif isinstance(c, str):
                  schema_names.append(c)

          # 1. Case-insensitive exact match
          matched = next((name for name in schema_names if name.lower() == col.lower()), None)
          # 2. Suffix match (e.g., "segment" matches "customer_segment")
          if not matched:
              matched = next((name for name in schema_names if name.lower().endswith(f"_{col.lower()}")), None)
          # 3. Substring match
          if not matched:
              matched = next((name for name in schema_names if col.lower() in name.lower()), None)

          if matched:
              resolved_col = matched

      # If this is a calculated field, use its formula instead of the alias
      col_expr = f'({formula_map[resolved_col]})' if resolved_col in formula_map else f'"{resolved_col}"'
          
      if isinstance(val, str):
          val_escaped = str(val).replace("'", "''")
          condition = f"{col_expr} = '{val_escaped}'"
      else:
          condition = f"{col_expr} = {val}"
      parsed = parsed.where(condition, append=True)
    return parsed.sql(dialect="duckdb")


@router.post(
    "/sql/execute",
    response_model=SQLExecuteResponse,
    summary="Execute a sandboxed SQL query from the Canvas workspace",
)
async def execute_canvas_sql(
    dataset_id: UUID,
    request: SQLExecuteRequest,
    session: DBSession,
    current_user: AuthenticatedUser,
) -> SQLExecuteResponse:
    """
    Execute a user-provided SQL query against the dataset's DuckDB.

    Thin wrapper around the sandboxed execution engine, scoped under the
    canvas prefix so canvas-specific middleware or rate-limiting can be
    applied independently of the analyst SQL transparency routes.
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

    file_path = (
        latest_version.cleaned_reference
        if latest_version.cleaned_reference
        else latest_version.source_reference
    )
    if not file_path:
        raise HTTPException(
            status_code=422,
            detail="Dataset has no active data file reference."
        )

    conn = None
    try:
        conn = await _get_duckdb_connection(dataset_id, latest_version.id, file_path)

        sql_to_run = request.sql
        filter_omitted = False

        if request.filters:
            try:
                raw_schema = []
                if latest_version.schema_metadata:
                    import json
                    try:
                        raw_schema = json.loads(latest_version.schema_metadata)
                    except Exception:
                        pass
                sql_to_run = _inject_filters_into_sql(request.sql, request.filters, raw_schema)
            except Exception as e:
                logger.warning(f"AST parsing failed for Canvas SQL: {e}")
                sql_to_run = request.sql
                filter_omitted = True

        start_time = time.monotonic()
        try:
            try:
                result_df = await execute_sandboxed(
                    conn=conn,
                    sql=sql_to_run,
                    table_name="data",
                    max_rows=request.max_rows,
                    timeout_seconds=request.timeout_seconds,
                )
            except QueryExecutionError as inner_e:
                # If AST injection caused a column mismatch (or duckdb execution error)
                # and we attempted filtering, fall back to unfiltered query gracefully
                if request.filters and not filter_omitted:
                    logger.info("Filtered execution failed, falling back to unfiltered SQL")
                    filter_omitted = True
                    result_df = await execute_sandboxed(
                        conn=conn,
                        sql=request.sql,
                        table_name="data",
                        max_rows=request.max_rows,
                        timeout_seconds=request.timeout_seconds,
                    )
                else:
                    raise inner_e

            elapsed_ms = (time.monotonic() - start_time) * 1000

            records, truncated = _df_to_records_safe(result_df, request.max_rows)
            columns = result_df.columns.tolist()

            return SQLExecuteResponse(
                sql=request.sql,
                results=records,
                columns=columns,
                row_count=len(records),
                truncated=truncated,
                execution_time_ms=round(elapsed_ms, 1),
                filter_omitted=filter_omitted,
            )
        except QueryExecutionError as e:
            elapsed_ms = (time.monotonic() - start_time) * 1000
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
        logger.exception("[CANVAS SQL EXECUTE] Unexpected error: %s", e)
        raise HTTPException(
            status_code=500,
            detail="An error occurred while executing the query. Please check your SQL syntax.",
        )
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception as e:
                logger.debug("Failed to close DuckDB connection: %s", e)


# =============================================================================
# Calculated Fields Endpoint
# =============================================================================


class CalculateFieldRequest(BaseModel):
    """Payload to request the generation of an AI calculated field."""
    prompt: str


class CalculateFieldResponse(BaseModel):
    """Result payload after successfully adding a calculated field."""
    success: bool
    field_name: str
    formula_sql: str
    category: str
    dtype: str
    schema_: CanvasSchemaResponse = Field(..., alias="schema")


@router.post(
    "/calculate-field",
    response_model=CalculateFieldResponse,
    summary="Generate and validate an AI calculated field",
)
async def create_canvas_calculated_field(
    dataset_id: UUID,
    request: CalculateFieldRequest,
    session: DBSession,
    current_user: RateLimitedUser,
) -> CalculateFieldResponse:
    """
    Generate a new calculated field via AI, validate it in DuckDB,
    and save it in the dataset version's schema_metadata.
    """
    from app.api.deps import verify_dataset_owner
    from app.core.llm_client import get_llm_client, parse_json_response

    await verify_dataset_owner(
        dataset_id=dataset_id,
        session=session,
        current_user=current_user,
    )

    # 1. Fetch latest version
    latest_version = get_latest_version(session=session, dataset_id=dataset_id)
    if not latest_version:
        raise HTTPException(status_code=404, detail="Dataset version not found")

    file_path = (
        latest_version.cleaned_reference
        if latest_version.cleaned_reference
        else latest_version.source_reference
    )
    if not file_path:
        raise HTTPException(status_code=422, detail="Dataset has no active data file reference")

    # 2. Parse current schema metadata
    raw_schema: List[Dict[str, str]] = []
    if latest_version.schema_metadata:
        try:
            raw_schema = json.loads(latest_version.schema_metadata)
        except Exception as e:
            logger.warning("[CANVAS] Failed to parse schema_metadata JSON: %s", e)

    columns_str = ", ".join([
        f'"{col["name"]}" ({col["dtype"]})'
        for col in raw_schema
        if "name" in col and not col.get("is_calculated", False)
    ])

    # 3. Call AI client to detect/infer formula
    system_prompt = (
        "You are an expert data analysis calculated field generator.\n"
        "Your task is to take a user prompt and convert it to a safe, valid DuckDB SQL projection formula expression.\n"
        "Rules:\n"
        "1. Map user terms to exact casing of column names in this dataset schema.\n"
        "2. Keep the SQL formula simple. Use standard DuckDB SQL operators (+, -, *, /).\n"
        "3. Protect divisions by wrapping the denominator in NULLIF(expr, 0) to avoid division by zero.\n"
        "4. Wrap all column names in double quotes.\n"
        "5. CRITICAL: For ratio or percentage metrics (e.g. Profit Margin, ROI), you MUST wrap the individual columns in aggregate functions like SUM() before dividing. Example: SUM(\"Profit\") / NULLIF(SUM(\"Sales\"), 0). Do NOT output row-level division for these.\n"
        "6. Classify the resulting field as 'Metrics' (if numeric) or 'Dimensions' (if category/boolean).\n"
        "7. Standardize the DuckDB datatype (e.g. DOUBLE, VARCHAR, BIGINT).\n"
        "8. Suggest a clean, readable title for the calculated field (e.g. 'Profit Margin' or 'Sales Increase').\n"
        "9. CRITICAL: You MUST ONLY reference column names listed in the user prompt's 'Dataset Columns'. Do NOT hallucinate or assume columns that are not in the schema. If the calculation is impossible with the given columns, return a fallback SQL constant like '1' or '0', or map to the closest semantic match in the schema, but NEVER reference a column name that does not exist in the schema list.\n"
        "Output strictly valid JSON with no markdown blocks: "
        '{"field_name": "Field Title", "formula_sql": "SQL projection snippet", "category": "Metrics", "dtype": "DOUBLE"}'
    )

    user_prompt = (
        f"Dataset Columns: {columns_str}\n"
        f"User Prompt: {request.prompt}"
    )

    client = get_llm_client()
    try:
        response = await client.complete(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=0.0,
            purpose="chat"
        )
        ai_data = parse_json_response(response.content)
    except Exception as e:
        logger.exception("[AI CALCULATE FIELD] Inference failed: %s", e)
        raise HTTPException(status_code=500, detail="The AI model failed to generate a response. Please try rephrasing your prompt.")

    field_name = ai_data.get("field_name", "Calculated Field").strip()
    formula_sql = ai_data.get("formula_sql", "").strip()
    category = ai_data.get("category", "Metrics").strip()
    dtype = ai_data.get("dtype", "DOUBLE").strip()

    if not formula_sql:
        raise HTTPException(status_code=422, detail="Failed to generate a valid SQL formula from prompt.")

    # 4. Dry-run validate the formula in the DuckDB sandbox
    conn = None
    try:
        conn = await _get_duckdb_connection(dataset_id, latest_version.id, file_path)
        test_query = f'SELECT ({formula_sql}) AS "val" FROM data LIMIT 1'
        await execute_sandboxed(
            conn=conn,
            sql=test_query,
            table_name="data",
            max_rows=1,
            timeout_seconds=5
        )
    except Exception as e:
        logger.warning("[AI CALCULATE FIELD] SQL validation failed for formula '%s': %s", formula_sql, e)
        raise HTTPException(
            status_code=422,
            detail="The generated formula could not be validated against the dataset. Please refine your prompt."
        )
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception as e:
                logger.debug("Failed to close DuckDB connection: %s", e)

    # 5. Check if field name already exists to prevent duplicate collisions
    if any(c.get("name", "").lower() == field_name.lower() for c in raw_schema):
         field_name = f"{field_name} (AI)"

    # 6. Append new field metadata registry & save
    new_column = {
        "name": field_name,
        "dtype": dtype,
        "category": category,
        "is_calculated": True,
        "formula": formula_sql
    }
    raw_schema.append(new_column)
    latest_version.schema_metadata = json.dumps(raw_schema)
    
    session.add(latest_version)
    session.commit()
    session.refresh(latest_version)

    # 7. Construct schema response structure
    columns = [
        CanvasColumnSchema(
            name=col["name"],
            dtype=col["dtype"],
            category=col.get("category") or _classify_dtype(col["dtype"]),
            formula=col.get("formula")
        )
        for col in raw_schema
        if "name" in col and "dtype" in col
    ]

    dataset = session.exec(select(Dataset).where(Dataset.id == dataset_id)).first()
    dataset_name = dataset.name if dataset else "Dataset"

    schema_response = CanvasSchemaResponse(
        dataset_id=str(dataset_id),
        version_id=str(latest_version.id),
        dataset_name=dataset_name,
        columns=columns,
        row_count=latest_version.row_count,
    )

    return CalculateFieldResponse(
        success=True,
        field_name=field_name,
        formula_sql=formula_sql,
        category=category,
        dtype=dtype,
        schema=schema_response
    )

@router.delete("/fields/{field_name}", response_model=CanvasSchemaResponse)
async def delete_canvas_field(
    dataset_id: UUID,
    field_name: str,
    session: DBSession,
    current_user: AuthenticatedUser,
):
    """
    Deletes a specific field (e.g. calculated field) from the dataset schema metadata.
    """
    from app.api.deps import verify_dataset_owner

    await verify_dataset_owner(
        dataset_id=dataset_id,
        session=session,
        current_user=current_user,
    )

    latest_version = get_latest_version(session=session, dataset_id=dataset_id)

    if not latest_version:
        raise HTTPException(status_code=404, detail="No active dataset version found")

    raw_schema: List[Dict[str, str]] = []
    if latest_version.schema_metadata:
        try:
            raw_schema = json.loads(latest_version.schema_metadata)
        except Exception as e:
            logger.warning("[CANVAS] Failed to parse schema_metadata for field deletion: %s", e)

    # Filter out the field to delete
    new_schema = [col for col in raw_schema if col.get("name") != field_name]
    
    if len(new_schema) == len(raw_schema):
        raise HTTPException(status_code=404, detail=f"Field '{field_name}' not found in schema")

    latest_version.schema_metadata = json.dumps(new_schema)
    session.add(latest_version)
    session.commit()
    session.refresh(latest_version)

    columns = [
        CanvasColumnSchema(
            name=col["name"],
            dtype=col["dtype"],
            category=col.get("category") or _classify_dtype(col["dtype"]),
            formula=col.get("formula")
        )
        for col in new_schema
        if "name" in col and "dtype" in col
    ]

    dataset = session.exec(select(Dataset).where(Dataset.id == dataset_id)).first()
    dataset_name = dataset.name if dataset else "Dataset"

    return CanvasSchemaResponse(
        dataset_id=str(dataset_id),
        version_id=str(latest_version.id),
        dataset_name=dataset_name,
        columns=columns,
        row_count=latest_version.row_count,
    )


class CanvasCompileRequest(BaseModel):
    """Stateless compilation payload for Canvas prompt compiler."""
    prompt: str
    version_id: Optional[UUID] = None
    force_deep_analysis: bool = False


class CanvasCompileResponse(BaseModel):
    """Result from stateless Canvas prompt compilation."""
    success: bool
    sql: str
    chart: Dict[str, Any]
    explanation: Dict[str, Any]
    timing: Dict[str, Any]
    error: Optional[str] = None


@router.post(
    "/compile",
    response_model=CanvasCompileResponse,
    summary="Compile a prompt query to SQL and chart spec statelessly for the Canvas UI",
)
async def compile_canvas_prompt(
    dataset_id: UUID,
    request: CanvasCompileRequest,
    session: DBSession,
    current_user: RateLimitedUser,
) -> CanvasCompileResponse:
    """
    Compile a prompt directly into a queryable chart specification and SQL query
    without creating or polluting any conversational chat history sessions.
    """
    from app.api.deps import verify_dataset_owner
    from app.models.dataset_version import DatasetVersion
    from app.services.analytics.db_engine import DBEngine
    from app.services.analytics.executor import Executor
    from app.services.visualization.nl2sql_chart_builder import build_chart_from_nl2sql
    from app.services.analytics.table_resolver import resolve_table_name_from_version
    from app.core.storage import get_duckdb_path
    import pandas as pd

    await verify_dataset_owner(
        dataset_id=dataset_id,
        session=session,
        current_user=current_user,
    )

    if request.version_id:
        version = session.get(DatasetVersion, request.version_id)
    else:
        version = get_latest_version(session=session, dataset_id=dataset_id)

    if not version:
        raise HTTPException(status_code=404, detail="Dataset version not found")

    table_name = resolve_table_name_from_version(version)
    duckdb_path = get_duckdb_path(version.dataset_id, version.id)

    db_engine = None
    try:
        if duckdb_path.exists():
            db_engine = DBEngine(db_path=str(duckdb_path), read_only=True)
            db_engine._lock_down_read_con()
        else:
            data_path = version.cleaned_reference or version.source_reference
            db_engine = DBEngine()
            try:
                await db_engine.load_csv(table_name, data_path)
            except Exception as csv_err:
                logger.warning(f"Direct CSV load failed, falling back to Pandas: {csv_err}")
                df = pd.read_csv(data_path)
                await db_engine.load_dataframe(table_name, df)

        executor = Executor()
        nl2sql_result = await executor.run_query(
            user_query=request.prompt,
            db=db_engine,
            table_name=table_name,
            force_deep_analysis=request.force_deep_analysis
        )
    except Exception as e:
        logger.warning(f"Stateless Canvas compiler execution error: {e}")
        return CanvasCompileResponse(
            success=False,
            sql="",
            chart={},
            explanation={},
            timing={},
            error=str(e)
        )
    finally:
        if db_engine is not None:
            db_engine.close()

    if nl2sql_result and nl2sql_result.get("success"):
        chart_output = build_chart_from_nl2sql(nl2sql_result)
        chart_spec = chart_output.get("chart", {})
        explanation = chart_output.get("explanation", {})
        timing = nl2sql_result.get("timing", {})

        return CanvasCompileResponse(
            success=True,
            sql=nl2sql_result.get("sql", ""),
            chart=chart_spec,
            explanation=explanation,
            timing=timing
        )
    else:
        err_msg = nl2sql_result.get("error") if nl2sql_result else "Unknown compilation failure"
        return CanvasCompileResponse(
            success=False,
            sql="",
            chart={},
            explanation={},
            timing={},
            error=err_msg
        )


