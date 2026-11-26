"""Reglas puras del contexto del documento en el texto que se embebe (US-279, L1D-337): RN-04, RN-21, RN-25."""

from __future__ import annotations

import json

import pytest

from app.domain.corpus_seed.contexto_del_chunk import (
    SECCION_UNICA,
    VARIANTE_INICIAL,
    VERSION_DE_LA_PLANTILLA,
    MetadatosDelContexto,
    VarianteDeContexto,
    contexto_con_frase,
    contexto_determinista,
    inicio_del_documento,
    texto_a_embeber,
    validar_frase_de_contexto,
)

COMPLETOS = MetadatosDelContexto("Guía de mama", "guideline", "mama")


def test_la_variante_inicial_es_ninguno() -> None:
    assert VARIANTE_INICIAL is VarianteDeContexto.NINGUNO
    assert VERSION_DE_LA_PLANTILLA >= 1


def test_variante_de_contexto_acepta_solo_los_tres_valores_cerrados() -> None:
    assert [v.value for v in VarianteDeContexto] == ["ninguno", "determinista", "llm"]
    with pytest.raises(ValueError):
        VarianteDeContexto("resumen")


def test_contexto_vacio_devuelve_el_texto_tal_cual() -> None:
    original = "Texto original del chunk."

    assert texto_a_embeber("", original) is original


def test_texto_a_embeber_antepone_el_contexto_sin_tocar_el_original() -> None:
    assert texto_a_embeber("Título | guideline\n\n", "Cuerpo.") == "Título | guideline\n\nCuerpo."


def test_el_contexto_lleva_titulo_fuente_cancer_y_seccion_en_ese_orden_con_una_linea_en_blanco() -> (
    None
):
    contexto = contexto_determinista(COMPLETOS, "resultados", 300)

    assert contexto == "Guía de mama | guideline | mama | resultados\n\n"


def test_un_valor_ausente_o_vacio_se_omite_sin_texto_de_relleno() -> None:
    contexto = contexto_determinista(MetadatosDelContexto("Guía", "  ", None), None, 300)

    assert contexto == "Guía\n\n"
    assert "No disponible" not in contexto


def test_la_seccion_unica_no_entra_al_prefijo() -> None:
    assert (
        contexto_determinista(COMPLETOS, SECCION_UNICA, 300)
        == "Guía de mama | guideline | mama\n\n"
    )


def test_sin_metadatos_ni_seccion_el_contexto_es_vacio() -> None:
    assert contexto_determinista(None, None, 300) == ""
    assert contexto_determinista(MetadatosDelContexto(None, "", " "), SECCION_UNICA, 300) == ""


def test_las_etiquetas_de_cancer_del_catalogo_se_separan_con_coma_y_espacio() -> None:
    contexto = contexto_determinista(MetadatosDelContexto("T", None, "mama,prostata"), None, 300)

    assert contexto == "T | mama, prostata\n\n"


def test_un_titulo_largo_se_recorta_sin_tocar_el_resto_y_el_prefijo_no_pasa_del_limite() -> None:
    metadatos = MetadatosDelContexto("T" * 100, "guideline", "mama")

    contexto = contexto_determinista(metadatos, "resultados", 40)

    assert len(contexto) <= 40
    assert contexto.endswith(" | guideline | mama | resultados\n\n")
    assert contexto == contexto_determinista(metadatos, "resultados", 40)


def test_si_el_resto_solo_ya_supera_el_limite_el_prefijo_se_corta_igualmente_al_limite() -> None:
    metadatos = MetadatosDelContexto("Título", "guideline", "mama,prostata,pulmon")

    contexto = contexto_determinista(metadatos, "resultados", 12)

    assert len(contexto) <= 12
    assert contexto == contexto_determinista(metadatos, "resultados", 12)


def test_un_limite_menor_que_el_terminador_da_contexto_vacio() -> None:
    assert contexto_determinista(COMPLETOS, None, 2) == ""


def test_el_contexto_con_frase_añade_la_frase_al_determinista_y_una_linea_en_blanco() -> None:
    assert contexto_con_frase("T | g\n\n", "Una frase.") == "T | g\n\nUna frase.\n\n"
    assert contexto_con_frase("", "Una frase.") == "Una frase.\n\n"


def test_inicio_del_documento_ordena_por_indice_concatena_y_recorta() -> None:
    chunks = [(2, "tres"), (0, "uno"), (1, "dos")]

    assert inicio_del_documento(chunks, 100) == "uno\ndos\ntres"
    assert inicio_del_documento(chunks, 6) == "uno\ndo"
    assert inicio_del_documento(chunks, 6) == inicio_del_documento(chunks, 6)


def test_inicio_del_documento_de_un_solo_chunk_es_ese_chunk_recortado() -> None:
    assert inicio_del_documento([(0, "unico chunk")], 5) == "unico"
    assert inicio_del_documento([], 5) == ""


def _salida(**campos: object) -> str:
    return json.dumps(campos, ensure_ascii=False)


def test_una_frase_valida_se_devuelve_sin_espacios_en_los_extremos() -> None:
    assert validar_frase_de_contexto(_salida(contexto="  Describe el ensayo.  "), 100) == (
        "Describe el ensayo."
    )


@pytest.mark.parametrize(
    "salida",
    [
        "esto no es json",
        "[]",
        "null",
        _salida(contexto=""),
        _salida(contexto="   "),
        _salida(contexto="dos\nlíneas"),
        _salida(contexto=3),
        _salida(otra="x"),
        _salida(contexto="ok", extra="no"),
        _salida(contexto="x" * 101),
    ],
)
def test_una_salida_que_no_cumple_el_esquema_no_da_frase(salida: str) -> None:
    assert validar_frase_de_contexto(salida, 100) is None
