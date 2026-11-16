from collections.abc import Awaitable, Callable

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

from app.services import geocoding


def auth_headers(client: TestClient) -> dict[str, str]:
    client.post("/api/v1/auth/register", json={
        "name": "Geo Test", "email": "geo@example.com", "password": "Correct-Horse-Battery-42!",
    })
    token = client.post("/api/v1/auth/login", json={
        "email": "geo@example.com", "password": "Correct-Horse-Battery-42!",
    }).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def geocode_client(api_client: tuple[TestClient, sessionmaker[Session]]):
    client, _ = api_client
    return client, auth_headers(client)


def test_geocode_success(geocode_client, monkeypatch: pytest.MonkeyPatch):
    async def fake_search(query: str):
        assert query == "Caraguatatuba, SP"
        return [{"name": "Caraguatatuba", "formatted_address": "Caraguatatuba, SP, Brasil", "latitude": -23.6203, "longitude": -45.4132}]

    from app.schemas.location import GeocodeResult
    async def adapted(query: str):
        return [GeocodeResult(**item) for item in await fake_search(query)]
    monkeypatch.setattr(geocoding._nominatim, "search", adapted)
    client, headers = geocode_client
    response = client.get("/api/v1/locations/geocode", params={"q": "Caraguatatuba, SP"}, headers=headers)
    assert response.status_code == 200
    assert response.json()["results"][0]["name"] == "Caraguatatuba"
    assert response.json()["results"][0]["latitude"] == -23.6203


def test_geocode_no_results_returns_empty_list(geocode_client, monkeypatch: pytest.MonkeyPatch):
    async def no_results(query: str): return []
    monkeypatch.setattr(geocoding._nominatim, "search", no_results)
    client, headers = geocode_client
    response = client.get("/api/v1/locations/geocode", params={"q": "Local inexistente XYZ"}, headers=headers)
    assert response.status_code == 200
    assert response.json() == {"results": []}


@pytest.mark.parametrize("exception", [geocoding.GeocodingUnavailable, geocoding.GeocodingRateLimited])
def test_geocoder_provider_errors_are_sanitized(geocode_client, monkeypatch: pytest.MonkeyPatch, exception):
    async def failed(query: str): raise exception
    monkeypatch.setattr(geocoding._nominatim, "search", failed)
    client, headers = geocode_client
    response = client.get("/api/v1/locations/geocode", params={"q": "Caraguatatuba"}, headers=headers)
    assert response.status_code == 503
    assert "nominatim" not in response.text.lower()


def test_geocode_requires_authentication(api_client):
    client, _ = api_client
    assert client.get("/api/v1/locations/geocode", params={"q": "Caraguatatuba"}).status_code == 401
