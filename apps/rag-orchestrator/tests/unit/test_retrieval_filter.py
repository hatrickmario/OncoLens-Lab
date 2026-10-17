import pytest

from app.domain.retrieval_filter import (
    coincide_etiqueta,
    exigir_filtro_vigente,
    expresion_solo_vigente,
    expresion_vigente_del_tipo,
)


def test_expresion_solo_vigente_exige_is_current():
    assert expresion_solo_vigente() == "is_current == true"


def test_expresion_vigente_del_tipo_compara_la_etiqueta_completa_dentro_de_la_lista_separada_por_comas():
    assert expresion_vigente_del_tipo("mama") == (
        'is_current == true and (cancer_type_tags == "mama" or cancer_type_tags like "mama,%"'
        ' or cancer_type_tags like "%,mama" or cancer_type_tags like "%,mama,%")'
    )


@pytest.mark.parametrize(
    "tipo",
    [
        "",
        "   ",
        "próstata",
        "Mama",
        "mama ductal",
        "1mama",
        "_mama",
        'mama" or is_current == false or "',
        "mama%",
        "mama\\",
        "ma\nma",
        "mama\n",
    ],
)
def test_expresion_vigente_del_tipo_rechaza_lo_que_no_es_un_codigo_de_catalogo(tipo):
    with pytest.raises(ValueError):
        expresion_vigente_del_tipo(tipo)


@pytest.mark.parametrize(
    ("etiquetas", "tipo", "esperado"),
    [
        ("mama", "mama", True),
        ("prostata,mama", "mama", True),
        ("mama,prostata", "mama", True),
        ("prostata,mama,pulmon", "mama", True),
        ("mama_masculina", "mama", False),
        ("prostata,mama_masculina", "mama", False),
        ("mamas", "mama", False),
        ("mama", "a", False),
        ("prostata", "a", False),
        ("", "mama", False),
    ],
)
def test_coincide_etiqueta_exige_la_etiqueta_completa(etiquetas, tipo, esperado):
    assert coincide_etiqueta(etiquetas, tipo) is esperado


def test_exigir_filtro_vigente_acepta_la_expresion_solo_vigente():
    assert exigir_filtro_vigente(expresion_solo_vigente()) == expresion_solo_vigente()


def test_exigir_filtro_vigente_acepta_la_expresion_vigente_del_tipo():
    filtro = expresion_vigente_del_tipo("mama")

    assert exigir_filtro_vigente(filtro) == filtro


@pytest.mark.parametrize(
    "filtro",
    [
        "",
        'cancer_type_tags == "mama"',
        "is_current == true or source_type == x",
        "is_current == true and source_type == x",
        "is_current == true and (a) or (b)",
        "is_current == true and (a",
        "is_current == false",
    ],
)
def test_exigir_filtro_vigente_rechaza_el_filtro_que_no_deja_is_current_como_condicion_obligatoria(
    filtro,
):
    with pytest.raises(ValueError):
        exigir_filtro_vigente(filtro)
