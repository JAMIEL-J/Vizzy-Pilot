from typing import List, Optional

import pandas as pd


def drop_rows_with_nulls(
    df: pd.DataFrame,
    columns: Optional[List[str]] = None,
) -> pd.DataFrame:
    """
    Drop rows containing null values.
    If columns specified, only consider those columns.
    Returns a new DataFrame.
    """
    result = df.copy()

    if columns is not None:
        _validate_columns(result, columns)
        return result.dropna(subset=columns).reset_index(drop=True)

    cols_to_check = [c for c in result.columns if c != "_vizzy_row_idx"]
    return result.dropna(subset=cols_to_check).reset_index(drop=True)


def fill_missing_mean(
    df: pd.DataFrame,
    columns: List[str],
) -> pd.DataFrame:
    """
    Fill missing values with column mean.
    Only works on numeric columns.
    Returns a new DataFrame.
    """
    if not columns:
        raise ValueError("columns parameter cannot be empty")

    _validate_columns(df, columns)
    _validate_numeric_columns(df, columns)

    result = df.copy()

    for col in columns:
        mean_value = result[col].mean()
        if pd.isna(mean_value):
            raise ValueError(f"Cannot compute mean for column '{col}' (all values are null)")
        result[col] = result[col].fillna(mean_value)

    return result


def fill_missing_median(
    df: pd.DataFrame,
    columns: List[str],
) -> pd.DataFrame:
    """
    Fill missing values with column median.
    Only works on numeric columns.
    Returns a new DataFrame.
    """
    if not columns:
        raise ValueError("columns parameter cannot be empty")

    _validate_columns(df, columns)
    _validate_numeric_columns(df, columns)

    result = df.copy()

    for col in columns:
        median_value = result[col].median()
        if pd.isna(median_value):
            raise ValueError(f"Cannot compute median for column '{col}' (all values are null)")
        result[col] = result[col].fillna(median_value)

    return result


def trim_string_columns(
    df: pd.DataFrame,
    columns: Optional[List[str]] = None,
) -> pd.DataFrame:
    """
    Trim whitespace from string columns.
    If columns not specified, applies to all string columns.
    Returns a new DataFrame.
    """
    result = df.copy()

    if columns is None:
        columns = [
            col for col in result.columns
            if pd.api.types.is_string_dtype(result[col])
        ]
    else:
        _validate_columns(result, columns)

    for col in columns:
        if pd.api.types.is_string_dtype(result[col]):
            result[col] = result[col].apply(
                lambda x: x.strip() if isinstance(x, str) else x
            )

    return result


def _validate_columns(df: pd.DataFrame, columns: List[str]) -> None:
    """Validate that all columns exist in DataFrame."""
    missing = set(columns) - set(df.columns)
    if missing:
        raise ValueError(f"Columns not found in DataFrame: {', '.join(sorted(missing))}")


def _validate_numeric_columns(df: pd.DataFrame, columns: List[str]) -> None:
    """Validate that all columns are numeric."""
    non_numeric = [
        col for col in columns
        if not pd.api.types.is_numeric_dtype(df[col])
    ]
    if non_numeric:
        raise ValueError(f"Non-numeric columns: {', '.join(non_numeric)}")


def remove_duplicates(
    df: pd.DataFrame,
    subset: Optional[List[str]] = None,
    keep: str = "first",
) -> pd.DataFrame:
    """
    Remove duplicate rows from DataFrame.

    Args:
        df: Input DataFrame
        subset: Columns to consider for duplicates (None = all columns)
        keep: Which duplicate to keep - "first", "last", or False (drop all)

    Returns a new DataFrame with duplicates removed.
    """
    if keep not in ("first", "last", False):
        raise ValueError("keep must be 'first', 'last', or False")

    result = df.copy()

    if subset is not None:
        _validate_columns(result, subset)
        cols_to_compare = [c for c in subset if c != "_vizzy_row_idx"]
        return result.drop_duplicates(subset=cols_to_compare, keep=keep).reset_index(drop=True)

    cols_to_compare = [c for c in result.columns if c != "_vizzy_row_idx"]
    return result.drop_duplicates(subset=cols_to_compare, keep=keep).reset_index(drop=True)


def cap_outliers(
    df: pd.DataFrame,
    columns: List[str],
    method: str = "iqr",
    multiplier: float = 1.5,
) -> pd.DataFrame:
    """
    Cap outliers to upper/lower bounds using IQR method.

    Args:
        df: Input DataFrame
        columns: Numeric columns to cap
        method: Detection method ("iqr" supported)
        multiplier: IQR multiplier for bounds (default 1.5)

    Returns a new DataFrame with outliers capped.
    """
    if not columns:
        raise ValueError("columns parameter cannot be empty")

    if method != "iqr":
        raise ValueError("Only 'iqr' method is currently supported")

    _validate_columns(df, columns)
    _validate_numeric_columns(df, columns)

    result = df.copy()

    for col in columns:
        q1 = result[col].quantile(0.25)
        q3 = result[col].quantile(0.75)
        iqr = q3 - q1

        if iqr == 0:
            # No variation, skip capping
            continue

        lower_bound = q1 - multiplier * iqr
        upper_bound = q3 + multiplier * iqr

        result[col] = result[col].clip(lower=lower_bound, upper=upper_bound)

    return result
