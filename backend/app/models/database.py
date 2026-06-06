"""
Database engine and session management.

Belongs to: models layer
Responsibility: SQLAlchemy engine, session factory, connection pooling
Restrictions: No business logic, no API concerns
"""

from pathlib import Path
from sqlmodel import SQLModel, Session, create_engine
from typing import Generator
from sqlalchemy import inspect, text

from app.core.config import get_settings


# Get settings
settings = get_settings()

# Ensure data directory exists for SQLite
if settings.database.is_sqlite:
    db_path = Path(settings.database.sqlite_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)

# Create engine - different config for SQLite vs PostgreSQL
if settings.database.is_sqlite:
    engine = create_engine(
        settings.database.url,
        echo=settings.database.echo,
        connect_args={"check_same_thread": False},  # Required for SQLite + FastAPI
    )
else:
    engine = create_engine(
        settings.database.url,
        echo=settings.database.echo,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=10,
    )


def init_db() -> None:
    """
    Initialize database tables.
    
    Call this on application startup to create all tables.
    In production, use Alembic migrations instead.
    """
    SQLModel.metadata.create_all(engine)
    _ensure_users_name_column()
    _ensure_users_llm_settings_column()
    _ensure_dataset_versions_semantic_map_json_column()
    _ensure_dataset_versions_status_column()
    _ensure_dataset_versions_schema_json_column()
    _ensure_dataset_versions_parent_version_id_column()
    _ensure_dataset_versions_change_type_column()
    _ensure_dataset_versions_approved_by_column()
    _ensure_dataset_versions_approved_at_column()
    _ensure_dataset_versions_chart_configs_json_column()


def _ensure_users_llm_settings_column() -> None:
    """Best-effort schema patch for users.llm_settings."""
    inspector = inspect(engine)
    if "users" not in inspector.get_table_names():
        return

    columns = {col["name"] for col in inspector.get_columns("users")}
    if "llm_settings" in columns:
        return

    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE users ADD COLUMN llm_settings TEXT"))


def _ensure_users_name_column() -> None:
    """Best-effort schema patch for legacy DBs missing users.name."""
    inspector = inspect(engine)
    if "users" not in inspector.get_table_names():
        return

    columns = {col["name"] for col in inspector.get_columns("users")}
    if "name" in columns:
        return

    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE users ADD COLUMN name VARCHAR(120)"))

        if settings.database.is_sqlite:
            conn.execute(
                text(
                    """
                    UPDATE users
                    SET name = CASE
                        WHEN instr(email, '@') > 0 THEN substr(email, 1, instr(email, '@') - 1)
                        ELSE email
                    END
                    WHERE name IS NULL
                    """
                )
            )
        else:
            conn.execute(
                text(
                    """
                    UPDATE users
                    SET name = CASE
                        WHEN position('@' in email) > 0 THEN split_part(email, '@', 1)
                        ELSE email
                    END
                    WHERE name IS NULL
                    """
                )
            )



def _ensure_dataset_versions_semantic_map_json_column() -> None:
    """Best-effort schema patch for legacy dataset_versions tables."""
    inspector = inspect(engine)
    if "dataset_versions" not in inspector.get_table_names():
        return

    columns = {col["name"] for col in inspector.get_columns("dataset_versions")}
    if "semantic_map_json" in columns:
        return

    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE dataset_versions ADD COLUMN semantic_map_json TEXT"))


def _ensure_dataset_versions_status_column() -> None:
    """Best-effort schema patch for legacy dataset_versions tables."""
    inspector = inspect(engine)
    if "dataset_versions" not in inspector.get_table_names():
        return

    columns = {col["name"] for col in inspector.get_columns("dataset_versions")}
    if "status" in columns:
        return

    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE dataset_versions ADD COLUMN status VARCHAR(32) DEFAULT 'ready'"))


def _ensure_dataset_versions_schema_json_column() -> None:
    """Best-effort schema patch for legacy dataset_versions tables."""
    inspector = inspect(engine)
    if "dataset_versions" not in inspector.get_table_names():
        return

    columns = {col["name"] for col in inspector.get_columns("dataset_versions")}
    if "schema_json" in columns:
        return

    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE dataset_versions ADD COLUMN schema_json TEXT"))


def _ensure_dataset_versions_parent_version_id_column() -> None:
    """Best-effort schema patch for legacy dataset_versions tables."""
    inspector = inspect(engine)
    if "dataset_versions" not in inspector.get_table_names():
        return

    columns = {col["name"] for col in inspector.get_columns("dataset_versions")}
    if "parent_version_id" in columns:
        return

    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE dataset_versions ADD COLUMN parent_version_id VARCHAR(36)"))


def _ensure_dataset_versions_change_type_column() -> None:
    """Best-effort schema patch for legacy dataset_versions tables."""
    inspector = inspect(engine)
    if "dataset_versions" not in inspector.get_table_names():
        return

    columns = {col["name"] for col in inspector.get_columns("dataset_versions")}
    if "change_type" in columns:
        return

    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE dataset_versions ADD COLUMN change_type VARCHAR(64)"))


def _ensure_dataset_versions_approved_by_column() -> None:
    """Best-effort schema patch for legacy dataset_versions tables."""
    inspector = inspect(engine)
    if "dataset_versions" not in inspector.get_table_names():
        return

    columns = {col["name"] for col in inspector.get_columns("dataset_versions")}
    if "approved_by" in columns:
        return

    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE dataset_versions ADD COLUMN approved_by VARCHAR(36)"))


def _ensure_dataset_versions_approved_at_column() -> None:
    """Best-effort schema patch for legacy dataset_versions tables."""
    inspector = inspect(engine)
    if "dataset_versions" not in inspector.get_table_names():
        return

    columns = {col["name"] for col in inspector.get_columns("dataset_versions")}
    if "approved_at" in columns:
        return

    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE dataset_versions ADD COLUMN approved_at DATETIME"))


def _ensure_dataset_versions_chart_configs_json_column() -> None:
    """Best-effort schema patch for legacy dataset_versions tables."""
    inspector = inspect(engine)
    if "dataset_versions" not in inspector.get_table_names():
        return

    columns = {col["name"] for col in inspector.get_columns("dataset_versions")}
    if "chart_configs_json" in columns:
        return

    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE dataset_versions ADD COLUMN chart_configs_json TEXT"))


def get_session() -> Generator[Session, None, None]:
    """
    Provide a database session.
    
    Used as a FastAPI dependency.
    Session is automatically closed after request.
    """
    with Session(engine) as session:
        yield session
