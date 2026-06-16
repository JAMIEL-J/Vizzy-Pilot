"""
Unit Tests for Security Module

Tests: core/security.py

This module is responsible for:
- Password hashing (bcrypt)
- Password verification
- JWT token creation (access + refresh)
- Token verification and decoding
- Role-based access control
"""

import pytest
from datetime import timedelta


class TestPasswordHashing:
    """Tests for password hashing functionality."""

    def test_hash_password_returns_hash(self):
        """
        TEST: hash_password returns a bcrypt hash.
        
        ARCHITECTURE NOTE:
        - Uses passlib with bcrypt scheme
        - Hash is stored in User.hashed_password
        """
        from app.core.security import hash_password
        
        password = "secret123"
        hashed = hash_password(password)
        
        assert hashed != password
        assert hashed.startswith("$2b$")  # bcrypt prefix

    def test_hash_password_different_each_time(self):
        """
        TEST: Same password produces different hashes (salt).
        
        ARCHITECTURE NOTE:
        - bcrypt uses random salt per hash
        - Prevents rainbow table attacks
        """
        from app.core.security import hash_password
        
        password = "secret123"
        hash1 = hash_password(password)
        hash2 = hash_password(password)
        
        assert hash1 != hash2  # Different salts

    def test_verify_password_correct(self):
        """
        TEST: verify_password returns True for correct password.
        
        ARCHITECTURE NOTE:
        - Used during login (auth_routes.py)
        - Compares plaintext with stored hash
        """
        from app.core.security import hash_password, verify_password
        
        password = "secret123"
        hashed = hash_password(password)
        
        assert verify_password(password, hashed) is True

    def test_verify_password_incorrect(self):
        """TEST: verify_password returns False for wrong password."""
        from app.core.security import hash_password, verify_password
        
        hashed = hash_password("correct_password")
        
        assert verify_password("wrong_password", hashed) is False


class TestJWTTokens:
    """Tests for JWT token functionality."""

    def test_create_access_token(self):
        """
        TEST: Access token is created successfully.
        
        ARCHITECTURE NOTE:
        - Token contains: user_id, role, exp (expiry)
        - Default expiry: 30 minutes (configurable)
        """
        from app.core.security import create_access_token, UserRole
        
        token = create_access_token(
            user_id="user-123",
            role=UserRole.USER,
        )
        
        assert token is not None
        assert len(token) > 50  # JWT is long

    def test_create_refresh_token(self):
        """
        TEST: Refresh token is created successfully.
        
        ARCHITECTURE NOTE:
        - Longer expiry than access token (7 days default)
        - Used to get new access tokens
        """
        from app.core.security import create_refresh_token, UserRole
        
        token = create_refresh_token(
            user_id="user-123",
            role=UserRole.USER,
        )
        
        assert token is not None

    def test_verify_valid_token(self):
        """
        TEST: Valid token is decoded correctly.
        
        ARCHITECTURE NOTE:
        - Returns TokenData with user_id, role, exp
        - Used by get_current_user dependency
        """
        from app.core.security import create_access_token, verify_token, UserRole
        
        token = create_access_token(
            user_id="user-123",
            role=UserRole.USER,
        )
        
        token_data = verify_token(token)
        
        assert token_data.user_id == "user-123"
        assert token_data.role == UserRole.USER


class TestUserRoles:
    """Tests for role-based access control."""

    def test_user_role_enum_values(self):
        """
        TEST: UserRole enum has expected values.
        
        ARCHITECTURE NOTE:
        - USER: Standard user, owns their datasets
        - ADMIN: Full access, can see all datasets
        """
        from app.core.security import UserRole
        
        assert UserRole.USER.value == "user"
        assert UserRole.ADMIN.value == "admin"

    def test_current_user_model(self):
        """
        TEST: CurrentUser model stores auth context.
        
        ARCHITECTURE NOTE:
        - Injected via FastAPI dependency
        - Available in all protected routes
        """
        from app.core.security import CurrentUser, UserRole
        
        user = CurrentUser(
            user_id="user-123",
            role=UserRole.ADMIN,
        )
        
        assert user.user_id == "user-123"
        assert user.role == UserRole.ADMIN


