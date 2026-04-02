"""
Centralized application logging module.

Belongs to: core layer
Responsibility: Structured logging configuration
Restrictions: No business logic, no datasets, no analytics
"""

import json
import logging
import re
import sys
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from .config import get_settings


class StructuredFormatter(logging.Formatter):
    """Custom formatter for structured log output."""

    def format(self, record: logging.LogRecord) -> str:
        """Format log record with structured fields."""
        timestamp = datetime.now(timezone.utc).isoformat()
        
        log_data: Dict[str, Any] = {
            "timestamp": timestamp,
            "level": record.levelname,
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
            "message": record.getMessage(),
        }

        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)

        extra_fields = {
            key: value
            for key, value in record.__dict__.items()
            if key not in {
                "name", "msg", "args", "created", "filename", "funcName",
                "levelname", "levelno", "lineno", "module", "msecs",
                "pathname", "process", "processName", "relativeCreated",
                "stack_info", "exc_info", "exc_text", "thread", "threadName",
                "taskName", "message",
            }
        }
        
        if extra_fields:
            log_data["extra"] = extra_fields

        return json.dumps(log_data, default=str)


class SensitiveDataFilter(logging.Filter):
    """Filter to prevent logging of sensitive data."""

    SENSITIVE_KEYS = frozenset({
        "password",
        "secret",
        "token",
        "api_key",
        "apikey",
        "authorization",
        "cookie",
        "session",
        "credential",
        "private_key",
    })

    _ASSIGNMENT_PATTERNS = tuple(
        re.compile(rf"(?<![A-Za-z0-9_]){re.escape(key)}\s*=", re.IGNORECASE)
        for key in SENSITIVE_KEYS
    )

    def filter(self, record: logging.LogRecord) -> bool:
        """Filter out records containing sensitive data patterns."""
        message = record.getMessage()
        
        for pattern in self._ASSIGNMENT_PATTERNS:
            if pattern.search(message):
                record.msg = self._redact_message(record.msg)
                # Clear formatting args because message no longer contains placeholders.
                record.args = ()
                break
        
        return True

    def _redact_message(self, message: str) -> str:
        """Redact potential sensitive values from message."""
        return "[REDACTED - potential sensitive data]"


def setup_logger(
    name: str,
    level: Optional[str] = None,
) -> logging.Logger:
    """
    Set up and return a configured logger instance.

    Args:
        name: Logger name (typically __name__ of calling module)
        level: Optional override for log level

    Returns:
        Configured logger instance
    """
    settings = get_settings()
    
    logger = logging.getLogger(name)
    
    if logger.handlers:
        return logger
    
    log_level = level or settings.log_level
    logger.setLevel(getattr(logging, log_level.upper()))
    
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(getattr(logging, log_level.upper()))
    
    formatter = StructuredFormatter()
    console_handler.setFormatter(formatter)
    
    sensitive_filter = SensitiveDataFilter()
    console_handler.addFilter(sensitive_filter)
    
    logger.addHandler(console_handler)
    logger.propagate = False
    
    return logger


def get_logger(name: str) -> logging.Logger:
    """
    Get or create a logger with the given name.

    Args:
        name: Logger name (typically __name__ of calling module)

    Returns:
        Configured logger instance
    """
    return setup_logger(name)


app_logger = setup_logger("vizzy")
