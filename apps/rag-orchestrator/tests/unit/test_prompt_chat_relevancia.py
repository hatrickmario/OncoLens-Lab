"""Prompt `chat-relevancia@0.1.0` (US-264, US-057): RN-23 en la plantilla, separación instrucciones/datos y sin datos del
paciente (RN-11)."""

from pathlib import Path

from app.domain.alias_de_chunks import asignar_alias
from app.domain.lenguaje import ListaTerminos, check_prohibited_terms
from app.domain.relevance import ChunkPuntuado
from app.prompts.chat_relevancia import (
    PLANTILLA_DE_RELEVANCIA_DEL_CHAT,
    VERSION_DEL_PROMPT_DE_RELEVANCIA_DEL_CHAT,
    armar_prompt_de_relevancia_del_chat,
)
from tests.support.prompt_separado import DatosDelPrompt, afirmar_separacion

LISTA = (
    Path(__file__).resolve().parents[4]
    / "packages"
    / "clinical-catalogs"
    / "lenguaje"
    / "terminos-prohibidos.json"
)
TEXTO_DEL_CHUNK = "Menopausal status was used to stratify adjuvant endocrine therapy trials."


def _fragmentos():
    chunk = ChunkPuntuado("ch-m1-1", "doc-m1", TEXTO_DEL_CHUNK, 0.8)
    return asignar_alias([chunk]).fragmentos


def _prompt():
    return armar_prompt_de_relevancia_del_chat(
        "Estado menopáusico", "mama", _fragmentos(), "es", claims_min=1, claims_max=3, claim_max_words=20
    )


def test_la_plantilla_no_contiene_terminos_de_nivel_a_ni_b_cuando_se_verifica_sin_datos():
    lista = ListaTerminos.model_validate_json(LISTA.read_text(encoding="utf-8"))

    coincidencias = check_prohibited_terms(
        PLANTILLA_DE_RELEVANCIA_DEL_CHAT, lista, niveles=("A", "B"), permitir_frases=False
    )

    assert coincidencias == []


def test_el_prompt_lleva_la_version_y_separa_instrucciones_y_datos_cuando_se_arma_con_fragmentos():
    prompt = _prompt()

    assert prompt.version == VERSION_DEL_PROMPT_DE_RELEVANCIA_DEL_CHAT == "chat-relevancia@0.1.0"
    afirmar_separacion(
        prompt,
        DatosDelPrompt(
            pregunta="¿Por qué importa Estado menopáusico para el cáncer de mama?",
            documentos={"C1": TEXTO_DEL_CHUNK},
        ),
    )


def test_el_prompt_no_lleva_datos_del_paciente_ni_memoria_citable_cuando_se_arma():
    prompt = _prompt()

    assert "<patient_data>" not in prompt.usuario
    assert "<memory" not in prompt.usuario
    assert "psd_" not in prompt.usuario + prompt.sistema


def test_el_prompt_pide_el_json_de_afirmaciones_con_los_limites_de_configuracion():
    prompt = _prompt()

    assert "de 1 a 3 afirmaciones" in prompt.sistema
    assert "20 palabras" in prompt.sistema
    assert "español" in prompt.sistema
