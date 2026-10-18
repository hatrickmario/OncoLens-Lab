"""Corte previo a los pares del reranker (US-231b AC-9, decisión 82 de S1-plan, ADR-39).

Milvus devuelve ``RETRIEVAL_TOP_K = 30`` candidatos y el reranker admite ``RERANKER_MAX_PAIRS = 12``: el servicio recorta
por puntaje de recuperación (desempate por ``chunk_id``) ANTES de reranquear y el reranker nunca recibe más de 12 pares.
"""

from __future__ import annotations

import logging
from dataclasses import replace

import pytest

from tests.support.contract import assert_matches_spec
from tests.support.recuperacion import (
    PARAMETROS_DE_PRUEBA,
    Q_HER2,
    BuscadorFalso,
    ChunkFx,
    RerankerFalso,
    crear_entorno,
    solicitud_de,
)

MAX_PARES = 12
RESPUESTA = "#/components/schemas/RagQueryInternalResponse"


def _chunk(chunk_id: str, similitud: float) -> ChunkFx:
    return ChunkFx(
        chunk_id,
        f"doc-{chunk_id}",
        f"texto sintético de {chunk_id}",
        [similitud, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        True,
        "mama",
    )


def _treinta_candidatos() -> list[ChunkFx]:
    """11 ganadores claros, 3 empatados en el borde (solo cabe uno) y 16 perdedores: 30 en total."""
    ganadores = [_chunk(f"w-{i:02d}", 0.90 - 0.01 * i) for i in range(11)]
    empatados = [_chunk(nombre, 0.50) for nombre in ("t-b", "t-a", "t-c")]
    perdedores = [_chunk(f"l-{i:02d}", 0.40 - 0.01 * i) for i in range(16)]
    return [*perdedores, *empatados, *ganadores]


def _entorno():
    parametros = replace(PARAMETROS_DE_PRUEBA, retrieval_top_k=30, reranker_max_pairs=MAX_PARES)
    return crear_entorno(
        parametros=parametros,
        buscador=BuscadorFalso(_treinta_candidatos()),
        reranker=RerankerFalso(max_pairs=MAX_PARES),
    )


@pytest.mark.ac("US-231b", 9)
def test_recorta_a_los_12_mejores_por_puntaje_de_recuperacion_con_desempate_por_chunk_id_antes_de_reranquear_cuando_hay_30_candidatos() -> (
    None
):
    entorno = _entorno()

    respuesta = entorno.consultar(solicitud_de(Q_HER2))

    assert respuesta.status_code == 200
    assert_matches_spec(RESPUESTA, respuesta.json())
    esperados = [f"w-{i:02d}" for i in range(11)] + ["t-a"]
    assert entorno.reranker.candidatos_recibidos == [esperados]
    assert respuesta.json()["retrievalStats"]["retrieved"] == 30


@pytest.mark.ac("US-231b", 9)
def test_el_log_de_la_etapa_de_corte_registra_solo_recuentos_sin_ids_ni_texto(
    caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.set_level(logging.INFO)

    _entorno().consultar(solicitud_de(Q_HER2))

    registros = [r.getMessage() for r in caplog.records if "rag_query_corte" in r.getMessage()]
    assert len(registros) == 1
    assert "recibidos=30" in registros[0]
    assert "descartados=18" in registros[0] and "enviados=12" in registros[0]
    assert "w-" not in registros[0] and "texto sintético" not in registros[0]


def test_con_menos_candidatos_que_pares_no_se_recorta_nada() -> None:
    parametros = replace(PARAMETROS_DE_PRUEBA, retrieval_top_k=30, reranker_max_pairs=MAX_PARES)
    entorno = crear_entorno(
        parametros=parametros,
        buscador=BuscadorFalso(_treinta_candidatos()[:5]),
        reranker=RerankerFalso(max_pairs=MAX_PARES),
    )

    respuesta = entorno.consultar(solicitud_de(Q_HER2))

    assert respuesta.status_code == 200
    assert len(entorno.reranker.candidatos_recibidos[0]) == 5


def test_sin_tope_de_pares_configurado_el_servicio_no_recorta() -> None:
    entorno = crear_entorno(
        parametros=replace(PARAMETROS_DE_PRUEBA, retrieval_top_k=30, reranker_max_pairs=None),
        buscador=BuscadorFalso(_treinta_candidatos()),
        reranker=RerankerFalso(),
    )

    entorno.consultar(solicitud_de(Q_HER2))

    assert len(entorno.reranker.candidatos_recibidos[0]) == 30
