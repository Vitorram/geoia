"""Adaptador Overpass para buscas OSM pontuais, estreitas e limitadas."""

import asyncio
import email.utils
import math
import random
import time
from collections import OrderedDict
from datetime import datetime, timezone
from typing import Protocol

import httpx
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.db.session import SessionLocal
from app.schemas.place import NearbyPlace, PlaceCategory


class PlacesUnavailable(Exception):
    def __init__(self, retry_after: int | None = None) -> None:
        self.retry_after = retry_after


class PlacesRateLimited(Exception):
    def __init__(self, retry_after: int | None = None) -> None:
        self.retry_after = retry_after


class PlacesTimeout(Exception):
    pass


class PlacesDatasetEmpty(Exception):
    pass


class PlacesProvider(Protocol):
    async def nearby(self, latitude: float, longitude: float, category: PlaceCategory, radius_m: int) -> list[NearbyPlace]: ...


class PostGISPlacesProvider:
    """Consulta local por geography em metros. Não acessa a rede externa."""

    def __init__(self, session_factory: sessionmaker = SessionLocal):
        self.session_factory = session_factory

    async def nearby(self, latitude: float, longitude: float, category: PlaceCategory, radius_m: int) -> list[NearbyPlace]:
        import asyncio

        return await asyncio.to_thread(self._nearby_sync, self.session_factory, latitude, longitude, category, radius_m)

    @staticmethod
    def _nearby_sync(session_factory, latitude: float, longitude: float, category: PlaceCategory, radius_m: int) -> list[NearbyPlace]:
        distance_expr = "ST_Distance(location, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography)"
        query = text(f"""
            SELECT osm_type, osm_id, name, category, address,
                   ST_Y(location::geometry) AS latitude,
                   ST_X(location::geometry) AS longitude,
                   {distance_expr} AS distance_m
            FROM places
            WHERE category = :category
              AND ST_DWithin(location, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography, :radius)
            ORDER BY distance_m ASC
            LIMIT 30
        """)
        try:
            with session_factory() as db:
                rows = db.execute(query, {
                    "lat": latitude, "lon": longitude,
                    "category": category.value, "radius": radius_m,
                }).mappings().all()
                if not rows and not db.execute(text("SELECT EXISTS (SELECT 1 FROM places LIMIT 1)")).scalar_one():
                    raise PlacesDatasetEmpty
                return [NearbyPlace(
                    osm_id=f"{row['osm_type']}/{row['osm_id']}", name=row["name"],
                    category=PlaceCategory(row["category"]), latitude=row["latitude"],
                    longitude=row["longitude"], distance_m=round(row["distance_m"]),
                    address=row["address"],
                ) for row in rows]
        except PlacesDatasetEmpty:
            raise
        except SQLAlchemyError as exc:
            raise PlacesUnavailable from exc


# Filtros são constantes do servidor; nenhum texto do usuário entra na QL.
OSM_FILTERS: dict[PlaceCategory, tuple[str, ...]] = {
    PlaceCategory.PIZZARIA: (
        '["amenity"="restaurant"]["cuisine"~"pizza",i]',
        '["amenity"="fast_food"]["cuisine"~"pizza",i]',
    ),
    PlaceCategory.RESTAURANTE: ('["amenity"="restaurant"]',),
    PlaceCategory.CAFETERIA: ('["amenity"="cafe"]',),
    PlaceCategory.FARMACIA: ('["amenity"="pharmacy"]',),
    PlaceCategory.SUPERMERCADO: ('["shop"="supermarket"]',),
}


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> int:
    earth_radius_m = 6_371_000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi, dlambda = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    a = min(1.0, max(0.0, a))
    return round(earth_radius_m * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a)))


def build_query(latitude: float, longitude: float, category: PlaceCategory, radius_m: int) -> str:
    filters = OSM_FILTERS[category]
    selectors = "\n".join(
        f"  nwr(around:{radius_m},{latitude:.7f},{longitude:.7f}){osm_filter};"
        for osm_filter in filters
    )
    # Deixa margem ao cliente para fila, conexão e transferência da resposta.
    timeout = min(
        int(settings.overpass_query_timeout_seconds),
        max(1, int(settings.places_timeout_seconds) - 2),
    )
    return f"[out:json][timeout:{timeout}];\n(\n{selectors}\n);\nout center tags;"


def _retry_after_seconds(value: str | None) -> int | None:
    if not value:
        return None
    try:
        return max(0, math.ceil(float(value)))
    except (ValueError, OverflowError):
        try:
            retry_at = email.utils.parsedate_to_datetime(value)
            if retry_at.tzinfo is None:
                retry_at = retry_at.replace(tzinfo=timezone.utc)
            return max(0, math.ceil((retry_at - datetime.now(timezone.utc)).total_seconds()))
        except (TypeError, ValueError, OverflowError):
            return None


async def _backoff(attempt: int, retry_after: int | None, remaining: float) -> bool:
    # Duas tentativas totali; nunca espera se não sobra orçamento para outra chamada.
    delay = max(retry_after or 0, 0.25 * (2 ** (attempt - 1)) + random.uniform(0.05, 0.25))
    if delay + 0.5 >= remaining:
        return False
    await asyncio.sleep(delay)
    return True


