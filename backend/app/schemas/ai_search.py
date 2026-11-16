from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.place import NearbyPlace, PlaceCategory


class GeoPointInput(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class AISearchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    message: str = Field(min_length=1, max_length=1000)
    location: GeoPointInput | None = None


class AIInterpretation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    intent: Literal["find_places", "clarify"]
    category: PlaceCategory | None
    radius_m: int = Field(ge=100, le=5000, strict=True)
    needs_location: bool = Field(strict=True)

    @model_validator(mode="after")
    def validate_intent_category(self) -> "AIInterpretation":
        if (self.intent == "find_places") != (self.category is not None):
            raise ValueError("intent and category are inconsistent")
        return self


class AISearchResponse(BaseModel):
    interpretation: AIInterpretation
    results: list[NearbyPlace]
    message: str
    attribution: str | None = None
