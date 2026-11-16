"""Fixtures usando um banco SQLite temporário isolado do banco de desenvolvimento."""

from collections.abc import Iterator
import os
from pathlib import Path
import secrets

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.engine import URL
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

os.environ["JWT_SECRET_KEY"] = secrets.token_urlsafe(48)

from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.core.config import settings


@pytest.fixture
def api_client(tmp_path: Path) -> Iterator[tuple[TestClient, sessionmaker[Session]]]:
    test_db_path = tmp_path / "geoia_test.sqlite3"
    test_engine = create_engine(
        f"sqlite:///{test_db_path.as_posix()}",
        connect_args={"check_same_thread": False},
        poolclass=NullPool,
    )
    # SQLite serve apenas aos testes comuns; modelos PostGIS não são simulados nele.
    from app.models.user import User
    User.__table__.create(test_engine)
    TestSessionLocal = sessionmaker(bind=test_engine, autoflush=False, autocommit=False)

    def override_get_db() -> Iterator[Session]:
        with TestSessionLocal() as db:
            yield db

    app.dependency_overrides[get_db] = override_get_db
    try:
        with TestClient(app) as client:
            yield client, TestSessionLocal
    finally:
        app.dependency_overrides.pop(get_db, None)
        test_engine.dispose()


@pytest.fixture
def postgis_test_engine():
    """Engine PostGIS isolado; falha em vez de usar SQLite ou o DB de desenvolvimento."""
    required = (settings.postgres_test_user, settings.postgres_test_password, settings.postgres_test_db)
    missing = [name for name, value in zip(("POSTGRES_TEST_USER", "POSTGRES_TEST_PASSWORD", "POSTGRES_TEST_DB"), required) if not value]
    if missing:
        pytest.fail("PostGIS de teste não configurado: " + ", ".join(missing))

    test_db = settings.postgres_test_db
    if test_db == settings.postgres_db:
        pytest.fail("POSTGRES_TEST_DB deve ser diferente de POSTGRES_DB")

    test_port = settings.postgres_test_port
    if test_port == settings.db_port:
        pytest.fail("POSTGRES_TEST_PORT deve ser diferente de POSTGRES_PORT")

    url = URL.create(
        "postgresql+psycopg",
        username=settings.postgres_test_user,
        password=settings.postgres_test_password.get_secret_value(),
        host=settings.postgres_test_host,
        port=test_port,
        database=test_db,
    )
    engine = create_engine(url, pool_pre_ping=True)
    try:
        with engine.connect() as connection:
            current_db = connection.exec_driver_sql("SELECT current_database()").scalar_one()
            if current_db != settings.postgres_db and current_db != test_db:
                pytest.fail("Conectou a um banco diferente do banco de teste configurado")
            if current_db != test_db:
                pytest.fail("Conectou ao banco de desenvolvimento; execução interrompida")
        yield engine
    finally:
        engine.dispose()
