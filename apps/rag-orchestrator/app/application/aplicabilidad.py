"""``ApplicabilityService``: aplicabilidad por fuente recuperada con los criterios del catálogo (FR-25, US-122).

Sin puerto de LLM: es la garantía estructural de ADR-34 (b). La lectura de ``population_criteria`` (E/S) la hace el
orquestador con su borde fallando cerrado; este servicio solo compone las reglas puras de ``domain/``.
"""

from collections.abc import Collection, Mapping, Sequence
from dataclasses import dataclass, replace
from typing import get_args

from app.application.chunk_citable import ChunkCitable
from app.domain.aplicabilidad_tipos import (
    ESTADOS,
    MOTIVOS_INTERNOS,
    ContextoDelPaciente,
    CriterioEvaluado,
    PoblacionDelEstudio,
    OrigenDeMetadatos,
    ResumenDeEstados,
)
from app.domain.applicability_rules import (
    contar_estados,
    evaluar_criterio_de_fuente,
    fuente_mezcla_poblaciones,
    poblacion_no_comparable,
)
from app.domain.relevance import ordenar_por_relevancia
from app.domain.criterios_aplicabilidad import CriterioDeAplicabilidad, CriteriosDeAplicabilidad


@dataclass(frozen=True)
class AplicabilidadDeFuente:
    """Los criterios evaluados de un documento y su mejor chunk, del que salen las citas de los estructurados."""

    external_id: str
    mejor_chunk: ChunkCitable
    criterios: tuple[CriterioEvaluado, ...]
    resumen: ResumenDeEstados
    poblacion_no_comparable: bool
    poblacion: PoblacionDelEstudio | None = None
    """La población leída del catálogo del corpus: con ella se recalculan los criterios con los fragmentos que cita cada
    opción (US-243, ADR-47)."""

    def con_criterios(self, criterios: tuple[CriterioEvaluado, ...]) -> "AplicabilidadDeFuente":
        """La misma fuente con otros criterios evaluados: el resumen y la no comparabilidad se recalculan (RN-28)."""
        return replace(
            self,
            criterios=criterios,
            resumen=contar_estados(criterios),
            poblacion_no_comparable=poblacion_no_comparable(criterios),
        )


ORIGENES_CONOCIDOS = frozenset(get_args(OrigenDeMetadatos))
"""Los orígenes que declara el catálogo (``pendiente`` incluido, US-123); cualquier otro valor se omite: no se puede
saber qué garantiza (RN-25)."""


def mejor_chunk_por_documento(citables: Mapping[str, ChunkCitable]) -> dict[str, ChunkCitable]:
    """El chunk de mayor ``relevance_score`` de cada documento (desempate de ``ordenar_por_relevancia``). El orden de
    los documentos del resultado no es parte del contrato: lo fija ``ApplicabilityService.evaluar``."""
    por_chunk = {c.chunk.chunk_id: c for c in citables.values()}
    mejores: dict[str, ChunkCitable] = {}
    for chunk in ordenar_por_relevancia([c.chunk for c in citables.values()]):
        mejores.setdefault(chunk.document_id, por_chunk[chunk.chunk_id])
    return mejores


class ApplicabilityService:
    def __init__(self, criterios: CriteriosDeAplicabilidad) -> None:
        self._criterios = criterios

    def criterios_del(self, tipo_de_cancer: str) -> tuple[CriterioDeAplicabilidad, ...]:
        return self._criterios.criterios(tipo_de_cancer)

    def evaluar(
        self,
        tipo_de_cancer: str,
        contexto: ContextoDelPaciente,
        mejores_chunks: Mapping[str, ChunkCitable],
        poblaciones: Mapping[str, PoblacionDelEstudio],
    ) -> tuple[AplicabilidadDeFuente, ...]:
        """Una ``AplicabilidadDeFuente`` por documento con fila de población, criterios en el orden del catálogo.

        Un documento ``pendiente`` entra con todos sus criterios sin valor estructurado: el camino textual (US-123) decide
        qué se acepta, y lo que no queda ``desconocido`` (decidido, usuario, 2026-10-27). Un documento sin fila de
        población, o con un origen que el catálogo no declara, se omite. El orden entre documentos es por relevancia de su mejor chunk y, a igualdad, ``externalId``:
        determinista y sin significado clínico (RN-03)."""
        criterios = self.criterios_del(tipo_de_cancer)
        if not criterios:
            return ()  # sin criterios en el catálogo no hay nada que comparar: applicability = []
        fuentes = [
            _aplicabilidad_de(mejor, criterios, contexto, poblaciones[documento])
            for documento, mejor in mejores_chunks.items()
            if documento in poblaciones
            and poblaciones[documento].metadata_source in ORIGENES_CONOCIDOS
        ]
        return tuple(sorted(fuentes, key=_orden_por_relevancia))

    def con_chunks_citados(
        self,
        tipo_de_cancer: str,
        contexto: ContextoDelPaciente,
        fuente: AplicabilidadDeFuente,
        chunk_ids: Collection[str],
    ) -> AplicabilidadDeFuente:
        """La fuente con los criterios de población en lista recalculados con los valores de ``chunk_ids`` (los fragmentos
        que cita la opción, ADR-47): ningún otro fragmento del documento entra. Un criterio sin valores en la lista (p. ej.
        el aceptado por el camino textual) conserva su evaluación."""
        if fuente.poblacion is None:
            return fuente
        catalogo = {c.clave: c for c in self.criterios_del(tipo_de_cancer)}
        mezcla = fuente_mezcla_poblaciones(fuente.mejor_chunk.ficha.study_design)
        return fuente.con_criterios(
            tuple(
                _recalculado(evaluado, catalogo, contexto, fuente.poblacion, chunk_ids, mezcla)
                for evaluado in fuente.criterios
            )
        )


