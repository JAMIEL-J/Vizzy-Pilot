"""
Data sanitization and coercion for chart outputs.
"""

import pandas as pd
import warnings
from typing import Any, List, Optional

_POISON_STRINGS = {'nan', 'nat', 'none', 'null', '<na>', 'n/a', 'na', ''}

def _is_poison_value(v: Any) -> bool:
    """Return True if value is NaN, NaT, None, or a stringified variant."""
    if v is None:
        return True
    if isinstance(v, float) and (pd.isna(v) or v != v):
        return True
    if isinstance(v, str) and v.strip().lower() in _POISON_STRINGS:
        return True
    try:
        if pd.isna(v):
            return True
    except (TypeError, ValueError):
        pass
    return False

def _safe_float(v: Any, default=0.0):
    """Convert to float, returning default for NaN/None/inf."""
    try:
        f = float(v)
        if pd.isna(f) or f != f:  # NaN check
            return default
        return f
    except (TypeError, ValueError):
        return default

def _sanitize_chart_data(data: Any) -> Any:
    """Strip NaN/NaT/None entries from chart data lists before serialization."""
    if not isinstance(data, list):
        return data

    cleaned = []
    for row in data:
        if not isinstance(row, dict):
            cleaned.append(row)
            continue

        # Skip rows with poison name/label
        name_val = row.get('name', row.get('label', row.get('timestamp')))
        if name_val is not None and _is_poison_value(name_val):
            continue

        # Clean numeric fields in-place
        new_row = {}
        skip = False
        for k, v in row.items():
            if k in ('value', 'x', 'y', 'positive', 'negative', 'low', 'high'):
                if _is_poison_value(v):
                    skip = True
                    break
                new_row[k] = _safe_float(v)
            elif k in ('name', 'label', 'timestamp', 'date', 'xLabel', 'yLabel'):
                sv = str(v) if v is not None else ''
                if sv.strip().lower() in _POISON_STRINGS:
                    skip = True
                    break
                new_row[k] = sv
            else:
                if isinstance(v, float) and (pd.isna(v) or v != v):
                    new_row[k] = 0.0
                else:
                    new_row[k] = v

        if not skip:
            cleaned.append(new_row)

    return cleaned

def _coerce_numeric_metric_series(series: pd.Series) -> pd.Series:
    """Coerce numeric-like metric strings (currency, commas, percentages) to numbers."""
    if pd.api.types.is_numeric_dtype(series):
        return pd.to_numeric(series, errors='coerce')

    s = series.astype(str).str.strip()
    s = s.str.replace(r'^\((.*)\)$', r'-\1', regex=True)
    s = s.str.replace(r'[$,% ]', '', regex=True)
    return pd.to_numeric(s, errors='coerce')

def _safe_to_datetime(series: pd.Series) -> pd.Series:
    """Parse mixed date formats without noisy parser warnings."""
    if pd.api.types.is_datetime64_any_dtype(series):
        return series

    with warnings.catch_warnings():
        warnings.simplefilter("ignore", UserWarning)

        def _parse(dayfirst: bool) -> pd.Series:
            try:
                return pd.to_datetime(series, errors='coerce', format='mixed', dayfirst=dayfirst)
            except (TypeError, ValueError):
                return pd.to_datetime(series, errors='coerce', dayfirst=dayfirst)

        parsed_default = _parse(dayfirst=False)
        parsed_dayfirst = _parse(dayfirst=True)

        if parsed_dayfirst.notna().sum() > parsed_default.notna().sum():
            return parsed_dayfirst
        return parsed_default
