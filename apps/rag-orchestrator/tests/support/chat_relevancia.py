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
from tests.support.recuperacion import (
    CORPUS_FX06A,
    PUNTAJES_FX06A,
    BuscadorFalso,
    ChunkFx,
    RerankerFalso,
    _vector,
    crear_entorno,
)

CHUNK_MENOPAUSIA = ChunkFx(
    "ch-mp-1",
    "doc-m1",
    "Menopausal status was used to stratify patients in adjuvant endocrine therapy trials for hormone receptor-positive breast cancer.",
    _vector(e3=0.6),
    True,
    "mama",
    chunk_index=1,
)
CHUNK_KI67 = ChunkFx(
    "ch-ki-1",
    "doc-m1",
    "The Ki-67 proliferation index was reported alongside histologic grade to characterize tumor biology in early breast cancer.",
    _vector(e3=0.55),
    True,
    "mama",
    chunk_index=2,
)
CORPUS_RELEVANCIA = (*CORPUS_FX06A, CHUNK_MENOPAUSIA, CHUNK_KI67)
"""El corpus FX-06a más un fragmento sintético que sí habla de cada dato (mismo documento ``doc-m1``, vigente)."""

Q_MENOPAUSIA = "¿Por qué importa el estado menopáusico?"
Q_KI67 = "¿Por qué importa el Ki-67?"
Q_CA153 = "¿Por qué importa el CA 15-3?"

CONSULTA_MENOPAUSIA = "Estado menopáusico mama"
CONSULTA_KI67 = "Ki-67 mama"
"""Lo que el nodo manda al corpus: la etiqueta del catálogo y el tipo de cáncer, nunca un dato del paciente (design D3)."""

PUNTAJES_MENOPAUSIA = {"ch-mp-1": 0.80}
PUNTAJES_KI67 = {"ch-ki-1": 0.80}
PUNTAJES_SIN_EVIDENCIA: dict[str, float] = {}
"""Lo no listado puntúa 0.05, bajo el umbral de los tests."""


def entorno_de_relevancia(
    escenario: str = "CHAT-RELEVANCIA-OK",
    *,
    puntajes: dict[str, float] | None = None,
    nli: NliFalso | None = None,
    llm: FakeChatLlm | None = None,
    **base: Any,
) -> EntornoDeChatConEvidencia:
    """El chat con la relevancia cableada y el LLM del chat en ``escenario``; ``puntajes`` rigen la consulta de cada
    pregunta de relevancia del arnés."""
    reranker = RerankerFalso(
        puntajes={
            **PUNTAJES_FX06A,
            CONSULTA_MENOPAUSIA: PUNTAJES_MENOPAUSIA if puntajes is None else puntajes,
            CONSULTA_KI67: PUNTAJES_KI67 if puntajes is None else puntajes,
        }
    )
    entorno_base = crear_entorno(
        reranker=reranker,
        clasificador_nli=nli or NliFalso(por_defecto=IMPLICA),
        buscador=BuscadorFalso(CORPUS_RELEVANCIA),
        **base,
    )
    return crear_entorno_de_chat_con_evidencia(
        entorno_base,
        corpus=CORPUS_RELEVANCIA,
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
