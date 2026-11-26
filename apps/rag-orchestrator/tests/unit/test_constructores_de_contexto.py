"""Constructores del texto que se embebe por variante (US-279, L1D-337): ``ninguno``, ``determinista`` y ``llm`` con respaldo."""

from __future__ import annotations

import pytest

from app.application.corpus_ingestion.constructores_de_contexto import (
    ConstructorDeterminista,
    ConstructorNinguno,
    constructor_de_contexto,
)
from app.application.corpus_ingestion.contexto_llm import ConstructorConLlm
from app.application.corpus_ingestion.ports import (
    MOTIVO_LLM_NO_DISPONIBLE,
    FraseDeContexto,
)
from app.domain.corpus_seed.contexto_del_chunk import (
    MetadatosDelContexto,
    VarianteDeContexto,
    contexto_determinista,
    inicio_del_documento,
)
from tests.support.contexto_llm import (
    PREFIJO_DE_FRASE_DE_TEST,
    SALIDA_INVALIDA,
    GeneradorDeContextoFalso,
    frase_valida,
)

METADATOS = MetadatosDelContexto("Guía de mama", "guideline", "mama")
FRAGMENTOS = ["uno", "dos", "tres"]
BASE = contexto_determinista(METADATOS, None, 300)


def test_ninguno_devuelve_los_fragmentos_originales_sin_copiarlos() -> None:
    resultado = ConstructorNinguno().textos_a_embeber(METADATOS, FRAGMENTOS)

    assert resultado.textos == ("uno", "dos", "tres")
    assert all(a is b for a, b in zip(resultado.textos, FRAGMENTOS, strict=True))
    assert resultado.respaldo_por_salida_invalida == resultado.respaldo_por_llm_no_disponible == 0


def test_ninguno_solo_devuelve_los_pedidos_y_en_ese_orden() -> None:
    resultado = ConstructorNinguno().textos_a_embeber(METADATOS, FRAGMENTOS, pendientes=[2, 0])

    assert resultado.textos == ("tres", "uno")


def test_determinista_antepone_el_mismo_prefijo_a_cada_fragmento() -> None:
    resultado = ConstructorDeterminista(max_chars=300).textos_a_embeber(METADATOS, FRAGMENTOS)

    assert resultado.textos == tuple(f"{BASE}{f}" for f in FRAGMENTOS)


def test_determinista_usa_la_seccion_de_cada_chunk_y_omite_la_de_documento_sin_secciones() -> None:
    resultado = ConstructorDeterminista(max_chars=300).textos_a_embeber(
        METADATOS, FRAGMENTOS, secciones=["resultados", "texto_completo", "métodos"]
    )

    assert resultado.textos[0].startswith("Guía de mama | guideline | mama | resultados\n\n")
    assert resultado.textos[1].startswith("Guía de mama | guideline | mama\n\n")
    assert resultado.textos[2].startswith("Guía de mama | guideline | mama | métodos\n\n")


def test_determinista_sin_metadatos_deja_el_texto_original() -> None:
    resultado = ConstructorDeterminista(max_chars=300).textos_a_embeber(None, FRAGMENTOS)

    assert resultado.textos == ("uno", "dos", "tres")


def test_la_fabrica_devuelve_el_constructor_de_la_variante() -> None:
    generador = GeneradorDeContextoFalso()

    assert isinstance(
        constructor_de_contexto(VarianteDeContexto.NINGUNO, max_chars=300), ConstructorNinguno
    )
    assert isinstance(
        constructor_de_contexto(VarianteDeContexto.DETERMINISTA, max_chars=300),
        ConstructorDeterminista,
    )
    assert isinstance(
        constructor_de_contexto(
            VarianteDeContexto.LLM,
            max_chars=300,
            generador=generador,
            doc_max_chars=100,
            concurrencia=2,
        ),
        ConstructorConLlm,
    )


def test_la_fabrica_rechaza_la_variante_llm_sin_generador() -> None:
    with pytest.raises(ValueError, match="generador"):
        constructor_de_contexto(VarianteDeContexto.LLM, max_chars=300)


def _con_llm(
    generador: GeneradorDeContextoFalso, *, doc_max_chars: int = 1000, concurrencia: int = 1
) -> ConstructorConLlm:
    return ConstructorConLlm(
        generador=generador, max_chars=300, doc_max_chars=doc_max_chars, concurrencia=concurrencia
    )


def test_llm_compone_el_prefijo_determinista_la_frase_y_el_original() -> None:
    generador = GeneradorDeContextoFalso()

    resultado = _con_llm(generador).textos_a_embeber(METADATOS, FRAGMENTOS)

    assert resultado.textos == tuple(
        f"{BASE}{PREFIJO_DE_FRASE_DE_TEST}{n}\n\n{f}" for n, f in enumerate(FRAGMENTOS, start=1)
    )


def test_llm_deja_el_determinista_cuando_no_hay_frase_y_cuenta_cada_motivo_por_separado() -> None:
    guion = [frase_valida(1), SALIDA_INVALIDA, FraseDeContexto(None, MOTIVO_LLM_NO_DISPONIBLE)]

    resultado = _con_llm(GeneradorDeContextoFalso(guion)).textos_a_embeber(METADATOS, FRAGMENTOS)

    assert resultado.textos[1:] == (f"{BASE}dos", f"{BASE}tres")
    assert resultado.respaldo_por_salida_invalida == 1
    assert resultado.respaldo_por_llm_no_disponible == 1


def test_llm_con_pendientes_llama_solo_por_esos_chunks_y_el_inicio_del_documento_sale_de_todos() -> (
    None
):
    generador = GeneradorDeContextoFalso()

    resultado = _con_llm(generador).textos_a_embeber(METADATOS, FRAGMENTOS, pendientes=[1, 2])

    assert [chunk for _, chunk in generador.llamadas] == ["dos", "tres"]
    assert {e.inicio_del_documento for e, _ in generador.llamadas} == {
        inicio_del_documento(enumerate(FRAGMENTOS), 1000)
    }
    assert len(resultado.textos) == 2


def test_llm_recorta_el_inicio_del_documento_al_limite_de_configuracion() -> None:
    generador = GeneradorDeContextoFalso()

    _con_llm(generador, doc_max_chars=5).textos_a_embeber(METADATOS, FRAGMENTOS)

    assert {e.inicio_del_documento for e, _ in generador.llamadas} == {"uno\nd"}


def test_llm_con_concurrencia_conserva_el_orden_de_los_chunks() -> None:
    generador = GeneradorDeContextoFalso()

    resultado = _con_llm(generador, concurrencia=3).textos_a_embeber(METADATOS, FRAGMENTOS)

    assert len(generador.llamadas) == 3
    for texto, original in zip(resultado.textos, FRAGMENTOS, strict=True):
        assert texto.endswith(f"\n\n{original}")
