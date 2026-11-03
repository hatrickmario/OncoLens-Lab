"""Prompt de seguimiento (US-218): RN-23 en la plantilla, rótulo de la memoria (RN-24) y sin seudónimo (RN-11)."""

from pathlib import Path

from app.domain.lenguaje import ListaTerminos, check_prohibited_terms
from app.prompts.seguimiento import (
    PLANTILLA_SEGUIMIENTO,
    ROTULO_DE_LA_MEMORIA,
    VERSION_DEL_PROMPT_DE_SEGUIMIENTO,
)
from tests.support.seguimiento import crear_entorno_de_seguimiento, solicitud_de_seguimiento

LISTA = (
    Path(__file__).resolve().parents[4]
    / "packages"
    / "clinical-catalogs"
    / "lenguaje"
    / "terminos-prohibidos.json"
)


def test_plantilla_de_seguimiento_no_contiene_terminos_de_nivel_a_ni_b_cuando_se_verifica_sin_datos():
    lista = ListaTerminos.model_validate_json(LISTA.read_text(encoding="utf-8"))

    coincidencias = check_prohibited_terms(
        PLANTILLA_SEGUIMIENTO, lista, niveles=("A", "B"), permitir_frases=False
    )

    assert coincidencias == []


def test_version_del_prompt_de_seguimiento_es_propia_cuando_se_compara_con_la_del_analisis():
    assert VERSION_DEL_PROMPT_DE_SEGUIMIENTO == "rag-follow-up@0.1.0"


def test_prompt_de_seguimiento_rotula_la_memoria_y_omite_el_seudonimo_cuando_se_arma_con_el_ejemplo_del_contrato():
    solicitud = solicitud_de_seguimiento()
    entorno = crear_entorno_de_seguimiento("SEG-OK")

    entorno.seguir(solicitud)

    (prompt,) = entorno.llm.prompts
    assert ROTULO_DE_LA_MEMORIA in prompt
    assert solicitud["clinicalContext"]["pseudoPatientId"] not in prompt
