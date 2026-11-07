"""Modo `LLM_PROVIDER=fake` (US-034 AC-6): respuestas fijas de `contracts/examples/` por pregunta de fixture."""

import json
from pathlib import Path
from typing import TypeVar

from pydantic import BaseModel, ValidationError

from app.schemas.generated.models import (
    RagQueryInternalRequest,
    RagQueryInternalResponse,
    RagQueryStatus,
)

_TARGET_RESPUESTA = "#/components/schemas/RagQueryInternalResponse"
_Modelo = TypeVar("_Modelo", bound=BaseModel)


class EjemploFixtureInvalido(Exception):
    """Un ejemplo de `FAKE_RESPONSES_PATH` falta o no cumple el contrato; nombra el archivo, nunca su contenido."""


class FakeEvidenceQuery:
    """Implementa `EvidenceQueryPort` sin recuperación ni LLM; nunca inventa evidencia."""

    def __init__(
        self,
        respuestas_por_pregunta: dict[str, RagQueryInternalResponse],
        sin_evidencia: RagQueryInternalResponse,
    ) -> None:
        self._respuestas_por_pregunta = respuestas_por_pregunta
        self._sin_evidencia = sin_evidencia

    @classmethod
    def desde_directorio(cls, directorio: Path) -> "FakeEvidenceQuery":
        indice = _leer_json(directorio / "index.json")
        respuestas: dict[str, RagQueryInternalResponse] = {}
        for entrada in indice["examples"]:
            if entrada["target"] != _TARGET_RESPUESTA:
                continue
            solicitud = leer_ejemplo(directorio / entrada["request"], RagQueryInternalRequest)
            respuestas[solicitud.query.strip()] = leer_ejemplo(
                directorio / entrada["file"], RagQueryInternalResponse
            )
        sin_evidencia = next(
            (r for r in respuestas.values() if r.status == RagQueryStatus.sin_evidencia), None
        )
        if sin_evidencia is None:
            raise EjemploFixtureInvalido(
                "index.json no declara ninguna respuesta de fixture sin_evidencia"
            )
        return cls(respuestas, sin_evidencia)

    def select_fixture_response(self, query: str) -> RagQueryInternalResponse:
        """Selección por `query` exacta (sin espacios en los extremos); sin coincidencia, sin evidencia."""
        return self._respuestas_por_pregunta.get(query.strip(), self._sin_evidencia)

    def es_pregunta_de_fixture(self, query: str) -> bool:
        """``True`` si la `query` es la de algún ejemplo de ``index.json`` (el chat la trata como pregunta de evidencia)."""
        return query.strip() in self._respuestas_por_pregunta

    async def consultar(self, solicitud: RagQueryInternalRequest) -> RagQueryInternalResponse:
        return self.select_fixture_response(solicitud.query)


def _leer_json(archivo: Path) -> dict:
    try:
        return json.loads(archivo.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        raise EjemploFixtureInvalido(f"{archivo.name} falta o no es JSON válido") from None


def leer_ejemplo(archivo: Path, modelo: type[_Modelo]) -> _Modelo:
    try:
        return modelo.model_validate_json(archivo.read_text(encoding="utf-8"))
    except (OSError, ValidationError):
        raise EjemploFixtureInvalido(
            f"{archivo.name} falta o no cumple {modelo.__name__}"
        ) from None
