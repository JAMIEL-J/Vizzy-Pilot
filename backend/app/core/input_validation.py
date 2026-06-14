"""
Input validation and sanitization module.

Belongs to: core layer
Responsibility: Sanitize user inputs to prevent XSS, injection, and malformed data
Restrictions: No business logic, no auth, no datasets, no analytics
"""

import re
import html
from typing import Any, Optional

# XSS prevention: strip HTML tags and escape entities
def sanitize_text(value: str, max_length: int = 10000) -> str:
    """
    Sanitize text input to prevent XSS attacks.

    - Strips all HTML tags
    - Escapes special characters
    - Enforces max length

    Args:
        value: The input text to sanitize
        max_length: Maximum allowed length (default 10000 chars)

    Returns:
        Sanitized text safe for storage/display
    """
    if not value:
        return value

    # Truncate first (prevent DoS via huge strings)
    value = str(value)[:max_length]

    # Remove HTML tags (defense in depth - tags shouldn't reach here if CSP is working)
    value = re.sub(r"<[^>]*>", "", value)

    # Escape HTML entities to prevent XSS via special characters
    value = html.escape(value, quote=True)

    # Remove null bytes (can cause issues in some string handling)
    value = value.replace("\x00", "")

    # Strip leading/trailing whitespace but preserve internal whitespace
    value = value.strip()

    return value


def sanitize_filename(value: str) -> str:
    """
    Sanitize a filename to prevent path traversal and other attacks.

    - Removes path separators
    - Removes null bytes
    - Limits length
    - Removes potentially dangerous characters

    Args:
        value: The filename to sanitize

    Returns:
        Sanitized filename safe for storage
    """
    if not value:
        return "unnamed_file"

    # Remove path separators and null bytes
    value = re.sub(r"[/\\]|\x00", "", value)

    # Remove potentially dangerous characters for filenames
    value = re.sub(r'[<>:"|?*]', "", value)

    # Limit length (255 is typical max for filesystems)
    value = value[:255]

    # If nothing left, use a default
    if not value:
        return "unnamed_file"

    return value


def validate_password_strength(password: str) -> tuple[bool, Optional[str]]:
    """
    Validate password meets minimum security requirements.

    Requirements:
        - At least 8 characters
        - At least 1 uppercase letter
        - At least 1 lowercase letter
        - At least 1 digit
        - At least 1 special character (!@#$%^&*()_+-=[]{}|;:,.<>?)

    Args:
        password: The password to validate

    Returns:
        Tuple of (is_valid, error_message)
    """
    if len(password) < 8:
        return False, "Password must be at least 8 characters long"

    if len(password) > 128:
        return False, "Password must not exceed 128 characters"

    if not re.search(r"[A-Z]", password):
        return False, "Password must contain at least 1 uppercase letter"

    if not re.search(r"[a-z]", password):
        return False, "Password must contain at least 1 lowercase letter"

    if not re.search(r"\d", password):
        return False, "Password must contain at least 1 digit"

    if not re.search(r'[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]', password):
        return False, "Password must contain at least 1 special character (!@#$%^&*()_+-=[]{}|;:,.<>?)"

    return True, None


def sanitize_sql_identifier(value: str) -> str:
    """
    Sanitize a SQL identifier (table name, column name) to prevent injection.

    Only allows alphanumeric characters and underscores, starting with a letter.

    Args:
        value: The identifier to sanitize

    Returns:
        Sanitized identifier

    Raises:
        ValueError: If the identifier is invalid
    """
    if not re.match(r"^[a-zA-Z_][a-zA-Z0-9_]*$", value):
        raise ValueError(f"Invalid SQL identifier: {value}")

    return value


def sanitize_email_header(value: str) -> str:
    """
    Sanitize an email header value to prevent header injection.

    Args:
        value: The email header value to sanitize

    Returns:
        Sanitized header value
    """
    # Remove newlines and carriage returns (prevents header injection)
    value = re.sub(r"[\r\n]", "", value)

    # Remove null bytes
    value = value.replace("\x00", "")

    return value.strip()

def sanitize_column_name(raw: str) -> str:
    """
    Standardized column sanitization for ingestion.
    - Strip whitespace
    - Replace all non-alphanumeric (except underscore) with underscore
    - Collapse consecutive underscores
    - Lowercase
    - Prefix 'col_' if it starts with a digit
    """
    if not raw:
        return "col_unnamed"

    # Strip and lowercase
    val = raw.strip().lower()

    # Replace non-alphanumeric (except underscore) with underscore
    val = re.sub(r"[^a-z0-9_]", "_", val)

    # Collapse consecutive underscores
    val = re.sub(r"_+", "_", val)

    # Trim underscores from ends
    val = val.strip("_")

    if not val:
        return "col_unnamed"

    # Prefix if it starts with a digit
    if val[0].isdigit():
        val = f"col_{val}"

    return val
