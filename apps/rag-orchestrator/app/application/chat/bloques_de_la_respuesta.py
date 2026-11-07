"""Los bloques del turno de evidencia a partir de un análisis (``/rag/query``): reglas puras, sin E/S (US-265, RN-23, RN-28).

Una sola definición para el nodo ``evidencia`` real y para el modo ``LLM_PROVIDER=fake``: lo único que cambia es de dónde
salen las citas (``ChatCitation``: el corpus real o, en el modo falso, la ficha de la fuente citada).
"""

from __future__ import annotations

from collections.abc import Mapping

from app.application.chat.citas import FuenteDeCita
from app.domain.chat.bloques_de_evidencia import (
    CriterioParaMostrar,
    texto_de_la_opcion,
    texto_de_los_faltantes,
)
from app.domain.chat.fuentes_limitaciones import texto_de_limitaciones_de_la_recuperacion
from app.domain.chat.mensajes import MENSAJE_SIN_OPCIONES_CON_SOPORTE, ORDEN_POR_APLICABILIDAD
from app.domain.chat.turno import BloqueDelTurno, CitaDelBloque, TipoDeBloque
from app.schemas.generated.models import EvidenceOption, RagQueryInternalResponse, RagQueryStatus


def fuentes_citadas_por_las_opciones(respuesta: RagQueryInternalResponse) -> list[FuenteDeCita]:
    """Cada fuente citada por las opciones mostradas, en el orden de las opciones (un chunk puede repetirse)."""
    return [
        FuenteDeCita(c.chunkId, c.title, c.chunkTextSnapshot)
        for opcion in respuesta.evidenceOptions
        for c in opcion.citedSources
    ]


def armar_bloques_de_evidencia(
    respuesta: RagQueryInternalResponse,
    citas: Mapping[str, CitaDelBloque],
    fragmentos_evaluados: int,
) -> tuple[BloqueDelTurno, ...]:
    """Un bloque `evidencia` con las opciones en el orden de RN-28 y sus citas del corpus; sin opciones, la limitación
    determinista de ``/rag/query`` (RN-02) con el alcance de la recuperación, o el aviso de que ninguna opción tuvo
    soporte. ``citas`` trae una ``CitaDelBloque`` por ``chunkId`` citado."""
    if respuesta.status is RagQueryStatus.sin_evidencia:
        return (
            *(BloqueDelTurno(TipoDeBloque.limitacion, lim.text) for lim in respuesta.limitations),
            _limitacion_del_alcance(respuesta, fragmentos_evaluados),
        )
    if not respuesta.evidenceOptions:
        return (
            BloqueDelTurno(TipoDeBloque.limitacion, MENSAJE_SIN_OPCIONES_CON_SOPORTE),
            _limitacion_del_alcance(respuesta, fragmentos_evaluados),
        )
    por_fuente = _criterios_por_fuente(respuesta)
    total = len(respuesta.evidenceOptions)
    mostrados: list[CriterioParaMostrar] = []
    bloques: list[BloqueDelTurno] = []
    for numero, opcion in enumerate(respuesta.evidenceOptions, start=1):
        criterios = _criterios_de_la_opcion(opcion, por_fuente)
        mostrados += criterios
        ids = dict.fromkeys(c.chunkId for c in opcion.citedSources)
        texto = texto_de_la_opcion(numero, total, opcion.option, opcion.rationale, criterios)
        bloques.append(
            BloqueDelTurno(TipoDeBloque.evidencia, texto, citas=tuple(citas[i] for i in ids))
        )
    bloques.append(BloqueDelTurno(TipoDeBloque.catalogo, ORDEN_POR_APLICABILIDAD))
    faltantes = texto_de_los_faltantes(mostrados)
    if faltantes is not None:
        bloques.append(BloqueDelTurno(TipoDeBloque.faltante, faltantes))
    bloques += [BloqueDelTurno(TipoDeBloque.limitacion, lim.text) for lim in respuesta.limitations]
    return tuple(bloques)


def criterios_de_las_opciones(
    respuesta: RagQueryInternalResponse,
) -> tuple[CriterioParaMostrar, ...]:
    """Los criterios de aplicabilidad de las opciones MOSTRADAS del análisis (no las de las descartadas)."""
    por_fuente = _criterios_por_fuente(respuesta)
    return tuple(
        c for o in respuesta.evidenceOptions for c in _criterios_de_la_opcion(o, por_fuente)
    )


def _limitacion_del_alcance(
    respuesta: RagQueryInternalResponse, fragmentos_evaluados: int
) -> BloqueDelTurno:
    """El bloque con el alcance de la recuperación (US-266): fecha de corte, fuentes no incluidas y fragmentos evaluados."""
    return BloqueDelTurno(
        TipoDeBloque.limitacion,
        texto_de_limitaciones_de_la_recuperacion(
            respuesta.meta.corpusCutoffDate,
            respuesta.meta.excludedSources,
            fragmentos_evaluados,
        ),
    )


def _criterios_de_la_opcion(
    opcion: EvidenceOption, por_fuente: dict[str, tuple[CriterioParaMostrar, ...]]
) -> tuple[CriterioParaMostrar, ...]:
    """Los criterios de las fuentes que cita la opción, en el orden de sus fuentes y sin repetir la fuente."""
    externos = dict.fromkeys(c.externalId for c in opcion.citedSources)
    return tuple(c for e in externos for c in por_fuente.get(e, ()))


def _criterios_por_fuente(
    respuesta: RagQueryInternalResponse,
) -> dict[str, tuple[CriterioParaMostrar, ...]]:
    """Los criterios de aplicabilidad de cada fuente (``externalId``), tal como los calculó ``/rag/query``."""
    return {
        fuente.externalId: tuple(
            CriterioParaMostrar(
                c.criterion,
                c.status.value,
                c.unknownReason.value if c.unknownReason is not None else None,
            )
            for c in fuente.criteria
        )
        for fuente in respuesta.applicability
    }


__all__ = [
    "armar_bloques_de_evidencia",
    "criterios_de_las_opciones",
    "fuentes_citadas_por_las_opciones",
]
