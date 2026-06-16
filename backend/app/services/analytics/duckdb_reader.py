"""
DuckDBReader — read-only analytics query utility for dashboard generation.

Connects to an already-built .duckdb file and provides small-footprint
aggregation methods that return scalars or small DataFrames (not full
table scans into Python memory). Used by the initial dashboard generation
pipeline during upload to replace the pandas full-load approach.

Security model:
  - All column/table references pass through safe_identifier()
  - All VALUES pass through ? placeholders via query_utils.execute()
  - Aggregation function names validated against ALLOWED_AGGS allowlist
  - DATE_TRUNC frequency validated against ALLOWED_FREQS allowlist
  - Connection is read-only

Usage:
    reader = DuckDBReader("/path/to/file.duckdb")
    reader.set_table("my_table")
    count = reader.row_count()
    stats = reader.column_stats("revenue")
    top_products = reader.groupby_top("product", "sales", agg="SUM", top_n=10)
    trend = reader.time_trend("order_date", "revenue", freq="month")
    reader.close()
"""

import logging
from typing import Any, Dict, List, Optional

import duckdb
import pandas as pd

from .query_utils import safe_identifier, execute, execute_df, QuerySafetyError

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────
# Allowlists — these are the security boundary for parameters
# that can't use ? placeholders (SQL function names, DATE_TRUNC
# interval strings).
# ──────────────────────────────────────────────────────────────

ALLOWED_AGGS: set = {
    "SUM", "AVG", "COUNT", "MIN", "MAX",
    "MEDIAN", "MODE", "STDDEV", "VARIANCE",
}

ALLOWED_FREQS: set = {
    "day", "week", "month", "quarter", "year",
}


