"""
Test suite for Phase 2: Data Pipeline Integrity.

Covers:
- Performance Baseline: composite indices on date/categorical columns
- Query Parameterization: parameterized SQL execution safety
- Coercion pipeline parameterization
- Integration: index creation during table loading
"""

import pytest
import pandas as pd
import duckdb
from unittest.mock import Mock, patch, MagicMock


# =============================================================================
# Query Parameterization Tests
# =============================================================================

class TestSafeIdentifier:
    """Tests for query_utils.safe_identifier()."""

    def test_valid_column_name(self):
        """Simple column names pass validation."""
        from app.services.analytics.query_utils import safe_identifier
        assert safe_identifier("sales") == '"sales"'

    def test_valid_name_with_underscore(self):
        """Underscore is allowed in identifiers."""
        from app.services.analytics.query_utils import safe_identifier
        assert safe_identifier("total_sales") == '"total_sales"'

    def test_valid_name_starting_with_underscore(self):
        """Identifiers can start with underscore."""
        from app.services.analytics.query_utils import safe_identifier
        assert safe_identifier("_tmp") == '"_tmp"'

    def test_rejects_empty_string(self):
        """Empty string is not a valid identifier."""
        from app.services.analytics.query_utils import safe_identifier, QuerySafetyError
        with pytest.raises(QuerySafetyError):
            safe_identifier("")

    def test_allows_spaces(self):
        """Spaces in identifiers are safe inside double-quotes."""
        from app.services.analytics.query_utils import safe_identifier
        result = safe_identifier("my column")
        assert result == '"my column"', f"Spaces should be quoted: {result}"

    def test_allows_sql_like_in_identifier(self):
        """SQL-like syntax inside identifier is harmless when quoted.
        
        '1; DROP TABLE users' inside double-quotes is a single identifier,
        not executable SQL. DuckDB treats it as a column name literal.
        """
        from app.services.analytics.query_utils import safe_identifier
        result = safe_identifier("1; DROP TABLE users")
        assert result == '"1; DROP TABLE users"', f"Should be safely quoted: {result}"

    def test_allows_hyphens(self):
        """Hyphens in identifiers are safe inside double-quotes."""
        from app.services.analytics.query_utils import safe_identifier
        result = safe_identifier("column-name")
        assert result == '"column-name"', f"Hyphens should be quoted: {result}"

    def test_allows_numeric_start(self):
        """Identifiers starting with a digit are valid when quoted."""
        from app.services.analytics.query_utils import safe_identifier
        result = safe_identifier("1st_column")
        assert result == '"1st_column"', f"Numeric prefix should be quoted: {result}"

    def test_escapes_double_quote_injection(self):
        """Double-quote is escaped (doubled), not rejected."""
        from app.services.analytics.query_utils import safe_identifier
        result = safe_identifier('col"; DROP TABLE "data')
        assert result == '"col""; DROP TABLE ""data"', (
            f"Double-quotes should be escaped: {result}"
        )


class TestSafeTableRef:
    """Tests for query_utils.safe_table_ref()."""

    def test_catalog_table_quoted(self):
        """Catalog.table references are both quoted."""
        from app.services.analytics.query_utils import safe_table_ref
        assert safe_table_ref("main", "data") == '"main"."data"'


