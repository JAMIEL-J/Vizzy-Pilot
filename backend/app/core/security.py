"""
Security and authentication module.

Belongs to: core layer
Responsibility: JWT auth, token management, role verification, password hashing
Restrictions: No business logic, no datasets, no analytics
"""

from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Annotated, Callable, Optional

from fastapi import Depends, Header, Query
from jose import JWTError, jwt
import bcrypt
from pydantic import BaseModel

from .config import get_settings
from .exceptions import AuthenticationError, AuthorizationError


def hash_password(password: str) -> str:
    """
    Hash a plain-text password using bcrypt.
    """
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify a plain-text password against a hashed password.
    """
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))


class UserRole(str, Enum):
    """User role definitions."""

    USER = "user"
    ADMIN = "admin"


class TokenData(BaseModel):
    """Token payload data."""

    user_id: str
    role: UserRole
    exp: datetime


class CurrentUser(BaseModel):
    """Authenticated user context."""

    user_id: str
    role: UserRole


def create_access_token(
    user_id: str,
    role: UserRole,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """
    Create a JWT access token.
    """
    settings = get_settings()

    expire = datetime.now(timezone.utc) + (
        expires_delta
        if expires_delta
        else timedelta(minutes=settings.auth.access_token_expire_minutes)
    )

    payload = {
        "sub": user_id,
        "role": role.value,
        "exp": int(expire.timestamp()),  # FIX: exp as UNIX timestamp
        "type": "access",
    }

    secret = settings.auth.secret_key.get_secret_value() if settings.auth.secret_key else None
    if not secret:
        raise AuthenticationError("JWT secret key not configured. Set AUTH_SECRET_KEY env var.")

    return jwt.encode(
        payload,
        secret,
        algorithm=settings.auth.algorithm,
    )


def create_refresh_token(
    user_id: str,
    role: UserRole,
) -> str:
    """
    Create a JWT refresh token.
    """
    settings = get_settings()

    expire = datetime.now(timezone.utc) + timedelta(
        days=settings.auth.refresh_token_expire_days
    )

    payload = {
        "sub": user_id,
        "role": role.value,
        "exp": int(expire.timestamp()),  # FIX: exp as UNIX timestamp
        "type": "refresh",
    }

    secret = settings.auth.secret_key.get_secret_value() if settings.auth.secret_key else None
    if not secret:
        raise AuthenticationError("JWT secret key not configured. Set AUTH_SECRET_KEY env var.")

    return jwt.encode(
        payload,
        secret,
        algorithm=settings.auth.algorithm,
    )


def verify_token(token: str, token_type: str = "access") -> TokenData:
    """
    Verify and decode a JWT token.
    """
    settings = get_settings()

    secret = settings.auth.secret_key.get_secret_value() if settings.auth.secret_key else None
    if not secret:
        raise AuthenticationError("JWT secret key not configured. Set AUTH_SECRET_KEY env var.")

    try:
        payload = jwt.decode(
            token,
            secret,
            algorithms=[settings.auth.algorithm],
        )
    except JWTError as e:
        raise AuthenticationError("Invalid token", details=str(e))

    if payload.get("type") != token_type:
        raise AuthenticationError(
            message=f"Invalid token type, expected {token_type}"
        )

    user_id = payload.get("sub")
    role_str = payload.get("role")
    exp = payload.get("exp")

    if not user_id or not role_str or not exp:
        raise AuthenticationError("Invalid token payload")

    try:
        role = UserRole(role_str)
    except ValueError:
        raise AuthenticationError("Invalid role in token")

    exp_dt = datetime.fromtimestamp(exp, tz=timezone.utc)

    # FIX: explicit expiration check
    if datetime.now(timezone.utc) > exp_dt:
        raise AuthenticationError("Token expired")

    return TokenData(
        user_id=user_id,
        role=role,
        exp=exp_dt,
    )


def _populate_user_llm_settings(user_id: str) -> None:
    """Best-effort loading of user LLM settings into ContextVar."""
    try:
        from sqlmodel import Session, select
        from app.models.database import engine
        from app.models.user import User
        from app.core.crypto import active_llm_config
        from uuid import UUID
        import json
        
        with Session(engine) as session:
            db_user = session.exec(select(User).where(User.id == UUID(user_id))).first()
            if db_user and db_user.llm_settings:
                try:
                    config_dict = json.loads(db_user.llm_settings)
                    active_llm_config.set(config_dict)
                except Exception:
                    pass
    except Exception:
        pass


async def get_current_user(
    authorization: Optional[str] = Header(default=None),
) -> CurrentUser:
    """
    FastAPI dependency to get current authenticated user.
    """
    # FIX: explicit missing-header handling
    if not authorization:
        raise AuthenticationError("Authorization header missing")

    if not authorization.startswith("Bearer "):
        raise AuthenticationError("Invalid authorization header format")

    token = authorization[7:]
    token_data = verify_token(token)

    _populate_user_llm_settings(token_data.user_id)

    return CurrentUser(
        user_id=token_data.user_id,
        role=token_data.role,
    )


async def get_current_user_from_header_or_query(
    authorization: Optional[str] = Header(default=None),
    access_token: Optional[str] = Query(default=None, alias="access_token"),
) -> CurrentUser:
    """
    Resolve the current user from Authorization header or access_token query param.
    Used for EventSource endpoints where custom headers are not allowed.
    """
    token: Optional[str] = None

    if authorization:
        if not authorization.startswith("Bearer "):
            raise AuthenticationError("Invalid authorization header format")
        token = authorization[7:]
    elif access_token:
        token = access_token
    else:
        raise AuthenticationError("Authorization header missing")

    token_data = verify_token(token)

    _populate_user_llm_settings(token_data.user_id)

    return CurrentUser(
        user_id=token_data.user_id,
        role=token_data.role,
    )



def require_role(required_role: UserRole) -> Callable:
    """
    Create a dependency that requires a specific role.
    """

    async def role_checker(
        current_user: Annotated[CurrentUser, Depends(get_current_user)],
    ) -> CurrentUser:
        if current_user.role == UserRole.ADMIN:
            return current_user

        if current_user.role != required_role:
            raise AuthorizationError(
                message="Insufficient permissions",
                details=f"Required role: {required_role.value}",
            )

        return current_user

    return role_checker


def verify_resource_ownership(
    resource_owner_id: str,
    current_user: CurrentUser,
) -> None:
    """
    Verify that the current user owns the resource or is admin.
    """
    if current_user.role == UserRole.ADMIN:
        return

    if current_user.user_id != resource_owner_id:
        raise AuthorizationError(
            message="Access denied",
            details="You do not have access to this resource",
        )
