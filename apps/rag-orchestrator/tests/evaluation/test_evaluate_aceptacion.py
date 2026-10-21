"""Aceptación del runner `evaluate` con FX-T5a-a (US-072a): reporte, reproducibilidad, rótulo y datos sintéticos."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
import yaml

from app.evaluation.evaluate import main
from tests.evaluation.conftest import RAIZ_APP
from tests.support.fakes import RelojFijo

CONFIG = RAIZ_APP / "eval" / "configs" / "test-fake.yaml"
ETAPAS = {
    "idioma",
    "catalogo",
    "embeddings",
    "busqueda",
    "reranker",
    "generacion",
    "nli",
    "consulta",
}


def correr(salida: Path, *extra: str, config: Path = CONFIG) -> int:
    return main(
        [
            "--config",
            str(config),
            "--suite",
            "all",
            "--report",
            "json",
            "--salida",
            str(salida),
            *extra,
        ],
        reloj=RelojFijo(),
    )


@pytest.mark.ac("US-072", 1)
def test_evaluate_con_fx_t5a_a_escribe_el_reporte_con_metricas_y_configuracion(
    tmp_path: Path,
) -> None:
    codigo = correr(tmp_path)

    archivos = list(tmp_path.glob("*.json"))
    assert (codigo, len(archivos)) == (0, 1)
    reporte = json.loads(archivos[0].read_text(encoding="utf-8"))
    configuracion = reporte["configuracion"]
    assert archivos[0].name == f"2026-10-16-{configuracion['hashConfig']}.json"
    completa = reporte["metricas"]["completa"]
    assert completa["recuperacion"]["total"]["n"] == 4
    assert completa["recuperacion"]["es_a_en"]["n"] == 2
    assert completa["recuperacion"]["total"]["recall_at_10"] is not None
    assert completa["citas"]["precision"] == pytest.approx(
        4 / 5
    )  # 5 citas propuestas, 1 a un chunk no recuperado
    assert completa["sin_evidencia"]["exactitud"] == 1.0
    assert completa["opciones_con_cita_y_soporte"]["porcentaje"] == pytest.approx(3 / 5)
    assert set(reporte["latencia_p95_ms"]) == ETAPAS
    assert {"modelos", "promptVersion", "umbrales", "corpusRelease", "catalogVersion"} <= set(
        configuracion
    )


@pytest.mark.ac("US-072", 2)
def test_dos_corridas_con_la_misma_configuracion_dan_el_mismo_reporte_y_la_misma_huella(
    tmp_path: Path,
) -> None:
    primera, segunda = tmp_path / "a", tmp_path / "b"

    codigos = (correr(primera), correr(segunda))

    reportes = [next(d.glob("*.json")) for d in (primera, segunda)]
    assert codigos == (0, 0)
    assert reportes[0].name == reportes[1].name
    assert reportes[0].read_bytes() == reportes[1].read_bytes()


def config_con(tmp_path: Path, **cambios: object) -> Path:
    crudo = yaml.safe_load(CONFIG.read_text(encoding="utf-8"))
    crudo["dataset"].update(cambios)
    ruta = tmp_path / "config.yaml"
    ruta.write_text(yaml.safe_dump(crudo), encoding="utf-8")
    return ruta


def particion_con_prueba(tmp_path: Path, ids: list[str]) -> Path:
    directorio = tmp_path / "particion"
    directorio.mkdir()
    (directorio / "particion.yaml").write_text(
        yaml.safe_dump({"clase": "sintetico", "asignacion": {"prueba": ids}}), encoding="utf-8"
    )
    return directorio


def test_la_prueba_congelada_no_se_evalua_sin_la_marca_final_y_no_escribe_resultados(
    tmp_path: Path,
) -> None:
    config = config_con(
        tmp_path, subconjunto="prueba", particion=str(particion_con_prueba(tmp_path, ["FX-01"]))
    )
    salida = tmp_path / "salida"

    codigo = correr(salida, config=config)

    assert codigo != 0
    assert not salida.exists()


def test_la_prueba_congelada_se_evalua_con_la_marca_final_solo_sobre_su_subconjunto(
    tmp_path: Path,
) -> None:
    ids = ["FX-01", "FX-02", "FX-05"]
    config = config_con(
        tmp_path, subconjunto="prueba", particion=str(particion_con_prueba(tmp_path, ids))
    )

    codigo = correr(tmp_path / "salida", "--prueba-final", config=config)

    reporte = json.loads(next((tmp_path / "salida").glob("*.json")).read_text(encoding="utf-8"))
    assert codigo == 0
    assert reporte["metricas"]["completa"]["recuperacion"]["total"]["n"] == 2


@pytest.mark.parametrize("familia", ["pii", "ocr", "desconocida"])
def test_una_familia_no_disponible_termina_con_codigo_2_sin_escribir_resultados(
    tmp_path: Path, familia: str
) -> None:
    codigo = main(
        ["--config", str(CONFIG), "--suite", familia, "--salida", str(tmp_path / "s")],
        reloj=RelojFijo(),
    )

    assert codigo == 2
    assert not (tmp_path / "s").exists()


def test_la_familia_retrieval_calcula_solo_la_recuperacion(tmp_path: Path) -> None:
    main(
        ["--config", str(CONFIG), "--suite", "retrieval", "--salida", str(tmp_path)],
        reloj=RelojFijo(),
    )

    reporte = json.loads(next(tmp_path.glob("*.json")).read_text(encoding="utf-8"))
    assert set(reporte["metricas"]["completa"]) == {"recuperacion"}