def _address(tags: dict) -> str | None:
    if isinstance(tags.get("addr:full"), str) and tags["addr:full"].strip():
        return tags["addr:full"].strip()
    parts = []
    street = tags.get("addr:street")
    house = tags.get("addr:housenumber")
    if street:
        parts.append(f"{street} {house}".strip() if house else str(street))
    for key in ("addr:suburb", "addr:city", "addr:postcode"):
        value = tags.get(key)
        if value and str(value) not in parts:
            parts.append(str(value))
    return ", ".join(parts) or None


class OverpassPlacesProvider:
    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._last_request = 0.0
        self._cache: OrderedDict[tuple, tuple[float, list[NearbyPlace]]] = OrderedDict()

    async def _throttle(self) -> None:
        async with self._lock:
            delay = settings.places_min_interval_seconds - (time.monotonic() - self._last_request)
            if delay > 0:
                await asyncio.sleep(delay)
            self._last_request = time.monotonic()

    async def nearby(self, latitude: float, longitude: float, category: PlaceCategory, radius_m: int) -> list[NearbyPlace]:
        key = (round(latitude, 6), round(longitude, 6), category.value, radius_m)
        now = time.monotonic()
        cached = self._cache.get(key)
        if cached and cached[0] > now:
            self._cache.move_to_end(key)
            return cached[1]
        if cached:
            self._cache.pop(key, None)

        await self._throttle()
        query = build_query(latitude, longitude, category, radius_m)
        deadline = time.monotonic() + settings.places_timeout_seconds
        try:
            async with httpx.AsyncClient(timeout=settings.places_timeout_seconds) as client:
                for attempt in range(1, 3):
                    remaining = deadline - time.monotonic()
                    if remaining <= 0:
                        raise PlacesTimeout
                    try:
                        async with asyncio.timeout(remaining):
                            response = await client.post(
                                settings.overpass_endpoint,
                                data={"data": query},
                                headers={"User-Agent": "GeoIA/0.1 (nearby OSM places)"},
                                timeout=httpx.Timeout(remaining),
                            )
                    except httpx.TimeoutException as exc:
                        raise PlacesTimeout from exc
                    except httpx.HTTPError as exc:
                        if attempt < 2 and await _backoff(attempt, None, deadline - time.monotonic()):
                            continue
                        raise PlacesUnavailable from exc
                    except TimeoutError as exc:
                        raise PlacesTimeout from exc

                    if response.status_code == 429:
                        # Não repetir nem trocar de instância: 429 indica cota do provedor.
                        raise PlacesRateLimited(_retry_after_seconds(response.headers.get("Retry-After")))
                    if response.status_code in (408, 504):
                        raise PlacesTimeout
                    if response.status_code in (500, 502, 503):
                        retry_after = _retry_after_seconds(response.headers.get("Retry-After"))
                        if attempt < 2 and await _backoff(attempt, retry_after, deadline - time.monotonic()):
                            continue
                        raise PlacesUnavailable(retry_after)
                    if response.status_code != 200:
                        raise PlacesUnavailable
                    break
        except httpx.TimeoutException as exc:
            raise PlacesTimeout from exc
        except httpx.HTTPError as exc:
            raise PlacesUnavailable from exc

        try:
            elements = response.json()["elements"]
            places = self._parse(elements, latitude, longitude, category, radius_m)
        except (ValueError, TypeError, KeyError, AttributeError) as exc:
            raise PlacesUnavailable from exc

        ttl = settings.places_cache_ttl_seconds
        if ttl:
            self._cache[key] = (time.monotonic() + ttl, places)
            self._cache.move_to_end(key)
            while len(self._cache) > 256:
                self._cache.popitem(last=False)
        return places

    @staticmethod
    def _parse(elements: list, latitude: float, longitude: float, category: PlaceCategory, radius_m: int) -> list[NearbyPlace]:
        places = []
        for element in elements:
            tags = element.get("tags") or {}
            coordinates = element if "lat" in element and "lon" in element else element.get("center") or {}
            try:
                lat, lon = float(coordinates["lat"]), float(coordinates["lon"])
                if not (-90 <= lat <= 90 and -180 <= lon <= 180):
                    continue
                distance = haversine_m(latitude, longitude, lat, lon)
                if distance > radius_m:
                    continue
                kind, osm_number = element["type"], int(element["id"])
                if kind not in {"node", "way", "relation"}:
                    continue
            except (ValueError, TypeError, KeyError):
                continue
            name = tags.get("name")
            places.append(NearbyPlace(
                osm_id=f"{kind}/{osm_number}",
                name=name.strip() if isinstance(name, str) and name.strip() else None,
                category=category, latitude=lat, longitude=lon, distance_m=distance,
                address=_address(tags),
            ))
        places.sort(key=lambda place: place.distance_m)
        return places[:30]


_overpass = OverpassPlacesProvider()


def get_places_provider() -> PlacesProvider:
    provider = settings.places_provider.strip().lower()
    if provider == "overpass":
        return _overpass
    if provider == "postgis":
        return PostGISPlacesProvider()
    raise PlacesUnavailable
