"""Tokenizer de BGE-M3 para trocear la semilla en TOKENS (US-231b AC-8, ``[S1 resp. 38]``).

``fragmentar()`` cuenta piezas: con este adapter cada pieza es un token del modelo de embeddings, así que
``CORPUS_CHUNK_SIZE`` y ``CORPUS_CHUNK_OVERLAP`` se leen en tokens (ADR-39). El tokenizer se carga de un
``tokenizer.json`` local ya verificado (``Tokenizer.from_file``): jamás consulta un hub (RN-12).
"""

from __future__ import annotations

from pathlib import Path

from tokenizers import Tokenizer


class TokenizadorDePiezas:
    """``Tokenizador`` del cargador de la semilla: piezas cuya concatenación es el texto, una por token del modelo."""

    def __init__(self, ruta: Path) -> None:
        self._tokenizador = Tokenizer.from_file(str(ruta))
        self._tokenizador.no_truncation()
        self._tokenizador.no_padding()

    def tokenizar(self, texto: str) -> list[str]:
        """Parte el texto en un trozo por token (sin tokens especiales) respetando cada espacio y salto de línea.

        Cada pieza va desde el inicio de su token hasta el inicio del siguiente; la primera arranca en 0 y la última
        llega al final, de modo que ``"".join(piezas) == texto`` y ``len(piezas)`` es el número de tokens.
        """
        inicios = [
            inicio
            for inicio, _ in self._tokenizador.encode(texto, add_special_tokens=False).offsets
        ]
        if not inicios:
            return []
        # Un token cuyo inicio retrocede (normalización) no puede deshacer el recorte anterior: se mantiene monótono.
        monotonos = [0]
        for inicio in inicios[1:]:
            monotonos.append(max(inicio, monotonos[-1]))
        limites = [*monotonos, len(texto)]
        return [texto[a:b] for a, b in zip(limites, limites[1:])]