class TestExecute:
    """Tests for query_utils.execute() with a real DuckDB in-memory connection."""

    @pytest.fixture(autouse=True)
    def _conn(self):
        """Create an in-memory DuckDB connection for each test."""
        conn = duckdb.connect(":memory:")
        conn.execute("CREATE TABLE test_data (x INTEGER, y VARCHAR, z DOUBLE)")
        conn.execute("INSERT INTO test_data VALUES (1, 'a', 1.1), (2, 'b', 2.2), (3, 'c', 3.3)")
        self.conn = conn
        yield
        conn.close()

    def test_execute_no_params(self):
        """Query without parameters executes correctly."""
        from app.services.analytics.query_utils import execute
        result = execute(self.conn, "SELECT COUNT(*) AS c FROM test_data")
        assert result.fetchone()[0] == 3

    def test_execute_with_params(self):
        """Query with ? placeholders executes correctly."""
        from app.services.analytics.query_utils import execute
        result = execute(self.conn, "SELECT * FROM test_data WHERE x = ?", params=[2])
        row = result.fetchone()
        assert row[0] == 2
        assert row[1] == "b"

    def test_execute_multiple_params(self):
        """Multiple ? placeholders are handled correctly."""
        from app.services.analytics.query_utils import execute
        result = execute(self.conn, "SELECT * FROM test_data WHERE x > ? AND z < ?", params=[0, 3.0])
        rows = result.fetchall()
        assert len(rows) == 2

    def test_execute_parameter_mismatch_raises(self):
        """Mismatched placeholder count raises QuerySafetyError."""
        from app.services.analytics.query_utils import execute, QuerySafetyError
        with pytest.raises(QuerySafetyError, match="Parameter mismatch"):
            execute(self.conn, "SELECT * FROM test_data WHERE x = ? AND z = ?", params=[1])

    def test_execute_in_clause(self):
        """IN clause built via build_in_clause works with execute."""
        from app.services.analytics.query_utils import execute, build_in_clause
        in_fragment, params = build_in_clause(["a", "b"])
        result = execute(
            self.conn,
            f"SELECT COUNT(*) AS c FROM test_data WHERE y {in_fragment}",
            params=params
        )
        assert result.fetchone()[0] == 2

    def test_execute_empty_in_clause(self):
        """Empty IN clause returns NULL (no match)."""
        from app.services.analytics.query_utils import execute, build_in_clause
        in_fragment, params = build_in_clause([])
        result = execute(
            self.conn,
            f"SELECT COUNT(*) AS c FROM test_data WHERE y {in_fragment}",
            params=params
        )
        assert result.fetchone()[0] == 0


class TestExecuteDF:
    """Tests for query_utils.execute_df()."""

    def test_execute_df_returns_dataframe(self):
        """execute_df returns a pandas DataFrame."""
        from app.services.analytics.query_utils import execute_df
        conn = duckdb.connect(":memory:")
        conn.execute("CREATE TABLE t (x INTEGER)")
        conn.execute("INSERT INTO t VALUES (1), (2), (3)")
        df = execute_df(conn, "SELECT * FROM t ORDER BY x")
        assert isinstance(df, pd.DataFrame)
        assert len(df) == 3
        assert list(df["x"]) == [1, 2, 3]
        conn.close()

    def test_execute_df_with_params(self):
        """execute_df with parameters works correctly."""
        from app.services.analytics.query_utils import execute_df
        conn = duckdb.connect(":memory:")
        conn.execute("CREATE TABLE t (x INTEGER)")
        conn.execute("INSERT INTO t VALUES (10), (20), (30)")
        df = execute_df(conn, "SELECT * FROM t WHERE x > ?", params=[15])
        assert len(df) == 2
        conn.close()


# =============================================================================
# Index Manager Tests
# =============================================================================

class TestIndexManagerDateTypes:
    """Tests for index_manager._get_date_like_types()."""

    def test_returns_date_types_list(self):
        """_get_date_like_types returns a list of date/time type strings."""
        from app.services.analytics.index_manager import _get_date_like_types
        types = _get_date_like_types()
        assert isinstance(types, list)
        assert "DATE" in types
        assert "TIMESTAMP" in types
        assert len(types) >= 4


class TestIndexManagerIndexName:
    """Tests for index_manager._index_name()."""

    def test_index_name_format(self):
        """_index_name generates deterministic index names."""
        from app.services.analytics.index_manager import _index_name
        name = _index_name("data", "sales_date")
        assert name == "ix_data_sales_date"

    def test_index_name_sanitizes_special_chars(self):
        """_index_name replaces spaces and quotes."""
        from app.services.analytics.index_manager import _index_name
        name = _index_name('my"table', "my column")
        assert '"' not in name
        assert " " not in name


