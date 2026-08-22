from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional

from pydantic import BaseModel, EmailStr, Field, computed_field, field_validator


class UserCreate(BaseModel):
    email: EmailStr
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=8)

    @field_validator("username")
    @classmethod
    def username_alphanumeric(cls, v: str) -> str:
        if not v.replace("_", "").replace("-", "").isalnum():
            raise ValueError("Username must be alphanumeric (underscores/hyphens allowed)")
        return v.lower()


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    email: str
    username: str
    is_active: bool
    is_superuser: bool
    role: str
    avatar_url: Optional[str] = None
    preferences: Optional[Dict[str, Any]] = None
    created_at: datetime
    updated_at: datetime

    @computed_field  # type: ignore[prop-decorator]
    @property
    def is_admin(self) -> bool:
        """Wire alias for `is_superuser`.

        The admin endpoints already serialise the flag as `is_admin`, and the
        frontend gates the Admin nav item and the /admin route on
        `user.is_admin`. Without this the admin UI is unreachable in live mode
        even for a superuser.
        """
        return self.is_superuser


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    # The login response carries the authenticated user: the frontend auth
    # store reads `{ user, access_token }` straight off the login payload and
    # never calls /auth/me afterwards, so without this it holds user=null —
    # which hides the Admin nav item and blocks the /admin route guard even
    # for a superuser. Left optional because /auth/refresh reuses this schema.
    user: Optional["UserResponse"] = None


class TokenData(BaseModel):
    sub: str
    type: str = "access"


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8)


class UserUpdate(BaseModel):
    username: Optional[str] = Field(None, min_length=3, max_length=50)
    avatar_url: Optional[str] = None
    preferences: Optional[Dict[str, Any]] = None
