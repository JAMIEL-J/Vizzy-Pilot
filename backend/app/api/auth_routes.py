from fastapi import APIRouter, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr, Field

from app.api.deps import DBSession
from app.services.user_services import get_user_by_email, create_user
from app.models.user import UserRole
from app.core.security import (
    create_access_token,
    create_refresh_token,
    verify_token,
    hash_password,
    verify_password,
    UserRole as SecurityUserRole,
)
from app.core.input_validation import validate_password_strength
from app.core.rate_limit import get_login_attempt_store, limiter
from app.core.audit import record_audit_event



router = APIRouter()


class RegisterRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class AccessTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class MessageResponse(BaseModel):
    message: str


@router.post("/register", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/hour")
def register(
    request: Request,
    reg_request: RegisterRequest,
    session: DBSession,
) -> MessageResponse:
    """
    Register a new user (PUBLIC - no auth required).
    """
    # Check if user exists
    existing = get_user_by_email(session, reg_request.email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )
    
    # Validate password strength
    is_strong, error_msg = validate_password_strength(reg_request.password)
    if not is_strong:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Weak password: {error_msg}",
        )
    
    # Create user
    hashed = hash_password(reg_request.password)
    user = create_user(
        session=session,
        email=reg_request.email,
        hashed_password=hashed,
        name=reg_request.name,
        role=UserRole.USER,
    )
    
    record_audit_event(
        event_type="USER_REGISTERED",
        user_id=str(user.id),
        metadata={"email": reg_request.email, "name": reg_request.name},
    )
    
    return MessageResponse(message="Registration successful")



@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
def login(
    request: Request,
    login_request: LoginRequest,
    session: DBSession,
) -> TokenResponse:
    """
    Authenticate user and issue tokens (PUBLIC - no auth required).
    This is the generic login endpoint. Consider using /login/user or /login/admin.
    """
    attempt_store = get_login_attempt_store()
    email = login_request.email.lower().strip()
    client_ip = request.client.host if request.client else "127.0.0.1"
    lockout_key = f"{client_ip}:{email}"
    
    # Check if account is locked due to brute-force
    if attempt_store.is_locked(lockout_key):
        remaining = attempt_store.get_lockout_remaining(lockout_key)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Account temporarily locked due to too many failed attempts. Try again in {remaining} seconds.",
        )
    
    user = get_user_by_email(session, login_request.email)
    
    if not user or not user.is_active:
        attempt_store.record(lockout_key, success=False)
        record_audit_event(
            event_type="LOGIN_FAILED",
            user_id="unknown",
            metadata={"email": email, "reason": "user_not_found_or_inactive"},
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )
    
    if not verify_password(login_request.password, user.hashed_password):
        attempt_store.record(lockout_key, success=False)
        record_audit_event(
            event_type="LOGIN_FAILED",
            user_id=str(user.id),
            metadata={"email": email, "reason": "invalid_password"},
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )
    
    # Successful login - clear failed attempts
    attempt_store.record(lockout_key, success=True)
    attempt_store.clear(lockout_key)
    
    access_token = create_access_token(
        user_id=str(user.id),
        role=SecurityUserRole(user.role.value),
    )
    
    refresh_token = create_refresh_token(
        user_id=str(user.id),
        role=SecurityUserRole(user.role.value),
    )
    
    record_audit_event(
        event_type="USER_LOGIN",
        user_id=str(user.id),
        metadata={"email": user.email},
    )
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
    )



