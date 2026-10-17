"""Comando ``python -m app.evaluation.vm`` de punta a punta (US-075): entradas en disco, reporte determinista."""

from __future__ import annotations

import copy
import hashlib
import shutil
from pathlib import Path

import pytest

from app.evaluation.vm.__main__ import main
from app.evaluation.vm.dominio import COLUMNAS
from tests.evaluation.vm.constructores import (
    FIXTURES,
    csv_texto,
    escribir_manifiesto,
    fila,
    manifiesto_con,
    manifiesto_valido,
)

DEC02 = "# DEC-02 sintética para la huella\n"
FECHA = "2026-10-20"


@pytest.fixture()
def entorno(tmp_path: Path) -> Path:
    escribir_manifiesto(tmp_path, manifiesto_valido())
    shutil.copy(FIXTURES / "sesiones-medianas.csv", tmp_path / "sesiones.csv")
    (tmp_path / "DEC-02.md").write_text(DEC02, encoding="utf-8")
    (tmp_path / "baseline.json").write_text(
        '{"VM_SESSION_MAX_MINUTES": 30, "VM_PARTICIPANT_PATTERN": "^O[1-9][0-9]*$",'
        ' "VM_SOURCE_ID_PATTERN": "^[A-Za-z0-9._:/-]{1,128}$"}',
        encoding="utf-8",
    )
    return tmp_path


def _baseline(
    d: Path, *, fecha: str = FECHA, csv: str = "sesiones.csv", salida: str = "reporte.md"
) -> int:
    return main(
        [
            "baseline",
            "--csv", str(d / csv),
            "--manifest", str(d / "manifest.json"),
            "--config", str(d / "baseline.json"),
            "--dec02", str(d / "DEC-02.md"),
            "--fecha", fecha,
            "--out", str(d / salida),
        ]
    )  # fmt: skip


@pytest.mark.ac("US-075", 3)
def test_baseline_calcula_las_medianas_de_vm1_en_el_reporte_cuando_el_registro_es_valido(
    entorno: Path,
) -> None:
    """[US-075 AC-3] mediana de VM-1 mama 20, próstata 18 y total 19 min."""
    assert _baseline(entorno) == 0

    reporte = (entorno / "reporte.md").read_text(encoding="utf-8")
    assert "| mama | 20,0 |" in reporte
    assert "| prostata | 18,0 |" in reporte
    assert "| total | 19,0 |" in reporte


@pytest.mark.ac("US-075", 3)
def test_baseline_produce_reportes_identicos_byte_a_byte_cuando_se_ejecuta_dos_veces_con_la_misma_fecha(
    entorno: Path,
) -> None:
    """[US-075 AC-3]"""
    assert _baseline(entorno, salida="uno.md") == 0
    assert _baseline(entorno, salida="dos.md") == 0

    assert (entorno / "uno.md").read_bytes() == (entorno / "dos.md").read_bytes()


@pytest.mark.ac("US-075", 4)
@pytest.mark.ac("US-075", 5)
def test_baseline_incluye_huella_de_dec02_metas_no_modificadas_versiones_de_checklist_y_rotulo_sintetico(
    entorno: Path,
) -> None:
    """[US-075 AC-4, AC-5]"""
    assert _baseline(entorno) == 0

    reporte = (entorno / "reporte.md").read_text(encoding="utf-8")
    assert FECHA in reporte
    assert hashlib.sha256(DEC02.encode()).hexdigest() in reporte
    assert "metas no modificadas; criterio de éxito enmendado en DEC-02 [S1 resp. 27]" in reporte
    assert "Cohorte sintética" in reporte
    assert "después de G-Piloto" in reporte
    assert "O1 = Oncólogo asesor A" in reporte
    assert "| mama-01 | 1.0 | 2026-10-16 |" in reporte
    assert "base de la meta de DEC-02" in reporte


def test_baseline_lista_las_tareas_no_completadas_en_el_reporte(entorno: Path) -> None:
    assert _baseline(entorno) == 0

    reporte = (entorno / "reporte.md").read_text(encoding="utf-8")
    assert "- VM-1 · mama-03 · O1" in reporte


def test_baseline_informa_sesiones_casos_y_participantes(entorno: Path) -> None:
    assert _baseline(entorno) == 0

    assert "Sesiones: 6 · casos: 6 · participantes: 1" in (entorno / "reporte.md").read_text(
        encoding="utf-8"
    )


