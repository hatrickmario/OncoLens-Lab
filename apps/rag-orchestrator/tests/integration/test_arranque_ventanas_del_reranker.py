"""La composición pasa ``RERANKER_CHUNK_WINDOWS`` y ``RERANKER_WINDOW_OVERLAP`` al reranker real (US-278 AC-1, AC-2).

Los pesos son archivos sintéticos verificados de verdad; solo la sesión y el tokenizer son dobles (RN-14).
"""

from __future__ import annotations

from pathlib import Path

import pytest

from app.application.ports import ChunkEncontrado
from tests.support.modelos import (
    EntornoDeModelos,
    construir_modelos_con_dobles,
    crear_entorno_de_modelos,
)

PREGUNTA = "her2 mama"
# Más largo que RERANKER_MAX_LENGTH (512 en los valores de prueba); la evidencia está solo al final.
PASAJE = " ".join(f"relleno{i}" for i in range(700)) + " her2 mama"


@pytest.fixture
def modelos(tmp_path: Path) -> EntornoDeModelos:
    return crear_entorno_de_modelos(tmp_path / "modelos")


def _puntaje_del_chunk_largo(modelos: EntornoDeModelos, **ajustes: object) -> float:
    cargados = construir_modelos_con_dobles(modelos, **ajustes)
    candidato = ChunkEncontrado(
        chunk_id="c", document_id="d", chunk_text=PASAJE, similitud_dense=0.5
    )
    return cargados.reranker.puntuar(PREGUNTA, [candidato])[0]


@pytest.mark.ac("US-278", 2)
def test_el_reranker_compuesto_puntua_solo_la_primera_ventana_cuando_el_entorno_no_define_el_modo(
    modelos: EntornoDeModelos,
) -> None:
    # logit del doble = 2 * palabras compartidas - 4; la primera ventana no tiene ninguna compartida: sigmoide(-4)
    assert _puntaje_del_chunk_largo(modelos) == pytest.approx(0.01798620996209156)


@pytest.mark.ac("US-278", 1)
def test_el_reranker_compuesto_puntua_la_ventana_final_cuando_el_modo_es_maximo(
    modelos: EntornoDeModelos,
) -> None:
    # la última ventana trae las dos palabras de la pregunta: logit 0 -> sigmoide(0)
    assert _puntaje_del_chunk_largo(
        modelos, reranker_chunk_windows="maximo", reranker_window_overlap=64
    ) == pytest.approx(0.5)


def test_el_reranker_compuesto_falla_cerrado_cuando_el_solape_no_deja_avanzar_la_ventana_de_la_sesion(
    modelos: EntornoDeModelos,
) -> None:
    """Un solape que `Settings` aceptó (menor que RERANKER_MAX_LENGTH) pero no deja capacidad útil tras la pregunta."""
    from app.application.ports import FalloDeInferencia

    with pytest.raises(FalloDeInferencia):
        _puntaje_del_chunk_largo(
            modelos, reranker_chunk_windows="maximo", reranker_window_overlap=510
        )
