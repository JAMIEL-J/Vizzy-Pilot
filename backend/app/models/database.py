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
        connect_args={
            "check_same_thread": False,  # Required for SQLite + FastAPI
            "timeout": 30,              # Wait up to 30s for lock instead of failing immediately
        },
        pool_pre_ping=True,
    )
    # Enable WAL mode for concurrent reads (critical for burst API traffic)
    from sqlalchemy import event as sa_event

    @sa_event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=30000")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.close()
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
    Initialize database tables and apply schema updates using Alembic.
    """
    import os
    from alembic.config import Config
    from alembic import command
    from app.core.logger import get_logger

    logger = get_logger(__name__)

    # Resolve absolute paths to alembic config and directories
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    ini_path = os.path.join(base_dir, "alembic.ini")
    
    alembic_cfg = Config(ini_path)
    alembic_cfg.set_main_option("script_location", os.path.join(base_dir, "alembic"))
    
    # Run the database migrations programmatically
    try:
        command.upgrade(alembic_cfg, "head")
    except Exception as e:
        err_msg = str(e).lower()
        if "already exists" in err_msg:
            logger.warning(f"Database tables pre-exist without Alembic version tag. Stamping head revision.")
            try:
                command.stamp(alembic_cfg, "head")
            except Exception as stamp_err:
                logger.error(f"Failed to stamp database head revision: {stamp_err}")
        else:
            raise e



def get_session() -> Generator[Session, None, None]:
    """
    Provide a database session.
    
    Used as a FastAPI dependency.
    Session is automatically closed after request.
    """
    with Session(engine) as session:
        yield session
