from typing import Any, Dict, List, Optional
import pandas as pd
from app.services.cleaning_execution.base import CleanOperator

class TrimOperator(CleanOperator):
    """Trims whitespace from string columns."""
    def validate_params(self) -> None:
        columns = self.params.get("columns")
        if columns is not None:
            if not isinstance(columns, list):
                raise ValueError("columns must be a list of strings")
            for col in columns:
                if not isinstance(col, str):
                    raise ValueError("column name must be a string")

    def execute(self, df: pd.DataFrame) -> pd.DataFrame:
        result = df.copy(deep=False)
        columns = self.params.get("columns")

        if columns is None:
            columns = [
                col for col in result.columns
                if col != "_vizzy_row_idx" and (
                    pd.api.types.is_string_dtype(result[col]) or result[col].dtype == object
                )
            ]
        else:
            # Validate columns exist
            missing = set(columns) - set(result.columns)
            if missing:
                raise ValueError(f"Columns not found in DataFrame: {', '.join(sorted(missing))}")

        self.columns_affected = []
        self.cells_modified = 0
        self.rows_dropped = 0

        for col in columns:
            if pd.api.types.is_string_dtype(result[col]) or result[col].dtype == object:
                original = result[col]
                trimmed = original.apply(
                    lambda x: x.strip() if isinstance(x, str) else x
                )
                # Count modified cells
                modified_mask = (original != trimmed) & ~(original.isna() & trimmed.isna())
                modified_count = int(modified_mask.sum())
                if modified_count > 0:
                    self.cells_modified += modified_count
                    self.columns_affected.append(col)
                    # Selective copy: copy only this modified column
                    result[col] = trimmed.copy()

        return result


class DuplicateOperator(CleanOperator):
    """Removes duplicate rows from the dataset."""
    def validate_params(self) -> None:
        subset = self.params.get("subset")
        if subset is not None:
            if not isinstance(subset, list):
                raise ValueError("subset must be a list of strings")
            for col in subset:
                if not isinstance(col, str):
                    raise ValueError("column name must be a string")

        keep = self.params.get("keep", "first")
        if keep not in ("first", "last", False):
            raise ValueError("keep must be 'first', 'last', or False")

    def execute(self, df: pd.DataFrame) -> pd.DataFrame:
        # Since dropping rows affects all columns/index, copy the dataframe
        result = df.copy()
        subset = self.params.get("subset")
        keep = self.params.get("keep", "first")

        cols_to_compare = []
        if subset is not None:
            missing = set(subset) - set(result.columns)
            if missing:
                raise ValueError(f"Columns not found in DataFrame: {', '.join(sorted(missing))}")
            cols_to_compare = [c for c in subset if c != "_vizzy_row_idx"]
        else:
            cols_to_compare = [c for c in result.columns if c != "_vizzy_row_idx"]

        original_len = len(result)
        result = result.drop_duplicates(subset=cols_to_compare, keep=keep).reset_index(drop=True)
        
        self.rows_dropped = original_len - len(result)
        self.cells_modified = 0
        self.columns_affected = cols_to_compare if self.rows_dropped > 0 else []

        return result


class ImputeOperator(CleanOperator):
    """Imputes missing values using mean or median."""
    def validate_params(self) -> None:
        columns = self.params.get("columns")
        if not columns:
            raise ValueError("columns parameter cannot be empty")
        if not isinstance(columns, list):
            raise ValueError("columns must be a list of strings")
        for col in columns:
            if not isinstance(col, str):
                raise ValueError("column name must be a string")

        method = self.params.get("method", "mean")
        if method not in ("mean", "median"):
            raise ValueError("method must be 'mean' or 'median'")

    def execute(self, df: pd.DataFrame) -> pd.DataFrame:
        result = df.copy(deep=False)
        columns = self.params.get("columns")
        method = self.params.get("method", "mean")

        # Validate columns exist
        missing = set(columns) - set(result.columns)
        if missing:
            raise ValueError(f"Columns not found in DataFrame: {', '.join(sorted(missing))}")

        # Validate numeric
        non_numeric = [
            col for col in columns
            if not pd.api.types.is_numeric_dtype(result[col])
        ]
        if non_numeric:
            raise ValueError(f"Non-numeric columns: {', '.join(non_numeric)}")

        self.columns_affected = []
        self.cells_modified = 0
        self.rows_dropped = 0

        for col in columns:
            null_count = int(result[col].isna().sum())
            if null_count > 0:
                if method == "mean":
                    fill_val = result[col].mean()
                else:
                    fill_val = result[col].median()

                if pd.isna(fill_val):
                    raise ValueError(f"Cannot compute {method} for column '{col}' (all values are null)")

                # Selective copy: copy only this column
                result[col] = result[col].copy()
                result[col] = result[col].fillna(fill_val)
                self.cells_modified += null_count
                self.columns_affected.append(col)

        return result


class CapOutlierOperator(CleanOperator):
    """Caps outliers in numeric columns using the IQR method."""
    def validate_params(self) -> None:
        columns = self.params.get("columns")
        if not columns:
            raise ValueError("columns parameter cannot be empty")
        if not isinstance(columns, list):
            raise ValueError("columns must be a list of strings")
        for col in columns:
            if not isinstance(col, str):
                raise ValueError("column name must be a string")

        multiplier = self.params.get("multiplier", 1.5)
        if not isinstance(multiplier, (int, float)) or multiplier <= 0:
            raise ValueError("multiplier must be a positive number")

    def execute(self, df: pd.DataFrame) -> pd.DataFrame:
        result = df.copy(deep=False)
        columns = self.params.get("columns")
        multiplier = self.params.get("multiplier", 1.5)

        # Validate columns exist
        missing = set(columns) - set(result.columns)
        if missing:
            raise ValueError(f"Columns not found in DataFrame: {', '.join(sorted(missing))}")

        # Validate numeric
        non_numeric = [
            col for col in columns
            if not pd.api.types.is_numeric_dtype(result[col])
        ]
        if non_numeric:
            raise ValueError(f"Non-numeric columns: {', '.join(non_numeric)}")

        self.columns_affected = []
        self.cells_modified = 0
        self.rows_dropped = 0

        for col in columns:
            q1 = result[col].quantile(0.25)
            q3 = result[col].quantile(0.75)
            iqr = q3 - q1

            if iqr == 0:
                continue

            lower_bound = q1 - multiplier * iqr
            upper_bound = q3 + multiplier * iqr

            original = result[col]
            capped = original.clip(lower=lower_bound, upper=upper_bound)

            # Count modified cells
            modified_mask = (original != capped) & ~(original.isna() & capped.isna())
            modified_count = int(modified_mask.sum())
            if modified_count > 0:
                self.cells_modified += modified_count
                self.columns_affected.append(col)
                # Selective copy: copy only this column
                result[col] = capped.copy()

        return result
