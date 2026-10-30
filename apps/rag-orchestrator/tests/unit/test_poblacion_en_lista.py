"""Reglas puras de la población en lista de un criterio (US-243, ADR-47): unidad = fragmento citado, restricción,
conflicto, rangos con las tablas del catálogo y proyección a los cuatro estados de RN-28."""

import dataclasses
from types import MappingProxyType

import pytest

from app.domain.aplicabilidad_tipos import (
    AtributoDelPaciente,
    ContextoDelPaciente,
    CriterioDePoblacion,
    CriterioEvaluado,
    PoblacionDelEstudio,
    ProyeccionDeEstado,
    ValorDePoblacion,
)
from app.domain.applicability_text import criterios_pendientes_de_texto
from app.domain.criterios_aplicabilidad import DestinoDelCriterio
from app.domain.applicability_rules import (
    clasificar_poblacion,
    detectar_conflicto,
    estado_de_poblacion,
    evaluar_criterio_de_fuente,
    fuente_mezcla_poblaciones,
    proyectar_estado,
    reconoce_restriccion,
    valores_de_la_opcion,
)
from tests.support.criterios_poblacion import (
    ECOG,
    ESTADIO_CON_ESCALA,
    ESTADIO_SIN_ESCALA,
    HER2,
    MARCADORES,
    MENOPAUSIA,
    RECEPTORES,
)


def _v(valor: str, chunk: str | None = "ch-1", alcance: str = "elegibilidad") -> ValorDePoblacion:
    return ValorDePoblacion(valor, alcance, chunk)  # type: ignore[arg-type]


# --- unidad de cálculo: el fragmento citado (D1, AC-7) ---------------------------------------------------------


def test_valores_de_la_opcion_deja_solo_los_valores_del_fragmento_citado_cuando_el_documento_tiene_dos():
    criterio = CriterioDePoblacion((_v("a", "ch-1"), _v("b", "ch-2"), _v("c", "ch-3")))

    assert valores_de_la_opcion(criterio, {"ch-2"}) == (_v("b", "ch-2"),)


def test_valores_de_la_opcion_une_los_valores_de_todos_los_fragmentos_citados():
    criterio = CriterioDePoblacion((_v("a", "ch-1"), _v("b", "ch-2"), _v("c", "ch-3")))

    assert valores_de_la_opcion(criterio, ["ch-1", "ch-3"]) == (_v("a", "ch-1"), _v("c", "ch-3"))


def test_valores_de_la_opcion_conserva_el_valor_de_la_forma_antigua_cuando_la_opcion_no_cita_nada_del_documento():
    antiguo = _v("positivo", None)

    assert valores_de_la_opcion(CriterioDePoblacion((antiguo, _v("b", "ch-2"))), set()) == (
        antiguo,
    )


# --- restricción explícita (D3) -----------------------------------------------------------------------------------


@pytest.mark.parametrize(
    "valor",
    [
        "postmenopausal women only",
        "Only postmenopausal women",
        "solo posmenopáusicas",
        "EXCLUSIVELY pre",
    ],
)
def test_reconoce_restriccion_cuando_el_valor_lleva_un_marcador_del_catalogo(valor: str):
    assert reconoce_restriccion(valor, MARCADORES)


@pytest.mark.parametrize("valor", ["postmenopausal women", "solitary tumours", "onlyness"])
def test_no_reconoce_restriccion_cuando_el_marcador_solo_es_parte_de_otra_palabra_o_no_esta(
    valor: str,
):
    assert not reconoce_restriccion(valor, MARCADORES)


def test_no_reconoce_restriccion_cuando_el_catalogo_no_declara_marcadores():
    assert not reconoce_restriccion("postmenopausal women only", ())


# --- conflicto (D3) ------------------------------------------------------------------------------------------------


def test_detecta_conflicto_cuando_dos_fragmentos_nombran_codigos_sin_ninguno_en_comun():
    assert detectar_conflicto({"ch-1": frozenset({"positivo"}), "ch-2": frozenset({"negativo"})})


def test_no_detecta_conflicto_cuando_los_fragmentos_comparten_un_codigo():
    assert not detectar_conflicto({"ch-1": frozenset({"pre", "post"}), "ch-2": frozenset({"post"})})


