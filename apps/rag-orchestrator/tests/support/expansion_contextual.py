"""Apoyo de los tests del segundo loop contextual (US-271, ADR-52): léxico y catálogo reales, fixture compartido y preguntas.

El léxico y el catálogo de términos salen del catálogo versionado del repositorio (``packages/clinical-catalogs``); las
preguntas, de datasets sintéticos; los casos, del fixture ``temas-del-caso.json`` que comparte con el panel conversacional.
Solo datos sintéticos.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import yaml

from app.domain.terminos_del_caso import CasoParaTerminos
from app.infrastructure.catalogo_clinico.terminos_del_caso import (
    cargar_catalogo_de_terminos,
    cargar_marcos_de_pregunta,
)
from tests.support.contract import CATALOGOS, RAIZ_REPOSITORIO

DATASET = RAIZ_REPOSITORIO / "data" / "eval" / "s5-corpus-ampliado"
FIXTURE_DE_TEMAS = CATALOGOS / "test" / "fixtures" / "temas-del-caso.json"
TIPOS = ("mama", "prostata")

LEXICO = cargar_marcos_de_pregunta(CATALOGOS)
CATALOGO_DE_TERMINOS = cargar_catalogo_de_terminos(CATALOGOS, TIPOS)


def preguntas_de_la_medicion() -> list[dict[str, Any]]:
    """Las 60 preguntas sintéticas de la medición de ADR-52 (22 genéricas, 24 con tema y 14 controles)."""
    contenido = yaml.safe_load((DATASET / "preguntas-contextuales.yaml").read_text("utf-8"))
    return contenido["preguntas"]


def preguntas_de_s5() -> list[str]:
    """Las 69 preguntas sintéticas de ``s5-corpus-ampliado``: todas con tema propio."""
    contenido = yaml.safe_load((DATASET / "preguntas.yaml").read_text("utf-8"))
    return [p["pregunta"] for p in contenido["preguntas"]]


def casos_del_fixture() -> list[dict[str, Any]]:
    return json.loads(FIXTURE_DE_TEMAS.read_text("utf-8"))["casos"]


def caso_desde_contexto_clinico(contexto: dict[str, Any]) -> CasoParaTerminos:
    """El ``CasoParaTerminos`` de un ``clinicalContext`` desidentificado del fixture compartido."""
    diagnostico = contexto["diagnosis"]
    return CasoParaTerminos(
        tipo_de_cancer=diagnostico["cancerType"],
        sistema_de_estadificacion=diagnostico["stagingSystem"],
        estadio=diagnostico["stageValue"],
        grado=diagnostico["grade"],
        biomarcadores=tuple((b["biomarkerName"], b["value"]) for b in contexto["biomarkers"]),
    )


def caso_desde_resumen_del_paciente(resumen: dict[str, Any]) -> CasoParaTerminos:
    """El ``CasoParaTerminos`` de un ``PatientSummary`` (``diagnosis`` + ``recentBiomarkers``): la otra forma de entrada."""
    diagnostico = resumen["diagnosis"]
    return CasoParaTerminos(
        tipo_de_cancer=diagnostico["cancerType"],
        sistema_de_estadificacion=diagnostico["stagingSystem"],
        estadio=diagnostico["stageValue"],
        grado=diagnostico["grade"],
        biomarcadores=tuple((b["name"], b["value"]) for b in resumen["recentBiomarkers"]),
    )


def ruta_del_fixture() -> Path:
    return FIXTURE_DE_TEMAS
