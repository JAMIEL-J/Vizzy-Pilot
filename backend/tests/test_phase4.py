"""
Test suite for Phase 4: Analyst Capabilities

Covers:
- 4.1 SQL Transparency: validate_sql, execute_sandboxed, sql_transparency_routes
- 4.2 Relational Support: multi-file upload, join builder
- 4.3 Data Portability: CSV/TSV export
"""

import pytest
import pandas as pd
import numpy as np
from uuid import uuid4
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock
import json
import io


class TestSQLValidation:
    """Tests for SQL validation via the security sandbox."""

    def test_validate_sql_accepts_select(self):
        """Valid SELECT statements should pass validation."""
        from app.services.security.sandbox import validate_sql

        is_valid, reason, parsed = validate_sql("SELECT * FROM data", "data")
        assert is_valid is True
        assert reason == "valid"
        assert parsed is not None

    def test_validate_sql_rejects_insert(self):
        """INSERT statements should be rejected."""
        from app.services.security.sandbox import validate_sql

        is_valid, reason, parsed = validate_sql("INSERT INTO data VALUES (1)", "data")
        assert is_valid is False
        assert "Only SELECT statements permitted" in reason

    def test_validate_sql_rejects_update(self):
        """UPDATE statements should be rejected."""
        from app.services.security.sandbox import validate_sql

        is_valid, reason, parsed = validate_sql("UPDATE data SET x = 1", "data")
        assert is_valid is False

    def test_validate_sql_rejects_drop(self):
        """DROP statements should be rejected."""
        from app.services.security.sandbox import validate_sql

        is_valid, reason, parsed = validate_sql("DROP TABLE data", "data")
        assert is_valid is False

    def test_validate_sql_rejects_delete(self):
        """DELETE statements should be rejected."""
        from app.services.security.sandbox import validate_sql

        is_valid, reason, parsed = validate_sql("DELETE FROM data WHERE x = 1", "data")
        assert is_valid is False

    def test_validate_sql_blocks_file_access(self):
        """File access patterns should be blocked."""
        from app.services.security.sandbox import validate_sql

        # read_csv is blocked
        is_valid, reason, parsed = validate_sql(
            "SELECT * FROM read_csv('/etc/passwd')", "data"
        )
        assert is_valid is False
        assert "read_csv" in reason or "pattern" in reason.lower()

    def test_validate_sql_blocks_path_traversal(self):
        """Path traversal patterns should be blocked."""
        from app.services.security.sandbox import validate_sql

        is_valid, reason, parsed = validate_sql(
            "SELECT * FROM data WHERE file = '../etc/passwd'", "data"
        )
        assert is_valid is False
        assert ".." in reason or "pattern" in reason.lower()

    def test_validate_sql_blocks_http(self):
        """HTTP URLs should be blocked to prevent data exfiltration."""
        from app.services.security.sandbox import validate_sql

        is_valid, reason, parsed = validate_sql(
            "SELECT * FROM data WHERE url = 'http://evil.com/data'", "data"
        )
        assert is_valid is False

    def test_validate_sql_blocks_multiple_statements(self):
        """Multiple statements should be rejected."""
        from app.services.security.sandbox import validate_sql

        is_valid, reason, parsed = validate_sql(
            "SELECT * FROM data; DROP TABLE data", "data"
        )
        assert is_valid is False
        assert "Multiple statements" in reason

    def test_validate_sql_enforces_table_scope(self):
        """Queries referencing unauthorized tables should be blocked."""
        from app.services.security.sandbox import validate_sql

        is_valid, reason, parsed = validate_sql(
            "SELECT * FROM other_table", "data"
        )
        assert is_valid is False
        assert "Unauthorized table" in reason

    def test_validate_sql_accepts_valid_cte(self):
        """Valid CTE should pass validation."""
        from app.services.security.sandbox import validate_sql

        is_valid, reason, parsed = validate_sql(
            "WITH cte AS (SELECT * FROM data) SELECT * FROM cte", "data"
        )
        assert is_valid is True

    def test_validate_sql_normalizes_output(self):
        """Validated SQL should be normalizable to DuckDB dialect."""
        from app.services.security.sandbox import validate_sql

        is_valid, reason, parsed = validate_sql(
            "select * from data where x = 1", "data"
        )
        assert is_valid is True
        if parsed is not None:
            normalized = parsed.sql(dialect="duckdb")
            assert "SELECT" in normalized.upper()


