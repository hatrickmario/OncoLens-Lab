"""D6-37: los parámetros de recuperación de la suite fijan ``reranker_max_pairs`` como el *bootstrap* de producción (RN-22)."""

from __future__ import annotations

from pathlib import Path

from app.evaluation.composicion_suite import componer_servicio, parametros_de_recuperacion
from app.evaluation.config_suite import cargar_config_suite
from app.evaluation.cronometro import Cronometro, RelojSimulado
from app.evaluation.fuente_dataset import FuenteDatasetEnDirectorio
from app.evaluation.llamadas import RegistroDeLlamadas
from app.evaluation.modelos_locales import OrigenLocal, cargar_puertos_locales
from app.evaluation.rutas import raiz_repo
from app.infrastructure.clock.system_clock import RelojDelSistema
from tests.evaluation.test_proveedor_local_aceptacion import modelos_fingidos
from tests.evaluation.test_proveedor_local_unitarios import config_local
from tests.support.modelos import crear_entorno_de_modelos

CONFIG_FAKE = raiz_repo() / "apps/rag-orchestrator/eval/configs/chat-fake.yaml"


def test_los_parametros_de_la_suite_fake_no_fijan_tope_de_pares_cuando_el_reranker_no_limita() -> (
    None
):
    assert (
        parametros_de_recuperacion(cargar_config_suite(CONFIG_FAKE), ("mama",)).reranker_max_pairs
        is None
    )


def test_el_servicio_de_la_suite_local_lleva_el_tope_de_pares_de_adr_39_cuando_se_cargan_los_modelos(
    tmp_path: Path,
) -> None:
    entorno = crear_entorno_de_modelos(tmp_path / "pesos").variables
    config = config_local()
    puertos = cargar_puertos_locales(
        config,
        OrigenLocal(entorno, modelos_fingidos, lambda: 0.0),
        RegistroDeLlamadas(),
        "sintetico",
    )
    corpus = FuenteDatasetEnDirectorio(raiz_repo() / "data" / "evaluation" / "opciones").cargar()

    suite = componer_servicio(
        config, corpus, Cronometro(RelojSimulado()), RelojDelSistema(), puertos_locales=puertos
    )

    assert puertos.reranker_max_pairs == int(entorno["RERANKER_MAX_PAIRS"])
    assert suite.servicio._parametros.reranker_max_pairs == puertos.reranker_max_pairs  # noqa: SLF001
