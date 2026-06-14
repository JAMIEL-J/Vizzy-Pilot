"""
External database connection management.

Allows users to connect to their own databases (MySQL, PostgreSQL, SQL Server, etc.)
and ingest data into Vizzy datasets.
"""

from typing import Dict, Optional
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from pydantic import BaseModel, Field, SecretStr

from app.core.exceptions import InvalidOperation


class DatabaseConnection(BaseModel):
    """Database connection configuration."""
    
    type: str = Field(..., description="Database type: postgresql, mysql, mssql, sqlite")
    host: Optional[str] = Field(None, description="Database host")
    port: Optional[int] = Field(None, description="Database port")
    database: str = Field(..., description="Database name")
    username: Optional[str] = Field(None, description="Database username")
    password: Optional[SecretStr] = Field(None, description="Database password")
    
    # For SQLite
    file_path: Optional[str] = Field(None, description="SQLite file path")
    
    # Additional connection options
    connect_timeout: int = Field(default=10, ge=1, le=60)
    ssl_mode: Optional[str] = Field(None, description="SSL mode (require, prefer, disable)")


def build_connection_string(config: DatabaseConnection) -> str:
    """
    Build SQLAlchemy connection string from config.
    
    Args:
        config: Database connection configuration
    
    Returns:
        SQLAlchemy connection string
    
    Raises:
        InvalidOperation: If configuration is invalid
    """
    db_type = config.type.lower()
    
    # SQLite
    if db_type == "sqlite":
        if not config.file_path:
            raise InvalidOperation(
                operation="db_connection",
                reason="SQLite requires file_path",
            )
        from app.core.config import _validate_sqlite_path
        validated_path = _validate_sqlite_path(config.file_path)
        return f"sqlite:///{validated_path}"
    
    # Validate required fields for server databases
    if not all([config.host, config.port, config.username, config.password]):
        raise InvalidOperation(
            operation="db_connection",
            reason="Server databases require host, port, username, and password",
        )
    
    password = config.password.get_secret_value() if config.password else ""
    
    # PostgreSQL
    if db_type in ["postgresql", "postgres"]:
        conn_str = f"postgresql://{config.username}:{password}@{config.host}:{config.port}/{config.database}"
        if config.ssl_mode:
            conn_str += f"?sslmode={config.ssl_mode}"
        return conn_str
    
    # MySQL
    if db_type == "mysql":
        return f"mysql+pymysql://{config.username}:{password}@{config.host}:{config.port}/{config.database}"
    
    # Microsoft SQL Server
    if db_type in ["mssql", "sqlserver"]:
        driver = "ODBC Driver 17 for SQL Server"
        return f"mssql+pyodbc://{config.username}:{password}@{config.host}:{config.port}/{config.database}?driver={driver}"
    
    raise InvalidOperation(
        operation="db_connection",
        reason=f"Unsupported database type: {db_type}",
        details="Supported types: postgresql, mysql, mssql, sqlite",
    )


def create_external_engine(config: DatabaseConnection) -> Engine:
    """
    Create SQLAlchemy engine for external database.
    
    Args:
        config: Database connection configuration
    
    Returns:
        SQLAlchemy engine
    
    Raises:
        InvalidOperation: If connection fails
    """
    try:
        conn_str = build_connection_string(config)
        
        engine = create_engine(
            conn_str,
            pool_pre_ping=True,  # Verify connections before using
            connect_args={
                "connect_timeout": config.connect_timeout,
            },
        )
        
        # Test connection
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        
        return engine
        
    except Exception as e:
        raise InvalidOperation(
            operation="db_connection",
            reason="Failed to connect to database",
            details=str(e),
        )


def test_database_connection(config: DatabaseConnection) -> Dict[str, str]:
    """
    Test database connection without creating persistent engine.
    
    Args:
        config: Database connection configuration
    
    Returns:
        Connection test result
    """
    try:
        engine = create_external_engine(config)
        
        # Get database info
        with engine.connect() as conn:
            result = conn.execute(text("SELECT VERSION()"))
            version = result.scalar()
        
        engine.dispose()
        
        return {
            "status": "success",
            "message": "Connection successful",
            "database_version": str(version) if version else "Unknown",
        }
        
    except InvalidOperation as e:
        return {
            "status": "error",
            "message": e.message,
            "details": e.details or "",
        }
    except Exception as e:
        return {
            "status": "error",
            "message": "Connection failed",
            "details": str(e),
        }
