"""Adapter ``LlmApplicabilityTextProposer`` y prompt ``aplicabilidad-texto@0.1.0`` (US-123, design D6, tarea 2.11).

El LLM es un ``LlmClient`` guionado (borde): devuelve el JSON crudo, o falla como el real (``FalloDelLlm``).
"""

import asyncio
import json
from collections.abc import Mapping
from pathlib import Path
from typing import Any

import pytest

from app.application.errores import LlmLocalNoDisponibleError
from app.application.ports import FalloDelLlm
from app.domain.applicability_text import (
    ChunkDeFuente,
    CriterioPendiente,
    FuenteParaProponer,
    PropuestaDePoblacion,
)
from app.domain.lenguaje import ListaTerminos, check_prohibited_terms
from app.infrastructure.llm.proponente_de_aplicabilidad import LlmApplicabilityTextProposer
from app.prompts.aplicabilidad_texto import (
    PLANTILLA_APLICABILIDAD_TEXTO,
    VERSION_DEL_PROMPT_APLICABILIDAD,
    construir_prompt_aplicabilidad_texto,
)

RAIZ = Path(__file__).resolve().parents[4]
LISTA = RAIZ / "packages" / "clinical-catalogs" / "lenguaje" / "terminos-prohibidos.json"
HER2 = CriterioPendiente("estado_her2", "Estado de HER2", "HER2 status")


def fuente(external_id: str = "CDR-A2", *chunks: ChunkDeFuente) -> FuenteParaProponer:
    return FuenteParaProponer(
        external_id, (HER2,), chunks or (ChunkDeFuente("ch-a2-1", "HER2-negative disease."),)
    )


class LlmGuionado:
    def __init__(self, respuesta: str | Exception) -> None:
        self._respuesta = respuesta
        self.prompts: list[str] = []

    async def completar_json(self, prompt: str, esquema: Mapping[str, Any]) -> str:
        self.prompts.append(prompt)
        if isinstance(self._respuesta, Exception):
            raise self._respuesta
        return self._respuesta


def salida(*propuestas: dict[str, Any]) -> str:
    return json.dumps({"proposals": list(propuestas)})


def propuesta_cruda(**cambios: Any) -> dict[str, Any]:
    base = {
        "source": "S1",
        "criterion": "estado_her2",
        "value": "HER2 negativo",
        "chunkId": "ch-a2-1",
    }
    return {**base, **cambios}


def proponer(llm: LlmGuionado, *fuentes: FuenteParaProponer, presupuesto: int = 12000):
    adapter = LlmApplicabilityTextProposer(llm, presupuesto)
    return asyncio.run(adapter.proponer(fuentes))


def test_proponer_traduce_el_rotulo_de_la_fuente_a_su_external_id_y_devuelve_solo_propuestas():
    llm = LlmGuionado(salida(propuesta_cruda(source="S2"), propuesta_cruda(source="S1")))

    resultado = proponer(llm, fuente("CDR-A1"), fuente("CDR-A2"))

    assert resultado == (
        PropuestaDePoblacion("CDR-A2", "estado_her2", "HER2 negativo", "ch-a2-1"),
        PropuestaDePoblacion("CDR-A1", "estado_her2", "HER2 negativo", "ch-a2-1"),
    )


def test_proponer_descarta_patient_value_y_status_que_el_llm_agregue():
    cruda = propuesta_cruda(patientValue="2+", status="coincide", puntaje=0.99)

    (resultado,) = proponer(LlmGuionado(salida(cruda)), fuente())

    assert not hasattr(resultado, "patient_value") and not hasattr(resultado, "status")
    assert (resultado.criterio, resultado.valor) == ("estado_her2", "HER2 negativo")


def test_proponer_ignora_la_propuesta_de_una_fuente_con_rotulo_inexistente_o_valor_vacio():
    llm = LlmGuionado(salida(propuesta_cruda(source="S9"), propuesta_cruda(value="   ")))

    assert proponer(llm, fuente()) == ()


@pytest.mark.parametrize(
    "respuesta",
    ["no es json", json.dumps({"otra": []})],
    ids=["no_json", "fuera_de_esquema"],
)
def test_proponer_falla_cerrado_cuando_la_salida_no_valida_contra_el_esquema(respuesta: str):
    with pytest.raises(LlmLocalNoDisponibleError):
        proponer(LlmGuionado(respuesta), fuente())


def test_proponer_falla_cerrado_cuando_el_cliente_del_llm_falla():
    with pytest.raises(LlmLocalNoDisponibleError):
        proponer(LlmGuionado(FalloDelLlm()), fuente())


def test_proponer_no_invoca_al_llm_cuando_no_hay_fuentes():
    llm = LlmGuionado(salida())

    assert proponer(llm) == ()
    assert llm.prompts == []


def test_proponer_recorta_los_fragmentos_al_presupuesto_y_conserva_uno_por_fuente():
    grande = fuente(
        "CDR-A2",
        ChunkDeFuente("ch-1", "a" * 40),
        ChunkDeFuente("ch-2", "b" * 40),
    )
    llm = LlmGuionado(salida())

    proponer(llm, grande, fuente("CDR-A1", ChunkDeFuente("ch-3", "c" * 40)), presupuesto=60)

    (prompt,) = llm.prompts
    assert "ch-1" in prompt and "ch-3" in prompt and "ch-2" not in prompt


# --- prompt --------------------------------------------------------------------------------------------------------


def test_plantilla_no_contiene_terminos_de_nivel_a_ni_b():
    lista = ListaTerminos.model_validate_json(LISTA.read_text(encoding="utf-8"))

    coincidencias = check_prohibited_terms(
        PLANTILLA_APLICABILIDAD_TEXTO, lista, niveles=("A", "B"), permitir_frases=False
    )

    assert coincidencias == []


def test_version_del_prompt_de_aplicabilidad_es_aplicabilidad_texto_0_1_0():
    assert VERSION_DEL_PROMPT_APLICABILIDAD == "aplicabilidad-texto@0.1.0"


def test_prompt_trae_criterios_y_fragmentos_de_la_fuente_sin_datos_del_paciente():
    prompt = construir_prompt_aplicabilidad_texto([fuente()])

    assert "[fuente S1]" in prompt
    assert "- estado_her2: Estado de HER2" in prompt
    assert "[chunkId: ch-a2-1]\nHER2-negative disease." in prompt
    assert "CDR-A2" not in prompt  # el LLM nombra la fuente por su rótulo, no por el externalId
    assert (
        "paciente" not in prompt.split("Fuentes:")[1]
    )  # la parte con datos no menciona al paciente


def test_prompt_conserva_las_llaves_del_texto_de_un_fragmento_sin_interpretarlas():
    prompt = construir_prompt_aplicabilidad_texto(
        [fuente("CDR-A2", ChunkDeFuente("ch-1", "valor {fuentes} y {0}"))]
    )

    assert "valor {fuentes} y {0}" in prompt
