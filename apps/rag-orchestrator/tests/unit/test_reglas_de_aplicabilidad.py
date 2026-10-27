"""Reglas puras de la aplicabilidad por criterio (L1D-127, FR-25, RN-25, RN-28, ADR-34 b): sin adapters, sin E/S.

Los criterios son los de ``test-apl-1.0.0`` (L1D-126); los demás se arman a mano con ``criterio_de()``.
"""

import pytest

from app.domain.aplicabilidad_tipos import (
    AtributoDelPaciente,
    BiomarcadorDelPaciente,
    ContextoDelPaciente,
    CriterioEvaluado,
    PoblacionDelEstudio,
    TratamientoPrevioDelPaciente,
    ValorDelEstudio,
)
from app.domain.applicability_rules import (
    DestinoNoResoluble,
    contar_estados,
    evaluar_criterio,
    evaluar_criterio_de_fuente,
    poblacion_no_comparable,
    valor_del_estudio,
    valor_del_paciente,
)
from app.domain.criterios_aplicabilidad import (
    CondicionDeParcial,
    CriterioDeAplicabilidad,
    DestinoDelCriterio,
    LimitesDeRegla,
    OperadorDeRegla,
    ReglaDeAplicabilidad,
)

EQUIVALENCIAS_HER2 = {"positivo": ("3+", "2+ con ISH positivo")}


def criterio_de(
    operador: OperadorDeRegla,
    *,
    clave: str = "criterio",
    clave_de_estudio: str = "estudio",
    parcial_cuando: CondicionDeParcial = "solo_subgrupo",
    equivalencias: dict[str, tuple[str, ...]] | None = None,
    limites: LimitesDeRegla | None = None,
    excluyente: bool = False,
    entidad: str = "Diagnosis",
    campo: str | None = "stage_value",
    coincidencia: dict[str, tuple[str, ...]] | None = None,
) -> CriterioDeAplicabilidad:
    return CriterioDeAplicabilidad(
        clave=clave,
        tipo_de_cancer="mama",
        clave_de_estudio=clave_de_estudio,
        etiqueta_es="Criterio de prueba",
        etiqueta_en=None,
        destino=DestinoDelCriterio(entidad, campo, coincidencia or {}),
        es_excluyente=excluyente,
        regla=ReglaDeAplicabilidad(operador, parcial_cuando, equivalencias or {}, limites),
        estado_de_revision="propuesta",
    )


def estudio(valor: str, *, subgrupo: bool = False) -> ValorDelEstudio:
    return ValorDelEstudio(valor, subgrupo)


def her2(**cambios: object) -> CriterioDeAplicabilidad:
    argumentos: dict[str, object] = {
        "clave": "estado_her2",
        "equivalencias": EQUIVALENCIAS_HER2,
        "excluyente": True,
        "entidad": "Biomarker",
        "campo": "value",
        "coincidencia": {"name": ("HER2",)},
    }
    return criterio_de("igualdad", **{**argumentos, **cambios})  # type: ignore[arg-type]


def estado_y_causa(evaluado: CriterioEvaluado) -> tuple[str, str | None]:
    return evaluado.estado, evaluado.causa


# --- valor del estudio (RN-25, design D4) ------------------------------------------------------------------------


def poblacion(**criterios: object) -> PoblacionDelEstudio:
    return PoblacionDelEstudio("fuente_estructurada", criterios)


def test_valor_del_estudio_copia_el_texto_cuando_la_clave_es_una_cadena():
    assert valor_del_estudio(poblacion(ecog="0-1"), "ecog") == estudio("0-1")


def test_valor_del_estudio_es_none_cuando_la_clave_esta_ausente_o_vale_no_disponible():
    assert valor_del_estudio(poblacion(ecog="no_disponible"), "ecog") is None
    assert valor_del_estudio(poblacion(), "ecog") is None


def test_valor_del_estudio_es_none_cuando_la_cadena_esta_vacia():
    assert valor_del_estudio(poblacion(ecog=""), "ecog") is None


def test_valor_del_estudio_lee_la_subclave_del_objeto_biomarcadores():
    pob = poblacion(biomarcadores={"her2": "positivo"})

    assert valor_del_estudio(pob, "biomarcadores.her2") == estudio("positivo")
    assert valor_del_estudio(pob, "biomarcadores.hrr_brca") is None


