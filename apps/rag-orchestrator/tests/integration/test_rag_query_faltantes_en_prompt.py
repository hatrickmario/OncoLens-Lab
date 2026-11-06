"""`POST /rag/query`, datos críticos faltantes en el prompt de generación (US-116 / L1D-113 AC-1 y AC-5): FR-23, RN-11.

El ``LlmEvidenceGenerator`` REAL recibe un ``FakeLlmClient`` que captura el prompt. Cada clave de
``missingCriticalData`` llega al bloque «Datos del paciente» como ``- <etiqueta del catálogo>: desconocido`` (la etiqueta
en español de ``datos-criticos.json``, nunca la clave cruda) y sin faltantes no aparece ninguna línea «desconocido».
Cada respuesta se valida contra el spec del proveedor (hook de ``verificacion_proveedor.py``, US-214).
"""

from pathlib import Path

import pytest

from app.application.prompt_builder import PromptSeparado
from app.domain.lenguaje import ListaTerminos, check_prohibited_terms
from tests.support.llm_falso import FakeLlmClient
from tests.support.prompt_separado import bloques, texto_completo
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
    (usuario,), (sistema,) = llm.usuarios, llm.sistemas
    return respuesta.json(), PromptSeparado(sistema or "", usuario, ""), solicitud


def _bloque_de_datos(prompt: PromptSeparado) -> list[str]:
    (datos,) = [b for b in bloques(prompt.usuario) if b.etiqueta == "patient_data"]
    return [linea for linea in datos.texto.splitlines() if linea]


@pytest.mark.ac("US-116", 1)
def test_rag_query_declara_los_faltantes_como_desconocido_en_el_bloque_de_datos_con_su_etiqueta():
    cuerpo, prompt, solicitud = _consultar(["estado_menopausico", "ki67"])

    bloque = _bloque_de_datos(prompt)
    assert bloque[-2:] == [LINEA_ESTADO_MENOPAUSICO, LINEA_KI67]
    completo = texto_completo(prompt)
    assert "estado_menopausico" not in completo
    assert "ki67" not in completo
    assert solicitud["clinicalContext"]["pseudoPatientId"] not in completo
    assert cuerpo["meta"]["promptVersion"] == "rag-query@0.10.0"


@pytest.mark.ac("US-116", 1)
def test_rag_query_pide_describir_los_faltantes_como_sin_dato_registrado_y_no_como_no_disponibles():
    _, prompt, _ = _consultar(["estado_menopausico", "ki67"])

    assert INSTRUCCION in " ".join(prompt.sistema.split())
    assert "no disponibles" not in texto_completo(prompt).lower()
    lista = ListaTerminos.model_validate_json(LISTA.read_text(encoding="utf-8"))
    assert check_prohibited_terms(texto_completo(prompt), lista, niveles=("A", "B")) == []


@pytest.mark.ac("US-116", 5)
def test_rag_query_no_agrega_lineas_desconocido_al_bloque_de_datos_cuando_no_hay_faltantes():
    _, prompt, _ = _consultar([])

    bloque = _bloque_de_datos(prompt)
    assert not any("desconocido" in linea for linea in bloque)
    assert bloque
    assert all(linea.startswith("- ") for linea in bloque)
    assert not any(linea.endswith(": desconocido") for linea in prompt.usuario.splitlines())


def test_rag_query_conserva_el_orden_de_llegada_de_los_faltantes_en_el_bloque():
    _, prompt, _ = _consultar(["ki67", "estado_menopausico"])

    assert _bloque_de_datos(prompt)[-2:] == [LINEA_KI67, LINEA_ESTADO_MENOPAUSICO]
