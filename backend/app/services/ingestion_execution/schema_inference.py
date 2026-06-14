"""
Schema inference module.

Infers schema metadata from pandas DataFrames.
"""

import hashlib
import json
from typing import Any, Dict, List

import pandas as pd

from app.core.exceptions import InvalidOperation


def infer_schema(df: pd.DataFrame) -> Dict[str, Any]:
    """
    Infer schema metadata from a pandas DataFrame.

    Returns:
        {
            "columns": [
                {"name": str, "dtype": str, "nullable": bool}
            ],
            "schema_hash": str
        }
    """
    if df.empty:
        raise InvalidOperation(
            operation="schema_inference",
            reason="Cannot infer schema from empty dataset",
        )

    columns: List[Dict[str, Any]] = []

    for col in df.columns:
        series = df[col]
        from app.core.input_validation import sanitize_column_name
        safe_name = sanitize_column_name(str(col))
        column_schema = {
            "name": str(col),
            "safe_name": safe_name,
            "dtype": _normalize_dtype(series.dtype),
            "nullable": bool(series.isnull().any()),
        }
        columns.append(column_schema)

    schema_hash = _compute_schema_hash(columns)

    return {
        "columns": columns,
        "schema_hash": schema_hash,
    }


def _normalize_dtype(dtype: Any) -> str:
    """Normalize pandas dtype into stable type names."""
    if pd.api.types.is_integer_dtype(dtype):
        return "integer"
    if pd.api.types.is_float_dtype(dtype):
        return "float"
    if pd.api.types.is_bool_dtype(dtype):
        return "boolean"
    if pd.api.types.is_datetime64_any_dtype(dtype):
        return "datetime"
    return "string"


def _compute_schema_hash(columns: List[Dict[str, Any]]) -> str:
    """Compute deterministic schema hash."""
    canonical = json.dumps(
        sorted(columns, key=lambda c: c["name"]),
        separators=(",", ":"),
        sort_keys=True,
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()