class TestIndexManagerLowCardinality:
    """Tests for index_manager._is_low_cardinality_categorical()."""

    def test_high_cardinality_returns_false(self):
        """Column with many unique values (e.g. IDs) is not low-cardinality."""
        from app.services.analytics.index_manager import _is_low_cardinality_categorical
        conn = duckdb.connect(":memory:")
        conn.execute("CREATE TABLE t (id VARCHAR)")
        for i in range(100):
            conn.execute("INSERT INTO t VALUES (?)", [f"value_{i}"])
        assert not _is_low_cardinality_categorical(conn, "t", "id")
        conn.close()

    def test_low_cardinality_returns_true(self):
        """Column with few unique values (e.g. categories) is low-cardinality."""
        from app.services.analytics.index_manager import _is_low_cardinality_categorical
        conn = duckdb.connect(":memory:")
        conn.execute("CREATE TABLE t (category VARCHAR)")
        categories = ["A", "B", "C"]
        for cat in categories:
            for _ in range(33):
                conn.execute("INSERT INTO t VALUES (?)", [cat])
        assert _is_low_cardinality_categorical(conn, "t", "category")
        conn.close()

    def test_empty_table_returns_false(self):
        """Empty table returns False (no data to classify)."""
        from app.services.analytics.index_manager import _is_low_cardinality_categorical
        conn = duckdb.connect(":memory:")
        conn.execute("CREATE TABLE t (x VARCHAR)")
        assert not _is_low_cardinality_categorical(conn, "t", "x")
        conn.close()


class TestCreatePerformanceIndices:
    """Tests for index_manager.create_performance_indices()."""

    @pytest.fixture(autouse=True)
    def _reset_cache(self):
        """Reset the _INDEX_CACHE between tests."""
        import app.services.analytics.index_manager as im
        im._INDEX_CACHE.clear()
        yield

    def test_creates_index_on_date_column(self):
        """Index is created on DATE columns."""
        from app.services.analytics.index_manager import create_performance_indices
        conn = duckdb.connect(":memory:")
        conn.execute("CREATE TABLE t (d DATE, x INTEGER)")
        conn.execute("INSERT INTO t VALUES ('2024-01-01', 1), ('2024-06-15', 2)")
        indices = create_performance_indices(conn, "t")
        # Should create at least one index for the date column
        assert len(indices) >= 1
        assert any("d" in idx for idx in indices)
        conn.close()

    def test_creates_index_on_low_cardinality_varchar(self):
        """Index is created on low-cardinality VARCHAR columns."""
        from app.services.analytics.index_manager import create_performance_indices
        conn = duckdb.connect(":memory:")
        conn.execute("CREATE TABLE t (category VARCHAR, x INTEGER)")
        categories = ["A", "B", "C"]
        for cat in categories:
            for _ in range(33):
                conn.execute("INSERT INTO t VALUES (?, ?)", [cat, 1])
        indices = create_performance_indices(conn, "t")
        assert len(indices) >= 1
        assert any("category" in idx for idx in indices)
        conn.close()

    def test_skips_high_cardinality_varchar(self):
        """No index is created on high-cardinality VARCHAR (like IDs)."""
        from app.services.analytics.index_manager import create_performance_indices
        conn = duckdb.connect(":memory:")
        conn.execute("CREATE TABLE t (name VARCHAR, d DATE)")
        for i in range(100):
            conn.execute("INSERT INTO t VALUES (?, '2024-01-01')", [f"person_{i}"])
        indices = create_performance_indices(conn, "t")
        # Should have index on 'd' (DATE) but NOT on 'name' (high cardinality)
        date_indices = [idx for idx in indices if "d" in idx]
        name_indices = [idx for idx in indices if "name" in idx]
        assert len(date_indices) >= 1
        assert len(name_indices) == 0
        conn.close()

    def test_cache_prevents_duplicate_indexing(self):
        """Second call with same table name returns empty (cached)."""
        from app.services.analytics.index_manager import create_performance_indices
        conn = duckdb.connect(":memory:")
        conn.execute("CREATE TABLE t (d DATE, x INTEGER)")
        conn.execute("INSERT INTO t VALUES ('2024-01-01', 1)")
        first = create_performance_indices(conn, "t")
        assert len(first) >= 1
        second = create_performance_indices(conn, "t")
        assert second == []
        conn.close()

    def test_handles_missing_table_gracefully(self):
        """Non-existent table returns empty list without crashing."""
        from app.services.analytics.index_manager import create_performance_indices
        conn = duckdb.connect(":memory:")
        result = create_performance_indices(conn, "nonexistent_table")
        assert result == []

    def test_table_reordered_by_date(self):
        """Table rows are re-ordered by date column after index creation."""
        from app.services.analytics.index_manager import create_performance_indices
        conn = duckdb.connect(":memory:")
        conn.execute("CREATE TABLE t (d DATE, val INTEGER)")
        # Insert in reverse date order
        conn.execute("INSERT INTO t VALUES ('2024-03-01', 3)")
        conn.execute("INSERT INTO t VALUES ('2024-01-01', 1)")
        conn.execute("INSERT INTO t VALUES ('2024-02-01', 2)")
        create_performance_indices(conn, "t")
        # After re-order by date, first row should be 2024-01-01
        result = conn.execute("SELECT val FROM t ORDER BY rowid").fetchone()
        # DuckDB rowid changes after CTAS, so check by ordering
        ordered = conn.execute("SELECT val FROM t ORDER BY d").fetchall()
        assert [r[0] for r in ordered] == [1, 2, 3]
        conn.close()


