"""
Application configuration module.

Belongs to: core layer
Responsibility: Configuration management only
Restrictions: No business logic, no datasets, no analytics
"""

import os
import re
import urllib.parse
from functools import lru_cache
from pathlib import Path
from typing import Literal, Optional

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from .exceptions import SecurityError


def _validate_sqlite_path(path: str, data_dir: str = "data") -> str:
    """
    Validate and sanitize SQLite database path to prevent path traversal attacks.
    
    Defense-in-depth approach:
    1. URL-decode the path to catch encoded traversal sequences
    2. Check for traversal sequences in the decoded path
    3. Canonicalize the path and ensure it's within the allowed data directory
    4. Check for symlink escapes via canonicalization
    
    Args:
        path: The requested SQLite database path
        data_dir: The allowed base directory (default: "data")
        
    Returns:
        The validated and resolved path
        
    Raises:
        SecurityError: If the path violates security constraints
    """
    # Step 1: URL-decode repeatedly to catch double-encoded traversal sequences
    # Bounded to 5 iterations to prevent denial of service via deep encoding
    decoded_path = path
    for _ in range(5):
        unquoted = urllib.parse.unquote(decoded_path)
        if unquoted == decoded_path:
            break
        decoded_path = unquoted
    
    # Step 2: Check for traversal sequences in the decoded path
    # This catches both forward and backward slash traversal, and encoded variants
    if re.search(r"\.\.(?:[/\\]|$)", decoded_path):
        raise SecurityError(
            message="Invalid SQLite path: path traversal detected",
            details=f"Path contains forbidden traversal sequences: {path}"
        )
    
    # Step 3: Resolve the base data directory (canonical)
    base_dir = Path(data_dir).resolve()
    
    # Step 4: Build the requested path
    requested = Path(path)
    if not requested.is_absolute():
        requested = base_dir / path
    
    # Step 5: Canonicalize (resolves symlinks and relative components)
    try:
        resolved_path = requested.resolve(strict=False)
    except (OSError, ValueError) as e:
        raise SecurityError(
            message="Invalid SQLite path: unable to resolve path",
            details=f"Path resolution failed for {path}: {e}"
        )
    
    # Step 6: Ensure resolved path is within the allowed directory
    try:
        resolved_path.relative_to(base_dir)
    except ValueError:
        raise SecurityError(
            message="Invalid SQLite path: path escapes allowed directory",
            details=f"Resolved path {resolved_path} is outside allowed directory {base_dir}"
        )
    
    return str(resolved_path)


class DatabaseSettings(BaseSettings):
    """Database connection configuration."""

    model_config = SettingsConfigDict(env_prefix="DB_")

    # Use SQLite by default for easy testing
    # Set DB_TYPE=postgresql and other DB_ vars for production
    type: str = Field(default="sqlite")
    
    # SQLite settings
    sqlite_path: str = Field(default="data/vizzy.db")
    
    # PostgreSQL settings (used if type=postgresql)
    host: str = Field(default="localhost")
    port: int = Field(default=5432)
    name: str = Field(default="vizzy")
    user: str = Field(default="postgres")
    password: SecretStr = Field(default=SecretStr(""))
    pool_size: int = Field(default=5, ge=1, le=20)
    pool_max_overflow: int = Field(default=10, ge=0, le=50)
    echo: bool = Field(default=False)
    
    # Data directory for SQLite (used for path validation)
    data_dir: str = Field(default="data")

    @field_validator("sqlite_path", mode="after")
    @classmethod
    def validate_sqlite_path(cls, v: str, info) -> str:
        """Validate SQLite path to prevent path traversal attacks."""
        # Only validate if using SQLite
        values = info.data
        if values.get("type") == "sqlite" or values.get("type") is None:
            data_dir = values.get("data_dir", "data")
            return _validate_sqlite_path(v, data_dir)
        return v

    @property
    def url(self) -> str:
        """Generate database URL based on type."""
        if self.type == "sqlite":
            return f"sqlite:///{self.sqlite_path}"
        return f"postgresql://{self.user}@{self.host}:{self.port}/{self.name}"

    @property
    def url_with_password(self) -> str:
        """Generate full database URL with password."""
        if self.type == "sqlite":
            return f"sqlite:///{self.sqlite_path}"
        password = self.password.get_secret_value()
        return f"postgresql://{self.user}:{password}@{self.host}:{self.port}/{self.name}"
    
    @property
    def is_sqlite(self) -> bool:
        """Check if using SQLite."""
        return self.type == "sqlite"