def test_valor_del_estudio_es_none_cuando_se_pide_una_subclave_sobre_una_cadena():
    # La semilla guarda ``biomarcadores`` como cadena: no se trocea (D4 d).
    assert valor_del_estudio(poblacion(biomarcadores="HER2 positivo"), "biomarcadores.her2") is None


def test_valor_del_estudio_marca_el_subgrupo_cuando_el_objeto_trae_alcance_subgrupo():
    pob = poblacion(ecog={"valor": "0-1", "alcance": "subgrupo"})

    assert valor_del_estudio(pob, "ecog") == estudio("0-1", subgrupo=True)


def test_valor_del_estudio_no_marca_subgrupo_cuando_el_objeto_trae_otro_alcance():
    assert valor_del_estudio(poblacion(ecog={"valor": "0-1", "alcance": "total"}), "ecog") == (
        estudio("0-1")
    )


def test_valor_del_estudio_es_none_cuando_el_objeto_no_trae_valor_o_trae_otra_forma():
    assert valor_del_estudio(poblacion(ecog={"alcance": "subgrupo"}), "ecog") is None
    assert valor_del_estudio(poblacion(ecog={"valor": 1}), "ecog") is None
    assert valor_del_estudio(poblacion(ecog=["0-1"]), "ecog") is None
    assert valor_del_estudio(poblacion(biomarcadores={"her2": 3}), "biomarcadores.her2") is None


def test_valor_del_estudio_copia_el_caracter_exacto_cuando_trae_espacios_o_mayusculas():
    assert valor_del_estudio(poblacion(ecog=" 0-1 "), "ecog") == estudio(" 0-1 ")


# --- valor del paciente (ADR-34 b, design D3) --------------------------------------------------------------------

A_M1 = ContextoDelPaciente(
    biomarcadores=(BiomarcadorDelPaciente("HER2", "3+ (IHQ)", 1),),
    valor_de_estadio="IIA",
    grado="Nottingham grado 2",
    escala_de_desempeno="ECOG",
    valor_de_desempeno=1,
    tratamientos_previos=(TratamientoPrevioDelPaciente(1, 6),),
)


def destino(entidad: str, campo: str | None, **coincidencia: tuple[str, ...]) -> DestinoDelCriterio:
    return DestinoDelCriterio(entidad, campo, coincidencia)


def test_valor_del_paciente_copia_el_biomarcador_cuando_el_nombre_coincide_exacto():
    assert valor_del_paciente(A_M1, destino("Biomarker", "value", name=("HER2",))) == "3+ (IHQ)"


def test_valor_del_paciente_es_none_cuando_el_biomarcador_no_esta_o_difiere_en_mayusculas():
    assert valor_del_paciente(A_M1, destino("Biomarker", "value", name=("her2",))) is None
    assert valor_del_paciente(A_M1, destino("Biomarker", "value", name=("RE",))) is None


def test_valor_del_paciente_copia_estadio_y_grado_de_los_campos_del_diagnostico():
    assert valor_del_paciente(A_M1, destino("Diagnosis", "stage_value")) == "IIA"
    assert valor_del_paciente(A_M1, destino("Diagnosis", "grade")) == "Nottingham grado 2"


def test_valor_del_paciente_copia_el_entero_de_ecog_como_decimal_cuando_la_escala_es_ecog():
    ecog = destino("Diagnosis", "performance_value", performance_scale=("ECOG",))

    assert valor_del_paciente(A_M1, ecog) == "1"


def test_valor_del_paciente_no_copia_ecog_cuando_la_escala_es_otra_o_falta():
    ecog = destino("Diagnosis", "performance_value", performance_scale=("ECOG",))
    karnofsky = ContextoDelPaciente(escala_de_desempeno="Karnofsky", valor_de_desempeno=80)

    assert valor_del_paciente(karnofsky, ecog) is None
    assert valor_del_paciente(ContextoDelPaciente(valor_de_desempeno=1), ecog) is None
    assert valor_del_paciente(ContextoDelPaciente(escala_de_desempeno="ECOG"), ecog) is None


def test_valor_del_paciente_rotula_cada_componente_cuando_el_destino_es_una_lista_de_biomarcadores():
    contexto = ContextoDelPaciente(
        biomarcadores=(
            BiomarcadorDelPaciente("RE", "Positivo (80%)", 1),
            BiomarcadorDelPaciente("RP", "Negativo", 1),
        )
    )

    assert (
        valor_del_paciente(contexto, destino("Biomarker", "value", name=("RE", "RP")))
        == "RE: Positivo (80%); RP: Negativo"
    )