def test_no_detecta_conflicto_cuando_hay_un_solo_fragmento_aunque_nombre_dos_codigos():
    assert not detectar_conflicto({"ch-1": frozenset({"pre", "post"})})


def test_no_detecta_conflicto_cuando_el_otro_fragmento_no_mapeo_ningun_codigo():
    assert not detectar_conflicto({"ch-1": frozenset({"pre"}), "ch-2": frozenset()})


# --- proyección a los cuatro estados (D2) ------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("interno", "esperado"),
    [
        ("exacto", ProyeccionDeEstado("coincide")),
        ("inclusivo", ProyeccionDeEstado("parcial", motivo_parcial="inclusiva")),
        ("mezclado", ProyeccionDeEstado("parcial", motivo_parcial="mezclada")),
        ("rango_solapado", ProyeccionDeEstado("parcial", motivo_parcial="rango_solapado")),
        ("solo_subgrupo", ProyeccionDeEstado("parcial", motivo_parcial="solo_subgrupo")),
        ("restringido", ProyeccionDeEstado("no_coincide")),
        ("en_conflicto", ProyeccionDeEstado("desconocido", causa="valores_en_conflicto")),
        ("ausente", ProyeccionDeEstado("desconocido", causa="no_reportado_por_fuente")),
    ],
)
def test_proyectar_estado_lleva_cada_estado_interno_a_su_estado_visible_y_motivo(
    interno, esperado: ProyeccionDeEstado
):
    assert proyectar_estado(interno) == esperado


def test_proyectar_estado_conserva_el_motivo_interno_cuando_no_hay_regla_de_comparacion():
    assert proyectar_estado("sin_regla", "sin_escala") == ProyeccionDeEstado(
        "desconocido", causa="sin_regla_de_comparacion", motivo_interno="sin_escala"
    )


def test_fuente_mezcla_poblaciones_solo_para_guia_y_revision_sistematica():
    assert fuente_mezcla_poblaciones("guia")
    assert fuente_mezcla_poblaciones("revision_sistematica")
    assert not fuente_mezcla_poblaciones("eca")
    assert not fuente_mezcla_poblaciones(None)


# --- clasificación: casos de borde de cada regla ---------------------------------------------------------------


def test_clasifica_ausente_cuando_solo_hay_valores_de_mencion():
    assert clasificar_poblacion([_v("post", alcance="mencion")], "posmenopáusica", MENOPAUSIA) == (
        "ausente",
        None,
    )


def test_clasifica_sin_regla_cuando_el_valor_del_estudio_no_esta_en_la_tabla_de_sinonimos():
    valores = [_v("women aged 60 or older")]

    assert clasificar_poblacion(valores, "posmenopáusica", MENOPAUSIA) == (
        "sin_regla",
        "valor_fuera_de_tabla",
    )


def test_clasifica_sin_regla_cuando_el_valor_del_paciente_no_esta_en_la_tabla():
    assert clasificar_poblacion([_v("postmenopausal women")], "otra cosa", MENOPAUSIA) == (
        "sin_regla",
        "valor_fuera_de_tabla",
    )


def test_clasifica_ignorando_los_valores_no_mapeados_cuando_otro_del_mismo_fragmento_si_mapea():
    valores = [_v("postmenopausal women"), _v("women aged 60 or older")]

    assert clasificar_poblacion(valores, "posmenopáusica", MENOPAUSIA) == ("exacto", None)


def test_clasifica_restringido_solo_cuando_el_marcador_acompana_a_un_valor_que_excluye_al_paciente():
    sin_marcador = [_v("postmenopausal women")]
    con_marcador = [_v("postmenopausal women only")]

    assert clasificar_poblacion(sin_marcador, "premenopáusica", MENOPAUSIA)[0] == "ausente"
    assert clasificar_poblacion(con_marcador, "premenopáusica", MENOPAUSIA)[0] == "restringido"


def test_clasifica_el_conflicto_antes_que_la_coincidencia_cuando_el_paciente_esta_en_uno_de_los_fragmentos():
    valores = [_v("HER2-positive (IHC 3+)", "ch-1"), _v("HER2-negative", "ch-2")]

    assert clasificar_poblacion(valores, "3+ (IHQ)", HER2) == ("en_conflicto", None)


