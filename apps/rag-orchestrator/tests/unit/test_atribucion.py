"""Marco de atribución y forma de las afirmaciones atómicas (US-245, ADR-34): reglas puras, sin adapters."""

from __future__ import annotations

import pytest

from app.domain.atribucion import FormaDeAfirmacion, componer_con_marco, validar_forma_de_afirmacion
from app.domain.claims import AfirmacionAtomica, PapelDeAfirmacion
from app.domain.modales_normativos import VERSION_DE_MODALES_NORMATIVOS
from app.prompts.rag_query import FORMULA_DE_ATRIBUCION

P, S, V = PapelDeAfirmacion.principal, PapelDeAfirmacion.secundaria, PapelDeAfirmacion.salvedad


def _a(texto: str, papel: PapelDeAfirmacion) -> AfirmacionAtomica:
    return AfirmacionAtomica(texto, papel, ("c1",))


# --- componer_con_marco -------------------------------------------------------------------------------------------


def test_compone_la_justificacion_con_el_marco_en_espanol_antes_de_la_principal() -> None:
    composicion = componer_con_marco([_a("el beneficio es mayor", P)], "es")

    assert composicion.rationale == "La fuente reporta que el beneficio es mayor"
    assert composicion.details == ()


def test_compone_el_marco_en_ingles_cuando_la_pregunta_esta_en_ingles() -> None:
    composicion = componer_con_marco([_a("the benefit is larger", P)], "en")

    assert composicion.rationale == "The source reports that the benefit is larger"


def test_compone_un_detalle_por_secundaria_y_salvedad_con_el_mismo_marco_y_en_su_orden() -> None:
    composicion = componer_con_marco([_a("uno", S), _a("principal", P), _a("dos", V)], "es")

    assert composicion.rationale == "La fuente reporta que principal"
    assert composicion.details == ("La fuente reporta que uno", "La fuente reporta que dos")


def test_agrupa_en_el_ultimo_detalle_las_afirmaciones_que_exceden_el_maximo_del_contrato() -> None:
    afirmaciones = [_a("principal", P), _a("uno", S), _a("dos", S), _a("tres", V)]

    composicion = componer_con_marco(afirmaciones, "es")

    assert composicion.details == (
        "La fuente reporta que uno",
        "La fuente reporta que dos. La fuente reporta que tres",
    )


# --- validar_forma_de_afirmacion ----------------------------------------------------------------------------------


def test_acepta_una_afirmacion_declarativa_corta_sin_alias_ni_modal() -> None:
    forma = validar_forma_de_afirmacion("El beneficio se observa en HER2 positivo.", 20)

    assert forma is FormaDeAfirmacion.valida


@pytest.mark.parametrize(
    "texto",
    [
        "El fragmento C1 reporta que hay beneficio.",
        "Según C12 el beneficio es mayor.",
        "fragmento C3",
    ],
)
def test_detecta_el_alias_de_fragmento_en_cualquier_posicion(texto: str) -> None:
    assert validar_forma_de_afirmacion(texto, 20) is FormaDeAfirmacion.alias_de_fragmento


def test_no_confunde_un_codigo_clinico_con_un_alias_de_fragmento() -> None:
    forma = validar_forma_de_afirmacion("La proteína C-reactiva y CD20 no cambian.", 20)

    assert forma is FormaDeAfirmacion.valida


def test_detecta_la_afirmacion_que_supera_el_maximo_de_palabras() -> None:
    assert (
        validar_forma_de_afirmacion(" ".join(["a"] * 21), 20) is FormaDeAfirmacion.demasiado_larga
    )
    assert validar_forma_de_afirmacion(" ".join(["a"] * 20), 20) is FormaDeAfirmacion.valida


@pytest.mark.parametrize(
    "texto",
    [
        "La terapia debería continuarse un año.",
        "Conviene mantener el esquema.",
        "Hay que repetir la prueba.",
        "The therapy should continue for a year.",
    ],
)
def test_detecta_el_modal_normativo_con_acentos_y_mayusculas_indistintos(texto: str) -> None:
    assert validar_forma_de_afirmacion(texto, 20) is FormaDeAfirmacion.modal_normativo


def test_el_modal_normativo_precede_al_alias_y_a_la_longitud() -> None:
    forma = validar_forma_de_afirmacion("DEBERIA según C1 " + "a " * 25, 20)

    assert forma is FormaDeAfirmacion.modal_normativo


def test_no_detecta_un_modal_dentro_de_otra_palabra() -> None:
    assert validar_forma_de_afirmacion("La deberiana no existe como palabra.", 20) is (
        FormaDeAfirmacion.valida
    )


def test_detecta_el_artefacto_de_generacion_aunque_la_afirmacion_sea_corta() -> None:
    forma = validar_forma_de_afirmacion("El ensayo NSABP-B-3隀 reportó el mismo beneficio.", 20)

    assert forma is FormaDeAfirmacion.con_artefactos


def test_une_con_un_espacio_y_sin_duplicar_el_punto_cuando_la_afirmacion_agrupada_ya_termina_en_punto() -> (
    None
):
    afirmaciones = [_a("principal", P), _a("uno", S), _a("dos.", S), _a("tres", V)]

    composicion = componer_con_marco(afirmaciones, "es")

    assert composicion.details[1] == "La fuente reporta que dos. La fuente reporta que tres"


@pytest.mark.parametrize("final", [".", "?", "!", ";"])
def test_no_agrega_otro_punto_cuando_la_afirmacion_agrupada_termina_en_un_signo_de_cierre(
    final: str,
) -> None:
    afirmaciones = [_a("principal", P), _a("uno", S), _a(f"dos{final}", S), _a("tres", V)]

    composicion = componer_con_marco(afirmaciones, "es")

    assert ".." not in composicion.details[1] and f"{final}." not in composicion.details[1]


@pytest.mark.parametrize("idioma", ["es", "en"])
def test_el_marco_compuesto_cumple_la_formula_de_atribucion_del_prompt_en_cada_idioma(
    idioma: str,
) -> None:
    composicion = componer_con_marco([_a("el beneficio es mayor", P)], idioma)

    assert FORMULA_DE_ATRIBUCION.match(composicion.rationale)


@pytest.mark.parametrize(
    "texto",
    [
        "Debes repetir la prueba.",
        "Que deba continuar el esquema.",
        "La terapia debiera mantenerse.",
        "Hace falta repetir la prueba.",
        "Habría que repetir la prueba.",
    ],
)
def test_detecta_los_modales_de_la_version_1_1_0_de_la_lista(texto: str) -> None:
    assert validar_forma_de_afirmacion(texto, 20) is FormaDeAfirmacion.modal_normativo


def test_la_lista_de_modales_normativos_esta_en_la_version_1_1_0() -> None:
    assert VERSION_DE_MODALES_NORMATIVOS == "1.1.0"
