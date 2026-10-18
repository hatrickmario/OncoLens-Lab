"""Medición de OCR de la fase B (US-224 AC-6): exactitud, p95, directorio por request y no-residuos (RN-14)."""

from __future__ import annotations

import itertools
import json
from pathlib import Path

import pytest

from app.scripts.adr39 import ocr
from tests.evaluation.conftest import RAIZ_REPO

OCR_MINI = RAIZ_REPO / "data" / "eval" / "ocr-mini"


def _texto_por_pdf() -> dict[bytes, str]:
    verdad = json.loads((OCR_MINI / "ground_truth.json").read_text(encoding="utf-8"))["documentos"]
    return {(OCR_MINI / n).read_bytes(): d["texto"] for n, d in verdad.items()}


class MotorFalso:
    """Motor que escribe en su directorio de trabajo y se comporta según ``modo``; cumple el protocolo ``Motor``."""

    def __init__(self, modo: str = "ok", fuera: Path | None = None) -> None:
        self.id = f"falso-{modo}"
        self._modo = modo
        self._fuera = fuera
        self._textos = _texto_por_pdf()
        self.directorios: list[Path] = []

    def extraer(self, pdf: bytes, directorio_de_trabajo: Path, plazo_s: float) -> str:
        self.directorios.append(directorio_de_trabajo)
        (directorio_de_trabajo / "pagina-0.png").write_bytes(b"pagina rasterizada")
        (directorio_de_trabajo / "texto.txt").write_text("texto extraido", encoding="utf-8")
        if self._modo == "fallo":
            raise RuntimeError("fallo forzado del motor")
        if self._modo == "timeout":
            raise TimeoutError(f"el motor superó el plazo de {plazo_s} s")
        if self._modo == "fuga" and self._fuera is not None:
            (self._fuera / "intermedio.png").write_bytes(b"x")
        return self._textos[pdf]


def _pdf() -> bytes:
    return next(iter(_texto_por_pdf()))


def _reloj_de_un_segundo_por_llamada() -> ocr.Reloj:
    contador = itertools.count()
    return lambda: float(next(contador))


def test_extraer_en_directorio_temporal_deja_tmpdir_vacio_cuando_la_extraccion_es_correcta(
    tmp_path: Path,
) -> None:
    motor = MotorFalso("ok")

    texto, escritos = ocr.extraer_en_directorio_temporal(motor, _pdf(), 5.0, tmp_path)

    assert texto == _texto_por_pdf()[_pdf()]
    assert escritos == 2
    assert list(tmp_path.iterdir()) == []


def test_extraer_en_directorio_temporal_deja_tmpdir_vacio_cuando_el_motor_falla_despues_de_escribir(
    tmp_path: Path,
) -> None:
    with pytest.raises(RuntimeError):
        ocr.extraer_en_directorio_temporal(MotorFalso("fallo"), _pdf(), 5.0, tmp_path)

    assert list(tmp_path.iterdir()) == []


def test_extraer_en_directorio_temporal_deja_tmpdir_vacio_cuando_se_agota_el_plazo(
    tmp_path: Path,
) -> None:
    with pytest.raises(TimeoutError):
        ocr.extraer_en_directorio_temporal(MotorFalso("timeout"), _pdf(), 0.01, tmp_path)

    assert list(tmp_path.iterdir()) == []


def test_extraer_en_directorio_temporal_usa_un_directorio_distinto_por_request(
    tmp_path: Path,
) -> None:
    motor = MotorFalso("ok")

    ocr.extraer_en_directorio_temporal(motor, _pdf(), 5.0, tmp_path)
    ocr.extraer_en_directorio_temporal(motor, _pdf(), 5.0, tmp_path)

    assert len(set(motor.directorios)) == 2


def test_verificar_sin_residuos_nombra_motor_y_ruta_sin_incluir_contenido(tmp_path: Path) -> None:
    (tmp_path / "pagina.png").write_bytes(b"CONTENIDO-CLINICO-SECRETO")

    with pytest.raises(ocr.ResiduosDeOcr) as error:
        ocr.verificar_sin_residuos("motor-x", tmp_path, [], set())

    assert "motor-x" in str(error.value)
    assert str(tmp_path / "pagina.png") in str(error.value)
    assert "SECRETO" not in str(error.value)


def test_exactitud_por_campo_ignora_tildes_espacios_y_mayusculas() -> None:
    texto = "Diagnostico:  CARCINOMA ductal   infiltrante grado 2\nKi-67: 18%"

    aciertos, total = ocr.exactitud_por_campo(
        texto,
        {"dx": "carcinoma ductal infiltrante grado 2", "ki67": "18 %", "her2": "negativo (1+)"},
    )

    assert (aciertos, total) == (2, 3)


@pytest.mark.ac("US-224", 6)
def test_medir_motor_calcula_exactitud_y_p95_por_documento_cuando_no_hay_residuos(
    tmp_path: Path,
) -> None:
    resultado = ocr.medir_motor(
        MotorFalso("ok"), OCR_MINI, corridas=3, plazo_s=5.0, tmp_raiz=tmp_path,
        vigiladas=[tmp_path], reloj=_reloj_de_un_segundo_por_llamada(),
    )  # fmt: skip

    assert resultado.disponible is True
    assert resultado.exactitud == 1.0
    assert (
        resultado.p95_ms == 1000.0
    )  # el reloj avanza 1 s entre el inicio y el fin de cada documento
    assert resultado.escribe_a_disco_observado is True
    assert resultado.residuos == ()
    assert resultado.documentos >= 5


@pytest.mark.ac("US-224", 6)
def test_medir_motor_falla_nombrando_la_ruta_cuando_el_motor_escribe_fuera_de_tmpdir(
    tmp_path: Path,
) -> None:
    tmp = tmp_path / "tmp"
    vigilada = tmp_path / "fuera"
    tmp.mkdir()
    vigilada.mkdir()

    resultado = ocr.medir_motor(
        MotorFalso("fuga", fuera=vigilada), OCR_MINI, corridas=1, plazo_s=5.0, tmp_raiz=tmp,
        vigiladas=[vigilada], reloj=_reloj_de_un_segundo_por_llamada(),
    )  # fmt: skip

    assert resultado.residuos == (str(vigilada / "intermedio.png"),)
    assert resultado.exactitud is None


def test_medir_motor_informa_motor_no_disponible_cuando_falta_el_paquete(tmp_path: Path) -> None:
    class SinPaquete:
        id = "sin-paquete"

        def extraer(self, pdf: bytes, directorio_de_trabajo: Path, plazo_s: float) -> str:
            raise ocr.MotorNoDisponible("falta el paquete")

    resultado = ocr.medir_motor(
        SinPaquete(), OCR_MINI, 1, 5.0, tmp_path, [tmp_path], _reloj_de_un_segundo_por_llamada()
    )

    assert resultado.disponible is False
    assert resultado.exactitud is None and resultado.p95_ms is None  # null, nunca 0


def test_motor_ocrmypdf_informa_no_disponible_y_no_deja_residuos_cuando_falta_el_binario(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("PATH", str(tmp_path / "vacio"))

    with pytest.raises(ocr.MotorNoDisponible):
        ocr.extraer_en_directorio_temporal(
            ocr.motor_por_id("ocrmypdf-tesseract", "spa"), _pdf(), 5.0, tmp_path
        )

    assert list(tmp_path.iterdir()) == []


def test_motor_por_id_rechaza_un_motor_desconocido() -> None:
    with pytest.raises(KeyError):
        ocr.motor_por_id("surya", "spa")  # descartado por licencia (GPL-3.0 + OpenRAIL-M)