def test_clasifica_exacto_cuando_dos_fragmentos_nombran_el_mismo_codigo():
    valores = [_v("HER2-positive (IHC 3+)", "ch-1"), _v("HER2-positive (IHC 3+)", "ch-2")]

    assert clasificar_poblacion(valores, "3+ (IHQ)", HER2) == ("exacto", None)


def test_clasifica_el_valor_con_el_literal_de_equivalencias_como_su_codigo_cuando_no_hay_sinonimo():
    assert clasificar_poblacion([_v("positivo")], "3+ (IHQ)", HER2) == ("exacto", None)


@pytest.mark.parametrize(
    ("paciente", "estudio", "esperado"),
    [("1", "0-1", "exacto"), ("2", "0-1", "restringido"), ("1", "1", "exacto")],
)
def test_clasifica_un_rango_entero_contra_el_valor_del_paciente(paciente, estudio, esperado):
    assert clasificar_poblacion([_v(estudio)], paciente, ECOG) == (esperado, None)


def test_clasifica_sin_regla_cuando_el_rango_entero_no_se_lee():
    assert clasificar_poblacion([_v("0 a 1")], "1", ECOG) == ("sin_regla", "forma_no_comparable")


def test_clasifica_forma_no_comparable_cuando_el_criterio_sin_escala_no_es_el_estadio():
    sin_escala = ECOG

    assert clasificar_poblacion([_v("bajo")], "alto", sin_escala) == (
        "sin_regla",
        "forma_no_comparable",
    )


@pytest.mark.parametrize(
    ("paciente", "estudio", "esperado"),
    [
        ("IIA", "IA–IIB", "exacto"),
        ("IIA", "IIA", "exacto"),
        ("IIA", "IB–IIA", "exacto"),
        ("II", "IIA–IIB", "exacto"),
        ("II", "IIB–IIIA", "rango_solapado"),
        ("IA", "IIB–IIIA", "restringido"),
        ("IIIA", "IA–IIB", "restringido"),
    ],
)
def test_clasifica_un_rango_ordinal_con_la_escala_y_los_grupos_del_catalogo(
    paciente, estudio, esperado
):
    assert clasificar_poblacion([_v(estudio)], paciente, ESTADIO_CON_ESCALA) == (esperado, None)


@pytest.mark.parametrize("estudio", ["IIIA–IA", "IA–IB–IIA", "IA–", "XX"])
def test_clasifica_valor_fuera_de_tabla_cuando_el_rango_ordinal_no_encaja_en_la_escala(estudio):
    assert clasificar_poblacion([_v(estudio)], "IIA", ESTADIO_CON_ESCALA) == (
        "sin_regla",
        "valor_fuera_de_tabla",
    )


def test_clasifica_valor_fuera_de_tabla_cuando_el_estadio_del_paciente_no_esta_en_la_escala():
    assert clasificar_poblacion([_v("IA–IIB")], "IVB", ESTADIO_CON_ESCALA) == (
        "sin_regla",
        "valor_fuera_de_tabla",
    )


def test_clasifica_sin_escala_cuando_el_estadio_no_tiene_tabla_en_el_catalogo():
    assert clasificar_poblacion([_v("I–III")], "IIA", ESTADIO_SIN_ESCALA) == (
        "sin_regla",
        "sin_escala",
    )


def test_clasifica_forma_no_comparable_cuando_el_destino_reune_varios_biomarcadores():
    assert clasificar_poblacion([_v("positivo")], "RE: Positivo", RECEPTORES) == (
        "sin_regla",
        "forma_no_comparable",
    )


# --- composición con el contexto del paciente y los fragmentos citados -----------------------------------------