def test_valor_del_paciente_es_none_cuando_falta_cualquier_componente_de_la_lista():
    contexto = ContextoDelPaciente(biomarcadores=(BiomarcadorDelPaciente("RE", "Positivo", 1),))

    assert valor_del_paciente(contexto, destino("Biomarker", "value", name=("RE", "RP"))) is None


def test_valor_del_paciente_lee_el_atributo_por_clave():
    contexto = ContextoDelPaciente(
        atributos=(AtributoDelPaciente("estado_menopausico", "posmenopausica", None),)
    )
    menopausia = destino("ClinicalAttribute", "value", attribute_key=("estado_menopausico",))

    assert valor_del_paciente(contexto, menopausia) == "posmenopausica"
    assert valor_del_paciente(A_M1, menopausia) is None


def test_valor_del_paciente_copia_el_numero_de_linea_como_decimal():
    linea = destino("PriorTreatment", "line_number")

    assert valor_del_paciente(A_M1, linea) == "1"
    assert valor_del_paciente(ContextoDelPaciente(), linea) is None
    sin_numero = ContextoDelPaciente(tratamientos_previos=(TratamientoPrevioDelPaciente(None, 2),))
    assert valor_del_paciente(sin_numero, linea) is None


def test_valor_del_paciente_toma_el_menor_meses_atras_cuando_hay_varios_valores_del_destino():
    contexto = ContextoDelPaciente(
        biomarcadores=(
            BiomarcadorDelPaciente("HER2", "2+ (IHQ)", 8),
            BiomarcadorDelPaciente("HER2", "3+ (IHQ)", 2),
            BiomarcadorDelPaciente("HER2", "negativo", 2),
        ),
        tratamientos_previos=(
            TratamientoPrevioDelPaciente(1, 12),
            TratamientoPrevioDelPaciente(2, 3),
        ),
    )

    assert valor_del_paciente(contexto, destino("Biomarker", "value", name=("HER2",))) == "3+ (IHQ)"
    assert valor_del_paciente(contexto, destino("PriorTreatment", "line_number")) == "2"


@pytest.mark.parametrize(
    "fuera_de_la_lista",
    [
        destino("Medication", "name"),
        destino("Diagnosis", "histology"),
        destino("Biomarker", "unit", name=("HER2",)),
        destino("Biomarker", "value"),
        destino("Diagnosis", "performance_value"),
        destino("ClinicalAttribute", "value"),
    ],
)
def test_valor_del_paciente_lanza_destino_no_resoluble_cuando_el_destino_no_es_uno_de_los_conocidos(
    fuera_de_la_lista: DestinoDelCriterio,
):
    with pytest.raises(DestinoNoResoluble):
        valor_del_paciente(A_M1, fuera_de_la_lista)


# --- igualdad (design D2b) -----------------------------------------------------------------------------------------


def test_evaluar_criterio_da_coincide_cuando_el_prefijo_exacto_clasifica_al_paciente_en_la_categoria_del_estudio():
    evaluado = evaluar_criterio(her2(), "3+ (IHQ)", estudio("positivo"))

    assert evaluado.estado == "coincide"
    assert (evaluado.valor_paciente, evaluado.valor_estudio) == ("3+ (IHQ)", "positivo")
    assert evaluado.es_excluyente is True


def test_evaluar_criterio_da_no_coincide_cuando_la_categoria_del_paciente_difiere_del_estudio():
    assert evaluar_criterio(her2(), "3+ (IHQ)", estudio("negativo")).estado == "no_coincide"


def test_evaluar_criterio_clasifica_la_alternativa_larga_cuando_el_prefijo_es_2_mas_con_ish_positivo():
    assert (
        evaluar_criterio(her2(), "2+ con ISH positivo (FISH)", estudio("positivo")).estado
        == "coincide"
    )


def test_evaluar_criterio_deja_desconocido_cuando_el_paciente_tiene_2_mas_sin_ish_y_el_estudio_dice_positivo():
    evaluado = evaluar_criterio(her2(), "2+ (IHQ)", estudio("positivo"))

    assert estado_y_causa(evaluado) == ("desconocido", None)
    assert evaluado.motivo_interno == "valor_fuera_de_tabla"


