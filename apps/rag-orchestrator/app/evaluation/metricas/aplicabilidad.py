"""Métricas puras de la familia `aplicabilidad` (US-132): concordancia de estados, M-08.2 y M-08.6, sin E/S."""

from __future__ import annotations

from collections.abc import Collection, Mapping, Sequence
from dataclasses import dataclass

from app.domain.aplicabilidad_tipos import ContextoDelPaciente, CriterioEvaluado
from app.domain.criterios_aplicabilidad import CriterioDeAplicabilidad

METRICA_COINCIDE_SIN_CITA = "criterios_coincide_sin_cita"
METRICA_VALORES_NO_COPIADOS = "valores_paciente_no_copiados"


@dataclass(frozen=True)
class Esperado:
    """Lo que un humano espera de un criterio: su estado y, si es ``desconocido`` con causa en el contrato, la causa."""

    estado: str
    causa: str | None = None


@dataclass(frozen=True)
class Concordancia:
    aciertos: int
    total: int


@dataclass(frozen=True)
class ParEvaluado:
    """Un par paciente-fuente evaluado: lo esperado, lo obtenido y lo necesario para medir M-08.2 y M-08.6."""

    id: str
    esperados: Mapping[str, Esperado]
    criterios: tuple[CriterioEvaluado, ...]
    contexto: ContextoDelPaciente
    chunk_ids_de_la_fuente: frozenset[str]
    catalogo: Mapping[str, CriterioDeAplicabilidad]
    omitidas: int = 0


def concordancia_de_estados(
    esperados: Mapping[str, Esperado], obtenidos: Sequence[CriterioEvaluado]
) -> Concordancia:
    raise NotImplementedError("no implementado")


def coincide_sin_cita(
    criterios: Sequence[CriterioEvaluado], chunk_ids_de_la_fuente: Collection[str]
) -> int:
    raise NotImplementedError("no implementado")


def valores_no_copiados(
    criterios: Sequence[CriterioEvaluado],
    contexto: ContextoDelPaciente,
    catalogo: Mapping[str, CriterioDeAplicabilidad],
) -> int:
    raise NotImplementedError("no implementado")


def veredicto_de_invariantes(sin_cita: int, no_copiados: int) -> list[str]:
    raise NotImplementedError("no implementado")