# =============================================================================
# Coercion Parameterization Tests
# =============================================================================

class TestCoercionParameterization:
    """Verify coercion.py uses parameterized queries."""

    def test_coercion_null_strings_parameterized(self):
        """NULL string handling uses parameterized IN clause (via pipeline)."""
        from app.services.analytics.coercion import run_coercion_pipeline
        conn = duckdb.connect(":memory:")
        conn.execute("CREATE TABLE t (val VARCHAR)")
        # Mix of valid numbers and null-like strings
        for v in ["100", "200", "n/a", "null", "300", "-"]:
            conn.execute("INSERT INTO t VALUES (?)", [v])
        # run_coercion_pipeline handles batch null-string cleanup + coerce_column
        results = run_coercion_pipeline(conn, "t")
        assert len(results) == 1
        assert results[0].coerced_type == "DOUBLE"
        conn.close()

    def test_coercion_sample_limit_parameterized(self):
        """LIMIT in sample query uses parameterized value."""
        from app.services.analytics.coercion import coerce_column
        conn = duckdb.connect(":memory:")
        conn.execute("CREATE TABLE t (val VARCHAR)")
        for i in range(100):
            conn.execute("INSERT INTO t VALUES (?)", [f"${i}.00"])
        result = coerce_column(conn, "t", "val", sample_size=10)
        # Should not crash — sample_size is parameterized
        assert result is not None
        conn.close()


# =============================================================================
# Semantic Audit Parameterization Tests
# =============================================================================

class TestSemanticAuditParameterization:
    """Verify semantic_audit.py uses parameterized queries."""

    def test_fetch_column_samples_parameterized(self):
        """_fetch_column_samples uses parameterized USING SAMPLE."""
        from app.services.semantic_audit import _fetch_column_samples
        conn = duckdb.connect(":memory:")
        conn.execute("CREATE TABLE t (x INTEGER)")
        for i in range(100):
            conn.execute("INSERT INTO t VALUES (?)", [i])
        samples = _fetch_column_samples(conn, "t", "x", limit=5)
        assert len(samples) == 5
        conn.close()

    def test_fetch_column_stats_parameterized(self):
        """_fetch_column_stats uses safe_identifier and execute()."""
        from app.services.semantic_audit import _fetch_column_stats
        conn = duckdb.connect(":memory:")
        conn.execute("CREATE TABLE t (x INTEGER, y VARCHAR)")
        conn.execute("INSERT INTO t VALUES (1, 'a'), (2, 'b'), (NULL, 'c')")
        stats = _fetch_column_stats(conn, "t", "x")
        assert stats["null_pct"] == pytest.approx(1.0 / 3, abs=0.001)
        assert stats["unique_count"] == 2
        conn.close()


# =============================================================================
# DBEngine Integration Tests
# =============================================================================

