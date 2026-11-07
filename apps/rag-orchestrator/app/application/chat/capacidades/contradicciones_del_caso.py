"""Turno de contradicciones del nodo ``caso`` (US-262, RN-08, AC-T3.2): sin LLM, sin NLI.

Cuando la pregunta es de contradicciones, el turno no genera nada: compone un bloque ``conflicto`` por cada par que marcó
Backend 1 (``domain.chat.contradicciones``) o, si ningún dato está en conflicto, entrega el texto fijo de configuración
como bloque ``limitacion``. El contenido lo deciden los datos del expediente y la configuración, nunca el modelo, así que
nada del turno puede inclinarse por uno de los valores ni resolver el conflicto. Logs: solo ``traceId`` y el número de
pares, jamás los valores (RN-10).
"""

from __future__ import annotations

import logging
from collections.abc import Sequence
from typing import Any

from app.domain.chat.contradicciones import bloques_de_conflicto
from app.domain.chat.turno import HechoDelCaso

logger = logging.getLogger(__name__)


def turno_de_contradicciones(
    hechos: Sequence[HechoDelCaso],
    *,
    etiqueta_de_conflicto: str,
    texto_sin_contradicciones: str,
    trace_id: str,
) -> dict[str, Any]:
    """Lo que el nodo ``caso`` entrega a ``validar`` ante una pregunta de contradicciones: bloques ``conflicto`` ya
    verificados por construcción (``bloques_del_nodo``) o el texto de «sin contradicciones» (``limitacion_del_nodo``)."""
    bloques = bloques_de_conflicto(hechos, etiqueta_de_conflicto)
    logger.info("event=chat_contradicciones traceId=%s pares=%d", trace_id, len(bloques))
    if bloques:
        return {"propuestas": (), "bloques_del_nodo": bloques}
    return {"propuestas": (), "limitacion_del_nodo": texto_sin_contradicciones}
