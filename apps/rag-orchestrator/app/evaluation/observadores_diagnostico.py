"""Observadores de la familia `diagnostico` (US-276, D2): decoran los puertos del servicio de consulta y anotan, por pregunta,
lo que vio cada etapa sin cambiar su comportamiento: el orden denso (``ChunkSearch``), los pares y los puntajes del
*reranker*, la propuesta del generador y el veredicto del NLI por afirmación.

Los eventos ``rag_query_*`` de producción no traen el puntaje por chunk ni la ``p_entailment`` por afirmación, y añadírselos
cambiaría producción y pondría puntajes por chunk en los logs; por eso se observan los mismos puertos alrededor de los que
se emiten. Lo anotado vive solo en memoria, como ids, puestos y puntajes: nunca el texto de una pregunta, de un chunk ni de
una afirmación (RN-14). Cada observador cumple el contrato del puerto que decora (LSP): mismas firmas, mismos errores, la
lista vacía no invoca el modelo.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field

from app.application.ports import (
    CandidatoParaReranker,
    ChunkEncontrado,
    ChunkSearch,
    EvidenceGenerator,
    EvidenciaGenerada,
    NliClassifier,
    Reranker,
    ResultadoDeRecuperacion,
)
from app.domain.nli import ParNli, ResultadoNli
from app.evaluation.metricas.diagnostico import (
    AfirmacionJuzgada,
    CandidatoObservado,
    LoopObservado,
    afirmaciones_juzgadas,
)
from app.schemas.generated.models import RagQueryInternalRequest


@dataclass(frozen=True)
class _Busqueda:
    resultados: tuple[CandidatoObservado, ...]


@dataclass(frozen=True)
class _Reranking:
    pares: tuple[str, ...]
    puntajes: tuple[float, ...]


@dataclass
class RegistroDeDiagnostico:
    """Lo que vieron los puertos durante UNA consulta; ``reiniciar()`` lo vacía antes de la siguiente."""

    eventos: list[_Busqueda | _Reranking] = field(default_factory=list)
    opciones_propuestas: list[int] = field(default_factory=list)
    """Opciones que propuso el generador en cada invocación (vacío = el generador no se invocó)."""
    afirmaciones: list[AfirmacionJuzgada] = field(default_factory=list)
    """Una por afirmación que llegó al NLI; vacío = el NLI no recibió nada (≠ ninguna aprobada)."""

    def reiniciar(self) -> None:
        self.eventos.clear()
        self.opciones_propuestas.clear()
        self.afirmaciones.clear()

    def loops(self) -> list[LoopObservado]:
        """Cada loop busca dos veces (la pregunta y el resumen del contexto) y, si hubo candidatos, puntúa una vez.

        Los candidatos de las dos búsquedas se unen sin repetir chunks (gana la primera, la de la pregunta), como hace el
        servicio; el orden y el corte a ``RETRIEVAL_TOP_K`` los aplica quien interpreta el loop."""
        loops: list[LoopObservado] = []
        busquedas: list[_Busqueda] = []
        for evento in self.eventos:
            if isinstance(evento, _Busqueda):
                busquedas.append(evento)
                if len(busquedas) == BUSQUEDAS_POR_LOOP:
                    loops.append(LoopObservado(_unir(busquedas)))
                    busquedas = []
            elif loops:
                loops[-1] = LoopObservado(loops[-1].candidatos, evento.pares, evento.puntajes)
        return loops


BUSQUEDAS_POR_LOOP = 2
"""``RAGOrchestratorService._recuperar_dense`` busca con el texto de búsqueda y con el resumen del contexto clínico."""


def _unir(busquedas: Sequence[_Busqueda]) -> tuple[CandidatoObservado, ...]:
    unidos: dict[str, CandidatoObservado] = {}
    for busqueda in busquedas:
        for candidato in busqueda.resultados:
            unidos.setdefault(candidato.chunk_id, candidato)
    return tuple(unidos.values())


class BuscadorDeDiagnostico:
    def __init__(self, interno: ChunkSearch, registro: RegistroDeDiagnostico) -> None:
        self._interno, self._registro = interno, registro

    def search_dense(
        self, vector: Sequence[float], limit: int, filtro: str | None = None
    ) -> list[ChunkEncontrado]:
        encontrados = self._interno.search_dense(vector, limit, filtro)
        self._registro.eventos.append(
            _Busqueda(tuple(CandidatoObservado(c.chunk_id, c.similitud_dense) for c in encontrados))
        )
        return encontrados


class RerankerDeDiagnostico:
    def __init__(self, interno: Reranker, registro: RegistroDeDiagnostico) -> None:
        self._interno, self._registro = interno, registro

    @property
    def version(self) -> str:
        return self._interno.version

    def puntuar(self, pregunta: str, candidatos: Sequence[CandidatoParaReranker]) -> list[float]:
        puntajes = self._interno.puntuar(pregunta, candidatos)
        self._registro.eventos.append(
            _Reranking(tuple(c.chunk_id for c in candidatos), tuple(puntajes))
        )
        return puntajes


class GeneradorDeDiagnostico:
    def __init__(self, interno: EvidenceGenerator, registro: RegistroDeDiagnostico) -> None:
        self._interno, self._registro = interno, registro

    async def generar(
        self, solicitud: RagQueryInternalRequest, recuperacion: ResultadoDeRecuperacion
    ) -> EvidenciaGenerada:
        evidencia = await self._interno.generar(solicitud, recuperacion)
        self._registro.opciones_propuestas.append(len(evidencia.opciones))
        return evidencia


class NliDeDiagnostico:
    """Anota, por afirmación, la ``p_entailment`` máxima de sus premisas y si el soporte la aprueba con ``umbral``."""

    def __init__(
        self, interno: NliClassifier, registro: RegistroDeDiagnostico, umbral: float
    ) -> None:
        self._interno, self._registro, self._umbral = interno, registro, umbral

    @property
    def version(self) -> str:
        return self._interno.version

    def clasificar(self, pares: list[ParNli]) -> list[ResultadoNli]:
        resultados = self._interno.clasificar(pares)
        if pares:  # un lote vacío no invoca el modelo: no hay nada que anotar
            self._registro.afirmaciones.extend(
                afirmaciones_juzgadas(pares, resultados, self._umbral)
            )
        return resultados
