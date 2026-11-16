"""Criação e validação de access tokens JWT."""

from datetime import datetime, timedelta, timezone
from uuid import UUID

import jwt
from jwt import InvalidTokenError

from app.core.config import settings

JWT_ALGORITHM = "HS256"


class TokenConfigurationError(Exception):
    """Configuração de assinatura JWT ausente ou inválida."""


def _signing_key() -> str:
    key = settings.jwt_secret_key.get_secret_value()
    if len(key.encode("utf-8")) < 32:
        raise TokenConfigurationError
    return key


def create_access_token(subject: UUID) -> str:
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=settings.jwt_access_token_expire_minutes)
    claims = {
        "sub": str(subject),
        "iss": settings.jwt_issuer,
        "iat": now,
        "exp": expires_at,
    }
    return jwt.encode(claims, _signing_key(), algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> UUID:
    claims = jwt.decode(
        token,
        _signing_key(),
        algorithms=[JWT_ALGORITHM],
        issuer=settings.jwt_issuer,
        options={"require": ["exp", "iss", "sub", "iat"]},
    )
    subject = claims.get("sub")
    if not isinstance(subject, str):
        raise InvalidTokenError("Invalid subject")
    try:
        return UUID(subject)
    except ValueError as exc:
        raise InvalidTokenError("Invalid subject") from exc
