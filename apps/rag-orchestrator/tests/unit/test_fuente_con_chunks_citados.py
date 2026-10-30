"""`ApplicabilityService.con_chunks_citados` (US-243, ADR-47): recalcula solo lo que sale de la lista en los fragmentos citados."""

import dataclasses

from app.application.aplicabilidad import ApplicabilityService
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
