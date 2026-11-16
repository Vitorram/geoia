import asyncio

import httpx
import pytest
from pydantic import SecretStr
from fastapi.testclient import TestClient

from app.api.routes import ai_search as ai_route
from app.core.config import settings
from app.schemas.ai_search import AIInterpretation
from app.schemas.place import PlaceCategory
from app.services import places


def _auth(client: TestClient) -> dict[str, str]:
    password = "Correct-Horse-Battery-42!"
    client.post("/api/v1/auth/register", json={"name": "Geoapify test", "email": "geoapify@example.com", "password": password})
    token = client.post("/api/v1/auth/login", json={"email": "geoapify@example.com", "password": password}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _feature(
    *,
    category: str = "catering.restaurant.pizza",
    osm_id: int = 123,
    lat: float = -23.7,
    lon: float = -45.4,
) -> dict:
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
        "properties": {
            "place_id": f"provider-place-{osm_id}",
            "name": "Pizzaria de teste",
            "formatted": "Rua de teste, 10",
            "lat": lat,
            "lon": lon,
            "distance": 125,
            "categories": [category],
            "datasource": {"sourcename": "openstreetmap", "raw": {"osm_type": "n", "osm_id": osm_id}},
        },
    }


def _configure(monkeypatch, *, key: str | None = "test-key") -> None:
    monkeypatch.setattr(settings, "geoapify_api_key", SecretStr(key) if key else None)
    monkeypatch.setattr(settings, "places_timeout_seconds", 1.0)
    monkeypatch.setattr(settings, "places_min_interval_seconds", 0.0)
    monkeypatch.setattr(settings, "places_cache_ttl_seconds", 0)


def test_geoapify_maps_pizza_category_and_normalizes_real_provider_fields(monkeypatch):
    _configure(monkeypatch)
    captured = {}

    def handler(request: httpx.Request):
        captured["request"] = request
        return httpx.Response(200, json={"type": "FeatureCollection", "features": [_feature()]})

    transport = httpx.MockTransport(handler)
    original_client = httpx.AsyncClient
    monkeypatch.setattr(places.httpx, "AsyncClient", lambda *a, **kw: original_client(*a, transport=transport, **kw))

    result = asyncio.run(places.GeoapifyPlacesProvider().nearby(-23.7, -45.4, PlaceCategory.PIZZARIA, 2500))

    request = captured["request"]
    assert request.url.host == "api.geoapify.com"
    assert "apiKey" not in request.url.query.decode()
    assert request.headers["x-api-key"] == "test-key"
    assert request.url.params["categories"] == "catering.restaurant.pizza,catering.fast_food.pizza"
    assert request.url.params["filter"] == "circle:-45.4000000,-23.7000000,2500"
    assert request.url.params["bias"] == "proximity:-45.4000000,-23.7000000"
    assert request.url.params["limit"] == "30"
    assert result[0].osm_id == "node/123"
    assert result[0].source == "openstreetmap"
    assert result[0].category == PlaceCategory.PIZZARIA
    assert result[0].distance_m == 125
    assert result[0].address == "Rua de teste, 10"


@pytest.mark.parametrize(("category", "expected"), [
    (PlaceCategory.RESTAURANTE, "catering.restaurant"),
    (PlaceCategory.CAFETERIA, "catering.cafe"),
    (PlaceCategory.FARMACIA, "healthcare.pharmacy"),
    (PlaceCategory.SUPERMERCADO, "commercial.supermarket"),
])
def test_geoapify_maps_supported_categories(monkeypatch, category, expected):
    _configure(monkeypatch)
    observed = {}
    transport = httpx.MockTransport(lambda request: (observed.setdefault("categories", request.url.params["categories"]) and httpx.Response(200, json={"features": []})))
    original_client = httpx.AsyncClient
    monkeypatch.setattr(places.httpx, "AsyncClient", lambda *a, **kw: original_client(*a, transport=transport, **kw))
    assert asyncio.run(places.GeoapifyPlacesProvider().nearby(0, 0, category, 1000)) == []
    assert observed["categories"] == expected


