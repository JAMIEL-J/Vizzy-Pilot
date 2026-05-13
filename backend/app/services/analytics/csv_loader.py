"""
Shared CSV loader for analytics paths.

Normalizes numeric-like object columns (currency symbols, commas, percentages)
so KPI math remains consistent across dashboard and chat orchestration.
"""

from functools import lru_cache
import os

import pandas as pd


_CSV_ENCODINGS = ["utf-8", "utf-8-sig", "latin-1", "cp1252", "iso-8859-1"]


def _safe_read_csv_impl(file_path: str) -> pd.DataFrame:
    """
    Load a CSV and safely coerce object columns that are actually numeric.

    Strips common formatting symbols before conversion: $, commas, %, spaces.
    Only converts a column when at least 80% of non-null values parse as numeric.
    """
    last_error: str | None = None
    df = None

    for encoding in _CSV_ENCODINGS:
        try:
            df = pd.read_csv(file_path, low_memory=False, encoding=encoding)
            break
        except UnicodeDecodeError:
            last_error = f"Encoding {encoding} failed"
            continue
        except Exception as exc:
            last_error = str(exc)
            if "codec" not in str(exc).lower() and "decode" not in str(exc).lower():
                break

    if df is None:
        raise ValueError(f"Failed to parse CSV with encodings {_CSV_ENCODINGS}. Last error: {last_error}")
    for col in df.select_dtypes(include=["object"]).columns:
        try:
            series = df[col].astype(str)
            percent_mask = series.where(df[col].notna(), "").str.contains("%", regex=False)
            series = series.str.replace(r"[$,% ]", "", regex=True)
            converted = pd.to_numeric(series, errors="coerce")
            total_non_null = df[col].notna().sum()
            if total_non_null > 0 and (converted.notna().sum() / total_non_null) > 0.8:
                converted.loc[percent_mask] = converted.loc[percent_mask] / 100
                df[col] = converted
        except Exception:
            continue
    return df


@lru_cache(maxsize=8)
def _cached_read_csv(file_path: str, mtime: float) -> pd.DataFrame:
    """LRU-cached CSV reader keyed by (path, mtime)."""
    return _safe_read_csv_impl(file_path)


def safe_read_csv(file_path: str) -> pd.DataFrame:
    """Read CSV with caching that invalidates when file mtime changes."""
    try:
        mtime = os.path.getmtime(file_path)
    except OSError:
        mtime = 0.0
    return _cached_read_csv(file_path, mtime).copy()
