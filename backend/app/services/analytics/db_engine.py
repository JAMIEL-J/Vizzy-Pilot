import asyncio
import duckdb
import logging
import json
import pandas as pd
from typing import Dict, Any, List, Optional
from app.services.security.sandbox import execute_sandboxed, QueryExecutionError
from app.services.analytics.coercion import run_coercion_pipeline, ColumnCoercionResult

logger = logging.getLogger(__name__)

_write_lock = asyncio.Lock()

class DBEngine:
    """DuckDB interface with sandboxed execution and pre-flight coercion."""
    
    def __init__(self, db_path: Optional[str] = None):
        from app.core.config import get_settings
        settings = get_settings()
        self._db_path = db_path or settings.storage.duckdb_path

        # Ensure parent directory exists for file-based paths
        if self._db_path != ":memory:":
            import os
            os.makedirs(os.path.dirname(self._db_path) or ".", exist_ok=True)

        self._write_con = duckdb.connect(database=self._db_path, read_only=False)
        self._read_con = None
        self.coercion_results: List[ColumnCoercionResult] = []

    def _lock_down_read_con(self):
        """Lock down the connection for safe query execution after data loading."""
        self._read_con = self._write_con

        try:
            self._read_con.execute("SET enable_external_access = false")
            self._read_con.execute("SET autoinstall_known_extensions = false")
            self._read_con.execute("SET autoload_known_extensions = false")
            
            try:
                self._read_con.execute("SET lock_configuration = true")
                logger.info("DuckDB connection locked down for security.")
            except duckdb.Error as e:
                if "configuration has been locked" in str(e):
                    logger.debug("DuckDB configuration already locked.")
                else:
                    raise e
        except Exception as e:
            if "configuration has been locked" in str(e):
                 logger.debug("DuckDB is already in a locked state.")
            else:
                logger.error(f"Failed to lock down DuckDB: {e}")

    async def load_dataframe(self, table_name: str, df: pd.DataFrame):
        """Register a Pandas dataframe as a queryable DuckDB table and run coercion."""
        async with _write_lock:
            try:
                self._write_con.unregister(f"_tmp_{table_name}")
            except Exception:
                pass

            self._write_con.register(f"_tmp_{table_name}", df)
            self._write_con.execute(f'DROP TABLE IF EXISTS "{table_name}"')
            self._write_con.execute(f'CREATE TABLE "{table_name}" AS SELECT * FROM "_tmp_{table_name}"')
            self._write_con.unregister(f"_tmp_{table_name}")

            self.coercion_results = run_coercion_pipeline(self._write_con, table_name)
            self._lock_down_read_con()

    async def load_csv(self, table_name: str, file_path: str):
        """Load a CSV file directly into DuckDB and run coercion."""
        async with _write_lock:
            try:
                self._write_con.execute(f'DROP TABLE IF EXISTS "{table_name}"')
                self._write_con.execute(f"CREATE TABLE \"{table_name}\" AS SELECT * FROM read_csv_auto('{file_path}')")
                self.coercion_results = run_coercion_pipeline(self._write_con, table_name)
                self._lock_down_read_con()
            except duckdb.Error as e:
                logger.error(f"Failed to load CSV via DuckDB: {str(e)}")
                raise ValueError(f"Direct CSV load failed: {str(e)}")

    def extract_schema(self, table_name: str) -> Dict[str, Any]:
        """Extract schema and include coercion formatting hints."""
        try:
            schema_df = self._write_con.execute(f'DESCRIBE "{table_name}"').df()
            columns = {}
            for _, row in schema_df.iterrows():
                columns[row['column_name']] = row['column_type']

            coercion_map = {res.original_name: res for res in self.coercion_results}

            sample_df = self._write_con.execute(f'SELECT * FROM "{table_name}" LIMIT 2').df()
            for col in sample_df.columns:
                if sample_df[col].dtype == object:
                    sample_df[col] = sample_df[col].apply(lambda x: str(x)[:100] + "..." if isinstance(x, str) and len(x) > 100 else x)
            
            sample_data_json = sample_df.to_json(orient="records", date_format="iso")
            sample_data = json.loads(sample_data_json)

            column_metadata = {}
            for col, col_type in columns.items():
                meta = {"type": col_type}
                if col in coercion_map:
                    meta["display_format"] = coercion_map[col].display_format
                    meta["coerced"] = True
                column_metadata[col] = meta

            return {
                "table_name": table_name,
                "columns": columns,
                "column_metadata": column_metadata,
                "sample_data": sample_data,
                "row_count": self._write_con.execute(f'SELECT COUNT(*) FROM "{table_name}"').fetchone()[0],
            }
        except Exception as e:
            logger.error(f"Failed to extract schema for '{table_name}': {str(e)}")
            return {"error": str(e)}

    async def execute_query(self, query: str, timeout_seconds: int = 30) -> pd.DataFrame:
        """Execute a query using the security sandbox."""
        if self._read_con is None:
            raise ValueError("No data loaded. Call load_dataframe() first.")
        
        table_name = "data"
        
        try:
            return await execute_sandboxed(self._read_con, query, table_name, timeout_seconds=timeout_seconds)
        except QueryExecutionError as e:
            raise ValueError(str(e))
        except Exception as e:
            logger.error(f"Unexpected error during query execution: {e}")
            raise ValueError(f"Execution error: {str(e)}")

    def close(self):
        """Close connections."""
        if self._write_con:
            try:
                self._write_con.close()
            except Exception:
                pass

# Singleton instance
_engine_instance: Optional[DBEngine] = None

def get_db_engine() -> DBEngine:
    """Get the singleton DBEngine instance."""
    global _engine_instance
    if _engine_instance is None:
        _engine_instance = DBEngine()
    return _engine_instance
