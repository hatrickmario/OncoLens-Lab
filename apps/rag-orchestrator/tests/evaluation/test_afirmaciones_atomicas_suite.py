"""La suite `evaluate` cablea CLAIM_MAX_WORDS desde su configuración (US-245, RN-22)."""

from __future__ import annotations

from pathlib import Path

import yaml

from app.evaluation.composicion_suite import parametros_de_recuperacion
from app.evaluation.config_suite import cargar_config_suite
from tests.evaluation.conftest import RAIZ_APP

CONFIG = RAIZ_APP / "eval" / "configs" / "test-fake.yaml"


def _config_con_claim_max_words(tmp_path: Path, valor: int):
    crudo = yaml.safe_load(CONFIG.read_text(encoding="utf-8"))
    crudo["umbrales"]["claim_max_words"] = valor
    ruta = tmp_path / "config.yaml"
    ruta.write_text(yaml.safe_dump(crudo), encoding="utf-8")
    return cargar_config_suite(ruta)


def test_la_suite_lee_claim_max_words_de_la_configuracion_y_lo_entrega_a_los_parametros(
    tmp_path: Path,
) -> None:
    config = _config_con_claim_max_words(tmp_path, 15)

    assert config.umbrales.claim_max_words == 15
    assert parametros_de_recuperacion(config, ("mama",)).claim_max_words == 15


def test_la_suite_usa_el_valor_inicial_cuando_la_configuracion_no_declara_claim_max_words() -> None:
    config = cargar_config_suite(CONFIG)

    assert parametros_de_recuperacion(config, ("mama",)).claim_max_words == 20