class DuckDBReader:
    """Read-only DuckDB query utility for dashboard analytics.

    Connects to an already-built .duckdb file. All column/table
    identifiers pass through safe_identifier(). All value parameters
    pass through ? placeholders.

    Never loads a full table into Python memory — every method returns
    either a scalar or a small aggregated DataFrame.
    """

    def __init__(self, duckdb_path: str, table_name: str = "data"):
        """Connect to an existing .duckdb file in read-only mode.

        Args:
            duckdb_path: Path to an existing .duckdb file
            table_name: Default table name to query

        Raises:
            FileNotFoundError: If the .duckdb file doesn't exist
            duckdb.Error: If DuckDB cannot open the file
        """
        import pathlib
        path = pathlib.Path(duckdb_path)
        if not path.exists():
            raise FileNotFoundError(
                f"DuckDB file not found: {duckdb_path}"
            )
        if not path.is_file():
            raise FileNotFoundError(
                f"DuckDB path is not a file: {duckdb_path}"
            )

        self._path = str(path.resolve())
        self._conn = duckdb.connect(database=self._path, read_only=True)
        self._table: str = safe_identifier(table_name)

        logger.info(
            "DuckDBReader opened %s (table=%s)",
            self._path, self._table
        )

    # ── Lifecycle ───────────────────────────────────────────

    def close(self) -> None:
        """Close the DuckDB connection."""
        if self._conn:
            try:
                self._conn.close()
            except Exception:
                pass
            self._conn = None

    def __enter__(self):
        return self

    def __exit__(self, *exc_info):
        self.close()

    # ── Table name ──────────────────────────────────────────

    @property
    def table_name(self) -> str:
        """The current table name (unquoted, as provided)."""
        # Strip surrounding double quotes
        raw = self._table.strip('"')
        return raw

    def set_table(self, table_name: str) -> None:
        """Switch to a different table within the same .duckdb file.

        Args:
            table_name: Target table name
        """
        self._table = safe_identifier(table_name)

    # ── Schema introspection ────────────────────────────────

    def describe_schema(self) -> pd.DataFrame:
        """Return DESCRIBE output for the current table.

        Returns a DataFrame with columns: column_name, column_type,
        null, key, default, extra.
        """
        return execute_df(
            self._conn,
            f"DESCRIBE {self._table}"
        )

    def column_names(self) -> List[str]:
        """Return list of column names in the current table."""
        df = self.describe_schema()
        return list(df["column_name"])

    def column_types(self) -> Dict[str, str]:
        """Return {column_name: column_type} for the current table."""
        df = self.describe_schema()
        return dict(zip(df["column_name"], df["column_type"]))

    # ── Row-level aggregates ────────────────────────────────

    def row_count(self) -> int:
        """Return total row count for the current table."""
        result = execute(
            self._conn,
            f"SELECT COUNT(*) AS cnt FROM {self._table}"
        )
        return int(result.fetchone()[0])

    def column_stats(self, col: str) -> Dict[str, Any]:
        """Return summary statistics for a single column.

        Returns:
            Dict with keys: total, non_null, null_count, null_pct,
            unique_count, min_val, max_val, dtype
        """
        safe_col = safe_identifier(col)

        result = execute_df(
            self._conn,
            f"""
            SELECT
                COUNT(*)                                        AS total,
                COUNT({safe_col})                               AS non_null,
                COUNT(*) - COUNT({safe_col})                    AS null_count,
                ROUND(CAST(COUNT(*) - COUNT({safe_col}) AS DOUBLE)
                    / NULLIF(COUNT(*), 0), 4)                   AS null_pct,
                COUNT(DISTINCT {safe_col})                      AS unique_count,
                MIN({safe_col})                                 AS min_val,
                MAX({safe_col})                                 AS max_val
            FROM {self._table}
            """
        )

        stats = result.iloc[0].to_dict()

        # Add type information
        types = self.column_types()
        stats["dtype"] = types.get(col, "unknown")

        # Convert numpy types to native Python for serialization
        for key in ("total", "non_null", "null_count", "unique_count"):
            stats[key] = int(stats[key]) if stats[key] is not None else 0
        stats["null_pct"] = float(stats["null_pct"]) if stats["null_pct"] is not None else 0.0

        return stats

    # ── Numeric aggregations ────────────────────────────────

    def sum_col(self, col: str) -> float:
        """Return SUM of a numeric column."""
        safe_col = safe_identifier(col)
        result = execute(
            self._conn,
            f"SELECT SUM({safe_col}) AS val FROM {self._table}"
        )
        val = result.fetchone()[0]
        return float(val) if val is not None else 0.0

    def avg_col(self, col: str) -> float:
        """Return AVG of a numeric column."""
        safe_col = safe_identifier(col)
        result = execute(
            self._conn,
            f"SELECT AVG({safe_col}) AS val FROM {self._table}"
        )
        val = result.fetchone()[0]
        return float(val) if val is not None else 0.0

    def min_col(self, col: str) -> Any:
        """Return MIN of a column."""
        safe_col = safe_identifier(col)
        result = execute(
            self._conn,
            f"SELECT MIN({safe_col}) AS val FROM {self._table}"
        )
        return result.fetchone()[0]

    def max_col(self, col: str) -> Any:
        """Return MAX of a column."""
        safe_col = safe_identifier(col)
        result = execute(
            self._conn,
            f"SELECT MAX({safe_col}) AS val FROM {self._table}"
        )
        return result.fetchone()[0]

    def median_col(self, col: str) -> float:
        """Return MEDIAN of a numeric column."""
        safe_col = safe_identifier(col)
        result = execute(
            self._conn,
            f"SELECT MEDIAN({safe_col}) AS val FROM {self._table}"
        )
        val = result.fetchone()[0]
        return float(val) if val is not None else 0.0

    def percentile_col(self, col: str, pct: float = 0.5) -> float:
        """Return a percentile value for a numeric column.

        Args:
            col: Column name
            pct: Percentile between 0.0 and 1.0 (default 0.5 = median)

        Raises:
            ValueError: If pct is outside [0, 1]
        """
        if not (0.0 <= pct <= 1.0):
            raise ValueError(
                f"Percentile must be between 0.0 and 1.0, got {pct}"
            )
        safe_col = safe_identifier(col)
        # Use ? placeholder for the percentile value
        result = execute(
            self._conn,
            f"SELECT PERCENTILE_CONT(?) WITHIN GROUP (ORDER BY {safe_col}) AS val FROM {self._table}",
            params=[pct]
        )
        val = result.fetchone()[0]
        return float(val) if val is not None else 0.0

    # ── Grouped aggregations ────────────────────────────────

    def _validate_agg(self, agg: str) -> str:
        """Validate an aggregation function against the allowlist.

        Returns the canonical uppercase form.

        Raises:
            ValueError: If agg is not in the allowlist
        """
        agg_upper = agg.strip().upper()
        if agg_upper not in ALLOWED_AGGS:
            raise ValueError(
                f"Aggregation '{agg}' is not allowed. "
                f"Must be one of: {', '.join(sorted(ALLOWED_AGGS))}"
            )
        return agg_upper

    def groupby_top(
        self,
        group_col: str,
        agg_col: str,
        agg: str = "SUM",
        top_n: int = 10,
        where: Optional[Dict[str, Any]] = None,
    ) -> pd.DataFrame:
        """Return top-N grouped aggregation.

        Args:
            group_col: Column to group by
            agg_col: Column to aggregate
            agg: Aggregation function (must be in ALLOWED_AGGS)
            top_n: Number of rows to return (default 10)
            where: Optional {column: value} equality filter

        Returns:
            DataFrame with columns: [group_col, value]
        """
        agg_fn = self._validate_agg(agg)
        safe_group = safe_identifier(group_col)
        safe_agg = safe_identifier(agg_col)

        query = f"""
            SELECT {safe_group}, {agg_fn}({safe_agg}) AS value
            FROM {self._table}
        """

        params: List[Any] = []
        if where:
            conditions = []
            for wcol, wval in where.items():
                safe_wcol = safe_identifier(wcol)
                conditions.append(f"{safe_wcol} = ?")
                params.append(wval)
            if conditions:
                query += " WHERE " + " AND ".join(conditions)

        query += f" GROUP BY {safe_group} ORDER BY value DESC LIMIT ?"
        params.append(top_n)

        return execute_df(self._conn, query, params=params)

    def groupby_all(
        self,
        group_col: str,
        agg_col: str,
        agg: str = "SUM",
        where: Optional[Dict[str, Any]] = None,
    ) -> pd.DataFrame:
        """Return all grouped aggregations (no top-N limit).

        Args:
            group_col: Column to group by
            agg_col: Column to aggregate
            agg: Aggregation function (must be in ALLOWED_AGGS)
            where: Optional {column: value} equality filter

        Returns:
            DataFrame with columns: [group_col, value]
        """
        agg_fn = self._validate_agg(agg)
        safe_group = safe_identifier(group_col)
        safe_agg = safe_identifier(agg_col)

        query = f"""
            SELECT {safe_group}, {agg_fn}({safe_agg}) AS value
            FROM {self._table}
        """

        params: List[Any] = []
        if where:
            conditions = []
            for wcol, wval in where.items():
                safe_wcol = safe_identifier(wcol)
                conditions.append(f"{safe_wcol} = ?")
                params.append(wval)
            if conditions:
                query += " WHERE " + " AND ".join(conditions)

        query += f" GROUP BY {safe_group} ORDER BY value DESC"

        return execute_df(self._conn, query, params=params)

    def distinct_values(
        self,
        col: str,
        limit: int = 100,
        where: Optional[Dict[str, Any]] = None,
    ) -> List[Any]:
        """Return distinct values for a column.

        Args:
            col: Column name
            limit: Maximum values to return (default 100)
            where: Optional {column: value} equality filter

        Returns:
            List of distinct values
        """
        safe_col = safe_identifier(col)
        query = f"SELECT DISTINCT {safe_col} FROM {self._table}"

        params: List[Any] = []
        if where:
            conditions = []
            for wcol, wval in where.items():
                safe_wcol = safe_identifier(wcol)
                conditions.append(f"{safe_wcol} = ?")
                params.append(wval)
            if conditions:
                query += " WHERE " + " AND ".join(conditions)

        query += " LIMIT ?"
        params.append(limit)

        result = execute(self._conn, query, params=params)
        return [row[0] for row in result.fetchall()]

    # ── Time-series ─────────────────────────────────────────

    def _validate_freq(self, freq: str) -> str:
        """Validate a DATE_TRUNC frequency against the allowlist.

        Returns the canonical lowercase form.

        Raises:
            ValueError: If freq is not in the allowlist
        """
        freq_lower = freq.strip().lower()
        if freq_lower not in ALLOWED_FREQS:
            raise ValueError(
                f"Frequency '{freq}' is not allowed. "
                f"Must be one of: {', '.join(sorted(ALLOWED_FREQS))}"
            )
        return freq_lower

    def time_trend(
        self,
        date_col: str,
        agg_col: str,
        agg: str = "SUM",
        freq: str = "month",
        where: Optional[Dict[str, Any]] = None,
    ) -> pd.DataFrame:
        """Return time-bucketed aggregation trend.

        Args:
            date_col: Date/timestamp column name
            agg_col: Column to aggregate
            agg: Aggregation function (must be in ALLOWED_AGGS)
            freq: DATE_TRUNC frequency (day/week/month/quarter/year)
            where: Optional {column: value} equality filter

        Returns:
            DataFrame with columns: [period, value] sorted by period
        """
        agg_fn = self._validate_agg(agg)
        safe_freq = self._validate_freq(freq)
        safe_date = safe_identifier(date_col)
        safe_agg = safe_identifier(agg_col)

        query = f"""
            SELECT
                DATE_TRUNC('{safe_freq}', {safe_date}) AS period,
                {agg_fn}({safe_agg}) AS value
            FROM {self._table}
        """

        params: List[Any] = []
        if where:
            conditions = []
            for wcol, wval in where.items():
                safe_wcol = safe_identifier(wcol)
                conditions.append(f"{safe_wcol} = ?")
                params.append(wval)
            if conditions:
                query += " WHERE " + " AND ".join(conditions)

        query += " GROUP BY period ORDER BY period"

        return execute_df(self._conn, query, params=params)

    def time_trend_multi(
        self,
        date_col: str,
        agg_col: str,
        group_col: str,
        agg: str = "SUM",
        freq: str = "month",
        where: Optional[Dict[str, Any]] = None,
    ) -> pd.DataFrame:
        """Return time-bucketed aggregation trend, split by a group column.

        Args:
            date_col: Date/timestamp column name
            agg_col: Column to aggregate
            group_col: Column to split the trend by (e.g., 'category')
            agg: Aggregation function (must be in ALLOWED_AGGS)
            freq: DATE_TRUNC frequency (day/week/month/quarter/year)
            where: Optional {column: value} equality filter

        Returns:
            DataFrame with columns: [period, group, value]
        """
        agg_fn = self._validate_agg(agg)
        safe_freq = self._validate_freq(freq)
        safe_date = safe_identifier(date_col)
        safe_agg = safe_identifier(agg_col)
        safe_group = safe_identifier(group_col)

        query = f"""
            SELECT
                DATE_TRUNC('{safe_freq}', {safe_date}) AS period,
                {safe_group} AS grp,
                {agg_fn}({safe_agg}) AS value
            FROM {self._table}
        """

        params: List[Any] = []
        if where:
            conditions = []
            for wcol, wval in where.items():
                safe_wcol = safe_identifier(wcol)
                conditions.append(f"{safe_wcol} = ?")
                params.append(wval)
            if conditions:
                query += " WHERE " + " AND ".join(conditions)

        query += " GROUP BY period, grp ORDER BY period, grp"

        return execute_df(self._conn, query, params=params)

    # ── Sampling ────────────────────────────────────────────

    def sample_column(
        self,
        col: str,
        limit: int = 20,
    ) -> List[Any]:
        """Return sample values from a column using reservoir sampling.

        Args:
            col: Column name
            limit: Maximum number of samples (default 20)

        Returns:
            List of sample values
        """
        safe_col = safe_identifier(col)
        result = execute(
            self._conn,
            f"SELECT {safe_col} FROM {self._table} "
            f"USING SAMPLE reservoir({limit} ROWS)"
        )
        return [row[0] for row in result.fetchall()]

    def sample_rows(self, limit: int = 5) -> pd.DataFrame:
        """Return sample rows from the current table.

        Args:
            limit: Maximum number of rows (default 5)

        Returns:
            DataFrame with sample rows
        """
        return execute_df(
            self._conn,
            f"SELECT * FROM {self._table} LIMIT ?",
            params=[limit]
        )

    # ── Value counts (for chart recommendations) ────────────

    def value_counts(
        self,
        col: str,
        limit: int = 20,
    ) -> pd.DataFrame:
        """Return value frequency distribution for a column.

        Args:
            col: Column name
            limit: Maximum distinct values (default 20)

        Returns:
            DataFrame with columns: [value, count, pct]
        """
        safe_col = safe_identifier(col)

        df = execute_df(
            self._conn,
            f"""
            SELECT
                {safe_col} AS value,
                COUNT(*) AS count,
                ROUND(CAST(COUNT(*) AS DOUBLE)
                    / NULLIF(CAST((SELECT COUNT(*) FROM {self._table}) AS DOUBLE), 0) * 100, 2)
                AS pct
            FROM {self._table}
            GROUP BY {safe_col}
            ORDER BY count DESC
            LIMIT ?
            """,
            params=[limit]
        )
        return df

    # ── Correlation ─────────────────────────────────────────

    def correlation(
        self,
        col_x: str,
        col_y: str,
    ) -> float:
        """Return Pearson correlation coefficient between two numeric columns.

        Args:
            col_x: First column
            col_y: Second column

        Returns:
            Correlation coefficient (-1 to 1), or 0.0 if not calculable
        """
        safe_x = safe_identifier(col_x)
        safe_y = safe_identifier(col_y)

        result = execute(
            self._conn,
            f"SELECT CORR({safe_x}, {safe_y}) AS corr FROM {self._table}"
        )
        val = result.fetchone()[0]
        return float(val) if val is not None else 0.0

    # ── Null analysis ───────────────────────────────────────

    def null_summary(self) -> pd.DataFrame:
        """Return null-count summary for all columns.

        Returns:
            DataFrame with columns: [column, null_count, null_pct, non_null]
        """
        cols = self.column_names()
        if not cols:
            return pd.DataFrame(columns=["column", "null_count", "null_pct", "non_null"])

        total = self.row_count()
        rows = []
        for col in cols:
            safe_col = safe_identifier(col)
            result = execute(
                self._conn,
                f"""
                SELECT COUNT(*) - COUNT({safe_col}) AS nulls
                FROM {self._table}
                """
            )
            nulls = int(result.fetchone()[0])
            rows.append({
                "column": col,
                "null_count": nulls,
                "null_pct": round(nulls / total, 4) if total > 0 else 0.0,
                "non_null": total - nulls,
            })

        return pd.DataFrame(rows).sort_values("null_count", ascending=False)