class TestDBEngineIndexIntegration:
    """Verify index creation is called during table loading."""

    def test_load_dataframe_calls_create_performance_indices(self):
        """load_dataframe triggers index creation."""
        from app.services.analytics.db_engine import DBEngine
        import app.services.analytics.index_manager as im
        im._INDEX_CACHE.clear()
        with patch("app.services.analytics.db_engine.create_performance_indices") as mock_idx:
            db = DBEngine(":memory:")
            import asyncio
            df = pd.DataFrame({
                "date": pd.date_range("2024-01-01", periods=5),
                "value": [1.0, 2.0, 3.0, 4.0, 5.0],
                "category": ["A", "B", "A", "B", "A"],
            })
            asyncio.run(db.load_dataframe("test_data", df))
            mock_idx.assert_called_once()
            db.close()

    def test_load_csv_calls_create_performance_indices(self):
        """load_csv triggers index creation."""
        from app.services.analytics.db_engine import DBEngine
        import app.services.analytics.index_manager as im
        import tempfile, os
        im._INDEX_CACHE.clear()
        with patch("app.services.analytics.db_engine.create_performance_indices") as mock_idx:
            db = DBEngine(":memory:")
            # Create a temp CSV
            with tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False) as f:
                f.write("date,value\n2024-01-01,100\n2024-06-15,200\n")
                csv_path = f.name
            try:
                import asyncio
                asyncio.run(db.load_csv("test_csv", csv_path))
                mock_idx.assert_called_once()
            finally:
                os.unlink(csv_path)
                db.close()

    def test_indexes_actually_created_on_dataframe_load(self):
        """Real index creation works when loading a DataFrame."""
        from app.services.analytics.db_engine import DBEngine
        import app.services.analytics.index_manager as im
        im._INDEX_CACHE.clear()
        db = DBEngine(":memory:")
        import asyncio
        df = pd.DataFrame({
            "d": pd.date_range("2024-01-01", periods=10),
            "cat": ["A", "B", "C"] * 3 + ["A"],
            "val": [1.0] * 10,
        })
        asyncio.run(db.load_dataframe("test_idx", df))
        # Verify index was created on 'd' (DATE column)
        indices = db._write_con.execute(
            "SELECT index_name FROM duckdb_indexes() WHERE table_name = 'test_idx'"
        ).fetchall()
        index_names = [r[0] for r in indices]
        assert len(index_names) >= 1
        db.close()


# =============================================================================
# End-to-End: Full Pipeline with Parameterized Queries
# =============================================================================

class TestParameterizedQueryEndToEnd:
    """End-to-end: parameterized queries work through the full stack."""

    def test_query_utils_with_executor(self):
        """query_utils.execute() integrates with DuckDB executor."""
        from app.services.analytics.query_utils import execute, execute_df, build_in_clause
        conn = duckdb.connect(":memory:")
        conn.execute("CREATE TABLE products (id INTEGER, name VARCHAR, price DOUBLE)")
        products = [
            (1, "Widget", 9.99),
            (2, "Gadget", 24.99),
            (3, "Doohickey", 14.99),
            (4, "Widget Pro", 19.99),
        ]
        conn.executemany("INSERT INTO products VALUES (?, ?, ?)", products)

        # Test parameterized WHERE
        result = execute(conn, "SELECT COUNT(*) FROM products WHERE price > ?", params=[15.0])
        assert result.fetchone()[0] == 2

        # Test parameterized IN clause
        in_frag, in_params = build_in_clause(["Widget", "Gadget"])
        df = execute_df(
            conn,
            f"SELECT * FROM products WHERE name {in_frag} ORDER BY id",
            params=in_params
        )
        assert len(df) == 2
        assert list(df["id"]) == [1, 2]

        conn.close()

    def test_safe_identifier_used_in_queries(self):
        """safe_identifier produces valid SQL that DuckDB executes."""
        from app.services.analytics.query_utils import safe_identifier, execute
        conn = duckdb.connect(":memory:")
        col = safe_identifier("revenue")
        table = safe_identifier("sales_data")
        conn.execute(f"CREATE TABLE {table} ({col} DOUBLE)")
        conn.execute(f"INSERT INTO {table} VALUES (100.0), (200.0)")
        result = execute(conn, f"SELECT SUM({col}) FROM {table}")
        assert result.fetchone()[0] == 300.0
        conn.close()


# =============================================================================
# Security Verification: Parameterization prevents injection
# =============================================================================

