"""`POST /rag/follow-up`, vuelta 1 del Gate 2 (US-218): diagnóstico ausente, catálogo en modo fake, prompt y conteo."""

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.bootstrap import crear_app
from app.domain.lenguaje import ListaTerminos, check_prohibited_terms
from app.prompts.seguimiento import PLANTILLA_SEGUIMIENTO
from tests.support.fakes import GeneradorTraceFijo, RelojFijo, par_de_sesion, settings_de_prueba
from tests.support.guiones_seguimiento import TEXTO_SEGUIMIENTO_OK, TEXTO_SOLO_EN_LA_MEMORIA
from tests.support.recuperacion import EJEMPLOS
from tests.support.seguimiento import crear_entorno_de_seguimiento, solicitud_de_seguimiento
from tests.support.service_jwt import con_token_valido

LISTA = ListaTerminos.model_validate_json(
    (
        Path(__file__).resolve().parents[4]
        / "packages/clinical-catalogs/lenguaje/terminos-prohibidos.json"
    ).read_text(encoding="utf-8")
)


@pytest.mark.ac("US-218", 1)
def test_rag_follow_up_responde_422_cuerpo_invalido_sin_invocar_adapters_cuando_el_contexto_no_trae_diagnostico():
    entorno = crear_entorno_de_seguimiento("SEG-OK")
    solicitud = solicitud_de_seguimiento()
    solicitud["clinicalContext"]["diagnosis"] = None

    respuesta = entorno.seguir(solicitud)

    assert respuesta.status_code == 422
    assert respuesta.json()["error"] == "CUERPO_INVALIDO"
    assert all(n == 0 for n in entorno.llamadas_a_adapters().values())


@pytest.mark.ac("US-218", 1)
def test_rag_follow_up_responde_409_cuando_el_modo_fake_recibe_otra_version_de_catalogo():
    app = crear_app(
        settings_de_prueba(llm_provider="fake", fake_responses_path=EJEMPLOS),
        trace_ids=GeneradorTraceFijo(),
        clock=RelojFijo(),
    )
    cliente = TestClient(app, headers=con_token_valido(par_de_sesion()))
    solicitud = solicitud_de_seguimiento()
    solicitud["catalogVersion"] = "9999.01.0"

    respuesta = cliente.post("/rag/follow-up", json=solicitud)

    assert respuesta.status_code == 409
    assert respuesta.json()["error"] == "CATALOG_VERSION_MISMATCH"


def test_rag_follow_up_muestra_las_n_afirmaciones_soportadas_cuando_el_llm_devuelve_n_validas():
    from tests.support.llm_falso import ESCENARIOS_LLM

    ESCENARIOS_LLM["SEG-DOS"] = json.dumps(
        {
            "outcome": "respuesta",
            "claims": [
                {"text": TEXTO_SEGUIMIENTO_OK, "citations": ["C1"]},
                {"text": "Adding anti-HER2 therapy improved survival.", "citations": ["C1"]},
            ],
        }
    )
    try:
        entorno = crear_entorno_de_seguimiento("SEG-DOS")
        cuerpo = entorno.seguir(solicitud_de_seguimiento()).json()
    finally:
        del ESCENARIOS_LLM["SEG-DOS"]

    assert len(cuerpo["answer"]) == 2 and cuerpo["omittedClaims"] == 0


def test_prompt_de_seguimiento_delimita_la_memoria_con_apertura_y_cierre_explicitos_cuando_se_arma_con_el_ejemplo():
    entorno = crear_entorno_de_seguimiento("SEG-OK")

    entorno.seguir(solicitud_de_seguimiento())

    (prompt,) = entorno.llm.usuarios
    abre, cierra = prompt.index('<memory citable="no">'), prompt.index("</memory>")
    assert (
        abre < prompt.index(TEXTO_SOLO_EN_LA_MEMORIA) < cierra < prompt.index('<document id="C1">')
    )


def test_prompt_de_seguimiento_no_trae_terminos_de_salida_generada_cuando_se_renderiza_con_el_ejemplo_del_contrato():
    entorno = crear_entorno_de_seguimiento("SEG-OK")
    entorno.seguir(solicitud_de_seguimiento())
    (parte_fija,) = entorno.llm.sistemas

    coincidencias = check_prohibited_terms(
        parte_fija, LISTA, niveles=("A", "B"), permitir_frases=False
    )

    assert coincidencias == [] and PLANTILLA_SEGUIMIENTO
