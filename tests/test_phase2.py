"""
Phase 2 tests: DuckDB-first upload pipeline security & correctness.

Test sequence (per instructions):
1. Auditsafe_identifier() edge cases FIRST — before any DuckDBReader code
2. Fixes gaps found in safe_identifier()
3. Then adds DuckDBReader tests
"""

import pytest
import duckdb
import pandas as pd
import unicodedata
import sys
import os
from pathlib import Path

# Ensure backend is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from app.services.analytics.query_utils import (
    safe_identifier,
    safe_table_ref,
    execute,
    execute_df,
    build_in_clause,
    QuerySafetyError,
)


# ──────────────────────────────────────────────────────────────────────
# Section 1: safe_identifier() security audit
# ──────────────────────────────────────────────────────────────────────

class TestSafeIdentifierSecurity:
    """Verify safe_identifier() is a real security boundary, not a placebo.

    Every gap here becomes an injection vector in DuckDBReader later.
    Fix ALL failures before writing a single line of DuckDBReader.
    """

    def test_empty_string(self):
        """Empty string must be rejected, not passed as "" or ``."""
        with pytest.raises(QuerySafetyError):
            safe_identifier("")

    def test_whitespace_only(self):
        """Whitespace-only must be rejected."""
        with pytest.raises(QuerySafetyError):
            safe_identifier("   ")
        with pytest.raises(QuerySafetyError):
            safe_identifier("\t")
        with pytest.raises(QuerySafetyError):
            safe_identifier("\n")

    def test_null_byte(self):
        """Null bytes can truncate SQL identifiers in some parsers."""
        with pytest.raises(QuerySafetyError):
            safe_identifier("col\x00name")

    def test_ascii_double_quote_embedded(self):
        """ASCII double-quote inside identifier must be safely escaped.
        
        The SQL standard is to double them: " becomes "" inside a quoted id.
        But the function must NOT reject the name entirely.
        
        This is a realistic case: CSV column "foo""bar" is valid.
        """
        result = safe_identifier('foo"bar')
        assert result == '"foo""bar"', (
            f"Expected escaped double-quote, got: {result}"
        )

    def test_unicode_double_quote_escape(self):
        """Unicode \u0022 is the same as " — must be escaped, not stripped."""
        result = safe_identifier("col\u0022name")
        assert result == '"col""name"', (
            f"Unicode double-quote not escaped: {result}"
        )

    def test_unicode_curly_quotes(self):
        """LEFT/RIGHT DOUBLE QUOTATION MARK (\u201c, \u201d) should pass safely.
        
        These are NOT SQL delimiters but are valid Unicode in column names.
        They must NOT be rejected or stripped.
        """
        result = safe_identifier("col\u201cname\u201d")
        # These should be preserved as-is, just wrapped in SQL double-quotes
        assert '"' in result, "Result must be wrapped in SQL double-quotes"
        assert "\u201c" in result, "LEFT DOUBLE QUOTATION MARK should be preserved"
        assert "\u201d" in result, "RIGHT DOUBLE QUOTATION MARK should be preserved"

    def test_sql_comment_double_dash(self):
        """Double-dash could comment out rest of query if improperly quoted."""
        result = safe_identifier("col--name")
        assert result.startswith('"') and result.endswith('"'), (
            f"Not properly quoted: {result}"
        )

    def test_sql_comment_block(self):
        """Block comment markers could hide trailing SQL."""
        result = safe_identifier("col/*name*/value")
        assert result.startswith('"') and result.endswith('"'), (
            f"Not properly quoted: {result}"
        )

    def test_unicode_bidi_override(self):
        """Unicode bidi override characters can reorder SQL visually.
        
        U+202E (RIGHT-TO-LEFT OVERRIDE) is invisible in most editors.
        Inside a quoted identifier it's harmless, but better to reject
        format/control characters we don't need.
        """
        with pytest.raises(QuerySafetyError):
            safe_identifier("col\u202ename")

    def test_unicode_bidi_mark(self):
        """U+200F (RIGHT-TO-LEFT MARK) — invisible, should be rejected."""
        with pytest.raises(QuerySafetyError):
            safe_identifier("col\u200fname")

    def test_unicode_zero_width_space(self):
        """U+200B (ZERO WIDTH SPACE) — invisible, can cause hard-to-debug issues."""
        with pytest.raises(QuerySafetyError):
            safe_identifier("col\u200bname")

    def test_unicode_zero_width_non_joiner(self):
        """U+200C (ZERO WIDTH NON-JOINER) — control character, reject."""
        with pytest.raises(QuerySafetyError):
            safe_identifier("col\u200cname")

    def test_excessively_long_identifier(self):
        """Extremely long identifiers could trigger DuckDB internal errors."""
        with pytest.raises(QuerySafetyError):
            safe_identifier("a" * 100000)
        # Sanity: 255-char identifier passes (limit is >256)
        result = safe_identifier("a" * 255)
        expected = f'"{("a" * 255)}"'
        assert result == expected, f"Expected {len(expected)} chars, got {len(result)}"

    def test_identifier_at_256_chars(self):
        """Exactly 256 chars should pass (limit is >256, not >=256)."""
        name = "a" * 256
        result = safe_identifier(name)
        expected = f'"{name}"'
        assert result == expected, f"256-char identifier should be accepted"

    def test_newline_in_identifier(self):
        """Newlines inside identifier can break query structure."""
        with pytest.raises(QuerySafetyError):
            safe_identifier("col\nname")

    def test_tab_in_identifier(self):
        """Tabs inside identifier can break query structure."""
        with pytest.raises(QuerySafetyError):
            safe_identifier("col\tname")

    def test_carriage_return_in_identifier(self):
        """Carriage return inside identifier can break query structure."""
        with pytest.raises(QuerySafetyError):
            safe_identifier("col\rname")

    def test_ascii_control_chars(self):
        """All ASCII control characters (0x00-0x1F except tab?) should be rejected."""
        # Exclude NUL (tested above) and common whitespace
        for code in range(0x01, 0x20):
            if code in (0x09, 0x0A, 0x0D):  # tab, newline, CR — tested individually
                continue
            char = chr(code)
            with pytest.raises(QuerySafetyError):
                safe_identifier(f"col{char}name")


