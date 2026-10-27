"""Reglas puras del camino textual de la aplicabilidad (US-123, RN-01, RN-04, RN-23): sin adapters, sin E/S.

Los criterios son los de ``test-apl-1.0.0`` (L1D-126). El LLM solo propone (criterio, valor, chunkId): la cita, el lenguaje
y el soporte los decide el dominio; el estado lo pone la regla del catálogo.
"""

import pytest

from app.domain.aplicabilidad_tipos import CriterioEvaluado
from app.domain.applicability_rules import evaluar_criterio_de_fuente
from app.domain.applicability_text import (
    ChunkDeFuente,
    CriterioPendiente,
    FuenteParaProponer,
    MotivoDeRechazo,
    PropuestaDePoblacion,
    aceptar_propuestas,
    con_valor_textual,
    criterios_pendientes_de_texto,
    normalizar_valor_al_catalogo,
    pares_para_el_nli,
    planificar_propuestas,
)
from app.domain.nli import ParNli
from tests.support.aplicabilidad import (
    POBLACIONES_FX08BA,
    criterios_de_test_apl_1_0_0,
    solicitud_a_m1,
)
from app.application.contexto_del_paciente import contexto_del_paciente
from app.schemas.generated.models import RagQueryInternalRequest

CRITERIOS = {c.clave: c for c in criterios_de_test_apl_1_0_0().criterios("mama")}
A_M1 = contexto_del_paciente(
    RagQueryInternalRequest.model_validate(solicitud_a_m1()).clinicalContext
)
TEXTO_A2 = "This guidance applies to patients with HER2-negative disease."


def evaluados_de(documento: str) -> tuple[CriterioEvaluado, ...]:
    return tuple(
        evaluar_criterio_de_fuente(c, A_M1, POBLACIONES_FX08BA[documento])
        for c in CRITERIOS.values()
    )


def fuente(external_id: str = "CDR-A2", *claves: str) -> FuenteParaProponer:
    pendientes = tuple(
        CriterioPendiente(clave, CRITERIOS[clave].etiqueta_es, CRITERIOS[clave].etiqueta_en)
        for clave in (claves or tuple(CRITERIOS))
    )
    return FuenteParaProponer(external_id, pendientes, (ChunkDeFuente("ch-a2-1", TEXTO_A2),))


def propuesta(
    criterio: str = "estado_her2",
    valor: str = "HER2 negativo",
    chunk_id: str = "ch-a2-1",
    external_id: str = "CDR-A2",
) -> PropuestaDePoblacion:
    return PropuestaDePoblacion(external_id, criterio, valor, chunk_id)


def sin_terminos(texto: str, campo: str) -> tuple[str, ...]:
    return ()


# --- criterios pendientes de texto (D1) ---------------------------------------------------------------------------


def test_criterios_pendientes_incluye_solo_los_que_no_tienen_valor_estructurado_cuando_la_fuente_trae_algunos():
    pendientes = criterios_pendientes_de_texto(evaluados_de("doc-a1"), list(CRITERIOS.values()))

    assert [p.clave for p in pendientes] == ["estado_menopausico", "linea_tratamiento"]
    assert pendientes[1] == CriterioPendiente(
        "linea_tratamiento", "Línea de tratamiento", "Treatment line"
    )


def test_criterios_pendientes_incluye_todos_cuando_la_poblacion_esta_pendiente():
    pendientes = criterios_pendientes_de_texto(evaluados_de("doc-a2"), list(CRITERIOS.values()))

    assert [p.clave for p in pendientes] == list(CRITERIOS)


def test_criterios_pendientes_excluye_el_criterio_con_destino_no_resoluble():
    evaluados = tuple(
        CriterioEvaluado(
            e.clave, None, None, "desconocido", None, e.es_excluyente, "destino_no_resoluble"
        )
        if e.clave == "ecog"
        else e
        for e in evaluados_de("doc-a2")
    )

    pendientes = criterios_pendientes_de_texto(evaluados, list(CRITERIOS.values()))

    assert "ecog" not in [p.clave for p in pendientes]


# --- planificar propuestas: cita y lenguaje (RN-01, RN-04, RN-23) ------------------------------------------------------


def test_planificar_manda_al_nli_la_propuesta_con_cita_de_su_fuente_y_su_texto_como_premisa():
    plan = planificar_propuestas([propuesta()], [fuente()], sin_terminos)

    assert [p.propuesta for p in plan.por_validar] == [propuesta()]
    assert pares_para_el_nli(plan) == [ParNli(TEXTO_A2, "HER2 negativo")]
    assert plan.rechazadas == ()


def test_planificar_rechaza_sin_nli_la_propuesta_que_cita_un_chunk_ajeno():
    plan = planificar_propuestas([propuesta(chunk_id="ch-x-999")], [fuente()], sin_terminos)

    assert plan.por_validar == ()
    assert plan.rechazadas == (
        (propuesta(chunk_id="ch-x-999"), MotivoDeRechazo.cita_fuera_de_la_fuente),
    )


def test_planificar_rechaza_la_cita_a_un_chunk_recuperado_de_otra_fuente():
    otra = FuenteParaProponer("CDR-A1", (), (ChunkDeFuente("ch-a1-1", "otro texto"),))

    plan = planificar_propuestas([propuesta(chunk_id="ch-a1-1")], [fuente(), otra], sin_terminos)

    assert plan.rechazadas[0][1] is MotivoDeRechazo.cita_fuera_de_la_fuente


