"""Soporte de las afirmaciones atómicas por papel (RN-01, RN-23, US-245): reglas puras sobre ``domain/support.py``.

El buscador de términos es una función pura de prueba: todo texto con ``PROHIBIDO`` incumple la regla ``regla-x``.
"""

from __future__ import annotations

from app.domain.citations import OpcionAceptada, OpcionGenerada
from app.domain.claims import AfirmacionAtomica, PapelDeAfirmacion
from app.domain.nli import ResultadoNli
from app.domain.resolucion_de_soporte import verificar_soporte
from app.domain.saneamiento_de_descartadas import retirar_texto_prohibido
from app.domain.soporte_por_papel import MotivoDeSoporte
from app.domain.support import RETIRO_ES, OpcionSinSoporte, pares_a_verificar, planificar_soporte

P, S, V = PapelDeAfirmacion.principal, PapelDeAfirmacion.secundaria, PapelDeAfirmacion.salvedad
UMBRAL = 0.7
TEXTOS = {"c1": "premisa uno", "c2": "premisa dos", "c3": "premisa tres"}
IMPLICA = ResultadoNli("entailment", 0.97)
NEUTRAL = ResultadoNli("neutral", 0.02)


def _buscar(texto: str, campo: str) -> tuple[str, ...]:
    return ("regla-x",) if "PROHIBIDO" in texto else ()


def _a(texto: str, papel: PapelDeAfirmacion, *chunks: str) -> AfirmacionAtomica:
    return AfirmacionAtomica(texto, papel, chunks or ("c1",))


def _aceptada(*afirmaciones: AfirmacionAtomica, validos: tuple[str, ...] = ("c1",)):
    citados = tuple(dict.fromkeys(c for a in afirmaciones for c in a.chunk_ids))
    opcion = OpcionGenerada("Opción A", "ignorado", citados, (), tuple(afirmaciones))
    return OpcionAceptada(opcion, validos)


def _plan(aceptada: OpcionAceptada):
    return planificar_soporte([aceptada], (), TEXTOS, _buscar, max_palabras=5)


def _verificar(aceptada: OpcionAceptada, *veredictos: ResultadoNli, idioma: str = "es"):
    plan = _plan(aceptada)
    return verificar_soporte(plan, list(veredictos), UMBRAL, idioma)


def test_el_titulo_de_la_opcion_con_modal_normativo_incumple_el_lenguaje_y_la_opcion_se_descarta() -> (
    None
):
    """D4-20 (Q5): ``option`` también pasa por la lista de modales; el motivo es el de lenguaje, sin consultar al NLI."""
    opcion = OpcionGenerada(
        "Patients must receive the drug", "ignorado", ("c1",), (), (_a("uno", P),)
    )

    resultado = verificar_soporte(_plan(OpcionAceptada(opcion, ("c1",))), [], UMBRAL, "es")

    (descartada,) = resultado.descartadas
    assert descartada.motivo is MotivoDeSoporte.lenguaje_no_permitido


def test_el_nli_recibe_solo_los_chunks_validos_que_cita_cada_afirmacion() -> None:
    aceptada = _aceptada(_a("uno", P, "c1"), _a("dos", S, "c2", "c9"), validos=("c1", "c2"))

    pares = [(p.premisa, p.hipotesis) for p in pares_a_verificar(_plan(aceptada))]

    assert pares == [("premisa uno", "uno"), ("premisa dos", "dos")]


def test_una_afirmacion_sin_chunk_valido_no_envia_pares_y_cuenta_como_sin_soporte() -> None:
    aceptada = _aceptada(_a("uno", P, "c1"), _a("dos", S, "c9"))

    assert [p.hipotesis for p in pares_a_verificar(_plan(aceptada))] == ["uno"]
    resultado = _verificar(aceptada, IMPLICA)
    assert resultado.omitidas == 1 and len(resultado.soportadas) == 1


def test_recompone_la_justificacion_sin_la_secundaria_omitida_y_cuenta_una_omision() -> None:
    aceptada = _aceptada(_a("uno", P), _a("dos", S), _a("tres", V))

    resultado = _verificar(aceptada, IMPLICA, NEUTRAL, IMPLICA)

    (conservada,) = resultado.soportadas
    assert conservada.opcion.rationale == "La fuente reporta que uno"
    assert conservada.opcion.details == ("La fuente reporta que tres",)
    assert [a.texto for a in conservada.opcion.afirmaciones] == ["uno", "tres"]
    assert resultado.omitidas == 1 and resultado.descartadas == ()


def test_recompone_el_marco_en_ingles_cuando_la_pregunta_esta_en_ingles() -> None:
    resultado = _verificar(_aceptada(_a("uno", P)), IMPLICA, idioma="en")

    assert resultado.soportadas[0].opcion.rationale == "The source reports that uno"


