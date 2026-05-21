"""
File loader module.

Loads tabular data from uploaded files with validation.
"""

from pathlib import Path
from typing import Any, BinaryIO, Union

import pandas as pd

from app.core.config import get_settings
from app.core.exceptions import InvalidOperation


ALLOWED_EXTENSIONS = {"csv", "xlsx", "xls", "json", "xml", "parquet"}

# Try common encodings in order of likelihood
_CSV_ENCODINGS = ["utf-8", "utf-8-sig", "latin-1", "cp1252", "iso-8859-1"]


def validate_file(*, filename: str, file_size: int) -> str:
    """
    Validate file extension and size.
    Returns normalized extension.
    Raises InvalidOperation on failure.
    """
    ext = _validate_file_extension(filename)
    _validate_file_size(file_size)
    return ext


def _validate_file_extension(filename: str) -> str:
    """Validate file extension and return normalized extension."""
    ext = Path(filename).suffix.lower().lstrip(".")

    if ext not in ALLOWED_EXTENSIONS:
        raise InvalidOperation(
            operation="file_upload",
            reason=f"File extension '.{ext}' is not supported",
            details=f"Allowed extensions: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )

    return ext


def _validate_file_size(file_size: int) -> None:
    """Validate file size against configured maximum."""
    settings = get_settings()
    max_size_bytes = settings.storage.max_file_size_mb * 1024 * 1024

    if file_size > max_size_bytes:
        raise InvalidOperation(
            operation="file_upload",
            reason="File exceeds maximum allowed size",
            details=f"Maximum size: {settings.storage.max_file_size_mb}MB",
        )


def _read_csv_with_encodings(source: Union[Path, BinaryIO], **kwargs: Any) -> pd.DataFrame:
    """Read CSV with multiple encoding attempts."""
    last_error = None

    for encoding in _CSV_ENCODINGS:
        try:
            if hasattr(source, "seek"):
                source.seek(0)

            return pd.read_csv(
                source,
                encoding=encoding,
                on_bad_lines="warn",
                low_memory=False,
                **kwargs,
            )
        except UnicodeDecodeError:
            last_error = f"Encoding {encoding} failed"
            continue
        except Exception as e:
            last_error = str(e)
            if "codec" not in str(e).lower() and "decode" not in str(e).lower():
                break

    raise InvalidOperation(
        operation="load_csv",
        reason="Failed to parse CSV file",
        details=f"Tried encodings: {_CSV_ENCODINGS}. Last error: {last_error}",
    )


def _load_csv(source: Union[Path, BinaryIO]) -> pd.DataFrame:
    """Load CSV into DataFrame with robust error handling."""
    return _read_csv_with_encodings(source)


def load_csv_sample(source: Union[Path, BinaryIO], nrows: int = 5) -> pd.DataFrame:
    """Load only a small CSV sample for schema inference."""
    return _read_csv_with_encodings(source, nrows=nrows)



def _load_excel(source: Union[Path, BinaryIO]) -> pd.DataFrame:
    """Load Excel into DataFrame."""
    try:
        return pd.read_excel(source)
    except Exception as e:
        raise InvalidOperation(
            operation="load_excel",
            reason="Failed to parse Excel file",
            details=str(e),
        )


def _load_json(source: Union[Path, BinaryIO]) -> pd.DataFrame:
    """Load JSON into DataFrame."""
    try:
        return pd.read_json(source)
    except Exception as e:
        raise InvalidOperation(
            operation="load_json",
            reason="Failed to parse JSON file",
            details=str(e),
        )


def _load_xml(source: Union[Path, BinaryIO]) -> pd.DataFrame:
    """Load XML into DataFrame."""
    try:
        return pd.read_xml(source)
    except Exception as e:
        raise InvalidOperation(
            operation="load_xml",
            reason="Failed to parse XML file",
            details=str(e),
        )


def _load_parquet(source: Union[Path, BinaryIO]) -> pd.DataFrame:
    """Load Parquet into DataFrame."""
    try:
        return pd.read_parquet(source)
    except Exception as e:
        raise InvalidOperation(
            operation="load_parquet",
            reason="Failed to parse Parquet file",
            details=str(e),
        )


def load_from_path(
    file_path: Union[str, Path],
    filename: str,
) -> pd.DataFrame:
    """Load tabular data from a file path."""
    path = Path(file_path)

    if not path.exists():
        raise InvalidOperation(
            operation="load_file",
            reason="File not found",
            details=str(file_path),
        )

    ext = _validate_file_extension(filename)
    _validate_file_size(path.stat().st_size)

    if ext == "csv":
        return _load_csv(path)
    if ext == "json":
        return _load_json(path)
    if ext == "parquet":
        return _load_parquet(path)
    if ext == "xml":
        return _load_xml(path)

    return _load_excel(path)


def load_from_upload(
    file_stream: BinaryIO,
    filename: str,
    file_size: int,
) -> pd.DataFrame:
    """Load tabular data from an uploaded file stream."""
    ext = validate_file(filename=filename, file_size=file_size)

    try:
        file_stream.seek(0)
    except Exception:
        pass

    if ext == "csv":
        return _load_csv(file_stream)
    if ext == "json":
        return _load_json(file_stream)
    if ext == "parquet":
        return _load_parquet(file_stream)
    if ext == "xml":
        return _load_xml(file_stream)

    return _load_excel(file_stream)
