"""FX-06b-a: el segundo loop de reescritura (US-238) sobre FX-06a-a con adapters falsos.

``Q-TYPO-SIN-EVIDENCIA``: el primer loop (``RETRIEVAL_TOP_K = 1``) solo ve ``ch-inj-1`` (0,08, bajo el umbral 0,30); el vector
de la consulta reformulada acerca ``ch-m1-1`` y el reranker lo puntúa contra la PREGUNTA ORIGINAL (0,74). ``Q-SIN-RESPUESTA``:
ni la pregunta ni su reescritura superan el umbral. El catálogo de prueba trae ``ribociclib`` y no ``farmaco-inventado-x``.
Solo datos sintéticos.
"""

from __future__ import annotations

import asyncio
from collections.abc import Sequence
from dataclasses import replace
from typing import Any

from app.application.ports import CandidatoParaReranker, FalloDelLlm, SalidaDeReescrituraInvalida
from app.domain.reescritura import ParametrosDeReescritura
from tests.support.generador_falso import FakeEvidenceGenerator
from tests.support.recuperacion import (
    PARAMETROS_DE_PRUEBA,
    PUNTAJES_FX06A,
    EmbedderFalso,
    EntornoDeRecuperacion,
    RerankerFalso,
    _vector,
    crear_entorno,
)

Q_TYPO = "¿Qué dise la evidensia sobre terapia anti-HER2 adyuvante en cancer de mama HER2 positivo?"
Q_SIN_RESPUESTA = "¿Qué describe la evidencia sobre sarcoma sinovial en cáncer de mama?"
TERMINO_DEL_CATALOGO = "ribociclib"
TERMINO_INVENTADO = "farmaco-inventado-x"
CATALOGO_DE_PRUEBA = frozenset({"cdk4 6", TERMINO_DEL_CATALOGO, "her2"})

TEXTO_REESCRITO = f"{Q_TYPO} {TERMINO_DEL_CATALOGO}"

PUNTAJES_DE_REESCRITURA = {
    **PUNTAJES_FX06A,
    Q_TYPO: {"ch-m1-1": 0.74, "ch-inj-1": 0.08},
    Q_SIN_RESPUESTA: {"ch-m1-1": 0.10, "ch-inj-1": 0.08},
}

PLAZO_DE_PRUEBA_MS = 200


def parametros_de_reescritura(**cambios: Any):
    """``TOP_K = 1`` hace que el primer loop de ``Q_TYPO`` no vea ``ch-m1-1`` y el segundo sí."""
    reescritura = ParametrosDeReescritura(
        habilitada=cambios.pop("habilitada", True),
        max_iteraciones=cambios.pop("max_iteraciones", 1),
        plazo_ms=cambios.pop("plazo_ms", PLAZO_DE_PRUEBA_MS),
    )
    return replace(PARAMETROS_DE_PRUEBA, retrieval_top_k=1, reescritura=reescritura, **cambios)


class ReescritorFalso:
    """``QueryRewriter`` con contador y captura de lo que recibe. Cumple el contrato del puerto: un LLM caído es
    ``FalloDelLlm`` y una salida inválida, ``SalidaDeReescrituraInvalida``."""

    def __init__(
        self,
        terminos: Sequence[str] = (TERMINO_DEL_CATALOGO,),
        *,
        error: Exception | None = None,
        demora_s: float = 0.0,
    ) -> None:
        self._terminos = tuple(terminos)
        self.error = error
        self.demora_s = demora_s
        self.preguntas: list[str] = []

    @property
    def invocaciones(self) -> int:
        return len(self.preguntas)

    async def reformular(self, pregunta: str) -> tuple[str, ...]:
        self.preguntas.append(pregunta)
        if self.demora_s:
            await asyncio.sleep(self.demora_s)
        if self.error is not None:
            raise self.error
        return self._terminos


LLM_CAIDO = FalloDelLlm("LLM local caído")
SALIDA_INVALIDA = SalidaDeReescrituraInvalida("salida inválida")


class EmbedderDeReescritura(EmbedderFalso):
    """Q_TYPO se parece a nada del corpus (e5); su reformulación con ``ribociclib`` se parece a ``ch-m1-1`` (e0)."""

    def embeber(self, texto: str) -> Sequence[float]:
        if texto in (Q_TYPO, Q_SIN_RESPUESTA):
            self.textos.append(texto)
            return _vector(e5=1.0)
        if texto.startswith(Q_TYPO) and texto != Q_TYPO:
            self.textos.append(texto)
            return _vector(e0=1.0)
        if texto.startswith(Q_SIN_RESPUESTA):
            self.textos.append(texto)
            return _vector(e6=1.0)
        return super().embeber(texto)


class RerankerQueRegistraPreguntas(RerankerFalso):
    """Registra la pregunta con la que se puntúa cada lote: debe ser siempre la original (RN-03, RN-06)."""

    def __init__(self, puntajes: dict[str, dict[str, float]]) -> None:
        super().__init__(puntajes)
        self.preguntas: list[str] = []

    def puntuar(self, pregunta: str, candidatos: Sequence[CandidatoParaReranker]) -> list[float]:
        self.preguntas.append(pregunta)
        return super().puntuar(pregunta, candidatos)


def crear_entorno_de_reescritura(
    *,
    reescritor: ReescritorFalso | None = None,
    parametros=None,
    **bordes: Any,
) -> tuple[EntornoDeRecuperacion, ReescritorFalso, RerankerQueRegistraPreguntas]:
    reescritor = ReescritorFalso() if reescritor is None else reescritor
    reranker = RerankerQueRegistraPreguntas(PUNTAJES_DE_REESCRITURA)
    entorno = crear_entorno(
        parametros=parametros or parametros_de_reescritura(),
        embedder=EmbedderDeReescritura(),
        reranker=reranker,
        generador=bordes.pop("generador", FakeEvidenceGenerator()),
        reescritor=reescritor,
        terminos_del_catalogo=CATALOGO_DE_PRUEBA,
        **bordes,
    )
    return entorno, reescritor, reranker