class TestSandboxExecution:
    """Tests for sandboxed query execution."""

    def test_execute_sandboxed_runs_valid_query(self):
        """Valid SELECT query should execute and return DataFrame."""
        import duckdb
        import tempfile
        import os
        from app.services.security.sandbox import execute_sandboxed

        # Use a temp directory to avoid file locking issues on Windows
        tmpdir = tempfile.mkdtemp()
        db_path = os.path.join(tmpdir, "test.duckdb")
        try:
            # Create database and table
            con = duckdb.connect(db_path)
            con.execute("CREATE TABLE data (x INTEGER, y TEXT)")
            con.execute("INSERT INTO data VALUES (1, 'a'), (2, 'b')")
            con.close()

            # Reopen in read-only mode
            con = duckdb.connect(db_path, read_only=True)
            try:
                import asyncio
                result = asyncio.run(execute_sandboxed(
                    conn=con,
                    sql="SELECT * FROM data WHERE x > 0",
                    table_name="data",
                    max_rows=100,
                ))

                assert isinstance(result, pd.DataFrame)
                assert len(result) == 2
                assert list(result.columns) == ["x", "y"]
            finally:
                con.close()
        finally:
            import shutil
            shutil.rmtree(tmpdir, ignore_errors=True)

    def test_execute_sandboxed_respects_row_limit(self):
        """Query results should be limited to max_rows."""
        import duckdb
        import tempfile
        import os
        from app.services.security.sandbox import execute_sandboxed

        tmpdir = tempfile.mkdtemp()
        db_path = os.path.join(tmpdir, "test.duckdb")
        try:
            con = duckdb.connect(db_path)
            con.execute("CREATE TABLE data (n INTEGER)")
            for i in range(100):
                con.execute(f"INSERT INTO data VALUES ({i})")
            con.close()

            con = duckdb.connect(db_path, read_only=True)
            try:
                import asyncio
                result = asyncio.run(execute_sandboxed(
                    conn=con,
                    sql="SELECT * FROM data",
                    table_name="data",
                    max_rows=10,
                ))

                assert len(result) == 10
            finally:
                con.close()
        finally:
            import shutil
            shutil.rmtree(tmpdir, ignore_errors=True)

    def test_execute_sandboxed_rejects_invalid_sql(self):
        """Invalid SQL should raise QueryExecutionError."""
        import duckdb
        import tempfile
        import os
        from app.services.security.sandbox import execute_sandboxed, QueryExecutionError

        tmpdir = tempfile.mkdtemp()
        db_path = os.path.join(tmpdir, "test.duckdb")
        try:
            con = duckdb.connect(db_path)
            con.execute("CREATE TABLE data (x INTEGER)")
            con.close()

            con = duckdb.connect(db_path, read_only=True)
            try:
                import asyncio
                with pytest.raises(QueryExecutionError):
                    asyncio.run(execute_sandboxed(
                        conn=con,
                        sql="DROP TABLE data",
                        table_name="data",
                        max_rows=100,
                    ))
            finally:
                con.close()
        finally:
            import shutil
            shutil.rmtree(tmpdir, ignore_errors=True)


class TestSQLTransparencyRoutes:
    """Tests for SQL transparency route logic (unit-level)."""

    def test_sql_execute_request_model(self):
        """SQLExecuteRequest should validate fields."""
        from app.api.sql_transparency_routes import SQLExecuteRequest

        # Valid request
        req = SQLExecuteRequest(sql="SELECT * FROM data")
        assert req.sql == "SELECT * FROM data"
        assert req.max_rows == 1000
        assert req.timeout_seconds == 30

        # Custom limits
        req = SQLExecuteRequest(sql="SELECT 1", max_rows=500, timeout_seconds=60)
        assert req.max_rows == 500
        assert req.timeout_seconds == 60

        # Invalid: empty SQL
        with pytest.raises(Exception):
            SQLExecuteRequest(sql="")

        # Invalid: max_rows out of range
        with pytest.raises(Exception):
            SQLExecuteRequest(sql="SELECT 1", max_rows=0)

    def test_sql_validate_response_model(self):
        """SQLValidateResponse should serialize correctly."""
        from app.api.sql_transparency_routes import SQLValidateResponse

        resp = SQLValidateResponse(
            sql="SELECT 1",
            is_valid=True,
            reason="valid",
            normalized_sql="SELECT 1",
        )
        assert resp.is_valid is True
        assert resp.normalized_sql == "SELECT 1"

        resp_invalid = SQLValidateResponse(
            sql="DROP TABLE data",
            is_valid=False,
            reason="Blocked statement",
        )
        assert resp_invalid.is_valid is False

    def test_df_to_records_safe_handles_nan(self):
        """_df_to_records_safe should convert NaN/Inf to None."""
        from app.api.sql_transparency_routes import _df_to_records_safe

        df = pd.DataFrame({
            "a": [1.0, np.nan, np.inf, -np.inf, None],
            "b": ["x", "y", "z", "w", "v"],
        })

        records, truncated = _df_to_records_safe(df, max_rows=10)

        assert len(records) == 5
        assert records[1]["a"] is None  # NaN -> None
        assert records[2]["a"] is None  # Inf -> None
        assert records[3]["a"] is None  # -Inf -> None
        assert records[4]["a"] is None  # None stays None

    def test_df_to_records_safe_truncates(self):
        """_df_to_records_safe should set truncated=True when rows exceed max_rows."""
        from app.api.sql_transparency_routes import _df_to_records_safe

        df = pd.DataFrame({"n": range(100)})
        records, truncated = _df_to_records_safe(df, max_rows=10)

        assert len(records) == 10
        assert truncated is True

    def test_df_to_records_safe_no_truncate(self):
        """_df_to_records_safe should set truncated=False when within limit."""
        from app.api.sql_transparency_routes import _df_to_records_safe

        df = pd.DataFrame({"n": range(5)})
        records, truncated = _df_to_records_safe(df, max_rows=10)

        assert len(records) == 5
        assert truncated is False


