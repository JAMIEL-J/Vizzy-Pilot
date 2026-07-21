"""
Unit Tests for Storage Module

Tests: core/storage.py

This module is responsible for:
- Generating paths for raw and cleaned data files
- Creating directory structures for dataset versions
- Ensuring isolation between users/datasets/versions
"""

import pytest
from uuid import uuid4
from pathlib import Path


class TestStoragePaths:
    """Tests for storage path generation."""

    def test_get_base_data_dir(self):
        """
        TEST: Base data directory is retrieved from config.
        
        ARCHITECTURE NOTE:
        - Default: "data/uploads"
        - Configurable via STORAGE_DATA_DIR env var
        """
        from app.core.storage import get_base_data_dir
        
        base_dir = get_base_data_dir()
        
        assert base_dir is not None

    def test_get_version_dir_structure(self, dataset_id, version_id):
        """
        TEST: Version directory follows expected structure.
        
        ARCHITECTURE NOTE:
        - Structure: {base_dir}/{dataset_id}/{version_id}/
        - UUID paths prevent enumeration attacks
        - Each version is isolated
        """
        from app.core.storage import get_version_dir, get_base_data_dir
        
        version_dir = get_version_dir(dataset_id, version_id)
        
        assert str(dataset_id) in str(version_dir)
        assert str(version_id) in str(version_dir)

    def test_get_raw_data_path(self, dataset_id, version_id):
        """
        TEST: Raw data path points to raw.csv.
        
        ARCHITECTURE NOTE:
        - Raw data stored as: {version_dir}/raw.csv
        - Original uploaded data, never modified
        """
        from app.core.storage import get_raw_data_path
        
        raw_path = get_raw_data_path(dataset_id, version_id)
        
        assert "raw.csv" in raw_path
        assert str(dataset_id) in raw_path

    def test_get_cleaned_data_path(self, dataset_id, version_id):
        """
        TEST: Cleaned data path points to cleaned.csv.
        
        ARCHITECTURE NOTE:
        - Cleaned data stored as: {version_dir}/cleaned.csv
        - Created after cleaning plan execution
        """
        from app.core.storage import get_cleaned_data_path
        
        cleaned_path = get_cleaned_data_path(dataset_id, version_id)
        
        assert "cleaned.csv" in cleaned_path
        assert str(dataset_id) in cleaned_path

    def test_paths_are_isolated(self):
        """
        TEST: Different datasets/versions have different paths.
        
        ARCHITECTURE NOTE:
        - Security: User A cannot access User B's data
        - Isolation enforced by directory structure
        """
        from app.core.storage import get_raw_data_path
        
        path1 = get_raw_data_path(uuid4(), uuid4())
        path2 = get_raw_data_path(uuid4(), uuid4())
        
        assert path1 != path2