def test_evaluar_criterio_deja_desconocido_cuando_el_paciente_dice_negativo_y_el_estudio_dice_positivo():
    assert estado_y_causa(evaluar_criterio(her2(), "negativo", estudio("positivo"))) == (
        "desconocido",
        None,
    )


def test_evaluar_criterio_da_no_coincide_cuando_el_paciente_sin_categoria_y_el_estudio_ajeno_a_la_tabla():
    assert evaluar_criterio(her2(), "2+ (IHQ)", estudio("negativo")).estado == "no_coincide"


def test_evaluar_criterio_da_coincide_cuando_el_paciente_sin_categoria_repite_el_literal_del_estudio():
    assert evaluar_criterio(her2(), "negativo", estudio("negativo")).estado == "coincide"


def test_evaluar_criterio_compara_por_igualdad_exacta_cuando_la_regla_no_declara_equivalencias():
    castracion = criterio_de("igualdad", clave="estado_castracion")

    assert evaluar_criterio(castracion, "resistente", estudio("resistente")).estado == "coincide"
    assert evaluar_criterio(castracion, "resistente", estudio("Resistente")).estado == "no_coincide"


def test_evaluar_criterio_no_da_parcial_cuando_la_igualdad_declara_solo_subgrupo():
    evaluado = evaluar_criterio(her2(), "3+ (IHQ)", estudio("positivo", subgrupo=True))

    assert evaluado.estado == "coincide"


def test_evaluar_criterio_compara_con_prefijo_sensible_a_mayusculas_y_espacios():
    # Con un espacio delante no hay prefijo: el paciente queda sin categoría y no se adivina (Q3).
    assert estado_y_causa(evaluar_criterio(her2(), " 3+ (IHQ)", estudio("positivo"))) == (
        "desconocido",
        None,
    )
    assert evaluar_criterio(her2(), "3+ (IHQ)", estudio("positivo")).estado == "coincide"
    assert evaluar_criterio(her2(), "3+ (IHQ)", estudio("Positivo")).estado == "no_coincide"


# --- rango ---------------------------------------------------------------------------------------------------------


def ecog(**cambios: object) -> CriterioDeAplicabilidad:
    argumentos: dict[str, object] = {
        "clave": "ecog",
        "campo": "performance_value",
        "coincidencia": {"performance_scale": ("ECOG",)},
    }
    return criterio_de("rango", **{**argumentos, **cambios})  # type: ignore[arg-type]


def test_evaluar_criterio_da_coincide_cuando_el_valor_del_paciente_cae_dentro_del_rango():
    assert evaluar_criterio(ecog(), "1", estudio("0-1")).estado == "coincide"
    assert evaluar_criterio(ecog(), "0", estudio("0–1")).estado == "coincide"  # raya
    assert evaluar_criterio(ecog(), "1", estudio("1")).estado == "coincide"  # entero único


def test_evaluar_criterio_da_no_coincide_cuando_el_valor_del_paciente_cae_fuera_del_rango():
    assert evaluar_criterio(ecog(), "2", estudio("0-1")).estado == "no_coincide"


def test_evaluar_criterio_acota_el_rango_del_estudio_cuando_el_catalogo_declara_limits():
    maximo_cero = ecog(limites=LimitesDeRegla(minimo=None, maximo=0))
    minimo_dos = ecog(limites=LimitesDeRegla(minimo=2, maximo=None))

    assert evaluar_criterio(maximo_cero, "1", estudio("0-1")).estado == "no_coincide"
    assert evaluar_criterio(maximo_cero, "0", estudio("0-1")).estado == "coincide"
    assert evaluar_criterio(minimo_dos, "1", estudio("0-3")).estado == "no_coincide"
    assert evaluar_criterio(minimo_dos, "2", estudio("0-3")).estado == "coincide"


def test_evaluar_criterio_da_parcial_cuando_el_rango_es_de_un_subgrupo_y_el_paciente_esta_dentro():
    evaluado = evaluar_criterio(ecog(), "1", estudio("0-1", subgrupo=True))

    assert evaluado.estado == "parcial"
    assert evaluado.valor_estudio == "0-1"