def test_geoapify_filters_unverified_pizza_and_malformed_results(monkeypatch):
    _configure(monkeypatch)
    generic_restaurant = _feature(category="catering.restaurant", osm_id=234)
    malformed = _feature(osm_id=345)
    malformed["properties"].pop("place_id")
    malformed["properties"].pop("datasource")
    malformed["properties"].pop("osm_id", None)
    transport = httpx.MockTransport(lambda _request: httpx.Response(200, json={"features": [generic_restaurant, malformed]}))
    original_client = httpx.AsyncClient
    monkeypatch.setattr(places.httpx, "AsyncClient", lambda *a, **kw: original_client(*a, transport=transport, **kw))
    assert asyncio.run(places.GeoapifyPlacesProvider().nearby(-23.7, -45.4, PlaceCategory.PIZZARIA, 3000)) == []


def test_geoapify_empty_response_is_a_valid_empty_result(monkeypatch):
    _configure(monkeypatch)
    original_client = httpx.AsyncClient
    transport = httpx.MockTransport(lambda _request: httpx.Response(200, json={"features": []}))
    monkeypatch.setattr(places.httpx, "AsyncClient", lambda *a, **kw: original_client(*a, transport=transport, **kw))
    assert asyncio.run(places.GeoapifyPlacesProvider().nearby(0, 0, PlaceCategory.FARMACIA, 1000)) == []


def test_geoapify_sorts_limits_radius_and_uses_provider_id_when_osm_id_is_missing(monkeypatch):
    _configure(monkeypatch)
    nearest = _feature(osm_id=1)
    nearest["properties"]["distance"] = 80
    farther = _feature(osm_id=2)
    farther["properties"]["distance"] = 350
    outside = _feature(osm_id=3)
    outside["properties"]["distance"] = 1200
    provider_only = _feature(osm_id=4)
    provider_only["properties"].pop("datasource")
    provider_only["properties"].pop("distance")
    provider_only["properties"]["place_id"] = "geoapify-id-4"
    provider_only["geometry"]["coordinates"] = [-45.4, -23.7001]
    provider_only["properties"].update(lat=-23.7001, lon=-45.4)
    transport = httpx.MockTransport(lambda _request: httpx.Response(200, json={"features": [farther, outside, provider_only, nearest]}))
    original_client = httpx.AsyncClient
    monkeypatch.setattr(places.httpx, "AsyncClient", lambda *a, **kw: original_client(*a, transport=transport, **kw))

    results = asyncio.run(places.GeoapifyPlacesProvider().nearby(-23.7, -45.4, PlaceCategory.PIZZARIA, 1000))

    assert [item.distance_m for item in results] == sorted(item.distance_m for item in results)
    assert all(item.distance_m <= 1000 for item in results)
    provider_only_result = next(item for item in results if item.source == "geoapify")
    assert provider_only_result.osm_id == "geoapify/geoapify-id-4"


@pytest.mark.parametrize(("status", "error_type"), [
    (429, places.PlacesRateLimited),
    (401, places.PlacesUnavailable),
    (403, places.PlacesUnavailable),
    (503, places.PlacesUnavailable),
    (504, places.PlacesTimeout),
])
def test_geoapify_maps_upstream_failures_without_leaking_response(monkeypatch, status, error_type):
    _configure(monkeypatch)
    original_client = httpx.AsyncClient
    transport = httpx.MockTransport(lambda _request: httpx.Response(status, headers={"Retry-After": "9"}, text="private key/provider details"))
    monkeypatch.setattr(places.httpx, "AsyncClient", lambda *a, **kw: original_client(*a, transport=transport, **kw))
    with pytest.raises(error_type) as error:
        asyncio.run(places.GeoapifyPlacesProvider().nearby(0, 0, PlaceCategory.FARMACIA, 1000))
    assert "private" not in str(error.value)
    if status == 429:
        assert error.value.retry_after == 9


