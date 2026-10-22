"""La grilla, la referencia y la tolerancia del barrido viven en la configuración versionada (RN-22), no en el código."""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from app.evaluation.config_suite import ConfigInvalida, cargar_config_suite
from app.evaluation.corrida_barrido import fijar_umbral_en_config
from tests.evaluation.conftest import RAIZ_APP
from tests.evaluation.test_barrido_gate2 import generar_informe

CONFIG = RAIZ_APP / "eval" / "configs" / "test-fake.yaml"


def con_barrido(tmp_path: Path, **cambios: object) -> Path:
    crudo = yaml.safe_load(CONFIG.read_text(encoding="utf-8"))
    crudo["barrido"].update(cambios)
    ruta = tmp_path / "config.yaml"
    ruta.write_text(yaml.safe_dump(crudo), encoding="utf-8")
    return ruta


def test_la_configuracion_de_la_ci_declara_la_grilla_y_la_referencia_en_la_grilla() -> None:
    barrido = cargar_config_suite(CONFIG).barrido

    assert barrido is not None
    assert barrido.umbral_de_referencia in barrido.grilla
    assert (barrido.tolerancia_recall, len(barrido.grilla)) == (0.05, 9)


@pytest.mark.parametrize(
    "cambio",
    [
        {"relevance_threshold_grid": []},
        {"relevance_threshold_grid": [0.2, 1.5]},
        {"umbral_de_referencia": 0.35},
        {"tolerancia_recall": 2},
    ],
)
def test_una_seccion_de_barrido_invalida_se_rechaza_sin_echar_el_valor(
    tmp_path: Path, cambio: dict[str, object]
) -> None:
    with pytest.raises(ConfigInvalida) as error:
        cargar_config_suite(con_barrido(tmp_path, **cambio))

    assert "barrido." in str(error.value)


def test_fijar_umbral_reescribe_solo_el_valor_y_conserva_los_comentarios(tmp_path: Path) -> None:
    ruta = tmp_path / "config.yaml"
    ruta.write_text(CONFIG.read_text(encoding="utf-8"), encoding="utf-8")

    fijar_umbral_en_config(ruta, 0.45, directorio_de_configs=tmp_path)

    antes, despues = CONFIG.read_text(encoding="utf-8"), ruta.read_text(encoding="utf-8")
    assert cargar_config_suite(ruta).umbrales.relevance_threshold == 0.45
    assert [l for l in despues.splitlines() if "relevance_threshold:" not in l] == [
        l for l in antes.splitlines() if "relevance_threshold:" not in l
    ]


def test_fijar_umbral_falla_cuando_la_configuracion_no_tiene_el_valor(tmp_path: Path) -> None:
    ruta = tmp_path / "config.yaml"
    ruta.write_text("umbrales: {}\n", encoding="utf-8")

    with pytest.raises(ConfigInvalida):
        fijar_umbral_en_config(ruta, 0.4, directorio_de_configs=tmp_path)


def test_el_json_del_baseline_cumple_la_lista_blanca_y_rechaza_claves_ajenas(
    tmp_path: Path,
) -> None:
    from app.evaluation.informe_baseline import ESQUEMA_BASELINE
    from app.evaluation.reporte import ReporteFueraDeEsquema, validar_esquema_cerrado

    reporte = generar_informe(tmp_path)[1]
    validar_esquema_cerrado(reporte, ESQUEMA_BASELINE)

    with pytest.raises(ReporteFueraDeEsquema):
        validar_esquema_cerrado({**reporte, "texto": 1}, ESQUEMA_BASELINE)
    with pytest.raises(ReporteFueraDeEsquema):
        validar_esquema_cerrado(
            {**reporte, "metricasPorCancer": {"paciente-x": reporte["metricasPorCancer"]["mama"]}},
            ESQUEMA_BASELINE,
        )


def test_el_barrido_se_niega_con_un_dataset_que_no_es_sintetico() -> None:
    from app.evaluation.corrida_barrido import exigir_dataset_sintetico
    from app.evaluation.guardas import SuiteAbortada

    exigir_dataset_sintetico("sintetico")
    with pytest.raises(SuiteAbortada):
        exigir_dataset_sintetico("real_anonimizado")
