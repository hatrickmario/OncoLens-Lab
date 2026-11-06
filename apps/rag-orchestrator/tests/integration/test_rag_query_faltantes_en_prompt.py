"""`POST /rag/query`, datos críticos faltantes en el prompt de generación (US-116 / L1D-113 AC-1 y AC-5): FR-23, RN-11.

El ``LlmEvidenceGenerator`` REAL recibe un ``FakeLlmClient`` que captura el prompt. Cada clave de
``missingCriticalData`` llega al bloque «Datos del paciente» como ``- <etiqueta del catálogo>: desconocido`` (la etiqueta
en español de ``datos-criticos.json``, nunca la clave cruda) y sin faltantes no aparece ninguna línea «desconocido».
Cada respuesta se valida contra el spec del proveedor (hook de ``verificacion_proveedor.py``, US-214).
"""

from pathlib import Path

import pytest

from app.domain.lenguaje import ListaTerminos, check_prohibited_terms
from tests.support.llm_falso import FakeLlmClient
from tests.support.recuperacion import Q_HER2, solicitud_de
from tests.support.recuperacion_alias import entorno_con_alias

LISTA = (
    Path(__file__).resolve().parents[4]
    / "packages"
    / "clinical-catalogs"
    / "lenguaje"
    / "terminos-prohibidos.json"
)
LINEA_ESTADO_MENOPAUSICO = "- Estado menopáusico: desconocido"
LINEA_KI67 = "- Ki-67: desconocido"
INSTRUCCION = "sin dato registrado (desconocido)"


def _consultar(faltantes: list[str]):
    solicitud = solicitud_de(Q_HER2)
    solicitud["clinicalContext"]["missingCriticalData"] = faltantes
    llm = FakeLlmClient("LLM-OK")
    respuesta = entorno_con_alias(llm).consultar(solicitud)
    assert respuesta.status_code == 200
    (prompt,) = llm.prompts
    return respuesta.json(), prompt, solicitud


def _bloque_de_datos(prompt: str) -> list[str]:
    lineas = prompt.splitlines()
    inicio = next(i for i, linea in enumerate(lineas) if linea.startswith("Datos del paciente"))
    fin = lineas.index("Fragmentos:")
    return [linea for linea in lineas[inicio + 1 : fin] if linea]


@pytest.mark.ac("US-116", 1)
def test_rag_query_declara_los_faltantes_como_desconocido_en_el_bloque_de_datos_con_su_etiqueta():
    cuerpo, prompt, solicitud = _consultar(["estado_menopausico", "ki67"])

    bloque = _bloque_de_datos(prompt)
    assert bloque[-2:] == [LINEA_ESTADO_MENOPAUSICO, LINEA_KI67]
    assert "estado_menopausico" not in prompt
    assert "ki67" not in prompt
    assert solicitud["clinicalContext"]["pseudoPatientId"] not in prompt
    assert cuerpo["meta"]["promptVersion"] == "rag-query@0.9.0"


@pytest.mark.ac("US-116", 1)
def test_rag_query_pide_describir_los_faltantes_como_sin_dato_registrado_y_no_como_no_disponibles():
    _, prompt, _ = _consultar(["estado_menopausico", "ki67"])

    instrucciones = prompt.split("Pregunta:")[0]
    assert INSTRUCCION in " ".join(instrucciones.split())
    assert "no disponibles" not in prompt.lower()
    lista = ListaTerminos.model_validate_json(LISTA.read_text(encoding="utf-8"))
    assert check_prohibited_terms(prompt, lista, niveles=("A", "B")) == []


@pytest.mark.ac("US-116", 5)
def test_rag_query_no_agrega_lineas_desconocido_al_bloque_de_datos_cuando_no_hay_faltantes():
    _, prompt, _ = _consultar([])

    bloque = _bloque_de_datos(prompt)
    assert not any("desconocido" in linea for linea in bloque)
    assert bloque
    assert all(linea.startswith("- ") for linea in bloque)
    assert not any(linea.endswith(": desconocido") for linea in prompt.splitlines())


def test_rag_query_conserva_el_orden_de_llegada_de_los_faltantes_en_el_bloque():
    _, prompt, _ = _consultar(["ki67", "estado_menopausico"])

    assert _bloque_de_datos(prompt)[-2:] == [LINEA_KI67, LINEA_ESTADO_MENOPAUSICO]