class TestRelationalHelpers:
    """Tests for relational support helper functions."""

    def test_safe_table_name(self):
        """_safe_table_name should produce valid DuckDB table names."""
        from app.api.relational_routes import _safe_table_name

        assert _safe_table_name("sales_data.csv") == "sales_data"
        assert _safe_table_name("My File!@#.xlsx") == "my_file"
        assert _safe_table_name("2024_sales_report.tsv") == "2024_sales_report"
        assert _safe_table_name("file with spaces.csv") == "file_with_spaces"
        assert _safe_table_name("UPPERCASE.CSV") == "uppercase"
        assert _safe_table_name("123file.csv") == "123file"
        # Edge case: all special chars
        result = _safe_table_name("!!!.csv")
        assert result in ("", "table") or result.startswith("table")

    def test_safe_table_name_max_length(self):
        """_safe_table_name should limit output to 64 chars."""
        from app.api.relational_routes import _safe_table_name

        long_name = "a" * 200 + ".csv"
        result = _safe_table_name(long_name)
        assert len(result) <= 64

    def test_join_config_model(self):
        """JoinConfig should validate join configuration."""
        from app.api.relational_routes import JoinConfig, JoinColumn

        col = JoinColumn(left_column="id", right_column="user_id")
        join = JoinConfig(
            join_id="j_abc123",
            left_table="orders",
            right_table="users",
            join_type="inner",
            columns=[col],
            alias="orders_users",
        )
        assert join.left_table == "orders"
        assert join.join_type == "inner"
        assert len(join.columns) == 1

    def test_join_config_rejects_invalid_type(self):
        """JoinConfig should reject invalid join types."""
        from app.api.relational_routes import JoinConfig, JoinColumn

        with pytest.raises(Exception):
            JoinConfig(
                join_id="j_123",
                left_table="a",
                right_table="b",
                join_type="full_outer",  # invalid
                columns=[JoinColumn(left_column="x", right_column="y")],
            )

    def test_create_join_request_model(self):
        """CreateJoinRequest should validate input."""
        from app.api.relational_routes import CreateJoinRequest, JoinColumn

        req = CreateJoinRequest(
            left_table="orders",
            right_table="users",
            join_type="left",
            columns=[JoinColumn(left_column="user_id", right_column="id")],
        )
        assert req.join_type == "left"
        assert len(req.columns) == 1

    def test_join_validation_response_model(self):
        """JoinValidationResponse should serialize correctly."""
        from app.api.relational_routes import JoinValidationResponse

        resp = JoinValidationResponse(
            is_valid=True,
            reason="valid",
            estimated_output_rows=500,
            sample_output=[{"a": 1, "b": 2}],
        )
        assert resp.is_valid is True
        assert resp.estimated_output_rows == 500


class TestDataPortabilityExport:
    """Tests for CSV/TSV export formatting."""

    def test_csv_export_formatting(self):
        """Exported CSV should have proper formatting."""
        import csv
        import io

        data = {"name": ["Alice", "Bob"], "score": [95.5, 87.0]}
        df = pd.DataFrame(data)

        output = io.StringIO()
        writer = csv.writer(output, delimiter=",", lineterminator="\n")
        writer.writerow(df.columns)
        for row in df.itertuples(index=False, name=None):
            clean = ["" if isinstance(v, float) and (np.isnan(v) or np.isinf(v)) else v for v in row]
            writer.writerow(clean)

        csv_content = output.getvalue()
        lines = csv_content.strip().split("\n")
        assert len(lines) == 3  # header + 2 data rows
        assert lines[0] == "name,score"
        assert "Alice" in lines[1]
        assert "95.5" in lines[1]

    def test_tsv_export_formatting(self):
        """Exported TSV should use tab delimiter."""
        import csv
        import io

        data = {"name": ["Alice", "Bob"], "score": [95.5, 87.0]}
        df = pd.DataFrame(data)

        output = io.StringIO()
        writer = csv.writer(output, delimiter="\t", lineterminator="\n")
        writer.writerow(df.columns)
        for row in df.itertuples(index=False, name=None):
            clean = ["" if isinstance(v, float) and (np.isnan(v) or np.isinf(v)) else v for v in row]
            writer.writerow(clean)

        tsv_content = output.getvalue()
        lines = tsv_content.strip().split("\n")
        assert "\t" in lines[0]  # tabs instead of commas
        assert "Alice" in lines[1]

    def test_nan_inf_replacement_in_export(self):
        """NaN and Inf values should be replaced with empty strings in export."""
        import csv
        import io

        df = pd.DataFrame({
            "val": [1.0, np.nan, np.inf, -np.inf, 5.0],
        })

        output = io.StringIO()
        writer = csv.writer(output, delimiter=",", lineterminator="\n")
        writer.writerow(df.columns)
        for row in df.itertuples(index=False, name=None):
            clean = ["" if isinstance(v, float) and (np.isnan(v) or np.isinf(v)) else v for v in row]
            writer.writerow(clean)

        content = output.getvalue()
        lines = content.strip().split("\n")
        # Header + 5 data rows
        assert len(lines) == 6
        # First value preserved, last value preserved
        assert "1.0" in lines[1]
        assert "5.0" in lines[5]
        # NaN/Inf rows become empty strings (represented as "" in CSV)
        assert '""' in content

    def test_query_export_request_model(self):
        """QueryExportRequest should validate format and SQL."""
        from app.api.download_routes import QueryExportRequest

        req = QueryExportRequest(sql="SELECT * FROM data")
        assert req.format == "csv"
        assert req.filename is None

        req_tsv = QueryExportRequest(sql="SELECT 1", format="tsv")
        assert req_tsv.format == "tsv"

        with pytest.raises(Exception):
            QueryExportRequest(sql="SELECT 1", format="xlsx")

        with pytest.raises(Exception):
            QueryExportRequest(sql="")

    def test_export_filename_sanitization(self):
        """Export filenames should be sanitized of dangerous characters."""
        import re

        dangerous_names = [
            "file with spaces.csv",
            "file;DROP TABLE.csv",
            'file"with"quotes.csv',
            "file/with/slashes.csv",
            "file\\with\\backslashes.csv",
        ]

        for name in dangerous_names:
            safe = re.sub(r"[^\w\-]", "_", name)
            assert "/" not in safe
            assert "\\" not in safe
            assert '"' not in safe
            assert ";" not in safe


