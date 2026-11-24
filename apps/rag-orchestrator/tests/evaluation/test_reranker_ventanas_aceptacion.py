"""Aceptación de la comparación de los brazos del reranker (US-278 AC-4, AC-5; ADR-39, ADR-45 P1, P6).

Todo con adapters falsos (el reranker falso cuenta palabras como tokens): la corrida con modelos locales es de la corrida
final del S7. Las cifras de estos tests no dicen nada del RAG real.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
import yaml

from app.evaluation.evaluate import main
from tests.evaluation.conftest import RAIZ_APP
from tests.support.fakes import RelojFijo

CONFIG = RAIZ_APP / "eval" / "configs" / "s7-reranker-ventanas-fake.yaml"
BRAZOS = ["A0", "A0-maximo", "A0-longitud-ampliada"]
LIMITE_DE_MEMORIA = {"STACK_MEMORY_LIMIT_GB": "30"}


def correr(config: Path, salida: Path, *extra: str, entorno: dict[str, str] | None = None) -> int:
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
        entorno={**LIMITE_DE_MEMORIA, **(entorno or {})},
    )


def brazos_del_informe(salida: Path) -> dict[str, dict[str, Any]]:
    archivos = list(salida.glob("*.json"))
    assert len(archivos) == 1, "la corrida debía escribir un solo informe"
    comparacion = json.loads(archivos[0].read_text(encoding="utf-8"))["comparacion_recuperacion"]
    return {b["nombre"]: b for b in comparacion["brazos"]}


def config_con(tmp_path: Path, **cambios: Any) -> Path:
    crudo = yaml.safe_load(CONFIG.read_text(encoding="utf-8"))
    for ruta, valor in cambios.items():
        destino = crudo
        *camino, hoja = ruta.split(".")
        for parte in camino:
            destino = destino[parte]
        destino[hoja] = valor
    ruta_config = tmp_path / "config.yaml"
    ruta_config.write_text(yaml.safe_dump(crudo), encoding="utf-8")
    return ruta_config


@pytest.mark.ac("US-278", 4)
def test_el_informe_trae_las_metricas_del_reranker_por_brazo_y_su_diferencia_frente_a_primera_cuando_se_comparan_primera_y_maximo(
    tmp_path: Path,
) -> None:
    codigo = correr(CONFIG, tmp_path)

    assert codigo == 0
    brazos = brazos_del_informe(tmp_path)
    assert list(brazos) == BRAZOS
    for nombre, brazo in brazos.items():
        assert {"total", "es_a_en"} <= set(brazo["recuperacion"]), nombre
        assert brazo["recuperacion"]["total"]["mrr"] is not None, nombre
        assert set(brazo["falsos_sin_evidencia"]) == {"n", "total"}, nombre
        assert (
            set(brazo["parafrasis"]) == {"pares", "recuperadas"}
            and brazo["parafrasis"]["pares"] >= 10
        ), nombre
        assert set(brazo["latencia_ms"]) == {"reranker_p95", "consulta_p95"}, nombre
        assert (
            brazo["latencia_ms"]["reranker_p95"] is not None
            and brazo["latencia_ms"]["consulta_p95"] is not None
        ), nombre
    assert "diferencia_frente_a_a0" not in brazos["A0"]
    for nombre in BRAZOS[1:]:
        diferencia = brazos[nombre]["diferencia_frente_a_a0"]
        assert {
            "recall_at_10_total",
            "mrr",
            "falsos_sin_evidencia",
            "parafrasis_recuperadas",
            "p95_reranker_ms",
            "p95_consulta_ms",
        } <= set(diferencia), nombre


@pytest.mark.ac("US-278", 4)
def test_cada_brazo_registra_su_configuracion_de_ventanas_y_la_suite_la_hace_cumplir_cuando_se_compara(
    tmp_path: Path,
) -> None:
    correr(CONFIG, tmp_path)

    brazos = brazos_del_informe(tmp_path)
    assert brazos["A0"]["reranker"] == {
        "modo": "primera",
        "solape": 2,
        "max_length": 12,
        "max_pairs": None,
    }
    assert brazos["A0-maximo"]["reranker"]["modo"] == "maximo"
    assert brazos["A0-longitud-ampliada"]["reranker"]["max_length"] == 24


@pytest.mark.ac("US-278", 5)
def test_un_brazo_queda_no_viable_por_latencia_cuando_el_p95_supera_el_tope_de_las_metas(
    tmp_path: Path,
) -> None:
    metas = tmp_path / "metas.yaml"
    metas.write_text(
        yaml.safe_dump(
            {
                "clase": "sintetico",
                "version": "1",
                "metas": {"p95_evidence_analyses_s": {"etiqueta": "p95", "maximo": 0.000001}},
            }
        ),
        encoding="utf-8",
    )
    salida = tmp_path / "salida"

    correr(config_con(tmp_path, **{"comparacion.metas": str(metas)}), salida)

    viabilidad = brazos_del_informe(salida)["A0-maximo"]["viabilidad"]
    assert viabilidad["estado"] == "no_viable" and viabilidad["motivos"] == ["latencia"]
    assert viabilidad["p95_consulta_s"] > viabilidad["tope_p95_s"]


@pytest.mark.ac("US-278", 5)
def test_un_brazo_queda_no_viable_por_memoria_cuando_la_del_stack_supera_el_limite(
    tmp_path: Path,
) -> None:
    memoria = tmp_path / "memoria.json"
    memoria.write_text(
        json.dumps({"A0": 12.0, "A0-maximo": 31.5, "A0-longitud-ampliada": 12.1}), encoding="utf-8"
    )
    salida = tmp_path / "salida"

    correr(CONFIG, salida, "--memoria-del-stack", str(memoria))

    brazos = brazos_del_informe(salida)
    assert brazos["A0-maximo"]["viabilidad"]["estado"] == "no_viable"
    assert brazos["A0-maximo"]["viabilidad"]["motivos"] == ["memoria"]
    assert brazos["A0-maximo"]["viabilidad"]["memoria_gb"] == 31.5
    assert brazos["A0"]["viabilidad"]["estado"] == "viable"


@pytest.mark.ac("US-278", 5)
def test_un_brazo_sin_medicion_de_memoria_queda_no_medido_y_nunca_viable(tmp_path: Path) -> None:
    correr(CONFIG, tmp_path)

    viabilidad = brazos_del_informe(tmp_path)["A0-maximo"]["viabilidad"]
    assert viabilidad["estado"] == "no_medido"
    assert viabilidad["memoria_gb"] is None and viabilidad["motivos"] == []


@pytest.mark.ac("US-278", 5)
def test_el_valor_por_defecto_de_las_ventanas_sigue_siendo_primera_aunque_un_brazo_quede_no_viable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.config.settings import Settings

    monkeypatch.delenv("RERANKER_CHUNK_WINDOWS", raising=False)

    assert Settings(_env_file=None).reranker_chunk_windows == "primera"  # type: ignore[call-arg]
