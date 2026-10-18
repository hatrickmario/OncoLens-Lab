"""Adapter NLI de mDeBERTa con sesión y tokenizer falsos (US-231b D1-D3): lotes, mapeo de clases y errores del puerto."""

from __future__ import annotations

import numpy as np
import pytest

from app.application.ports import FalloDeInferencia, ParNli
from app.domain.nli import IndicesDeClase
from app.infrastructure.nli.mdeberta import ClasificadorNliMdeberta, SalidaConClasesInesperadas
from tests.support.inferencia_falsa import SesionNliFalsa, TokenizadorFalso


def _clasificador(
    sesion: SesionNliFalsa,
    tokenizador: TokenizadorFalso | None = None,
    indices: IndicesDeClase = IndicesDeClase(0, 1, 2),
    max_length: int = 512,
    max_tokens_por_lote: int = 4096,
) -> ClasificadorNliMdeberta:
    return ClasificadorNliMdeberta(
        sesion,
        tokenizador or TokenizadorFalso(),
        version="nli-test@rev#sha256:abc",
        indices=indices,
        max_length=max_length,
        max_tokens_por_lote=max_tokens_por_lote,
    )


def test_un_lote_vacio_devuelve_lista_vacia_sin_invocar_la_sesion_ni_el_tokenizer() -> None:
    sesion, tokenizador = SesionNliFalsa(), TokenizadorFalso()

    assert _clasificador(sesion, tokenizador).clasificar([]) == []
    assert sesion.invocaciones == 0 and tokenizador.llamadas == []


def test_cada_par_recibe_la_etiqueta_de_su_logit_mayor_con_los_indices_de_configuracion() -> None:
    sesion = SesionNliFalsa(fijo=[0.0, 0.0, 6.0])
    indices = IndicesDeClase(entailment=2, neutral=0, contradiction=1)

    resultado = _clasificador(sesion, indices=indices).clasificar([ParNli("a", "b")])

    assert resultado[0].label == "entailment"
    assert resultado[0].p_entailment == pytest.approx(0.9951, abs=1e-3)


def test_el_mismo_logit_cambia_de_etiqueta_cuando_cambia_el_mapeo_de_configuracion() -> None:
    sesion = SesionNliFalsa(fijo=[6.0, 0.0, 0.0])

    por_defecto = _clasificador(sesion).clasificar([ParNli("a", "b")])
    permutado = _clasificador(sesion, indices=IndicesDeClase(1, 2, 0)).clasificar(
        [ParNli("a", "b")]
    )

    assert (por_defecto[0].label, permutado[0].label) == ("entailment", "contradiction")


def test_el_resultado_conserva_el_orden_del_lote_aunque_el_modelo_agrupe_por_largo() -> None:
    tokenizador = TokenizadorFalso()
    pares = [
        ParNli("uno dos tres cuatro cinco seis", "siete ocho"),
        ParNli("a", "b"),
        ParNli("alfa beta gamma", "delta"),
    ]
    columnas = {0: [5.0, 0.0, 0.0], 1: [0.0, 5.0, 0.0], 2: [0.0, 0.0, 5.0]}
    tabla = {
        tuple(tokenizador.codificar(p.premisa, p.hipotesis)): columnas[i]
        for i, p in enumerate(pares)
    }

    resultados = _clasificador(SesionNliFalsa(tabla), tokenizador).clasificar(pares)

    assert [r.label for r in resultados] == ["entailment", "neutral", "contradiction"]


def test_el_modelo_solo_recibe_la_premisa_y_la_hipotesis_de_cada_par() -> None:
    tokenizador = TokenizadorFalso()

    _clasificador(SesionNliFalsa(), tokenizador).clasificar([ParNli("premisa", "hipotesis")])

    assert tokenizador.llamadas == [("premisa", "hipotesis")]


def test_un_lote_grande_se_parte_por_el_presupuesto_de_tokens_y_todos_reciben_resultado() -> None:
    sesion = SesionNliFalsa(fijo=[0.0, 3.0, 0.0])
    pares = [ParNli(f"palabra{i} otra", "hipotesis") for i in range(6)]

    resultados = _clasificador(sesion, max_tokens_por_lote=20).clasificar(pares)

    assert sesion.invocaciones > 1
    assert [r.label for r in resultados] == ["neutral"] * 6


def test_un_par_mas_largo_que_el_modelo_falla_cerrado_con_el_error_del_puerto_sin_su_texto() -> (
    None
):
    sesion = SesionNliFalsa()
    par = ParNli("palabra " * 40, "hipotesis-secreta")

    with pytest.raises(FalloDeInferencia) as error:
        _clasificador(sesion, max_length=16).clasificar([par])

    assert "hipotesis-secreta" not in str(error.value) and sesion.invocaciones == 0


def test_una_salida_sin_tres_clases_lanza_el_error_de_clases_inesperadas_que_es_del_puerto() -> (
    None
):
    with pytest.raises(SalidaConClasesInesperadas) as error:
        _clasificador(SesionNliFalsa(columnas=2)).clasificar([ParNli("a", "b")])

    assert isinstance(error.value, FalloDeInferencia)


@pytest.mark.parametrize("logits", [[float("nan"), 0.0, 0.0], [float("inf"), 0.0, 0.0]])
def test_un_logit_no_finito_lanza_el_error_del_puerto_en_vez_de_una_clase(
    logits: list[float],
) -> None:
    with pytest.raises(FalloDeInferencia):
        _clasificador(SesionNliFalsa(fijo=logits)).clasificar([ParNli("a", "b")])


def test_una_salida_con_otra_cantidad_de_filas_lanza_el_error_del_puerto() -> None:
    class SesionConFilasDeMas:
        def ejecutar(self, secuencias):  # noqa: ANN001
            return np.zeros((len(secuencias) + 1, 3), dtype=np.float32)

    with pytest.raises(FalloDeInferencia):
        _clasificador(SesionConFilasDeMas()).clasificar([ParNli("a", "b")])  # type: ignore[arg-type]


def test_el_fallo_del_tokenizer_sale_como_error_del_puerto_sin_texto_ni_causa_encadenada() -> None:
    tokenizador = TokenizadorFalso(error=ValueError("no se pudo tokenizar premisa-secreta"))

    with pytest.raises(FalloDeInferencia) as error:
        _clasificador(SesionNliFalsa(), tokenizador).clasificar([ParNli("premisa-secreta", "h")])

    assert "premisa-secreta" not in f"{error.value} {error.value!r}"
    assert error.value.__cause__ is None and error.value.__suppress_context__


def test_el_fallo_de_la_sesion_sale_como_error_del_puerto_sin_texto_ni_causa_encadenada() -> None:
    sesion = SesionNliFalsa(error=RuntimeError("falla con hipotesis-secreta"))

    with pytest.raises(FalloDeInferencia) as error:
        _clasificador(sesion).clasificar([ParNli("a", "hipotesis-secreta")])

    assert "hipotesis-secreta" not in f"{error.value} {error.value!r}"
    assert error.value.__cause__ is None and error.value.__suppress_context__


def test_la_comprobacion_de_arranque_pasa_con_tres_clases_y_falla_con_otra_cantidad() -> None:
    _clasificador(SesionNliFalsa()).comprobar_salida()

    with pytest.raises(SalidaConClasesInesperadas):
        _clasificador(SesionNliFalsa(columnas=1)).comprobar_salida()