class TestPathTraversalPrevention:
    """Tests for SQLite path traversal prevention."""

    def test_valid_path_accepted(self):
        """
        TEST: Valid paths within data directory are accepted.
        """
        from app.core.config import _validate_sqlite_path
        
        path = _validate_sqlite_path("data/vizzy.db")
        assert path.endswith("vizzy.db")

    def test_traversal_sequence_rejected(self):
        """
        TEST: Paths with traversal sequences are rejected.
        """
        from app.core.config import _validate_sqlite_path
        from app.core.exceptions import SecurityError
        
        with pytest.raises(SecurityError) as exc_info:
            _validate_sqlite_path("../etc/passwd")
        
        assert "traversal" in str(exc_info.value.message).lower()

    def test_absolute_path_outside_data_dir_rejected(self):
        """
        TEST: Absolute paths outside data directory are rejected.
        """
        from app.core.config import _validate_sqlite_path
        from app.core.exceptions import SecurityError
        
        with pytest.raises(SecurityError) as exc_info:
            _validate_sqlite_path("/etc/passwd")
        
        assert "escapes" in str(exc_info.value.message).lower()

    def test_deep_traversal_rejected(self):
        """
        TEST: Deep traversal sequences are rejected.
        """
        from app.core.config import _validate_sqlite_path
        from app.core.exceptions import SecurityError
        
        with pytest.raises(SecurityError):
            _validate_sqlite_path("../../../etc/shadow")

    def test_url_encoded_traversal_rejected(self):
        """
        TEST: URL-encoded traversal sequences are rejected.
        """
        from app.core.config import _validate_sqlite_path
        from app.core.exceptions import SecurityError
        
        with pytest.raises(SecurityError):
            _validate_sqlite_path("%2e%2e%2fetc%2fpasswd")

    def test_double_url_encoded_traversal_rejected(self):
        """
        TEST: Double URL-encoded traversal sequences are rejected.
        """
        from app.core.config import _validate_sqlite_path
        from app.core.exceptions import SecurityError
        
        with pytest.raises(SecurityError):
            _validate_sqlite_path("%252e%252e%252fetc%252fpasswd")

    def test_encoded_backslash_traversal_rejected(self):
        """
        TEST: Encoded backslash traversal sequences are rejected.
        """
        from app.core.config import _validate_sqlite_path
        from app.core.exceptions import SecurityError
        
        with pytest.raises(SecurityError):
            _validate_sqlite_path("%2e%2e%5cetc%5cpasswd")

    def test_database_settings_validates_path(self):
        """
        TEST: DatabaseSettings validates SQLite path at initialization.
        """
        from app.core.config import DatabaseSettings
        
        settings = DatabaseSettings(sqlite_path="data/test.db")
        assert "test.db" in settings.sqlite_path

    def test_database_settings_rejects_traversal(self):
        """
        TEST: DatabaseSettings rejects paths with traversal sequences.
        """
        from app.core.config import DatabaseSettings
        from app.core.exceptions import SecurityError
        
        with pytest.raises(SecurityError):
            DatabaseSettings(sqlite_path="../etc/passwd")

    def test_backslash_traversal_rejected(self):
        """
        TEST: Windows-style backslash traversal sequences are rejected.
        """
        from app.core.config import _validate_sqlite_path
        from app.core.exceptions import SecurityError
        
        with pytest.raises(SecurityError):
            _validate_sqlite_path(r"..\etc\passwd")

    def test_symlink_escape_rejected(self, tmp_path):
        """
        TEST: Symlinks that escape the data directory are rejected.
        
        Note: On Windows, creating symlinks requires admin rights.
        This test is skipped if symlink creation fails.
        """
        import os
        import sys
        from app.core.config import _validate_sqlite_path
        from app.core.exceptions import SecurityError
        
        # Create directory structure
        data_dir = tmp_path / "data"
        data_dir.mkdir()
        outside_dir = tmp_path / "outside"
        outside_dir.mkdir()
        outside_file = outside_dir / "secret.db"
        outside_file.write_text("secret")
        
        # Create symlink inside data pointing outside
        symlink_path = data_dir / "escape_link"
        try:
            symlink_path.symlink_to(outside_file)
        except (OSError, NotImplementedError):
            pytest.skip("Symlink creation not supported on this platform")
        
        with pytest.raises(SecurityError):
            _validate_sqlite_path("escape_link", data_dir=str(data_dir))

    def test_startup_validates_env_path(self, monkeypatch):
        """
        TEST: Startup validation catches invalid DB_SQLITE_PATH from environment.
        """
        import os
        from app.core.config import _validate_sqlite_path
        from app.core.exceptions import SecurityError
        
        # Simulate invalid env var
        monkeypatch.setenv("DB_SQLITE_PATH", "../etc/passwd")
        
        with pytest.raises(SecurityError):
            _validate_sqlite_path(os.environ["DB_SQLITE_PATH"])


class TestCORSSettings:
    """Tests for CORS configuration and fail-closed behavior."""

    def test_cors_origins_list_returns_empty_in_production_when_env_absent(self, monkeypatch):
        """
        TEST: In production mode, if CORS_ORIGINS is absent, cors_origins_list returns [].
        """
        from app.core.config import Settings
        
        # Ensure CORS_ORIGINS is not in environment and AUTH_SECRET_KEY is set
        monkeypatch.delenv("CORS_ORIGINS", raising=False)
        monkeypatch.setenv("AUTH_SECRET_KEY", "super-secret-key-for-testing-in-production-mode-which-is-long")
        
        settings = Settings(environment="production")
        assert settings.cors_origins_list == []

    def test_cors_origins_list_returns_parsed_origins_when_env_present(self, monkeypatch):
        """
        TEST: In production mode, if CORS_ORIGINS is present, it is parsed and returned.
        """
        from app.core.config import Settings
        
        monkeypatch.setenv("CORS_ORIGINS", "https://app.vizzy.com,https://api.vizzy.com")
        monkeypatch.setenv("AUTH_SECRET_KEY", "super-secret-key-for-testing-in-production-mode-which-is-long")
        
        settings = Settings(environment="production", cors_origins="https://app.vizzy.com,https://api.vizzy.com")
        assert settings.cors_origins_list == ["https://app.vizzy.com", "https://api.vizzy.com"]

    def test_cors_origins_list_returns_defaults_in_development(self, monkeypatch):
        """
        TEST: In development mode, cors_origins_list returns local origins even if env is absent.
        """
        from app.core.config import Settings
        
        monkeypatch.delenv("CORS_ORIGINS", raising=False)
        
        settings = Settings(environment="development")
        assert "http://localhost:3000" in settings.cors_origins_list


