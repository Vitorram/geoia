"""Endpoints autenticados de localizaÃ§Ã£o."""

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.dependencies import get_current_user
from app.models.user import User
from app.schemas.location import GeocodeResponse
from app.services.geocoding import (
    GeocodingRateLimited,
    GeocodingUnavailable,
    get_geocoder,
)

router = APIRouter(prefix="/locations", tags=["locations"])


@router.get("/geocode", response_model=GeocodeResponse)
async def geocode_address(
    q: str = Query(min_length=3, max_length=200),
    _current_user: User = Depends(get_current_user),
) -> GeocodeResponse:
    query = " ".join(q.split())
    if len(query) < 3:
        raise HTTPException(status_code=422, detail="Informe um local com pelo menos 3 caracteres.")
    try:
        results = await get_geocoder().search(query)
    except GeocodingRateLimited:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Serviço de geolocalização temporariamente limitado. Tente novamente.",
            headers={"Retry-After": "2"},
        ) from None
    except GeocodingUnavailable:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Serviço de geolocalização indisponível. Tente novamente.",
        ) from None
    return GeocodeResponse(results=results)
