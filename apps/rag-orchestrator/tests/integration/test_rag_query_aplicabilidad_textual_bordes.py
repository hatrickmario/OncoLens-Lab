"""Bordes del camino textual de la aplicabilidad (US-123): RN-02, falla cerrada del LLM y no-fuga en logs (RN-10, RN-25)."""

import logging

from app.infrastructure.llm.proponente_de_aplicabilidad import LlmApplicabilityTextProposer
from tests.support.aplicabilidad import TEXTO_DE_CH_A2_1, entorno_de_aplicabilidad, solicitud_a_m1
from tests.support.nli_falso import IMPLICA, NliFalso
from tests.support.proponente_falso import ProponenteFalso

SOLO_DOC_A2 = {"doc-a2": 0.90}


def _entorno(proponente: ProponenteFalso, nli: NliFalso, documentos: dict[str, float]):
    return entorno_de_aplicabilidad(documentos, proponente=proponente, clasificador_nli=nli)


def test_rag_query_no_invoca_al_proponente_ni_al_nli_cuando_ningun_chunk_supera_el_umbral():
    proponente = ProponenteFalso("APL-OK")
    nli = NliFalso(por_defecto=IMPLICA)

    respuesta = _entorno(proponente, nli, {}).consultar(solicitud_a_m1())  # RN-02

    cuerpo = respuesta.json()
    assert (cuerpo["status"], cuerpo["applicability"], cuerpo["omittedClaims"]) == (
        "sin_evidencia",
        [],
        0,
    )
    assert (proponente.invocaciones, nli.invocaciones) == (0, 0)


def test_rag_query_responde_503_local_llm_unavailable_sin_aplicabilidad_cuando_el_proponente_falla():
    nli = NliFalso(por_defecto=IMPLICA)
    proponente = ProponenteFalso("APL-OK", error=RuntimeError("SENTINELA-LLM"))

    respuesta = _entorno(proponente, nli, SOLO_DOC_A2).consultar(solicitud_a_m1())

    assert respuesta.status_code == 503
    cuerpo = respuesta.json()
    assert cuerpo["error"] == "LOCAL_LLM_UNAVAILABLE"
    assert not {"applicability", "evidenceOptions"} & set(cuerpo)
    assert "SENTINELA-LLM" not in respuesta.text
    assert nli.invocaciones == 0


def test_rag_query_responde_503_local_llm_unavailable_cuando_el_proponente_no_devuelve_propuestas():
    proponente = ProponenteFalso("APL-OK")

    async def propuestas_invalidas(fuentes):
        return ("no es una propuesta",)

    proponente.proponer = propuestas_invalidas  # type: ignore[method-assign]

    respuesta = _entorno(proponente, NliFalso(por_defecto=IMPLICA), SOLO_DOC_A2).consultar(
        solicitud_a_m1()
    )

    assert (respuesta.status_code, respuesta.json()["error"]) == (503, "LOCAL_LLM_UNAVAILABLE")


def test_rag_query_solo_registra_conteos_cuando_acepta_una_propuesta(caplog):
    caplog.set_level(logging.DEBUG)
    solicitud = solicitud_a_m1()
    entorno = _entorno(ProponenteFalso("APL-OK"), NliFalso(por_defecto=IMPLICA), SOLO_DOC_A2)

    assert entorno.consultar(solicitud).status_code == 200

    mensajes = [r.getMessage() for r in caplog.records]
    eventos = [m for m in mensajes if "event=rag_query_poblacion_textual" in m]
    assert len(eventos) == 1
    for recuento in ("propuestas=1", "aceptadas=1", "rechazadasPorCita=0", "rechazadasPorNli=0"):
        assert recuento in eventos[0]
    pseudonimo = solicitud["clinicalContext"]["pseudoPatientId"]
    for mensaje in mensajes:
        for prohibido in ("HER2 negativo", TEXTO_DE_CH_A2_1, "ch-a2-1", pseudonimo):
            assert prohibido not in mensaje


class _LlmGuionado:
    def __init__(self, respuesta: str) -> None:
        self._respuesta = respuesta
        self.prompts: list[str] = []

    async def completar_json(self, prompt, esquema):
        self.prompts.append(prompt)
        return self._respuesta


def test_rag_query_acepta_la_propuesta_del_adapter_real_y_su_prompt_no_lleva_datos_del_paciente():
    llm = _LlmGuionado(
        '{"proposals": [{"source": "S1", "criterion": "estado_her2", "value": "HER2 negativo",'
        ' "chunkId": "ch-a2-1", "patientValue": "2+", "status": "coincide"}]}'
    )
    solicitud = solicitud_a_m1()
    entorno = _entorno(
        LlmApplicabilityTextProposer(llm), NliFalso(por_defecto=IMPLICA), SOLO_DOC_A2
    )

    respuesta = entorno.consultar(solicitud)

    assert respuesta.status_code == 200
    (fuente,) = respuesta.json()["applicability"]
    her2 = next(c for c in fuente["criteria"] if c["criterion"] == "estado_her2")
    assert (her2["patientValue"], her2["studyPopulationValue"], her2["status"]) == (
        "3+ (IHQ)",
        "HER2 negativo",
        "no_coincide",
    )
    (prompt,) = llm.prompts
    assert TEXTO_DE_CH_A2_1 in prompt
    assert solicitud["clinicalContext"]["pseudoPatientId"] not in prompt
    assert "3+ (IHQ)" not in prompt
