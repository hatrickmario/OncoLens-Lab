"""Supply chain de las dependencias de inferencia (US-231a, design D9, tarea 1.1)."""

from __future__ import annotations

import re
from pathlib import Path

import pytest

RAIZ_APP = Path(__file__).resolve().parents[2]


def _requisitos(archivo: str) -> dict[str, str]:
    """``nombre -> especificación`` de un requirements, con el nombre normalizado (PEP 503)."""
    salida: dict[str, str] = {}
    for linea in (RAIZ_APP / archivo).read_text(encoding="utf-8").splitlines():
        linea = linea.split("#", 1)[0].strip()
        if linea:
            nombre = re.split(r"[=<>!~ ]", linea, maxsplit=1)[0]
            salida[re.sub(r"[-_.]+", "-", nombre).lower()] = linea
    return salida


@pytest.mark.parametrize("paquete", ["onnxruntime", "tokenizers"])
def test_las_dependencias_de_inferencia_estan_fijadas_con_version_exacta(paquete: str) -> None:
    assert re.fullmatch(rf"{paquete}==\d+(\.\d+)+", _requisitos("requirements.txt")[paquete])


def test_cada_requisito_de_ejecucion_tiene_version_exacta() -> None:
    sin_fijar = [r for r in _requisitos("requirements.txt").values() if "==" not in r]

    assert sin_fijar == []


def test_transformers_esta_prohibido_en_el_runtime_y_solo_vive_en_la_medicion() -> None:
    assert "transformers" not in _requisitos("requirements.txt")
    assert "transformers" in _requisitos("requirements-eval.txt")


def test_huggingface_hub_solo_figura_como_transitiva_fijada_de_tokenizers() -> None:
    requisitos = _requisitos("requirements.txt")

    assert re.fullmatch(r"huggingface-hub==\d+(\.\d+)+", requisitos["huggingface-hub"])
    assert "tokenizers" in requisitos


def test_la_imagen_instala_solo_wheels() -> None:
    dockerfile = (RAIZ_APP / "Dockerfile").read_text(encoding="utf-8")

    assert "pip install --only-binary=:all: -r requirements.txt" in dockerfile