class TestSafeIdentifierRealWorld:
    """Real-world CSV column names that must pass safely."""

    def test_space_in_name(self):
        """CSV columns frequently have spaces: 'Total Revenue'."""
        result = safe_identifier("Total Revenue")
        assert result == '"Total Revenue"', f"Failed: {result}"

    def test_hyphen_in_name(self):
        """Some CSVs use hyphens: 'first-name'."""
        result = safe_identifier("first-name")
        assert result == '"first-name"', f"Failed: {result}"

    def test_percent_in_name(self):
        """CSV columns with %: 'profit%'."""
        result = safe_identifier("profit%")
        assert result == '"profit%"', f"Failed: {result}"

    def test_hash_in_name(self):
        """CSV columns with #: 'order#id'."""
        result = safe_identifier("order#id")
        assert result == '"order#id"', f"Failed: {result}"

    def test_period_in_name(self):
        """CSV columns with periods: 'column.name'."""
        result = safe_identifier("column.name")
        assert result == '"column.name"', f"Failed: {result}"

    def test_colon_in_name(self):
        """CSV columns with colons: 'user:name'."""
        result = safe_identifier("user:name")
        assert result == '"user:name"', f"Failed: {result}"

    def test_slash_in_name(self):
        """CSV columns with / : 'A/B' ratio."""
        result = safe_identifier("A/B")
        assert result == '"A/B"', f"Failed: {result}"

    def test_simple_alpha(self):
        """Simple ASCII column name."""
        result = safe_identifier("revenue")
        assert result == '"revenue"', f"Failed: {result}"

    def test_underscore_name(self):
        """Underscore-based name."""
        result = safe_identifier("total_revenue")
        assert result == '"total_revenue"', f"Failed: {result}"

    def test_mixed_case(self):
        """Mixed case name."""
        result = safe_identifier("TotalRevenue")
        assert result == '"TotalRevenue"', f"Failed: {result}"

    def test_numeric_prefix(self):
        """Column starting with number — valid in CSV, needs quoting in SQL."""
        result = safe_identifier("123column")
        assert result == '"123column"', f"Failed: {result}"

    def test_purely_numeric(self):
        """Column that is entirely numeric."""
        result = safe_identifier("12345")
        assert result == '"12345"', f"Failed: {result}"

    def test_unicode_accented(self):
        """Accented characters in column name."""
        result = safe_identifier("café")
        assert result.startswith('"') and result.endswith('"'), f"Failed: {result}"
        assert "café" in result, "Accented chars should be preserved"

    def test_emoji_in_name(self):
        """Emoji in column name (unusual but possible in CSV)."""
        result = safe_identifier("sales📊target")
        assert result.startswith('"') and result.endswith('"'), f"Failed: {result}"