class TestFileUploadSecurity:
    """Tests for file upload magic bytes validation and safety."""

    def test_validate_file_security_accepts_clean_csv(self):
        """
        TEST: Valid CSV text is accepted.
        """
        from app.api.upload_routes import _validate_file_security
        from fastapi import UploadFile
        import io
        
        file_obj = io.BytesIO(b"col1,col2\nval1,val2")
        upload_file = UploadFile(filename="dataset.csv", file=file_obj)
        
        # Should not raise any exception
        _validate_file_security(upload_file, max_size_mb=10)

    def test_validate_file_security_rejects_executable(self):
        """
        TEST: Executables (MZ header) are rejected.
        """
        from app.api.upload_routes import _validate_file_security
        from fastapi import UploadFile
        from fastapi import HTTPException
        import io
        
        # Windows PE executable signature
        file_obj = io.BytesIO(b"MZ\x90\x00\x03\x00\x00\x00")
        upload_file = UploadFile(filename="clean_dataset.csv", file=file_obj)
        
        with pytest.raises(HTTPException) as exc_info:
            _validate_file_security(upload_file, max_size_mb=10)
        assert exc_info.value.status_code == 400
        assert "executable" in str(exc_info.value.detail).lower()

    def test_validate_file_security_rejects_zip_as_csv(self):
        """
        TEST: Binary zip-based file with .csv extension is rejected.
        """
        from app.api.upload_routes import _validate_file_security
        from fastapi import UploadFile
        from fastapi import HTTPException
        import io
        
        # PK zip signature (e.g. xlsx renamed to .csv)
        file_obj = io.BytesIO(b"PK\x03\x04\x14\x00\x08\x00")
        upload_file = UploadFile(filename="payload.csv", file=file_obj)
        
        with pytest.raises(HTTPException) as exc_info:
            _validate_file_security(upload_file, max_size_mb=10)
        assert exc_info.value.status_code == 400
        assert "binary" in str(exc_info.value.detail).lower()


class TestAuditLogging:
    """Tests for audit log generation and validation."""

    def test_record_audit_event_stores_event(self):
        from app.core.audit import record_audit_event, get_audit_store
        
        store = get_audit_store()
        initial_count = store.count()
        
        record_audit_event(
            event_type="DATASET_ACCESSED",
            user_id="test-user-1",
            resource_type="Dataset",
            resource_id="dataset-uuid-1",
            metadata={"action": "view_details"}
        )
        
        assert store.count() == initial_count + 1
        last_event = store.get_all()[-1]
        assert last_event.event_type == "DATASET_ACCESSED"
        assert last_event.user_id == "test-user-1"
        assert last_event.resource_id == "dataset-uuid-1"
        assert last_event.metadata == {"action": "view_details"}

    def test_query_executed_audit_event(self):
        from app.core.audit import record_audit_event, get_audit_store
        import hashlib
        
        store = get_audit_store()
        initial_count = store.count()
        
        sql = "SELECT * FROM data LIMIT 10"
        query_hash = hashlib.sha256(sql.encode("utf-8")).hexdigest()
        
        record_audit_event(
            event_type="QUERY_EXECUTED",
            user_id="test-user-2",
            resource_type="Dataset",
            resource_id="dataset-uuid-2",
            metadata={"query_hash": query_hash, "row_count": 10, "truncated": False}
        )
        
        assert store.count() == initial_count + 1
        last_event = store.get_all()[-1]
        assert last_event.event_type == "QUERY_EXECUTED"
        assert last_event.metadata["query_hash"] == query_hash
        assert last_event.metadata["row_count"] == 10

    def test_data_exported_audit_event(self):
        from app.core.audit import record_audit_event, get_audit_store
        
        store = get_audit_store()
        initial_count = store.count()
        
        record_audit_event(
            event_type="DATA_EXPORTED",
            user_id="test-user-3",
            resource_type="Dataset",
            resource_id="dataset-uuid-3",
            metadata={"export_type": "table", "row_count": 500, "format": "csv"}
        )
        
        assert store.count() == initial_count + 1
        last_event = store.get_all()[-1]
        assert last_event.event_type == "DATA_EXPORTED"
        assert last_event.metadata["export_type"] == "table"
        assert last_event.metadata["row_count"] == 500
        assert last_event.metadata["format"] == "csv"

