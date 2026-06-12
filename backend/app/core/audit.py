"""
Audit event recording module.

Belongs to: core layer
Responsibility: Audit event storage only
Restrictions: No business logic, no auth, no datasets, no analytics
"""

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class AuditEvent(BaseModel):
    """Immutable audit event record."""

    event_type: str
    user_id: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    resource_type: Optional[str] = None
    resource_id: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None


class AuditStore:
    """
    Append-only audit event store with file persistence.
    
    Events are written to both in-memory list and a JSON lines file
    so they survive restarts and can be shipped to a SIEM.
    """

    def __init__(self, log_path: str = "data/audit.log") -> None:
        self._events: List[AuditEvent] = []
        self._lock = Lock()
        self._log_path = Path(log_path)
        self._ensure_log_dir()

    def _ensure_log_dir(self) -> None:
        """Create log directory if it doesn't exist."""
        try:
            self._log_path.parent.mkdir(parents=True, exist_ok=True)
        except Exception:
            pass

    def append(self, event: AuditEvent) -> None:
        """Append event to store and flush to disk. Never raises."""
        with self._lock:
            self._events.append(event)
            self._flush_to_file(event)

    def _flush_to_file(self, event: AuditEvent) -> None:
        """Write a single event to the log file as JSON line."""
        try:
            with open(self._log_path, "a", encoding="utf-8") as f:
                f.write(event.model_dump_json() + "\n")
        except Exception:
            pass

    def get_all(self) -> List[AuditEvent]:
        """Return copy of all events."""
        with self._lock:
            return list(self._events)

    def get_by_user(self, user_id: str) -> List[AuditEvent]:
        """Return events for a specific user."""
        with self._lock:
            return [e for e in self._events if e.user_id == user_id]

    def get_by_resource(
        self,
        resource_type: str,
        resource_id: str,
    ) -> List[AuditEvent]:
        """Return events for a specific resource."""
        with self._lock:
            return [
                e for e in self._events
                if e.resource_type == resource_type and e.resource_id == resource_id
            ]

    def get_by_event_type(self, event_type: str) -> List[AuditEvent]:
        """Return events of a specific type."""
        with self._lock:
            return [e for e in self._events if e.event_type == event_type]

    def count(self) -> int:
        """Return total event count."""
        with self._lock:
            return len(self._events)


_store = AuditStore()


def get_audit_store() -> AuditStore:
    """Get the audit store instance."""
    return _store


def record_audit_event(
    event_type: str,
    user_id: str,
    resource_type: Optional[str] = None,
    resource_id: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> None:
    """
    Record an audit event. Never raises exceptions.
    Execution continues regardless of success or failure.
    """
    try:
        event = AuditEvent(
            event_type=event_type,
            user_id=user_id,
            resource_type=resource_type,
            resource_id=resource_id,
            metadata=metadata,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        store = get_audit_store()
        store.append(event)
    except Exception:
        pass