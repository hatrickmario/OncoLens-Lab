"""Medición del tamaño real del prompt de evidencia (L1D-322, decisión del PO 2026-11-06): solo mide, no cambia nada.

Registra ``event=chat_evidencia_prompt`` con el ``traceId``, la fase (``analisis`` o ``seguimiento``), el número de
fragmentos, los tokens estimados de las instrucciones (``sistema``), de los datos (pregunta, datos del paciente y
fragmentos), de la memoria y del total, y el presupuesto ``LLM_NUM_CTX``. Solo números: nunca texto, pregunta, ids ni datos
del paciente (RN-10, RN-14). Los tokens salen del ``ContadorDeTokens`` existente (exacto con el tokenizer local o
conservador, que sobreestima).
"""

from __future__ import annotations

import logging
import re

from app.application.ports import ContadorDeTokens
from app.application.prompt_builder import PromptSeparado

logger = logging.getLogger(__name__)

_MEMORIA = re.compile(r"<memory\b[^>]*>.*?</memory>", re.DOTALL)


def registrar_tamano_del_prompt(
    fase: str,
    trace_id: str,
    prompt: PromptSeparado,
    fragmentos: int,
    contador: ContadorDeTokens,
    num_ctx: int,
) -> None:
    memoria = "".join(_MEMORIA.findall(prompt.usuario))
    datos = _MEMORIA.sub("", prompt.usuario)
    sistema_t, datos_t, memoria_t = (
        contador.contar(prompt.sistema),
        contador.contar(datos),
        contador.contar(memoria),
    )
    logger.info(
        "event=chat_evidencia_prompt traceId=%s fase=%s fragmentos=%d tokensSistema=%d tokensDatos=%d "
        "tokensMemoria=%d tokensTotal=%d numCtx=%d",
        trace_id,
        fase,
        fragmentos,
        sistema_t,
        datos_t,
        memoria_t,
        sistema_t + datos_t + memoria_t,
        num_ctx,
    )
