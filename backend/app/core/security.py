"""Utilitários de segurança para credenciais."""

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from pydantic import SecretStr

_password_hasher = PasswordHasher()


def hash_password(password: SecretStr) -> str:
    """Calcula um hash Argon2id da senha recebida."""
    return _password_hasher.hash(password.get_secret_value())


def verify_password(password: SecretStr, password_hash: str) -> bool:
    """Verifica uma senha sem deixar exceções do Argon2 escaparem."""
    try:
        return _password_hasher.verify(password_hash, password.get_secret_value())
    except (InvalidHashError, VerificationError):
        return False
