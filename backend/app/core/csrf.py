"""
CSRF protection middleware.

Belongs to: core layer
Responsibility: Validate CSRF tokens for cookie-authenticated state-changing requests
Restrictions: No business logic, no database access
"""

import hmac

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware


# Methods that never mutate state — exempt from CSRF
_SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})

# Auth endpoints that SET cookies — exempt because they cannot be
# exploited by CSRF (the attacker doesn't have the credentials to POST)
_EXEMPT_PATHS = frozenset({
    "/api/v1/auth/login",
    "/api/v1/auth/login/user",
    "/api/v1/auth/login/admin",
    "/api/v1/auth/register",
    "/api/v1/auth/refresh",
})


class CSRFMiddleware(BaseHTTPMiddleware):
    """
    Double-submit cookie CSRF protection.

    On state-changing requests (POST, PUT, PATCH, DELETE):
    - If the request has NO access_token cookie → unauthenticated, skip CSRF
    - If the request has an access_token cookie → require csrf_token cookie
      AND X-CSRF-Token header to match (constant-time comparison)
    """

    async def dispatch(self, request: Request, call_next):
        method = request.method.upper()

        # Safe methods are always allowed
        if method in _SAFE_METHODS:
            return await call_next(request)

        # Exempt auth endpoints
        path = request.url.path.rstrip("/")
        if path in _EXEMPT_PATHS:
            return await call_next(request)

        # Only enforce CSRF when the request is cookie-authenticated
        access_cookie = request.cookies.get("access_token")
        if not access_cookie:
            # No cookie auth → header/query auth, not vulnerable to CSRF
            return await call_next(request)

        # Cookie-authenticated request — enforce double-submit
        csrf_cookie = request.cookies.get("csrf_token")
        csrf_header = request.headers.get("x-csrf-token")

        if not csrf_cookie or not csrf_header:
            return JSONResponse(
                status_code=403,
                content={"detail": "CSRF token missing"},
            )

        if not hmac.compare_digest(csrf_cookie, csrf_header):
            return JSONResponse(
                status_code=403,
                content={"detail": "CSRF token mismatch"},
            )

        return await call_next(request)
