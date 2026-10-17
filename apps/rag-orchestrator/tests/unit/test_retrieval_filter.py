import pytest

from app.domain.retrieval_filter import expresion_filtro_vigente


def test_expresion_filtro_vigente_exige_is_current_cuando_no_hay_tipo_de_cancer():
    assert expresion_filtro_vigente() == "is_current == true"


def test_expresion_filtro_vigente_restringe_cancer_type_tags_al_tipo_cuando_se_indica():
    assert expresion_filtro_vigente("mama") == (
        'is_current == true and cancer_type_tags like "%mama%"'
    )


def test_expresion_filtro_vigente_normaliza_mayusculas_y_espacios_del_tipo_de_cancer():
    assert expresion_filtro_vigente("  Próstata ") == expresion_filtro_vigente("próstata")


@pytest.mark.parametrize(
    "tipo",
    ["", "   ", 'mama" or is_current == false or "', "mama%", "mama\\", "ma\nma", "a" * 65],
)
def test_expresion_filtro_vigente_rechaza_el_tipo_que_podria_alterar_la_expresion(tipo):
    with pytest.raises(ValueError):
        expresion_filtro_vigente(tipo)
