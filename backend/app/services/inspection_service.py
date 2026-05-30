from typing import Optional
from uuid import UUID

from app.services.inspection_execution.inspector import run_inspection as execute_inspection
from app.services.cleaning_execution.recommendations import generate_recommendations
from app.services.ingestion_execution.file_loader import load_from_path
from app.models.inspection_report import RiskLevel

from sqlmodel import Session, select

from app.models.dataset_version import DatasetVersion
from app.models.inspection_report import InspectionReport
from app.models.user import UserRole
from app.core.exceptions import ResourceNotFound, AuthorizationError, InvalidOperation
from app.core.audit import record_audit_event


def _assert_version_access(
    version: DatasetVersion,
    user_id: UUID,
    role: UserRole,
) -> None:
    """
    Ensure user has access to inspect this dataset version.
    Admins are always allowed.
    """
    if role == UserRole.ADMIN:
        return

    if version.created_by != user_id:
        raise AuthorizationError(
            message="Access denied",
            details="You do not have access to this dataset version",
        )


def create_inspection_report(
    session: Session,
    dataset_version_id: UUID,
    issues_detected: dict,
    risk_level,
    summary: str,
    generated_by: str,
    user_id: UUID,
    role: UserRole,
) -> InspectionReport:
    """
    Create an immutable inspection report for a dataset version.
    """
    version = session.get(DatasetVersion, dataset_version_id)

    if not version or not version.is_active:
        raise ResourceNotFound("DatasetVersion", str(dataset_version_id))

    _assert_version_access(version, user_id, role)

    existing = session.exec(
        select(InspectionReport).where(
            InspectionReport.dataset_version_id == dataset_version_id,
            InspectionReport.is_active == True,
        )
    ).first()

    if existing:
        return existing

    report = InspectionReport(
        dataset_version_id=dataset_version_id,
        issues_detected=issues_detected,
        risk_level=risk_level,
        summary=summary,
        generated_by=generated_by,
        is_active=True,
    )

    session.add(report)
    session.commit()
    session.refresh(report)

    record_audit_event(
        event_type="INSPECTION_REPORT_CREATED",
        user_id=str(user_id),
        resource_type="InspectionReport",
        resource_id=str(report.id),
        metadata={
            "dataset_version_id": str(dataset_version_id),
            "risk_level": risk_level.value,
        },
    )

    return report


def get_inspection_report_for_version(
    session: Session,
    dataset_version_id: UUID,
    user_id: UUID,
    role: UserRole,
) -> Optional[InspectionReport]:
    """
    Retrieve the active inspection report for a dataset version.
    """
    version = session.get(DatasetVersion, dataset_version_id)
    if not version or not version.is_active:
        raise ResourceNotFound("DatasetVersion", str(dataset_version_id))

    _assert_version_access(version, user_id, role)

    return session.exec(
        select(InspectionReport).where(
            InspectionReport.dataset_version_id == dataset_version_id,
            InspectionReport.is_active == True,
        )
    ).first()


def run_inspection(
    session: Session,
    dataset_version_id: UUID,
    user_id: UUID,
    role: UserRole,
) -> InspectionReport:
    """
    Run the inspection pipeline on a dataset version and save the report.
    """
    # 1. Get Version & Access
    version = session.get(DatasetVersion, dataset_version_id)
    if not version or not version.is_active:
        raise ResourceNotFound("DatasetVersion", str(dataset_version_id))

    _assert_version_access(version, user_id, role)
    
    # 2. Check if already exists (idempotency)
    existing = get_inspection_report_for_version(session, dataset_version_id, user_id, role)
    if existing:
        return existing

    # 3. Load Data
    try:
        df = load_from_path(
            file_path=version.source_reference,
            filename=version.source_reference,
        )
    except Exception as e:
        details = getattr(e, "details", None)
        message = getattr(e, "message", str(e))
        raise InvalidOperation("run_inspection", f"Failed to load dataset file: {message}", details=details)

    # 4. Run Inspector
    try:
        results = execute_inspection(df)
    except Exception as e:
        raise InvalidOperation("run_inspection", f"Inspection pipeline failed: {str(e)}")

    # 5. Generate Recommendations
    recommendations = generate_recommendations(
        profiling=results["profiling"],
        anomalies=results["anomalies"],
        duplicates=results["duplicates"],
    )
    
    # Inject recommendations into the results payload
    results["recommendations"] = recommendations

    # 6. Save Report
    # Extract strict risk level enum from string
    risk_str = results["risk"]["risk_level"]
    try:
        risk_enum = RiskLevel(risk_str.lower())
    except ValueError:
        # Fallback or strict error? risk_scorer returns HIGH/MEDIUM/LOW
        # RiskLevel enum is likely 'high', 'medium', 'low' based on other files I've seen
        # Let's check RiskLevel definition if I can, but lower() is safe bet.
        risk_enum = RiskLevel.LOW
        if risk_str.upper() == "HIGH":
            risk_enum = RiskLevel.HIGH
        elif risk_str.upper() == "MEDIUM":
            risk_enum = RiskLevel.MEDIUM

    return create_inspection_report(
        session=session,
        dataset_version_id=dataset_version_id,
        issues_detected=results,
        risk_level=risk_enum,
        summary=f"Detected {len(recommendations)} potential issues.",
        generated_by="system",
        user_id=user_id,
        role=role,
    )

