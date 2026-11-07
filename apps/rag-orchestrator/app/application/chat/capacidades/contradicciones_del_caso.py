"""Turno de contradicciones del nodo ``caso`` (US-262, RN-08, AC-T3.2): sin LLM, sin NLI.

Cuando la pregunta es de contradicciones, el turno no genera nada: compone un bloque ``conflicto`` por cada par que marcó
Backend 1 (``domain.chat.contradicciones``) o, si ningún dato está en conflicto, entrega el texto fijo de configuración
como bloque ``limitacion`` con su alcance (qué se revisó). Si un hecho está marcado en conflicto pero su contraparte no
llegó en el turno, no se afirma que no hay contradicciones: se declara. El contenido lo deciden los datos del expediente y
la configuración, nunca el modelo. Logs: solo ``traceId`` y conteos, jamás los valores (RN-10).
"""

from __future__ import annotations

import logging
from collections.abc import Sequence
from typing import Any, NamedTuple

from app.domain.chat.contradicciones import bloques_de_conflicto, hechos_con_marca_sin_contraparte
from app.domain.chat.turno import HechoDelCaso

logger = logging.getLogger(__name__)


class TextosDeContradicciones(NamedTuple):
    """Textos fijos de configuración del turno de contradicciones (RN-22), sin punto final."""

    etiqueta_de_conflicto: str
    sin_contradicciones: str
    alcance_revisado: str
    contraparte_ausente: str


def turno_de_contradicciones(
    hechos: Sequence[HechoDelCaso], textos: TextosDeContradicciones, trace_id: str
) -> dict[str, Any]:
    """Lo que el nodo ``caso`` entrega a ``validar`` ante una pregunta de contradicciones: bloques ``conflicto`` ya
    verificados por construcción (``bloques_del_nodo``) o la limitación de «sin contradicciones» con su alcance; una marca
    sin contraparte se declara (aviso junto a los bloques, o limitación si no hay ningún par)."""
    bloques = bloques_de_conflicto(hechos, textos.etiqueta_de_conflicto)
    huerfanos = hechos_con_marca_sin_contraparte(hechos)
    logger.info(
        "event=chat_contradicciones traceId=%s pares=%d sin_contraparte=%d",
        trace_id,
        len(bloques),
        len(huerfanos),
    )
    aviso = {"avisos_del_nodo": (textos.contraparte_ausente,)} if huerfanos else {}
    if bloques:
        return {"propuestas": (), "bloques_del_nodo": bloques, **aviso}
    if huerfanos:
        return {"propuestas": (), "limitacion_del_nodo": textos.contraparte_ausente}
    texto = f"{textos.sin_contradicciones}. {textos.alcance_revisado}."
    return {"propuestas": (), "limitacion_del_nodo": texto}
