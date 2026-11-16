"""Schemas validados da busca limitada de estabelecimentos."""

from enum import Enum

from pydantic import BaseModel, Field


class PlaceCategory(str, Enum):
    PIZZARIA = "pizzaria"
    RESTAURANTE = "restaurante"
    CAFETERIA = "cafeteria"
    FARMACIA = "farmácia"
    SUPERMERCADO = "supermercado"


class NearbyPlacesRequest(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    category: PlaceCategory
    radius_m: int = Field(default=3000, gt=0, le=5000)


class NearbyPlace(BaseModel):
    osm_id: str
    name: str | None = None
    category: PlaceCategory
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    distance_m: int = Field(ge=0)
    address: str | None = None


class NearbyPlacesResponse(BaseModel):
    results: list[NearbyPlace]
