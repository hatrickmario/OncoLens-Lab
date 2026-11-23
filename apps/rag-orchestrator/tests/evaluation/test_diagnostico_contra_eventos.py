"""Los observadores de la familia `diagnostico` no derivan de los eventos de producción (US-276, riesgo «deriva entre
observadores y eventos»): por pregunta, lo que el informe dice del corte a los pares coincide con lo que el servicio registra
en ``rag_query_corte`` (ids y puesto denso de lo cortado). La corrida es la real; los eventos se capturan con ``caplog``."""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path

import pytest

from app.evaluation.evaluate import main
from tests.evaluation.mundo_diagnostico import construir_mundo, par_de_cada_etapa
from tests.support.fakes import RelojFijo

EVENTO_DE_CORTE = re.compile(
    r"event=rag_query_corte traceId=\S+ recibidos=(?P<recibidos>\d+) descartados=(?P<descartados>\d+) "
    r"enviados=(?P<enviados>\d+)(?: cortados_omitidos=\d+)? cortados=(?P<cortados>\S*)"
)


def test_el_informe_coincide_con_rag_query_corte_en_lo_cortado_por_pregunta(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    mundo = construir_mundo(tmp_path, par_de_cada_etapa())
    caplog.set_level(logging.INFO, logger="app.application.rag_orchestrator_service")

    codigo = main(
        ["--config", str(mundo.config), "--suite", "diagnostico", "--salida", str(tmp_path / "s")],
        reloj=RelojFijo(),
        puertos_diagnostico=mundo.puertos,
    )

    assert codigo == 0
    preguntas = json.loads(next((tmp_path / "s").glob("*.json")).read_text(encoding="utf-8"))[
        "preguntas"
    ]
    eventos = [m for r in caplog.records if (m := EVENTO_DE_CORTE.search(r.getMessage()))]
    assert len(eventos) == len(
        preguntas
    )  # un evento de corte por consulta (un solo loop en el fixture)
    for fila, evento in zip(preguntas, eventos, strict=True):
        cortados = dict(c.split(":") for c in evento["cortados"].split(",") if c)
        if fila["entro_en_pares"] is False:
            assert cortados.get(fila["chunk_esperado"]) == str(fila["puesto_denso"]), fila[
                "pregunta_id"
            ]
        elif fila["entro_en_pares"] is True:
            assert fila["chunk_esperado"] not in cortados, fila["pregunta_id"]
        assert int(evento["descartados"]) == len(cortados)
