from app.infrastructure.catalog.release_reader import fuentes_excluidas_de


def testfuentes_excluidas_de_separa_por_comas_y_recorta_espacios():
    assert fuentes_excluidas_de("NCCN, ESMO") == ("NCCN", "ESMO")


def testfuentes_excluidas_de_devuelve_tupla_vacia_cuando_el_texto_esta_vacio():
    assert fuentes_excluidas_de("") == ()
