"""Criterios de aplicabilidad armados como los lee el catálogo de FX-08b-c (sinónimos, marcadores, escala y grupos) para
probar las reglas puras de la población en lista (US-243) sin tocar disco."""

import dataclasses
from types import MappingProxyType

from app.domain.criterios_aplicabilidad import (
    CriterioDeAplicabilidad,
    DestinoDelCriterio,
    ReglaDeAplicabilidad,
    ReglasDePoblacion,
)

MARCADORES = ("solo", "exclusivamente", "only", "exclusively")


def _criterio(
    clave: str,
    *,
    operador: str = "pertenencia",
    parcial: str = "solo_subgrupo",
    entidad: str = "ClinicalAttribute",
    campo: str = "value",
    coincidencia: dict[str, tuple[str, ...]] | None = None,
    equivalencias: dict[str, tuple[str, ...]] | None = None,
    poblacion: ReglasDePoblacion | None = None,
) -> CriterioDeAplicabilidad:
    return CriterioDeAplicabilidad(
        clave=clave,
        tipo_de_cancer="mama",
        clave_de_estudio=clave,
        etiqueta_es=clave,
        etiqueta_en=None,
        destino=DestinoDelCriterio(entidad, campo, MappingProxyType(coincidencia or {})),
        es_excluyente=False,
        regla=ReglaDeAplicabilidad(
            operador,  # type: ignore[arg-type]
            parcial,  # type: ignore[arg-type]
            MappingProxyType(equivalencias or {}),
            None,
        ),
        estado_de_revision="propuesta",
        poblacion=poblacion or ReglasDePoblacion(),
    )


MENOPAUSIA = _criterio(
    "estado_menopausico",
    poblacion=ReglasDePoblacion(
        marcadores_de_restriccion=MARCADORES,
        sinonimos=MappingProxyType(
            {
                "premenopausica": ("premenopausal women", "premenopáusica"),
                "postmenopausica": ("postmenopausal women", "posmenopáusica"),
            }
        ),
    ),
)
HER2 = _criterio(
    "estado_her2",
    operador="igualdad",
    entidad="Biomarker",
    coincidencia={"name": ("HER2",)},
    equivalencias={"positivo": ("3+",)},
    poblacion=ReglasDePoblacion(
        sinonimos=MappingProxyType(
            {"positivo": ("HER2-positive (IHC 3+)",), "negativo": ("HER2-negative",)}
        )
    ),
)
ECOG = _criterio(
    "ecog",
    operador="rango",
    entidad="Diagnosis",
    campo="performance_value",
    coincidencia={"performance_scale": ("ECOG",)},
)
RECEPTORES = _criterio(
    "receptores_hormonales",
    entidad="Biomarker",
    coincidencia={"name": ("RE", "RP")},
)
ESTADIO_SIN_ESCALA = _criterio(
    "estadio", operador="rango", parcial="rango_solapado", entidad="Diagnosis", campo="stage_value"
)
ESTADIO_CON_ESCALA = dataclasses.replace(
    ESTADIO_SIN_ESCALA,
    poblacion=ReglasDePoblacion(
        escala=("IA", "IB", "IIA", "IIB", "IIIA"),
        grupos=MappingProxyType({"II": ("IIA", "IIB")}),
    ),
)
