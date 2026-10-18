"""CLI ``python -m app.scripts.adr39`` (US-224 AC-5): configuración fijada antes de medir, decisión y códigos de salida."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import pytest

from app.scripts.adr39 import cli
from app.scripts.adr39.config import ConfigFaseBInvalida, cargar_config

AHORA = lambda: datetime(2026, 10, 21, 9, 0, tzinfo=timezone.utc)  # noqa: E731


def escribir(ruta: Path, datos: dict) -> None:  # type: ignore[type-arg]
    ruta.write_text(json.dumps(datos), encoding="utf-8")


def medido_ok(memoria: float = 15.0, estructuracion_ms: float = 20000.0) -> dict:  # type: ignore[type-arg]
    return {
        "memoria_llm_gb": memoria,
        "json_valido": 1.0,
        "estructuracion": {"p95_ms": estructuracion_ms},
    }


def preparar_candidato(reportes: Path, id_c: str, **cambios: float) -> None:
    escribir(
        reportes / f"e2e-{id_c}.json",
        {"p95_total_ms": 9000.0, "memoria_stack_gb": 24.0, "swap_creciente": False, **cambios},
    )
    escribir(
        reportes / f"revision-{id_c}.json",
        {"fidelidad": 0.95, "salidas_prescriptivas": 0, "salidas_otro_idioma": 0},
    )


def test_la_configuracion_fija_las_reglas_de_d3_antes_de_medir() -> None:
    config = cargar_config()
    r = config.restricciones

    assert (r.llm_memory_budget_gb, r.stack_memory_limit_gb) == (21.0, 30.0)
    assert (r.json_valido_minimo, r.e2e_p95_budget_ms, r.extraccion_p95_budget_ms) == (
        0.99,
        15000,
        60000,
    )
    assert (config.corridas, config.llamadas_por_candidato, config.consultas_por_corrida_e2e) == (
        3,
        200,
        30,
    )
    assert [c.id for c in config.candidatos] == ["A", "B", "C", "E", "F", "G", "H", "I", "J"]
    assert config.llm["descartados_sin_medir"][0]["id"] == "D"
    assert "HAI-DEF" in r.licencias_condicionadas


def test_cargar_config_falla_nombrando_el_problema_cuando_falta_una_seccion(tmp_path: Path) -> None:
    ruta = tmp_path / "incompleta.yaml"
    ruta.write_text("version: 1\nprotocolo: {corridas: 3}\nrestricciones: {}\n", encoding="utf-8")

    with pytest.raises(ConfigFaseBInvalida):
        cargar_config(ruta)


def test_main_sale_con_2_cuando_la_configuracion_no_existe(tmp_path: Path) -> None:
    assert (
        cli.main(["decidir", "--config", str(tmp_path / "no-existe.yaml")], AHORA)
        == cli.SALIDA_CONFIG
    )


def test_decidir_deja_todo_pendiente_sin_inventar_cifras_cuando_no_hay_mediciones(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    salida = cli.main(["decidir", "--out", str(tmp_path)], AHORA)

    decision = json.loads((tmp_path / "decision.json").read_text(encoding="utf-8"))
    assert salida == cli.SALIDA_OK
    assert decision["elegido"] is None and decision["escalar_al_usuario"] is False
    assert {v["estado"] for v in decision["veredictos"]} == {"pendiente"}
    assert "sin elegir" in capsys.readouterr().out


@pytest.mark.ac("US-224", 5)
def test_decidir_elige_por_las_reglas_de_d3_y_descarta_con_cifra_a_partir_de_los_reportes(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    escribir(
        tmp_path / "llm.json",
        {
            "candidatos": [
                {"id": "A", **medido_ok(15.0)},
                {"id": "G", **medido_ok(18.0)},
                {"id": "H", **medido_ok(22.0)},
            ]
        },
    )
    escribir(tmp_path / "ocr-ocrmypdf-tesseract.json", {"p95_ms": 30000.0})
    preparar_candidato(tmp_path, "A")
    preparar_candidato(tmp_path, "G", p95_total_ms=16000.0)

    salida = cli.main(
        ["decidir", "--out", str(tmp_path), "--motor-ocr", "ocrmypdf-tesseract"], AHORA
    )

    texto = capsys.readouterr().out
    decision = json.loads((tmp_path / "decision.json").read_text(encoding="utf-8"))
    assert salida == cli.SALIDA_OK
    assert decision["elegido"] == "A"
    assert "| G | descartado | p95_e2e: 16000 ms > 15000 ms |" in texto
    assert "| H | descartado | memoria_llm: 22.00 GB > 21.0 GB |" in texto
    assert "Elegido: **A**" in texto


def test_decidir_suma_el_p95_del_ocr_y_el_de_la_estructuracion_para_el_limite_de_extraccion(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    escribir(tmp_path / "llm.json", {"candidatos": [{"id": "A", **medido_ok(15.0, 31000.0)}]})
    escribir(tmp_path / "ocr-ocrmypdf-tesseract.json", {"p95_ms": 30000.0})
    preparar_candidato(tmp_path, "A")

    cli.main(["decidir", "--out", str(tmp_path), "--motor-ocr", "ocrmypdf-tesseract"], AHORA)

    assert "| A | descartado | p95_extraccion: 61000 ms > 60000 ms |" in capsys.readouterr().out


def test_decidir_sale_con_4_y_escala_cuando_ningun_candidato_supera_las_eliminatorias(
    tmp_path: Path,
) -> None:
    ids = [c.id for c in cargar_config().candidatos]
    escribir(tmp_path / "llm.json", {"candidatos": [{"id": i, **medido_ok(25.0)} for i in ids]})

    salida = cli.main(["decidir", "--out", str(tmp_path)], AHORA)

    decision = json.loads((tmp_path / "decision.json").read_text(encoding="utf-8"))
    assert salida == cli.SALIDA_SIN_CANDIDATO
    assert decision["escalar_al_usuario"] is True


def test_decidir_no_elige_una_licencia_condicionada_sin_aceptacion_escrita(tmp_path: Path) -> None:
    escribir(tmp_path / "llm.json", {"candidatos": [{"id": "E", **medido_ok(5.0)}]})
    escribir(tmp_path / "ocr-ocrmypdf-tesseract.json", {"p95_ms": 1000.0})
    preparar_candidato(tmp_path, "E")
    args = ["decidir", "--out", str(tmp_path), "--motor-ocr", "ocrmypdf-tesseract"]

    cli.main([*args], AHORA)
    sin_aceptar = json.loads((tmp_path / "decision.json").read_text(encoding="utf-8"))["elegido"]
    cli.main([*args, "--licencias-aceptadas", "HAI-DEF"], AHORA)
    aceptada = json.loads((tmp_path / "decision.json").read_text(encoding="utf-8"))["elegido"]

    assert (sin_aceptar, aceptada) == (None, "E")


def test_e2e_sale_con_2_sin_url_cuerpo_o_credencial(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("ADR39_PASSWORD", raising=False)
    cuerpo = tmp_path / "cuerpo.json"
    escribir(cuerpo, {})

    assert cli.main(["e2e", "--out", str(tmp_path)], AHORA) == cli.SALIDA_CONFIG
    assert (
        cli.main(
            [
                "e2e",
                "--out",
                str(tmp_path),
                "--base-url",
                "https://bff.test",
                "--cuerpo",
                str(cuerpo),
            ],
            AHORA,
        )
        == cli.SALIDA_CONFIG
    )


def test_ocr_sale_con_2_sin_motor_y_con_7_cuando_el_motor_no_esta_instalado(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    assert cli.main(["ocr", "--out", str(tmp_path)], AHORA) == cli.SALIDA_CONFIG

    monkeypatch.setenv("PATH", str(tmp_path / "vacio"))
    salida = cli.main(
        [
            "ocr",
            "--out",
            str(tmp_path),
            "--motor",
            "ocrmypdf-tesseract",
            "--tmpdir",
            str(tmp_path),
            "--vigilar",
            str(tmp_path),
        ],
        AHORA,
    )

    reporte = json.loads((tmp_path / "ocr-ocrmypdf-tesseract.json").read_text(encoding="utf-8"))
    assert salida == cli.SALIDA_MOTOR
    assert reporte["disponible"] is False and reporte["exactitud"] is None
    assert reporte["entorno"]["fecha"] == "2026-10-21T09:00:00+00:00"
