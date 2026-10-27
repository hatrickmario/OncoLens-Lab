"""`POST /rag/query`, procedencia de los datos del paciente en el prompt (US-065 AC-5 / L1D-181): RN-07, RN-11.

El ``LlmEvidenceGenerator`` REAL recibe un ``FakeLlmClient`` que captura el prompt; cada respuesta la valida contra el
spec del proveedor el hook de `verificacion_proveedor.py` (US-214). El contexto sale de ``contracts/examples``: su
receptor de estrógeno (``r3``) llega ``requiere_revision`` y el resto de los biomarcadores, ``auto_aceptado``.
"""

import re

from tests.support.llm_falso import FakeLlmClient
from tests.support.recuperacion import Q_HER2, solicitud_de
from tests.support.recuperacion_alias import entorno_con_alias

VERSION_DEL_PROMPT = re.compile(r"^rag-query@0\.4\.0(\+aplicabilidad-texto@0\.1\.0)?$")
LINEA_HER2 = "- HER2 3+ (IHQ)"
LINEA_RE = "- Receptor de estrógeno Positivo (80%)"


def _consultar(*, conflicto: bool = False):
    solicitud = solicitud_de(Q_HER2)
    if conflicto:
        solicitud["clinicalContext"]["biomarkers"][1]["provenance"]["conflict"] = True
    llm = FakeLlmClient("LLM-OK")
    respuesta = entorno_con_alias(llm).consultar(solicitud)
    assert respuesta.status_code == 200
    (prompt,) = llm.prompts
    return respuesta.json(), prompt.splitlines(), solicitud


def test_rag_query_etiqueta_el_dato_sin_verificar_en_el_prompt_cuando_el_contexto_lo_marca_requiere_revision():
    cuerpo, lineas, _ = _consultar()

    assert f"{LINEA_RE} (sin verificar)" in lineas
    assert LINEA_HER2 in lineas
    assert VERSION_DEL_PROMPT.match(cuerpo["meta"]["promptVersion"])


def test_rag_query_etiqueta_el_dato_en_conflicto_sin_la_etiqueta_de_sin_verificar():
    _, lineas, _ = _consultar(conflicto=True)

    assert f"{LINEA_RE} (en conflicto)" in lineas
    datos = [linea for linea in lineas if linea.startswith("- ")]
    assert not any("(sin verificar)" in linea for linea in datos)


def test_rag_query_no_envia_al_llm_el_seudonimo_ni_los_data_ref_cuando_etiqueta_la_procedencia():
    _, lineas, solicitud = _consultar()

    prompt = "\n".join(lineas)
    assert solicitud["clinicalContext"]["pseudoPatientId"] not in prompt
    assert re.search(r"\br\d+\b", prompt) is None
