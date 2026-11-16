"""Busca autenticada e limitada de estabelecimentos próximos."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.dependencies import get_current_user
from app.models.user import User
from app.schemas.place import NearbyPlacesRequest, NearbyPlacesResponse
from app.services.places import PlacesDatasetEmpty, PlacesRateLimited, PlacesTimeout, PlacesUnavailable, get_places_provider

router = APIRouter(prefix="/places", tags=["places"])


@router.get("/nearby", response_model=NearbyPlacesResponse)
async def nearby_places(
    params: Annotated[NearbyPlacesRequest, Query()],
    _current_user: User = Depends(get_current_user),
) -> NearbyPlacesResponse:
    provider = get_places_provider()
    try:
        results = await provider.nearby(
            params.latitude, params.longitude, params.category, params.radius_m,
        )
    except PlacesRateLimited as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="A busca de lugares está temporariamente limitada. Tente novamente mais tarde.",
            headers={"Retry-After": str(exc.retry_after or 30)},
        ) from None
    except PlacesTimeout:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="A busca de lugares excedeu o tempo limite. Tente novamente.",
        ) from None
    except PlacesDatasetEmpty:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="A base local de estabelecimentos ainda não foi importada.",
        ) from None
    except PlacesUnavailable as exc:
        headers = {"Retry-After": str(exc.retry_after)} if exc.retry_after is not None else None
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="O serviço de busca de lugares está indisponível. Tente novamente.",
            headers=headers,
        ) from None
    return NearbyPlacesResponse(results=results, attribution=getattr(provider, "attribution", None))
