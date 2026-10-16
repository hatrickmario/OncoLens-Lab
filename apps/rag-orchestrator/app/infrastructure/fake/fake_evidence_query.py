"""Modo `LLM_PROVIDER=fake` (US-034 AC-6): respuestas fijas de `contracts/examples/` por pregunta de fixture."""

import json
from pathlib import Path

from app.schemas.generated.models import (
    RagQueryInternalRequest,
    RagQueryInternalResponse,
    RagQueryStatus,
)

_TARGET_RESPUESTA = "#/components/schemas/RagQueryInternalResponse"


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
        indice = json.loads((directorio / "index.json").read_text(encoding="utf-8"))
        respuestas: dict[str, RagQueryInternalResponse] = {}
        for entrada in indice["examples"]:
            if entrada["target"] != _TARGET_RESPUESTA:
                continue
            pregunta = _leer_pregunta(directorio / entrada["request"])
            respuestas[pregunta] = RagQueryInternalResponse.model_validate_json(
                (directorio / entrada["file"]).read_text(encoding="utf-8")
            )
        sin_evidencia = next(r for r in respuestas.values() if r.status == RagQueryStatus.sin_evidencia)
        return cls(respuestas, sin_evidencia)

    def select_fixture_response(self, query: str) -> RagQueryInternalResponse:
        """Selección por `query` exacta (sin espacios en los extremos); sin coincidencia, sin evidencia."""
        return self._respuestas_por_pregunta.get(query.strip(), self._sin_evidencia)

    async def consultar(self, solicitud: RagQueryInternalRequest) -> RagQueryInternalResponse:
        return self.select_fixture_response(solicitud.query)


def _leer_pregunta(archivo: Path) -> str:
    solicitud = RagQueryInternalRequest.model_validate_json(archivo.read_text(encoding="utf-8"))
    return solicitud.query.strip()
