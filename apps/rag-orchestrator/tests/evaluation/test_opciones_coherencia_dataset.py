"""Coherencia del dataset `opciones` con las fakes: la verdad conocida de un humano es lo que la corrida da (US-140)."""

from __future__ import annotations

import asyncio
import json

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


def test_dataset_de_prostata_no_pone_a_extension_en_no_coincide_con_el_catalogo_real() -> None:
    """SC-1 (l1d-126 D10): el catálogo real hace excluyente a `extension` (M0/M1 por componente), pero ninguna fuente de
    próstata del dataset declara la extensión (`estadio: no_disponible`) y los pacientes no traen M legible (T3a): sale
    «Desconocido», no «No coincide», y el orden esperado de OP-07…OP-12 no depende de C-1. Si un caso nuevo declara la
    extensión, el orden esperado debe salir del comparador con el catálogo mergeado (design S7-D4b)."""
    catalogo = json.loads(
        (RAIZ_APP.parents[1] / "packages/clinical-catalogs/prostata/aplicabilidad.json").read_text(
            encoding="utf-8"
        )
    )
    extension = next(c for c in catalogo["items"] if c["key"] == "extension")
    suite = cargar_config_suite(FALSA, {})
    dataset = cargar_dataset_opciones(cargar_config_opciones(FALSA, suite).suite.dataset)

    estadios_de_prostata = {
        documento: fuente.population_criteria["estadio"]
        for documento, fuente in dataset.poblaciones.items()
        if documento.startswith("doc-p")
    }

    assert extension["isExclusionary"] is True
    assert extension["rule"]["equivalenceMatch"] == "componente"
    assert set(estadios_de_prostata.values()) == {"no_disponible"}, estadios_de_prostata
