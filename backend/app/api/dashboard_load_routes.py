import logging
import asyncio
import json
from uuid import UUID
from typing import AsyncGenerator, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.api.deps import DBSession, AuthenticatedUserHeaderOrQuery
from app.models.dataset_version import DatasetVersion
from app.services.analytics.chart_recommender import generate_chart_configs
from app.services.analytics.execution_router import execute_dashboard_load
from app.services.analytics.db_engine import get_db_engine

router = APIRouter()
logger = logging.getLogger(__name__)

@router.get("/configs/{version_id}")
async def get_dashboard_configs(
    version_id: UUID,
    session: DBSession,
    current_user: AuthenticatedUserHeaderOrQuery,
) -> Dict[str, Any]:
    """
    Fetch the deterministic chart configurations for a dataset version.
    Used by frontend to render skeletons before streaming data.
    """
    version = session.get(DatasetVersion, version_id)
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")

    if not version.semantic_map_json:
        raise HTTPException(status_code=400, detail="No approved semantic map found for this version")

    configs = generate_chart_configs(version.semantic_map_json)
    return {
        "version_id": version_id,
        "configs": configs
    }

async def dashboard_event_generator(
    version_id: UUID,
    session: DBSession,
) -> AsyncGenerator[str, None]:
    """
    SSE generator that streams dashboard components as they are executed.
    """
    try:
        version = session.get(DatasetVersion, version_id)
        if not version:
            yield f"data: {json.dumps({'error': 'Version not found'})}\n\n"
            return

        if not version.semantic_map_json:
            yield f"data: {json.dumps({'error': 'No approved semantic map found for this version'})}\n\n"
            return

        # Get the persistent DuckDB path for this version
        from app.services.analytics.duckdb_builder import get_duckdb_path
        from app.services.analytics.db_engine import DBEngine
        
        duckdb_path = get_duckdb_path(version.dataset_id, version.id)
        if not duckdb_path.exists():
            yield f"data: {json.dumps({'error': 'DuckDB file not found for this version'})}\n\n"
            return

        # Create a dedicated engine for this version's file
        db_engine = DBEngine(db_path=str(duckdb_path))
        # Force read connection initialization
        db_engine._lock_down_read_con()
        conn = db_engine._read_con
        
        chart_configs = generate_chart_configs(version.semantic_map_json)
        filters = {}
        kpi_configs = {} 
        
        async for result in execute_dashboard_load(
            conn=conn,
            chart_configs=chart_configs,
            kpi_configs=kpi_configs,
            filters=filters,
            dataset_id=version.dataset_id
        ):
            yield f"data: {json.dumps(result)}\n\n"
            
        yield "data: {\"event\": \"done\"}\n\n"
        
    except Exception as e:
        logger.exception(f"Error streaming dashboard for version {version_id}: {e}")
        yield f"data: {json.dumps({'error': 'Internal server error during dashboard load'})}\n\n"

@router.get("/load/{version_id}")
async def load_dashboard(
    version_id: UUID,
    session: DBSession,
    current_user: AuthenticatedUserHeaderOrQuery,
) -> StreamingResponse:
    """
    SSE endpoint to stream dashboard data.
    """
    return StreamingResponse(
        dashboard_event_generator(version_id, session),
        media_type="text/event-stream"
    )
