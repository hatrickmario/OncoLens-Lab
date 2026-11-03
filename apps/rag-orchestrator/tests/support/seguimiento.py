"""Arnés de `/rag/follow-up` (US-218): el `ResponderSeguimiento` REAL con todos sus bordes falsos y un cliente HTTP.

Reutiliza ``crear_entorno`` (servicio real de `/rag/query` con adapters falsos) y le añade el generador de seguimiento
real sobre el LLM falso, de modo que prompt, parseo y validación corren por la ruta de producción.
"""

from __future__ import annotations

import copy
import json
from dataclasses import dataclass
from typing import Any

from app.application.generacion_de_seguimiento import LlmSeguimientoGenerator
from app.application.seguimiento import ResponderSeguimiento
from app.bootstrap import crear_app
from app.domain.atribucion import CLAIM_MAX_WORDS_INICIAL, CLAIMS_MAX_INICIAL, CLAIMS_MIN_INICIAL
from fastapi.testclient import TestClient
from tests.support.fakes import GeneradorTraceFijo, RelojFijo, par_de_sesion, settings_de_prueba
from tests.support.llm_falso import FakeLlmClient
from tests.support.nli_falso import IMPLICA, NliFalso
from tests.support.recuperacion import (
    EJEMPLOS,
    PUNTAJES_FX06A,
    VERSION_DEL_CATALOGO_MONTADO,
    EntornoDeRecuperacion,
    RerankerFalso,
    crear_entorno,
)
from tests.support.service_jwt import con_token_valido

Q_SEGUIMIENTO = "¿La evidencia describe diferencias según el estado menopáusico?"
Q_COMPARATIVA = "¿La evidencia de este análisis compara el resultado en cáncer de mama con lo descrito en cáncer de próstata?"
Q_OTRO_CANCER = "¿Qué describe la evidencia sobre cáncer de próstata metastásico?"
Q_OTRA_PERSONA = "¿Lo descrito aplica al tratamiento que recibió [NOMBRE]?"
# Solo ``ch-m1-1`` (C1) supera el umbral de los tests (0.30).
PUNTAJES_DEL_SEGUIMIENTO = {"ch-m1-1": 0.80, "ch-inj-1": 0.05, "ch-m1v0-1": 0.05, "ch-p1-1": 0.05}
TERMINOS_POR_TIPO = {
    "mama": frozenset({"mama"}),
    "prostata": frozenset({"prostata", "cancer de prostata"}),
}


@dataclass
class EntornoDeSeguimiento:
    cliente: TestClient
    llm: FakeLlmClient
    nli: NliFalso
    base: EntornoDeRecuperacion

    def seguir(self, solicitud: dict[str, Any]):
        return self.cliente.post("/rag/follow-up", json=solicitud)

    def llamadas_a_adapters(self) -> dict[str, int]:
        """Las invocaciones de los bordes que la regla determinista debe evitar (embeddings, búsqueda, reranker, LLM, NLI)."""
        return {
            "embeddings": self.base.embedder.invocaciones,
            "busqueda": self.base.buscador.invocaciones,  # type: ignore[attr-defined]
            "reranker": self.base.reranker.invocaciones,  # type: ignore[attr-defined]
            "llm": self.llm.invocaciones,
            "nli": self.nli.invocaciones,
        }


def solicitud_de_seguimiento(pregunta: str = Q_SEGUIMIENTO) -> dict[str, Any]:
    ejemplo = json.loads((EJEMPLOS / "rag-follow-up-request.json").read_text(encoding="utf-8"))
    solicitud = copy.deepcopy(ejemplo)
    solicitud["catalogVersion"] = VERSION_DEL_CATALOGO_MONTADO
    solicitud["question"] = pregunta
    return solicitud


def crear_entorno_de_seguimiento(
    escenario: str = "SEG-OK",
    *,
    nli: NliFalso | None = None,
    puntajes: dict[str, float] | None = None,
    llm: FakeLlmClient | None = None,
    **cambios: Any,
) -> EntornoDeSeguimiento:
    tabla = {
        p: puntajes if puntajes is not None else PUNTAJES_DEL_SEGUIMIENTO
        for p in (Q_SEGUIMIENTO, Q_COMPARATIVA)
    }
    nli = nli or NliFalso(por_defecto=IMPLICA)
    base = crear_entorno(
        reranker=RerankerFalso(puntajes={**PUNTAJES_FX06A, **tabla}),
        clasificador_nli=nli,
        **cambios,
    )
    llm = llm or FakeLlmClient(escenario)
    responder = ResponderSeguimiento(
        servicio=base.servicio,
        generador=LlmSeguimientoGenerator(
            llm,
            claims_min=CLAIMS_MIN_INICIAL,
            claims_max=CLAIMS_MAX_INICIAL,
            claim_max_words=CLAIM_MAX_WORDS_INICIAL,
        ),
        terminos_por_tipo=TERMINOS_POR_TIPO,
    )
    app = crear_app(
        settings_de_prueba(),
        trace_ids=GeneradorTraceFijo(),
        clock=RelojFijo(),
        consulta=base.servicio,
        seguimiento=responder,
    )
    cliente = TestClient(
        app, raise_server_exceptions=False, headers=con_token_valido(par_de_sesion())
    )
    return EntornoDeSeguimiento(cliente, llm, nli, base)
