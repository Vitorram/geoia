"""Configurações carregadas do ambiente."""

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import URL


class Settings(BaseSettings):
    postgres_user: str = "geoia"
    postgres_password: str = "change-me"
    postgres_db: str = "geoia"
    db_host: str = "localhost"
    db_port: int = Field(default=5432, validation_alias="POSTGRES_PORT")
    postgres_test_user: str | None = None
    postgres_test_password: SecretStr | None = None
    postgres_test_db: str | None = None
    postgres_test_port: int = 5433
    postgres_test_host: str = "localhost"
    jwt_secret_key: SecretStr = Field(min_length=32)
    jwt_issuer: str = Field(default="geoia-api", min_length=1, max_length=200)
    jwt_access_token_expire_minutes: int = Field(default=15, ge=1, le=60)
    geocoding_provider: str = Field(default="nominatim", min_length=1, max_length=40)
    geocoding_user_agent: str = Field(default="GeoIA/0.1", min_length=5, max_length=200)
    geocoding_timeout_seconds: float = Field(default=5.0, gt=0, le=30)
    geocoding_min_interval_seconds: float = Field(default=1.1, ge=1.0, le=60)
    places_provider: str = Field(default="overpass", pattern="^(overpass|postgis)$")
    overpass_endpoint: str = Field(default="https://overpass-api.de/api/interpreter", min_length=20, max_length=300)
    overpass_query_timeout_seconds: int = Field(default=12, ge=1, le=25)
    places_timeout_seconds: float = Field(default=20.0, gt=0, le=30)
    places_min_interval_seconds: float = Field(default=2.0, ge=1.0, le=60)
    places_cache_ttl_seconds: int = Field(default=60, ge=0, le=3600)

    model_config = SettingsConfigDict(env_file="../.env", extra="ignore")

    @property
    def database_url(self) -> URL:
        return URL.create(
            drivername="postgresql+psycopg",
            username=self.postgres_user,
            password=self.postgres_password,
            host=self.db_host,
            port=self.db_port,
            database=self.postgres_db,
        )


settings = Settings()