class TestJoinRegistryLogic:
    """Tests for join registry storage logic (unit-level)."""

    def test_join_registry_structure(self):
        """Join registry should be a dict with joins list and tables list."""
        registry = {"joins": [], "tables": ["orders", "users"]}

        join_entry = {
            "join_id": "j_abc123",
            "left_table": "orders",
            "right_table": "users",
            "join_type": "inner",
            "columns": [{"left_column": "user_id", "right_column": "id"}],
            "alias": "orders_users",
        }

        registry["joins"].append(join_entry)

        assert len(registry["joins"]) == 1
        assert registry["joins"][0]["left_table"] == "orders"
        assert "orders" in registry["tables"]

    def test_join_registry_json_roundtrip(self):
        """Join registry should survive JSON serialization."""
        registry = {
            "joins": [
                {
                    "join_id": "j_abc123",
                    "left_table": "orders",
                    "right_table": "users",
                    "join_type": "inner",
                    "columns": [{"left_column": "user_id", "right_column": "id"}],
                    "alias": None,
                }
            ],
            "tables": ["orders", "users"],
        }

        serialized = json.dumps(registry)
        deserialized = json.loads(serialized)

        assert len(deserialized["joins"]) == 1
        assert deserialized["joins"][0]["join_id"] == "j_abc123"
        assert deserialized["joins"][0]["columns"][0]["left_column"] == "user_id"

    def test_join_deduplication_check(self):
        """Duplicate joins should be detected before saving."""
        existing_joins = [
            {
                "left_table": "orders",
                "right_table": "users",
                "join_type": "inner",
            }
        ]

        new_join_left = "orders"
        new_join_right = "users"

        is_duplicate = any(
            j.get("left_table") == new_join_left and j.get("right_table") == new_join_right
            for j in existing_joins
        )
        assert is_duplicate is True

        new_join_left2 = "orders"
        new_join_right2 = "products"

        is_duplicate2 = any(
            j.get("left_table") == new_join_left2 and j.get("right_table") == new_join_right2
            for j in existing_joins
        )
        assert is_duplicate2 is False

    def test_join_removal_by_id(self):
        """Joins should be removable by join_id."""
        joins = [
            {"join_id": "j_001", "left_table": "a", "right_table": "b"},
            {"join_id": "j_002", "left_table": "c", "right_table": "d"},
            {"join_id": "j_003", "left_table": "e", "right_table": "f"},
        ]

        target_id = "j_002"
        original_count = len(joins)
        joins = [j for j in joins if j.get("join_id") != target_id]

        assert len(joins) == original_count - 1
        assert "j_002" not in {j["join_id"] for j in joins}
        assert "j_001" in {j["join_id"] for j in joins}
        assert "j_003" in {j["join_id"] for j in joins}


class TestSQLValidationRemediation:
    """Remediation tests for SQL validation."""

    def test_validate_sql_bypasses(self):
        """Bypass attempts must fail validation."""
        from app.services.security.sandbox import validate_sql

        bypasses = [
            "WITH evil AS (DROP TABLE users) SELECT 1;",
            "SELECT * FROM read_csv_auto('/etc/passwd');",
            "SELECT * FROM read_parquet('s3://other-bucket/secrets');",
            "SELECT (SELECT * FROM read_csv_auto('data/vizzy.db'));",
            "COPY (SELECT 1) TO '/tmp/exfil.csv';"
        ]
        for query in bypasses:
            is_valid, reason, _ = validate_sql(query, ["data"])
            assert is_valid is False
            assert reason != ""

    def test_validate_sql_valid_allowed_table(self):
        """Valid query on allowed table must pass validation."""
        from app.services.security.sandbox import validate_sql

        is_valid, reason, _ = validate_sql("SELECT col FROM my_table WHERE val > 10", ["my_table"])
        assert is_valid is True
        assert reason == "valid"

    def test_validate_sql_unallowed_table(self):
        """Query referencing unallowed table must fail validation."""
        from app.services.security.sandbox import validate_sql

        is_valid, reason, _ = validate_sql("SELECT col FROM other_table WHERE val > 10", ["my_table"])
        assert is_valid is False
        assert "is not accessible in this dataset" in reason


