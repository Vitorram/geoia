from sqlalchemy.exc import IntegrityError

from app.repositories.user_repository import is_email_unique_violation


def test_postgres_email_constraint_conflict_is_recognized() -> None:
    class Diagnostic:
        constraint_name = "uq_users_email"

    class PostgresUniqueViolation(Exception):
        diag = Diagnostic()

    error = IntegrityError("INSERT INTO users", {}, PostgresUniqueViolation())

    assert is_email_unique_violation(error)
