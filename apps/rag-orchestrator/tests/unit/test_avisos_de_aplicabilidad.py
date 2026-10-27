"""Causa del desconocido y aviso del dato del paciente (US-124 / L1D-129): FR-25, RN-26, RN-07.

Reglas puras de ``domain/``, sin adapters. El aviso nunca altera el estado calculado (RN-26).
"""

import pytest

from app.application.contexto_del_paciente import contexto_del_paciente
from app.domain.aplicabilidad_tipos import (
    AtributoDelPaciente,
    BiomarcadorDelPaciente,
    ContextoDelPaciente,
    PoblacionDelEstudio,
    ProcedenciaDelDato,
    TratamientoPrevioDelPaciente,
    ValorDelEstudio,
)
from app.domain.applicability_rules import (
    aviso_dato_paciente,
    causa_de_desconocido,
    evaluar_criterio_de_fuente,
)
from app.domain.criterios_aplicabilidad import (
    CriterioDeAplicabilidad,
    DestinoDelCriterio,
    ReglaDeAplicabilidad,
)
from app.prompts.rag_query import (
    ETIQUETA_EN_CONFLICTO,
    ETIQUETA_SIN_VERIFICAR,
    etiqueta_de_procedencia,
)
from app.schemas.generated.models import Provenance, RagQueryInternalRequest
from tests.support.aplicabilidad import a_m1_conflicto, solicitud_a_m1

VERIFICADO = ProcedenciaDelDato()
SIN_VERIFICAR = ProcedenciaDelDato(requiere_revision=True)
EN_CONFLICTO = ProcedenciaDelDato(requiere_revision=True, en_conflicto=True)
ESTUDIO = ValorDelEstudio("positivo")

# --- causa_de_desconocido (FR-25, D2) ------------------------------------------------------------------------------


def test_causa_de_desconocido_es_falta_en_paciente_cuando_el_paciente_no_tiene_el_dato():
    assert causa_de_desconocido(None, ESTUDIO) == "falta_en_paciente"


def test_causa_de_desconocido_es_no_reportado_por_fuente_cuando_el_estudio_no_trae_valor():
    assert causa_de_desconocido("3+ (IHQ)", None) == "no_reportado_por_fuente"


def test_causa_de_desconocido_prefiere_falta_en_paciente_cuando_faltan_ambos_valores():
    assert causa_de_desconocido(None, None) == "falta_en_paciente"


def test_causa_de_desconocido_es_none_cuando_ambos_valores_estan_presentes():
    assert causa_de_desconocido("3+ (IHQ)", ESTUDIO) is None


# --- aviso_dato_paciente (RN-26, RN-07, D3) ------------------------------------------------------------------------


def test_aviso_dato_paciente_es_none_cuando_el_dato_esta_verificado():
    assert aviso_dato_paciente((VERIFICADO,)) is None


def test_aviso_dato_paciente_es_sin_verificar_cuando_el_dato_requiere_revision():
    assert aviso_dato_paciente((SIN_VERIFICAR,)) == "sin_verificar"


def test_aviso_dato_paciente_es_en_conflicto_y_gana_a_sin_verificar_cuando_hay_conflicto():
    assert aviso_dato_paciente((EN_CONFLICTO,)) == "en_conflicto"
    assert aviso_dato_paciente((SIN_VERIFICAR, EN_CONFLICTO)) == "en_conflicto"


def test_aviso_dato_paciente_es_faltante_cuando_no_hay_ningun_dato():
    assert aviso_dato_paciente(()) == "faltante"


def test_aviso_dato_paciente_toma_la_procedencia_mas_fuerte_cuando_el_destino_reune_varios_componentes():
    assert aviso_dato_paciente((VERIFICADO, SIN_VERIFICAR)) == "sin_verificar"
    assert aviso_dato_paciente((VERIFICADO, VERIFICADO)) is None


# --- paridad con la etiqueta del prompt (L1D-181, RN-07) -----------------------------------------------------------

REVISIONES = ("verificado", "corregido", "auto_aceptado", "requiere_revision")
TABLA_DE_PROCEDENCIA = [
    (revision, conflicto, aviso, etiqueta)
    for revision in REVISIONES
    for conflicto in (False, True)
    for aviso, etiqueta in [
        (
            ("en_conflicto", ETIQUETA_EN_CONFLICTO)
            if conflicto
            else (
                ("sin_verificar", ETIQUETA_SIN_VERIFICAR)
                if revision == "requiere_revision"
                else (None, None)
            )
        )
    ]
]


