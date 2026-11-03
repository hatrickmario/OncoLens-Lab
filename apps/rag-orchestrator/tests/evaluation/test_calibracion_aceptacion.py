"""Aceptación de los barridos de ``NLI_ENTAILMENT_THRESHOLD`` y ``RETRIEVAL_TOP_K`` (US-120 AC-5, ARR-03 AC-5), con FX-T5a-a y
adapters falsos; los valores definitivos salen de la corrida nocturna con modelos locales (D5-08)."""

from __future__ import annotations

import re
from pathlib import Path

import pytest
import yaml

from app.evaluation.evaluate import main
from tests.evaluation.conftest import RAIZ_APP
from tests.evaluation.test_proveedor_local_aceptacion import config_local
from tests.support.fakes import RelojFijo
from tests.support.modelos import crear_entorno_de_modelos

CONFIG = RAIZ_APP / "eval" / "configs" / "test-fake.yaml"
GRILLA_NLI = [0.5, 0.7, 0.9]
GRILLA_TOP_K = [10, 20, 40]
CELDAS = r"([\d.]+|n/a) \| ([\d.]+|n/a) \| ([\d.]+|n/a) \| ([\d.]+|n/a) \| ([\d.]+|n/a)"


def con_grillas(origen: Path, destino: Path) -> Path:
    """La configuración dada con las grillas y la tolerancia de calibración del S5 en ``barrido``."""
    crudo = yaml.safe_load(origen.read_text(encoding="utf-8"))
    crudo["barrido"].update(
        {
            "nli_entailment_threshold_grid": GRILLA_NLI,
            "retrieval_top_k_grid": GRILLA_TOP_K,
            "retrieval_top_k_recall_tolerance": 0.02,
        }
    )
    ruta = destino / "calibracion.yaml"
    ruta.write_text(yaml.safe_dump(crudo), encoding="utf-8")
    return ruta


def barrer(
    parametro: str, salida: Path, config: Path, entorno: dict[str, str] | None = None
) -> int:
    return main(
        ["--config", str(config), "--sweep", parametro, "--salida", str(salida)],
        reloj=RelojFijo(),
        entorno=entorno,
        directorio_de_configs=config.parent,
    )


def filas(informe: str, patron_del_valor: str) -> dict[str, list[str]]:
    encontradas = re.findall(rf"^\| ({patron_del_valor}) \| {CELDAS} \|$", informe, re.MULTILINE)
    return {fila[0]: list(fila[1:]) for fila in encontradas}


@pytest.mark.ac("US-120", 5)
@pytest.mark.parametrize(
    ("parametro", "patron", "valores"),
    [
        ("nli_entailment_threshold", r"\d\.\d{2}", ["0.50", "0.70", "0.90"]),
        ("retrieval_top_k", r"\d+", ["10", "20", "40"]),
    ],
)
def test_barrido_reporta_la_tabla_por_valor_el_elegido_y_es_reproducible_cuando_se_barre_la_grilla(
    tmp_path: Path, parametro: str, patron: str, valores: list[str]
) -> None:
    """[US-120 AC-5] Cada barrido da fidelidad, precisión de citas, «sin evidencia», recall@10 y MRR por valor, el elegido con su
    justificación, y dos ejecuciones producen el mismo informe."""
    config = con_grillas(CONFIG, tmp_path)
    antes = config.read_bytes()

    primero = barrer(parametro, tmp_path / "uno", config)
    segundo = barrer(parametro, tmp_path / "dos", config)

    assert (primero, segundo) == (0, 0)
    informe = (tmp_path / "uno" / f"S5-barrido-{parametro}.md").read_text(encoding="utf-8")
    assert list(filas(informe, patron)) == valores
    assert "Elegido:" in informe and "Justificación:" in informe
    for sufijo in ("md", "json"):
        nombre = f"S5-barrido-{parametro}.{sufijo}"
        assert (tmp_path / "uno" / nombre).read_bytes() == (tmp_path / "dos" / nombre).read_bytes()
    assert config.read_bytes() == antes  # los valores definitivos los escribe 7.1, no el barrido


@pytest.mark.ac("US-120", 5)
@pytest.mark.parametrize("parametro", ["nli_entailment_threshold", "retrieval_top_k"])
def test_barrido_termina_distinto_de_cero_nombrando_la_variable_y_sin_tocar_la_configuracion_cuando_faltan_los_pesos(
    tmp_path: Path, parametro: str, capsys: pytest.CaptureFixture[str]
) -> None:
    """[US-120 AC-5] Sin los pesos de un modelo con ``proveedor: local`` no se escriben cifras ni se modifica la configuración."""
    entorno = crear_entorno_de_modelos(tmp_path / "pesos").con(NLI_MODEL_PATH=None)
    config = con_grillas(config_local(tmp_path), tmp_path)
    antes = config.read_bytes()

    codigo = barrer(parametro, tmp_path / "salida", config, entorno)

    assert codigo != 0
    assert "NLI_MODEL_PATH" in capsys.readouterr().err
    assert not (tmp_path / "salida").exists() and config.read_bytes() == antes
