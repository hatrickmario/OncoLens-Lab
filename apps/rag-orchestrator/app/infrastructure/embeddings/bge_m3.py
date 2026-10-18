"""Adapter de BGE-M3 (int8, CPU/ONNX; ADR-39): un núcleo, dos puertos (``QueryEmbedder`` y ``PassageEmbedder``)."""

from __future__ import annotations

from collections.abc import Sequence

from app.infrastructure.models.sesion import SesionDeInferencia, Tokenizador


class NucleoBgeM3:
    """Una sola sesión de modelo para los dos puertos; solo cambia el prefijo del texto."""

    def __init__(
        self,
        sesion: SesionDeInferencia,
        tokenizador: Tokenizador,
        *,
        modelo: str,
        dimension: int,
        max_length: int,
        max_tokens_por_lote: int,
        prefijo_consulta: str = "",
        prefijo_pasaje: str = "",
    ) -> None:
        raise NotImplementedError

    @property
    def modelo(self) -> str:
        raise NotImplementedError

    def vectorizar_consulta(self, texto: str) -> list[float]:
        raise NotImplementedError

    def vectorizar_pasajes(self, textos: Sequence[str]) -> list[list[float]]:
        raise NotImplementedError


class EmbedderDeConsultaBgeM3:
    """``QueryEmbedder``."""

    def __init__(self, nucleo: NucleoBgeM3) -> None:
        raise NotImplementedError

    @property
    def modelo(self) -> str:
        raise NotImplementedError

    def embeber(self, texto: str) -> Sequence[float]:
        raise NotImplementedError


class EmbedderDePasajesBgeM3:
    """``PassageEmbedder``."""

    def __init__(self, nucleo: NucleoBgeM3) -> None:
        raise NotImplementedError

    def embeber(self, textos: Sequence[str]) -> list[list[float]]:
        raise NotImplementedError
