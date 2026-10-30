"""El dominio consume la lista de valores por criterio (US-241 D6, D10): sin reglas nuevas, solo lectura de la lista."""

from app.application.aplicabilidad import formas_invalidas_para_el_log
from app.domain.aplicabilidad_tipos import ValorDelEstudio
from app.domain.applicability_rules import valor_del_estudio
from tests.support.poblacion_lista import MARCA_PENDIENTE, poblacion_guardada, valor_nuevo


def _poblacion(**criterios: object):
    return poblacion_guardada("extraido_verificado", criterios)


def test_valor_del_estudio_es_el_primer_valor_de_elegibilidad_cuando_la_lista_trae_varios():
    poblacion = _poblacion(
        estadio=[valor_nuevo("I", "ch-1"), valor_nuevo("II", "ch-1"), valor_nuevo("III", "ch-2")]
    )

    assert valor_del_estudio(poblacion, "estadio") == ValorDelEstudio("I", solo_subgrupo=False)


def test_valor_del_estudio_prefiere_la_elegibilidad_al_subgrupo_aunque_este_aparezca_antes():
    poblacion = _poblacion(
        estadio=[valor_nuevo("TNBC", "ch-1", "subgrupo"), valor_nuevo("HER2+", "ch-1")]
    )

    assert valor_del_estudio(poblacion, "estadio") == ValorDelEstudio("HER2+", solo_subgrupo=False)


def test_valor_del_estudio_marca_solo_subgrupo_cuando_solo_hay_valores_de_subgrupo():
    poblacion = _poblacion(ecog=[valor_nuevo("0-1", "ch-1", "subgrupo")])

    assert valor_del_estudio(poblacion, "ecog") == ValorDelEstudio("0-1", solo_subgrupo=True)


def test_valor_del_estudio_no_cuenta_las_menciones():
    poblacion = _poblacion(ecog=[valor_nuevo("0-1", "ch-1", "mencion")])

    assert valor_del_estudio(poblacion, "ecog") is None


def test_valor_del_estudio_es_none_cuando_el_criterio_esta_pendiente_es_invalido_o_falta():
    poblacion = _poblacion(
        linea=MARCA_PENDIENTE, ecog=[valor_nuevo("0-1", "ch-1", "global")], estadio="no_disponible"
    )

    assert [valor_del_estudio(poblacion, k) for k in ("linea", "ecog", "estadio", "otra")] == [
        None,
        None,
        None,
        None,
    ]


def test_formas_invalidas_para_el_log_lista_criterio_y_chunk_sin_la_marca_pendiente_ni_el_valor():
    con_formas_invalidas = _poblacion(
        ecog=[valor_nuevo("SENTINELA", "ch-1", "global")],
        estadio=[valor_nuevo(f"v{n}", "ch-2") for n in range(4)],
        linea=MARCA_PENDIENTE,
        edad=[{"value": "x"}],
    )

    assert formas_invalidas_para_el_log({"doc-a1": con_formas_invalidas}) == [
        ("ecog", "ch-1"),
        ("estadio", "ch-2"),
        ("edad", None),
    ]
