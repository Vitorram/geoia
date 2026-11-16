from fastapi import APIRouter, Depends, HTTPException

from app.api.dependencies import get_current_user
from app.models.user import User
from app.schemas.ai_search import AISearchRequest, AISearchResponse
from app.services.ai_search import AIInvalidOutput, AIProviderTimeout, AIUnavailable, get_ai_provider
from app.services.places import (
    PlacesDatasetEmpty, PlacesRateLimited, PlacesTimeout, PlacesUnavailable,
    get_places_provider,
)

router = APIRouter(prefix="/ai", tags=["ai"])


@router.post("/search", response_model=AISearchResponse)
async def ai_search(payload: AISearchRequest, _user: User = Depends(get_current_user)) -> AISearchResponse:
    try:
        interpretation = await get_ai_provider().interpret(payload.message)
    except AIProviderTimeout:
        raise HTTPException(504, "O provedor de interpretação excedeu o tempo limite.") from None
    except AIInvalidOutput:
        raise HTTPException(502, "O provedor retornou uma interpretação inválida.") from None
    except AIUnavailable:
        raise HTTPException(503, "O serviço de interpretação não está configurado ou está indisponível.") from None

    results = []
    attribution = None
    if interpretation.intent == "find_places" and interpretation.category is not None:
        interpretation = interpretation.model_copy(update={"needs_location": payload.location is None})
        if payload.location is None:
            message = "Selecione uma localização ou autorize o uso da sua posição para buscar lugares próximos."
        else:
            try:
                places_provider = get_places_provider()
                results = await places_provider.nearby(
                    payload.location.latitude, payload.location.longitude,
                    interpretation.category, interpretation.radius_m,
                )
                attribution = getattr(places_provider, "attribution", None)
            except PlacesDatasetEmpty:
                raise HTTPException(503, "A base local de estabelecimentos ainda não foi importada.") from None
            except PlacesRateLimited:
                raise HTTPException(503, "A busca está temporariamente limitada.", headers={"Retry-After": "30"}) from None
            except PlacesTimeout:
                raise HTTPException(504, "A busca de estabelecimentos excedeu o tempo limite.") from None
            except PlacesUnavailable:
                raise HTTPException(503, "O serviço de estabelecimentos está indisponível.") from None
            message = "Encontrei estabelecimentos próximos." if results else "Não encontrei estabelecimentos nessa categoria e raio."
    elif interpretation.intent == "find_places":
        message = "Não reconheci uma categoria disponível. Tente pizzaria, restaurante, cafeteria, farmácia ou supermercado."
    else:
        interpretation = interpretation.model_copy(update={"needs_location": False})
        message = "Pode especificar qual tipo de estabelecimento deseja encontrar?"
    return AISearchResponse(interpretation=interpretation, results=results, message=message, attribution=attribution)
