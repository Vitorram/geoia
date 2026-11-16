"""Base SQLAlchemy e registro dos modelos para o Alembic."""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


# Importa os modelos para registrar suas tabelas em Base.metadata.
import app.models.user  # noqa: E402,F401
import app.models.place  # noqa: E402,F401
