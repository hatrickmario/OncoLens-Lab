"""Bordes del camino textual de la aplicabilidad (US-123): RN-02, falla cerrada del LLM y no-fuga en logs (RN-10, RN-25)."""

import json
import logging

from app.application.corpus_metadata.poblacion_puertos import RespuestaDelLlm
from app.application.ports import FalloDelLlm
from tests.support.aplicabilidad import TEXTO_DE_CH_A2_1, entorno_de_aplicabilidad, solicitud_a_m1
from tests.support.nli_falso import IMPLICA, NliFalso
from tests.support.proponente_falso import ProponenteFalso
from tests.support.respaldo_poblacion import tarea_de_respaldo

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


def test_rag_query_responde_200_con_respaldo_fallido_y_sin_el_detalle_del_error_cuando_el_proponente_cae():
    nli = NliFalso(por_defecto=IMPLICA)
    proponente = ProponenteFalso("APL-OK", error=FalloDelLlm("SENTINELA-LLM"))

    respuesta = _entorno(proponente, nli, SOLO_DOC_A2).consultar(solicitud_a_m1())

    assert respuesta.status_code == 200
    (fuente,) = respuesta.json()["applicability"]
    her2 = next(c for c in fuente["criteria"] if c["criterion"] == "estado_her2")
    assert (her2["status"], her2["unknownReason"]) == ("desconocido", "respaldo_fallido")
    assert "SENTINELA-LLM" not in respuesta.text and "LOCAL_LLM_UNAVAILABLE" not in respuesta.text
    assert nli.invocaciones == 0


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


class _LlmHer2:
    """Borde del LLM: devuelve ``HER2 negativo`` citando ``ch-a2-1`` para el criterio de HER2 y nada para los demás."""

    def __init__(self) -> None:
        self.prompts: list[str] = []

    async def completar_json_acotado(self, prompt, esquema, *, max_tokens, semilla):
        self.prompts.append(prompt)
        valores = (
            [{"value": "HER2 negativo", "chunkId": "ch-a2-1", "scope": "elegibilidad"}]
            if "Criterio: estado_her2" in prompt
            else []
        )
        return RespuestaDelLlm(json.dumps({"values": valores}), "stop")


def test_rag_query_acepta_la_propuesta_del_adapter_real_y_su_prompt_no_lleva_datos_del_paciente():
    llm = _LlmHer2()
    solicitud = solicitud_a_m1()
    entorno = _entorno(tarea_de_respaldo(llm), NliFalso(por_defecto=IMPLICA), SOLO_DOC_A2)

    respuesta = entorno.consultar(solicitud)

    assert respuesta.status_code == 200
    (fuente,) = respuesta.json()["applicability"]
    her2 = next(c for c in fuente["criteria"] if c["criterion"] == "estado_her2")
    assert (her2["patientValue"], her2["studyPopulationValue"], her2["status"]) == (
        "3+ (IHQ)",
        "HER2 negativo",
        "no_coincide",
    )
    for prompt in llm.prompts:
        assert TEXTO_DE_CH_A2_1 in prompt
        assert solicitud["clinicalContext"]["pseudoPatientId"] not in prompt
        assert "3+ (IHQ)" not in prompt
