"""
Application configuration module.

Belongs to: core layer
Responsibility: Configuration management only
Restrictions: No business logic, no datasets, no analytics
"""

from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class DatabaseSettings(BaseSettings):
    """Database connection configuration."""

    model_config = SettingsConfigDict(env_prefix="DB_")

    # Use SQLite by default for easy testing
    # Set DB_TYPE=postgresql and other DB_ vars for production
    type: str = Field(default="sqlite")
    
    # SQLite settings
    sqlite_path: str = Field(default="./data/vizzy.db")
    
    # PostgreSQL settings (used if type=postgresql)
    host: str = Field(default="localhost")
    port: int = Field(default=5432)
    name: str = Field(default="vizzy")
    user: str = Field(default="postgres")
    password: SecretStr = Field(default=SecretStr(""))
    pool_size: int = Field(default=5, ge=1, le=20)
    pool_max_overflow: int = Field(default=10, ge=0, le=50)
    echo: bool = Field(default=False)

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

    secret_key: SecretStr = Field(default=SecretStr("change-me-in-production"))
    algorithm: str = Field(default="HS256")
    access_token_expire_minutes: int = Field(default=30, ge=1, le=1440)
    refresh_token_expire_days: int = Field(default=7, ge=1, le=30)


class RateLimitSettings(BaseSettings):
    """Rate limiting configuration."""

    model_config = SettingsConfigDict(env_prefix="RATE_LIMIT_")

    enabled: bool = Field(default=True)
    requests_per_minute: int = Field(default=60, ge=1, le=1000)


class StorageSettings(BaseSettings):
    """File storage configuration."""

    model_config = SettingsConfigDict(env_prefix="STORAGE_")

    data_dir: str = Field(default="data/uploads")
    duckdb_path: str = Field(default="data/vizzy_analytics.duckdb")
    max_file_size_mb: int = Field(default=100, ge=1, le=1000)


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
    groq_model: str = Field(default="llama-3.3-70b-versatile")
    groq_fallback_model: str = Field(default="llama-3.1-70b-versatile")

    # Account 1B: Groq (Chat insight narration - why/explain)
    groq_chat_insight_api_key: SecretStr = Field(default=SecretStr(""))
    groq_chat_insight_model: str = Field(default="llama-3.3-70b-versatile")

    # Dedicated dashboard narration override (optional, defaults to Account 1)
    groq_dashboard_api_key: SecretStr = Field(default=SecretStr(""))
    groq_dashboard_model: str = Field(default="llama-3.3-70b-versatile")

    # Account 2: Groq (alternate Chat/SQL model)
    groq_chat_api_key: SecretStr = Field(default=SecretStr(""))
    groq_chat_model: str = Field(default="llama-3.3-70b-versatile")

    # Provider Selection (Always Groq)
    primary_provider: Literal["groq"] = Field(default="groq")

    # Token optimization settings (IMPORTANT for free tier)
    max_tokens: int = Field(default=512, ge=64, le=8192)  # Increased for Pro model
    max_input_tokens: int = Field(default=1024, ge=256, le=32768)  # Increased for Pro model
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

    app_name: str = Field(default="Vizzy")
    app_version: str = Field(default="1.0.0")
    environment: Literal["development", "staging", "production"] = Field(
        default="development"
    )
    debug: bool = Field(default=False)
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = Field(
        default="INFO"
    )
    api_prefix: str = Field(default="/api/v1")

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


def get_settings() -> Settings:
    """Get application settings (uncached for debugging)."""
    return Settings()