# ──────────────────────────────────────────────────────────────────────
# Section 2: safe_table_ref tests
# ──────────────────────────────────────────────────────────────────────

class TestSafeTableRef:
    def test_table_ref(self):
        result = safe_table_ref("main", "data")
        assert result == '"main"."data"', f"Failed: {result}"

    def test_table_ref_with_spaces(self):
        result = safe_table_ref("my schema", "my table")
        assert result == '"my schema"."my table"', f"Failed: {result}"

    def test_table_ref_empty_catalog_raises(self):
        with pytest.raises(QuerySafetyError):
            safe_table_ref("", "data")


# ──────────────────────────────────────────────────────────────────────
# Section 3: build_in_clause tests
# ──────────────────────────────────────────────────────────────────────

class TestBuildInClause:
    def test_basic(self):
        sql, params = build_in_clause(["a", "b", "c"])
        assert sql == "IN (?, ?, ?)"
        assert params == ["a", "b", "c"]

    def test_empty_list(self):
        sql, params = build_in_clause([])
        assert sql == "IN (NULL)"
        assert params == []

    def test_single_value(self):
        sql, params = build_in_clause(["x"])
        assert sql == "IN (?)"
        assert params == ["x"]


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
        assert stats["min_val"] == 300.0
        assert stats["max_val"] == 2000.0
        reader.close()

    def test_column_stats_with_nulls(self, tmp_path):
        """column_stats correctly reports nulls."""
        db_path = tmp_path / "nulls.duckdb"
        conn = duckdb.connect(str(db_path))
        conn.execute("CREATE TABLE data (x INTEGER)")
        conn.execute("INSERT INTO data VALUES (1), (NULL), (3), (NULL), (5)")
        conn.close()

        from app.services.analytics.duckdb_reader import DuckDBReader
        reader = DuckDBReader(str(db_path))
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
        assert reader.avg_col("revenue") == 1000.0
        reader.close()

    def test_median_col(self):
        """median_col returns correct median."""
        from app.services.analytics.duckdb_reader import DuckDBReader
        reader = DuckDBReader(self.db_path)
        assert reader.median_col("revenue") == 850.0
        reader.close()

    def test_percentile_col(self):
        """percentile_col returns correct percentile."""
        from app.services.analytics.duckdb_reader import DuckDBReader
        reader = DuckDBReader(self.db_path)
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
        assert df.iloc[0]["value"] == 4500.0
        reader.close()

    def test_groupby_top_with_invalid_agg_raises(self):
        """groupby_top raises ValueError for invalid aggregation."""
        from app.services.analytics.duckdb_reader import DuckDBReader
        reader = DuckDBReader(self.db_path)
        with pytest.raises(ValueError, match="not allowed"):
            reader.groupby_top("category", "revenue", agg="INJECTION()")
        reader.close()

    def test_groupby_all(self):
        """groupby_all returns all grouped results."""
        from app.services.analytics.duckdb_reader import DuckDBReader
        reader = DuckDBReader(self.db_path)
        df = reader.groupby_all("category", "revenue")
        assert len(df) == 3
        assert df.iloc[0]["value"] == 4500.0
        reader.close()

    def test_time_trend(self):
        """time_trend returns monthly aggregation."""
        from app.services.analytics.duckdb_reader import DuckDBReader
        reader = DuckDBReader(self.db_path)
        df = reader.time_trend("order_date", "revenue", agg="SUM", freq="month")
        assert len(df) >= 3
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
        assert len(df) == 3
        assert "count" in df.columns
        assert "pct" in df.columns
        reader.close()

    def test_correlation(self):
        """correlation returns Pearson coefficient."""
        from app.services.analytics.duckdb_reader import DuckDBReader
        reader = DuckDBReader(self.db_path)
        corr = reader.correlation("revenue", "cost")
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
        assert len(df) == 7
        assert all(df["null_count"] == 0)
        reader.close()

    def test_set_table(self):
        """set_table switches to a different table."""
        from app.services.analytics.duckdb_reader import DuckDBReader
        import duckdb
        conn = duckdb.connect(self.db_path)
        conn.execute("CREATE TABLE extra (val INTEGER)")
        conn.execute("INSERT INTO extra VALUES (42)")
        conn.close()

        reader = DuckDBReader(self.db_path)
        assert reader.row_count() == 6
        reader.set_table("extra")
        assert reader.row_count() == 1
        reader.close()

    def test_context_manager(self):
        """DuckDBReader works as a context manager."""
        from app.services.analytics.duckdb_reader import DuckDBReader
        with DuckDBReader(self.db_path) as reader:
            assert reader.row_count() == self.expected_count

    def test_memory_footprint(self):
        """Verify that methods return small DataFrames (not full table loads)."""
        from app.services.analytics.duckdb_reader import DuckDBReader
        reader = DuckDBReader(self.db_path)
        df = reader.groupby_top("category", "revenue", top_n=2)
        assert len(df) <= 2
        df2 = reader.time_trend("order_date", "revenue", freq="month")
        assert len(df2) <= 12
        reader.close()


