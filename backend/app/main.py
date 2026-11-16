"""Ponto de entrada da API GeoIA."""

from fastapi import APIRouter, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.api.routes.auth import router as auth_router
from app.api.routes.health import router as health_router
from app.api.routes.locations import router as locations_router
from app.api.routes.places import router as places_router
from app.api.routes.users import router as users_router

app = FastAPI(title="GeoIA API", version="0.1.0")
app.include_router(health_router)

api_v1_router = APIRouter(prefix="/api/v1")
api_v1_router.include_router(auth_router)
api_v1_router.include_router(users_router)
api_v1_router.include_router(locations_router)
api_v1_router.include_router(places_router)
app.include_router(api_v1_router)


class RedactNearbyCoordinatesFromAccessLog:
    """Oculta query params da rota sensível no access log do ASGI server."""

    def __init__(self, downstream):
        self.downstream = downstream

    async def __call__(self, scope, receive, send):
        if scope.get("type") != "http" or scope.get("path") != "/api/v1/places/nearby":
            await self.downstream(scope, receive, send)
            return

        async def send_without_query(message):
            if message.get("type") == "http.response.start":
                original_query = scope.get("query_string", b"")
                original_raw_path = scope.get("raw_path")
                scope["query_string"] = b""
                scope["raw_path"] = scope["path"].encode("ascii")
                try:
                    await send(message)
                finally:
                    scope["query_string"] = original_query
                    if original_raw_path is not None:
                        scope["raw_path"] = original_raw_path
                return
            await send(message)

        await self.downstream(scope, receive, send_without_query)


app.add_middleware(RedactNearbyCoordinatesFromAccessLog)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """Retorna erros de validação sem incluir os valores recebidos."""
    safe_errors = [
        {"loc": error["loc"], "msg": error["msg"], "type": error["type"]}
        for error in exc.errors()
    ]
    return JSONResponse(status_code=422, content={"detail": safe_errors})
