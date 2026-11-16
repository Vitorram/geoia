"""Adaptador para geocodificaÃ§Ã£o Nominatim com limitaÃ§Ã£o de chamadas."""

import asyncio
import time
from typing import Protocol

import httpx

from app.core.config import settings
from app.schemas.location import GeocodeResult

NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search"


class GeocodingUnavailable(Exception):
    pass


class GeocodingRateLimited(Exception):
    pass


class Geocoder(Protocol):
    async def search(self, query: str) -> list[GeocodeResult]: ...


class NominatimGeocoder:
    def __init__(self) -> None:
        self._last_request = 0.0
        self._lock = asyncio.Lock()

    async def _respect_rate_limit(self) -> None:
        async with self._lock:
            wait = settings.geocoding_min_interval_seconds - (time.monotonic() - self._last_request)
            if wait > 0:
                await asyncio.sleep(wait)
            self._last_request = time.monotonic()

    async def search(self, query: str) -> list[GeocodeResult]:
        await self._respect_rate_limit()
        headers = {"User-Agent": settings.geocoding_user_agent}
        params = {"q": query, "format": "jsonv2", "addressdetails": 1, "limit": 5}
        try:
            async with httpx.AsyncClient(timeout=settings.geocoding_timeout_seconds) as client:
                response = await client.get(NOMINATIM_SEARCH_URL, params=params, headers=headers)
        except httpx.TimeoutException as exc:
            raise GeocodingUnavailable from exc
        except httpx.HTTPError as exc:
            raise GeocodingUnavailable from exc

        if response.status_code == 429:
            raise GeocodingRateLimited
        if response.status_code >= 500 or response.status_code in (408, 425):
            raise GeocodingUnavailable
        if response.status_code != 200:
            raise GeocodingUnavailable

        try:
            payload = response.json()
            results = []
            for item in payload:
                latitude = float(item["lat"])
                longitude = float(item["lon"])
                if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
                    continue
                address = item.get("display_name")
                if not isinstance(address, str) or not address.strip():
                    continue
                name = item.get("name") or address.split(",", maxsplit=1)[0]
                results.append(GeocodeResult(
                    name=str(name), formatted_address=address,
                    latitude=latitude, longitude=longitude,
                ))
            return results
        except (ValueError, TypeError, KeyError, AttributeError) as exc:
            raise GeocodingUnavailable from exc


def get_geocoder() -> Geocoder:
    provider = settings.geocoding_provider.strip().lower()
    if provider == "nominatim":
        return _nominatim
    raise GeocodingUnavailable


_nominatim = NominatimGeocoder()
