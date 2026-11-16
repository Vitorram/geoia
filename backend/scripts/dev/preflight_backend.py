"""Safe local preflight used by start-backend.ps1; never prints secret values."""

from __future__ import annotations

import os
from pathlib import Path
import sys

from dotenv import dotenv_values


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
BACKEND_ROOT = REPOSITORY_ROOT / "backend"
ENV_FILE = REPOSITORY_ROOT / ".env"
sys.path.insert(0, str(BACKEND_ROOT))


def fail(message: str, code: int) -> None:
    print(message)
    raise SystemExit(code)


def main() -> None:
    if not ENV_FILE.is_file():
        fail("Root .env not found. Copy .env.example and configure it locally.", 10)

    file_values = dotenv_values(ENV_FILE)
    conflicts = sorted(
        name
        for name, value in file_values.items()
        if value is not None and name in os.environ and os.environ[name] != value
    )
    if conflicts:
        fail(
            "Conflicting process environment variables: " + ", ".join(conflicts)
            + ". No values were overwritten.",
            20,
        )

    process_had_jwt = bool(os.environ.get("JWT_SECRET_KEY"))
    file_jwt = file_values.get("JWT_SECRET_KEY")
    for name, value in file_values.items():
        if value is not None:
            os.environ.setdefault(name, value)

    required = ("JWT_SECRET_KEY", "POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_DB")
    missing = [name for name in required if not os.environ.get(name, "").strip()]
    if missing:
        fail(
            "Required settings missing: " + ", ".join(missing)
            + ". No JWT key was generated or changed.",
            21,
        )
    if len(os.environ["JWT_SECRET_KEY"].encode("utf-8")) < 32:
        fail("JWT_SECRET_KEY must contain at least 32 bytes; its value is hidden.", 22)

    try:
        from app.core.config import settings
    except Exception as exc:  # Pydantic/config errors can contain input values.
        fail("Backend configuration invalid (" + type(exc).__name__ + ").", 23)

    if settings.ai_provider == "litellm" and not settings.ai_model:
        fail("AI_MODEL is required when AI_PROVIDER=litellm.", 24)

    try:
        import psycopg

        with psycopg.connect(
            host=settings.db_host,
            port=settings.db_port,
            dbname=settings.postgres_db,
            user=settings.postgres_user,
            password=settings.postgres_password,
            connect_timeout=3,
        ) as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                cursor.fetchone()
    except Exception as exc:
        fail("PostgreSQL unavailable (" + type(exc).__name__ + ").", 25)

    if process_had_jwt and file_jwt is not None:
        jwt_source = "process environment matches root .env"
    elif process_had_jwt:
        jwt_source = "process environment"
    else:
        jwt_source = "root .env"

    print("Preflight passed; PostgreSQL is connected.")
    print("JWT configured from " + jwt_source + "; value hidden.")
    print("AI_PROVIDER=" + settings.ai_provider)
    print("AI_MODEL=" + (settings.ai_model or "not configured"))
    print("PLACES_PROVIDER=" + settings.places_provider)
    print("GEOAPIFY_API_KEY=" + ("configured" if settings.geoapify_api_key else "not configured"))


if __name__ == "__main__":
    main()
