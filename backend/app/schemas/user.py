"""Schemas Pydantic para o cadastro e representação pública de usuários."""

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    SecretStr,
    StringConstraints,
    field_validator,
)
from app.core.normalization import normalize_email

UserName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)
]


class RegisterRequest(BaseModel):
    """Dados recebidos para criar uma conta."""

    name: UserName
    email: EmailStr
    password: SecretStr = Field(
        min_length=12,
        max_length=128,
        repr=False,
        json_schema_extra={"format": "password", "writeOnly": True},
    )

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: EmailStr) -> str:
        return normalize_email(str(value))


class LoginRequest(BaseModel):
    """Credenciais recebidas para login."""

    email: EmailStr
    password: SecretStr = Field(min_length=1, max_length=128, repr=False)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: EmailStr) -> str:
        return normalize_email(str(value))


class UserRead(BaseModel):
    """Representação pública do usuário; não inclui credenciais."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    email: EmailStr
    is_active: bool
    created_at: datetime
    updated_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int = Field(ge=1)