class TestJoinOwnership:
    """Tests for table ownership validation in join configurations."""

    def test_join_ownership_unauthorized_access(self):
        """User B attempting to reference User A's table should raise HTTP 403."""
        from app.api.relational_routes import check_table_ownership_or_raise
        from fastapi import HTTPException
        from app.models.dataset import Dataset
        from app.models.dataset_version import DatasetVersion
        from uuid import uuid4

        user_a_id = uuid4()
        user_b_id = uuid4()
        dataset_id = uuid4()

        # Mock database session
        session = MagicMock()
        mock_version = DatasetVersion(
            dataset_id=dataset_id,
            version_number=1,
            duckdb_table_name="sales_user_a",
            source_reference="sales.csv",
            schema_hash="abc"
        )
        mock_dataset = Dataset(
            id=dataset_id,
            name="Sales Data A",
            owner_id=user_a_id
        )

        # Mock session.exec queries
        session.exec().first.side_effect = [mock_version, mock_dataset]

        with pytest.raises(HTTPException) as exc:
            import asyncio
            asyncio.run(check_table_ownership_or_raise("sales_user_a", str(user_b_id), session))

        assert exc.value.status_code == 403
        assert "Access denied" in exc.value.detail

    def test_join_ownership_authorized_access(self):
        """User A referencing their own table should succeed."""
        from app.api.relational_routes import check_table_ownership_or_raise
        from app.models.dataset import Dataset
        from app.models.dataset_version import DatasetVersion
        from uuid import uuid4

        user_a_id = uuid4()
        dataset_id = uuid4()

        session = MagicMock()
        mock_version = DatasetVersion(
            dataset_id=dataset_id,
            version_number=1,
            duckdb_table_name="sales_user_a",
            source_reference="sales.csv",
            schema_hash="abc"
        )
        mock_dataset = Dataset(
            id=dataset_id,
            name="Sales Data A",
            owner_id=user_a_id
        )

        session.exec().first.side_effect = [mock_version, mock_dataset]

        import asyncio
        # Should not raise any exception
        asyncio.run(check_table_ownership_or_raise("sales_user_a", str(user_a_id), session))

    def test_join_ownership_non_existent_table(self):
        """Referencing a non-existent table should raise HTTP 404."""
        from app.api.relational_routes import check_table_ownership_or_raise
        from fastapi import HTTPException
        from uuid import uuid4

        session = MagicMock()
        session.exec().first.return_value = None  # No version found

        with pytest.raises(HTTPException) as exc:
            import asyncio
            asyncio.run(check_table_ownership_or_raise("non_existent_table", str(uuid4()), session))

        assert exc.value.status_code == 404
        assert "not found" in exc.value.detail


class TestExportLimits:
    """Tests for export row size limits and AST-based enforcement."""

    def test_enforce_export_limit_no_limit(self):
        """Query with no limit should have a limit appended."""
        from app.api.download_routes import enforce_export_limit
        sql = "SELECT * FROM data"
        limited = enforce_export_limit(sql, 500000)
        assert "LIMIT 500000" in limited

    def test_enforce_export_limit_too_large(self):
        """Query with a limit exceeding MAX_EXPORT_ROWS should be capped."""
        from app.api.download_routes import enforce_export_limit
        sql = "SELECT * FROM data LIMIT 1000000"
        limited = enforce_export_limit(sql, 500000)
        assert "LIMIT 500000" in limited

    def test_enforce_export_limit_small_limit(self):
        """Query with a limit smaller than MAX_EXPORT_ROWS should be preserved."""
        from app.api.download_routes import enforce_export_limit
        sql = "SELECT * FROM data LIMIT 100"
        limited = enforce_export_limit(sql, 500000)
        assert "LIMIT 100" in limited

    def test_export_table_row_count_check(self):
        """export_table should fail with HTTP 400 when row count is > MAX_EXPORT_ROWS."""
        from app.api.download_routes import export_table
        from fastapi import HTTPException
        from uuid import uuid4
        from unittest.mock import AsyncMock

        session = MagicMock()
        current_user = MagicMock()
        current_user.user_id = str(uuid4())
        current_user.role = "user"
        
        # Mock dependencies in download_routes
        with patch("app.api.download_routes.verify_dataset_owner") as mock_verify_owner, \
             patch("app.api.download_routes.get_latest_version") as mock_get_version, \
             patch("app.api.download_routes.get_or_build_duckdb") as mock_build_db, \
             patch("app.api.download_routes.duckdb.connect") as mock_connect:
             
            mock_verify_owner.return_value = None
            mock_version = MagicMock()
            mock_version.cleaned_reference = "cleaned.csv"
            mock_version.source_reference = "source.csv"
            mock_version.id = uuid4()
            mock_get_version.return_value = mock_version
            
            mock_db_path = MagicMock()
            mock_db_path.exists.return_value = True
            mock_build_db.return_value = mock_db_path
            
            mock_conn = MagicMock()
            mock_connect.return_value = mock_conn
            
            # Mock row count query returning 600,000
            mock_conn.execute().fetchone.return_value = (600000,)
            mock_conn.execute().df.return_value = pd.DataFrame({"name": ["my_table"]})
            
            import asyncio
            with pytest.raises(HTTPException) as exc:
                asyncio.run(export_table(
                    dataset_id=uuid4(),
                    table_name="my_table",
                    format="csv",
                    session=session,
                    current_user=current_user
                ))
                
            assert exc.value.status_code == 400
            assert "Export is limited to" in exc.value.detail


