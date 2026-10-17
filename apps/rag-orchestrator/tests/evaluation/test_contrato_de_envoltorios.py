"""Los fakes cumplen el mismo contrato que los envoltorios reales (LSP): una lista vacía es un error, no un resultado."""

from __future__ import annotations

import pytest
from app.evaluation.envoltorios import EmbedderOnnx, NliOnnx, RerankerOnnx
from modelos_falsos import EmbedderFalso, NliFalso, RerankerFalso


@pytest.mark.parametrize(
    "llamada",
    [
        lambda: EmbedderFalso().codificar([], consulta=False),
        lambda: RerankerFalso().puntuar("consulta", []),
        lambda: NliFalso().clasificar([]),
    ],
    ids=["embedder-falso", "reranker-falso", "nli-falso"],
)
def test_los_modelos_falsos_rechazan_una_lista_vacia_con_value_error(llamada) -> None:  # type: ignore[no-untyped-def]
    with pytest.raises(ValueError, match="vacía"):
        llamada()


@pytest.mark.parametrize(
    "llamada",
    [
        lambda: EmbedderOnnx.__new__(EmbedderOnnx).codificar([], consulta=False),
        lambda: RerankerOnnx.__new__(RerankerOnnx).puntuar("consulta", []),
        lambda: NliOnnx.__new__(NliOnnx).clasificar([]),
    ],
    ids=["embedder-onnx", "reranker-onnx", "nli-onnx"],
)
def test_los_envoltorios_onnx_rechazan_una_lista_vacia_con_value_error_antes_de_tocar_el_modelo(llamada) -> None:  # type: ignore[no-untyped-def]
    with pytest.raises(ValueError, match="vacía"):
        llamada()