def test_planificar_rechaza_sin_nli_el_valor_con_lenguaje_prohibido_y_lo_revisa_como_campo_generado():
    revisados: list[tuple[str, str]] = []

    def buscar(texto: str, campo: str) -> tuple[str, ...]:
        revisados.append((texto, campo))
        return ("N-001",)

    plan = planificar_propuestas([propuesta(valor="recomendado")], [fuente()], buscar)

    assert plan.por_validar == ()
    assert plan.rechazadas[0][1] is MotivoDeRechazo.lenguaje_no_permitido
    assert revisados == [("recomendado", "studyPopulationValue")]


def test_planificar_ignora_la_propuesta_de_una_fuente_o_un_criterio_que_no_se_pidio():
    ajena = propuesta(external_id="CDR-ZZ")
    no_pedido = propuesta(criterio="estado_menopausico")

    plan = planificar_propuestas(
        [ajena, no_pedido], [fuente("CDR-A2", "estado_her2")], sin_terminos
    )

    assert plan.por_validar == () and plan.rechazadas == ()


def test_planificar_conserva_solo_la_primera_propuesta_cuando_el_llm_repite_el_criterio():
    primera = propuesta(valor="HER2 negativo")
    repetida = propuesta(valor="HER2 positivo")

    plan = planificar_propuestas([primera, repetida], [fuente()], sin_terminos)

    assert [p.propuesta for p in plan.por_validar] == [primera]


# --- aceptar propuestas según el NLI (RN-01) ------------------------------------------------------------------------


def test_aceptar_conserva_la_propuesta_soportada_y_cuenta_como_omitida_la_que_no():
    plan = planificar_propuestas(
        [propuesta(), propuesta("estadio", "estadio I–III")], [fuente()], sin_terminos
    )

    resultado = aceptar_propuestas(plan, [True, False])

    assert [p.criterio for p in resultado.aceptadas] == ["estado_her2"]
    assert resultado.omitidas == 1


def test_aceptar_suma_a_las_omitidas_las_rechazadas_antes_del_nli():
    plan = planificar_propuestas(
        [propuesta(), propuesta("estadio", chunk_id="ch-x-999")], [fuente()], sin_terminos
    )

    resultado = aceptar_propuestas(plan, [True])

    assert (len(resultado.aceptadas), resultado.omitidas) == (1, 1)


def test_aceptar_falla_cuando_los_veredictos_no_alinean_con_los_pares():
    plan = planificar_propuestas([propuesta()], [fuente()], sin_terminos)

    with pytest.raises(ValueError, match="veredicto"):
        aceptar_propuestas(plan, [True, True])


# --- normalizar al catálogo (D4) ------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("criterio", "valor", "esperado"),
    [
        ("estado_her2", "HER2 negativo", "negativo"),
        ("estado_her2", "her2-positivo", "positivo"),
        ("ecog", "ECOG 0-1", "0-1"),
        ("estadio", "estadio I–III", "I–III"),
        ("linea_tratamiento", "línea 2", "2"),
        ("linea_tratamiento", "Línea 2", "2"),
        ("estado_her2", "negativo", "negativo"),
    ],
)
def test_normalizar_quita_el_rotulo_del_propio_criterio(criterio: str, valor: str, esperado: str):
    assert normalizar_valor_al_catalogo(CRITERIOS[criterio], valor) == esperado


def test_normalizar_conserva_el_texto_cuando_todo_el_valor_es_el_rotulo():
    assert normalizar_valor_al_catalogo(CRITERIOS["estado_her2"], "HER2") == "HER2"


# --- aplicar el valor aceptado con la regla del catálogo (D4, OQ-1) -----------------------------------------------------


def evaluado(criterio: str, documento: str = "doc-a2") -> CriterioEvaluado:
    return next(e for e in evaluados_de(documento) if e.clave == criterio)


def test_con_valor_textual_asigna_no_coincide_con_la_regla_y_muestra_el_texto_verificado():
    resultado = con_valor_textual(CRITERIOS["estado_her2"], evaluado("estado_her2"), propuesta())

    assert (resultado.estado, resultado.causa) == ("no_coincide", None)
    assert resultado.valor_estudio == "HER2 negativo"  # el texto verificado, no el normalizado
    assert resultado.valor_paciente == "3+ (IHQ)"  # copiado del contexto, nunca del LLM
    assert resultado.chunk_citado_id == "ch-a2-1"
    assert resultado.es_excluyente is True


def test_con_valor_textual_da_coincide_cuando_el_texto_nombra_la_categoria_del_paciente():
    resultado = con_valor_textual(
        CRITERIOS["estado_her2"], evaluado("estado_her2"), propuesta(valor="HER2 positivo")
    )

    assert resultado.estado == "coincide"


def test_con_valor_textual_deja_desconocido_sin_causa_cuando_el_valor_no_encaja_en_la_regla():
    resultado = con_valor_textual(
        CRITERIOS["ecog"], evaluado("ecog"), propuesta("ecog", "ECOG según criterio clínico")
    )

    assert (resultado.estado, resultado.causa) == ("desconocido", None)
    assert (
        resultado.valor_estudio == "ECOG según criterio clínico"
    )  # aceptado y citado, sin estado inventado
    assert resultado.motivo_interno == "forma_no_comparable"


def test_con_valor_textual_conserva_falta_en_paciente_cuando_el_paciente_no_tiene_el_dato():
    resultado = con_valor_textual(
        CRITERIOS["estado_menopausico"],
        evaluado("estado_menopausico"),
        propuesta("estado_menopausico", "posmenopáusicas"),
    )

    assert (resultado.estado, resultado.causa) == ("desconocido", "falta_en_paciente")
    assert resultado.valor_estudio == "posmenopáusicas"