MENOPAUSIA_CON_PERI = dataclasses.replace(
    MENOPAUSIA,
    poblacion=dataclasses.replace(
        MENOPAUSIA.poblacion,
        sinonimos=MappingProxyType(
            {**MENOPAUSIA.poblacion.sinonimos, "perimenopausica": ("perimenopausal women",)}
        ),
    ),
)
MENOPAUSIA_LEIDA = dataclasses.replace(
    MENOPAUSIA,
    destino=DestinoDelCriterio(
        "ClinicalAttribute", "value", MappingProxyType({"attribute_key": ("estado_menopausico",)})
    ),
)
A_M2 = ContextoDelPaciente(
    atributos=(AtributoDelPaciente("estado_menopausico", "posmenopáusica", 1),)
)


def _poblacion_de_menopausia() -> PoblacionDelEstudio:
    return PoblacionDelEstudio(
        "extraido_verificado",
        {
            "estado_menopausico": CriterioDePoblacion(
                (_v("postmenopausal women only", "ch-1"), _v("premenopausal women only", "ch-2"))
            )
        },
    )


def test_evaluar_criterio_de_fuente_usa_solo_los_fragmentos_citados_cuando_se_le_indican():
    solo_ch1 = evaluar_criterio_de_fuente(
        MENOPAUSIA_LEIDA, A_M2, _poblacion_de_menopausia(), {"ch-1"}
    )
    solo_ch2 = evaluar_criterio_de_fuente(
        MENOPAUSIA_LEIDA, A_M2, _poblacion_de_menopausia(), {"ch-2"}
    )

    assert [v.chunk_id for v in solo_ch1.valores_del_estudio] == ["ch-1"]
    assert [v.chunk_id for v in solo_ch2.valores_del_estudio] == ["ch-2"]


def test_evaluar_criterio_de_fuente_lee_todos_los_valores_cuando_no_se_indican_fragmentos():
    evaluado = evaluar_criterio_de_fuente(MENOPAUSIA_LEIDA, A_M2, _poblacion_de_menopausia())

    assert [v.chunk_id for v in evaluado.valores_del_estudio] == ["ch-1", "ch-2"]


def test_criterios_pendientes_de_texto_no_pide_al_llm_el_criterio_cuando_la_lista_solo_trae_subgrupo():
    solo_subgrupo = CriterioEvaluado(
        "receptores_hormonales",
        "RE: Positivo",
        None,
        "desconocido",
        "no_reportado_por_fuente",
        False,
        valores_del_estudio=(_v("triple-negative (TNBC)", alcance="subgrupo"),),
    )
    sin_lista = dataclasses.replace(
        solo_subgrupo, clave="estado_menopausico", valores_del_estudio=()
    )

    pendientes = criterios_pendientes_de_texto(
        [solo_subgrupo, sin_lista], [RECEPTORES, MENOPAUSIA_LEIDA]
    )

    assert [p.clave for p in pendientes] == ["estado_menopausico"]


def test_evaluar_criterio_de_fuente_copia_el_primer_valor_de_elegibilidad_cuando_el_subgrupo_va_primero():
    poblacion = PoblacionDelEstudio(
        "extraido_verificado",
        {
            "estado_menopausico": CriterioDePoblacion(
                (_v("premenopausal women", "ch-1", "subgrupo"), _v("postmenopausal women", "ch-1"))
            )
        },
    )

    evaluado = evaluar_criterio_de_fuente(MENOPAUSIA_LEIDA, A_M2, poblacion, {"ch-1"})

    assert evaluado.valor_estudio == "postmenopausal women"
    assert [v.alcance for v in evaluado.valores_del_estudio] == ["subgrupo", "elegibilidad"]


def test_estado_de_poblacion_lee_la_forma_antigua_cuando_algun_valor_no_trae_fragmento():
    mezcla = [_v("postmenopausal women", None), _v("premenopausal women", "ch-1")]

    proyeccion = estado_de_poblacion(mezcla, "posmenopáusica", MENOPAUSIA)

    # Con la lectura de lista sería ``parcial``/``inclusiva``; la forma antigua compara el primer valor por pertenencia.
    assert proyeccion == ProyeccionDeEstado("no_coincide")


def test_clasifica_restringido_cuando_solo_uno_de_varios_valores_elegibles_lleva_el_marcador():
    valores = [_v("postmenopausal women only"), _v("perimenopausal women")]

    assert clasificar_poblacion(valores, "premenopáusica", MENOPAUSIA_CON_PERI)[0] == "restringido"