@pytest.mark.ac("US-075", 2)
def test_baseline_termina_con_error_sin_repetir_el_valor_ni_escribir_reporte_cuando_el_participante_no_es_seudonimo(
    entorno: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """[US-075 AC-2]"""
    (entorno / "malo.csv").write_text(
        csv_texto([fila(participante="Maria Gomez")]), encoding="utf-8"
    )

    codigo = _baseline(entorno, csv="malo.csv")

    err = capsys.readouterr().err
    assert codigo != 0
    assert "fila 2" in err and "seudónimo O<n>" in err and "Maria" not in err
    assert not (entorno / "reporte.md").exists()


@pytest.mark.ac("US-075", 2)
def test_baseline_termina_con_error_nombrando_la_columna_cuando_el_csv_trae_notas(
    entorno: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """[US-075 AC-2] una columna no declarada se rechaza antes de leer filas."""
    filas = [{**fila(), "notas": "texto libre identificable"}]
    (entorno / "malo.csv").write_text(csv_texto(filas, (*COLUMNAS, "notas")), encoding="utf-8")

    codigo = _baseline(entorno, csv="malo.csv")

    err = capsys.readouterr().err
    assert codigo != 0 and "notas" in err and "identificable" not in err
    assert not (entorno / "reporte.md").exists()


@pytest.mark.ac("US-075", 2)
def test_baseline_termina_con_error_cuando_la_validacion_de_vm2_esta_pendiente(
    entorno: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """[US-075 AC-2] validada vacío impide el reporte."""
    (entorno / "malo.csv").write_text(csv_texto([fila(validada="")]), encoding="utf-8")

    codigo = _baseline(entorno, csv="malo.csv")

    assert codigo != 0 and "pendiente" in capsys.readouterr().err
    assert not (entorno / "reporte.md").exists()


@pytest.mark.ac("US-075", 1)
def test_baseline_valida_el_manifiesto_antes_del_csv_y_no_escribe_reporte_cuando_el_checklist_no_tiene_fecha(
    entorno: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """[US-075 AC-1] el manifiesto inválido corta antes de leer el CSV."""
    caso = copy.deepcopy(manifiesto_valido()["casos"][0])
    caso["checklist_reconstruccion"]["fecha_validacion_clinica"] = None
    escribir_manifiesto(entorno, manifiesto_con("mama-01", **caso))
    (entorno / "malo.csv").write_text("columna_inventada\n1\n", encoding="utf-8")

    codigo = _baseline(entorno, csv="malo.csv")

    err = capsys.readouterr().err
    assert codigo != 0 and "mama-01" in err and "fecha_validacion_clinica" in err
    assert "columna_inventada" not in err
    assert not (entorno / "reporte.md").exists()


@pytest.mark.ac("US-075", 2)
def test_pares_validacion_escribe_los_pares_sin_tiempo_participante_ni_desenlace(
    entorno: Path,
) -> None:
    """[US-075 AC-2] O1 y O2 citan la misma fuente en mama-01: el par sale una vez."""
    filas = [
        fila(participante="O2", caso="mama-01", fuente_id="PMID:2"),
        fila(participante="O1", caso="mama-01", fuente_id="PMID:2"),
    ]
    (entorno / "dos.csv").write_text(csv_texto(filas), encoding="utf-8")
    salida = entorno / "pares.csv"

    codigo = main(
        [
            "pares-validacion",
            "--csv", str(entorno / "dos.csv"),
            "--manifest", str(entorno / "manifest.json"),
            "--out", str(salida),
        ]
    )  # fmt: skip

    lineas = salida.read_text(encoding="utf-8").splitlines()
    assert codigo == 0
    assert lineas[0] == "caso,pregunta_referencia,fuente_id"
    assert len(lineas) == 2 and lineas[1].endswith(",PMID:2")
    assert "O1" not in salida.read_text(encoding="utf-8")


def test_pares_validacion_funciona_con_validada_vacio_porque_es_previo_a_la_validacion(
    entorno: Path,
) -> None:
    (entorno / "pend.csv").write_text(csv_texto([fila(validada="")]), encoding="utf-8")
    salida = entorno / "pares.csv"

    codigo = main(
        [
            "pares-validacion",
            "--csv", str(entorno / "pend.csv"),
            "--manifest", str(entorno / "manifest.json"),
            "--out", str(salida),
        ]
    )  # fmt: skip

    assert codigo == 0 and salida.exists()
