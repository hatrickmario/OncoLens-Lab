"""El sparse de la medición de ADR-39 y el de la ingesta dan lo mismo con los mismos pesos (US-117a D3)."""

from __future__ import annotations

from types import SimpleNamespace

import numpy as np
import pytest

from app.domain.pesos_sparse import pesos_lexicos
from app.evaluation.envoltorios import EmbedderOnnx
from app.infrastructure.embeddings.bge_m3_sparse import CodificadorSparseBgeM3
from tests.support.inferencia_falsa import TokenizadorFalso

DIMENSION = 6
PESOS = np.array([0.5, -1.0, 0.25, 0.75, -0.5, 1.0], dtype=np.float32)
SESGO = -0.1


def _ocultos(secuencia: list[int]) -> np.ndarray:
    """Estados ocultos deterministas por token: varían con el id para que los pesos difieran entre tokens."""
    return np.array(
        [
            [((token * (columna + 3)) % 7) / 7.0 for columna in range(DIMENSION)]
            for token in secuencia
        ],
        dtype=np.float32,
    )


class _SesionDeOcultos:
    def ejecutar(self, secuencias):  # noqa: ANN001
        largo = max(len(s) for s in secuencias)
        salida = np.zeros((len(secuencias), largo, DIMENSION), dtype=np.float32)
        for fila, secuencia in enumerate(secuencias):
            salida[fila, : len(secuencia)] = _ocultos(list(secuencia))
        return salida


class _TokenizadorDeEnvoltorio:
    def __init__(self) -> None:
        self._interno = TokenizadorFalso()

    def encode(self, texto: str) -> SimpleNamespace:
        return SimpleNamespace(ids=self._interno.codificar(texto))


def _envoltorio() -> EmbedderOnnx:
    embedder = EmbedderOnnx.__new__(EmbedderOnnx)
    embedder.spec = SimpleNamespace(max_length=64, pooling="cls")  # type: ignore[assignment]
    embedder.tokenizador = _TokenizadorDeEnvoltorio()  # type: ignore[assignment]
    embedder._pesos_sparse = (PESOS.reshape(1, -1), np.array([SESGO], dtype=np.float32))  # noqa: SLF001
    embedder._correr = lambda secuencias: np.stack([_ocultos(s) for s in secuencias])  # type: ignore[method-assign]  # noqa: SLF001
    return embedder


def _adapter() -> CodificadorSparseBgeM3:
    return CodificadorSparseBgeM3(
        _SesionDeOcultos(),  # type: ignore[arg-type]
        TokenizadorFalso(),
        pesos=PESOS,
        sesgo=SESGO,
        max_length=64,
        max_tokens_por_lote=4096,
    )


@pytest.mark.parametrize(
    "texto", ["her2 mama", "tamoxifeno adyuvante quimioterapia estadio temprano", "ki67"]
)
def test_el_envoltorio_de_adr39_y_el_adapter_de_la_ingesta_dan_los_mismos_terminos(
    texto: str,
) -> None:
    del_envoltorio = _envoltorio().pesos_sparse(texto)
    del_adapter = _adapter().codificar([texto])[0]

    assert del_envoltorio, "el caso de prueba debe producir al menos un término"
    assert del_adapter.keys() == del_envoltorio.keys()
    for token, peso in del_envoltorio.items():
        assert del_adapter[token] == pytest.approx(peso, rel=1e-5)


def test_pesos_lexicos_aplica_la_relu_sobre_la_cabeza_lineal() -> None:
    oculto = np.array([[1.0, 0.0], [0.0, 1.0]], dtype=np.float32)

    resultado = pesos_lexicos(oculto, np.array([[2.0, -3.0]]), 0.5)

    assert resultado.tolist() == pytest.approx([2.5, 0.0])
