"""Estados por criterio de la demo EN VIVO (L1D-297, guía §3): la población versionada de ``data/raw/seed/`` evaluada con las
reglas puras y el catálogo real para el paciente (a) del seed. Sin LLM ni red: es lo que la UI muestra con los metadatos
cargados por ``levantar.sh`` cuando la opción cita el fragmento de elegibilidad."""

import json
from pathlib import Path

import pytest

from app.domain.aplicabilidad_tipos import ValorDePoblacion
from app.domain.applicability_rules import estado_de_poblacion
from app.infrastructure.catalogo_clinico.aplicabilidad import cargar_criterios_de_aplicabilidad
from app.infrastructure.catalogo_clinico.manifiesto import cargar_catalogo_del_manifiesto

RAIZ = Path(__file__).resolve().parents[4]
CATALOGO = RAIZ / "packages" / "clinical-catalogs"
POBLACION = RAIZ / "data" / "raw" / "seed" / "poblacion-verificada.json"

# Paciente (a) del seed: HER2 3+, RE positivo, IIA, ECOG 1, posmenopáusica (``prisma/seed/pacientes/a.ts``).
PACIENTE_A = {
    "estado_her2": "3+ (IHQ)",
    "estado_menopausico": "posmenopausica",
}
CLAVE_DE_POBLACION = {
    "estado_her2": "biomarcadores.her2",
    "estado_menopausico": "estado_menopausico",
}
DISENO = {"nci-mama-hp-en": "guia", "pmc-mama-tamoxifeno-eca": "eca"}


def _estado(documento: str, criterio: str):
    criterios = cargar_criterios_de_aplicabilidad(
        CATALOGO, cargar_catalogo_del_manifiesto(CATALOGO).tipos_de_cancer()
    )
    definicion = next(c for c in criterios.criterios("mama") if c.clave == criterio)
    entrada = next(
        e
        for document_id, e in json.loads(POBLACION.read_text(encoding="utf-8"))[
            "documentos"
        ].items()
        if document_id.split("@")[0] == documento
    )
    valores = [
        ValorDePoblacion(v["value"], v["scope"], v["chunkId"])  # type: ignore[arg-type]
        for v in entrada["population_criteria"][CLAVE_DE_POBLACION[criterio]]
    ]
    return estado_de_poblacion(
        valores, PACIENTE_A[criterio], definicion, diseno_de_la_fuente=DISENO[documento]
    )


@pytest.mark.parametrize(
    ("documento", "criterio", "estado", "motivo"),
    [
        ("nci-mama-hp-en", "estado_her2", "coincide", None),
        ("pmc-mama-tamoxifeno-eca", "estado_menopausico", "parcial", "inclusiva"),
    ],
)
def test_la_poblacion_versionada_da_coincide_y_parcial_para_el_paciente_a_cuando_se_evalua_con_el_catalogo_real(
    documento, criterio, estado, motivo
):
    proyeccion = _estado(documento, criterio)

    assert (proyeccion.estado, proyeccion.motivo_parcial) == (estado, motivo)
