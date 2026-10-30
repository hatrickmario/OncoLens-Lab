"""`ApplicabilityService.con_chunks_citados` (US-243, ADR-47): recalcula solo lo que sale de la lista en los fragmentos citados."""

import dataclasses

from app.application.aplicabilidad import ApplicabilityService, conflictos_para_el_log
from app.application.chunk_citable import ChunkCitable
from app.domain.aplicabilidad_tipos import (
    AtributoDelPaciente,
    ContextoDelPaciente,
    CriterioDePoblacion,
    PoblacionDelEstudio,
    ValorDePoblacion,
)
from app.domain.relevance import ChunkPuntuado
from tests.support.aplicabilidad import criterios_de
from tests.support.catalogo_aplicabilidad import APL_1_2_0
from tests.support.poblacion_fx08bc import FICHAS_FX08BC

A_M2 = ContextoDelPaciente(
    atributos=(AtributoDelPaciente("estado_menopausico", "posmenopáusica", 1),)
)


def _servicio() -> ApplicabilityService:
    return ApplicabilityService(criterios_de(APL_1_2_0))


def _fuente(poblacion: PoblacionDelEstudio):
    mejor = ChunkCitable(ChunkPuntuado("ch-b7-1", "doc-b7", "texto", 0.9), FICHAS_FX08BC["doc-b7"])
    return _servicio().evaluar("mama", A_M2, {"doc-b7": mejor}, {"doc-b7": poblacion})[0]


def _valores(*pares: tuple[str, str]) -> CriterioDePoblacion:
    return CriterioDePoblacion(tuple(ValorDePoblacion(t, "elegibilidad", c) for t, c in pares))


def _menopausia(fuente):
    return next(c for c in fuente.criterios if c.clave == "estado_menopausico")


def test_con_chunks_citados_recalcula_el_criterio_con_el_otro_fragmento_cuando_la_opcion_cita_ch_b7_2():
    poblacion = PoblacionDelEstudio(
        "extraido_verificado",
        {
            "estado_menopausico": _valores(
                ("postmenopausal women only", "ch-b7-1"), ("premenopausal women only", "ch-b7-2")
            )
        },
    )
    fuente = _fuente(poblacion)

    de_b7_1 = _servicio().con_chunks_citados("mama", A_M2, fuente, ["ch-b7-1"])
    de_b7_2 = _servicio().con_chunks_citados("mama", A_M2, fuente, ["ch-b7-2"])

    assert _menopausia(fuente).estado == "coincide"  # el mejor chunk es ch-b7-1
    assert _menopausia(de_b7_1).estado == "coincide"
    assert _menopausia(de_b7_2).estado == "no_coincide"
    assert (de_b7_2.resumen.coincide, de_b7_2.resumen.no_coincide) == (0, 1)


def test_con_chunks_citados_conserva_el_criterio_aceptado_por_texto_cuando_no_tiene_lista():
    poblacion = PoblacionDelEstudio(
        "extraido_verificado", {"estado_menopausico": CriterioDePoblacion(pendiente=True)}
    )
    fuente = _fuente(poblacion)
    aceptado = dataclasses.replace(
        _menopausia(fuente), valor_estudio="postmenopausal women", chunk_citado_id="ch-b7-2"
    )
    fuente = fuente.con_criterios(
        tuple(aceptado if c.clave == aceptado.clave else c for c in fuente.criterios)
    )

    recalculada = _servicio().con_chunks_citados("mama", A_M2, fuente, ["ch-b7-1"])

    assert _menopausia(recalculada) == aceptado


def test_con_chunks_citados_devuelve_la_misma_fuente_cuando_no_se_conoce_su_poblacion():
    fuente = dataclasses.replace(
        _fuente(PoblacionDelEstudio("extraido_verificado", {})), poblacion=None
    )

    assert _servicio().con_chunks_citados("mama", A_M2, fuente, ["ch-b7-1"]) is fuente


def test_con_chunks_citados_conserva_el_criterio_aceptado_por_texto_cuando_la_lista_no_tiene_valores_en_los_fragmentos_citados():
    poblacion = PoblacionDelEstudio(
        "extraido_verificado",
        {"estado_menopausico": _valores(("premenopausal women only", "ch-b7-2"))},
    )
    fuente = _fuente(poblacion)
    aceptado = dataclasses.replace(
        _menopausia(fuente),
        estado="coincide",
        causa=None,
        valor_estudio="postmenopausal women",
        chunk_citado_id="ch-b7-3",
    )
    fuente = fuente.con_criterios(
        tuple(aceptado if c.clave == aceptado.clave else c for c in fuente.criterios)
    )

    recalculada = _servicio().con_chunks_citados("mama", A_M2, fuente, ["ch-b7-1"])

    assert _menopausia(recalculada) == aceptado


def test_conflictos_para_el_log_da_un_registro_por_fragmento_cuando_un_fragmento_trae_dos_valores():
    poblacion = PoblacionDelEstudio("extraido_verificado", {})
    fuente = _fuente(poblacion)
    en_conflicto = dataclasses.replace(
        _menopausia(fuente),
        causa="valores_en_conflicto",
        valores_del_estudio=(
            ValorDePoblacion("a", "elegibilidad", "ch-1"),
            ValorDePoblacion("b", "elegibilidad", "ch-1"),
            ValorDePoblacion("c", "elegibilidad", "ch-2"),
        ),
    )
    fuente = fuente.con_criterios((en_conflicto,))

    assert conflictos_para_el_log([fuente]) == [
        ("estado_menopausico", "ch-1"),
        ("estado_menopausico", "ch-2"),
    ]


def test_con_chunks_citados_prefiere_la_lista_al_valor_textual_cuando_los_fragmentos_citados_traen_valores():
    poblacion = PoblacionDelEstudio(
        "extraido_verificado",
        {"estado_menopausico": _valores(("premenopausal women only", "ch-b7-2"))},
    )
    fuente = _fuente(poblacion)
    textual = dataclasses.replace(
        _menopausia(fuente), estado="coincide", valor_estudio="x", chunk_citado_id="ch-b7-3"
    )
    fuente = fuente.con_criterios(
        tuple(textual if c.clave == textual.clave else c for c in fuente.criterios)
    )

    recalculada = _servicio().con_chunks_citados("mama", A_M2, fuente, ["ch-b7-2"])

    assert _menopausia(recalculada).estado == "no_coincide"
    assert [v.chunk_id for v in _menopausia(recalculada).valores_del_estudio] == ["ch-b7-2"]


def test_evaluar_marca_mezclada_con_el_diseno_del_mejor_chunk_cuando_ninguna_opcion_cita_la_fuente():
    poblacion = PoblacionDelEstudio(
        "extraido_verificado",
        {
            "estado_menopausico": _valores(
                ("premenopausal women", "ch-b5-1"), ("postmenopausal women", "ch-b5-1")
            )
        },
    )
    mejor = ChunkCitable(ChunkPuntuado("ch-b5-1", "doc-b5", "texto", 0.9), FICHAS_FX08BC["doc-b5"])

    fuente = _servicio().evaluar("mama", A_M2, {"doc-b5": mejor}, {"doc-b5": poblacion})[0]

    assert _menopausia(fuente).motivo_parcial == "mezclada"
