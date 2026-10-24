"""Adapter sparse de BGE-M3 (US-117a D3): pesos relu(sparse_linear), lotes, truncado y errores del puerto."""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np
import pytest

from app.application.ports import FalloDeInferencia
from app.infrastructure.embeddings.bge_m3_sparse import CodificadorSparseBgeM3
from tests.support.inferencia_falsa import TokenizadorFalso, id_de_palabra

DIMENSION = 4


class SesionOcultaPorToken:
    """Estados ocultos ``[lote, tokens, dim]``: el token en la posición ``p`` pone 1 en ``id % dim`` (determinista)."""

    def __init__(self, error: Exception | None = None) -> None:
        self.error = error

    def ejecutar(self, secuencias: Sequence[Sequence[int]]) -> np.ndarray:
        if self.error is not None:
            raise self.error
        largo = max(len(s) for s in secuencias)
        salida = np.zeros((len(secuencias), largo, DIMENSION), dtype=np.float32)
        for fila, secuencia in enumerate(secuencias):
            for posicion, token in enumerate(secuencia):
                salida[fila, posicion, token % DIMENSION] = 1.0
        return salida


def _codificador(
    sesion: object | None = None, pesos: list[float] | None = None, **cambios: object
) -> CodificadorSparseBgeM3:
    valores: dict[str, object] = {
        "pesos": np.array(pesos or [1.0] * DIMENSION),
        "sesgo": 0.0,
        "max_length": 64,
        "max_tokens_por_lote": 4096,
        **cambios,
    }
    return CodificadorSparseBgeM3(
        sesion or SesionOcultaPorToken(),  # type: ignore[arg-type]
        TokenizadorFalso(),
        **valores,  # type: ignore[arg-type]
    )


def test_devuelve_un_mapa_por_texto_en_el_mismo_orden_con_el_peso_de_cada_token() -> None:
    mapas = _codificador().codificar(["her2 mama", "ki67"])

    assert set(mapas[0]) == {id_de_palabra("her2"), id_de_palabra("mama")}
    assert set(mapas[1]) == {id_de_palabra("ki67")}
    assert all(peso == pytest.approx(1.0) for peso in mapas[0].values())


def test_no_incluye_los_tokens_especiales() -> None:
    (mapa,) = _codificador().codificar(["her2"])

    assert 0 not in mapa and 2 not in mapa


def test_aplica_el_sesgo_y_la_relu() -> None:
    (mapa,) = _codificador(sesgo=-0.25).codificar(["her2"])

    assert mapa[id_de_palabra("her2")] == pytest.approx(0.75)


def test_falla_con_el_error_del_puerto_cuando_un_pasaje_queda_sin_terminos() -> None:
    with pytest.raises(FalloDeInferencia):
        _codificador(sesgo=-5.0).codificar(["her2"])


def test_traduce_los_fallos_del_runtime_sin_el_texto_del_pasaje() -> None:
    texto = "texto-clinico-que-no-debe-salir-en-el-error"
    codificador = _codificador(sesion=SesionOcultaPorToken(RuntimeError(texto)))

    with pytest.raises(FalloDeInferencia) as error:
        codificador.codificar([texto])

    assert texto not in str(error.value) and error.value.__cause__ is None


def test_falla_cuando_la_dimension_del_estado_oculto_no_coincide_con_los_pesos() -> None:
    with pytest.raises(FalloDeInferencia):
        _codificador(pesos=[1.0, 1.0]).codificar(["her2"])


def test_devuelve_lista_vacia_sin_invocar_el_modelo_cuando_no_hay_textos() -> None:
    assert _codificador(sesion=SesionOcultaPorToken(RuntimeError("no"))).codificar([]) == []


def test_el_resultado_no_depende_de_como_se_agrupen_los_pasajes_en_lotes() -> None:
    textos = ["her2 mama", "ki67", "tamoxifeno adyuvante quimioterapia"]

    juntos = _codificador(max_tokens_por_lote=4096).codificar(textos)
    de_a_uno = _codificador(max_tokens_por_lote=1).codificar(textos)

    assert juntos == de_a_uno
