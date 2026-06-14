"""
API rate limiting module.

Belongs to: core layer
Responsibility: Request rate limiting per user
Restrictions: No business logic, no datasets, no analytics
"""

import os
import time
from collections import defaultdict
from threading import Lock
from typing import Dict, List

import redis
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
    Track failed login attempts per email/IP combo and per global IP using Redis,
    with an in-memory fallback.
    
    After MAX_FAILED_ATTEMPTS consecutive failures for a combo, it is locked for 15 minutes.
    After 20 failed attempts from the same IP globally, the IP is locked for 1 hour.
    """

    def __init__(self) -> None:
        self.redis_client = None
        self._fallback_combo: Dict[str, tuple[int, float]] = {}  # combo_key -> (count, expires_at)
        self._fallback_ip: Dict[str, tuple[int, float]] = {}     # ip_key -> (count, expires_at)
        self._lock = Lock()
        
        settings = get_settings()
        # Redis connection setup
        redis_url = os.environ.get("REDIS_URL") or "redis://localhost:6379"
        try:
            self.redis_client = redis.Redis.from_url(redis_url, decode_responses=True)
            self.redis_client.ping()
        except Exception:
            self.redis_client = None

    def record(self, key: str, success: bool) -> None:
        """Record a login attempt (success or failure)."""
        if success:
            self.clear(key)
            return

        parts = key.split(":", 1)
        client_ip = parts[0] if parts else "127.0.0.1"

        combo_key = f"login_attempt:combo:{key}"
        ip_key = f"login_attempt:global_ip:{client_ip}"

        if self.redis_client:
            try:
                # Increment combo failed count
                val = self.redis_client.incr(combo_key)
                if val == 1:
                    self.redis_client.expire(combo_key, 15 * 60) # 15 minutes

                # Increment global IP failed count
                ip_val = self.redis_client.incr(ip_key)
                if ip_val == 1:
                    self.redis_client.expire(ip_key, 3600) # 1 hour
                return
            except Exception:
                pass

        # Fallback to in-memory dictionary
        with self._lock:
            now = time.time()
            self._clean_expired_fallback(now)

            # Record combo failure
            count, exp = self._fallback_combo.get(combo_key, (0, now + 15 * 60))
            self._fallback_combo[combo_key] = (count + 1, exp)

            # Record global IP failure
            ip_count, ip_exp = self._fallback_ip.get(ip_key, (0, now + 3600))
            self._fallback_ip[ip_key] = (ip_count + 1, ip_exp)

    def is_locked(self, key: str) -> bool:
        """Check if email/IP combo or the global IP is currently locked."""
        parts = key.split(":", 1)
        client_ip = parts[0] if parts else "127.0.0.1"

        combo_key = f"login_attempt:combo:{key}"
        ip_key = f"login_attempt:global_ip:{client_ip}"

        if self.redis_client:
            try:
                # Check combo lock
                val = self.redis_client.get(combo_key)
                if val and int(val) >= 5:
                    return True

                # Check global IP lock
                ip_val = self.redis_client.get(ip_key)
                if ip_val and int(ip_val) >= 20:
                    return True

                return False
            except Exception:
                pass

        # Fallback to in-memory dictionary
        with self._lock:
            now = time.time()
            self._clean_expired_fallback(now)

            # Check combo
            if combo_key in self._fallback_combo and self._fallback_combo[combo_key][0] >= 5:
                return True

            # Check global IP
            if ip_key in self._fallback_ip and self._fallback_ip[ip_key][0] >= 20:
                return True

            return False

    def get_lockout_remaining(self, key: str) -> int:
        """Get seconds remaining for lockout, or 0 if not locked."""
        parts = key.split(":", 1)
        client_ip = parts[0] if parts else "127.0.0.1"

        combo_key = f"login_attempt:combo:{key}"
        ip_key = f"login_attempt:global_ip:{client_ip}"

        if self.redis_client:
            try:
                # Check global IP lock first
                ip_val = self.redis_client.get(ip_key)
                if ip_val and int(ip_val) >= 20:
                    ttl = self.redis_client.ttl(ip_key)
                    return max(0, int(ttl))

                # Check combo lock
                val = self.redis_client.get(combo_key)
                if val and int(val) >= 5:
                    ttl = self.redis_client.ttl(combo_key)
                    return max(0, int(ttl))

                return 0
            except Exception:
                pass

        # Fallback to in-memory dictionary
        with self._lock:
            now = time.time()
            self._clean_expired_fallback(now)

            # Check global IP
            if ip_key in self._fallback_ip and self._fallback_ip[ip_key][0] >= 20:
                return max(0, int(self._fallback_ip[ip_key][1] - now))

            # Check combo
            if combo_key in self._fallback_combo and self._fallback_combo[combo_key][0] >= 5:
                return max(0, int(self._fallback_combo[combo_key][1] - now))

            return 0

    def clear(self, key: str) -> None:
        """Clear all combo attempts (called on successful login)."""
        combo_key = f"login_attempt:combo:{key}"
        if self.redis_client:
            try:
                self.redis_client.delete(combo_key)
                return
            except Exception:
                pass

        with self._lock:
            self._fallback_combo.pop(combo_key, None)

    def _clean_expired_fallback(self, now: float) -> None:
        """Clean up expired fallback entries."""
        self._fallback_combo = {
            k: (c, exp) for k, (c, exp) in self._fallback_combo.items() if exp > now
        }
        self._fallback_ip = {
            k: (c, exp) for k, (c, exp) in self._fallback_ip.items() if exp > now
        }


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
