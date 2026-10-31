"""Reglas puras de soporte (RN-01) y de retiro del lenguaje no permitido (RN-23) de L1D-180, sin adapters.

El buscador de términos es una función pura de prueba: todo texto con ``PROHIBIDO`` incumple la regla ``regla-x``.
"""

from __future__ import annotations

import pytest

from app.domain.claims import AfirmacionAtomica, PapelDeAfirmacion, dividir_en_afirmaciones
from app.domain.citations import OpcionAceptada, OpcionGenerada
from app.domain.lenguaje import ListaTerminos, check_prohibited_terms
from app.domain.nli import ParNli, ResultadoNli
from app.domain.resolucion_de_soporte import verificar_soporte
from app.domain.saneamiento_de_descartadas import retirar_texto_prohibido
from app.domain.support import (
    CAMPOS_GENERADOS,
    RETIRO_EN,
    RETIRO_ES,
    RetiroDeLenguaje,
    literal_de_retiro,
    pares_a_verificar,
    planificar_soporte,
    soporta,
)
from tests.support.contract import CATALOGOS

UMBRAL = 0.7
TEXTOS = {"c1": "premisa uno", "c2": "premisa dos", "c3": "premisa tres"}
IMPLICA = ResultadoNli("entailment", 0.97)
NEUTRAL = ResultadoNli("neutral", 0.02)
CONTRADICE = ResultadoNli("contradiction", 0.01)


def _buscar(texto: str, campo: str) -> tuple[str, ...]:
    return ("regla-x",) if "PROHIBIDO" in texto else ()


MARCO_ES = "La fuente reporta que "
MARCO_EN = "The source reports that "
PRINCIPAL = PapelDeAfirmacion.principal


def _opcion(option: str, rationale: str, citas: tuple[str, ...]) -> OpcionGenerada:
    """Cada oración de ``rationale`` es una afirmación atómica principal con las citas de la opción (US-245)."""
    atomicas = tuple(
        AfirmacionAtomica(a, PRINCIPAL, citas) for a in dividir_en_afirmaciones(rationale)
    )
    return OpcionGenerada(option, rationale, citas, (), atomicas)


def _aceptada(
    option: str = "Opción A", rationale: str = "Afirmación uno.", citas: tuple[str, ...] = ("c1",)
) -> OpcionAceptada:
    return OpcionAceptada(_opcion(option, rationale, citas), citas)


def _plan(*aceptadas: OpcionAceptada, limitaciones: tuple[str, ...] = ()):
    return planificar_soporte(aceptadas, limitaciones, TEXTOS, _buscar, max_palabras=20)


# --- literales y umbral ------------------------------------------------------------------------------------------


def test_el_literal_de_retiro_es_el_de_la_decision_16_segun_el_idioma_de_la_pregunta() -> None:
    assert literal_de_retiro("es") == "[afirmación retirada: formulación no permitida]"
    assert literal_de_retiro("en") == "[claim removed: disallowed wording]"
    assert (RETIRO_ES, RETIRO_EN) == (literal_de_retiro("es"), literal_de_retiro("en"))


def test_los_literales_de_retiro_no_tienen_coincidencias_con_la_lista_de_terminos_prohibidos() -> (
    None
):
    lista = ListaTerminos.model_validate_json(
        (CATALOGOS / "lenguaje" / "terminos-prohibidos.json").read_text(encoding="utf-8")
    )

    for literal in (RETIRO_ES, RETIRO_EN):
        assert check_prohibited_terms(literal, lista, niveles=("A", "B")) == []


def test_los_campos_generados_son_los_de_la_decision_79() -> None:
    assert (
        CAMPOS_GENERADOS
        == (
            "option",
            "rationale",
            "details",
            "unsupportedClaims",
            "limitations[].text",
            "synthesis",
            "studyPopulationValue",  # US-123 [S3 resp. 16]: el valor textual de la población lo redacta el LLM (RN-23)
            "studyPopulationValues[].value",  # US-241: la lista de valores de población, extraída por el LLM (RN-23)
        )
    )


