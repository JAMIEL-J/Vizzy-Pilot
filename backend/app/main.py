"""
Vizzy Analytics Platform API

A production-grade, trust-first analytics system.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded


from app.core.config import get_settings
from app.core.logger import get_logger
from app.core.exceptions import (
    VizzyException,
    AuthenticationError,
    AuthorizationError,
    ResourceNotFound,
    InvalidOperation,
    RateLimitExceeded,
)
from app.api.router import api_router

logger = get_logger(__name__)
settings = get_settings()

import time


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Middleware to log HTTP request method, path, status code, and latency."""
    async def dispatch(self, request: Request, call_next):
        start_time = time.perf_counter()
        response = await call_next(request)
        process_time = (time.perf_counter() - start_time) * 1000
        msg = f"[HTTP] {request.method} {request.url.path} -> {response.status_code} ({process_time:.1f}ms)"
        print(msg, flush=True)
        logger.info(msg)
        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Middleware to add security headers to all responses.
    - CSP: Content Security Policy
    - HSTS: HTTP Strict Transport Security
    - X-Frame-Options: Prevent clickjacking
    - X-Content-Type-Options: Prevent MIME sniffing
    - Referrer-Policy: Control referrer information
    """
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        
        # Content Security Policy (CSP)
        sse_origin = settings.sse_origin
        connect_src_extra = f" {sse_origin}" if sse_origin else ""
        csp = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data:; "
            f"connect-src 'self' https://*.groq.com https://*.google.com{connect_src_extra}; "
            "frame-ancestors 'none';"
        )
        
        response.headers["Content-Security-Policy"] = csp
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        
        return response

# Rate limiting — imported from core module to avoid circular imports with auth_routes
from app.core.rate_limit import limiter

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    # Validate SQLite path at startup (fail-fast for security)
    if settings.database.is_sqlite:
        from app.core.config import _validate_sqlite_path
        try:
            validated_path = _validate_sqlite_path(
                settings.database.sqlite_path,
                settings.database.data_dir
            )
            # Log resolved path for debugging (only in non-production)
            if not settings.is_production:
                logger.debug(f"SQLite path validated: {validated_path}")
        except Exception as e:
            logger.error(f"FATAL: Invalid SQLite database path: {e}")
            raise RuntimeError(f"Invalid SQLite database path: {e}") from e
    
    # Initialize database tables
    from app.models.database import init_db
    init_db()
    logger.info("Database tables initialized")
    
    logger.info(f"Starting {settings.app_name} v{settings.app_version}")
    logger.info(f"Environment: {settings.environment}")
    yield
    logger.info("Shutting down...")


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Production-grade, trust-first analytics platform",
    docs_url="/docs" if settings.is_development else None,
    redoc_url="/redoc" if settings.is_development else None,
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Request Logging Middleware (logs method, path, status, latency)
app.add_middleware(RequestLoggingMiddleware)

# Security Headers Middleware
app.add_middleware(SecurityHeadersMiddleware)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=settings.cors_allow_credentials,
    allow_methods=settings.cors_allow_methods,
    allow_headers=settings.cors_allow_headers,
)

# CSRF middleware (runs AFTER CORS handles preflight — order is LIFO in Starlette)
from app.core.csrf import CSRFMiddleware
app.add_middleware(CSRFMiddleware)


# Exception handlers
@app.exception_handler(AuthenticationError)
async def authentication_error_handler(request: Request, exc: AuthenticationError):
    return JSONResponse(
        status_code=401,
        content={"detail": exc.message},
    )


@app.exception_handler(AuthorizationError)
async def authorization_error_handler(request: Request, exc: AuthorizationError):
    return JSONResponse(
        status_code=403,
        content={"detail": exc.message},
    )


@app.exception_handler(ResourceNotFound)
async def not_found_handler(request: Request, exc: ResourceNotFound):
    return JSONResponse(
        status_code=404,
        content={"detail": exc.message},
    )


@app.exception_handler(InvalidOperation)
async def invalid_operation_handler(request: Request, exc: InvalidOperation):
    return JSONResponse(
        status_code=400,
        content={"detail": exc.message, "reason": exc.reason},
    )


@app.exception_handler(RateLimitExceeded)
async def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": exc.message},
    )


@app.exception_handler(VizzyException)
async def app_exception_handler(request: Request, exc: VizzyException):
    return JSONResponse(
        status_code=500,
        content={"detail": exc.message},
    )


# Health check
@app.get("/health")
async def health_check():
    return {"status": "healthy", "app": settings.app_name}


# Include API router
app.include_router(api_router, prefix=settings.api_prefix)
