from typing import List, Optional, Dict, Any, Literal
from uuid import UUID
import json

from sqlmodel import Session, select, func

from app.models.dataset import Dataset
from app.models.dataset_version import DatasetVersion, SourceType
from app.models.user import UserRole
from app.core.exceptions import ResourceNotFound, AuthorizationError, ValidationError
from app.core.audit import record_audit_event

from app.models.chart_customization import ChartCustomization
from datetime import datetime, timezone
from app.core.logger import get_logger

logger = get_logger(__name__)


def _assert_dataset_access(
    dataset: Dataset,
    user_id: UUID,
    role: UserRole,
) -> None:
    """Ensure user can create versions for this dataset."""
    if role == UserRole.ADMIN:
        return

    if dataset.owner_id != user_id:
        raise AuthorizationError(
            message="Access denied",
            details="You do not have access to this dataset",
        )


def _get_next_version_number(
    session: Session,
    dataset_id: UUID,
) -> int:
    """
    Get the next version number for a dataset.
    NOTE: Assumes serialized writes at service/API level.
    """
    result = session.exec(
        select(func.max(DatasetVersion.version_number)).where(
            DatasetVersion.dataset_id == dataset_id
        )
    ).first()

    return (result or 0) + 1


def create_dataset_version(
    session: Session,
    dataset_id: UUID,
    source_type: SourceType,
    source_reference: str,
    schema_hash: str,
    created_by: UUID,
    role: UserRole,
    row_count: Optional[int] = None,
    status: str = "ready",
    schema_metadata: Optional[str] = None,
) -> DatasetVersion:
    """
    Create a new immutable dataset version.
    """
    dataset = session.get(Dataset, dataset_id)

    if not dataset or not dataset.is_active:
        raise ResourceNotFound("Dataset", str(dataset_id))

    _assert_dataset_access(dataset, created_by, role)

    version_number = _get_next_version_number(session, dataset_id)

    version = DatasetVersion(
        dataset_id=dataset_id,
        version_number=version_number,
        source_type=source_type,
        source_reference=source_reference,
        row_count=row_count,
        schema_hash=schema_hash,
        status=status,
        schema_metadata=schema_metadata,
        created_by=created_by,
        is_active=True,
    )

    session.add(version)
    session.commit()
    session.refresh(version)

    record_audit_event(
        event_type="DATASET_VERSION_CREATED",
        user_id=str(created_by),
        resource_type="DatasetVersion",
        resource_id=str(version.id),
        metadata={
            "dataset_id": str(dataset_id),
            "version_number": version_number,
            "source_type": source_type.value,
        },
    )

    return version


def list_versions_for_dataset(
    session: Session,
    dataset_id: UUID,
) -> List[DatasetVersion]:
    """List all active versions for a dataset."""
    statement = (
        select(DatasetVersion)
        .where(
            DatasetVersion.dataset_id == dataset_id,
            DatasetVersion.is_active == True,
        )
        .order_by(DatasetVersion.version_number.desc())
    )

    return list(session.exec(statement).all())


def get_latest_version(
    session: Session,
    dataset_id: UUID,
) -> DatasetVersion:
    """Get the latest active dataset version."""
    statement = (
        select(DatasetVersion)
        .where(
            DatasetVersion.dataset_id == dataset_id,
            DatasetVersion.is_active == True,
        )
        .order_by(DatasetVersion.version_number.desc())
        .limit(1)
    )

    version = session.exec(statement).first()

    if not version:
        raise ResourceNotFound("DatasetVersion", f"dataset_id={dataset_id}")

    return version


def get_version_by_id(
    session: Session,
    version_id: UUID,
) -> DatasetVersion:
    """Fetch a dataset version by ID."""
    version = session.get(DatasetVersion, version_id)

    if not version or not version.is_active:
        raise ResourceNotFound("DatasetVersion", str(version_id))

    return version


