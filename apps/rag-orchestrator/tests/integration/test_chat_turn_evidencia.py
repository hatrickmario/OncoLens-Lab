"""`POST /chat/turn`, nodo `evidencia` (US-265 / L1D-322): análisis de evidencia dentro de la conversación.

El ``ChatTurnService`` y el servicio de `/rag/query` son los de producción; el LLM del chat, el generador de opciones, el
NLI, el reranker, Milvus y las posiciones de los chunks son falsos. Cada respuesta se valida contra el spec del proveedor
(hook de `verificacion_proveedor.py`, US-214). Solo datos sintéticos.
"""

import json

import pytest

from app.application.errores import LlmLocalNoDisponibleError

from tests.support.aplicabilidad import (
    OPCION_O_A,
    OPCION_O_B,
    OPCION_O_C,
    CORPUS_FX08BA,
    entorno_fx10ca,
    solicitud_a_m1,
)
from tests.support.chat_evidencia import crear_entorno_de_chat_con_evidencia, solicitud_de_evidencia
from tests.support.generador_falso import RAZON_SIN_SOPORTE, FakeEvidenceGenerator
from tests.support.llm_nube_falso import LlmNubeFalso
from tests.support.nli_falso import IMPLICA, NEUTRAL, NliFalso
from tests.support.recuperacion import CORPUS_FX06A, EJEMPLOS, Q_HER2, crear_entorno

TEXTO_DE_CH_M1_1 = next(c.texto for c in CORPUS_FX06A if c.chunk_id == "ch-m1-1")


@pytest.mark.ac("US-265", 1)
def test_chat_turn_devuelve_evidence_analysis_con_opciones_citadas_solo_con_chunks_del_turno_cuando_se_pregunta_por_evidencia():
    entorno = crear_entorno_de_chat_con_evidencia(
        crear_entorno(generador=FakeEvidenceGenerator("LLM-OK"))
    )

    respuesta = entorno.turno(solicitud_de_evidencia(Q_HER2))

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["intent"] == "evidencia"
    assert "subintent" not in cuerpo
    analisis = cuerpo["evidenceAnalysis"]
    assert analisis["status"] == "con_evidencia"
    assert len(analisis["evidenceOptions"]) >= 1
    citas_del_analisis = {
        c["chunkId"] for o in analisis["evidenceOptions"] for c in o["citedSources"]
    }
    bloques = [b for b in cuerpo["blocks"] if b["kind"] == "evidencia"]
    citas_de_los_bloques = {c["chunkId"] for b in bloques for c in b["citations"]}
    assert citas_del_analisis == citas_de_los_bloques == {"ch-m1-1"}
    assert citas_de_los_bloques <= entorno.chunks_recuperados()
    (cita,) = bloques[0]["citations"]
    assert cita == {
        "chunkId": "ch-m1-1",
        "documentId": "doc-m1",
        "sourceTitle": "Breast Cancer Treatment (test)",
        "chunkOrdinal": 1,
        "chunkCount": 1,
        "chunkTextSnapshot": TEXTO_DE_CH_M1_1,
    }


@pytest.mark.ac("US-265", 1)
def test_chat_turn_rellena_ultima_evidencia_sin_analysis_id_cuando_el_turno_recupera():
    entorno = crear_entorno_de_chat_con_evidencia(
        crear_entorno(generador=FakeEvidenceGenerator("LLM-OK"))
    )

    cuerpo = entorno.turno(solicitud_de_evidencia(Q_HER2)).json()

    ultima = cuerpo["structuredState"]["ultimaEvidencia"]
    assert ultima == {
        "query": Q_HER2,
        "chunkIds": [
            "ch-m1-1",
            "ch-inj-1",
        ],  # los evaluados por el reranker, por puntaje descendente
        "topRelevanceScore": cuerpo["evidenceAnalysis"]["topRelevanceScore"],
    }
    assert ultima["topRelevanceScore"] == 0.87
    assert "analysisId" not in str(cuerpo["structuredState"])
    assert cuerpo["structuredState"]["citasMostradas"] == ["ch-m1-1"]
    assert cuerpo["structuredState"]["opcionesMostradas"] == [
        cuerpo["evidenceAnalysis"]["evidenceOptions"][0]["option"]
    ]


