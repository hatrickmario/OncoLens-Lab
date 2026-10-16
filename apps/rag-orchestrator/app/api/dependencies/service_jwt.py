"""Dependencia de FastAPI que exige el JWT de servicio en los endpoints internos (nunca en `GET /health`)."""

from collections.abc import Awaitable, Callable

from fastapi import Request

from app.application.ports import ServiceTokenVerifierPort

DependenciaJwtServicio = Callable[[Request], Awaitable[None]]


def crear_require_service_jwt(verificador: ServiceTokenVerifierPort) -> DependenciaJwtServicio:
    async def require_service_jwt(request: Request) -> None:
        raise NotImplementedError

    return require_service_jwt