def _procedencia_generada(revision: str, conflicto: bool) -> Provenance:
    return Provenance.model_validate(
        {
            "entryMethod": "ocr",
            "extractionConfidence": "media",
            "reviewStatus": revision,
            "conflict": conflicto,
        }
    )


@pytest.mark.parametrize(("revision", "conflicto", "aviso", "etiqueta"), TABLA_DE_PROCEDENCIA)
def test_patient_data_warning_sigue_la_tabla_de_procedencia_cuando_se_traduce_la_provenance(
    revision: str, conflicto: bool, aviso: str | None, etiqueta: str | None
):
    solicitud = solicitud_a_m1()
    solicitud["clinicalContext"]["biomarkers"][0]["provenance"] = {
        "entryMethod": "ocr",
        "extractionConfidence": "media",
        "reviewStatus": revision,
        "conflict": conflicto,
    }
    contexto = contexto_del_paciente(
        RagQueryInternalRequest.model_validate(solicitud).clinicalContext
    )
    her2 = next(b for b in contexto.biomarcadores if b.nombre == "HER2")

    assert aviso_dato_paciente((her2.procedencia,)) == aviso


@pytest.mark.parametrize(("revision", "conflicto", "aviso", "etiqueta"), TABLA_DE_PROCEDENCIA)
def test_etiqueta_de_procedencia_sigue_la_misma_tabla_cuando_se_etiqueta_el_dato_del_prompt(
    revision: str, conflicto: bool, aviso: str | None, etiqueta: str | None
):
    assert etiqueta_de_procedencia(_procedencia_generada(revision, conflicto)) == etiqueta


# --- composición por criterio (evaluar_criterio_de_fuente) ---------------------------------------------------------


def _criterio(
    clave: str, entidad: str, campo: str, estudio: str = "estudio", **coincidencia: tuple[str, ...]
) -> CriterioDeAplicabilidad:
    return CriterioDeAplicabilidad(
        clave=clave,
        tipo_de_cancer="mama",
        clave_de_estudio=estudio,
        etiqueta_es="Criterio de prueba",
        etiqueta_en=None,
        destino=DestinoDelCriterio(entidad, campo, coincidencia),
        es_excluyente=False,
        regla=ReglaDeAplicabilidad("pertenencia", "solo_subgrupo", {}, None),
        estado_de_revision="propuesta",
    )


def _poblacion(**criterios: object) -> PoblacionDelEstudio:
    return PoblacionDelEstudio("fuente_estructurada", criterios)


def test_evaluar_criterio_de_fuente_copia_el_aviso_del_dato_que_se_compara_cuando_el_dato_esta_sin_verificar():
    contexto = ContextoDelPaciente(
        atributos=(AtributoDelPaciente("estado_menopausico", "posmenopausica", 2, SIN_VERIFICAR),)
    )
    criterio = _criterio(
        "estado_menopausico", "ClinicalAttribute", "value", attribute_key=("estado_menopausico",)
    )

    evaluado = evaluar_criterio_de_fuente(criterio, contexto, _poblacion(estudio="posmenopausica"))

    assert (evaluado.estado, evaluado.aviso) == ("coincide", "sin_verificar")


def test_evaluar_criterio_de_fuente_avisa_con_el_dato_elegido_y_no_con_los_antiguos_cuando_hay_varios_valores():
    contexto = ContextoDelPaciente(
        biomarcadores=(
            BiomarcadorDelPaciente("HER2", "2+", 12, EN_CONFLICTO),
            BiomarcadorDelPaciente("HER2", "3+ (IHQ)", 1, VERIFICADO),
        )
    )
    criterio = _criterio("estado_her2", "Biomarker", "value", name=("HER2",))

    evaluado = evaluar_criterio_de_fuente(criterio, contexto, _poblacion(estudio="positivo"))

    assert (evaluado.valor_paciente, evaluado.aviso) == ("3+ (IHQ)", None)


def test_evaluar_criterio_de_fuente_avisa_en_conflicto_cuando_dos_her2_sembrados_estan_en_conflicto():
    contexto = contexto_del_paciente(
        RagQueryInternalRequest.model_validate(a_m1_conflicto()).clinicalContext
    )
    criterio = _criterio("estado_her2", "Biomarker", "value", name=("HER2",))

    evaluado = evaluar_criterio_de_fuente(criterio, contexto, _poblacion(estudio="positivo"))

    assert evaluado.aviso == "en_conflicto"


