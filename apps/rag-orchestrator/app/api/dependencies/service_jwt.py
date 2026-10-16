"""Dependencia de FastAPI que exige el JWT de servicio en los endpoints internos (nunca en `GET /health`).

Lanza `TokenServicioInvalido`; `errors.py` la convierte en 401. No usa `Header()`: un encabezado obligatorio
faltante terminaría como 422 en lugar de 401.

Se monta con una clase de ruta (`crear_router_interno`) y no con `Depends`: FastAPI lee y parsea el cuerpo
antes de resolver las dependencias, así que un JSON ilegible sin token recibiría 422. Aquí la autenticación
corre antes que el cuerpo (D2).
"""

from collections.abc import Awaitable, Callable

from fastapi import APIRouter, Request, Response
from fastapi.routing import APIRoute

from app.application.ports import ServiceTokenVerifierPort

DependenciaJwtServicio = Callable[[Request], Awaitable[None]]


def crear_require_service_jwt(verificador: ServiceTokenVerifierPort) -> DependenciaJwtServicio:
    async def require_service_jwt(request: Request) -> None:
        # Solo `Authorization`: la cookie de sesión del doctor nunca se lee ni se registra (SEG-07).
        verificador.verificar(_token_bearer(request.headers.get("Authorization")))

    return require_service_jwt


def crear_router_interno(autenticacion: DependenciaJwtServicio, *, tags: list[str]) -> APIRouter:
    """Única forma de crear un router interno de rag: toda ruta suya exige el JWT de servicio antes del cuerpo."""
    return APIRouter(tags=list(tags), route_class=_crear_ruta_autenticada(autenticacion))


def _crear_ruta_autenticada(autenticacion: DependenciaJwtServicio) -> type[APIRoute]:

    class RutaAutenticada(APIRoute):
        def get_route_handler(self) -> Callable[[Request], Awaitable[Response]]:
            manejador = super().get_route_handler()

            async def autenticar_y_manejar(request: Request) -> Response:
                await autenticacion(request)
                return await manejador(request)

            return autenticar_y_manejar

    return RutaAutenticada


def _token_bearer(cabecera: str | None) -> str | None:
    if cabecera is None:
        return None
    esquema, _, token = cabecera.partition(" ")
    return token.strip() if esquema.lower() == "bearer" else None
