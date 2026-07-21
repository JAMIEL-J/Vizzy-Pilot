"""
Storage configuration module.

Provides keys for raw and cleaned data storage in the backend.
"""

from uuid import UUID

def get_base_data_dir() -> str:
    """Get base data directory key."""
    return ""


def get_version_dir(dataset_id: UUID, version_id: UUID) -> str:
    """Get prefix for a specific version's data."""
    return f"{dataset_id}/{version_id}"


def get_raw_data_path(dataset_id: UUID, version_id: UUID) -> str:
    """Get key for raw data CSV."""
    return f"{get_version_dir(dataset_id, version_id)}/raw.csv"


def get_cleaned_data_path(dataset_id: UUID, version_id: UUID) -> str:
    """Get key for cleaned data CSV."""
    return f"{get_version_dir(dataset_id, version_id)}/cleaned.csv"


def get_duckdb_path(dataset_id: UUID, version_id: UUID) -> str:
    """Get key for DuckDB file (persistent analytical engine)."""
    return f"{get_version_dir(dataset_id, version_id)}/data.duckdb"