def test_evaluar_criterio_de_fuente_reune_las_procedencias_de_cada_componente_cuando_el_destino_es_re_rp():
    contexto = ContextoDelPaciente(
        biomarcadores=(
            BiomarcadorDelPaciente("RE", "Positivo", 1, VERIFICADO),
            BiomarcadorDelPaciente("RP", "Negativo", 1, SIN_VERIFICAR),
        )
    )
    criterio = _criterio("receptores_hormonales", "Biomarker", "value", name=("RE", "RP"))

    evaluado = evaluar_criterio_de_fuente(criterio, contexto, _poblacion(estudio="positivo"))

    assert evaluado.aviso == "sin_verificar"


def test_evaluar_criterio_de_fuente_avisa_faltante_sin_valor_cuando_el_destino_no_tiene_dato():
    criterio = _criterio(
        "estado_menopausico", "ClinicalAttribute", "value", attribute_key=("estado_menopausico",)
    )

    evaluado = evaluar_criterio_de_fuente(
        criterio, ContextoDelPaciente(), _poblacion(estudio="ambos")
    )

    assert (evaluado.estado, evaluado.causa) == ("desconocido", "falta_en_paciente")
    assert (evaluado.valor_paciente, evaluado.aviso) == (None, "faltante")


def test_evaluar_criterio_de_fuente_ignora_el_dato_presente_cuando_su_clave_figura_en_missing_critical_data():
    contexto = ContextoDelPaciente(
        atributos=(AtributoDelPaciente("estado_menopausico", "posmenopausica", 2, VERIFICADO),),
        datos_criticos_faltantes=frozenset({"estado_menopausico"}),
    )
    criterio = _criterio(
        "estado_menopausico", "ClinicalAttribute", "value", attribute_key=("estado_menopausico",)
    )

    evaluado = evaluar_criterio_de_fuente(criterio, contexto, _poblacion(estudio="posmenopausica"))

    assert (evaluado.estado, evaluado.causa) == ("desconocido", "falta_en_paciente")
    assert (evaluado.valor_paciente, evaluado.aviso) == (None, "faltante")


def test_evaluar_criterio_de_fuente_toma_la_procedencia_del_diagnostico_cuando_el_destino_es_el_estadio():
    contexto = ContextoDelPaciente(
        valor_de_estadio="IIA", procedencia_del_diagnostico=SIN_VERIFICAR
    )
    criterio = _criterio("estadio", "Diagnosis", "stage_value")

    evaluado = evaluar_criterio_de_fuente(criterio, contexto, _poblacion(estudio="I-III"))

    assert (evaluado.valor_paciente, evaluado.aviso) == ("IIA", "sin_verificar")


def test_evaluar_criterio_de_fuente_no_avisa_nada_cuando_el_destino_no_es_resoluble():
    criterio = _criterio("x", "Medication", "name")

    evaluado = evaluar_criterio_de_fuente(criterio, ContextoDelPaciente(), _poblacion(estudio="a"))

    assert (evaluado.causa, evaluado.aviso) == (None, None)


def test_evaluar_criterio_de_fuente_conserva_el_estado_calculado_cuando_el_dato_esta_en_conflicto():
    verificado = ContextoDelPaciente(
        tratamientos_previos=(TratamientoPrevioDelPaciente(1, 6, VERIFICADO),)
    )
    en_conflicto = ContextoDelPaciente(
        tratamientos_previos=(TratamientoPrevioDelPaciente(1, 6, EN_CONFLICTO),)
    )
    criterio = _criterio("linea_tratamiento", "PriorTreatment", "line_number")

    a = evaluar_criterio_de_fuente(criterio, verificado, _poblacion(estudio="1"))
    b = evaluar_criterio_de_fuente(criterio, en_conflicto, _poblacion(estudio="1"))

    assert a.estado == b.estado == "coincide"
    assert (a.aviso, b.aviso) == (None, "en_conflicto")


def test_contexto_del_paciente_traduce_provenance_y_missing_critical_data_cuando_el_contexto_los_trae():
    solicitud = solicitud_a_m1()
    solicitud["clinicalContext"]["diagnosis"]["provenance"]["reviewStatus"] = "requiere_revision"
    solicitud["clinicalContext"]["diagnosis"]["provenance"]["conflict"] = True

    contexto = contexto_del_paciente(
        RagQueryInternalRequest.model_validate(solicitud).clinicalContext
    )

    assert contexto.procedencia_del_diagnostico == EN_CONFLICTO
    assert contexto.datos_criticos_faltantes == frozenset({"estado_menopausico", "ki67"})
    assert contexto.biomarcadores[0].procedencia == VERIFICADO