def _fetch_column_profiles_for_ui(
    dataset_id: str,
    version_id: str,
    schema: list,
) -> Dict[str, Dict[str, Any]]:
    """Fetch column profile data (samples, stats) for the MappingReviewPanel UI."""
    from app.services.semantic_audit import _table_name, _fetch_column_samples, _fetch_column_stats
    from app.core.storage import get_duckdb_path
    import duckdb

    profiles = {}
    duckdb_path = get_duckdb_path(dataset_id, version_id)

    if not duckdb_path.exists():
        return profiles

    try:
        conn = duckdb.connect(str(duckdb_path), read_only=True)
        table = _table_name(dataset_id)
        schema_dtype = {c["name"]: c.get("dtype", "string") for c in schema}
        # Fetch total row count for cardinality calculation
        from app.services.analytics.query_utils import execute, safe_identifier
        total_rows = execute(conn, f'SELECT COUNT(*) FROM {safe_identifier(table)}').fetchone()[0] or 1

        for col_info in schema:
            col = col_info["name"]
            samples = _fetch_column_samples(conn, table, col, limit=5)
            stats = _fetch_column_stats(conn, table, col)
            dtype = schema_dtype.get(col, "string")

            # Detect column type flags from dtype string
            is_numeric = dtype in ("int64", "float64", "int32", "float32", "number")
            is_datetime = "datetime" in dtype.lower() or "date" in dtype.lower()

            # Compute mean for numeric columns
            mean_val = None
            if is_numeric:
                try:
                    raw_mean = execute(conn, f'SELECT AVG({safe_identifier(col)}) FROM {safe_identifier(table)}').fetchone()[0]
                    mean_val = round(float(raw_mean), 4) if raw_mean is not None else None
                except Exception:
                    pass

            profiles[col] = {
                "dtype": dtype,
                "samples": samples[:5],
                "is_numeric": is_numeric,
                "is_datetime": is_datetime,
                "cardinality": round(stats["unique_count"] / max(1, total_rows), 4) if stats["unique_count"] else None,
                "unique_count": stats["unique_count"],
                "min": stats["min"],
                "max": stats["max"],
                "mean": mean_val,
                "is_currency_pattern": False,
                "top_values": None,
            }

        conn.close()
    except Exception as e:
        logger.warning(f"Failed to fetch column profiles for UI: {e}")

    return profiles


def _fetch_historical_corrections(session: Session, dataset_id: UUID) -> str:
    """Fetch past user corrections for this dataset to feed into the LLM prompt."""
    try:
        from app.models.mapping_correction import MappingCorrection
        from sqlmodel import select
        
        statement = (
            select(MappingCorrection)
            .where(MappingCorrection.dataset_id == dataset_id)
            .order_by(MappingCorrection.created_at.desc())
            .limit(20)
        )
        corrections = session.exec(statement).all()
        
        if not corrections:
            return ""
            
        text_lines = []
        for c in corrections:
            dtype_str = f" (dtype: {c.column_dtype})" if c.column_dtype else ""
            text_lines.append(f"- Column '{c.column_name}'{dtype_str} was proposed as '{c.proposed_role}', but corrected to '{c.corrected_role}'.")
            
        return "\n".join(text_lines)
    except Exception as e:
        logger.warning(f"Failed to fetch historical corrections: {e}")
        return ""

