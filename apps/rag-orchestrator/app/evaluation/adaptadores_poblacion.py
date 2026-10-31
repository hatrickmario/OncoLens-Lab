"""Adapters falsos de la familia `poblacion` (L1D-299): cumplen los puertos de la extracción en abanico (US-242) con el
mismo contrato que los reales (LSP). Deterministas y sin red; solo trabajan con texto sintético o de corpus público.

* ``LlmGuionadoDePoblacion``: propone, por criterio, lo que dicta el dorado, y registra cada tarea con su
  ``finish_reason`` (``stop`` o ``length``). Un criterio sin guion devuelve la lista vacía.

El recuperador es el de producción (``RecuperadorLexicalDeFragmentos``, en memoria): no necesita doble.
"""

from __future__ import annotations

import json
import re
from collections.abc import Mapping, Sequence
from typing import Any

from app.application.corpus_metadata.poblacion_puertos import (
    FINISH_REASON_CORTADA,
    RespuestaDelLlm,
)
from app.evaluation.dataset_poblacion import ValorEsperado

_CRITERIO_EN_PROMPT = re.compile(r"^Criterio: (\S+)$", re.MULTILINE)
_TRUNCADO = '{"values": [{"value": "'


class LlmGuionadoDePoblacion:
    """``LlmDePoblacion`` de UN documento: ``propuestas`` por clave de criterio y ``cortes`` (cuántas de sus primeras
    llamadas terminan con ``finish_reason = length``)."""

    def __init__(
        self,
        documento: str,
        propuestas: Mapping[str, Sequence[ValorEsperado]],
        cortes: Mapping[str, int] | None = None,
    ) -> None:
        self._documento = documento
        self._propuestas = propuestas
        self._cortes = cortes or {}
        self._llamadas: dict[str, int] = {}
        self.tareas: list[tuple[str, str, str]] = []
        """(documento, criterio, finish_reason) de cada llamada; nunca el prompt ni la salida (RN-14)."""

    async def completar_json_acotado(
        self, prompt: str, esquema: Mapping[str, Any], *, max_tokens: int, semilla: int
    ) -> RespuestaDelLlm:
        encontrado = _CRITERIO_EN_PROMPT.search(prompt)
        if encontrado is None:
            raise AssertionError("el prompt debe declarar 'Criterio: <clave>'")
        criterio = encontrado.group(1)
        previas = self._llamadas.get(criterio, 0)
        self._llamadas[criterio] = previas + 1
        if previas < self._cortes.get(criterio, 0):
            self.tareas.append((self._documento, criterio, FINISH_REASON_CORTADA))
            return RespuestaDelLlm(_TRUNCADO, FINISH_REASON_CORTADA)
        self.tareas.append((self._documento, criterio, "stop"))
        valores = [
            {"value": v.valor, "chunkId": v.chunk, "scope": v.scope}
            for v in self._propuestas.get(criterio, ())
        ]
        return RespuestaDelLlm(json.dumps({"values": valores}, ensure_ascii=False), "stop")
