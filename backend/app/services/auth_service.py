"""Serviços de login e autenticação."""

import secrets

from argon2 import PasswordHasher
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.normalization import normalize_email
from app.core.security import verify_password
from app.core.tokens import TokenConfigurationError, create_access_token
from app.models.user import User
from app.repositories.user_repository import find_by_email
from app.schemas.user import LoginRequest, TokenResponse

_dummy_password_hash = PasswordHasher().hash(secrets.token_urlsafe(32))


class InvalidCredentialsError(Exception):
    """Credenciais inválidas ou conta inativa."""


class AuthenticationStorageError(Exception):
    """Não foi possível consultar a conta."""


class AuthenticationConfigurationError(Exception):
    """Configuração necessária para emitir tokens está indisponível."""


def login_user(db: Session, request: LoginRequest) -> TokenResponse:
    try:
        user = find_by_email(db, normalize_email(str(request.email)))
    except SQLAlchemyError:
        db.rollback()
        raise AuthenticationStorageError from None

    hash_to_verify = user.password_hash if user is not None else _dummy_password_hash
    valid_password = verify_password(request.password, hash_to_verify)
    if user is None or not valid_password or not user.is_active:
        raise InvalidCredentialsError

    try:
        token = create_access_token(user.id)
    except TokenConfigurationError:
        raise AuthenticationConfigurationError from None

    return TokenResponse(
        access_token=token,
        expires_in=settings.jwt_access_token_expire_minutes * 60,
    )
