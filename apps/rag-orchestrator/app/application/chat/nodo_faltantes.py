"""Nodo ``faltantes`` del grafo del chat (US-263, ADR-51): verbalización determinista, sin LLM, NLI ni recuperación.

Sustituye al esqueleto de la capacidad ``faltantes`` por el punto de extensión ``capacidades`` del grafo. No tiene puertos
de IA: solo lee del catálogo montado dónde espera cada dato crítico (``sourceDocumentTypes``) y deja los bloques en
``bloques_deterministas``, que ``validar`` conserva tal cual (exentos de cita, RN-01). Los logs llevan ``traceId`` y
conteos por tipo de vacío, nunca la pregunta ni las etiquetas.
"""

from __future__ import annotations

import logging
from collections import Counter
from typing import Any

from app.application.chat.grafo import EstadoDelGrafo, Nodo
from app.application.ports import FuentesDeDatosCriticos
from app.domain.chat.faltantes import verbalizar_faltantes

logger = logging.getLogger(__name__)


def crear_nodo_faltantes(fuentes: FuentesDeDatosCriticos) -> Nodo:
    async def nodo_faltantes(estado: EstadoDelGrafo) -> dict[str, Any]:
        items = estado["completitud"]
        bloques = verbalizar_faltantes(
            items,
            fuentes.tipos_de_documento(estado["tipo_del_contexto"]),
            estado["version_del_catalogo"],
        )
        conteos = Counter(item.tipo_de_vacio for item in items if item.tipo_de_vacio is not None)
        logger.info(
            "event=chat_faltantes traceId=%s no_encontrado=%d incompleto=%d por_conciliar=%d no_buscado=%d",
            estado["trace_id"],
            conteos["no_encontrado"],
            conteos["incompleto"],
            conteos["por_conciliar"],
            conteos["no_buscado"],
        )
        return {"propuestas": (), "bloques_deterministas": bloques}

    return nodo_faltantes
