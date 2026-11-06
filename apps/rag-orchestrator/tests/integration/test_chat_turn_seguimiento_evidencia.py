"""`POST /chat/turn`, seguimiento de un análisis de evidencia (US-265 / L1D-322): RN-01, RN-02, RN-04, RN-24.

El ``ChatTurnService`` y el servicio de `/rag/query` son los de producción; el LLM del chat (clasificación y seguimiento), el
generador de opciones, el NLI, el reranker, Milvus y las posiciones de los chunks son falsos. El primer turno es el análisis
de evidencia; el segundo, la pregunta sobre ese resultado con el ``activeAnalysisId`` que Backend 1 enviaría. Cada respuesta
se valida contra el spec del proveedor (US-214). Solo datos sintéticos.
"""

import re

import pytest

from app.domain.atribucion import MARCO_ES
from tests.support.chat_evidencia import crear_entorno_de_chat_con_evidencia, solicitud_de_evidencia
from tests.support.generador_falso import OPCION_ANTI_HER2, FakeEvidenceGenerator
from tests.support.llm_chat_evidencia_falso import (
    TEXTO_DEL_SEGUIMIENTO,
    TEXTO_SIN_SOPORTE_NLI,
    TEXTO_SOLO_EN_LA_MEMORIA,
    FakeChatLlmEvidencia,
)
from tests.support.nli_falso import IMPLICA, NEUTRAL, NliFalso
from tests.support.recuperacion import (
    CORPUS_FX06A,
    PUNTAJES_FX06A,
    Q_HER2,
    RerankerFalso,
    crear_entorno,
)
from tests.support.reescritura import ReescritorFalso, parametros_de_reescritura

Q_SEGUIMIENTO = "¿En qué se diferencia la población del estudio de mi paciente?"
Q_SIN_REGLA = "¿Eso aplica a mi paciente?"
ANALISIS_ACTIVO = "b3d9f2a0-1c3e-4f9a-8b1a-9e2f0c3d9f2a"
LIMITACION_SIN_EVIDENCIA = "Ningún fragmento recuperado supera el umbral de relevancia."
PUNTAJES_DEL_SEGUIMIENTO = {"ch-m1-1": 0.80, "ch-inj-1": 0.05}


def _entorno(escenario: str = "SEG-OK", *, puntajes=PUNTAJES_DEL_SEGUIMIENTO, nli=None, **base):
    reranker = RerankerFalso(
        puntajes={**PUNTAJES_FX06A, Q_SEGUIMIENTO: puntajes, Q_SIN_REGLA: puntajes}
    )
    generador = FakeEvidenceGenerator("LLM-OK")
    entorno_base = crear_entorno(
        generador=generador,
        reranker=reranker,
        clasificador_nli=nli or NliFalso(por_defecto=IMPLICA),
        **base,
    )
    llm = FakeChatLlmEvidencia(escenario)
    return crear_entorno_de_chat_con_evidencia(entorno_base, llm=llm), generador


def _analisis_y_seguimiento(
    entorno, pregunta: str = Q_SEGUIMIENTO, activo: str | None = ANALISIS_ACTIVO
):
    primero = entorno.turno(solicitud_de_evidencia(Q_HER2))
    assert primero.status_code == 200 and "evidenceAnalysis" in primero.json()
    segundo = entorno.turno(
        solicitud_de_evidencia(pregunta, analisis_activo=activo, rehidratacion=None)
    )
    return primero.json(), segundo


@pytest.mark.ac("US-265", 3)
def test_chat_turn_re_recupera_cita_solo_lo_del_turno_y_no_devuelve_evidence_analysis_en_el_seguimiento_cuando_hay_analisis_activo():
    entorno, generador = _entorno("SEG-OK")

    entorno.turno(solicitud_de_evidencia(Q_HER2))
    busquedas_del_analisis = entorno.base.buscador.invocaciones  # type: ignore[attr-defined]
    respuesta = entorno.turno(
        solicitud_de_evidencia(Q_SEGUIMIENTO, analisis_activo=ANALISIS_ACTIVO, rehidratacion=None)
    )

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    # Una recuperación más, igual a la del análisis (dense: pregunta y resumen del contexto), sin segundo loop.
    assert entorno.base.buscador.invocaciones == 2 * busquedas_del_analisis  # type: ignore[attr-defined]
    assert (cuerpo["intent"], cuerpo["subintent"]) == ("evidencia", "seguimiento_evidencia")
    assert "evidenceAnalysis" not in cuerpo
    assert generador.invocaciones == 1  # el análisis nuevo no se genera: solo el del primer turno
    recuperados_en_el_turno = set(entorno.base.reranker.candidatos_recibidos[-1])  # type: ignore[attr-defined]
    citas = [c for b in cuerpo["blocks"] for c in b.get("citations", [])]
    assert citas and {c["chunkId"] for c in citas} <= recuperados_en_el_turno
    (bloque,) = cuerpo["blocks"]
    assert bloque["kind"] == "evidencia"
    assert bloque["text"] == f"{MARCO_ES}{TEXTO_DEL_SEGUIMIENTO}"
    assert [c["chunkId"] for c in bloque["citations"]] == ["ch-m1-1"]


