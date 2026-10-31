"""RN-23 sobre los valores de población de la respuesta (L1D-299, US-233b AC-9).

La métrica «salidas prescriptivas = 0» debe cubrir ``studyPopulationValue`` y ``studyPopulationValues[].value``: son
texto GENERADO por el LLM de la ingesta (ADR-47) y se muestran al médico.
"""

from __future__ import annotations

import copy
import json
from typing import Any

import pytest

from app.evaluation.lenguaje_estricto import VerificadorEstricto
from app.evaluation.metricas.prescriptivas import medir_salida_mostrada
from app.evaluation.salida_generada import textos_de_respuesta
from app.infrastructure.lenguaje.terminos_prohibidos import cargar_lista_de_terminos
from app.schemas.generated.models import RagQueryInternalResponse
from tests.evaluation.conftest import RAIZ_REPO

EJEMPLO = RAIZ_REPO / "contracts" / "examples" / "rag-query-poblacion-lista.json"
CATALOGOS = RAIZ_REPO / "packages" / "clinical-catalogs"
PROHIBIDO = "recommended treatment"  # nivel A de terminos-prohibidos.json


def _respuesta(valores: list[str], valor_unico: str | None) -> RagQueryInternalResponse:
    cuerpo: dict[str, Any] = copy.deepcopy(json.loads(EJEMPLO.read_text(encoding="utf-8")))
    criterio = cuerpo["applicability"][0]["criteria"][0]
    criterio["studyPopulationValue"] = valor_unico
    criterio["studyPopulationValues"] = [
        {"value": v, "chunkId": "ch-test-1", "scope": "elegibilidad"} for v in valores
    ]
    return RagQueryInternalResponse.model_validate(cuerpo)


def _verificador() -> VerificadorEstricto:
    return VerificadorEstricto(cargar_lista_de_terminos(CATALOGOS))


@pytest.mark.ac("US-233b", 9)
def test_salida_prescriptiva_marca_un_valor_de_poblacion_con_termino_prohibido_sembrado() -> None:
    """Marca salida prescriptiva cuando un studyPopulationValues[].value o un studyPopulationValue contiene un término
    prohibido sembrado [US-233b AC-9]."""
    en_la_lista = medir_salida_mostrada(
        textos_de_respuesta(_respuesta([PROHIBIDO], None)), _verificador()
    )
    en_el_valor_unico = medir_salida_mostrada(
        textos_de_respuesta(_respuesta(["premenopausal women"], PROHIBIDO)), _verificador()
    )

    assert [c for c, _ in en_la_lista.campos] == ["studyPopulationValues[].value"]
    assert [c for c, _ in en_el_valor_unico.campos] == ["studyPopulationValue"]


def test_salida_prescriptiva_no_marca_valores_de_poblacion_limpios() -> None:
    limpia = medir_salida_mostrada(
        textos_de_respuesta(_respuesta(["premenopausal women"], "premenopausal women")),
        _verificador(),
    )

    assert limpia.campos_con_termino == 0