class TestFilterColumnsDuckDB:
    """Integration tests for filter_columns_duckdb with DuckDB-accurate cardinality."""

    @pytest.fixture
    def small_csv_path(self, tmp_path):
        """Create a small CSV with 200 rows for the sample DataFrame."""
        import csv
        path = tmp_path / "small_sample.csv"
        rows = []
        for i in range(200):
            # "Product" column: 20 unique values, each repeated 10x (cardinality 0.1)
            product = f"Product_{i // 10}"
            # "Region" column: 4 unique values (cardinality 0.02)
            region = ["North", "South", "East", "West"][i % 4]
            # "ProductId" column: all 200 values unique in sample (cardinality 1.0)
            # but only 200 unique in the full 10000-row dataset (cardinality 0.02)
            product_id = f"PROD_{i % 200}"
            # "TransactionId": truly unique across ALL rows (cardinality 1.0)
            txn_id = f"TXN_{i:05d}"
            # "Amount": numeric metric
            amount = round(100.0 + (i * 1.5), 2)
            # "Date": date column
            date = f"2024-01-{(i % 31) + 1:02d}"
            rows.append([product, region, product_id, txn_id, amount, date])
        with open(str(path), "w", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(["Product", "Region", "ProductId", "TransactionId", "Amount", "Date"])
            writer.writerows(rows)
        return str(path)

    @pytest.fixture
    def full_csv_path(self, tmp_path):
        """Create a 10,000-row CSV for the DuckDB build."""
        import csv
        path = tmp_path / "full_dataset.csv"
        rows = []
        for i in range(10000):
            product = f"Product_{i // 50}"         # 200 unique, cardinality 0.02
            region = ["North", "South", "East", "West"][i % 4]  # 4 unique, cardinality 0.0004
            product_id = f"PROD_{i % 200}"          # 200 unique, cardinality 0.02 (NOT an ID!)
            txn_id = f"TXN_{i:05d}"                 # 10000 unique, cardinality 1.0
            amount = round(100.0 + (i * 0.3), 2)
            date = f"2024-{(i % 12) + 1:02d}-{(i % 28) + 1:02d}"
            rows.append([product, region, product_id, txn_id, amount, date])
        with open(str(path), "w", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(["Product", "Region", "ProductId", "TransactionId", "Amount", "Date"])
            writer.writerows(rows)
        return str(path)

    @pytest.fixture
    def reader_and_sample(self, full_csv_path, small_csv_path):
        """
        Build a DuckDB from the full CSV, then return (DuckDBReader, sample_df).
        Mirrors the upload pipeline: build_duckdb_from_csv() → sample_rows(200).
        """
        from app.services.analytics.duckdb_builder import build_duckdb_from_csv
        from app.services.analytics.duckdb_reader import DuckDBReader
        import asyncio

        duckdb_path = asyncio.run(build_duckdb_from_csv(
            dataset_id=uuid4(),
            version_id=uuid4(),
            csv_path=full_csv_path,
        ))
        reader = DuckDBReader(str(duckdb_path))
        reader.set_table("data")
        sample = pd.read_csv(small_csv_path)
        return reader, sample

    def test_duckdb_profiling_reduces_false_id_detection(self, reader_and_sample):
        """
        ProductId has 200 unique values out of 10000 total (cardinality 0.02).
        The sample-based profiler sees 200 unique / 200 rows (cardinality 1.0)
        and flags it as an ID (name has "Id" + high cardinality in sample).
        DuckDB-accurate profiling correctly sees 200/10000 cardinality=0.02
        and classifies it as a dimension instead.
        """
        reader, sample = reader_and_sample
        from app.services.analytics.column_filter import filter_columns_duckdb, filter_columns
        from app.services.analytics.domain_detector import DomainType

        # Sample-based filter should INCORRECTLY exclude ProductId as an ID
        sample_based = filter_columns(sample, DomainType.GENERIC)
        # DuckDB-accurate filter should CORRECTLY keep it as a dimension
        duckdb_based = filter_columns_duckdb(sample, DomainType.GENERIC, reader)

        assert "ProductId" in sample_based.excluded, (
            "Sample-based filter should falsely flag ProductId as ID "
            "(name has 'Id' + 200/200 unique in sample = cardinality 1.0)"
        )
        assert "ProductId" in duckdb_based.dimensions, (
            "DuckDB-accurate filter should correctly see 200/10000 cardinality=0.02 "
            "as a dimension"
        )

    def test_duckdb_still_detects_true_id_columns(self, reader_and_sample):
        """
        TransactionId has 10000 unique / 10000 rows (cardinality 1.0).
        Both sample-based and DuckDB-accurate filters should exclude it.
        """
        reader, sample = reader_and_sample
        from app.services.analytics.column_filter import filter_columns_duckdb, filter_columns
        from app.services.analytics.domain_detector import DomainType

        sample_based = filter_columns(sample, DomainType.GENERIC)
        duckdb_based = filter_columns_duckdb(sample, DomainType.GENERIC, reader)

        assert "TransactionId" in sample_based.excluded
        assert "TransactionId" in duckdb_based.excluded, (
            "TransactionId is truly unique across 10000 rows — DuckDB should still flag as ID"
        )

    def test_duckdb_detects_date_columns(self, reader_and_sample):
        """Date column should be classified as a date by both methods."""
        reader, sample = reader_and_sample
        from app.services.analytics.column_filter import filter_columns_duckdb
        from app.services.analytics.domain_detector import DomainType

        classification = filter_columns_duckdb(sample, DomainType.GENERIC, reader)
        assert "Date" in classification.dates

    def test_duckdb_detects_metric_columns(self, reader_and_sample):
        """Amount column should be classified as a metric."""
        reader, sample = reader_and_sample
        from app.services.analytics.column_filter import filter_columns_duckdb
        from app.services.analytics.domain_detector import DomainType

        classification = filter_columns_duckdb(sample, DomainType.GENERIC, reader)
        assert "Amount" in classification.metrics

    def test_duckdb_classifies_low_cardinality_as_dimension(self, reader_and_sample):
        """
        Region has only 4 unique values (cardinality 0.0004) — should be a dimension.
        """
        reader, sample = reader_and_sample
        from app.services.analytics.column_filter import filter_columns_duckdb
        from app.services.analytics.domain_detector import DomainType

        classification = filter_columns_duckdb(sample, DomainType.GENERIC, reader)
        assert "Region" in classification.dimensions

    def test_duckdb_classifies_medium_cardinality_dimension(self, reader_and_sample):
        """
        Product has 200 unique values (cardinality 0.02) — should be a dimension
        because cardinality < 0.2 and unique_count < 500.
        """
        reader, sample = reader_and_sample
        from app.services.analytics.column_filter import filter_columns_duckdb
        from app.services.analytics.domain_detector import DomainType

        classification = filter_columns_duckdb(sample, DomainType.GENERIC, reader)
        assert "Product" in classification.dimensions

    def test_duckdb_numeric_id_not_excluded(self, tmp_path):
        """
        Numeric columns with high cardinality should NOT be excluded as IDs,
        regardless of whether DuckDB or sample profiling is used.
        """
        from app.services.analytics.duckdb_builder import build_duckdb_from_csv
        from app.services.analytics.duckdb_reader import DuckDBReader
        from app.services.analytics.column_filter import filter_columns_duckdb
        from app.services.analytics.domain_detector import DomainType
        import asyncio
        import numpy as np
        from uuid import uuid4

        np.random.seed(42)
        csv_path = str(tmp_path / "numeric_ids.csv")
        df = pd.DataFrame({
            "NumericId": range(5000),       # 5000 unique, cardinality 1.0
            "Category": ["A", "B"] * 2500,  # 2 unique
            "Value": np.random.rand(5000),
        })
        df.to_csv(csv_path, index=False)

        duckdb_path = asyncio.run(build_duckdb_from_csv(
            dataset_id=uuid4(), version_id=uuid4(), csv_path=csv_path,
        ))
        reader = DuckDBReader(str(duckdb_path))
        reader.set_table("data")
        sample = df.head(200).copy()

        classification = filter_columns_duckdb(sample, DomainType.GENERIC, reader)
        # NumericId is numeric type — type guard skips ID detection
        assert "NumericId" not in classification.excluded, (
            "Numeric columns with high cardinality should not be excluded as IDs"
        )


class TestEndToEndDuckDBPipeline:
    """Full end-to-end test: CSV → DuckDB build → sample → dashboard generation."""

    def test_full_pipeline_returns_dashboard_without_pandas_full_load(self, tmp_path):
        """
        The complete DuckDB-first pipeline:
        1. Build DuckDB from a 10,000-row CSV
        2. Read 200-row sample (no pandas full-load of the CSV)
        3. Generate dashboard with accurate KPIs and column classification
        4. Verify dashboard has correct total_records, KPIs, and chart widgets
        """
        import csv
        import asyncio
        from uuid import uuid4

        # ── Create a realistic CSV with 10,000 rows ──
        csv_path = str(tmp_path / "e2e_data.csv")
        rows = []
        for i in range(10000):
            rows.append([
                f"Product_{i // 500}",                          # 20 unique (cardinality 0.002)
                ["North", "South", "East", "West"][i % 4],      # 4 unique (cardinality 0.0004)
                f"CUST_{i % 200}",                               # 200 unique (cardinality 0.02)
                round(100.0 + (i * 0.15), 2),                    # Amount metric
                f"2024-{(i % 12) + 1:02d}-{(i % 28) + 1:02d}",  # Date
                (i % 50) + 1,                                    # Quantity metric
            ])
        with open(csv_path, "w", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(["Product", "Region", "CustomerId", "Amount", "Date", "Quantity"])
            writer.writerows(rows)

        # ── Step 1: Build DuckDB synchronously (replaces pandas full-load) ──
        from app.services.analytics.duckdb_builder import build_duckdb_from_csv
        from app.services.analytics.duckdb_reader import DuckDBReader

        duckdb_path = asyncio.run(build_duckdb_from_csv(
            dataset_id=uuid4(), version_id=uuid4(), csv_path=csv_path,
        ))

        # ── Step 2: Connect reader and sample 200 rows (NOT full pandas load) ──
        reader = DuckDBReader(str(duckdb_path))
        reader.set_table("data")
        sample = reader.sample_rows(limit=200)

        assert len(sample) == 200, f"Expected 200 sample rows, got {len(sample)}"
        assert list(sample.columns) == ["Product", "Region", "CustomerId", "Amount", "Date", "Quantity"]

        # ── Step 3: Generate full dashboard using DuckDB-accurate values ──
        from app.services.visualization.dashboard_generator import generate_overview_dashboard_duckdb

        dashboard_dict = generate_overview_dashboard_duckdb(
            df=sample,
            reader=reader,
            schema={"columns": [
                {"name": "Product", "type": "string"},
                {"name": "Region", "type": "string"},
                {"name": "CustomerId", "type": "string"},
                {"name": "Amount", "type": "float"},
                {"name": "Date", "type": "date"},
                {"name": "Quantity", "type": "integer"},
            ]},
        )
        reader.close()

        # ── Step 4: Verify dashboard output ──
        assert "dashboard" in dashboard_dict, "Dashboard dict should contain 'dashboard' key"

        dsl = dashboard_dict["dashboard"]
        assert isinstance(dsl, dict), "Dashboard should be a dict DSL layout"

        # Verify total_records is DuckDB-accurate (10000, not sample size 200)
        assert dsl.get("total_records") == 10000, (
            f"total_records should be 10000 (DuckDB-accurate), got {dsl.get('total_records')}"
        )

        # Verify widgets are present
        widgets = dsl.get("widgets", [])
        assert len(widgets) > 0, "Dashboard should have at least one widget"

        # Verify at least one KPI widget with a correct value
        kpi_widgets = [w for w in widgets if w.get("type") == "kpi"]
        assert len(kpi_widgets) > 0, "Dashboard should have at least one KPI widget"

        # Check total_records KPI value is 10000 (DuckDB-accurate), not 200
        total_rec_kpi = next((w for w in kpi_widgets if "record" in w.get("title", "").lower()), None)
        if total_rec_kpi:
            val = total_rec_kpi.get("data", {}).get("value")
            assert val == 10000, (
                f"Total records KPI should be 10000 (DuckDB-accurate), got {val}"
            )

        # Verify chart widgets are present
        chart_widgets = [w for w in widgets if w.get("type") != "kpi"]
        assert len(chart_widgets) > 0, "Dashboard should have at least one chart widget"

        # Verify layout property exists
        assert "layout" in dsl, "Dashboard DSL should define a layout"

    def test_pipeline_kpi_values_match_duckdb_direct_query(self, tmp_path):
        """
        Verify that KPI values produced by generate_overview_dashboard_duckdb()
        match directly-executed DuckDB queries against the same data.
        """
        import csv
        import asyncio
        from uuid import uuid4

        # Small CSV for fast testing
        csv_path = str(tmp_path / "kpi_verify.csv")
        rows = []
        for i in range(500):
            rows.append([
                round(50.0 + (i * 2.0), 2),   # Amount
                f"2024-01-{(i % 28) + 1:02d}",# Date
                (i % 10) * 5,                  # Quantity
            ])
        with open(csv_path, "w", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(["Amount", "Date", "Quantity"])
            writer.writerows(rows)

        from app.services.analytics.duckdb_builder import build_duckdb_from_csv
        from app.services.analytics.duckdb_reader import DuckDBReader

        duckdb_path = asyncio.run(build_duckdb_from_csv(
            dataset_id=uuid4(), version_id=uuid4(), csv_path=csv_path,
        ))
        reader = DuckDBReader(str(duckdb_path))
        reader.set_table("data")
        sample = reader.sample_rows(limit=200)

        # Compute expected values directly via DuckDB
        expected_sum = reader.sum_col("Amount")
        expected_avg = reader.avg_col("Amount")
        expected_count = reader.row_count()
        expected_qty_sum = reader.sum_col("Quantity")

        # Generate dashboard
        from app.services.visualization.dashboard_generator import generate_overview_dashboard_duckdb

        dashboard_dict = generate_overview_dashboard_duckdb(
            df=sample,
            reader=reader,
            schema={"columns": [
                {"name": "Amount", "type": "float"},
                {"name": "Date", "type": "date"},
                {"name": "Quantity", "type": "integer"},
            ]},
        )

        # Verify total_records
        assert dashboard_dict["dashboard"]["total_records"] == expected_count

        # Verify KPI widgets have correct values (spot-check sum/avg)
        kpi_widgets = [
            w for w in dashboard_dict["dashboard"].get("widgets", [])
            if w.get("type") == "kpi"
        ]
        # Look for a KPI whose data.value matches the expected sum
        matches_sum = any(
            w.get("data", {}).get("value") == expected_sum
            for w in kpi_widgets
        )
        assert matches_sum, (
            f"No KPI widget matches expected sum {expected_sum}. "
            f"KPI values: {[w.get('data', {}).get('value') for w in kpi_widgets]}"
        )

        reader.close()

    def test_pipeline_handles_non_utf8_csv_gracefully(self, tmp_path):
        """
        Non-UTF-8 encoded CSV should be handled by DuckDB builder's
        re-encoding fallback without crashing the pipeline.
        """
        import asyncio
        from uuid import uuid4

        # Create a CSV with Latin-1 encoding (e.g., café, résumé)
        csv_path = str(tmp_path / "latin1_data.csv")
        raw_bytes = (
            b"Product,Price,Date\n"
            b"Caf\xe9,10.50,2024-01-15\n"      # café
            b"R\xe9sum\xe9,25.00,2024-02-20\n"  # résumé
            b"Fianc\xe9,15.75,2024-03-10\n"      # fiancé
        )
        with open(csv_path, "wb") as f:
            f.write(raw_bytes)

        from app.services.analytics.duckdb_builder import build_duckdb_from_csv
        from app.services.analytics.duckdb_reader import DuckDBReader

        # Build should succeed even with non-UTF-8 encoding
        duckdb_path = asyncio.run(build_duckdb_from_csv(
            dataset_id=uuid4(), version_id=uuid4(), csv_path=csv_path,
        ))
        reader = DuckDBReader(str(duckdb_path))
        reader.set_table("data")
        sample = reader.sample_rows(limit=200)

        # Verify data loaded correctly
        assert len(sample) == 3, f"Expected 3 rows, got {len(sample)}"
        assert "Product" in sample.columns

        # Generate dashboard — should not crash
        from app.services.visualization.dashboard_generator import generate_overview_dashboard_duckdb

        dashboard_dict = generate_overview_dashboard_duckdb(
            df=sample,
            reader=reader,
            schema={"columns": [
                {"name": "Product", "type": "string"},
                {"name": "Price", "type": "float"},
                {"name": "Date", "type": "date"},
            ]},
        )
        reader.close()

        assert "dashboard" in dashboard_dict
        widgets = dashboard_dict["dashboard"].get("widgets", [])
        assert len(widgets) > 0, "Dashboard should have widgets even with non-UTF-8 data"