def test_no_envia_al_nli_la_afirmacion_con_alias_ni_la_demasiado_larga_ni_la_prohibida() -> None:
    aceptada = _aceptada(
        _a("uno", P),
        _a("el fragmento C1 dice", S),
        _a("a b c d e f", S),
        _a("PROHIBIDO x", S),
    )

    assert [p.hipotesis for p in pares_a_verificar(_plan(aceptada))] == ["uno"]


def test_descarta_con_el_texto_de_la_principal_sin_soporte_y_lo_muestra_en_su_justificacion() -> (
    None
):
    resultado = _verificar(_aceptada(_a("uno", P), _a("dos", S)), NEUTRAL, IMPLICA)

    (descartada,) = resultado.descartadas
    assert descartada.afirmaciones_sin_soporte == ("uno",)
    assert descartada.opcion.rationale == "La fuente reporta que uno"
    assert descartada.motivo is MotivoDeSoporte.afirmacion_sin_soporte
    assert "dos" not in descartada.opcion.rationale and resultado.omitidas == 0


def test_descarta_con_un_literal_y_sin_exponer_la_principal_cuando_llega_fuera_de_forma() -> None:
    resultado = _verificar(_aceptada(_a("el fragmento C1 dice", P)))

    (descartada,) = resultado.descartadas
    assert descartada.afirmaciones_sin_soporte == ("(texto no mostrado)",)
    assert descartada.opcion.rationale == "La fuente reporta que (texto no mostrado)"


def test_descarta_con_lenguaje_no_permitido_y_el_literal_de_retiro_cuando_la_secundaria_incumple() -> (
    None
):
    resultado = _verificar(_aceptada(_a("uno", P), _a("PROHIBIDO dos", S)), IMPLICA)

    (descartada,) = resultado.descartadas
    assert isinstance(descartada, OpcionSinSoporte)
    assert descartada.motivo is MotivoDeSoporte.lenguaje_no_permitido
    assert descartada.afirmaciones_sin_soporte == (RETIRO_ES,)
    assert "PROHIBIDO" not in descartada.opcion.rationale


def test_la_opcion_descartada_por_citas_no_expone_una_principal_con_modal_normativo() -> None:
    opcion = _aceptada(_a("La terapia debería continuar", P)).opcion

    saneada, retiros = retirar_texto_prohibido(opcion, _buscar, "es", 20)

    assert saneada.rationale == "La fuente reporta que (texto no mostrado)"
    assert retiros == ()


def test_la_opcion_descartada_por_citas_retira_una_principal_prohibida_y_declara_el_papel() -> None:
    opcion = _aceptada(_a("PROHIBIDO uno", P)).opcion

    saneada, retiros = retirar_texto_prohibido(opcion, _buscar, "es", 20)

    assert saneada.rationale == f"La fuente reporta que {RETIRO_ES}"
    assert [(r.campo, r.papel) for r in retiros] == [("rationale", P)]


def test_el_lenguaje_de_la_lista_precede_a_la_forma_y_el_nli_no_se_invoca_para_la_afirmacion() -> (
    None
):
    """Orden prohibidos → forma → NLI [US-245 AC-5/AC-6]: texto prohibido Y con modal normativo."""
    aceptada = _aceptada(_a("uno", P), _a("PROHIBIDO debería continuar", S))

    assert [p.hipotesis for p in pares_a_verificar(_plan(aceptada))] == ["uno"]
    (descartada,) = _verificar(aceptada, IMPLICA).descartadas
    assert descartada.motivo is MotivoDeSoporte.lenguaje_no_permitido
    assert descartada.afirmaciones_sin_soporte == (RETIRO_ES,)


def test_el_lenguaje_de_la_lista_precede_al_alias_de_fragmento() -> None:
    aceptada = _aceptada(_a("uno", P), _a("según C1 PROHIBIDO dos", S))

    (descartada,) = _verificar(aceptada, IMPLICA).descartadas

    assert descartada.motivo is MotivoDeSoporte.lenguaje_no_permitido


def test_la_descartada_por_soporte_y_la_descartada_por_citas_muestran_la_misma_opcion_y_justificacion() -> (
    None
):
    """Paridad (D4-19 P1-1): una sola regla para la opción descartada visible, sea cual sea la razón del descarte."""
    for texto, veredictos in (
        ("uno", [NEUTRAL]),
        ("PROHIBIDO uno", []),
        ("el fragmento C1 dice", []),
    ):
        aceptada = _aceptada(_a(texto, P))
        por_citas, _ = retirar_texto_prohibido(aceptada.opcion, _buscar, "es", 5)

        (por_soporte,) = _verificar(aceptada, *veredictos).descartadas

        assert (por_soporte.opcion.option, por_soporte.opcion.rationale) == (
            por_citas.option,
            por_citas.rationale,
        )
