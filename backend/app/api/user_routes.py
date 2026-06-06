"""
User management API routes.

Belongs to: API layer
Responsibility: HTTP interfaces for user operations
Restrictions: Thin controller - all logic delegated to services
"""

from typing import List, Optional
from uuid import UUID
from datetime import datetime

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr, Field

from app.api.deps import DBSession, AuthenticatedUser, AdminUser, RateLimitedUser
from app.services import user_services
from app.core.security import hash_password, UserRole
from app.core.exceptions import (
    ResourceNotFound,
    InvalidOperation,
)


router = APIRouter()


# =============================================================================
# Request/Response Schemas
# =============================================================================


class UserCreateRequest(BaseModel):
    """Request schema for user registration."""

    name: Optional[str] = Field(None, min_length=1, max_length=120, description="Display name")
    email: EmailStr = Field(..., description="User email address")
    password: str = Field(..., min_length=8, description="User password (min 8 chars)")
    role: Optional[UserRole] = Field(
        default=UserRole.USER,
        description="User role (admin-only field)",
    )


class UserUpdateRequest(BaseModel):
    """Request schema for updating user profile."""

    name: Optional[str] = Field(None, min_length=1, max_length=120, description="Display name")
    email: Optional[EmailStr] = Field(None, description="New email address")


class PasswordChangeRequest(BaseModel):
    """Request schema for password change."""

    current_password: str = Field(..., description="Current password")
    new_password: str = Field(..., min_length=8, description="New password (min 8 chars)")


class UserResponse(BaseModel):
    """User response schema - excludes sensitive fields."""

    id: UUID
    email: str
    name: Optional[str] = None
    role: UserRole
    is_active: bool
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class UserListResponse(BaseModel):
    """Response schema for user list."""

    users: List[UserResponse]
    total: int


class MessageResponse(BaseModel):
    """Generic message response."""

    message: str


class ProfileUsageItem(BaseModel):
    feature: str
    count: int


class MonthlyActivityItem(BaseModel):
    month: str
    datasets: int
    uploads: int
    saved_dashboards: int
    generated_dashboards: int
    chats: int
    analyses: int


class UserProfileStatsResponse(BaseModel):
    user: UserResponse
    totals: dict
    feature_usage: List[ProfileUsageItem]
    monthly_activity: List[MonthlyActivityItem]
    dataset_sources: dict


class LLMSettingResponse(BaseModel):
    """Masked user settings response."""
    provider: str
    has_openai_key: bool
    has_gemini_key: bool
    ollama_url: Optional[str] = "http://localhost:11434"
    ollama_model: Optional[str] = "llama3"


class LLMSettingUpdateRequest(BaseModel):
    """Settings update request."""
    provider: str
    openai_api_key: Optional[str] = None
    gemini_api_key: Optional[str] = None
    ollama_url: Optional[str] = "http://localhost:11434"
    ollama_model: Optional[str] = "llama3"


# =============================================================================
# Routes
# =============================================================================



@router.post(
    "",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user",
    description="Create a new user account. Admin users can set roles.",
)
def create_user(
    request: UserCreateRequest,
    session: DBSession,
    _: RateLimitedUser,
) -> UserResponse:
    """
    Register a new user.

    - **email**: Valid email address (must be unique)
    - **password**: Minimum 8 characters
    - **role**: Optional, defaults to USER
    """
    try:
        # Hash password before passing to service
        hashed_password = hash_password(request.password)

        user = user_services.create_user(
            session=session,
            name=request.name,
            email=request.email,
            hashed_password=hashed_password,
            role=request.role or UserRole.USER,
        )

        return UserResponse.model_validate(user)

    except InvalidOperation as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=e.message,
        )


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Get current user profile",
    description="Retrieve the authenticated user's profile.",
)
def get_current_user_profile(
    session: DBSession,
    current_user: AuthenticatedUser,
) -> UserResponse:
    """
    Get the currently authenticated user's profile.
    """
    try:
        user = user_services.get_user_by_id(
            session=session,
            user_id=UUID(current_user.user_id),
        )
        return UserResponse.model_validate(user)

    except ResourceNotFound as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=e.message,
        )


@router.patch(
    "/me",
    response_model=UserResponse,
    summary="Update current user profile",
    description="Update authenticated user's name and/or email.",
)
def update_current_user_profile(
    request: UserUpdateRequest,
    session: DBSession,
    current_user: AuthenticatedUser,
) -> UserResponse:
    """Update currently authenticated user profile details."""
    try:
        user = user_services.update_user_profile(
            session=session,
            user_id=UUID(current_user.user_id),
            name=request.name,
            email=request.email,
        )
        return UserResponse.model_validate(user)
    except ResourceNotFound as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=e.message,
        )
    except InvalidOperation as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=e.reason,
        )


@router.get(
    "/me/profile",
    response_model=UserProfileStatsResponse,
    summary="Get current user profile analytics",
    description="Retrieve profile KPIs and feature usage analytics for the authenticated user.",
)
def get_current_user_profile_stats(
    session: DBSession,
    current_user: AuthenticatedUser,
) -> UserProfileStatsResponse:
    try:
        data = user_services.get_user_profile_stats(
            session=session,
            user_id=UUID(current_user.user_id),
        )
        return UserProfileStatsResponse.model_validate(data)
    except ResourceNotFound as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=e.message,
        )


