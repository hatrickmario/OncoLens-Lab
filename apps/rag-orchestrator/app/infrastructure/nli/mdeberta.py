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
    dividir_premisa_en_ventanas,
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
        """Una probabilidad por par: la de su ventana con mayor ``p_entailment`` (un par corto es una sola ventana)."""
        secuencias: list[list[int]] = []
        duenos: list[int] = []
        for indice_del_par, par in enumerate(pares):
            for secuencia in self._ventanas_de(par):
                secuencias.append(secuencia)
                duenos.append(indice_del_par)
        por_ventana = self._probabilidades_por_ventana(secuencias)
        mejores: list[ProbabilidadesNli | None] = [None] * len(pares)
        for dueno, candidata in zip(duenos, por_ventana):
            actual = mejores[dueno]
            if actual is None or candidata.entailment > actual.entailment:
                mejores[dueno] = candidata
        if any(m is None for m in mejores):  # un hueco jamás se disfraza de una clase
            raise FalloDeInferencia(_FALLO)
        return [m for m in mejores if m is not None]

    def _probabilidades_por_ventana(self, secuencias: list[list[int]]) -> list[ProbabilidadesNli]:
        resultados: list[ProbabilidadesNli | None] = [None] * len(secuencias)
        for lote in agrupar_por_presupuesto_de_tokens(secuencias, self._max_tokens_por_lote):
            salida = self._sesion.ejecutar([secuencias[i] for i in lote])
            for indice, logits in zip(lote, self._logits_del_lote(salida, len(lote))):
                resultados[indice] = calcular_probabilidades(logits, self._indices)
        if any(r is None for r in resultados):
            raise FalloDeInferencia(_FALLO)
        return [r for r in resultados if r is not None]

    def _ventanas_de(self, par: ParNli) -> list[list[int]]:
        """Un par que cabe es una ventana; uno más largo divide la PREMISA en ventanas que caben con la hipótesis entera.

        Recortar la hipótesis podría validar una afirmación a medias (RN-01): si la hipótesis sola no cabe, falla cerrado.
        """
        completo = self._tokenizador.codificar(par.premisa, par.hipotesis)
        if len(completo) <= self._max_length:
            return [completo]
        palabras_por_ventana = len(par.premisa.split()) // 2
        while palabras_por_ventana >= 1:
            ventanas = [
                self._tokenizador.codificar(ventana, par.hipotesis)
                for ventana in dividir_premisa_en_ventanas(par.premisa, palabras_por_ventana)
            ]
            if all(len(v) <= self._max_length for v in ventanas):
                return ventanas
            palabras_por_ventana //= 2
        raise FalloDeInferencia(_PAR_DEMASIADO_LARGO)

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
