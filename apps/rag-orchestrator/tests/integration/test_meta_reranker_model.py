"""Procedencia del reranker en ``meta.rerankerModel`` (US-231a AC-3, FR-25, RN-03).

El valor sale de la configuración (modelo, revisión y SHA-256), nunca del texto generado ni de releer el archivo.
"""

from __future__ import annotations

import pytest

from app.domain.modelos import describir_modelo
from app.infrastructure.reranker.bge_reranker import BgeReranker
from tests.support.contract import assert_matches_spec
from tests.support.inferencia_falsa import SesionDeLogitsFalsa, TokenizadorFalso
from tests.support.recuperacion import Q_HER2, Q_SIN, crear_entorno, solicitud_de

MODELO = "BAAI/bge-reranker-v2-m3"
REVISION = "rev-reranker-test"
SHA = "b" * 64
ESPERADO = f"{MODELO}@{REVISION}#sha256:{SHA}"


def _reranker_con_sesion_falsa(**sesion: object) -> BgeReranker:
    return BgeReranker(
        SesionDeLogitsFalsa(**sesion),  # type: ignore[arg-type]
        TokenizadorFalso(),
        version=describir_modelo(MODELO, REVISION, SHA),
        max_length=512,
        max_pairs=12,
        max_tokens_por_lote=4096,
    )


@pytest.mark.ac("US-231a", 3)
def test_meta_reranker_model_contiene_modelo_revision_y_hash_de_la_configuracion() -> None:
    entorno = crear_entorno(reranker=_reranker_con_sesion_falsa(constante=2.0))  # type: ignore[arg-type]

    respuesta = entorno.consultar(solicitud_de(Q_HER2))

    assert respuesta.status_code == 200
    assert_matches_spec("#/components/schemas/RagQueryInternalResponse", respuesta.json())
    assert [r.meta.rerankerModel for r in entorno.generador.recuperaciones] == [ESPERADO]


def test_meta_reranker_model_de_la_respuesta_sin_evidencia_tiene_la_misma_procedencia() -> None:
    entorno = crear_entorno(reranker=_reranker_con_sesion_falsa())  # type: ignore[arg-type]

    respuesta = entorno.consultar(solicitud_de(Q_SIN))

    assert respuesta.status_code == 200
    assert respuesta.json()["meta"]["rerankerModel"] == ESPERADO
    assert_matches_spec("#/components/schemas/RagQueryInternalResponse", respuesta.json())


@pytest.mark.models
@pytest.mark.ac("US-231a", 3)
def test_meta_reranker_model_con_los_pesos_reales_coincide_con_la_configuracion() -> None:
    from app.config.settings import Settings
    from tests.support.modelos import cargar_modelos_reales

    ajustes = Settings(_env_file=None)  # type: ignore[call-arg]
    assert ajustes.modelos is not None
    esperado = describir_modelo(
        ajustes.modelos.reranker_model,
        ajustes.modelos.reranker_model_revision,
        str(ajustes.reranker_model_sha256),
    )

    assert cargar_modelos_reales().reranker.version == esperado
