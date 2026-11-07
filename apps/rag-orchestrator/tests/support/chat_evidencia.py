"""Arnés de `/chat/turn` con el nodo de evidencia (US-265 / L1D-322): el ``ChatTurnService`` REAL sobre el servicio REAL de
`/rag/query` con todos sus bordes falsos.

Parte de un ``EntornoDeRecuperacion`` ya armado (corpus, reranker, generador de opciones y NLI falsos) y le añade el chat:
el LLM del chat es ``FakeChatLlm`` (clasificación y seguimiento) y las posiciones de los chunks salen del mismo corpus.
Cada respuesta se valida contra el spec del proveedor (hook de `verificacion_proveedor.py`, US-214). Solo datos sintéticos.
"""

from __future__ import annotations

import copy
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from app.application.chat.servicio_de_turno import ChatTurnService
from app.bootstrap import crear_app
from app.infrastructure.catalogo_clinico.datos_criticos import cargar_datos_criticos
from app.infrastructure.catalogo_clinico.sinonimos import cargar_terminos_por_tipo
from app.infrastructure.lenguaje.terminos_prohibidos import cargar_verificador_de_terminos
from fastapi.testclient import TestClient
from tests.support.chat import DEL_EJEMPLO, HILO_A, EntornoDeChat, solicitud_de_turno
from tests.support.contador_de_tokens_falso import ContadorPorPalabras
from tests.support.contract import CATALOGOS
from tests.support.fakes import GeneradorTraceFijo, RelojFijo, par_de_sesion, settings_de_prueba
from tests.support.llm_chat_falso import FakeChatLlm
from tests.support.posiciones_falsas import PosicionesFalsas
from tests.support.recuperacion import (
    CORPUS_FX06A,
    ChunkFx,
    EntornoDeRecuperacion,
)
from tests.support.service_jwt import con_token_valido


@dataclass
class EntornoDeChatConEvidencia(EntornoDeChat):
    base: EntornoDeRecuperacion
    posiciones: PosicionesFalsas

    def chunks_recuperados(self) -> set[str]:
        """Los ``chunkId`` que el *reranker* recibió en CUALQUIER llamada del entorno (lo recuperado en los turnos)."""
        return {c for lote in self.base.reranker.candidatos_recibidos for c in lote}  # type: ignore[attr-defined]


def solicitud_de_evidencia(
    pregunta: str,
    *,
    hilo: str = HILO_A,
    contexto_clinico: dict[str, Any] | None = None,
    analisis_activo: str | None = None,
    rehidratacion: dict[str, Any] | None | object = DEL_EJEMPLO,
    version_del_catalogo: str | None = None,
) -> dict[str, Any]:
    """El ejemplo ``chat-turn-request.json`` con la pregunta dada, el contexto clínico de otro paciente (si se da) y el
    ``activeAnalysisId`` del seguimiento (si se da)."""
    solicitud = solicitud_de_turno(
        pregunta,
        hilo=hilo,
        rehidratacion=rehidratacion,
        **({"version_del_catalogo": version_del_catalogo} if version_del_catalogo else {}),
    )
    if contexto_clinico is not None:
        solicitud["clinicalContext"] = copy.deepcopy(contexto_clinico)
        solicitud["pseudoPatientId"] = contexto_clinico["pseudoPatientId"]
    if analisis_activo is not None:
        solicitud["activeAnalysisId"] = analisis_activo
    return solicitud


def crear_entorno_de_chat_con_evidencia(
    base: EntornoDeRecuperacion,
    *,
    corpus: Sequence[ChunkFx] = CORPUS_FX06A,
    llm: FakeChatLlm | None = None,
    escenario: str = "CHAT-OK",
    posiciones: PosicionesFalsas | None = None,
    **cambios_de_settings: object,
) -> EntornoDeChatConEvidencia:
    llm = llm or FakeChatLlm(escenario)
    posiciones = posiciones or PosicionesFalsas(corpus)
    contador = ContadorPorPalabras()
    reloj = RelojFijo()
    settings = settings_de_prueba(**cambios_de_settings)
    servicio = ChatTurnService(
        llm=llm,
        catalogo=base.catalogo_clinico,
        contador=contador,
        reloj=reloj,
        settings=settings,
        terminos_por_tipo=cargar_terminos_por_tipo(CATALOGOS, settings.enabled_cancer_types),
        verificador_terminos=cargar_verificador_de_terminos(CATALOGOS),
        servicio_de_evidencia=base.servicio,
        posiciones=posiciones,
        fuentes_documentales=cargar_datos_criticos(CATALOGOS, ("mama", "prostata")),
    )
    app = crear_app(
        settings_de_prueba(**cambios_de_settings),
        trace_ids=GeneradorTraceFijo(),
        clock=RelojFijo(),
        chat=servicio,
    )
    cliente = TestClient(
        app, raise_server_exceptions=False, headers=con_token_valido(par_de_sesion())
    )
    return EntornoDeChatConEvidencia(
        cliente,
        llm,
        base.clasificador_nli,  # type: ignore[arg-type]
        contador,
        reloj,
        base.catalogo_clinico,  # type: ignore[arg-type]
        servicio.registro,
        base,
        posiciones,
    )


Q_SEGUIMIENTO = "¿En qué se diferencia la población del estudio de mi paciente?"
Q_SIN_REGLA = "¿Eso aplica a mi paciente?"
ANALISIS_ACTIVO = "b3d9f2a0-1c3e-4f9a-8b1a-9e2f0c3d9f2a"
PUNTAJES_DEL_SEGUIMIENTO = {"ch-m1-1": 0.80, "ch-inj-1": 0.05}


def entorno_de_seguimiento(
    escenario: str = "SEG-OK", *, puntajes=PUNTAJES_DEL_SEGUIMIENTO, nli=None, **base
):
    """El chat con evidencia y el LLM del seguimiento en ``escenario``; devuelve el entorno y el generador de opciones.

    El primer turno es el análisis (``LLM-OK``); el segundo, el seguimiento con los ``puntajes`` dados."""
    from tests.support.generador_falso import FakeEvidenceGenerator
    from tests.support.llm_chat_evidencia_falso import FakeChatLlmEvidencia
    from tests.support.nli_falso import IMPLICA, NliFalso
    from tests.support.recuperacion import PUNTAJES_FX06A, RerankerFalso, crear_entorno

    reranker = RerankerFalso(
        puntajes={**PUNTAJES_FX06A, Q_SEGUIMIENTO: puntajes, Q_SIN_REGLA: puntajes}
    )
    generador = FakeEvidenceGenerator("LLM-OK")
    entorno_base = crear_entorno(
        generador=generador,
        reranker=reranker,
        clasificador_nli=nli or NliFalso(por_defecto=IMPLICA),
        **base,
    )
    llm = FakeChatLlmEvidencia(escenario)
    return crear_entorno_de_chat_con_evidencia(entorno_base, llm=llm), generador
