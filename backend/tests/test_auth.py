from datetime import datetime, timedelta, timezone
import secrets
from uuid import uuid4

import jwt
import pytest
from argon2 import PasswordHasher
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.core.tokens import JWT_ALGORITHM, create_access_token
from app.models.user import User

TEST_PASSWORD = "Correto!Cavalo#42"


def register(client: TestClient, email: str = "ada@example.com") -> None:
    response = client.post(
        "/api/v1/auth/register",
        json={"name": "Ada Lovelace", "email": email, "password": TEST_PASSWORD},
    )
    assert response.status_code == 201


def create_inactive_user(session_factory: sessionmaker[Session]) -> None:
    user = User(
        name="Inactive User",
        email="inactive@example.com",
        password_hash=PasswordHasher().hash(TEST_PASSWORD),
        is_active=False,
    )
    with session_factory() as db:
        db.add(user)
        db.commit()


def test_login_valid_returns_short_lived_bearer_token(
    api_client: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, _ = api_client
    register(client)

    response = client.post(
        "/api/v1/auth/login",
        json={"email": "ADA@EXAMPLE.COM", "password": TEST_PASSWORD},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert "password_hash" not in body
    assert TEST_PASSWORD not in response.text
    assert body["expires_in"] == settings.jwt_access_token_expire_minutes * 60
    claims = jwt.decode(
        body["access_token"],
        settings.jwt_secret_key.get_secret_value(),
        algorithms=[JWT_ALGORITHM],
        issuer=settings.jwt_issuer,
    )
    assert set(claims) == {"sub", "iss", "iat", "exp"}


def test_login_wrong_password_returns_generic_401(
    api_client: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, _ = api_client
    register(client)

    response = client.post(
        "/api/v1/auth/login",
        json={"email": "ada@example.com", "password": "senha-incorreta-123"},
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "E-mail ou senha inválidos."}


def test_login_unknown_email_returns_same_401(
    api_client: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, _ = api_client
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "missing@example.com", "password": TEST_PASSWORD},
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "E-mail ou senha inválidos."}


def test_inactive_user_cannot_login(
    api_client: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, session_factory = api_client
    create_inactive_user(session_factory)

    response = client.post(
        "/api/v1/auth/login",
        json={"email": "inactive@example.com", "password": TEST_PASSWORD},
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "E-mail ou senha inválidos."}


def test_valid_token_can_read_me_without_password_hash(
    api_client: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, _ = api_client
    register(client)
    login_response = client.post(
        "/api/v1/auth/login",
        json={"email": "ada@example.com", "password": TEST_PASSWORD},
    )
    token = login_response.json()["access_token"]

    response = client.get(
        "/api/v1/users/me", headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 200
    assert response.json()["email"] == "ada@example.com"
    assert "password_hash" not in response.json()
    assert TEST_PASSWORD not in response.text


def test_invalid_token_returns_401(
    api_client: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, _ = api_client
    now = datetime.now(timezone.utc)
    forged_token = jwt.encode(
        {
            "sub": str(uuid4()),
            "iss": settings.jwt_issuer,
            "iat": now,
            "exp": now + timedelta(minutes=5),
        },
        secrets.token_urlsafe(48),
        algorithm=JWT_ALGORITHM,
    )
    response = client.get(
        "/api/v1/users/me", headers={"Authorization": f"Bearer {forged_token}"}
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Credenciais de autenticação inválidas."}


def test_tampered_signature_returns_401(
    api_client: tuple[TestClient, sessionmaker[Session]], caplog: pytest.LogCaptureFixture
) -> None:
    client, _ = api_client
    token = create_access_token(uuid4())
    header, payload, signature = token.split(".")
    altered_signature = ("A" if signature[0] != "A" else "B") + signature[1:]
    tampered_token = ".".join((header, payload, altered_signature))

    response = client.get(
        "/api/v1/users/me",
        headers={"Authorization": f"Bearer {tampered_token}"},
    )

    assert response.status_code == 401
    assert tampered_token not in response.text
    assert tampered_token not in caplog.text
    assert TEST_PASSWORD not in caplog.text


def test_valid_token_for_nonexistent_user_returns_401(
    api_client: tuple[TestClient, sessionmaker[Session]], caplog: pytest.LogCaptureFixture
) -> None:
    client, _ = api_client
    token = create_access_token(uuid4())

    response = client.get(
        "/api/v1/users/me", headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 401
    assert token not in response.text
    assert token not in caplog.text
    assert TEST_PASSWORD not in caplog.text


def test_expired_token_returns_401(
    api_client: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, _ = api_client
    now = datetime.now(timezone.utc)
    expired_token = jwt.encode(
        {
            "sub": str(uuid4()),
            "iss": settings.jwt_issuer,
            "iat": now - timedelta(minutes=2),
            "exp": now - timedelta(minutes=1),
        },
        settings.jwt_secret_key.get_secret_value(),
        algorithm=JWT_ALGORITHM,
    )

    response = client.get(
        "/api/v1/users/me",
        headers={"Authorization": f"Bearer {expired_token}"},
    )

    assert response.status_code == 401


def test_me_without_authentication_returns_401(
    api_client: tuple[TestClient, sessionmaker[Session]],
) -> None:
    client, _ = api_client
    response = client.get("/api/v1/users/me")

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"