@pytest.mark.ac("US-265", 2)
def test_chat_turn_marca_menopausia_desconocido_por_falta_en_el_paciente_y_ordena_por_rn_28_con_el_paciente_e():
    base = entorno_fx10ca("LLM-TRES")
    entorno = crear_entorno_de_chat_con_evidencia(base, corpus=CORPUS_FX08BA)
    contexto = solicitud_a_m1()["clinicalContext"]  # sin estado menopáusico
    assert all(a["attributeKey"] != "estado_menopausico" for a in contexto["attributes"])

    respuesta = entorno.turno(
        solicitud_de_evidencia(
            Q_HER2,
            contexto_clinico=contexto,
            version_del_catalogo=base.catalogo_clinico.version(),
        )
    )

    assert respuesta.status_code == 200
    analisis = respuesta.json()["evidenceAnalysis"]
    assert [o["option"] for o in analisis["evidenceOptions"]] == [
        OPCION_O_B,
        OPCION_O_C,
        OPCION_O_A,
    ]
    menopausia = [
        criterio
        for fuente in analisis["applicability"]
        for criterio in fuente["criteria"]
        if criterio["criterion"] == "estado_menopausico"
    ]
    assert menopausia and all(
        (c["status"], c["unknownReason"], c["patientValue"])
        == ("desconocido", "falta_en_paciente", None)
        for c in menopausia
    )
    texto = respuesta.json()["blocks"][0]["text"]
    assert texto.index(OPCION_O_B) < texto.index(OPCION_O_C) < texto.index(OPCION_O_A)


class _GeneradorCaido:
    """``EvidenceGenerator`` con el LLM local caído: el error tipado del puerto (``LOCAL_LLM_UNAVAILABLE``)."""

    async def generar(self, solicitud, recuperacion):
        raise LlmLocalNoDisponibleError()


@pytest.mark.ac("US-265", 5)
def test_chat_turn_encabeza_con_opciones_descritas_sin_terminos_prohibidos_y_con_los_avisos_cuando_la_pregunta_es_prescriptiva():
    pregunta = "¿Qué tratamiento debe recibir esta paciente?"
    base = crear_entorno(generador=FakeEvidenceGenerator("LLM-OK"))
    base.reranker._puntajes[pregunta] = {"ch-m1-1": 0.87}  # type: ignore[attr-defined]
    entorno = crear_entorno_de_chat_con_evidencia(base)

    respuesta = entorno.turno(solicitud_de_evidencia(pregunta))

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["intent"] == "evidencia"
    assert cuerpo["blocks"][0]["text"].startswith("Opciones descritas en la evidencia:")
    textos = " ".join(b["text"] for b in cuerpo["blocks"]).lower()
    assert not any(t in textos for t in ("recomendado", "debe recibir", "se recomienda"))
    assert cuerpo["notices"] == [
        "Generado por IA; requiere validación clínica independiente por el oncólogo tratante",
        "Uso académico/investigación",
    ]


@pytest.mark.ac("US-265", 6)
def test_chat_turn_responde_503_local_llm_unavailable_sin_evidence_analysis_cuando_el_llm_local_esta_caido():
    entorno = crear_entorno_de_chat_con_evidencia(crear_entorno(generador=_GeneradorCaido()))
    nube = LlmNubeFalso()

    respuesta = entorno.turno(solicitud_de_evidencia(Q_HER2))

    assert respuesta.status_code == 503
    cuerpo = respuesta.json()
    assert cuerpo["error"] == "LOCAL_LLM_UNAVAILABLE" and "evidenceAnalysis" not in cuerpo
    esperado = json.loads(
        (EJEMPLOS / "chat-turn-llm-local-no-disponible.json").read_text(encoding="utf-8")
    )
    assert {k: v for k, v in cuerpo.items() if k != "traceId"} == {
        k: v for k, v in esperado.items() if k != "traceId"
    }
    assert nube.invocaciones == 0


@pytest.mark.ac("US-265", 7)
def test_chat_turn_lleva_la_opcion_sin_soporte_a_discarded_options_y_no_la_muestra_en_ningun_bloque():
    nli = NliFalso(resultados={RAZON_SIN_SOPORTE: NEUTRAL}, por_defecto=IMPLICA)
    entorno = crear_entorno_de_chat_con_evidencia(
        crear_entorno(generador=FakeEvidenceGenerator("LLM-SIN-SOPORTE"), clasificador_nli=nli)
    )

    cuerpo = entorno.turno(solicitud_de_evidencia(Q_HER2)).json()

    analisis = cuerpo["evidenceAnalysis"]
    assert analisis["evidenceOptions"] == [] and len(analisis["discardedOptions"]) == 1
    assert RAZON_SIN_SOPORTE not in str(cuerpo["blocks"])
    assert [b["kind"] for b in cuerpo["blocks"]] == ["limitacion"]
