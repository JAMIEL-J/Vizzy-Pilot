"""
API rate limiting module.

Belongs to: core layer
Responsibility: Request rate limiting per user
Restrictions: No business logic, no datasets, no analytics
"""

import time
from collections import defaultdict
from threading import Lock
from typing import Dict, List

from fastapi import Depends
from slowapi import Limiter
from slowapi.util import get_remote_address

from .config import get_settings
from .exceptions import RateLimitExceeded
from .security import CurrentUser, UserRole, get_current_user


class RateLimitStore:
    """In-memory rate limit tracking store."""

    def __init__(self) -> None:
        self._requests: Dict[str, List[float]] = defaultdict(list)
        self._lock = Lock()

    def record_request(
        self,
        user_id: str,
        window_seconds: int,
        max_requests: int,
    ) -> bool:
        """
        Record a request and check if limit exceeded.
        Returns True if request is allowed, False otherwise.
        """
        now = time.time()
        cutoff = now - window_seconds

        with self._lock:
            self._requests[user_id] = [
                ts for ts in self._requests[user_id] if ts > cutoff
            ]

            if len(self._requests[user_id]) >= max_requests:
                return False

            self._requests[user_id].append(now)
            return True

    def get_remaining(
        self,
        user_id: str,
        window_seconds: int,
        max_requests: int,
    ) -> int:
        """Get remaining requests for user in current window."""
        now = time.time()
        cutoff = now - window_seconds

        with self._lock:
            recent = [ts for ts in self._requests[user_id] if ts > cutoff]
            return max(0, max_requests - len(recent))

    def reset(self, user_id: str) -> None:
        """Clear rate limit data for a user."""
        with self._lock:
            self._requests.pop(user_id, None)


_store = RateLimitStore()


def get_rate_limit_store() -> RateLimitStore:
    """Get the rate limit store instance."""
    return _store


class RateLimiter:
    """Rate limiter with configurable limits per role."""

    def __init__(
        self,
        requests_per_minute: int,
        admin_multiplier: int = 10,
    ) -> None:
        self.requests_per_minute = requests_per_minute
        self.admin_multiplier = admin_multiplier
        self.window_seconds = 60

    def check(self, user: CurrentUser, store: RateLimitStore) -> None:
        """
        Check rate limit for user.
        Raises RateLimitExceeded if exceeded.
        """
        if user.role == UserRole.ADMIN:
            max_requests = self.requests_per_minute * self.admin_multiplier
        else:
            max_requests = self.requests_per_minute

        allowed = store.record_request(
            user_id=user.user_id,
            window_seconds=self.window_seconds,
            max_requests=max_requests,
        )

        if not allowed:
            remaining = store.get_remaining(
                user_id=user.user_id,
                window_seconds=self.window_seconds,
                max_requests=max_requests,
            )
            raise RateLimitExceeded(
                message="Rate limit exceeded",
                details=f"Remaining requests: {remaining}",
            )


def get_rate_limiter() -> RateLimiter:
    """Get configured rate limiter from settings."""
    settings = get_settings()

    if not settings.rate_limit.enabled:
        return RateLimiter(requests_per_minute=10**9)

    return RateLimiter(
        requests_per_minute=settings.rate_limit.requests_per_minute,
    )


def check_rate_limit(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    """
    Enforce rate limiting for the given user.
    Intended to be used as a dependency after authentication.
    """
    settings = get_settings()

    if not settings.rate_limit.enabled:
        return current_user

    limiter = get_rate_limiter()
    store = get_rate_limit_store()

    limiter.check(current_user, store)

    return current_user


# --- Brute-force protection for login attempts ---

MAX_FAILED_ATTEMPTS = 5
LOCKOUT_DURATION_SECONDS = 15 * 60  # 15 minutes


class LoginAttemptStore:
    """
    Track failed login attempts per email address to prevent brute-force attacks.
    
    After MAX_FAILED_ATTEMPTS consecutive failures, the account is locked for
    LOCKOUT_DURATION_SECONDS (15 minutes).
    """

    def __init__(self) -> None:
        # Maps email -> list of (timestamp, success: bool)
        self._attempts: Dict[str, list[tuple[float, bool]]] = defaultdict(list)
        self._lock = Lock()

    def record(self, email: str, success: bool) -> None:
        """Record a login attempt (success or failure)."""
        now = time.time()
        with self._lock:
            self._attempts[email].append((now, success))
            # Keep only attempts from the last hour
            self._attempts[email] = [
                (ts, s) for ts, s in self._attempts[email]
                if now - ts < 3600
            ]

    def is_locked(self, email: str) -> bool:
        """Check if an email is currently locked due to too many failures."""
        now = time.time()
        with self._lock:
            attempts = self._attempts.get(email, [])
            # Count consecutive failures (no success in the last hour)
            failures = [ts for ts, s in attempts if not s and now - ts < LOCKOUT_DURATION_SECONDS]
            return len(failures) >= MAX_FAILED_ATTEMPTS

    def get_lockout_remaining(self, email: str) -> int:
        """Get seconds remaining for lockout, or 0 if not locked."""
        now = time.time()
        with self._lock:
            attempts = self._attempts.get(email, [])
            failures = [ts for ts, s in attempts if not s and now - ts < LOCKOUT_DURATION_SECONDS]
            if len(failures) < MAX_FAILED_ATTEMPTS:
                return 0
            # Return time until oldest failure expires
            oldest = min(failures)
            remaining = LOCKOUT_DURATION_SECONDS - (now - oldest)
            return max(0, int(remaining))

    def clear(self, email: str) -> None:
        """Clear all attempts for an email (called on successful login)."""
        with self._lock:
            self._attempts.pop(email, None)


_login_attempt_store = LoginAttemptStore()


def get_login_attempt_store() -> LoginAttemptStore:
    """Get the login attempt store instance."""
    return _login_attempt_store


# --- slowapi Limiter (middleware) ---
# Defined here instead of main.py to avoid circular imports with auth_routes.py

_settings = get_settings()
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["100/hour"],
    storage_uri="redis://localhost:6379" if _settings.is_production else None,
)
