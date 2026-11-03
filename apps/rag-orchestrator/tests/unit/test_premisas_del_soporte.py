from app.domain.support import premisas_del_soporte


def test_premisas_del_soporte_devuelve_solo_los_textos_de_los_chunks_citados_y_validos_cuando_la_memoria_no_esta_en_el_mapa():
    textos = {"c1": "texto uno", "c2": "texto dos"}

    premisas = premisas_del_soporte(["c1", "memoria", "c3", "c1"], ["c1", "c3"], textos)

    assert premisas == ("texto uno",)


def test_premisas_del_soporte_devuelve_vacio_cuando_ninguna_cita_es_valida():
    assert premisas_del_soporte(["c9"], ["c1"], {"c1": "texto"}) == ()
