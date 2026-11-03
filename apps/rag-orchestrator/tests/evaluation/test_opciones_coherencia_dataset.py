"""Coherencia del dataset `opciones` con las fakes: la verdad conocida de un humano es lo que la corrida da (US-140)."""

from __future__ import annotations

import asyncio

from app.evaluation.config_opciones import cargar_config_opciones
from app.evaluation.config_suite import cargar_config_suite
from app.evaluation.corrida_opciones import medir_opciones
from app.evaluation.dataset_opciones import cargar_dataset_opciones
from app.evaluation.envoltorios import pico_rss_mib
from app.evaluation.modelos_locales import OrigenLocal
from tests.evaluation.conftest import RAIZ_APP
from tests.support.fakes import RelojFijo

FALSA = RAIZ_APP / "eval" / "configs" / "opciones-fake.yaml"


def test_dataset_orden_esperado_coincide_con_el_orden_que_da_la_corrida_falsa() -> None:
    """La verdad conocida del dataset es coherente con las fakes: el orden de RN-28 que fijó un humano es el que sale."""
    suite = cargar_config_suite(FALSA, {})
    config = cargar_config_opciones(FALSA, suite)
    dataset = cargar_dataset_opciones(config.suite.dataset)

    medido = asyncio.run(
        medir_opciones(config, dataset, RelojFijo(), OrigenLocal({}, None, pico_rss_mib))
    )

    for analisis in medido.analisis:
        primera_fuente = tuple(o.documentos[0] for o in analisis.opciones)
        assert primera_fuente == dataset.caso_de(analisis.caso).orden_esperado, analisis.caso
