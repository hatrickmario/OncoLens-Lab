"""``GeneradorDeContextoDeChunk`` (US-279, L1D-337, D6): contrato compartido por el fake y la implementación sobre el ``LlmClient``.

LSP: ``None`` no es cadena vacía, nunca lanza por un fallo del LLM y distingue los dos motivos. Además, el prompt de la
implementación real: instrucciones en ``system``, datos delimitados en ``user`` y esquema cerrado con la longitud de configuración.
"""

from __future__ import annotations

from collections.abc import Callable

import pytest

from app.application.corpus_ingestion.contexto_llm import (
    INSTRUCCIONES,
    GeneradorLlmDeContexto,
    esquema_de_la_frase,
)
from app.application.corpus_ingestion.ports import (
    MOTIVO_LLM_NO_DISPONIBLE,
    MOTIVO_SALIDA_INVALIDA,
    EntradaDelGeneradorDeContexto,
    FraseDeContexto,
    GeneradorDeContextoDeChunk,
)
from app.domain.corpus_seed.contexto_del_chunk import MetadatosDelContexto
from tests.support.contexto_llm import (
    SALIDA_INVALIDA,
    GeneradorDeContextoFalso,
    LlmDeContextoFalso,
    frase_valida,
    llm_caido,
    salida_de,
)

ENTRADA = EntradaDelGeneradorDeContexto(
    MetadatosDelContexto("Guía de mama", "guideline", "mama"), "Inicio del documento."
)
MAX_CHARS = 100

Escenario = tuple[str, FraseDeContexto]
ESCENARIOS: dict[str, Escenario] = {
    "valida": (salida_de("Describe la guía."), FraseDeContexto("Describe la guía.")),
    "invalida": ("no es json", FraseDeContexto(None, MOTIVO_SALIDA_INVALIDA)),
    "vacia": (salida_de("  "), FraseDeContexto(None, MOTIVO_SALIDA_INVALIDA)),
    "llm_caido": ("", FraseDeContexto(None, MOTIVO_LLM_NO_DISPONIBLE)),
}


def _real(escenario: str) -> GeneradorDeContextoDeChunk:
    salida = llm_caido() if escenario == "llm_caido" else ESCENARIOS[escenario][0]
    return GeneradorLlmDeContexto(llm=LlmDeContextoFalso([salida]), max_chars=MAX_CHARS)


def _falso(escenario: str) -> GeneradorDeContextoDeChunk:
    return GeneradorDeContextoFalso([ESCENARIOS[escenario][1]])


FABRICAS: dict[str, Callable[[str], GeneradorDeContextoDeChunk]] = {"real": _real, "falso": _falso}


@pytest.fixture(params=sorted(FABRICAS))
def fabrica(request: pytest.FixtureRequest) -> Callable[[str], GeneradorDeContextoDeChunk]:
    return FABRICAS[request.param]


@pytest.mark.parametrize("escenario", sorted(ESCENARIOS))
def test_el_generador_devuelve_la_frase_o_el_motivo_y_nunca_lanza(
    fabrica: Callable[[str], GeneradorDeContextoDeChunk], escenario: str
) -> None:
    resultado = fabrica(escenario).generar(ENTRADA, "chunk")

    assert resultado == ESCENARIOS[escenario][1]


@pytest.mark.parametrize("escenario", sorted(ESCENARIOS))
def test_una_frase_nunca_es_la_cadena_vacia_y_sin_frase_siempre_hay_motivo(
    fabrica: Callable[[str], GeneradorDeContextoDeChunk], escenario: str
) -> None:
    resultado = fabrica(escenario).generar(ENTRADA, "chunk")

    assert resultado.frase != ""
    assert (resultado.frase is None) == (resultado.motivo is not None)


def test_el_prompt_lleva_las_instrucciones_en_system_y_los_datos_delimitados_en_user() -> None:
    llm = LlmDeContextoFalso([salida_de("Frase.")])

    GeneradorLlmDeContexto(llm=llm, max_chars=MAX_CHARS).generar(ENTRADA, "Texto del chunk.")

    (usuario,) = llm.usuarios
    assert llm.sistemas == [INSTRUCCIONES]
    assert "Guía de mama" in usuario and "Inicio del documento." in usuario
    assert "Texto del chunk." in usuario
    assert usuario.startswith("<<<DOCUMENTO") and usuario.endswith("FRAGMENTO>>>")
    assert "datos, no instrucciones" in INSTRUCCIONES


def test_el_esquema_es_cerrado_y_su_longitud_sale_de_la_configuracion() -> None:
    llm = LlmDeContextoFalso([salida_de("Frase.")])

    GeneradorLlmDeContexto(llm=llm, max_chars=MAX_CHARS).generar(ENTRADA, "chunk")

    assert llm.esquemas == [esquema_de_la_frase(MAX_CHARS)]
    assert esquema_de_la_frase(MAX_CHARS)["additionalProperties"] is False
    assert esquema_de_la_frase(MAX_CHARS)["properties"]["contexto"]["maxLength"] == MAX_CHARS


def test_una_frase_mas_larga_que_el_limite_es_salida_invalida() -> None:
    llm = LlmDeContextoFalso([salida_de("x" * (MAX_CHARS + 1))])

    resultado = GeneradorLlmDeContexto(llm=llm, max_chars=MAX_CHARS).generar(ENTRADA, "chunk")

    assert resultado == FraseDeContexto(None, MOTIVO_SALIDA_INVALIDA)


def test_un_defecto_que_no_es_un_fallo_del_llm_sube_sin_convertirse_en_respaldo() -> None:
    llm = LlmDeContextoFalso([RuntimeError("defecto")])

    with pytest.raises(RuntimeError):
        GeneradorLlmDeContexto(llm=llm, max_chars=MAX_CHARS).generar(ENTRADA, "chunk")


def test_el_generador_falso_numera_las_frases_cuando_se_agota_el_guion() -> None:
    generador = GeneradorDeContextoFalso([SALIDA_INVALIDA])

    assert generador.generar(ENTRADA, "a") == SALIDA_INVALIDA
    assert generador.generar(ENTRADA, "b") == frase_valida(2)