async def propose_semantic_mapping(
    session: Session,
    version_id: UUID,
) -> Dict[str, Any]:
    """
    Analyze a dataset version and propose a semantic mapping.
    This is the lauchpad for the 'Human-in-the-Loop' verification flow.
    """
    from app.services.semantic_audit import run_semantic_audit, CONFIDENCE_AUTO_ACCEPT, CONFIDENCE_FLAGGED
    from app.core.llm_client import get_llm_client

    version = get_version_by_id(session, version_id)

    # 1. Run semantic audit (DuckDB samples + stats + LLM batching)
    if not version.schema_metadata:
        raise ResourceNotFound("Schema", f"version_id={version_id}")

    schema = json.loads(version.schema_metadata)

    # Fetch past user corrections
    corrections_text = _fetch_historical_corrections(session, version.dataset_id)

    try:
        llm_client = get_llm_client()
        results = await run_semantic_audit(
            dataset_id=str(version.dataset_id),
            version_id=str(version.id),
            schema=schema,
            llm_router=llm_client,
            corrections_text=corrections_text,
        )
    except Exception as audit_err:
        # Fallback: if LLM or DuckDB sampling fails, return a deterministic default proposal
        logger.warning(
            "Semantic audit failed, falling back to unclassified defaults: %s",
            audit_err,
            exc_info=True,
        )
        results = []

    # Fetch profile data for UI enrichment
    column_profiles = _fetch_column_profiles_for_ui(
        dataset_id=str(version.dataset_id),
        version_id=str(version.id),
        schema=schema,
    )

    # 2. Structure proposal for MappingReviewPanel
    proposals = []

    if results:
        for item in results:
            role = item.get("role", "unclassified")
            confidence = float(item.get("confidence", 0.0))
            evidence = item.get("reasoning", "") or item.get("evidence", "")
            column_name = item.get("column") or item.get("name") or item.get("column_name")
            if not column_name:
                continue
            status = (
                "auto_accepted" if confidence >= CONFIDENCE_AUTO_ACCEPT else
                "flagged" if confidence >= CONFIDENCE_FLAGGED else
                "unclassified"
            )

            if status == "unclassified":
                role = "unclassified"

            proposals.append({
                "column_name": column_name,
                "role": role,
                "confidence": confidence,
                "evidence": evidence,
                "status": status,
                "profile": column_profiles.get(column_name, None),
            })
    else:
        # Deterministic fallback based on schema only
        for col in schema:
            column_name = col.get("name")
            if not column_name:
                continue
            proposals.append({
                "column_name": column_name,
                "role": "unclassified",
                "confidence": 0.0,
                "evidence": "LLM unavailable; defaulted to unclassified",
                "status": "unclassified",
                "profile": column_profiles.get(column_name, None),
            })

    return {
        "version_id": str(version.id),
        "proposal": {
            "metadata": {
                "proposals": proposals
            }
        }
    }


def confirm_semantic_mapping(
    session: Session,
    version_id: UUID,
    confirmed_map: Dict[str, str],
    corrections: Optional[List[Dict[str, str]]] = None,
    approved_by: Optional[UUID] = None,
) -> DatasetVersion:
    """
    Save the user-confirmed semantic map to the dataset version.
    Format: {column_name: role}  e.g. {"Sales": "revenue", "Order_Date": "date"}
    """
    version = get_version_by_id(session, version_id)

    # Validation: Reject if any column is mapped to "unclassified"
    # In {column: role} format, values are roles
    if any(role == "unclassified" for role in confirmed_map.values()):
        raise ValidationError(
            message="Invalid semantic mapping",
            details="All columns must be assigned a valid role. 'unclassified' is not allowed."
        )

    # Store confirmed map as {column: role}
    if not approved_by:
        approved_by = version.created_by
    version.semantic_map_json = json.dumps(dict(confirmed_map))
    version.approved_by = approved_by
    version.approved_at = datetime.now(timezone.utc)
    version.change_type = version.change_type or "initial_approval"

    session.add(version)

    # Save corrections if provided
    if corrections:
        from app.models.mapping_correction import MappingCorrection
        import uuid
        
        # Get schema to find dtype
        schema = json.loads(version.schema_metadata) if version.schema_metadata else []
        schema_dtype = {c["name"]: c.get("dtype", "string") for c in schema}
        
        for c in corrections:
            correction = MappingCorrection(
                id=uuid.uuid4(),
                dataset_id=version.dataset_id,
                version_id=version.id,
                column_name=c["column"],
                proposed_role=c["proposed_role"],
                corrected_role=c["corrected_role"],
                column_dtype=schema_dtype.get(c["column"]),
                corrected_by=approved_by
            )
            session.add(correction)

    session.commit()
    session.refresh(version)

    return version



def remap_semantic_mapping(
    session: Session,
    version_id: UUID,
    confirmed_map: Dict[str, str],
    approved_by: UUID,
) -> DatasetVersion:
    """
    Create a new DatasetVersion with updated semantic_map_json.
    Does not mutate existing version.
    """
    current = get_version_by_id(session, version_id)

    new_version_number = _get_next_version_number(session, current.dataset_id)

    if not approved_by:
        approved_by = current.created_by

    new_version = DatasetVersion(
        dataset_id=current.dataset_id,
        version_number=new_version_number,
        source_type=current.source_type,
        source_reference=current.source_reference,
        cleaned_reference=current.cleaned_reference,
        row_count=current.row_count,
        schema_hash=current.schema_hash,
        schema_metadata=current.schema_metadata,
        semantic_map_json=json.dumps(dict(confirmed_map)),
        status=current.status,
        created_by=approved_by,
        is_active=True,
        parent_version_id=current.id,
        change_type="remap",
        approved_by=approved_by,
        approved_at=datetime.now(timezone.utc),
        chart_configs_json=current.chart_configs_json,
    )

    session.add(new_version)
    session.commit()
    session.refresh(new_version)

    return new_version


