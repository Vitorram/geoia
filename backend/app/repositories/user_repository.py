"""Consultas e operações de persistência para usuários."""

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.user import User

EMAIL_UNIQUE_CONSTRAINT = "uq_users_email"


def find_by_email(db: Session, normalized_email: str) -> User | None:
    """Busca e-mails ignorando diferenças de caixa já existentes no banco."""
    return db.scalar(select(User).where(func.lower(User.email) == normalized_email))


def add_user(db: Session, user: User) -> None:
    db.add(user)
    db.flush()


def is_email_unique_violation(error: IntegrityError) -> bool:
    """Reconhece a UNIQUE do e-mail em PostgreSQL e SQLite sem expor detalhes."""
    original = error.orig
    diagnostic = getattr(original, "diag", None)
    constraint_name = getattr(diagnostic, "constraint_name", None)
    if constraint_name == EMAIL_UNIQUE_CONSTRAINT:
        return True

    # SQLite é usado apenas no banco temporário isolado dos testes.
    return "UNIQUE constraint failed: users.email" in str(original)
