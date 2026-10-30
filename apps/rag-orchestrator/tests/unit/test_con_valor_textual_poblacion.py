"""El camino textual (US-123) usa las tablas del catálogo cuando las hay y coincide con el camino de lista (US-243)."""

import pytest

from app.application.contexto_del_paciente import contexto_del_paciente
from app.domain.aplicabilidad_tipos import CriterioEvaluado
from app.domain.applicability_text import PropuestaDePoblacion, con_valor_textual
from app.schemas.generated.models import RagQueryInternalRequest
from tests.support.aplicabilidad import criterios_de
from tests.support.catalogo_aplicabilidad import APL_1_2_0
from tests.support.poblacion_fx08bc import solicitud_a_m2, solicitud_a_m3

CRITERIOS = {c.clave: c for c in criterios_de(APL_1_2_0).criterios("mama")}


def _valor_del_paciente(solicitud: dict, clave: str) -> str | None:
    contexto = contexto_del_paciente(
        RagQueryInternalRequest.model_validate(solicitud).clinicalContext
    )
    atributos = {a.clave: a.valor for a in contexto.atributos}
    biomarcadores = {b.nombre: b.valor for b in contexto.biomarcadores}
    return atributos.get(clave) or biomarcadores.get("HER2")


@pytest.mark.parametrize(
    ("paciente", "criterio", "valor", "estado"),
    [
        (solicitud_a_m2, "estado_menopausico", "postmenopausal women only", "coincide"),
        (solicitud_a_m3, "estado_menopausico", "postmenopausal women only", "no_coincide"),
        (solicitud_a_m3, "estado_menopausico", "postmenopausal women", "desconocido"),
        (solicitud_a_m2, "estado_her2", "HER2-positive (IHC 3+)", "coincide"),
    ],
)
def test_con_valor_textual_coincide_con_el_camino_de_lista_cuando_el_valor_es_el_mismo(
    paciente, criterio, valor, estado
):
    valor_paciente = _valor_del_paciente(paciente(), criterio)
    pendiente = CriterioEvaluado(
        criterio, valor_paciente, None, "desconocido", "no_reportado_por_fuente", False
    )

    resultado = con_valor_textual(
        CRITERIOS[criterio], pendiente, PropuestaDePoblacion("CDR", criterio, valor, "ch-1")
    )

    assert resultado.estado == estado
    assert resultado.valor_estudio == valor
    assert resultado.chunk_citado_id == "ch-1"
