from typing import Any

from argon2 import PasswordHasher
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, sessionmaker
from fastapi.testclient import TestClient

from app.models.user import User
from app.repositories import user_repository

TEST_PASSWORD = "Correto!Cavalo#42"


def registration_payload(**overrides: str) -> dict[str, str]:
    return {
        "name": "Ada Lovelace",
        "email": "Ada.Lovelace@example.com",
        "password": TEST_PASSWORD,
        **overrides,
    }


def test_register_valid_user(api_client: tuple[TestClient, sessionmaker[Session]]) -> None:
    client, _ = api_client

    response = client.post("/api/v1/auth/register", json=registration_payload())

    assert response.status_code == 201
    assert response.json()["name"] == "Ada Lovelace"
    assert response.json()["email"] == "ada.lovelace@example.com"
    assert response.json()["is_active"] is True


def test_duplicate_email_returns_409(api_client: tuple[TestClient, sessionmaker[Session]]) -> None:
    client, _ = api_client
    assert client.post("/api/v1/auth/register", json=registration_payload()).status_code == 201

    response = client.post(
        "/api/v1/auth/register",
        json=registration_payload(email="ADA.LOVELACE@EXAMPLE.COM"),
    )

    assert response.status_code == 409
    assert response.json() == {"detail": "Já existe uma conta com este e-mail."}


def test_unique_conflict_after_precheck_returns_409(
    api_client: tuple[TestClient, sessionmaker[Session]], monkeypatch: Any
) -> None:
    client, _ = api_client
    assert client.post("/api/v1/auth/register", json=registration_payload()).status_code == 201

    # Simula duas requisições que passaram pela consulta antes da primeira confirmar.
    monkeypatch.setattr(user_repository, "find_by_email", lambda db, email: None)
    response = client.post("/api/v1/auth/register", json=registration_payload())

    assert response.status_code == 409


def test_invalid_email_returns_422_without_echoing_credentials(
    api_client: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, _ = api_client
    response = client.post(
        "/api/v1/auth/register",
        json=registration_payload(email="not-an-email"),
    )

    assert response.status_code == 422
    assert TEST_PASSWORD not in response.text
    assert "not-an-email" not in response.text


def test_short_password_returns_422_without_echoing_password(
    api_client: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, _ = api_client
    short_password = "tiny-secret"
    response = client.post(
        "/api/v1/auth/register",
        json=registration_payload(password=short_password),
    )

    assert response.status_code == 422
    assert short_password not in response.text


def test_password_is_persisted_as_argon2_hash(
    api_client: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, session_factory = api_client
    response = client.post("/api/v1/auth/register", json=registration_payload())
    assert response.status_code == 201

    with session_factory() as db:
        user = db.scalar(select(User).where(User.email == "ada.lovelace@example.com"))

    assert user is not None
    assert user.password_hash.startswith("$argon2id$")
    assert user.password_hash != TEST_PASSWORD
    assert PasswordHasher().verify(user.password_hash, TEST_PASSWORD)


def test_response_never_contains_password_hash(
    api_client: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, _ = api_client
    response = client.post("/api/v1/auth/register", json=registration_payload())

    assert response.status_code == 201
    assert "password_hash" not in response.json()
    assert TEST_PASSWORD not in response.text


def test_storage_errors_return_generic_detail_without_internal_data(
    api_client: tuple[TestClient, sessionmaker[Session]], monkeypatch: Any
) -> None:
    client, _ = api_client
    secret_marker = "internal-database-secret-marker"

    def fail_insert(db: Session, user: User) -> None:
        raise SQLAlchemyError(secret_marker)

    monkeypatch.setattr(user_repository, "add_user", fail_insert)
    response = client.post("/api/v1/auth/register", json=registration_payload())

    assert response.status_code == 503
    assert secret_marker not in response.text
    assert TEST_PASSWORD not in response.text
    assert "password_hash" not in response.text