def test_evaluar_criterio_da_no_coincide_cuando_el_rango_es_de_un_subgrupo_y_el_paciente_esta_fuera():
    assert evaluar_criterio(ecog(), "3", estudio("0-1", subgrupo=True)).estado == "no_coincide"


def test_evaluar_criterio_no_da_parcial_cuando_la_condicion_es_rango_solapado():
    solapado = ecog(parcial_cuando="rango_solapado")

    assert evaluar_criterio(solapado, "1", estudio("0-1", subgrupo=True)).estado == "coincide"
    assert evaluar_criterio(solapado, "1", estudio("0-1")).estado == "coincide"


def test_evaluar_criterio_deja_desconocido_sin_causa_cuando_el_estadio_no_tiene_escala():
    estadio = criterio_de("rango", clave="estadio", campo="stage_value")

    evaluado = evaluar_criterio(estadio, "IIA", estudio("I–III"))

    assert estado_y_causa(evaluado) == ("desconocido", None)
    assert evaluado.motivo_interno == "sin_escala"
    assert (evaluado.valor_paciente, evaluado.valor_estudio) == ("IIA", "I–III")


def test_evaluar_criterio_deja_desconocido_cuando_el_paciente_no_es_entero_o_el_rango_no_se_lee():
    sin_entero = evaluar_criterio(ecog(campo="grade"), "Nottingham grado 2", estudio("1-3"))
    sin_rango = evaluar_criterio(ecog(), "1", estudio("bajo"))

    assert estado_y_causa(sin_entero) == ("desconocido", None)
    assert sin_entero.motivo_interno == "forma_no_comparable"
    assert estado_y_causa(sin_rango) == ("desconocido", None)
    assert sin_rango.motivo_interno == "forma_no_comparable"


def test_evaluar_criterio_da_no_coincide_cuando_el_rango_acotado_queda_vacio():
    vacio = ecog(limites=LimitesDeRegla(minimo=5, maximo=None))

    assert evaluar_criterio(vacio, "1", estudio("0-1")).estado == "no_coincide"


# --- pertenencia ---------------------------------------------------------------------------------------------------


def linea(**cambios: object) -> CriterioDeAplicabilidad:
    argumentos: dict[str, object] = {
        "clave": "linea_tratamiento",
        "entidad": "PriorTreatment",
        "campo": "line_number",
    }
    return criterio_de("pertenencia", **{**argumentos, **cambios})  # type: ignore[arg-type]


def test_evaluar_criterio_da_coincide_cuando_el_valor_del_paciente_es_un_elemento_de_la_lista():
    assert evaluar_criterio(linea(), "1", estudio("1, 2")).estado == "coincide"
    assert evaluar_criterio(linea(), "2", estudio("1;2")).estado == "coincide"


def test_evaluar_criterio_da_no_coincide_cuando_el_valor_del_paciente_no_esta_en_la_lista():
    assert evaluar_criterio(linea(), "3", estudio("1,2")).estado == "no_coincide"


def test_evaluar_criterio_compara_el_elemento_exacto_cuando_el_valor_es_prefijo_de_otro():
    assert evaluar_criterio(linea(), "1", estudio("10,11")).estado == "no_coincide"


def test_evaluar_criterio_da_parcial_cuando_pertenece_y_el_estudio_es_de_un_subgrupo():
    assert evaluar_criterio(linea(), "1", estudio("1,2", subgrupo=True)).estado == "parcial"
    assert evaluar_criterio(linea(), "3", estudio("1,2", subgrupo=True)).estado == "no_coincide"


def test_evaluar_criterio_deja_desconocido_cuando_la_pertenencia_recibe_un_valor_con_forma_de_rango():
    evaluado = evaluar_criterio(linea(), "1", estudio("1-2"))

    assert estado_y_causa(evaluado) == ("desconocido", None)
    assert evaluado.motivo_interno == "forma_no_comparable"
    assert estado_y_causa(evaluar_criterio(linea(), "IIA", estudio("I–III"))) == (
        "desconocido",
        None,
    )


def test_evaluar_criterio_no_confunde_con_rango_un_valor_con_guion_dentro_de_una_palabra():
    menopausia = criterio_de("pertenencia", clave="estado_menopausico")

    assert (
        evaluar_criterio(menopausia, "posmenopausica", estudio("pre-menopausica")).estado
        == "no_coincide"
    )


# --- causas y precedencia (design D5) ------------------------------------------------------------------------------