class AuthSettings(BaseSettings):
    """Authentication configuration."""

    model_config = SettingsConfigDict(env_prefix="AUTH_")

    secret_key: Optional[SecretStr] = Field(default=None)
    algorithm: str = Field(default="HS256")
    access_token_expire_minutes: int = Field(default=30, ge=1, le=1440)
    refresh_token_expire_days: int = Field(default=7, ge=1, le=30)

    @field_validator("secret_key", mode="after")
    @classmethod
    def validate_secret_key(cls, v: Optional[SecretStr], info) -> Optional[SecretStr]:
        """Ensure secret key is not the default insecure value when provided."""
        if v is None:
            # Will be validated in Settings.validate_auth_settings for production
            return v

        secret_value = v.get_secret_value()
        if not secret_value:
            # Empty string is also not acceptable
            return v

        default_val = "change-me-in-production"
        if secret_value == default_val:
            raise SecurityError(
                message="Insecure JWT secret key",
                details="The default 'change-me-in-production' key is still in use. Please set AUTH_SECRET_KEY in your environment."
            )
        return v


class RateLimitSettings(BaseSettings):
    """Rate limiting configuration."""

    model_config = SettingsConfigDict(env_prefix="RATE_LIMIT_")

    enabled: bool = Field(default=True)
    requests_per_minute: int = Field(default=300, ge=1, le=1000)


class StorageSettings(BaseSettings):
    """File storage configuration."""

    model_config = SettingsConfigDict(env_prefix="STORAGE_")

    data_dir: str = Field(default="data/uploads")
    duckdb_path: str = Field(default="data/vizzy_analytics.duckdb")
    max_file_size_mb: int = Field(default=500, ge=1, le=1000)