def _recalculado(
    evaluado: CriterioEvaluado,
    catalogo: Mapping[str, CriterioDeAplicabilidad],
    contexto: ContextoDelPaciente,
    poblacion: PoblacionDelEstudio,
    chunk_ids: Collection[str],
    fuente_mezcla: bool,
) -> CriterioEvaluado:
    criterio = catalogo.get(evaluado.clave)
    en_lista = None if criterio is None else poblacion.criterios.get(criterio.clave_de_estudio)
    if criterio is None or en_lista is None or not en_lista.valores:
        return evaluado
    recalculado = evaluar_criterio_de_fuente(
        criterio, contexto, poblacion, chunk_ids, fuente_mezcla=fuente_mezcla
    )
    if evaluado.chunk_citado_id is not None and not recalculado.valores_del_estudio:
        return evaluado  # el valor aceptado por texto (US-123) no se pisa si la lista no dice nada en estos fragmentos
    return recalculado


def _aplicabilidad_de(
    mejor: ChunkCitable,
    criterios: Sequence[CriterioDeAplicabilidad],
    contexto: ContextoDelPaciente,
    poblacion: PoblacionDelEstudio,
) -> AplicabilidadDeFuente:
    """Sin opción que cite fragmentos, la unidad es el mejor chunk del documento (el mismo que cita la fuente)."""
    mezcla = fuente_mezcla_poblaciones(mejor.ficha.study_design)
    evaluados = tuple(
        evaluar_criterio_de_fuente(
            c, contexto, poblacion, (mejor.chunk.chunk_id,), fuente_mezcla=mezcla
        )
        for c in criterios
    )
    return AplicabilidadDeFuente(
        external_id=mejor.ficha.external_id,
        mejor_chunk=mejor,
        criterios=evaluados,
        resumen=contar_estados(evaluados),
        poblacion_no_comparable=poblacion_no_comparable(evaluados),
        poblacion=poblacion,
    )


def _orden_por_relevancia(fuente: AplicabilidadDeFuente) -> tuple[float, str]:
    return -fuente.mejor_chunk.chunk.relevance_score, fuente.external_id


def formas_invalidas_para_el_log(
    poblaciones: Mapping[str, PoblacionDelEstudio],
) -> list[tuple[str, str | None]]:
    """``(criterio, chunkId)`` de cada criterio cuya lista se descartó por forma inválida (US-241 D6), en el orden de
    documento y criterio. Solo la clave del criterio y el ID del fragmento del corpus público: nunca el valor (RN-14).
    La marca ``pendiente`` es una forma válida y no figura."""
    return [
        (clave, criterio.invalidez.chunk_id)
        for documento in sorted(poblaciones)
        for clave, criterio in poblaciones[documento].criterios.items()
        if criterio.invalidez is not None
    ]


def conflictos_para_el_log(fuentes: Sequence[AplicabilidadDeFuente]) -> list[tuple[str, str]]:
    """``(criterio, chunkId)`` de cada fragmento que participa en un conflicto de valores (US-243), por fuente y criterio.
    Solo la clave del criterio y el ID del fragmento del corpus público: nunca el valor ni el texto (RN-14)."""
    return [
        (criterio.clave, chunk_id)
        for fuente in fuentes
        for criterio in fuente.criterios
        if criterio.causa == "valores_en_conflicto"
        for chunk_id in dict.fromkeys(v.chunk_id for v in criterio.valores_del_estudio)
        if chunk_id is not None
    ]


def recuentos_para_el_log(fuentes: Sequence[AplicabilidadDeFuente]) -> dict[str, int]:
    """Solo recuentos: documentos, criterios por estado y ``desconocido`` por motivo interno (design D2b).

    Nunca un valor del paciente ni del estudio, ni texto de chunks (RN-10, RN-25): el log no puede reconstruirlos."""
    criterios = [c for fuente in fuentes for c in fuente.criterios]
    recuentos = {"documentos": len(fuentes)}
    for estado in ESTADOS:
        recuentos[estado] = sum(1 for c in criterios if c.estado == estado)
    for motivo in MOTIVOS_INTERNOS:
        recuentos[motivo] = sum(1 for c in criterios if c.motivo_interno == motivo)
    return recuentos
