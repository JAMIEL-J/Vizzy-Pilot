"""
Unit Tests for File Loader Module

Tests: services/ingestion_execution/file_loader.py

This module is responsible for:
- Validating file extensions (CSV, Excel, JSON, XML)
- Validating file sizes against configured limits
- Loading file contents into pandas DataFrames
"""

import pytest
import pandas as pd
from io import BytesIO


class TestFileValidation:
    """Tests for file validation logic."""

    def test_validate_file_allowed_extension_csv(self):
        """
        TEST: CSV files pass validation.
        
        ARCHITECTURE NOTE:
        - Allowed extensions: .csv, .xlsx, .xls, .json, .xml
        - Extension check is case-insensitive
        """
        from app.services.ingestion_execution.file_loader import validate_file
        
        # Should not raise
        ext = validate_file(filename="data.csv", file_size=1000)
        assert ext == "csv"

    def test_validate_file_allowed_extension_excel(self):
        """TEST: Excel files pass validation."""
        from app.services.ingestion_execution.file_loader import validate_file
        
        ext1 = validate_file(filename="data.xlsx", file_size=1000)
        ext2 = validate_file(filename="data.xls", file_size=1000)
        assert ext1 == "xlsx"
        assert ext2 == "xls"

    def test_validate_file_allowed_extension_json(self):
        """TEST: JSON files pass validation."""
        from app.services.ingestion_execution.file_loader import validate_file
        
        ext = validate_file(filename="data.json", file_size=1000)
        assert ext == "json"

    def test_validate_file_rejected_extension(self):
        """
        TEST: Unsupported file extensions are rejected.
        
        ARCHITECTURE NOTE:
        - Security measure: only known file types accepted
        - Prevents arbitrary file uploads
        """
        from app.services.ingestion_execution.file_loader import validate_file
        from app.core.exceptions import InvalidOperation
        
        with pytest.raises(InvalidOperation) as exc_info:
            validate_file(filename="script.py", file_size=1000)
        
        assert "extension" in str(exc_info.value.message).lower() or "supported" in str(exc_info.value.message).lower()

    def test_validate_file_size_within_limit(self):
        """
        TEST: Files within size limit pass validation.
        
        ARCHITECTURE NOTE:
        - Default limit: 100 MB (configurable in StorageSettings)
        - Prevents memory exhaustion attacks
        """
        from app.services.ingestion_execution.file_loader import validate_file
        
        # 50 MB should pass (under 100 MB default)
        ext = validate_file(filename="data.csv", file_size=50 * 1024 * 1024)
        assert ext == "csv"

    def test_validate_file_size_exceeds_limit(self):
        """TEST: Files exceeding size limit are rejected."""
        from app.services.ingestion_execution.file_loader import validate_file
        from app.core.exceptions import InvalidOperation
        from app.core.config import get_settings
        
        settings = get_settings()
        limit_bytes = settings.storage.max_file_size_mb * 1024 * 1024
        
        # Limit + 100 MB should fail
        with pytest.raises(InvalidOperation) as exc_info:
            validate_file(filename="data.csv", file_size=limit_bytes + 100 * 1024 * 1024)
        
        assert "size" in str(exc_info.value.message).lower() or "maximum" in str(exc_info.value.message).lower()


class TestFileLoading:
    """Tests for file loading logic."""

    def test_load_csv_file(self, sample_csv_data):
        """
        TEST: CSV files are loaded into DataFrames correctly.
        
        ARCHITECTURE NOTE:
        - Uses pandas.read_csv internally
        - Returns DataFrame for schema inference and storage
        """
        from app.services.ingestion_execution.file_loader import load_from_upload
        
        df = load_from_upload(
            file_stream=sample_csv_data,
            filename="test.csv",
            file_size=sample_csv_data.getbuffer().nbytes,
        )
        
        assert isinstance(df, pd.DataFrame)
        assert len(df) == 5
        assert "sales" in df.columns

    def test_load_json_file(self):
        """TEST: JSON files are loaded into DataFrames correctly."""
        from app.services.ingestion_execution.file_loader import load_from_upload
        
        json_content = b'[{"id": 1, "name": "A"}, {"id": 2, "name": "B"}]'
        json_stream = BytesIO(json_content)
        
        df = load_from_upload(
            file_stream=json_stream,
            filename="test.json",
            file_size=len(json_content),
        )
        
        assert isinstance(df, pd.DataFrame)
        assert len(df) == 2
