"""Nodo ``faltantes`` del grafo del chat (US-263, ADR-51): verbalización determinista, sin LLM, NLI ni recuperación.

Sustituye al esqueleto de la capacidad ``faltantes`` por el punto de extensión ``capacidades`` del grafo. La verbalización
no tiene puertos de IA: solo lee del catálogo montado dónde espera cada dato crítico (``sourceDocumentTypes``) y deja los
bloques en ``bloques_deterministas``, que ``validar`` conserva tal cual (exentos de cita, RN-01). La subintención
``relevancia`` (US-264, «¿por qué importa el Ki-67?») la atiende el nodo que se le inyecta (``NodoRelevancia``) y, sin él
(sin corpus detrás), la pregunta se verbaliza como cualquier otra de faltantes. Los logs llevan ``traceId`` y conteos por
tipo de vacío, nunca la pregunta ni las etiquetas.
"""

from __future__ import annotations

import logging
from collections import Counter
from typing import Any

from app.application.chat.grafo import EstadoDelGrafo, Nodo
from app.application.ports import DatosCriticosDelCatalogoMontado
from app.domain.chat.enrutado import es_pregunta_de_relevancia
from app.domain.chat.faltantes import segun_el_catalogo, verbalizar_faltantes

logger = logging.getLogger(__name__)


def crear_nodo_faltantes(
    datos: DatosCriticosDelCatalogoMontado, relevancia: Nodo | None = None
) -> Nodo:
    async def nodo_faltantes(estado: EstadoDelGrafo) -> dict[str, Any]:
        if relevancia is not None and es_pregunta_de_relevancia(estado["pregunta"]):
            return await relevancia(estado)
        tipo = estado["tipo_del_contexto"]
        items = segun_el_catalogo(estado["completitud"], datos.etiquetas(tipo))
        bloques = verbalizar_faltantes(
            items,
            datos.tipos_de_documento(tipo),
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