# ──────────────────────────────────────────────────────────────
# P2: Concurrent access isolation test for DuckDBReader + KPI engine
# ──────────────────────────────────────────────────────────────


class TestConcurrentKPIIsolated:
    """
    Verify that separate DuckDBReader instances produce correct,
    independent KPI values when generate_kpis() is called concurrently.

    This catches regressions where module-level state (like the removed
    _DUCKDB_READER global) could cause concurrent uploads to leak data
    between each other.
    """

    @pytest.fixture(autouse=True)
    def _setup(self, tmp_path):
        """Create TWO .duckdb files with DIFFERENT datasets."""
        # Dataset A: High revenue, 5 customers, ~$25000 total
        # Column names match what _generate_sales_kpis looks for
        db_a = tmp_path / "dataset_a.duckdb"
        conn_a = duckdb.connect(str(db_a))
        conn_a.execute("""
            CREATE TABLE data AS SELECT * FROM (
                VALUES
                    ('Alice',   5000.0, 'Sales',      '2026-01-01'::DATE, FALSE),
                    ('Bob',     3000.0, 'Engineering','2026-02-01'::DATE, FALSE),
                    ('Charlie', 7000.0, 'Sales',      '2026-03-01'::DATE, TRUE),
                    ('Diana',   4000.0, 'Marketing',  '2026-04-01'::DATE, FALSE),
                    ('Eve',     6000.0, 'Engineering','2026-05-01'::DATE, FALSE)
            ) AS t(customer, revenue, department, order_date, is_returned)
        """)
        conn_a.close()

        # Dataset B: Low revenue, 5 customers, ~$800 total
        db_b = tmp_path / "dataset_b.duckdb"
        conn_b = duckdb.connect(str(db_b))
        conn_b.execute("""
            CREATE TABLE data AS SELECT * FROM (
                VALUES
                    ('Frank',   100.0,  'Support', '2026-01-01'::DATE, TRUE),
                    ('Grace',   200.0,  'Support', '2026-02-01'::DATE, TRUE),
                    ('Heidi',   150.0,  'Ops',     '2026-03-01'::DATE, FALSE),
                    ('Ivan',     50.0,  'Ops',     '2026-04-01'::DATE, TRUE),
                    ('Judy',    300.0,  'Support', '2026-05-01'::DATE, TRUE)
            ) AS t(customer, revenue, department, order_date, is_returned)
        """)
        conn_b.close()

        self.db_a = str(db_a)
        self.db_b = str(db_b)

    def _build_classification(self) -> "ColumnClassification":
        """Build a minimal classification targeting Sales-type KPIs."""
        from app.services.analytics.column_filter import ColumnClassification
        return ColumnClassification(
            metrics=["revenue"],
            dimensions=["department", "customer"],
            targets=["is_returned"],
            dates=["order_date"],
            excluded=[],
        )

    def _build_sample_df(self) -> "pd.DataFrame":
        """Build a sample DF whose column names match _generate_sales_kpis keywords."""
        import pandas as pd
        return pd.DataFrame({
            "customer": ["Alice", "Bob"],
            "revenue": [5000.0, 3000.0],
            "department": ["Sales", "Engineering"],
            "order_date": pd.to_datetime(["2026-01-01", "2026-02-01"]),
            "is_returned": [False, False],
        })

    def _verify_kpis_value(self, kpi_dict: dict, metric_key_substring: str, expected_value: float) -> bool:
        """Helper: check if any KPI dict entry's value matches."""
        for key, val in kpi_dict.items():
            if metric_key_substring in str(key) or metric_key_substring in str(val.get("title", "")):
                return abs(float(val.get("value", 0)) - expected_value) < 0.01
        return False

    def test_concurrent_generate_kpis_isolation(self):
        """
        Call generate_kpis() with two different readers — each must
        return KPIs computed from its OWN dataset, not mixed.
        """
        from app.services.analytics.duckdb_reader import DuckDBReader
        from app.services.analytics.kpi_engine import generate_kpis
        from app.services.analytics.domain_detector import DomainType

        reader_a = DuckDBReader(self.db_a)
        reader_b = DuckDBReader(self.db_b)

        sample_df = self._build_sample_df()
        classification = self._build_classification()

        result_a = generate_kpis(
            sample_df, DomainType.SALES, classification,
            reader=reader_a, total_rows=reader_a.row_count(),
        )
        result_b = generate_kpis(
            sample_df, DomainType.SALES, classification,
            reader=reader_b, total_rows=reader_b.row_count(),
        )

        reader_a.close()
        reader_b.close()

        # Dataset A: revenue sum = 5000+3000+7000+4000+6000 = 25000
        # Dataset B: revenue sum = 100+200+150+50+300 = 800
        assert self._verify_kpis_value(result_a, "Revenue", 25000.0), (
            f"Dataset A should have revenue~25000, got: {result_a}"
        )
        assert self._verify_kpis_value(result_b, "Revenue", 800.0), (
            f"Dataset B should have revenue~800, got: {result_b}"
        )

    def test_concurrent_kpis_duckdb_isolation(self):
        """
        Call generate_kpis_duckdb() with two different readers concurrently
        using a thread pool — verify no state leaks between threads.
        """
        from concurrent.futures import ThreadPoolExecutor
        from app.services.analytics.duckdb_reader import DuckDBReader
        from app.services.analytics.kpi_engine import generate_kpis_duckdb
        from app.services.analytics.domain_detector import DomainType

        classification = self._build_classification()
        sample_df = self._build_sample_df()

        def run_for_db(db_path: str) -> dict:
            reader = DuckDBReader(db_path)
            try:
                return generate_kpis_duckdb(
                    reader=reader,
                    domain=DomainType.SALES,
                    classification=classification,
                    sample_df=sample_df,
                )
            finally:
                reader.close()

        with ThreadPoolExecutor(max_workers=2) as pool:
            future_a = pool.submit(run_for_db, self.db_a)
            future_b = pool.submit(run_for_db, self.db_b)
            result_a = future_a.result()
            result_b = future_b.result()

        assert self._verify_kpis_value(result_a, "Revenue", 25000.0), (
            f"Dataset A should have revenue~25000, got: {result_a}"
        )
        assert self._verify_kpis_value(result_b, "Revenue", 800.0), (
            f"Dataset B should have revenue~800, got: {result_b}"
        )

    def test_duckdb_readers_do_not_share_connection(self):
        """Verify two DuckDBReader instances connect to different files."""
        from app.services.analytics.duckdb_reader import DuckDBReader

        reader_a = DuckDBReader(self.db_a)
        reader_b = DuckDBReader(self.db_b)

        # reader_a should see its own data, not reader_b's
        assert reader_a.row_count() == 5
        assert reader_b.row_count() == 5

        cols_a = reader_a.column_names()
        cols_b = reader_b.column_names()
        assert cols_a == cols_b  # same schema

        # Verify data isolation by checking sums
        sum_a = reader_a.sum_col("revenue")
        sum_b = reader_b.sum_col("revenue")
        assert sum_a == 25000.0, f"Expected 25000, got {sum_a}"
        assert sum_b == 800.0, f"Expected 800, got {sum_b}"

        reader_a.close()
        reader_b.close()
