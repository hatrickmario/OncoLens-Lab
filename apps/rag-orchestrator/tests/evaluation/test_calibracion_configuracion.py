"""Las grillas de calibración del S5 viven en la configuración versionada (US-120 AC-5, RN-22), no en el código."""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from app.evaluation.config_suite import ConfigInvalida, cargar_config_suite
from tests.evaluation.conftest import RAIZ_APP

CONFIG = RAIZ_APP / "eval" / "configs" / "test-fake.yaml"
S5 = RAIZ_APP / "eval" / "configs" / "s5-calibracion.yaml"


def con_barrido(tmp_path: Path, **cambios: object) -> Path:
    crudo = yaml.safe_load(CONFIG.read_text(encoding="utf-8"))
    crudo["barrido"].update(cambios)
    ruta = tmp_path / "config.yaml"
    ruta.write_text(yaml.safe_dump(crudo), encoding="utf-8")
    return ruta


def test_la_configuracion_del_s5_declara_las_grillas_y_su_provisional_esta_en_ellas() -> None:
    config = cargar_config_suite(S5)

    barrido = config.barrido
    assert barrido is not None and config.proveedor == "local"
    assert barrido.nli_entailment_threshold_grid == (0.5, 0.6, 0.7, 0.8, 0.9)
    assert barrido.retrieval_top_k_grid == (10, 20, 30, 50)
    assert barrido.retrieval_top_k_recall_tolerance == 0.02
    assert config.umbrales.nli_entailment_threshold in barrido.nli_entailment_threshold_grid
    assert config.umbrales.retrieval_top_k in barrido.retrieval_top_k_grid


def test_las_grillas_de_calibracion_son_opcionales_en_una_configuracion_sin_ellas() -> None:
    barrido = cargar_config_suite(CONFIG).barrido

    assert barrido is not None
    assert (barrido.nli_entailment_threshold_grid, barrido.retrieval_top_k_grid) == ((), ())
    assert barrido.retrieval_top_k_recall_tolerance is None


@pytest.mark.parametrize(
    ("cambio", "clave"),
    [
        ({"nli_entailment_threshold_grid": [0.5, 1.5]}, "barrido.nli_entailment_threshold_grid"),
        (
            {"retrieval_top_k_grid": [10, 0], "retrieval_top_k_recall_tolerance": 0.02},
            "barrido.retrieval_top_k_grid",
        ),
        ({"retrieval_top_k_grid": [10, 20]}, "barrido.retrieval_top_k_recall_tolerance"),
        (
            {"retrieval_top_k_grid": [10], "retrieval_top_k_recall_tolerance": 2},
            "barrido.retrieval_top_k_recall_tolerance",
        ),
        ({"retrieval_p95_maximo_ms": 0}, "barrido.retrieval_p95_maximo_ms"),
    ],
)
def test_una_calibracion_invalida_se_rechaza_nombrando_la_clave_sin_echar_el_valor(
    tmp_path: Path, cambio: dict[str, object], clave: str
) -> None:
    with pytest.raises(ConfigInvalida) as error:
        cargar_config_suite(con_barrido(tmp_path, **cambio))

    assert clave in str(error.value)


def test_el_numero_de_corridas_del_p95_vive_en_la_configuracion_y_es_opcional() -> None:
    assert cargar_config_suite(S5).p95_corridas == 3
    assert cargar_config_suite(CONFIG).p95_corridas is None


@pytest.mark.parametrize("valor", [0, -1, "tres", 2.5])
def test_un_numero_de_corridas_del_p95_invalido_se_rechaza_nombrando_la_clave(
    tmp_path: Path, valor: object
) -> None:
    crudo = yaml.safe_load(CONFIG.read_text(encoding="utf-8"))
    crudo["medicion"]["p95_corridas"] = valor
    ruta = tmp_path / "config.yaml"
    ruta.write_text(yaml.safe_dump(crudo), encoding="utf-8")

    with pytest.raises(ConfigInvalida) as error:
        cargar_config_suite(ruta)

    assert "medicion.p95_corridas" in str(error.value)