@router.get(
    "/me/llm-settings",
    response_model=LLMSettingResponse,
    summary="Get user's custom LLM settings",
)
def get_user_llm_settings(
    session: DBSession,
    current_user: AuthenticatedUser,
) -> LLMSettingResponse:
    import json
    
    user = user_services.get_user_by_id(
        session=session,
        user_id=UUID(current_user.user_id),
    )
    
    settings_dict = {}
    if user.llm_settings:
        try:
            settings_dict = json.loads(user.llm_settings)
        except Exception:
            pass
            
    openai_key_encrypted = settings_dict.get("openai_api_key")
    gemini_key_encrypted = settings_dict.get("gemini_api_key")
    
    has_openai = bool(openai_key_encrypted)
    has_gemini = bool(gemini_key_encrypted)
    
    return LLMSettingResponse(
        provider=settings_dict.get("provider", "default"),
        has_openai_key=has_openai,
        has_gemini_key=has_gemini,
        ollama_url=settings_dict.get("ollama_url", "http://localhost:11434"),
        ollama_model=settings_dict.get("ollama_model", "llama3"),
    )


@router.put(
    "/me/llm-settings",
    response_model=LLMSettingResponse,
    summary="Update user's custom LLM settings",
)
def update_user_llm_settings(
    request: LLMSettingUpdateRequest,
    session: DBSession,
    current_user: AuthenticatedUser,
) -> LLMSettingResponse:
    import json
    from app.core.crypto import encrypt_val
    
    user = user_services.get_user_by_id(
        session=session,
        user_id=UUID(current_user.user_id),
    )
    
    existing_settings = {}
    if user.llm_settings:
        try:
            existing_settings = json.loads(user.llm_settings)
        except Exception:
            pass

    openai_key = request.openai_api_key
    if openai_key == "********":
        encrypted_openai_key = existing_settings.get("openai_api_key") or ""
    elif openai_key:
        encrypted_openai_key = encrypt_val(openai_key)
    else:
        encrypted_openai_key = ""

    gemini_key = request.gemini_api_key
    if gemini_key == "********":
        encrypted_gemini_key = existing_settings.get("gemini_api_key") or ""
    elif gemini_key:
        encrypted_gemini_key = encrypt_val(gemini_key)
    else:
        encrypted_gemini_key = ""

    new_settings = {
        "provider": request.provider,
        "openai_api_key": encrypted_openai_key,
        "gemini_api_key": encrypted_gemini_key,
        "ollama_url": request.ollama_url or "http://localhost:11434",
        "ollama_model": request.ollama_model or "llama3",
    }
    
    user.llm_settings = json.dumps(new_settings)
    session.add(user)
    session.commit()
    session.refresh(user)
    
    return LLMSettingResponse(
        provider=new_settings["provider"],
        has_openai_key=bool(encrypted_openai_key),
        has_gemini_key=bool(encrypted_gemini_key),
        ollama_url=new_settings["ollama_url"],
        ollama_model=new_settings["ollama_model"],
    )


@router.get(

    "",
    response_model=UserListResponse,
    summary="List all users (Admin only)",
    description="Retrieve a list of all users. Requires admin privileges.",
)
def list_users(
    session: DBSession,
    _: AdminUser,
    skip: int = 0,
    limit: int = 100,
    include_inactive: bool = False,
) -> UserListResponse:
    """
    List all users in the system.

    - **skip**: Number of records to skip (pagination offset)
    - **limit**: Maximum number of records to return
    - **include_inactive**: Include deactivated users
    """
    users, total = user_services.list_users(
        session=session,
        skip=skip,
        limit=limit,
        include_inactive=include_inactive,
    )

    return UserListResponse(
        users=[UserResponse.model_validate(u) for u in users],
        total=total,
    )


@router.get(
    "/{user_id}",
    response_model=UserResponse,
    summary="Get user by ID (Admin only)",
    description="Retrieve a specific user by their ID. Requires admin privileges.",
)
def get_user(
    user_id: UUID,
    session: DBSession,
    _: AdminUser,
) -> UserResponse:
    """
    Get a user by their ID.
    """
    try:
        user = user_services.get_user_by_id(
            session=session,
            user_id=user_id,
        )
        return UserResponse.model_validate(user)

    except ResourceNotFound as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=e.message,
        )


@router.patch(
    "/{user_id}/activate",
    response_model=UserResponse,
    summary="Activate user (Admin only)",
    description="Activate a deactivated user account. Requires admin privileges.",
)
def activate_user(
    user_id: UUID,
    session: DBSession,
    _: AdminUser,
) -> UserResponse:
    """
    Activate a user account.
    """
    try:
        user = user_services.activate_user(
            session=session,
            user_id=user_id,
        )
        return UserResponse.model_validate(user)

    except ResourceNotFound as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=e.message,
        )


@router.patch(
    "/{user_id}/deactivate",
    response_model=UserResponse,
    summary="Deactivate user (Admin only)",
    description="Deactivate a user account. Requires admin privileges.",
)
def deactivate_user(
    user_id: UUID,
    session: DBSession,
    _: AdminUser,
) -> UserResponse:
    """
    Deactivate a user account.

    Deactivated users cannot log in until reactivated.
    """
    try:
        user = user_services.deactivate_user(
            session=session,
            user_id=user_id,
        )
        return UserResponse.model_validate(user)

    except ResourceNotFound as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=e.message,
        )


@router.delete(
    "/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete user (Admin only)",
    description="Permanently delete a user. Requires admin privileges.",
)
def delete_user(
    user_id: UUID,
    session: DBSession,
    admin_user: AdminUser,
) -> None:
    """
    Permanently delete a user.

    This is a destructive operation and cannot be undone.
    Consider using deactivate instead for soft deletion.
    """
    # Prevent self-deletion
    if str(user_id) == admin_user.user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete your own account",
        )

    try:
        user_services.delete_user(
            session=session,
            user_id=user_id,
        )

    except ResourceNotFound as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=e.message,
        )
