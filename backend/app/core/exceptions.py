"""
Custom exception classes.

Belongs to: core layer
Responsibility: Exception definitions only
Restrictions: No business logic, no HTTP handling, no logging
"""

from typing import Optional


class VizzyException(Exception):
    """Base exception for all application exceptions."""

    def __init__(self, message: str, details: Optional[str] = None) -> None:
        self.message = message
        self.details = details
        super().__init__(self.message)


class AuthenticationError(VizzyException):
    """Raised when authentication fails."""

    def __init__(
        self,
        message: str = "Authentication failed",
        details: Optional[str] = None,
    ) -> None:
        super().__init__(message, details)


class AuthorizationError(VizzyException):
    """Raised when user lacks required permissions."""

    def __init__(
        self,
        message: str = "Permission denied",
        details: Optional[str] = None,
    ) -> None:
        super().__init__(message, details)


class ResourceNotFound(VizzyException):
    """Raised when a requested resource does not exist."""

    def __init__(
        self,
        resource_type: str,
        resource_id: str,
        details: Optional[str] = None,
    ) -> None:
        message = f"{resource_type} with id '{resource_id}' not found"
        super().__init__(message, details)
        self.resource_type = resource_type
        self.resource_id = resource_id


class InvalidOperation(VizzyException):
    """Raised when an operation cannot be performed."""

    def __init__(
        self,
        operation: str,
        reason: str,
        details: Optional[str] = None,
    ) -> None:
        message = f"Cannot perform '{operation}': {reason}"
        super().__init__(message, details)
        self.operation = operation
        self.reason = reason

class RateLimitExceeded(VizzyException):
    """Raised when API rate limit is exceeded."""

class ValidationError(VizzyException):
    """Raised when input validation fails."""
