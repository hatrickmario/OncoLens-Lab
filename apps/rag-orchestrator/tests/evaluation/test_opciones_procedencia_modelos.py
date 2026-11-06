"""Procedencia de modelos en el reporte de la familia `opciones` (D5-55, US-142 AC-6).

El registro de G-Demo exige los modelos de embeddings, reranker y NLI que respondieron; la familia solo escribía el LLM.
Adapters falsos y reloj congelado: se corre la familia real y se compara con el ``meta`` de la respuesta.
"""

from __future__ import annotations

import asyncio

from app.evaluation.config_opciones import cargar_config_opciones
from app.evaluation.config_suite import cargar_config_suite
from app.evaluation.corrida import evaluar_pregunta_en_servicio
from app.evaluation.corrida_opciones import (
    medir_opciones,
    servicio_de_la_familia,
    solicitud_del_caso,
)
from app.evaluation.dataset_opciones import cargar_dataset_opciones
from app.evaluation.modelos_locales import OrigenLocal
from tests.evaluation.test_opciones_aceptacion import CONFIG, correr
from tests.support.fakes import RelojFijo


def _modelos_que_respondieron() -> dict[str, str]:
    config = cargar_config_opciones(CONFIG, cargar_config_suite(CONFIG, {}))
    dataset = cargar_dataset_opciones(config.suite.dataset)
    origen = OrigenLocal({}, None, lambda: 0.0)
    servicio = servicio_de_la_familia(config, dataset, RelojFijo(), origen)
    pregunta = dataset.base.preguntas[0]
    base = solicitud_del_caso(dataset.contextos[dataset.caso_de(pregunta.id).paciente])
    _, respuesta = asyncio.run(
        evaluar_pregunta_en_servicio(servicio, dataset.base, base, pregunta, 0, config.max_options)
    )
    meta = respuesta.meta
    return {
        "embeddings": meta.embeddingModel,
        "reranker": meta.rerankerModel,
        "nli": meta.nliModel,
    }


def test_reporte_de_opciones_trae_los_modelos_de_embeddings_reranker_y_nli_cuando_la_familia_responde(
    tmp_path,
) -> None:
    esperados = _modelos_que_respondieron()

    _, reporte = correr(tmp_path)

    modelos = reporte["configuracion"]["modelos"]
    assert {k: modelos.get(k) for k in esperados} == esperados
    assert modelos["llm"]


def test_medir_opciones_conserva_los_modelos_del_meta_cuando_hay_respuesta() -> None:
    config = cargar_config_opciones(CONFIG, cargar_config_suite(CONFIG, {}))
    dataset = cargar_dataset_opciones(config.suite.dataset)

    medida = asyncio.run(
        medir_opciones(config, dataset, RelojFijo(), OrigenLocal({}, None, lambda: 0.0))
    )

    assert set(medida.modelos_respondidos) == {"embeddings", "reranker", "nli"}