@pytest.mark.parametrize("probabilidad", [0.7, 0.71, 1.0])
def test_un_entailment_sobre_o_igual_al_umbral_soporta(probabilidad: float) -> None:
    assert soporta(ResultadoNli("entailment", probabilidad), UMBRAL)


def test_un_entailment_bajo_el_umbral_no_soporta() -> None:
    assert not soporta(ResultadoNli("entailment", 0.55), UMBRAL)


def test_neutral_no_soporta_aunque_su_p_entailment_supere_el_umbral() -> None:
    assert not soporta(NEUTRAL, UMBRAL)
    assert not soporta(ResultadoNli("neutral", 0.9), UMBRAL)


def test_contradiction_nunca_soporta_aunque_su_p_entailment_supere_el_umbral() -> None:
    assert not soporta(ResultadoNli("contradiction", 0.9), UMBRAL)


# --- planificación -----------------------------------------------------------------------------------------------


def test_cada_oracion_de_la_justificacion_es_una_afirmacion_con_las_premisas_de_sus_chunks_citados() -> (
    None
):
    plan = _plan(_aceptada(rationale="Uno. Dos.", citas=("c1", "c2")))

    (opcion,) = plan.opciones
    assert [a.texto for a in opcion.afirmaciones] == ["Uno.", "Dos."]
    assert all(a.premisas == ("premisa uno", "premisa dos") for a in opcion.afirmaciones)


def test_un_termino_prohibido_marca_la_afirmacion_y_la_opcion_con_sus_reglas() -> None:
    plan = _plan(_aceptada(option="PROHIBIDO a", rationale="Limpia. PROHIBIDO b."))

    (opcion,) = plan.opciones
    assert opcion.option.reglas == ("regla-x",)
    assert [a.reglas for a in opcion.afirmaciones] == [(), ("regla-x",)]


def test_las_limitaciones_se_contrastan_con_todos_los_chunks_entregados() -> None:
    plan = _plan(limitaciones=("Una limitación.",))

    (limitacion,) = plan.limitaciones
    assert limitacion.premisas == tuple(TEXTOS.values())
    assert limitacion.campo == "limitations[].text"


def test_el_plan_declara_solo_el_campo_y_las_reglas_de_cada_fragmento_retirado() -> None:
    plan = _plan(
        _aceptada(option="PROHIBIDO a", rationale="Limpia. PROHIBIDO b."),
        limitaciones=("PROHIBIDO c", "Otra"),
    )

    assert plan.retiros == (
        RetiroDeLenguaje("option", ("regla-x",)),
        RetiroDeLenguaje("rationale", ("regla-x",), PRINCIPAL),
        RetiroDeLenguaje("limitations[].text", ("regla-x",)),
    )


def test_los_pares_son_una_afirmacion_por_chunk_citado_y_omiten_lo_prohibido() -> None:
    plan = _plan(
        _aceptada(rationale="Uno. PROHIBIDO dos.", citas=("c1", "c2")),
        _aceptada(option="PROHIBIDO opción", rationale="Tres.", citas=("c3",)),
        limitaciones=("Cuatro.", "PROHIBIDO cinco."),
    )

    assert pares_a_verificar(plan) == [
        ParNli("premisa uno", "Uno."),
        ParNli("premisa dos", "Uno."),
        ParNli("premisa uno", "Cuatro."),
        ParNli("premisa dos", "Cuatro."),
        ParNli("premisa tres", "Cuatro."),
    ]


# --- verificación de soporte -------------------------------------------------------------------------------------


def test_la_opcion_con_su_unica_afirmacion_implicada_queda_soportada() -> None:
    aceptada = _aceptada()

    resultado = verificar_soporte(_plan(aceptada), [IMPLICA], UMBRAL, "es")

    (soportada,) = resultado.soportadas
    assert soportada.opcion.option == "Opción A"
    assert soportada.opcion.rationale == f"{MARCO_ES}Afirmación uno."
    assert resultado.descartadas == ()