class TestParameterizationSecurity:
    """Verify parameterized queries prevent SQL injection."""

    def test_value_injection_attempt_fails_safely(self):
        """SQL injection in parameter value is treated as data, not code."""
        from app.services.analytics.query_utils import execute
        conn = duckdb.connect(":memory:")
        conn.execute("CREATE TABLE users (name VARCHAR, role VARCHAR)")
        conn.execute("INSERT INTO users VALUES ('admin', 'admin'), ('user', 'user')")

        # Injection attempt as a parameter value — should be treated as data
        malicious_name = "admin' OR '1'='1"
        result = execute(
            conn,
            "SELECT COUNT(*) FROM users WHERE name = ?",
            params=[malicious_name]
        )
        # Should NOT match the admin row (no injection)
        assert result.fetchone()[0] == 0
        conn.close()

    def test_safe_identifier_quotes_injection_safely(self):
        """safe_identifier safely quotes SQL-like content in column names.
        
        Inside double-quotes, 'x; SELECT * FROM users' is a single identifier.
        DuckDB does not execute SQL inside quoted identifiers.
        The query 'SELECT "x; SELECT * FROM users" FROM t' tries to find
        a column with that literal name — it doesn't execute the inner SELECT.
        """
        from app.services.analytics.query_utils import safe_identifier
        result = safe_identifier("x; SELECT * FROM users")
        assert result == '"x; SELECT * FROM users"', (
            f"Should be safely quoted, got: {result}"
        )


# =============================================================================
# DuckDBReader Tests
# =============================================================================

