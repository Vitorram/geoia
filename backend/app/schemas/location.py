"""Schemas da funcionalidade de geolocalizaÃ§Ã£o."""

from pydantic import BaseModel, Field


class GeocodeResult(BaseModel):
    name: str
    formatted_address: str
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class GeocodeResponse(BaseModel):
    results: list[GeocodeResult]
