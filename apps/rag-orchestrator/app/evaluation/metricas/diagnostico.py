"""Reglas puras de la familia `diagnostico` (US-276, L1D-334): sin E/S, sin adaptadores, probadas con datos de dominio.

Dónde se pierde el fragmento esperado cuando dos redacciones del mismo significado dan resultados distintos: la etapa
responsable de cada par (RN-02, RN-01), el recuento por etapa y el histograma de ``p_entailment`` de lo que el NLI descartó.
El corte a los pares del *reranker*, el umbral y el soporte NO se reescriben aquí: se reutilizan las reglas del dominio
(``recortar_a_pares_del_reranker``, ``supera_umbral``, ``soporta``), cada una con un solo dueño.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Final

from app.domain.nli import ParNli, ResultadoNli
from app.domain.pares_del_reranker import recortar_a_pares_del_reranker
from app.domain.relevance import supera_umbral
from app.domain.support import soporta
from app.evaluation.dataset_loader import Evidencia
from app.evaluation.fuente_dataset import ChunkCorpus
from app.evaluation.retrieval_metrics import contiene_cita

ETAPAS: Final = ("recuperacion_densa", "corte_de_pares", "umbral_de_relevancia", "nli")
"""Las etapas del *pipeline* a las que se asigna una pérdida, en su orden."""
CAUSAS_SIN_ASIGNAR: Final = ("sin_opciones_generadas", "citas")
RESULTADO_SIN_PERDIDA: Final = "sin_perdida"
RESULTADO_PERDIDA: Final = "perdida"
RESULTADO_SIN_ASIGNAR: Final = "sin_asignar"

CONDICIONES_DE_LA_REGLA: Final = (
    "el fragmento esperado no está entre los RETRIEVAL_TOP_K candidatos densos",
    "el fragmento esperado es candidato y queda fuera de los RERANKER_MAX_PAIRS pares del reranker",
    "el fragmento esperado fue puntuado y su relevance_score no supera RELEVANCE_THRESHOLD",
    "el fragmento esperado supera el umbral, hubo opciones con citas válidas y ninguna pasó el soporte del NLI",
)
"""La condición de cada etapa, escrita en el informe (AC-2): la regla elige la PRIMERA que el fragmento no supera."""
NOTA_DE_CALIBRACION: Final = "El informe no propone un valor de NLI_ENTAILMENT_THRESHOLD: cambiarlo exige una calibración con etiquetas humanas."
REGLA_DE_ASIGNACION: Final = tuple(zip(range(1, 5), ETAPAS, CONDICIONES_DE_LA_REGLA, strict=True))


# --- el fragmento esperado -------------------------------------------------------------------------------------------


def chunks_esperados_de(
    evidencia: Sequence[Evidencia], chunks: Sequence[ChunkCorpus]
) -> tuple[str, ...]:
    """Ids de los chunks del corpus cuyo documento es el esperado y cuyo texto contiene la cita literal (en el orden del corpus)."""
    return tuple(
        c.id
        for c in chunks
        if any(c.documento == e.documento and contiene_cita(c.texto, e.cita) for e in evidencia)
    )


@dataclass(frozen=True)
class CandidatoObservado:
    """Un candidato denso tal como lo vio la búsqueda: cumple ``CandidatoRecuperado`` del dominio."""

    chunk_id: str
    puntaje_de_recuperacion: float


@dataclass(frozen=True)
class LoopObservado:
    """Un loop de recuperación: los candidatos densos y, si el *reranker* se invocó, lo que recibió y puntuó."""

    candidatos: tuple[CandidatoObservado, ...]
    pares: tuple[str, ...] | None = None
    puntajes: tuple[float, ...] | None = None


@dataclass(frozen=True)
class ObservacionDelChunk:
    """Lo que cada etapa hizo con el primer fragmento esperado. ``None`` = no observado, nunca ``0`` (``null`` ≠ ``0.0``)."""

    chunk_esperado: str | None
    puesto_denso: int | None
    entro_en_pares: bool | None
    relevance_score: float | None
    supero_umbral: bool | None


def observar_chunk_esperado(
    esperados: Sequence[str], loop: LoopObservado | None, top_k: int, umbral: float
) -> ObservacionDelChunk:
    """El primer fragmento esperado es el de mejor puesto denso entre los ``top_k`` candidatos (D3); si ninguno lo es, el
    puesto, la entrada en los pares, el puntaje y el umbral quedan en ``None``."""
    primero = esperados[0] if esperados else None
    if loop is None or not loop.candidatos:
        return ObservacionDelChunk(primero, None, None, None, None)
    orden = recortar_a_pares_del_reranker(loop.candidatos, len(loop.candidatos))
    puestos = {c.chunk_id: puesto for puesto, c in enumerate(orden[:top_k], 1)}
    candidatos = [(puestos[e], e) for e in esperados if e in puestos]
    if not candidatos:
        return ObservacionDelChunk(primero, None, None, None, None)
    puesto, elegido = min(candidatos)
    pares = loop.pares or ()
    if elegido not in pares or loop.puntajes is None:
        return ObservacionDelChunk(elegido, puesto, False, None, None)
    puntaje = loop.puntajes[pares.index(elegido)]
    return ObservacionDelChunk(elegido, puesto, True, puntaje, supera_umbral(puntaje, umbral))


# --- la etapa responsable ----------------------------------------------------------------------------------------------


@dataclass(frozen=True)
class RedaccionObservada:
    """Lo observado de una redacción que necesita la regla de la etapa responsable."""

    puesto_denso: int | None
    entro_en_pares: bool | None
    supero_umbral: bool | None
    con_evidencia: bool
    opciones_generadas: int | None
    afirmaciones_al_nli: int | None
    """Afirmaciones que llegaron al NLI; ``None`` si el NLI no se invocó (≠ ``0``)."""


@dataclass(frozen=True)
class Asignacion:
    """``etapa`` es una de ``ETAPAS`` o ``None``; ``causa`` solo acompaña a ``sin_asignar``."""

    resultado: str
    etapa: str | None = None
    causa: str | None = None


def etapa_responsable(redaccion: RedaccionObservada) -> Asignacion:
    """La primera etapa, en el orden del *pipeline*, que el fragmento esperado no supera (RN-02, RN-01).

    Si supera el umbral y la pérdida no es del soporte NLI (no hubo opciones generadas, o ninguna llegó al NLI porque cayó
    en la validación de citas) no se fuerza a ninguna de las cuatro: ``sin_asignar`` con su causa."""
    if redaccion.puesto_denso is None:
        return Asignacion(RESULTADO_PERDIDA, ETAPAS[0])
    if redaccion.entro_en_pares is False:
        return Asignacion(RESULTADO_PERDIDA, ETAPAS[1])
    if redaccion.supero_umbral is False:
        return Asignacion(RESULTADO_PERDIDA, ETAPAS[2])
    if not redaccion.opciones_generadas:
        return Asignacion(RESULTADO_SIN_ASIGNAR, causa=CAUSAS_SIN_ASIGNAR[0])
    if not redaccion.afirmaciones_al_nli:
        return Asignacion(RESULTADO_SIN_ASIGNAR, causa=CAUSAS_SIN_ASIGNAR[1])
    return Asignacion(RESULTADO_PERDIDA, ETAPAS[3])


@dataclass(frozen=True)
class AsignacionDePar:
    par: str
    resultado: str
    etapa: str | None
    causa: str | None
    redaccion_perdida: str | None


def asignar_par(par: str, redacciones: Sequence[tuple[str, RedaccionObservada]]) -> AsignacionDePar:
    """Un par pierde si alguna redacción termina con evidencia y otra sin ella; se asigna la pérdida de la primera
    redacción sin evidencia (en el orden del dataset). Todas con evidencia, o todas sin ella, no es una pérdida del par."""
    sin_evidencia = [(rid, r) for rid, r in redacciones if not r.con_evidencia]
    if not sin_evidencia or len(sin_evidencia) == len(redacciones):
        return AsignacionDePar(par, RESULTADO_SIN_PERDIDA, None, None, None)
    identificador, redaccion = sin_evidencia[0]
    asignacion = etapa_responsable(redaccion)
    return AsignacionDePar(
        par, asignacion.resultado, asignacion.etapa, asignacion.causa, identificador
    )


def recuento_por_etapa(asignaciones: Sequence[AsignacionDePar]) -> dict[str, int]:
    """Pares por etapa, ``sin_asignar`` y ``sin_perdida``: la suma es el número de pares."""
    recuento = {etapa: 0 for etapa in ETAPAS}
    recuento[RESULTADO_SIN_ASIGNAR] = 0
    recuento[RESULTADO_SIN_PERDIDA] = 0
    for a in asignaciones:
        recuento[a.etapa or a.resultado] += 1
    return recuento


def recuento_de_causas_sin_asignar(asignaciones: Sequence[AsignacionDePar]) -> dict[str, int]:
    return {causa: sum(1 for a in asignaciones if a.causa == causa) for causa in CAUSAS_SIN_ASIGNAR}


# --- el NLI ---------------------------------------------------------------------------------------------------------------


@dataclass(frozen=True)
class AfirmacionJuzgada:
    """Una afirmación con la ``p_entailment`` máxima de sus pares (la misma que decide el soporte) y su veredicto."""

    p_entailment: float
    soportada: bool


def afirmaciones_juzgadas(
    pares: Sequence[ParNli], resultados: Sequence[ResultadoNli], umbral: float
) -> list[AfirmacionJuzgada]:
    """Agrupa los pares contiguos de una misma hipótesis (las premisas de una afirmación van seguidas, en el orden de
    ``pares_a_verificar``): soportada si alguna premisa la soporta; ``p_entailment`` es el máximo de sus premisas."""
    if len(pares) != len(resultados):
        raise ValueError("el NLI debe devolver un resultado por par")
    juzgadas: list[AfirmacionJuzgada] = []
    previa: str | None = None
    for par, resultado in zip(pares, resultados, strict=True):
        soportada = soporta(resultado, umbral)
        if juzgadas and par.hipotesis == previa:
            ultima = juzgadas[-1]
            juzgadas[-1] = AfirmacionJuzgada(
                max(ultima.p_entailment, resultado.p_entailment), ultima.soportada or soportada
            )
        else:
            juzgadas.append(AfirmacionJuzgada(resultado.p_entailment, soportada))
        previa = par.hipotesis
    return juzgadas


@dataclass(frozen=True)
class Tramo:
    desde: float
    hasta: float
    recuento: int


def histograma_de_p_entailment(p_descartadas: Sequence[float], ancho: float) -> tuple[Tramo, ...]:
    """Recuento por tramo de ``[0, 1]``; el tramo es ``[desde, hasta)`` y el último incluye el 1. La suma de los tramos es el
    total de descartadas. Sin descartadas, todos los tramos valen 0."""
    if not 0.0 < ancho <= 1.0 or not math.isclose(1.0 / ancho, round(1.0 / ancho), abs_tol=1e-9):
        raise ValueError("el ancho del tramo debe dividir el intervalo [0, 1] en tramos iguales")
    tramos = round(1.0 / ancho)
    cuentas = [0] * tramos
    for p in p_descartadas:
        if not 0.0 <= p <= 1.0:
            raise ValueError("p_entailment debe estar en [0, 1]")
        cuentas[min(int(p / ancho + 1e-9), tramos - 1)] += 1
    return tuple(
        Tramo(round(i * ancho, 4), round((i + 1) * ancho, 4), cuentas[i]) for i in range(tramos)
    )


def recuento_en_banda(p_descartadas: Sequence[float], inferior: float, umbral: float) -> int:
    """Descartadas con ``inferior <= p_entailment < umbral``: lo que un umbral algo más bajo habría soportado."""
    return sum(1 for p in p_descartadas if inferior <= p < umbral)