def test_una_afirmacion_neutral_descarta_la_opcion_y_la_lista_en_afirmaciones_sin_soporte() -> None:
    aceptada = _aceptada(rationale="Uno. Dos.")

    resultado = verificar_soporte(_plan(aceptada), [IMPLICA, NEUTRAL], UMBRAL, "es")

    assert resultado.soportadas == ()
    (descartada,) = resultado.descartadas
    assert descartada.afirmaciones_sin_soporte == ("Dos.",)
    assert descartada.opcion.option == aceptada.opcion.option
    assert descartada.opcion.rationale == f"{MARCO_ES}Uno."


def test_basta_un_chunk_citado_que_implique_la_afirmacion_aunque_otro_la_contradiga() -> None:
    aceptada = _aceptada(citas=("c1", "c2"))

    resultado = verificar_soporte(_plan(aceptada), [CONTRADICE, IMPLICA], UMBRAL, "es")

    assert [o.opcion.option for o in resultado.soportadas] == ["Opción A"]


def test_ninguna_afirmacion_se_soporta_con_un_resultado_bajo_el_umbral() -> None:
    resultado = verificar_soporte(
        _plan(_aceptada()), [ResultadoNli("entailment", 0.55)], UMBRAL, "es"
    )

    assert resultado.soportadas == () and len(resultado.descartadas) == 1


def test_la_afirmacion_prohibida_se_reemplaza_por_el_literal_en_la_justificacion_y_en_las_sin_soporte() -> (
    None
):
    aceptada = _aceptada(rationale="PROHIBIDO a. Limpia.")

    resultado = verificar_soporte(_plan(aceptada), [IMPLICA], UMBRAL, "es")

    (descartada,) = resultado.descartadas
    assert descartada.afirmaciones_sin_soporte == (RETIRO_ES,)
    assert descartada.opcion.rationale == f"{MARCO_ES}{RETIRO_ES}"
    assert "PROHIBIDO" not in f"{descartada.opcion}"


def test_el_literal_de_retiro_sale_en_ingles_cuando_la_pregunta_esta_en_ingles() -> None:
    resultado = verificar_soporte(_plan(_aceptada(rationale="PROHIBIDO a.")), [], UMBRAL, "en")

    (descartada,) = resultado.descartadas
    assert descartada.afirmaciones_sin_soporte == (RETIRO_EN,)
    assert descartada.opcion.rationale == f"{MARCO_EN}{RETIRO_EN}"


def test_un_termino_prohibido_en_la_opcion_la_reemplaza_por_el_literal_y_descarta_sin_enviarla_al_nli() -> (
    None
):
    aceptada = _aceptada(option="PROHIBIDO opción", rationale="Uno.")
    plan = _plan(aceptada)

    resultado = verificar_soporte(plan, [], UMBRAL, "es")

    assert pares_a_verificar(plan) == []
    (descartada,) = resultado.descartadas
    assert descartada.opcion.option == RETIRO_ES
    assert descartada.afirmaciones_sin_soporte == (RETIRO_ES, "Uno.")


def test_una_limitacion_soportada_se_conserva_y_una_sin_soporte_se_omite_y_cuenta() -> None:
    plan = _plan(limitaciones=("Soportada.", "Sin soporte."))

    resultado = verificar_soporte(
        plan, [IMPLICA, NEUTRAL, NEUTRAL, NEUTRAL, NEUTRAL, NEUTRAL], UMBRAL, "es"
    )

    assert resultado.limitaciones == ("Soportada.",)
    assert resultado.omitidas == 1


def test_una_limitacion_prohibida_se_omite_y_cuenta_sin_enviarse_al_nli() -> None:
    plan = _plan(limitaciones=("PROHIBIDO limitación",))

    resultado = verificar_soporte(plan, [], UMBRAL, "es")

    assert pares_a_verificar(plan) == []
    assert resultado.limitaciones == () and resultado.omitidas == 1


def test_una_cantidad_de_resultados_distinta_a_la_de_pares_es_un_error_de_contrato() -> None:
    with pytest.raises(ValueError):
        verificar_soporte(_plan(_aceptada()), [IMPLICA, IMPLICA], UMBRAL, "es")
    with pytest.raises(ValueError):
        verificar_soporte(_plan(_aceptada()), [], UMBRAL, "es")


