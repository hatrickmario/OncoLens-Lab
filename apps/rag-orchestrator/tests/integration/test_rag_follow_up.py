"""`POST /rag/follow-up` (US-218 / L1D-268): pipeline del análisis sin estado, memoria no citable, RN-01, RN-02, RN-23, RN-24.

El servicio de recuperación, el generador de seguimiento (sobre el LLM falso), el NLI y el verificador de lenguaje son los
de producción; los bordes son falsos. Cada respuesta se valida contra el spec del proveedor (hook de
`verificacion_proveedor.py`, US-214). Solo datos sintéticos.
"""

import pytest

from app.domain.atribucion import MARCO_ES
from app.prompts.seguimiento import VERSION_DEL_PROMPT_DE_SEGUIMIENTO
from tests.support.guiones_seguimiento import (
    TEXTO_PRESCRIPTIVO,
    TEXTO_SEGUIMIENTO_OK,
    TEXTO_SOLO_EN_LA_MEMORIA,
)
from tests.support.nli_falso import IMPLICA, NEUTRAL, NliFalso
from tests.support.recuperacion import CORPUS_FX06A
from tests.support.reescritura import ReescritorFalso, parametros_de_reescritura
from tests.support.seguimiento import (
    Q_COMPARATIVA,
    Q_OTRA_PERSONA,
    Q_OTRO_CANCER,
    crear_entorno_de_seguimiento,
    solicitud_de_seguimiento,
)

TEXTO_DE_CH_M1_1 = next(c.texto for c in CORPUS_FX06A if c.chunk_id == "ch-m1-1")
TEXTOS_DEL_CORPUS = {c.texto for c in CORPUS_FX06A}
BORDES_SIN_LLAMADAS = {"embeddings": 0, "busqueda": 0, "reranker": 0, "llm": 0, "nli": 0}


@pytest.mark.ac("US-218", 1)
def test_rag_follow_up_responde_con_evidencia_citada_y_sin_reescritura_cuando_el_llm_cita_c1_y_el_nli_implica():
    entorno = crear_entorno_de_seguimiento("SEG-OK")

    respuesta = entorno.seguir(solicitud_de_seguimiento())

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["status"] == "con_evidencia"
    (afirmacion,) = cuerpo["answer"]
    assert afirmacion["text"] == f"{MARCO_ES}{TEXTO_SEGUIMIENTO_OK}"
    assert [c["chunkId"] for c in afirmacion["citedSources"]] == ["ch-m1-1"]
    assert afirmacion["citedSources"][0]["title"] == "Breast Cancer Treatment (test)"
    assert cuerpo["citedSources"] == afirmacion["citedSources"]
    assert cuerpo["topRelevanceScore"] == 0.80
    assert cuerpo["meta"]["retrievalParams"]["queryRewrite"] == {
        "applied": False,
        "reason": "no_aplica",
    }
    assert cuerpo["meta"]["promptVersion"] == VERSION_DEL_PROMPT_DE_SEGUIMIENTO


@pytest.mark.ac("US-218", 2)
def test_rag_follow_up_omite_la_afirmacion_sostenida_solo_en_la_memoria_y_el_nli_nunca_ve_la_memoria_cuando_el_nli_la_marca_neutral():
    nli = NliFalso(resultados={TEXTO_SOLO_EN_LA_MEMORIA: NEUTRAL}, por_defecto=IMPLICA)
    entorno = crear_entorno_de_seguimiento("SEG-SOLO-MEMORIA", nli=nli)

    respuesta = entorno.seguir(solicitud_de_seguimiento())

    cuerpo = respuesta.json()
    assert [a["text"] for a in cuerpo["answer"]] == [f"{MARCO_ES}{TEXTO_SEGUIMIENTO_OK}"]
    assert cuerpo["omittedClaims"] == 1
    premisas = {par.premisa for par in nli.pares_recibidos}
    assert premisas and premisas <= TEXTOS_DEL_CORPUS
    assert all(TEXTO_SOLO_EN_LA_MEMORIA not in premisa for premisa in premisas)


def test_rag_follow_up_omite_la_afirmacion_sin_cita_que_copia_la_memoria_cuando_solo_la_memoria_la_sostiene():
    entorno = crear_entorno_de_seguimiento("SEG-MEMORIA-SIN-CITA")

    cuerpo = entorno.seguir(solicitud_de_seguimiento()).json()

    assert len(cuerpo["answer"]) == 1
    assert cuerpo["omittedClaims"] == 1
    assert TEXTO_SOLO_EN_LA_MEMORIA not in str(cuerpo)


def test_rag_follow_up_rotula_la_memoria_como_contexto_no_citable_en_un_bloque_sin_alias_cuando_arma_el_prompt():
    entorno = crear_entorno_de_seguimiento("SEG-OK")

    entorno.seguir(solicitud_de_seguimiento())

    (prompt,), (sistema,) = entorno.llm.usuarios, entorno.llm.sistemas
    inicio_memoria = prompt.index('<memory citable="no">')
    fin_memoria = prompt.index("</memory>")
    inicio_fragmentos = prompt.index('<document id="C1">')
    assert inicio_memoria < prompt.index(TEXTO_SOLO_EN_LA_MEMORIA) < fin_memoria
    assert "C1" not in prompt[inicio_memoria:fin_memoria]
    assert TEXTO_SOLO_EN_LA_MEMORIA not in prompt[inicio_fragmentos:]
    assert TEXTO_SOLO_EN_LA_MEMORIA not in sistema
    assert "no es evidencia" in sistema and "no lo cites" in sistema.lower()


