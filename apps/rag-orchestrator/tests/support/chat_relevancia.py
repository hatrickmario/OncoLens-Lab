"""Arnés de `/chat/turn` para la relevancia de un dato faltante (US-264 / L1D-321): el ``ChatTurnService`` REAL sobre el
servicio REAL de `/rag/query` y el catálogo clínico REAL de mama (``datos-criticos``, ``aplicabilidad``, ``sinonimos``),
con todos sus bordes falsos (LLM del chat, NLI, reranker, Milvus). Solo datos sintéticos.
"""

from __future__ import annotations

import copy
from typing import Any

from app.infrastructure.catalogo_clinico.relevancia import cargar_datos_de_relevancia
from tests.support.chat_evidencia import (
    EntornoDeChatConEvidencia,
    crear_entorno_de_chat_con_evidencia,
)
from tests.support.contract import CATALOGOS
from tests.support.llm_chat_falso import FakeChatLlm
from tests.support.nli_falso import IMPLICA, NliFalso
from tests.support.recuperacion import PUNTAJES_FX06A, RerankerFalso, crear_entorno

Q_MENOPAUSIA = "¿Por qué importa el estado menopáusico?"
Q_KI67 = "¿Por qué importa el Ki-67?"
Q_CA153 = "¿Por qué importa el CA 15-3?"

CONSULTA_MENOPAUSIA = "Estado menopáusico mama"
CONSULTA_KI67 = "Ki-67 mama"
"""Lo que el nodo manda al corpus: la etiqueta del catálogo y el tipo de cáncer, nunca un dato del paciente (design D3)."""

PUNTAJES_CON_EVIDENCIA = {"ch-m1-1": 0.80, "ch-inj-1": 0.05}
PUNTAJES_SIN_EVIDENCIA = {"ch-m1-1": 0.05, "ch-inj-1": 0.05}


def entorno_de_relevancia(
    escenario: str = "CHAT-RELEVANCIA-OK",
    *,
    puntajes: dict[str, float] = PUNTAJES_CON_EVIDENCIA,
    nli: NliFalso | None = None,
    llm: FakeChatLlm | None = None,
    **base: Any,
) -> EntornoDeChatConEvidencia:
    """El chat con la relevancia cableada y el LLM del chat en ``escenario``; ``puntajes`` rigen la consulta de cada
    pregunta de relevancia del arnés."""
    reranker = RerankerFalso(
        puntajes={
            **PUNTAJES_FX06A,
            CONSULTA_MENOPAUSIA: puntajes,
            CONSULTA_KI67: puntajes,
        }
    )
    entorno_base = crear_entorno(
        reranker=reranker, clasificador_nli=nli or NliFalso(por_defecto=IMPLICA), **base
    )
    return crear_entorno_de_chat_con_evidencia(
        entorno_base,
        llm=llm or FakeChatLlm(escenario),
        relevancia=cargar_datos_de_relevancia(CATALOGOS, ("mama", "prostata")),
    )


def con_estado_rehidratado(
    solicitud: dict[str, Any], *, citas_mostradas: list[str]
) -> dict[str, Any]:
    """La petición de un hilo que Backend 1 rehidrata con las citas que ya mostró un turno anterior (RN-24)."""
    otra = copy.deepcopy(solicitud)
    otra["rehydration"]["structuredState"]["citasMostradas"] = citas_mostradas
    return otra
