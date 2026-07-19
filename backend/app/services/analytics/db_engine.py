import asyncio
import time
import duckdb
import logging
import json
import pandas as pd
from typing import Dict, Any, List, Optional
from app.services.security.sandbox import execute_sandboxed, QueryExecutionError
from app.services.analytics.coercion import run_coercion_pipeline, ColumnCoercionResult
from app.services.analytics.index_manager import create_performance_indices
from app.services.analytics.query_utils import execute, safe_identifier

logger = logging.getLogger(__name__)

_write_lock = asyncio.Lock()
_TIMING_LOG_THRESHOLD = 0.5  # seconds — log any phase taking longer than this

class DBEngine:
    """DuckDB interface with sandboxed execution and pre-flight coercion."""
    
    def __init__(self, db_path: Optional[str] = None, read_only: bool = False):
        from app.core.config import get_settings
        settings = get_settings()
        self._db_path = db_path or settings.storage.duckdb_path

        # Ensure parent directory exists for file-based paths
        if self._db_path != ":memory:":
            import os
            os.makedirs(os.path.dirname(self._db_path) or ".", exist_ok=True)

        self._write_con = duckdb.connect(database=self._db_path, read_only=read_only)
        try:
            self._write_con.execute("SET enable_progress_bar = false")
        except Exception as e:
            logger.debug(f"Could not disable DuckDB progress bar: {e}")
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

            # Pandas 3 + DuckDB < 1.0 workaround
            df_reg = df.copy()
            for col in df_reg.select_dtypes(include=['string']).columns:
                df_reg[col] = df_reg[col].astype('object')

            self._write_con.register(f"_tmp_{table_name}", df_reg)

            self._write_con.execute(f'DROP TABLE IF EXISTS {safe_identifier(table_name)}')
            tmp_table = f"_tmp_{table_name}"
            self._write_con.execute(f'CREATE TABLE {safe_identifier(table_name)} AS SELECT * FROM {safe_identifier(tmp_table)}')
            self._write_con.unregister(tmp_table)

            self.coercion_results = run_coercion_pipeline(self._write_con, table_name)
            create_performance_indices(self._write_con, table_name)
            self._lock_down_read_con()

    async def load_csv(self, table_name: str, file_path: str):
        """Load a CSV file directly into DuckDB and run coercion.

        Acquires the async lock on the event loop, then offloads synchronous
        C++ DuckDB file loading, single-pass coercion, and index creation to a
        worker thread via asyncio.to_thread.
        """
        async with _write_lock:
            await asyncio.to_thread(self._sync_load_and_coerce, table_name, file_path)

    def _sync_load_and_coerce(self, table_name: str, file_path: str):
        """Synchronous worker thread handler for CSV loading and single-pass coercion."""
        _phase_times: Dict[str, float] = {}
        _t0 = time.perf_counter()

        effective_path = file_path
        loaded = False
        try:
            self._write_con.execute(f'DROP TABLE IF EXISTS {safe_identifier(table_name)}')
            self._write_con.execute(
                f"CREATE TABLE {safe_identifier(table_name)} AS SELECT * FROM read_csv_auto(?)",
                [effective_path]
            )
            _phase_times["read_csv_auto"] = time.perf_counter() - _t0
            loaded = True
        except duckdb.Error as first_err:
            err_msg = str(first_err).lower()
            is_encoding_error = any(
                tok in err_msg
                for tok in ["unicode", "utf-8", "utf8", "codec", "encoding", "byte sequence"]
            )
            if not is_encoding_error:
                logger.error(f"Failed to load CSV via DuckDB: {first_err}")
                raise ValueError(f"Direct CSV load failed: {first_err}")

            logger.warning(
                "DuckDB detected encoding issue in %s. Attempting re-encoding to UTF-8.",
                file_path,
            )

            _t_reencode = time.perf_counter()
            effective_path = self._reencode_csv_to_utf8(file_path)

            try:
                self._write_con.execute(f'DROP TABLE IF EXISTS {safe_identifier(table_name)}')
                self._write_con.execute(
                    f"CREATE TABLE {safe_identifier(table_name)} AS SELECT * FROM read_csv_auto(?)",
                    [effective_path]
                )
                _phase_times["read_csv_auto_retry"] = time.perf_counter() - _t_reencode
                loaded = True
            except duckdb.Error:
                logger.warning(
                    "Re-encoded file still failed. Retrying with ignore_errors=true for %s",
                    file_path,
                )
                try:
                    self._write_con.execute(f'DROP TABLE IF EXISTS {safe_identifier(table_name)}')
                    self._write_con.execute(
                        f"CREATE TABLE {safe_identifier(table_name)} AS SELECT * FROM "
                        f"read_csv_auto(?, ignore_errors=true)",
                        [effective_path]
                    )
                    loaded = True
                except duckdb.Error as final_err:
                    logger.error(f"All CSV load strategies failed: {final_err}")
                    raise ValueError(f"Direct CSV load failed: {final_err}")

        if loaded:
            _t_coerce = time.perf_counter()
            try:
                self.coercion_results = run_coercion_pipeline(self._write_con, table_name)
            except Exception as coercion_err:
                logger.warning(f"Coercion pipeline failed (non-fatal): {coercion_err}")
                self.coercion_results = []
            _phase_times["coercion"] = time.perf_counter() - _t_coerce

            _t_index = time.perf_counter()
            create_performance_indices(self._write_con, table_name)
            _phase_times["indexing"] = time.perf_counter() - _t_index

            _phase_times["total"] = time.perf_counter() - _t0
            if any(v >= _TIMING_LOG_THRESHOLD for v in _phase_times.values()):
                _timing_summary = " | ".join(
                    f"{k}={v:.2f}s" for k, v in _phase_times.items() if v >= _TIMING_LOG_THRESHOLD
                )
                logger.info(
                    "DBEngine.load_csv timing for table '%s': %s | total=%.2fs",
                    table_name, _timing_summary, _phase_times["total"]
                )

            self._lock_down_read_con()

    @staticmethod
    def _reencode_csv_to_utf8(file_path: str) -> str:
        """Detect CSV encoding and write a UTF-8 copy next to the original.

        Returns the path to the UTF-8 file (may be the original if already UTF-8).
        """
        import os
        from pathlib import Path

        src = Path(file_path)
        utf8_path = src.with_name(src.stem + "_utf8" + src.suffix)

        # Read a sample to detect encoding
        raw_sample = b""
        try:
            with open(src, "rb") as f:
                raw_sample = f.read(1024 * 64)  # 64 KB sample
        except Exception:
            return file_path

        detected_encoding = None
        try:
            import chardet
            result = chardet.detect(raw_sample)
            if result and result.get("encoding"):
                detected_encoding = result["encoding"]
                logger.info("chardet detected encoding: %s (confidence %.0f%%)",
                            detected_encoding, (result.get("confidence", 0) * 100))
        except ImportError:
            logger.info("chardet not installed; falling back to heuristic encoding list")

        # Heuristic fallback list
        encodings_to_try = []
        if detected_encoding:
            encodings_to_try.append(detected_encoding)
        encodings_to_try.extend(["utf-8-sig", "latin-1", "cp1252", "iso-8859-1", "utf-16"])

        for enc in encodings_to_try:
            try:
                with open(src, "r", encoding=enc, errors="strict") as fin:
                    with open(utf8_path, "w", encoding="utf-8", newline="") as fout:
                        for chunk in iter(lambda: fin.read(1024 * 256), ""):
                            fout.write(chunk)
                logger.info("Re-encoded %s from %s → UTF-8 at %s", file_path, enc, utf8_path)
                return str(utf8_path)
            except (UnicodeDecodeError, UnicodeError, LookupError):
                continue

        # Last resort: read with errors='replace' (lossy but won't crash)
        try:
            with open(src, "r", encoding="utf-8", errors="replace") as fin:
                with open(utf8_path, "w", encoding="utf-8", newline="") as fout:
                    for chunk in iter(lambda: fin.read(1024 * 256), ""):
                        fout.write(chunk)
            logger.warning("Used lossy UTF-8 replace for %s", file_path)
            return str(utf8_path)
        except Exception as e:
            logger.error("All re-encoding attempts failed for %s: %s", file_path, e)
            return file_path

    def extract_schema(self, table_name: str) -> Dict[str, Any]:
        """Extract schema and include coercion formatting hints."""
        try:
            schema_df = self._write_con.execute(f'DESCRIBE {safe_identifier(table_name)}').df()
            columns = {}
            for _, row in schema_df.iterrows():
                columns[row['column_name']] = row['column_type']

            coercion_map = {res.original_name: res for res in self.coercion_results}

            sample_df = self._write_con.execute(f'SELECT * FROM {safe_identifier(table_name)} LIMIT 2').df()
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
                "row_count": self._write_con.execute(f'SELECT COUNT(*) FROM {safe_identifier(table_name)}').fetchone()[0],
            }
        except Exception as e:
            logger.error(f"Failed to extract schema for '{table_name}': {str(e)}")
            return {"error": str(e)}

    async def execute_query(self, query: str, table_name: str = "data", timeout_seconds: int = 30) -> pd.DataFrame:
        """Execute a query using the security sandbox."""
        if self._read_con is None:
            raise ValueError("No data loaded. Call load_dataframe() first.")
        
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