def test_evaluar_criterio_da_falta_en_paciente_cuando_no_hay_valor_del_paciente():
    evaluado = evaluar_criterio(her2(), None, estudio("positivo"))

    assert estado_y_causa(evaluado) == ("desconocido", "falta_en_paciente")
    assert evaluado.valor_paciente is None
    assert evaluado.valor_estudio == "positivo"


def test_evaluar_criterio_da_no_reportado_por_fuente_cuando_el_estudio_no_trae_valor():
    evaluado = evaluar_criterio(her2(), "3+ (IHQ)", None)

    assert estado_y_causa(evaluado) == ("desconocido", "no_reportado_por_fuente")
    assert (evaluado.valor_paciente, evaluado.valor_estudio) == ("3+ (IHQ)", None)


def test_evaluar_criterio_da_falta_en_paciente_cuando_faltan_ambos_valores():
    assert estado_y_causa(evaluar_criterio(her2(), None, None)) == (
        "desconocido",
        "falta_en_paciente",
    )


def test_evaluar_criterio_deja_desconocido_cuando_el_destino_es_una_lista_y_hay_ambos_valores():
    receptores = criterio_de(
        "pertenencia",
        clave="receptores_hormonales",
        entidad="Biomarker",
        campo="value",
        coincidencia={"name": ("RE", "RP")},
    )

    evaluado = evaluar_criterio(receptores, "RE: Positivo; RP: Negativo", estudio("positivo"))

    assert estado_y_causa(evaluado) == ("desconocido", None)
    assert evaluado.motivo_interno == "forma_no_comparable"


# --- evaluación de una fuente completa -----------------------------------------------------------------------------


def test_evaluar_criterio_de_fuente_lee_ambos_valores_cuando_el_destino_es_resoluble():
    criterio = her2(clave_de_estudio="biomarcadores.her2")

    evaluado = evaluar_criterio_de_fuente(
        criterio, A_M1, poblacion(biomarcadores={"her2": "positivo"})
    )

    assert evaluado == CriterioEvaluado(
        "estado_her2", "3+ (IHQ)", "positivo", "coincide", None, True
    )


def test_evaluar_criterio_de_fuente_deja_desconocido_sin_causa_cuando_el_destino_no_es_resoluble():
    criterio = criterio_de("igualdad", clave="x", entidad="Medication", campo="name")

    evaluado = evaluar_criterio_de_fuente(criterio, A_M1, poblacion(estudio="algo"))

    assert estado_y_causa(evaluado) == ("desconocido", None)
    assert evaluado.valor_paciente is None
    assert evaluado.motivo_interno == "destino_no_resoluble"


# --- conteos y población no comparable (RN-28) ---------------------------------------------------------------------


def evaluado(estado: str, *, excluyente: bool = False) -> CriterioEvaluado:
    return CriterioEvaluado("c", None, None, estado, None, excluyente)  # type: ignore[arg-type]


def test_contar_estados_cuenta_cada_estado_sin_ponderar():
    resumen = contar_estados(
        [
            evaluado("coincide"),
            evaluado("coincide", excluyente=True),
            evaluado("parcial"),
            evaluado("no_coincide"),
            evaluado("desconocido"),
            evaluado("desconocido"),
        ]
    )

    assert (resumen.coincide, resumen.parcial, resumen.no_coincide, resumen.desconocido) == (
        2,
        1,
        1,
        2,
    )


def test_contar_estados_devuelve_ceros_cuando_no_hay_criterios():
    resumen = contar_estados([])

    assert (resumen.coincide, resumen.parcial, resumen.no_coincide, resumen.desconocido) == (
        0,
        0,
        0,
        0,
    )


def test_poblacion_no_comparable_es_verdadera_cuando_un_excluyente_esta_en_no_coincide():
    assert poblacion_no_comparable([evaluado("no_coincide", excluyente=True)]) is True


def test_poblacion_no_comparable_es_falsa_cuando_el_no_coincide_no_es_excluyente_o_el_excluyente_no_es_no_coincide():
    assert poblacion_no_comparable([evaluado("no_coincide")]) is False
    assert poblacion_no_comparable([evaluado("desconocido", excluyente=True)]) is False
    assert poblacion_no_comparable([evaluado("parcial", excluyente=True)]) is False
    assert poblacion_no_comparable([]) is False
