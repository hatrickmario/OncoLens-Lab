"""Adapter de bge-reranker-v2-m3 (int8, CPU/ONNX; ADR-39): puntaje por candidato ya normalizado a [0, 1] (RN-03)."""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np

from app.application.ports import CandidatoParaReranker, FalloDeInferencia
from app.domain.normalizacion_puntaje import normalizar_a_unidad
from app.domain.ventanas_del_reranker import (
    MODO_DE_VENTANAS_INICIAL,
    RERANKER_WINDOW_OVERLAP_INICIAL,
    ConfiguracionDelReranker,
    ModoDeVentanas,
    agregar_por_maximo,
    trazar_ventanas,
)
from app.infrastructure.models.fallos import fallos_de_inferencia_como_error_del_puerto
from app.infrastructure.models.lotes import (
    agrupar_por_presupuesto_de_tokens,
    truncar_conservando_el_separador_final,
)
from app.infrastructure.models.sesion import SesionDeInferencia, Tokenizador

_FALLO = "reranker: fallo de inferencia del modelo local"
_EXCESO_DE_PARES = "reranker: más pares que RERANKER_MAX_PAIRS"


def _maximos_por_candidato(logits: list[float], ventanas_por_candidato: list[int]) -> list[float]:
    """El logit de cada chunk: el mayor de sus ventanas, que ``logits`` trae seguidas y en el orden de los candidatos."""
    maximos: list[float] = []
    inicio = 0
    for cantidad in ventanas_por_candidato:
        maximos.append(agregar_por_maximo(logits[inicio : inicio + cantidad]))
        inicio += cantidad
    return maximos


class BgeReranker:
    """``Reranker``: nunca devuelve ``None`` ni un ``0.0`` por defecto; si no puede puntuar, lanza el error del puerto."""

    def __init__(
        self,
        sesion: SesionDeInferencia,
        tokenizador: Tokenizador,
        *,
        version: str,
        max_length: int,
        max_pairs: int,
        max_tokens_por_lote: int,
        modo_de_ventanas: ModoDeVentanas = MODO_DE_VENTANAS_INICIAL,
        solape: int = RERANKER_WINDOW_OVERLAP_INICIAL,
    ) -> None:
        self._sesion = sesion
        self._tokenizador = tokenizador
        self._version = version
        self._max_length = max_length
        self._max_pairs = max_pairs
        self._max_tokens_por_lote = max_tokens_por_lote
        self._modo_de_ventanas = modo_de_ventanas
        self._solape = solape

    @property
    def version(self) -> str:
        return self._version

    @property
    def configuracion(self) -> ConfiguracionDelReranker:
        """La etapa tal como corre; el informe de la suite la registra (``meta.rerankerModel`` no lleva el modo, D4)."""
        return ConfiguracionDelReranker(
            self._modo_de_ventanas, self._solape, self._max_length, self._max_pairs
        )

    def variante(
        self,
        *,
        modo_de_ventanas: ModoDeVentanas | None = None,
        solape: int | None = None,
        max_length: int | None = None,
        max_pairs: int | None = None,
    ) -> BgeReranker:
        """Otro reranker sobre la misma sesión y el mismo tokenizador ya cargados (no tiene estado propio), con la
        etapa cambiada: lo usa la suite ``evaluate`` para comparar brazos sin cargar el modelo otra vez (US-278)."""
        return BgeReranker(
            self._sesion,
            self._tokenizador,
            version=self._version,
            max_length=self._max_length if max_length is None else max_length,
            max_pairs=self._max_pairs if max_pairs is None else max_pairs,
            max_tokens_por_lote=self._max_tokens_por_lote,
            modo_de_ventanas=self._modo_de_ventanas
            if modo_de_ventanas is None
            else modo_de_ventanas,
            solape=self._solape if solape is None else solape,
        )

    def puntuar(self, pregunta: str, candidatos: Sequence[CandidatoParaReranker]) -> list[float]:
        if len(candidatos) > self._max_pairs:
            raise FalloDeInferencia(_EXCESO_DE_PARES)
        if not candidatos:
            return []
        with fallos_de_inferencia_como_error_del_puerto(_FALLO):
            return self._puntuar_pares(pregunta, [c.chunk_text for c in candidatos])

    def _puntuar_pares(self, pregunta: str, pasajes: list[str]) -> list[float]:
        if self._modo_de_ventanas == "maximo":
            return self._puntuar_por_ventanas(pregunta, pasajes)
        secuencias = [
            truncar_conservando_el_separador_final(
                self._tokenizador.codificar(pregunta, pasaje), self._max_length
            )
            for pasaje in pasajes
        ]
        return normalizar_a_unidad(self._logits_de(secuencias))

    def _puntuar_por_ventanas(self, pregunta: str, pasajes: list[str]) -> list[float]:
        """``maximo`` (US-278): cada chunk largo se puntúa por ventanas y su logit es el mayor de las suyas (RN-03)."""
        secuencias: list[list[int]] = []
        ventanas_por_candidato: list[int] = []
        for pasaje in pasajes:
            del_candidato = self._secuencias_del_candidato(pregunta, pasaje)
            secuencias.extend(del_candidato)
            ventanas_por_candidato.append(len(del_candidato))
        return normalizar_a_unidad(
            _maximos_por_candidato(self._logits_de(secuencias), ventanas_por_candidato)
        )

    def _secuencias_del_candidato(self, pregunta: str, pasaje: str) -> list[list[int]]:
        """Una secuencia si el par cabe en ``max_length`` (idéntica a la de ``primera``); si no, una por ventana, cada
        una con la pregunta y los especiales enteros. Capacidad que no deja avanzar la ventana: ``ValueError``."""
        par = self._tokenizador.codificar_par(pregunta, pasaje)
        if len(par.ids) <= self._max_length:
            return [par.ids]
        prefijo, sufijo = par.ids[: par.inicio_pasaje], par.ids[par.fin_pasaje :]
        tokens_del_pasaje = par.ids[par.inicio_pasaje : par.fin_pasaje]
        capacidad = self._max_length - len(prefijo) - len(sufijo)
        return [
            [*prefijo, *tokens_del_pasaje[v.inicio : v.fin], *sufijo]
            for v in trazar_ventanas(len(tokens_del_pasaje), capacidad, self._solape)
        ]

    def _logits_de(self, secuencias: list[list[int]]) -> list[float]:
        logits: list[float | None] = [None] * len(secuencias)
        for lote in agrupar_por_presupuesto_de_tokens(secuencias, self._max_tokens_por_lote):
            salida = self._sesion.ejecutar([secuencias[i] for i in lote])
            for indice, logit in zip(lote, self._logits_del_lote(salida, len(lote))):
                logits[indice] = logit
        if any(logit is None for logit in logits):  # un hueco jamás se disfraza de un logit 0.0
            raise FalloDeInferencia(_FALLO)
        return [logit for logit in logits if logit is not None]

    @staticmethod
    def _logits_del_lote(salida: np.ndarray, tamano: int) -> list[float]:
        """Un logit finito por par: otra forma, un NaN o un infinito rompen el contrato en vez de disfrazarse de 0.0."""
        logits = np.asarray(salida, dtype=np.float64)
        if logits.shape not in ((tamano,), (tamano, 1)) or not np.isfinite(logits).all():
            raise FalloDeInferencia(_FALLO)
        return logits.reshape(-1).tolist()
