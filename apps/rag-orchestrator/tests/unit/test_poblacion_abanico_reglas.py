"""Reglas puras por valor de la extracción de población en abanico (US-242, ADR-47, D4). Sin adapters."""

from __future__ import annotations

import pytest

from app.domain.corpus_metadata.campos import LONGITUD_MAXIMA_DE_VALOR
from app.domain.corpus_metadata.poblacion_abanico import (
    ValorPropuesto,
    descartar_por_longitud,
    hipotesis_de_valor,
    omitir_lenguaje_prescriptivo,
    pares_de_verificacion,
    rechazar_relleno,
    validar_chunk,
    verificar_nli,
)
from app.domain.nli import ResultadoNli


def _v(valor: str, chunk: str = "c1", alcance: str = "elegibilidad") -> ValorPropuesto:
    return ValorPropuesto(valor, chunk, alcance)  # type: ignore[arg-type]


@pytest.mark.parametrize(
    "relleno",
    ["not found", "Not Found", "none", "NONE.", "no expresado", "N/A", "  unknown  ", "Ninguno"],
)
def test_rechazar_relleno_descarta_un_marcador_de_ausencia_sea_cual_sea_su_forma(
    relleno: str,
) -> None:
    resultado = rechazar_relleno([_v(relleno), _v("HER2-positive")])

    assert [v.valor for v in resultado.conservados] == ["HER2-positive"]
    assert resultado.descartados == 1


def test_rechazar_relleno_conserva_un_valor_que_solo_contiene_un_marcador() -> None:
    resultado = rechazar_relleno([_v("none of the above stages"), _v("not found in the biopsy")])

    assert resultado.descartados == 0
    assert len(resultado.conservados) == 2


def test_validar_chunk_descarta_el_valor_cuyo_fragmento_no_es_del_documento() -> None:
    resultado = validar_chunk([_v("a", "c1"), _v("b", "ajeno"), _v("c", "c2")], {"c1", "c2"})

    assert [v.valor for v in resultado.conservados] == ["a", "c"]
    assert resultado.descartados == 1


def test_descartar_por_longitud_conserva_200_caracteres_y_descarta_201() -> None:
    en_el_limite = _v("x" * LONGITUD_MAXIMA_DE_VALOR)
    pasado = _v("y" * (LONGITUD_MAXIMA_DE_VALOR + 1))

    resultado = descartar_por_longitud([en_el_limite, pasado])

    assert resultado.conservados == (en_el_limite,)
    assert resultado.descartados == 1


def test_omitir_lenguaje_prescriptivo_omite_el_valor_con_una_regla_incumplida_sin_sustituirlo() -> (
    None
):
    def reglas(texto: str) -> tuple[str, ...]:
        return ("en-recommended-treatment",) if "recommended" in texto else ()

    resultado = omitir_lenguaje_prescriptivo(
        [_v("recommended treatment"), _v("HER2-positive")], reglas
    )

    assert [v.valor for v in resultado.conservados] == ["HER2-positive"]
    assert resultado.descartados == 1


def test_hipotesis_de_valor_nombra_el_criterio_y_el_valor() -> None:
    assert (
        hipotesis_de_valor("Estadio", "stage II")
        == "En la población del estudio, Estadio: stage II"
    )


def test_pares_de_verificacion_contrasta_cada_valor_con_su_propio_fragmento() -> None:
    pares = pares_de_verificacion(
        [_v("a", "c2"), _v("b", "c1")], {"c1": "texto uno", "c2": "texto dos"}, "Estadio"
    )

    assert [(p.premisa, p.hipotesis) for p in pares] == [
        ("texto dos", "En la población del estudio, Estadio: a"),
        ("texto uno", "En la población del estudio, Estadio: b"),
    ]


def test_verificar_nli_conserva_solo_el_entailment_sobre_el_umbral_y_anota_la_etiqueta() -> None:
    resultados = [
        ResultadoNli(label="entailment", p_entailment=0.9),
        ResultadoNli(
            label="neutral", p_entailment=0.9
        ),  # etiqueta que no es entailment: sin soporte
        ResultadoNli(label="entailment", p_entailment=0.4),  # bajo el umbral
        ResultadoNli(label="entailment", p_entailment=0.5),  # justo en el umbral: soporta
    ]
    valores = [_v("a"), _v("b"), _v("c"), _v("d")]

    resultado = verificar_nli(valores, resultados, 0.5)

    assert [(v.valor, v.resultado_nli) for v in resultado.conservados] == [
        ("a", "entailment"),
        ("d", "entailment"),
    ]
    assert resultado.descartados == 2


def test_verificar_nli_falla_si_el_nli_no_devuelve_un_resultado_por_valor() -> None:
    with pytest.raises(ValueError, match="un resultado por valor"):
        verificar_nli([_v("a")], [], 0.5)
