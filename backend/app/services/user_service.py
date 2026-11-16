"""Serviço de cadastro de usuários."""

from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.user import User
from app.repositories import user_repository
from app.schemas.user import RegisterRequest


class DuplicateEmailError(Exception):
    """O e-mail já está associado a uma conta."""


class RegistrationStorageError(Exception):
    """Não foi possível persistir o cadastro."""


def register_user(db: Session, request: RegisterRequest) -> User:
    email = str(request.email).strip().casefold()
    try:
        if user_repository.find_by_email(db, email) is not None:
            raise DuplicateEmailError
    except SQLAlchemyError:
        db.rollback()
        raise RegistrationStorageError from None

    user = User(
        name=request.name,
        email=email,
        password_hash=hash_password(request.password),
    )

    try:
        user_repository.add_user(db, user)
        db.commit()
        db.refresh(user)
    except IntegrityError as exc:
        db.rollback()
        if user_repository.is_email_unique_violation(exc):
            raise DuplicateEmailError from None
        raise RegistrationStorageError from None
    except SQLAlchemyError:
        db.rollback()
        raise RegistrationStorageError from None

    return user