@pytest.mark.ac("US-218", 3)
def test_rag_follow_up_responde_sin_evidencia_con_score_null_y_cero_llamadas_al_llm_y_al_reescritor_cuando_ningun_chunk_supera_el_umbral():
    reescritor = ReescritorFalso()
    entorno = crear_entorno_de_seguimiento(
        "SEG-OK",
        puntajes={"ch-m1-1": 0.05, "ch-inj-1": 0.05},
        reescritor=reescritor,
        parametros=parametros_de_reescritura(),
    )

    respuesta = entorno.seguir(solicitud_de_seguimiento())

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["status"] == "sin_evidencia"
    assert cuerpo["topRelevanceScore"] is None
    assert cuerpo["answer"] == [] and cuerpo["citedSources"] == []
    assert entorno.llm.invocaciones == 0 and reescritor.invocaciones == 0
    assert cuerpo["meta"]["retrievalParams"]["queryRewrite"]["reason"] == "no_aplica"


@pytest.mark.ac("US-218", 5)
@pytest.mark.parametrize("pregunta", [Q_OTRA_PERSONA, Q_OTRO_CANCER])
def test_rag_follow_up_responde_fuera_de_contexto_sin_llamar_a_ningun_adapter_cuando_nombra_a_otra_persona_o_solo_a_otro_cancer(
    pregunta,
):
    entorno = crear_entorno_de_seguimiento("SEG-OK")

    respuesta = entorno.seguir(solicitud_de_seguimiento(pregunta))

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["status"] == "fuera_de_contexto"
    assert cuerpo["answer"] == [] and cuerpo["citedSources"] == []
    assert cuerpo["topRelevanceScore"] is None
    assert entorno.llamadas_a_adapters() == BORDES_SIN_LLAMADAS


def test_rag_follow_up_sigue_el_pipeline_con_el_filtro_de_mama_cuando_la_pregunta_comparativa_nombra_mama_y_prostata():
    entorno = crear_entorno_de_seguimiento("SEG-OK")

    respuesta = entorno.seguir(solicitud_de_seguimiento(Q_COMPARATIVA))

    cuerpo = respuesta.json()
    assert respuesta.status_code == 200 and cuerpo["status"] == "con_evidencia"
    assert 'cancer_type_tags == "mama"' in entorno.base.buscador.expresiones[0]  # type: ignore[attr-defined]
    assert [c["chunkId"] for c in cuerpo["citedSources"]] == ["ch-m1-1"]


def test_rag_follow_up_responde_fuera_de_contexto_sin_citas_cuando_el_llm_devuelve_el_marcador():
    entorno = crear_entorno_de_seguimiento("SEG-FUERA-DE-CONTEXTO")

    respuesta = entorno.seguir(solicitud_de_seguimiento())

    cuerpo = respuesta.json()
    assert cuerpo["status"] == "fuera_de_contexto"
    assert cuerpo["answer"] == [] and cuerpo["citedSources"] == []
    assert cuerpo["topRelevanceScore"] is None
    assert entorno.llm.invocaciones == 1


def test_rag_follow_up_responde_503_llm_output_invalid_y_no_fuera_de_contexto_cuando_la_salida_no_parsea():
    entorno = crear_entorno_de_seguimiento("SEG-SALIDA-INVALIDA")

    respuesta = entorno.seguir(solicitud_de_seguimiento())

    assert respuesta.status_code == 503
    assert respuesta.json()["error"] == "LLM_OUTPUT_INVALID"


@pytest.mark.ac("US-218", 7)
def test_rag_follow_up_omite_la_afirmacion_con_debe_recibir_y_cuenta_omitted_claims_cuando_el_nli_la_implica():
    entorno = crear_entorno_de_seguimiento("SEG-PRESCRIPTIVO")

    respuesta = entorno.seguir(solicitud_de_seguimiento())

    cuerpo = respuesta.json()
    assert [a["text"] for a in cuerpo["answer"]] == [f"{MARCO_ES}{TEXTO_SEGUIMIENTO_OK}"]
    assert cuerpo["omittedClaims"] == 1
    assert "debe recibir" not in respuesta.text
    assert TEXTO_PRESCRIPTIVO not in respuesta.text


def test_rag_follow_up_responde_503_nli_unavailable_sin_afirmaciones_cuando_el_nli_falla():
    entorno = crear_entorno_de_seguimiento("SEG-OK", nli=NliFalso(error=RuntimeError("nli caído")))

    respuesta = entorno.seguir(solicitud_de_seguimiento())

    assert respuesta.status_code == 503
    cuerpo = respuesta.json()
    assert cuerpo["error"] == "NLI_UNAVAILABLE"
    assert "answer" not in cuerpo and TEXTO_SEGUIMIENTO_OK not in respuesta.text
