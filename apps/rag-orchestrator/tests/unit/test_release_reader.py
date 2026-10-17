from app.infrastructure.catalog.release_reader import _fuentes_excluidas


def test_fuentes_excluidas_separa_por_comas_y_recorta_espacios():
    assert _fuentes_excluidas("NCCN, ESMO") == ("NCCN", "ESMO")


def test_fuentes_excluidas_devuelve_tupla_vacia_cuando_el_texto_esta_vacio():
    assert _fuentes_excluidas("") == ()