# --- retiro en opciones descartadas por sus citas ----------------------------------------------------------------


def test_retirar_texto_prohibido_reemplaza_la_opcion_y_la_principal_que_incumplen() -> None:
    opcion = _opcion("PROHIBIDO a", "PROHIBIDO b.", ("c9",))

    saneada, retiros = retirar_texto_prohibido(opcion, _buscar, "en", 20)

    assert (saneada.option, saneada.rationale) == (RETIRO_EN, f"{MARCO_EN}{RETIRO_EN}")
    assert saneada.chunk_ids_citados == ("c9",)
    assert retiros == (
        RetiroDeLenguaje("option", ("regla-x",)),
        RetiroDeLenguaje("rationale", ("regla-x",), PRINCIPAL),
    )


# --- el resultado se asigna a SU afirmación, no a la que ocupa la misma posición (Gate 2, Bloqueante RN-01) ----------


def _dos_opciones_y_una_limitacion():
    primera = _aceptada(option="Opción 1", rationale="Primera.", citas=("c1",))
    segunda = _aceptada(option="Opción 2", rationale="Segunda.", citas=("c2",))
    plan = _plan(primera, segunda, limitaciones=("Limitación.",))
    # Pares en orden: Primera x c1, Segunda x c2, Limitación x (c1, c2, c3).
    assert [(p.premisa, p.hipotesis) for p in pares_a_verificar(plan)] == [
        ("premisa uno", "Primera."),
        ("premisa dos", "Segunda."),
        ("premisa uno", "Limitación."),
        ("premisa dos", "Limitación."),
        ("premisa tres", "Limitación."),
    ]
    return primera, segunda, plan


def test_cada_resultado_va_a_su_afirmacion_cuando_la_primera_opcion_y_la_limitacion_se_implican_y_la_segunda_no():
    primera, _, plan = _dos_opciones_y_una_limitacion()

    resultado = verificar_soporte(plan, [IMPLICA, NEUTRAL, IMPLICA, NEUTRAL, NEUTRAL], UMBRAL, "es")

    assert [o.opcion.option for o in resultado.soportadas] == ["Opción 1"]
    assert [d.opcion.option for d in resultado.descartadas] == ["Opción 2"]
    assert resultado.limitaciones == ("Limitación.",) and resultado.omitidas == 0


def test_cada_resultado_va_a_su_afirmacion_cuando_las_posiciones_se_invierten():
    _, segunda, plan = _dos_opciones_y_una_limitacion()

    resultado = verificar_soporte(plan, [NEUTRAL, IMPLICA, NEUTRAL, NEUTRAL, NEUTRAL], UMBRAL, "es")

    assert [o.opcion.option for o in resultado.soportadas] == ["Opción 2"]
    assert [d.opcion.option for d in resultado.descartadas] == ["Opción 1"]
    assert resultado.limitaciones == () and resultado.omitidas == 1


def test_una_opcion_prohibida_no_desplaza_los_resultados_de_las_afirmaciones_que_le_siguen():
    prohibida = _aceptada(option="PROHIBIDO a", rationale="Ignorada.", citas=("c1",))
    limpia = _aceptada(option="Opción 2", rationale="Segunda.", citas=("c2",))
    plan = _plan(prohibida, limpia)

    resultado = verificar_soporte(plan, [IMPLICA], UMBRAL, "es")

    assert [o.opcion.option for o in resultado.soportadas] == ["Opción 2"]
    assert [d.opcion.option for d in resultado.descartadas] == [RETIRO_ES]


def test_una_limitacion_prohibida_se_omite_y_cuenta_aunque_el_nli_implique_todo_lo_que_se_le_envia() -> (
    None
):
    plan = _plan(limitaciones=("Limpia.", "PROHIBIDO l."))

    resultado = verificar_soporte(plan, [IMPLICA, IMPLICA, IMPLICA], UMBRAL, "es")

    assert resultado.limitaciones == ("Limpia.",) and resultado.omitidas == 1