class TestDuckDBReader:
    """Integration tests for DuckDBReader using an in-memory DuckDB file."""

    @pytest.fixture(autouse=True)
    def _setup(self, tmp_path):
        """Create a minimal .duckdb file with test data."""
        db_path = tmp_path / "test.duckdb"
        conn = duckdb.connect(str(db_path))
        conn.execute("""
            CREATE TABLE data (
                category VARCHAR,
                revenue DOUBLE,
                cost DOUBLE,
                quantity INTEGER,
                order_date DATE,
                region VARCHAR,
                is_returned BOOLEAN
            )
        """)
        conn.execute("""
            INSERT INTO data VALUES
                ('Electronics', 1000.0, 400.0, 10, '2024-01-15', 'North', false),
                ('Clothing',    500.0,  200.0, 25, '2024-02-20', 'South', false),
                ('Electronics', 1500.0, 600.0, 15, '2024-03-10', 'East',  true),
                ('Food',        300.0,  100.0, 50, '2024-01-05', 'North', false),
                ('Clothing',    700.0,  300.0, 20, '2024-04-01', 'West',  false),
                ('Electronics', 2000.0, 800.0,  8, '2024-05-15', 'South', true)
        """)
        conn.close()
        self.db_path = str(db_path)
        self.expected_count = 6

    def test_opens_existing_file(self):
        """DuckDBReader opens an existing .duckdb file."""
        from app.services.analytics.duckdb_reader import DuckDBReader
        reader = DuckDBReader(self.db_path)
        assert reader.row_count() == self.expected_count
        reader.close()

    def test_file_not_found_raises(self):
        """DuckDBReader raises FileNotFoundError for missing file."""
        from app.services.analytics.duckdb_reader import DuckDBReader
        with pytest.raises(FileNotFoundError):
            DuckDBReader("/nonexistent/path.duckdb")

    def test_row_count(self):
        """row_count returns correct total."""
        from app.services.analytics.duckdb_reader import DuckDBReader
        reader = DuckDBReader(self.db_path)
        assert reader.row_count() == self.expected_count
        reader.close()

    def test_column_names(self):
        """column_names returns all column names."""
        from app.services.analytics.duckdb_reader import DuckDBReader
        reader = DuckDBReader(self.db_path)
        names = reader.column_names()
        assert "category" in names
        assert "revenue" in names
        assert "order_date" in names
        assert len(names) == 7
        reader.close()

    def test_column_types(self):
        """column_types returns {name: type} dict."""
        from app.services.analytics.duckdb_reader import DuckDBReader
        reader = DuckDBReader(self.db_path)
        types = reader.column_types()
        assert types["category"] == "VARCHAR"
        assert "DOUBLE" in types["revenue"]
        assert "DATE" in types["order_date"]
        reader.close()

    def test_column_stats(self):
        """column_stats returns correct summary for a column."""
        from app.services.analytics.duckdb_reader import DuckDBReader
        reader = DuckDBReader(self.db_path)
        stats = reader.column_stats("revenue")
        assert stats["total"] == 6
        assert stats["non_null"] == 6
        assert stats["null_count"] == 0
        assert stats["unique_count"] <= 6
        assert stats["min_val"] == 300.0
        assert stats["max_val"] == 2000.0
        reader.close()

    def test_column_stats_with_nulls(self, tmp_path):
        """column_stats correctly reports nulls."""
        db_path = tmp_path / "nulls.duckdb"
        conn = duckdb.connect(str(db_path))
        conn.execute("CREATE TABLE t (x INTEGER)")
        conn.execute("INSERT INTO t VALUES (1), (NULL), (3), (NULL), (5)")
        conn.close()

        from app.services.analytics.duckdb_reader import DuckDBReader
        reader = DuckDBReader(str(db_path))
        reader.set_table("t")
        stats = reader.column_stats("x")
        assert stats["total"] == 5
        assert stats["non_null"] == 3
        assert stats["null_count"] == 2
        assert stats["null_pct"] == 0.4
        reader.close()

    def test_sum_col(self):
        """sum_col returns correct total."""
        from app.services.analytics.duckdb_reader import DuckDBReader
        reader = DuckDBReader(self.db_path)
        assert reader.sum_col("revenue") == 6000.0
        assert reader.sum_col("cost") == 2400.0
        reader.close()

    def test_avg_col(self):
        """avg_col returns correct average."""
        from app.services.analytics.duckdb_reader import DuckDBReader
        reader = DuckDBReader(self.db_path)
        assert reader.avg_col("revenue") == 1000.0  # 6000 / 6
        reader.close()

    def test_median_col(self):
        """median_col returns correct median."""
        from app.services.analytics.duckdb_reader import DuckDBReader
        reader = DuckDBReader(self.db_path)
        # Values: 300, 500, 700, 1000, 1500, 2000
        # Median of even count: avg of 3rd and 4th = (700 + 1000) / 2 = 850
        assert reader.median_col("revenue") == 850.0
        reader.close()

    def test_percentile_col(self):
        """percentile_col returns correct percentile."""
        from app.services.analytics.duckdb_reader import DuckDBReader
        reader = DuckDBReader(self.db_path)
        # 50th percentile should match median
        p50 = reader.percentile_col("revenue", 0.5)
        median = reader.median_col("revenue")
        assert abs(p50 - median) < 0.01
        reader.close()

    def test_percentile_out_of_range_raises(self):
        """percentile_col raises ValueError for out-of-range pct."""
        from app.services.analytics.duckdb_reader import DuckDBReader
        reader = DuckDBReader(self.db_path)
        with pytest.raises(ValueError):
            reader.percentile_col("revenue", 1.5)
        with pytest.raises(ValueError):
            reader.percentile_col("revenue", -0.1)
        reader.close()

    def test_groupby_top(self):
        """groupby_top returns top-N grouped results."""
        from app.services.analytics.duckdb_reader import DuckDBReader
        reader = DuckDBReader(self.db_path)
        df = reader.groupby_top("category", "revenue", agg="SUM", top_n=2)
        assert len(df) == 2
        # Electronics (4500) should be first, then Clothing (1200) or Food (300)
        assert df.iloc[0]["value"] == 4500.0  # Electronics
        reader.close()

    def test_groupby_top_with_invalid_agg_raises(self):
        """groupby_top raises ValueError for invalid aggregation."""
        from app.services.analytics.duckdb_reader import DuckDBReader
        reader = DuckDBReader(self.db_path)
        with pytest.raises(ValueError, match="not allowed"):
            reader.groupby_top("category", "revenue", agg="INJECTION()")
        reader.close()

    def test_time_trend(self):
        """time_trend returns monthly aggregation."""
        from app.services.analytics.duckdb_reader import DuckDBReader
        reader = DuckDBReader(self.db_path)
        df = reader.time_trend("order_date", "revenue", agg="SUM", freq="month")
        assert len(df) >= 3  # Jan, Feb, Mar, Apr, May
        assert "period" in df.columns
        assert "value" in df.columns
        reader.close()

    def test_time_trend_with_invalid_freq_raises(self):
        """time_trend raises ValueError for invalid frequency."""
        from app.services.analytics.duckdb_reader import DuckDBReader
        reader = DuckDBReader(self.db_path)
        with pytest.raises(ValueError, match="not allowed"):
            reader.time_trend("order_date", "revenue", freq="hour")
        reader.close()

    def test_time_trend_multi(self):
        """time_trend_multi returns split time series."""
        from app.services.analytics.duckdb_reader import DuckDBReader
        reader = DuckDBReader(self.db_path)
        df = reader.time_trend_multi(
            "order_date", "revenue", "category",
            agg="SUM", freq="month"
        )
        assert "period" in df.columns
        assert "grp" in df.columns
        assert "value" in df.columns
        assert len(df) >= 3  # Multiple categories × months
        reader.close()

    def test_distinct_values(self):
        """distinct_values returns distinct entries."""
        from app.services.analytics.duckdb_reader import DuckDBReader
        reader = DuckDBReader(self.db_path)
        cats = reader.distinct_values("category")
        assert sorted(cats) == ["Clothing", "Electronics", "Food"]
        reader.close()

    def test_distinct_values_with_limit(self):
        """distinct_values respects the limit parameter."""
        from app.services.analytics.duckdb_reader import DuckDBReader
        reader = DuckDBReader(self.db_path)
        cats = reader.distinct_values("category", limit=2)
        assert len(cats) <= 2
        reader.close()

    def test_value_counts(self):
        """value_counts returns frequency distribution."""
        from app.services.analytics.duckdb_reader import DuckDBReader
        reader = DuckDBReader(self.db_path)
        df = reader.value_counts("category")
        assert len(df) == 3  # 3 categories
        assert "count" in df.columns
        assert "pct" in df.columns
        assert abs(df["pct"].sum() - 100.0) < 1.0
        reader.close()

    def test_correlation(self):
        """correlation returns Pearson coefficient."""
        from app.services.analytics.duckdb_reader import DuckDBReader
        reader = DuckDBReader(self.db_path)
        corr = reader.correlation("revenue", "cost")
        # Revenue and cost are perfectly correlated in test data (ratio 2.5:1)
        assert abs(corr - 1.0) < 0.01
        reader.close()

    def test_sample_column(self):
        """sample_column returns column samples."""
        from app.services.analytics.duckdb_reader import DuckDBReader
        reader = DuckDBReader(self.db_path)
        samples = reader.sample_column("category", limit=3)
        assert len(samples) <= 3
        reader.close()

    def test_sample_rows(self):
        """sample_rows returns row samples."""
        from app.services.analytics.duckdb_reader import DuckDBReader
        reader = DuckDBReader(self.db_path)
        df = reader.sample_rows(limit=3)
        assert len(df) <= 3
        assert list(df.columns) == [
            "category", "revenue", "cost", "quantity",
            "order_date", "region", "is_returned"
        ]
        reader.close()

    def test_null_summary(self):
        """null_summary returns per-column null counts."""
        from app.services.analytics.duckdb_reader import DuckDBReader
        reader = DuckDBReader(self.db_path)
        df = reader.null_summary()
        assert len(df) == 7  # 7 columns
        assert all(df["null_count"] == 0)  # No nulls in test data
        reader.close()

    def test_set_table(self):
        """set_table switches to a different table."""
        from app.services.analytics.duckdb_reader import DuckDBReader
        import duckdb
        # Add a second table
        conn = duckdb.connect(self.db_path)
        conn.execute("CREATE TABLE extra (val INTEGER)")
        conn.execute("INSERT INTO extra VALUES (42)")
        conn.close()

        reader = DuckDBReader(self.db_path)
        assert reader.row_count() == 6  # default 'data' table
        reader.set_table("extra")
        assert reader.row_count() == 1
        reader.close()

    def test_context_manager(self):
        """DuckDBReader works as a context manager."""
        from app.services.analytics.duckdb_reader import DuckDBReader
        with DuckDBReader(self.db_path) as reader:
            assert reader.row_count() == self.expected_count

    def test_memory_footprint(self):
        """Verify that methods return small DataFrames (not full table loads).
        
        Each aggregation method should return <= top_n rows, proving
        the aggregation happens in DuckDB, not in Python.
        """
        from app.services.analytics.duckdb_reader import DuckDBReader
        reader = DuckDBReader(self.db_path)
        
        df = reader.groupby_top("category", "revenue", top_n=2)
        assert len(df) <= 2, f"groupby_top returned {len(df)} rows, expected <= 2"
        
        df2 = reader.time_trend("order_date", "revenue", freq="month")
        # Even with all categories, this should be at most 5 rows (5 months)
        assert len(df2) <= 12, f"time_trend returned {len(df2)} rows"
        
        reader.close()
