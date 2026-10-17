"""Fakes de los puertos para los tests: cumplen el mismo contrato que los adapters reales."""

from datetime import datetime
from pathlib import Path

from app.config.settings import Settings
from app.schemas.generated.models import RagQueryInternalRequest, RagQueryInternalResponse
from tests.support.service_jwt import AHORA, ParClavesServicio, escribir_clave_publica

_par_de_sesion: ParClavesServicio | None = None
_ruta_publica_de_sesion: Path | None = None


class RelojFijo:
    """`Clock` congelado: siempre el mismo instante."""

    def __init__(self, ahora: datetime = AHORA) -> None:
        self.valor = ahora

    def ahora(self) -> datetime:
        return self.valor


class ConsultaEvidenciaContadora:
    """`EvidenceQueryPort` que cuenta las invocaciones: con 401 el LLM (y todo lo que hay detrás) no se toca."""

    def __init__(self, respuesta: RagQueryInternalResponse) -> None:
        self.invocaciones = 0
        self._respuesta = respuesta

    async def consultar(self, solicitud: RagQueryInternalRequest) -> RagQueryInternalResponse:
        self.invocaciones += 1
        return self._respuesta


def usar_par_de_sesion(par: ParClavesServicio, directorio: Path) -> None:
    """Fija el par ES256 efímero de la sesión y escribe su pública (lo llama `conftest.py`)."""
    global _par_de_sesion, _ruta_publica_de_sesion
    _par_de_sesion = par
    _ruta_publica_de_sesion = escribir_clave_publica(par, directorio)


def par_de_sesion() -> ParClavesServicio:
    if _par_de_sesion is None:
        raise RuntimeError("par JWT no configurado: usa el fixture de sesión de conftest.py")
    return _par_de_sesion


class GeneradorTraceFijo:
    """`TraceIdGenerator` congelado: siempre el mismo `traceId` válido."""

    def __init__(self, valor: str = "req_00000001") -> None:
        self.valor = valor

    def nuevo(self) -> str:
        return self.valor


def settings_de_prueba(**cambios: object) -> Settings:
    """Settings sin leer el entorno ni archivos `.env` de la máquina, con la pública JWT de la sesión."""
    valores: dict[str, object] = {
        "service_jwt_public_key_file": _ruta_publica_de_sesion,
        # Con LLM_PROVIDER=local el arranque de /rag/query exige estos tres (RN-22); los tests usan los de FX-06a-a.
        "relevance_threshold": 0.30,
        "retrieval_top_k": 40,
        "rerank_top_n": 10,
        **cambios,
    }
    return Settings(_env_file=None, **valores)  # type: ignore[call-arg, arg-type]