def test_geoapify_invalid_json_response_is_controlled(monkeypatch):
    _configure(monkeypatch)
    original_client = httpx.AsyncClient
    transport = httpx.MockTransport(
        lambda _request: httpx.Response(200, json={"unexpected": "shape"})
    )
    monkeypatch.setattr(
        places.httpx,
        "AsyncClient",
        lambda *a, **kw: original_client(*a, transport=transport, **kw),
    )

    with pytest.raises(places.PlacesUnavailable):
        asyncio.run(
            places.GeoapifyPlacesProvider().nearby(
                0, 0, PlaceCategory.FARMACIA, 1000
            )
        )


def test_geoapify_timeout_is_controlled(monkeypatch):
    _configure(monkeypatch)

    def timeout(_request):
        raise httpx.ReadTimeout("private timeout detail")

    original_client = httpx.AsyncClient
    transport = httpx.MockTransport(timeout)
    monkeypatch.setattr(places.httpx, "AsyncClient", lambda *a, **kw: original_client(*a, transport=transport, **kw))
    with pytest.raises(places.PlacesTimeout) as error:
        asyncio.run(places.GeoapifyPlacesProvider().nearby(0, 0, PlaceCategory.FARMACIA, 1000))
    assert "private" not in str(error.value)


def test_geoapify_missing_key_does_not_make_external_call(monkeypatch):
    _configure(monkeypatch, key=None)

    def forbidden_client(*_args, **_kwargs):
        pytest.fail("Geoapify call must not run without a server API key")

    monkeypatch.setattr(places.httpx, "AsyncClient", forbidden_client)
    with pytest.raises(places.PlacesUnavailable):
        asyncio.run(places.GeoapifyPlacesProvider().nearby(0, 0, PlaceCategory.FARMACIA, 1000))


def test_geoapify_provider_selection_and_jwt_protection(api_client, monkeypatch):
    client, _ = api_client
    headers = _auth(client)
    monkeypatch.setattr(settings, "places_provider", "geoapify")
    monkeypatch.setattr(settings, "geoapify_api_key", SecretStr("test-key"))

    class FakeGeoapify:
        attribution = "Geoapify Places · © OpenStreetMap contributors"

        async def nearby(self, *_args):
            return []

    monkeypatch.setattr(places, "_geoapify", FakeGeoapify())
    response = client.get("/api/v1/places/nearby", params={
        "latitude": -23.7, "longitude": -45.4, "category": "farmácia", "radius_m": 1000,
    }, headers=headers)
    assert response.status_code == 200
    assert response.json() == {"results": [], "attribution": "Geoapify Places · © OpenStreetMap contributors"}

    unauthorized = client.get("/api/v1/places/nearby", params={
        "latitude": -23.7, "longitude": -45.4, "category": "farmácia",
    })
    assert unauthorized.status_code == 401


def test_ai_search_uses_explicitly_selected_geoapify_provider(api_client, monkeypatch):
    client, _ = api_client
    password = "Correct-Horse-Battery-42!"
    client.post("/api/v1/auth/register", json={"name": "Places AI", "email": "places-ai@example.com", "password": password})
    token = client.post("/api/v1/auth/login", json={"email": "places-ai@example.com", "password": password}).json()["access_token"]
    monkeypatch.setattr(settings, "places_provider", "geoapify")

    class FakeInterpreter:
        async def interpret(self, _message):
            return AIInterpretation(intent="find_places", category=PlaceCategory.CAFETERIA, radius_m=2000, needs_location=False)

    class FakeGeoapify:
        attribution = "Geoapify Places · © OpenStreetMap contributors"

        async def nearby(self, latitude, longitude, category, radius):
            assert (latitude, longitude, category, radius) == (10, 20, PlaceCategory.CAFETERIA, 2000)
            return []

    monkeypatch.setattr(ai_route, "get_ai_provider", lambda: FakeInterpreter())
    monkeypatch.setattr(places, "_geoapify", FakeGeoapify())
    monkeypatch.setattr(ai_route, "get_places_provider", places.get_places_provider)
    response = client.post("/api/v1/ai/search", headers={"Authorization": f"Bearer {token}"}, json={
        "message": "quero café", "location": {"latitude": 10, "longitude": 20},
    })
    assert response.status_code == 200
    assert response.json()["results"] == []
    assert response.json()["attribution"] == "Geoapify Places · © OpenStreetMap contributors"
