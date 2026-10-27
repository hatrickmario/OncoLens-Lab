"""``ApplicabilityService``: aplicabilidad por fuente recuperada con los criterios del catálogo (FR-25, US-122).

Sin puerto de LLM: es la garantía estructural de ADR-34 (b). La lectura de ``population_criteria`` (E/S) la hace el
orquestador con su borde fallando cerrado; este servicio solo compone las reglas puras de ``domain/``.
"""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass

from app.application.chunk_citable import ChunkCitable
from app.domain.aplicabilidad_tipos import (
    ESTADOS,
    MOTIVOS_INTERNOS,
    ContextoDelPaciente,
    CriterioEvaluado,
    PoblacionDelEstudio,
    ResumenDeEstados,
)
from app.domain.applicability_rules import (
    contar_estados,
    evaluar_criterio_de_fuente,
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


ORIGENES_ESTRUCTURADOS = frozenset({"fuente_estructurada", "extraido_verificado"})
"""Solo estos orígenes cuentan como población estructurada; ``pendiente`` y cualquier otro valor se omiten (RN-25)."""


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
        """Una ``AplicabilidadDeFuente`` por documento con población estructurada, criterios en el orden del catálogo.

        Un documento ``pendiente`` (o sin fila de población) se omite: decir «no reportado» atribuiría a la fuente algo
        que nadie verificó (RN-25). El orden entre documentos es por relevancia de su mejor chunk y, a igualdad,
        ``externalId``: determinista y sin significado clínico (RN-03)."""
        criterios = self.criterios_del(tipo_de_cancer)
        if not criterios:
            return ()  # sin criterios en el catálogo no hay nada que comparar: applicability = []
        fuentes = [
            _aplicabilidad_de(mejor, criterios, contexto, poblaciones[documento])
            for documento, mejor in mejores_chunks.items()
            if documento in poblaciones
            and poblaciones[documento].metadata_source in ORIGENES_ESTRUCTURADOS
        ]
        return tuple(sorted(fuentes, key=_orden_por_relevancia))


def _aplicabilidad_de(
    mejor: ChunkCitable,
    criterios: Sequence[CriterioDeAplicabilidad],
    contexto: ContextoDelPaciente,
    poblacion: PoblacionDelEstudio,
) -> AplicabilidadDeFuente:
    evaluados = tuple(evaluar_criterio_de_fuente(c, contexto, poblacion) for c in criterios)
    return AplicabilidadDeFuente(
        external_id=mejor.ficha.external_id,
        mejor_chunk=mejor,
        criterios=evaluados,
        resumen=contar_estados(evaluados),
        poblacion_no_comparable=poblacion_no_comparable(evaluados),
    )


def _orden_por_relevancia(fuente: AplicabilidadDeFuente) -> tuple[float, str]:
    return -fuente.mejor_chunk.chunk.relevance_score, fuente.external_id


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