def preview_remap_impact(
    session: Session,
    version_id: UUID,
    proposed_map: Dict[str, str],
    user_id: UUID,
) -> Dict[str, Any]:
    """
    Compare proposed map to current confirmed map and return affected charts.
    ImpactSeverity = Literal["x_axis_changes", "y_axis_changes", "groupby_changes"]
    Handles both {column: role} and legacy {role: column} formats.
    """
    from app.services.analytics.role_resolver import normalize_to_col_role

    current = get_version_by_id(session, version_id)

    # Normalize both maps to {column: role} format
    current_col_role = normalize_to_col_role(current.semantic_map_json or "{}")
    new_col_role = dict(proposed_map)

    # Detect format of proposed_map and normalize if legacy
    from app.services.analytics.role_resolver import detect_map_format
    if detect_map_format(new_col_role) == "role_to_col":
        new_col_role = {col: role for role, col in new_col_role.items()}

    # Identify columns whose role has changed
    changed_columns = {
        col for col, role in new_col_role.items()
        if current_col_role.get(col) != role
    }

    # Resolve affected chart configs
    charts = json.loads(current.chart_configs_json or "[]")
    affected = []
    for chart in charts:
        x_col = chart.get("x_col")
        y_col = chart.get("y_col")
        group_col = chart.get("group_col")

        impact: Optional[Literal["x_axis_changes", "y_axis_changes", "groupby_changes"]] = None

        for col in changed_columns:
            if x_col == col:
                impact = "x_axis_changes"
            elif y_col == col:
                impact = "y_axis_changes"
            elif group_col == col:
                impact = "groupby_changes"

        if impact:
            affected.append({
                "chart_id": chart.get("chart_id"),
                "chart_title": chart.get("title"),
                "impact": impact,
            })

    # Manually customized charts
    customized = session.exec(
        select(ChartCustomization)
        .where(ChartCustomization.dataset_version_id == current.id)
        .where(ChartCustomization.user_id == user_id)
    ).all()
    customized_ids = [c.chart_id for c in customized]

    return {
        "affected_charts": affected,
        "manually_customized_charts": customized_ids,
    }

def resolve_semantic_map(session: Session, version: DatasetVersion) -> str | None:
    if version.semantic_map_json:
        return version.semantic_map_json
    sibling = session.exec(
        select(DatasetVersion)
        .where(
            DatasetVersion.dataset_id == version.dataset_id,
            DatasetVersion.is_active == True,
            DatasetVersion.semantic_map_json.is_not(None),
        )
        .order_by(DatasetVersion.version_number.desc())
    ).first()
    return sibling.semantic_map_json if sibling else None


def delete_version(
    session: Session,
    version_id: UUID,
    user_id: UUID,
    role: UserRole,
) -> DatasetVersion:
    """
    Deactivate (soft delete) a specific dataset version.
    """
    from app.models.dataset_version import DatasetVersion
    from app.services.dataset_service import get_dataset_by_id

    version = session.get(DatasetVersion, version_id)
    if not version:
        raise ResourceNotFound("DatasetVersion", str(version_id))

    # Verify user has access to the dataset
    get_dataset_by_id(session, version.dataset_id, user_id, role)

    if not version.is_active:
        raise InvalidOperation(
            operation="delete_version",
            reason="Version is already deleted/inactive",
        )

    version.is_active = False
    session.add(version)
    session.commit()
    session.refresh(version)

    record_audit_event(
        event_type="DATASET_VERSION_DELETED",
        user_id=str(user_id),
        resource_type="DatasetVersion",
        resource_id=str(version.id),
    )

    return version
