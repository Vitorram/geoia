import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.schemas.place import PlaceCategory
from app.services import places
from app.main import RedactNearbyCoordinatesFromAccessLog


def _auth(client: TestClient) -> dict[str, str]:
    password = "Correct-Horse-Battery-42!"
    client.post("/api/v1/auth/register", json={"name": "Place Test", "email": "place@example.com", "password": password})
    token = client.post("/api/v1/auth/login", json={"email": "place@example.com", "password": password}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def place_client(api_client: tuple[TestClient, sessionmaker[Session]]):
    client, _ = api_client
    return client, _auth(client)


@pytest.mark.parametrize("category", [item.value for item in PlaceCategory])
def test_valid_categories_call_provider(place_client, monkeypatch: pytest.MonkeyPatch, category: str):
    async def fake_nearby(lat, lon, selected_category, radius):
        assert selected_category.value == category
        assert radius == 3000
        return []
    monkeypatch.setattr(places._overpass, "nearby", fake_nearby)
    client, headers = place_client
    response = client.get("/api/v1/places/nearby", params={"latitude": -23.73, "longitude": -45.42, "category": category}, headers=headers)
    assert response.status_code == 200
    assert response.json() == {"results": [], "attribution": None}


@pytest.mark.parametrize("params", [
    {"latitude": 91, "longitude": 0, "category": "pizzaria"},
    {"latitude": 0, "longitude": 181, "category": "pizzaria"},
    {"latitude": 0, "longitude": 0, "category": "hotel"},
    {"latitude": 0, "longitude": 0, "category": "pizzaria", "radius_m": 5001},
    {"latitude": 0, "longitude": 0, "category": "pizzaria", "radius_m": 0},
])
def test_invalid_category_coordinates_or_radius_return_422(place_client, params):
    client, headers = place_client
    assert client.get("/api/v1/places/nearby", params=params, headers=headers).status_code == 422


def test_places_requires_jwt(api_client):
    client, _ = api_client
    response = client.get("/api/v1/places/nearby", params={"latitude": 0, "longitude": 0, "category": "pizzaria"})
    assert response.status_code == 401


def test_overpass_query_uses_fixed_category_filter_and_circle_radius():
    query = places.build_query(-23.73, -45.42, PlaceCategory.PIZZARIA, 3000)
    assert "around:3000,-23.7300000,-45.4200000" in query
    assert '["cuisine"~"pizza",i]' in query
    assert "hotel" not in query
    assert "[timeout:12]" in query


def test_overpass_response_is_mapped_sorted_and_limited():
    elements = [
        {"type": "node", "id": i, "lat": -23.73 + i * 0.00001, "lon": -45.42,
         "tags": {"name": f"Local {i}", "addr:street": "Rua Teste", "addr:housenumber": str(i)}}
        for i in range(35, 0, -1)
    ]
    results = places.OverpassPlacesProvider._parse(elements, -23.73, -45.42, PlaceCategory.PIZZARIA, 5000)
    assert len(results) == 30
    assert results[0].distance_m <= results[-1].distance_m
    assert results[0].address.startswith("Rua Teste")


@pytest.mark.parametrize("status", [200, 429, 503, 504])
def test_provider_http_is_simulated_and_handles_results_and_limits(monkeypatch: pytest.MonkeyPatch, status: int):
    body = {"elements": [{"type": "node", "id": 123, "lat": -23.73, "lon": -45.42, "tags": {"name": "Pizzaria Real"}}]}
    transport = httpx.MockTransport(lambda request: httpx.Response(status, json=body if status == 200 else {"remark": "private provider detail"}))
    original_client = httpx.AsyncClient

    def mocked_client(*args, **kwargs):
        return original_client(*args, transport=transport, **kwargs)

    monkeypatch.setattr(places.httpx, "AsyncClient", mocked_client)
    provider = places.OverpassPlacesProvider()
    if status == 429:
        with pytest.raises(places.PlacesRateLimited):
            import asyncio
            asyncio.run(provider.nearby(-23.73, -45.42, PlaceCategory.PIZZARIA, 3000))
    elif status == 504:
        with pytest.raises(places.PlacesTimeout):
            import asyncio
            asyncio.run(provider.nearby(-23.73, -45.42, PlaceCategory.PIZZARIA, 3000))
    elif status == 503:
        with pytest.raises(places.PlacesUnavailable):
            import asyncio
            asyncio.run(provider.nearby(-23.73, -45.42, PlaceCategory.PIZZARIA, 3000))
    else:
        import asyncio
        result = asyncio.run(provider.nearby(-23.73, -45.42, PlaceCategory.PIZZARIA, 3000))
        assert result[0].name == "Pizzaria Real"
        assert result[0].osm_id == "node/123"


def test_haversine_distance_is_approximately_correct():
    assert places.haversine_m(0, 0, 0, 1) == pytest.approx(111_195, abs=5)


def test_timeout_and_upstream_504_remain_timeout_errors(monkeypatch: pytest.MonkeyPatch):
    import asyncio

    monkeypatch.setattr(settings, "places_min_interval_seconds", 0)

    def timeout(_request):
        raise httpx.ReadTimeout("upstream timed out")

    original_client = httpx.AsyncClient
    monkeypatch.setattr(places.httpx, "AsyncClient", lambda *a, **kw: original_client(*a, transport=httpx.MockTransport(timeout), **kw))
    provider = places.OverpassPlacesProvider()
    with pytest.raises(places.PlacesTimeout):
        asyncio.run(provider.nearby(-23.73, -45.42, PlaceCategory.PIZZARIA, 3000))

    transport = httpx.MockTransport(lambda _request: httpx.Response(504))
    monkeypatch.setattr(places.httpx, "AsyncClient", lambda *a, **kw: original_client(*a, transport=transport, **kw))
    with pytest.raises(places.PlacesTimeout):
        asyncio.run(places.OverpassPlacesProvider().nearby(-23.72, -45.42, PlaceCategory.PIZZARIA, 3000))


def test_transient_503_retries_once_and_recovers(monkeypatch: pytest.MonkeyPatch):
    import asyncio

    monkeypatch.setattr(settings, "places_min_interval_seconds", 0)
    monkeypatch.setattr(places.random, "uniform", lambda _a, _b: 0)
    calls = 0

    def handler(_request):
        nonlocal calls
        calls += 1
        if calls == 1:
            return httpx.Response(503, headers={"Retry-After": "0"})
        return httpx.Response(200, json={"elements": []})

    original_client = httpx.AsyncClient
    monkeypatch.setattr(places.httpx, "AsyncClient", lambda *a, **kw: original_client(*a, transport=httpx.MockTransport(handler), **kw))
    result = asyncio.run(places.OverpassPlacesProvider().nearby(-23.71, -45.42, PlaceCategory.PIZZARIA, 3000))
    assert result == []
    assert calls == 2


def test_retry_after_from_429_is_preserved_and_not_retried(monkeypatch: pytest.MonkeyPatch, place_client):
    monkeypatch.setattr(settings, "places_min_interval_seconds", 0)
    original_client = httpx.AsyncClient
    transport = httpx.MockTransport(lambda _request: httpx.Response(429, headers={"Retry-After": "17"}))
    monkeypatch.setattr(places.httpx, "AsyncClient", lambda *a, **kw: original_client(*a, transport=transport, **kw))
    client, headers = place_client
    response = client.get("/api/v1/places/nearby", params={"latitude": -23.7, "longitude": -45.4, "category": "pizzaria"}, headers=headers)
    assert response.status_code == 503
    assert response.headers["retry-after"] == "17"


def test_provider_timeout_maps_to_gateway_timeout(place_client, monkeypatch: pytest.MonkeyPatch):
    from app.api.routes import places as places_routes

    class TimedOutProvider:
        async def nearby(self, *_args):
            raise places.PlacesTimeout

    monkeypatch.setattr(places_routes, "get_places_provider", lambda: TimedOutProvider())
    client, headers = place_client
    response = client.get("/api/v1/places/nearby", params={"latitude": -23.7, "longitude": -45.4, "category": "pizzaria"}, headers=headers)
    assert response.status_code == 504
    assert "tempo limite" in response.json()["detail"]


def test_transient_503_retry_after_too_long_does_not_retry(monkeypatch: pytest.MonkeyPatch):
    import asyncio

    monkeypatch.setattr(settings, "places_min_interval_seconds", 0)
    calls = 0

    def handler(_request):
        nonlocal calls
        calls += 1
        return httpx.Response(503, headers={"Retry-After": "60"})

    original_client = httpx.AsyncClient
    monkeypatch.setattr(places.httpx, "AsyncClient", lambda *a, **kw: original_client(*a, transport=httpx.MockTransport(handler), **kw))
    with pytest.raises(places.PlacesUnavailable) as error:
        asyncio.run(places.OverpassPlacesProvider().nearby(-23.70, -45.42, PlaceCategory.PIZZARIA, 3000))
    assert error.value.retry_after == 60
    assert calls == 1


def test_nearby_middleware_hides_coordinates_from_access_log_scope():
    observed = []
    async def downstream(scope, receive, send):
        await send({"type": "http.response.start", "status": 200, "headers": []})
    async def send(message):
        observed.append((scope["query_string"], scope["raw_path"]))
    scope = {"type": "http", "path": "/api/v1/places/nearby", "query_string": b"latitude=-23.7&longitude=-45.4", "raw_path": b"/api/v1/places/nearby?latitude=-23.7&longitude=-45.4"}
    import asyncio
    asyncio.run(RedactNearbyCoordinatesFromAccessLog(downstream)(scope, None, send))
    assert observed == [(b"", b"/api/v1/places/nearby")]
    assert scope["query_string"] == b"latitude=-23.7&longitude=-45.4"

