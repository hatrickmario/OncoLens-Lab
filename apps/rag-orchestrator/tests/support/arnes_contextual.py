"""Arnés de integración del segundo loop contextual (US-271, ADR-52): `/rag/query` y `/chat/turn` con adapters falsos.

El servicio es el real, con el léxico y el catálogo de términos reales del repositorio; el embedder, el reranker, el LLM, el
NLI y Milvus son falsos. La pregunta genérica no se parece a nada del corpus y puntúa bajo; la misma pregunta con los
términos del caso se parece a ``ch-m1-1`` y puntúa alto. Solo datos sintéticos.
"""

from __future__ import annotations

import copy
from collections.abc import Sequence
from dataclasses import replace
from typing import Any

from app.domain.expansion_contextual import ParametrosDeExpansionContextual
from app.domain.reescritura import ParametrosDeReescritura
from tests.support.expansion_contextual import CATALOGO_DE_TERMINOS, LEXICO
from tests.support.generador_falso import FakeEvidenceGenerator
from tests.support.recuperacion import (
    PARAMETROS_DE_PRUEBA,
    PUNTAJES_FX06A,
    EmbedderFalso,
    EntornoDeRecuperacion,
    Q_HER2,
    RerankerFalso,
    _vector,
    crear_entorno,
    solicitud_de,
)

Q_GENERICA = "¿Qué evidencia hay para este caso?"
TERMINOS_DE_MAMA = ("Cáncer de mama", "IIA", "HER2", "3+")
CONSULTA_CONTEXTUAL = f"{Q_GENERICA} {' '.join(TERMINOS_DE_MAMA)}"
CAMPOS_USADOS = ["tipo", "estadio", "biomarcador_principal"]
PUNTAJES_BAJOS = {"ch-m1-1": 0.10, "ch-inj-1": 0.08}
PUNTAJES_ALTOS = PUNTAJES_FX06A[Q_HER2]
CON_REESCRITURA_DE_PRUEBA = ParametrosDeReescritura(
    habilitada=True, max_iteraciones=2, plazo_ms=200
)


class EmbedderContextual(EmbedderFalso):
    """La pregunta genérica (e5) no se parece a nada del corpus; con términos del caso se parece a ``ch-m1-1`` (e0)."""

    def embeber(self, texto: str) -> Sequence[float]:
        if texto == Q_GENERICA:
            self.textos.append(texto)
            return _vector(e5=1.0)
        if texto.startswith(Q_GENERICA):
            self.textos.append(texto)
            return _vector(e0=1.0)
        return super().embeber(texto)


def parametros_contextuales(
    *,
    habilitada: bool = True,
    reescritura: ParametrosDeReescritura | None = None,
    **cambios: Any,
):
    return replace(
        PARAMETROS_DE_PRUEBA,
        expansion_contextual=ParametrosDeExpansionContextual(habilitada=habilitada, **cambios),
        **({"reescritura": reescritura} if reescritura is not None else {}),
    )


def puntajes_contextuales(
    consulta_contextual: dict[str, float] | None = None,
) -> dict[str, dict[str, float]]:
    """La genérica puntúa bajo; la consulta contextual, alto (o lo que se pida)."""
    return {
        **PUNTAJES_FX06A,
        Q_GENERICA: PUNTAJES_BAJOS,
        CONSULTA_CONTEXTUAL: PUNTAJES_ALTOS if consulta_contextual is None else consulta_contextual,
    }


def crear_entorno_contextual(
    *,
    habilitada: bool = True,
    puntajes: dict[str, dict[str, float]] | None = None,
    parametros=None,
    **bordes: Any,
) -> EntornoDeRecuperacion:
    """El servicio real con el léxico y el catálogo de términos reales y todos sus bordes falsos."""
    return crear_entorno(
        parametros=parametros or parametros_contextuales(habilitada=habilitada),
        embedder=bordes.pop("embedder", EmbedderContextual()),
        reranker=bordes.pop("reranker", RerankerFalso(puntajes or puntajes_contextuales())),
        generador=bordes.pop("generador", FakeEvidenceGenerator()),
        marcos_de_pregunta=LEXICO,
        catalogo_de_terminos=bordes.pop("catalogo_de_terminos", CATALOGO_DE_TERMINOS),
        **bordes,
    )


def solicitud_contextual(
    pregunta: str = Q_GENERICA,
    *,
    estadio: str = "IIA",
    biomarcadores: Sequence[tuple[str, str]] = (("HER2", "3+"),),
) -> dict[str, Any]:
    """``rag-query-request.json`` con la pregunta dada y un contexto de mama con estadio y biomarcadores a elección."""
    solicitud = solicitud_de(pregunta)
    contexto = solicitud["clinicalContext"]
    contexto["diagnosis"]["stageValue"] = estadio
    plantilla = copy.deepcopy(contexto["biomarkers"][0])
    contexto["biomarkers"] = [
        {**copy.deepcopy(plantilla), "dataRef": f"r{i + 10}", "biomarkerName": n, "value": v}
        for i, (n, v) in enumerate(biomarcadores)
    ]
    return solicitud


def expansion_de(cuerpo: dict[str, Any]) -> dict[str, Any] | None:
    return cuerpo["meta"]["retrievalParams"].get("contextExpansion")