@pytest.mark.ac("US-265", 1)
def test_chat_turn_rellena_ultima_evidencia_del_seguimiento_sin_ningun_identificador_de_analisis():
    entorno, _ = _entorno("SEG-OK")

    _, segundo = _analisis_y_seguimiento(entorno)

    estado = segundo.json()["structuredState"]
    assert estado["ultimaEvidencia"] == {
        "query": Q_SEGUIMIENTO,
        "chunkIds": ["ch-m1-1", "ch-inj-1"],
        "topRelevanceScore": 0.80,
    }
    assert ANALISIS_ACTIVO not in segundo.text
    assert "analysisId" not in segundo.text and "activeAnalysisId" not in segundo.text


def test_chat_turn_no_es_seguimiento_y_devuelve_un_analisis_nuevo_cuando_no_hay_analisis_activo():
    entorno, generador = _entorno("SEG-OK")

    _, segundo = _analisis_y_seguimiento(entorno, activo=None)

    cuerpo = segundo.json()
    assert "subintent" not in cuerpo
    assert cuerpo["evidenceAnalysis"]["status"] == "con_evidencia"
    assert generador.invocaciones == 2


def test_chat_turn_clasifica_seguimiento_con_el_llm_cuando_hay_analisis_activo_y_ninguna_regla_decide():
    entorno, _ = _entorno("SEG-OK")

    _, segundo = _analisis_y_seguimiento(entorno, Q_SIN_REGLA)

    cuerpo = segundo.json()
    assert (cuerpo["intent"], cuerpo["subintent"]) == ("evidencia", "seguimiento_evidencia")
    assert entorno.llm.llamadas_de_clasificacion == 1


@pytest.mark.ac("US-265", 3)
def test_chat_turn_responde_sin_evidencia_con_cero_llamadas_al_llm_y_top_relevance_score_null_cuando_ningun_chunk_supera_el_umbral_en_el_seguimiento():
    reescritor = ReescritorFalso()
    entorno, generador = _entorno(
        "SEG-OK",
        puntajes={"ch-m1-1": 0.05, "ch-inj-1": 0.05},
        reescritor=reescritor,
        parametros=parametros_de_reescritura(),
    )

    _, segundo = _analisis_y_seguimiento(entorno)

    cuerpo = segundo.json()
    assert (cuerpo["intent"], cuerpo["subintent"]) == ("evidencia", "seguimiento_evidencia")
    assert "evidenceAnalysis" not in cuerpo
    assert [(b["kind"], b["text"]) for b in cuerpo["blocks"]] == [
        ("limitacion", LIMITACION_SIN_EVIDENCIA)
    ]
    assert entorno.llm.invocaciones == 0  # ni generación, ni clasificación
    assert generador.invocaciones == 1 and reescritor.invocaciones == 0
    ultima = cuerpo["structuredState"]["ultimaEvidencia"]
    assert ultima["topRelevanceScore"] is None
    assert ultima["topRelevanceScore"] != 0.0


@pytest.mark.ac("US-265", 4)
def test_chat_turn_omite_y_cuenta_la_afirmacion_respaldada_solo_por_el_turno_anterior_con_chat_memoria():
    nli = NliFalso(por_defecto=IMPLICA)
    entorno, _ = _entorno("CHAT-MEMORIA", nli=nli)

    primero, segundo = _analisis_y_seguimiento(entorno)

    cuerpo = segundo.json()
    assert [b["text"] for b in cuerpo["blocks"]] == [f"{MARCO_ES}{TEXTO_DEL_SEGUIMIENTO}"]
    assert cuerpo["omittedClaims"] == 1
    assert TEXTO_SOLO_EN_LA_MEMORIA not in segundo.text
    premisas = {par.premisa for par in nli.pares_recibidos}
    assert premisas and premisas <= {c.texto for c in CORPUS_FX06A}  # el NLI nunca ve la memoria
    prompt = entorno.llm.usuarios[-1]
    sistema = entorno.llm.sistemas[-1] or ""
    memoria = re.search(r'<memory citable="no">(.*?)</memory>', prompt, re.DOTALL)
    assert memoria is not None
    assert OPCION_ANTI_HER2 in memoria.group(1)
    assert OPCION_ANTI_HER2 not in re.sub(r"<memory.*?</memory>", "", prompt, flags=re.DOTALL)
    assert "INICIO_DE_LA_MEMORIA" not in prompt + sistema
    assert "FIN_DE_LA_MEMORIA" not in prompt + sistema
    assert primero["blocks"][0]["text"] in memoria.group(1)


@pytest.mark.ac("US-265", 7)
def test_chat_turn_omite_y_cuenta_la_afirmacion_citada_con_nli_neutral_en_el_seguimiento():
    nli = NliFalso(resultados={TEXTO_SIN_SOPORTE_NLI: NEUTRAL}, por_defecto=IMPLICA)
    entorno, _ = _entorno("SEG-NLI-NEUTRAL", nli=nli)

    _, segundo = _analisis_y_seguimiento(entorno)

    cuerpo = segundo.json()
    assert [b["text"] for b in cuerpo["blocks"]] == [f"{MARCO_ES}{TEXTO_DEL_SEGUIMIENTO}"]
    assert cuerpo["omittedClaims"] == 1
    assert TEXTO_SIN_SOPORTE_NLI not in segundo.text
