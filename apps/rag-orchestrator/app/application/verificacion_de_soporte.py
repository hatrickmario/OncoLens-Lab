"""Etapa de soporte de `/rag/query` (L1D-180, RN-01 y RN-23): lenguaje → NLI → opciones soportadas o descartadas.

Orquesta los puertos (NLI, términos prohibidos) y delega toda decisión en ``domain/support.py``. Falla cerrada: si el
NLI no responde o rompe su contrato, ninguna opción sale sin validar (``NliNoDisponibleError``, `503`).

Logs: solo conteos, latencia, ``nliModel``, ``traceId`` y, por fragmento retirado, ``campo``, ``ruleId`` y
``languagePolicyVersion``; nunca el texto de una afirmación, un chunk, una opción, la pregunta ni el término (RN-10).
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Mapping, Sequence

from app.application.errores import NliNoDisponibleError
from app.application.ports import Clock, NliClassifier, ProhibitedTermsChecker
from app.domain.citations import OpcionAceptada, OpcionDescartada
from app.domain.nli import ParNli, ResultadoNli
from app.domain.support import (
    ResultadoSoporte,
    RetiroDeLenguaje,
    pares_a_verificar,
    planificar_soporte,
    retirar_texto_prohibido,
    soporta,
    verificar_soporte,
)

logger = logging.getLogger(__name__)


class VerificadorDeSoporte:
    def __init__(
        self,
        *,
        clasificador: NliClassifier,
        terminos: ProhibitedTermsChecker,
        umbral: float,
        reloj: Clock,
        max_palabras_por_afirmacion: int,
    ) -> None:
        self._clasificador = clasificador
        self._terminos = terminos
        self._umbral = umbral
        self._reloj = reloj
        self._max_palabras = max_palabras_por_afirmacion

    @property
    def nli_model(self) -> str:
        """``meta.nliModel``: la versión del clasificador que de verdad verificó (FR-25), no una copia en configuración."""
        return self._clasificador.version

    async def verificar(
        self,
        trace_id: str,
        idioma: str,
        aceptadas: Sequence[OpcionAceptada],
        limitaciones_propuestas: Sequence[str],
        textos_de_chunks: Mapping[str, str],
    ) -> ResultadoSoporte:
        """Etapa SOPORTE: va antes del recorte a ``maxOptions``; nunca se recortan candidatas sin verificar."""
        inicio = self._reloj.ahora()
        plan = planificar_soporte(
            aceptadas,
            limitaciones_propuestas,
            textos_de_chunks,
            self._terminos.reglas_coincidentes,
            max_palabras=self._max_palabras,
        )
        self._registrar_retiros(trace_id, plan.retiros)
        pares = pares_a_verificar(plan)
        resultados = await self.clasificar_pares(trace_id, pares)
        resultado = verificar_soporte(plan, resultados, self._umbral, idioma)
        logger.info(
            "event=rag_query_soporte traceId=%s afirmaciones=%d paresNli=%d opcionesDescartadas=%d "
            "omittedClaims=%d latencyMs=%d nliModel=%s",
            trace_id,
            sum(len(o.afirmaciones) for o in plan.opciones) + len(plan.limitaciones),
            len(pares),
            len(resultado.descartadas),
            resultado.omitidas,
            int((self._reloj.ahora() - inicio).total_seconds() * 1000),
            self.nli_model,
        )
        return resultado

    def sanear_descartadas(
        self, trace_id: str, idioma: str, descartadas: Sequence[OpcionDescartada]
    ) -> tuple[OpcionDescartada, ...]:
        """RN-23: una opción descartada por sus citas también es salida generada; su lenguaje prohibido se retira."""
        saneadas: list[OpcionDescartada] = []
        for descartada in descartadas:
            opcion, retiros = retirar_texto_prohibido(
                descartada.opcion, self._terminos.reglas_coincidentes, idioma, self._max_palabras
            )
            self._registrar_retiros(trace_id, retiros)
            saneadas.append(OpcionDescartada(opcion, descartada.motivo))
        return tuple(saneadas)

    async def pares_soportados(self, trace_id: str, pares: list[ParNli]) -> list[bool]:
        """Un veredicto por par: ``entailment`` sobre el umbral (``soporta``). Mismo clasificador y misma falla cerrada que
        el soporte de las opciones; lo usa la aplicabilidad textual (US-123) con un lote propio."""
        resultados = await self.clasificar_pares(trace_id, pares)
        return [soporta(r, self._umbral) for r in resultados]

    async def clasificar_pares(self, trace_id: str, pares: list[ParNli]) -> list[ResultadoNli]:
        """Un lote único por etapa. Cualquier fallo, o un resultado que no cumple el contrato, falla cerrado."""
        if not pares:
            return []
        try:
            resultados = await asyncio.to_thread(self._clasificador.clasificar, pares)
            if len(resultados) != len(pares) or not all(
                isinstance(r, ResultadoNli) for r in resultados
            ):
                raise ValueError("el NLI debe devolver un resultado por par")
        except Exception as error:  # noqa: BLE001 - todo fallo del NLI es "verificador no disponible"
            logger.warning(
                "event=nli_fallo error=%s traceId=%s nliModel=%s",
                type(error).__name__,
                trace_id,
                self.nli_model,
            )
            raise NliNoDisponibleError() from None
        return resultados

    def _registrar_retiros(self, trace_id: str, retiros: Sequence[RetiroDeLenguaje]) -> None:
        for retiro in retiros:
            for regla in retiro.reglas:
                logger.info(
                    "event=fragmento_retirado_lenguaje traceId=%s campo=%s papel=%s ruleId=%s languagePolicyVersion=%s",
                    trace_id,
                    retiro.campo,
                    retiro.papel or "n_a",
                    regla,
                    self._terminos.version,
                )
