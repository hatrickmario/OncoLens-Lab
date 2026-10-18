"""Latencia por etapa con los pesos reales (US-231a AC-9, NFR-01, ADR-39).

Medición LOCAL (marcador ``models``), no una compuerta de la CI: 3 corridas cronometradas tras un calentamiento, mediana
y comparación con el presupuesto. El informe se escribe SIEMPRE antes de afirmar, para que un exceso quede a la vista
del refinamiento. ``MODEL_LATENCY_REPORT`` fija la ruta del JSON (por defecto, el directorio temporal del test).
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path

import pytest

from app.application.ports import ChunkEncontrado
from tests.support.inferencia_falsa import CH_C_1, Q_HER2
from tests.support.latencia import Etapa, informe_de_latencia, medir_etapa
from tests.support.modelos import cargar_modelos_reales

PRESUPUESTO_EMBEDDINGS_MS = 500.0
PRESUPUESTO_RERANKER_MS = 4500.0  # 12 pares de RERANKER_MAX_LENGTH tokens (ADR-39)
PARES = 12
TEXTO_LARGO = " ".join(
    [CH_C_1] * 100
)  # ch-largo-1: mucho más que RERANKER_MAX_LENGTH, el peor caso del recorte


@pytest.mark.models
@pytest.mark.ac("US-231a", 9)
def test_la_mediana_de_cada_etapa_queda_dentro_de_su_presupuesto_y_el_informe_la_reporta(
    tmp_path: Path,
) -> None:
    modelos = cargar_modelos_reales()
    candidatos = [
        ChunkEncontrado(
            chunk_id=f"c{i}", document_id="d", chunk_text=TEXTO_LARGO, similitud_dense=0.5
        )
        for i in range(PARES)
    ]

    informe = informe_de_latencia(
        [
            Etapa(
                "embeddings",
                medir_etapa(lambda: modelos.embedder_consulta.embeber(Q_HER2), time.perf_counter),
                PRESUPUESTO_EMBEDDINGS_MS,
            ),
            Etapa(
                "reranker",
                medir_etapa(
                    lambda: modelos.reranker.puntuar(Q_HER2, candidatos), time.perf_counter
                ),
                PRESUPUESTO_RERANKER_MS,
            ),
        ]
    )
    destino = Path(os.environ.get("MODEL_LATENCY_REPORT", tmp_path / "latencia.json"))
    destino.write_text(json.dumps(informe, indent=2), encoding="utf-8")
    print(json.dumps(informe, indent=2))

    fuera = {
        nombre: e["mediana_ms"] for nombre, e in informe.items() if not e["dentro_de_presupuesto"]
    }
    assert fuera == {}, f"etapas fuera de presupuesto (ver {destino.name}): {fuera}"
