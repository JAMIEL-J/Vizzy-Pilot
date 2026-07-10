from fastapi import APIRouter

from app.api import (
    auth_routes,
    user_routes,
    dataset_routes,
    dataset_version_routes,
    inspection_routes,
    cleaning_plan_routes,
    analysis_contract_routes,
    analysis_routes,
    audit_routes,
    analysis_nl_routes,
    upload_routes,
    sql_ingestion_routes,
    sql_transparency_routes,
    relational_routes,
    external_db_routes,
    chat_routes,
    download_routes,
    dashboard_routes,
    dashboard_load_routes,
    analytics_routes,
    canvas_routes,
)


api_router = APIRouter()

api_router.include_router(
    auth_routes.router,
    prefix="/auth",
    tags=["Authentication"],
)

api_router.include_router(
    user_routes.router,
    prefix="/users",
    tags=["Users"],
)

api_router.include_router(
    dataset_routes.router,
    prefix="/datasets",
    tags=["Datasets"],
)

api_router.include_router(
    dataset_version_routes.router,
    prefix="/datasets/{dataset_id}/versions",
    tags=["Dataset Versions"],
)

api_router.include_router(
    upload_routes.router,
    tags=["File Upload"],
)

api_router.include_router(
    sql_ingestion_routes.router,
    tags=["SQL Ingestion"],
)

api_router.include_router(
    sql_transparency_routes.router,
    prefix="/datasets/{dataset_id}",
    tags=["SQL Transparency"],
)

api_router.include_router(
    relational_routes.router,
    tags=["Relational Data"],
)

api_router.include_router(
    external_db_routes.router,
    tags=["External Database"],
)

api_router.include_router(
    inspection_routes.router,
    prefix="/versions/{version_id}/inspection",
    tags=["Inspection"],
)

api_router.include_router(
    cleaning_plan_routes.router,
    prefix="/versions/{version_id}/cleaning",
    tags=["Cleaning Plans"],
)

api_router.include_router(
    analysis_contract_routes.router,
    prefix="/versions/{version_id}/contracts",
    tags=["Analysis Contracts"],
)

api_router.include_router(
    analysis_routes.router,
    prefix="/versions/{version_id}/analysis",
    tags=["Analysis"],
)

api_router.include_router(
    analysis_nl_routes.router,
    tags=["NL Analysis"],
)

api_router.include_router(
    chat_routes.router,
    prefix="/chat",
    tags=["Chat"],
)

api_router.include_router(
    audit_routes.router,
    prefix="/audit",
    tags=["Audit"],
)

api_router.include_router(
    download_routes.router,
    tags=["Downloads"],
)

api_router.include_router(
    dashboard_routes.router,
    tags=["Saved Dashboards"],
)

api_router.include_router(
    dashboard_load_routes.router,
    prefix="/dashboard",
    tags=["Dashboard Load"],
)

api_router.include_router(
    analytics_routes.router,
    tags=["Analytics"],
)

api_router.include_router(
    canvas_routes.router,
    prefix="/datasets/{dataset_id}/canvas",
    tags=["Canvas"],
)