class LLMSettings(BaseSettings):
    """LLM provider configuration."""

    model_config = SettingsConfigDict(
        env_prefix="LLM_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Account 1: Groq (Dashboard narrative / executive brief)
    groq_api_key: SecretStr = Field(default=SecretStr(""))
    groq_model: str = Field(default="gemma-4-26b-a4b-it")
    groq_fallback_model: str = Field(default="llama-3.1-70b-versatile")

    # Account 1B: Groq (Chat insight narration - why/explain)
    groq_chat_insight_api_key: SecretStr = Field(default=SecretStr(""))
    groq_chat_insight_model: str = Field(default="gemma-4-26b-a4b-it")

    # Dedicated dashboard narration override (optional, defaults to Account 1)
    groq_dashboard_api_key: SecretStr = Field(default=SecretStr(""))
    groq_dashboard_model: str = Field(default="gemma-4-26b-a4b-it")

    # Dedicated semantic mapping override (optional, defaults to Account 1)
    groq_semantic_map: SecretStr = Field(default=SecretStr(""))
    groq_semantic_map_model: str = Field(default="meta-llama/llama-4-scout-17b-16e-instruct")

    # Account 2: Groq (alternate Chat/SQL model)
    groq_chat_api_key: SecretStr = Field(default=SecretStr(""))
    groq_chat_model: str = Field(default="openai/gpt-oss-120b")

    # Gemini configurations
    gemini_api_key: SecretStr = Field(default=SecretStr(""))
    gemini_model: str = Field(default="gemma-4-26b-a4b-it")
    gemini_chat_model: str = Field(default="gemma-4-26b-a4b-it")

    # NVIDIA configuration
    nvidia_key: SecretStr = Field(default=SecretStr(""))
    nvidia_model: str = Field(default="mistralai/mistral-small-4-119b-2603")
    nvidia_chat_model: str = Field(default="mistralai/mistral-small-4-119b-2603")

    # --- Per-Purpose Provider Routing ---
    semantic_provider: Literal["groq", "gemini", "nvidia"] = Field(default="groq")
    semantic_model: str = Field(default="meta-llama/llama-4-scout-17b-16e-instruct")
    semantic_key: SecretStr = Field(default=SecretStr(""))

    insight_provider: Literal["groq", "gemini", "nvidia"] = Field(default="nvidia")
    insight_model: str = Field(default="mistralai/mistral-small-4-119b-2603")
    insight_key: SecretStr = Field(default=SecretStr(""))

    chat_provider: Literal["groq", "gemini", "nvidia"] = Field(default="nvidia")
    chat_model: str = Field(default="mistralai/mistral-small-4-119b-2603")
    chat_key: SecretStr = Field(default=SecretStr(""))

    # Legacy fallback (used if per-purpose keys are empty)
    primary_provider: Literal["groq", "gemini", "nvidia"] = Field(default="groq")

    # Token optimization settings (IMPORTANT for free tier)
    max_tokens: int = Field(default=512, ge=64, le=8192)  # Increased for Pro model
    max_input_tokens: int = Field(default=1024, ge=256, le=32768)  # Increased for Pro model
    # SQL/chat specific limits (kept smaller to avoid provider payload rejections)
    max_tokens_sql: int = Field(default=384, ge=64, le=4096)
    max_input_tokens_sql: int = Field(default=1400, ge=256, le=8192)
    temperature: float = Field(default=0.3, ge=0.0, le=1.0)  # Lower = more focused
    
    # Response optimization
    enable_caching: bool = Field(default=True)  # Cache responses
    cache_ttl_seconds: int = Field(default=3600, ge=60, le=86400)  # 1 hour cache
    
    # Data truncation (reduce tokens sent)
    max_rows_sample: int = Field(default=50, ge=10, le=200)  # Sample rows for analysis
    max_columns_describe: int = Field(default=10, ge=5, le=20)  # Limit column descriptions
    
    # Retry settings
    max_retries: int = Field(default=2, ge=1, le=5)  # Reduced retries
    timeout_seconds: int = Field(default=30, ge=5, le=120)



class Settings(BaseSettings):
    """Main application settings."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = Field(default="Vizzy Pilot")
    app_version: str = Field(default="1.0.0")
    environment: Literal["development", "staging", "production"] = Field(
        default="development"
    )
    debug: bool = Field(default=False)
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = Field(
        default="INFO"
    )
    api_prefix: str = Field(default="/api/v1")
    cors_origins: Optional[str] = Field(
        default="http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000,http://127.0.0.1:5173",
        description="Comma-separated list of allowed CORS origins. Empty in production.",
    )
    cors_allow_credentials: bool = Field(default=True)
    cors_allow_methods: list[str] = Field(default=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"])
    cors_allow_headers: list[str] = Field(default=["*"])
    sse_origin: Optional[str] = Field(
        default=None,
        description="Explicit whitelist origin for Server-Sent Events (SSE).",
    )

    database: DatabaseSettings = Field(default_factory=DatabaseSettings)
    auth: AuthSettings = Field(default_factory=AuthSettings)
    rate_limit: RateLimitSettings = Field(default_factory=RateLimitSettings)
    storage: StorageSettings = Field(default_factory=StorageSettings)
    llm: LLMSettings = Field(default_factory=LLMSettings)

    @field_validator("environment", mode="before")
    @classmethod
    def validate_environment(cls, v: str) -> str:
        """Normalize environment value."""
        if isinstance(v, str):
            v = v.lower().strip()
        return v

    @property
    def is_production(self) -> bool:
        """Check if running in production."""
        return self.environment == "production"

    @property
    def is_development(self) -> bool:
        """Check if running in development."""
        return self.environment == "development"

    @property
    def cors_origins_list(self) -> list[str]:
        """Parse comma-separated CORS origins into a list."""
        if self.is_production:
            # In production, require explicit CORS_ORIGINS env var
            # If not set, return empty list (no cross-origin allowed)
            if not os.environ.get("CORS_ORIGINS"):
                return []
        if not self.cors_origins:
            return []
        origins = [o.strip() for o in self.cors_origins.split(",") if o.strip()]
        # Strip out wildcard "*" to fail closed
        origins = [o for o in origins if o != "*"]
        return origins

    @field_validator("auth", mode="after")
    @classmethod
    def validate_auth_settings(cls, auth: AuthSettings, info) -> AuthSettings:
        """Enforce secret key presence in production."""
        env = info.data.get("environment", "development")
        if env == "production" and (auth.secret_key is None or auth.secret_key.get_secret_value() == ""):
            raise SecurityError(
                message="Missing JWT secret key in production",
                details="The AUTH_SECRET_KEY environment variable must be set when running in production mode."
            )
        return auth



@lru_cache()
def get_settings() -> Settings:
    """Get application settings (cached)."""
    return Settings()