@router.post("/login/user", response_model=TokenResponse)
@limiter.limit("10/minute")
def login_user(
    request: Request,
    login_request: LoginRequest,
    session: DBSession,
) -> TokenResponse:
    """
    Authenticate a standard user and issue tokens (PUBLIC - no auth required).
    Only allows users with role USER.
    """
    attempt_store = get_login_attempt_store()
    email = login_request.email.lower().strip()
    client_ip = request.client.host if request.client else "127.0.0.1"
    lockout_key = f"{client_ip}:{email}"
    
    if attempt_store.is_locked(lockout_key):
        remaining = attempt_store.get_lockout_remaining(lockout_key)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Account temporarily locked due to too many failed attempts. Try again in {remaining} seconds.",
        )
    
    user = get_user_by_email(session, login_request.email)
    
    if not user or not user.is_active:
        attempt_store.record(lockout_key, success=False)
        record_audit_event(
            event_type="LOGIN_FAILED",
            user_id="unknown",
            metadata={"email": email, "reason": "user_not_found_or_inactive", "login_type": "user"},
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )
    
    if not verify_password(login_request.password, user.hashed_password):
        attempt_store.record(lockout_key, success=False)
        record_audit_event(
            event_type="LOGIN_FAILED",
            user_id=str(user.id),
            metadata={"email": email, "reason": "invalid_password", "login_type": "user"},
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )
    
    # Check role - must be USER
    if user.role != UserRole.USER:
        attempt_store.record(lockout_key, success=False)
        record_audit_event(
            event_type="LOGIN_FAILED",
            user_id=str(user.id),
            metadata={"email": email, "reason": "wrong_role", "login_type": "user"},
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. This login is for standard users only.",
        )
    
    attempt_store.record(lockout_key, success=True)
    attempt_store.clear(lockout_key)
    
    access_token = create_access_token(
        user_id=str(user.id),
        role=SecurityUserRole(user.role.value),
    )
    
    refresh_token = create_refresh_token(
        user_id=str(user.id),
        role=SecurityUserRole(user.role.value),
    )
    
    record_audit_event(
        event_type="USER_LOGIN",
        user_id=str(user.id),
        metadata={"email": user.email, "login_type": "user"},
    )
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
    )



@router.post("/login/admin", response_model=TokenResponse)
@limiter.limit("10/minute")
def login_admin(
    request: Request,
    login_request: LoginRequest,
    session: DBSession,
) -> TokenResponse:
    """
    Authenticate an admin user and issue tokens (PUBLIC - no auth required).
    Only allows users with role ADMIN.
    """
    attempt_store = get_login_attempt_store()
    email = login_request.email.lower().strip()
    client_ip = request.client.host if request.client else "127.0.0.1"
    lockout_key = f"{client_ip}:{email}"
    
    if attempt_store.is_locked(lockout_key):
        remaining = attempt_store.get_lockout_remaining(lockout_key)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Account temporarily locked due to too many failed attempts. Try again in {remaining} seconds.",
        )
    
    user = get_user_by_email(session, login_request.email)
    
    if not user or not user.is_active:
        attempt_store.record(lockout_key, success=False)
        record_audit_event(
            event_type="LOGIN_FAILED",
            user_id="unknown",
            metadata={"email": email, "reason": "user_not_found_or_inactive", "login_type": "admin"},
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )
    
    if not verify_password(login_request.password, user.hashed_password):
        attempt_store.record(lockout_key, success=False)
        record_audit_event(
            event_type="LOGIN_FAILED",
            user_id=str(user.id),
            metadata={"email": email, "reason": "invalid_password", "login_type": "admin"},
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )
    
    # Check role - must be ADMIN
    if user.role != UserRole.ADMIN:
        attempt_store.record(lockout_key, success=False)
        record_audit_event(
            event_type="LOGIN_FAILED",
            user_id=str(user.id),
            metadata={"email": email, "reason": "wrong_role", "login_type": "admin"},
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. This login is for administrators only.",
        )
    
    attempt_store.record(lockout_key, success=True)
    attempt_store.clear(lockout_key)
    
    access_token = create_access_token(
        user_id=str(user.id),
        role=SecurityUserRole(user.role.value),
    )
    
    refresh_token = create_refresh_token(
        user_id=str(user.id),
        role=SecurityUserRole(user.role.value),
    )
    
    record_audit_event(
        event_type="ADMIN_LOGIN",
        user_id=str(user.id),
        metadata={"email": user.email, "login_type": "admin"},
    )
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
    )



@router.post("/refresh", response_model=AccessTokenResponse)
@limiter.limit("20/minute")
def refresh_token_endpoint(
    request: Request,
    refresh_request: RefreshRequest,
) -> AccessTokenResponse:
    """
    Issue a new access token using a refresh token.
    """
    try:
        token_data = verify_token(refresh_request.refresh_token, token_type="refresh")
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )
    
    access_token = create_access_token(
        user_id=token_data.user_id,
        role=token_data.role,
    )
    
    record_audit_event(
        event_type="TOKEN_REFRESHED",
        user_id=token_data.user_id,
    )
    
    return AccessTokenResponse(access_token=access_token)

