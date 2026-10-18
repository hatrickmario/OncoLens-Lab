"""Adapter de mDeBERTa-v3-base-xnli-multilingual-nli-2mil7 (fp32, CPU/ONNX; ADR-39): puerto ``NliClassifier``.

Recibe solo la premisa (texto del corpus) y la hipótesis (RN-11). Las columnas de cada clase salen de la configuración
versionada (``IndicesDeClase``), jamás del ``config.json`` del modelo: un mapeo alterado invertiría el soporte (RN-01).
"""

from __future__ import annotations

import numpy as np

from app.application.ports import FalloDeInferencia, ParNli, ResultadoNli
from app.domain.nli import (
    NUMERO_DE_CLASES,
    IndicesDeClase,
    ProbabilidadesNli,
    calcular_probabilidades,
    etiqueta_mas_probable,
)
from app.infrastructure.models.fallos import fallos_de_inferencia_como_error_del_puerto
from app.infrastructure.models.lotes import agrupar_por_presupuesto_de_tokens
from app.infrastructure.models.sesion import SesionDeInferencia, Tokenizador

_FALLO = "nli: fallo de inferencia del modelo local"
_PAR_DEMASIADO_LARGO = "nli: un par supera NLI_MAX_LENGTH"
_PAR_DE_COMPROBACION = ParNli(premisa="prueba", hipotesis="prueba")


class SalidaConClasesInesperadas(FalloDeInferencia):
    """La salida del modelo no tiene tres clases: el mapeo de ``NLI_LABEL_INDEX_*`` no puede aplicarse."""


class ClasificadorNliMdeberta:
    """``NliClassifier``: nunca devuelve ``None`` ni una etiqueta por defecto; si no puede clasificar, lanza el error del puerto."""

    def __init__(
        self,
        sesion: SesionDeInferencia,
        tokenizador: Tokenizador,
        *,
        version: str,
        indices: IndicesDeClase,
        max_length: int,
        max_tokens_por_lote: int,
    ) -> None:
        self._sesion = sesion
        self._tokenizador = tokenizador
        self._version = version
        self._indices = indices
        self._max_length = max_length
        self._max_tokens_por_lote = max_tokens_por_lote

    @property
    def version(self) -> str:
        return self._version

    def clasificar(self, pares: list[ParNli]) -> list[ResultadoNli]:
        return [
            ResultadoNli(label=etiqueta_mas_probable(p), p_entailment=p.entailment)
            for p in self.probabilidades(pares)
        ]

    def probabilidades(self, pares: list[ParNli]) -> list[ProbabilidadesNli]:
        """Las tres probabilidades de cada par (suman 1), en el orden recibido; un lote vacío no invoca al modelo."""
        if not pares:
            return []
        with fallos_de_inferencia_como_error_del_puerto(_FALLO):
            return self._probabilidades_de(pares)

    def comprobar_salida(self) -> None:
        """Una pasada de prueba al arrancar: una salida sin tres clases lanza ``SalidaConClasesInesperadas``."""
        self.probabilidades([_PAR_DE_COMPROBACION])

    def _probabilidades_de(self, pares: list[ParNli]) -> list[ProbabilidadesNli]:
        secuencias = [self._codificar(par) for par in pares]
        resultados: list[ProbabilidadesNli | None] = [None] * len(secuencias)
        for lote in agrupar_por_presupuesto_de_tokens(secuencias, self._max_tokens_por_lote):
            salida = self._sesion.ejecutar([secuencias[i] for i in lote])
            for indice, logits in zip(lote, self._logits_del_lote(salida, len(lote))):
                resultados[indice] = calcular_probabilidades(logits, self._indices)
        if any(r is None for r in resultados):  # un hueco jamás se disfraza de una clase
            raise FalloDeInferencia(_FALLO)
        return [r for r in resultados if r is not None]

    def _codificar(self, par: ParNli) -> list[int]:
        """Un par más largo que el modelo falla cerrado: recortar la hipótesis podría validar una afirmación a medias."""
        ids = self._tokenizador.codificar(par.premisa, par.hipotesis)
        if len(ids) > self._max_length:
            raise FalloDeInferencia(_PAR_DEMASIADO_LARGO)
        return ids

    @staticmethod
    def _logits_del_lote(salida: np.ndarray, tamano: int) -> list[list[float]]:
        logits = np.asarray(salida, dtype=np.float64)
        if logits.ndim != 2 or logits.shape[0] != tamano:
            raise FalloDeInferencia(_FALLO)
        if logits.shape[1] != NUMERO_DE_CLASES:
            raise SalidaConClasesInesperadas(_FALLO)
        if not np.isfinite(logits).all():
            raise FalloDeInferencia(_FALLO)
        return logits.tolist()
