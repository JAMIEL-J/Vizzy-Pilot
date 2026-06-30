"""
Join Manager Service.

Responsible for creating secure DuckDB VIEWs from join configurations.

Security: ALL table and column identifiers pass through safe_identifier()
from query_utils.py. ZERO f-string interpolation for user-provided names.
"""

import logging
from typing import Any, Dict, List

import duckdb

from app.services.analytics.query_utils import safe_identifier, QuerySafetyError

logger = logging.getLogger(__name__)

# Allowed join types (validated at Pydantic level too, but defense-in-depth)
_ALLOWED_JOIN_TYPES = {"INNER", "LEFT", "RIGHT", "FULL OUTER", "CROSS"}


class JoinManager:
    """Secure join view creation for multi-table datasets."""

    @staticmethod
    def create_joined_view(
        conn: duckdb.DuckDBPyConnection,
        view_name: str,
        joins: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """Generate and execute CREATE OR REPLACE VIEW.

        Args:
            conn: DuckDB connection (read-write)
            view_name: Name for the created VIEW
            joins: List of join configs, each containing:
                - left_table: str
                - right_table: str
                - join_type: str (inner|left|right|outer|cross)
                - columns: List[{left_column: str, right_column: str}]

        Returns:
            {"sql": str, "view_name": str} — the generated SQL for audit logging

        Raises:
            QuerySafetyError: If any identifier fails safety validation
            ValueError: If join config is malformed
        """
        if not joins:
            raise ValueError("No join configurations provided")

        # Validate view name
        safe_view = safe_identifier(view_name)

        # Build the FROM + JOIN chain
        # Start with the left table of the first join
        first_join = joins[0]
        base_table = first_join.get("left_table")
        if not base_table:
            raise ValueError("First join is missing left_table")

        safe_base = safe_identifier(base_table)
        from_clause = safe_base

        join_clauses = []
        for join_def in joins:
            right_table = join_def.get("right_table")
            join_type = str(join_def.get("join_type", "inner")).upper()
            columns = join_def.get("columns", [])

            if not right_table:
                raise ValueError("Join config is missing right_table")
            if not columns:
                raise ValueError(f"Join to '{right_table}' has no column mappings")

            # Normalize join type
            if join_type == "OUTER":
                join_type = "FULL OUTER"

            if join_type not in _ALLOWED_JOIN_TYPES:
                raise ValueError(
                    f"Invalid join type '{join_type}'. "
                    f"Allowed: {', '.join(sorted(_ALLOWED_JOIN_TYPES))}"
                )

            safe_right = safe_identifier(right_table)

            # Build ON clause with safe identifiers
            on_parts = []
            for col_pair in columns:
                # Handle both dict-style and object-style column configs
                if isinstance(col_pair, dict):
                    left_col = col_pair.get("left_column", "")
                    right_col = col_pair.get("right_column", "")
                else:
                    left_col = getattr(col_pair, "left_column", "")
                    right_col = getattr(col_pair, "right_column", "")

                if not left_col or not right_col:
                    raise ValueError("Join column mapping is missing left_column or right_column")

                # Safe identifiers — this is where injection attempts are caught
                safe_left_col = safe_identifier(left_col)
                safe_right_col = safe_identifier(right_col)

                # Qualify with table names to avoid ambiguity
                left_tbl = join_def.get("left_table", base_table)
                safe_left_tbl = safe_identifier(left_tbl)

                on_parts.append(
                    f"{safe_left_tbl}.{safe_left_col} = {safe_right}.{safe_right_col}"
                )

            on_clause = " AND ".join(on_parts)

            if join_type == "CROSS":
                join_clauses.append(f"CROSS JOIN {safe_right}")
            else:
                join_clauses.append(
                    f"{join_type} JOIN {safe_right} ON {on_clause}"
                )

        # Assemble full SQL
        joins_sql = " ".join(join_clauses)
        full_sql = f"CREATE OR REPLACE VIEW {safe_view} AS SELECT * FROM {from_clause} {joins_sql}"

        logger.info(f"Creating joined view: {full_sql}")

        # Execute
        conn.execute(full_sql)

        return {
            "sql": full_sql,
            "view_name": view_name,
        }

    @staticmethod
    def drop_joined_view(
        conn: duckdb.DuckDBPyConnection,
        view_name: str,
    ) -> None:
        """Drop a joined view if it exists."""
        safe_view = safe_identifier(view_name)
        conn.execute(f"DROP VIEW IF EXISTS {safe_view}")
        logger.info(f"Dropped view: {view_name}")

    @staticmethod
    def validate_join_config(
        conn: duckdb.DuckDBPyConnection,
        joins: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """Pre-flight validation without creating the view.

        Returns:
            {
                "is_valid": bool,
                "errors": List[str],
                "estimated_columns": int,
                "tables_verified": List[str],
            }
        """
        errors = []
        verified_tables = set()

        # Get available tables
        try:
            tables_df = conn.execute("SHOW TABLES").df()
            available = set(tables_df["name"].tolist()) if not tables_df.empty else set()
        except Exception:
            available = set()

        # Cache schema mapping
        schemas: Dict[str, set] = {}
        schema_query_failed = False
        try:
            # information_schema.columns works in duckdb and retrieves all table/column structures
            all_columns = conn.execute("SELECT table_name, column_name FROM information_schema.columns").fetchall()
            for table_name, column_name in all_columns:
                if table_name not in schemas:
                    schemas[table_name] = set()
                schemas[table_name].add(column_name)
        except Exception:
            schema_query_failed = True
        table_schemas = {}

        for join_def in joins:
            left = join_def.get("left_table", "")
            right = join_def.get("right_table", "")

            if left not in available:
                errors.append(f"Table '{left}' not found in DuckDB")
            else:
                verified_tables.add(left)

            if right not in available:
                errors.append(f"Table '{right}' not found in DuckDB")
            else:
                verified_tables.add(right)

            # Validate columns exist
            columns = join_def.get("columns", [])
            for col_pair in columns:
                left_col = col_pair.get("left_column", "") if isinstance(col_pair, dict) else ""
                right_col = col_pair.get("right_column", "") if isinstance(col_pair, dict) else ""

                try:
                    safe_identifier(left_col)
                    safe_identifier(right_col)
                except QuerySafetyError as e:
                    errors.append(f"Unsafe identifier: {e}")

                # Verify column exists in table
                if left in available:
                    if not schema_query_failed and left in schemas:
                        if left_col not in schemas[left]:
                    try:
                        if left not in table_schemas:
                            table_schemas[left] = {
                                r[0] for r in conn.execute(
                                    f"DESCRIBE {safe_identifier(left)}"
                                ).fetchall()
                            }
                        left_cols = table_schemas[left]
                        if left_col not in left_cols:
                            errors.append(f"Column '{left_col}' not found in '{left}'")
                    else:
                        try:
                            left_cols = {
                                r[0] for r in conn.execute(
                                    f"DESCRIBE {safe_identifier(left)}"
                                ).fetchall()
                            }
                            if left_col not in left_cols:
                                errors.append(f"Column '{left_col}' not found in '{left}'")
                        except Exception as e:
                            errors.append(f"Cannot inspect table '{left}': {e}")

                if right in available:
                    if not schema_query_failed and right in schemas:
                        if right_col not in schemas[right]:
                    try:
                        if right not in table_schemas:
                            table_schemas[right] = {
                                r[0] for r in conn.execute(
                                    f"DESCRIBE {safe_identifier(right)}"
                                ).fetchall()
                            }
                        right_cols = table_schemas[right]
                        if right_col not in right_cols:
                            errors.append(f"Column '{right_col}' not found in '{right}'")
                    else:
                        try:
                            right_cols = {
                                r[0] for r in conn.execute(
                                    f"DESCRIBE {safe_identifier(right)}"
                                ).fetchall()
                            }
                            if right_col not in right_cols:
                                errors.append(f"Column '{right_col}' not found in '{right}'")
                        except Exception as e:
                            errors.append(f"Cannot inspect table '{right}': {e}")

        return {
            "is_valid": len(errors) == 0,
            "errors": errors,
            "tables_verified": list(verified_tables),
        }
