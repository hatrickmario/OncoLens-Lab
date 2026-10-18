"""Humo del dataset sintético ``data/eval/ocr-mini`` (US-224 AC-6, RN-13, RN-14)."""

from __future__ import annotations

import hashlib
import json

import pytest

from tests.evaluation.conftest import RAIZ_REPO

OCR_MINI = RAIZ_REPO / "data" / "eval" / "ocr-mini"


def _manifiesto() -> dict:  # type: ignore[type-arg]
    return json.loads((OCR_MINI / "manifest.json").read_text(encoding="utf-8"))


def _verdad() -> dict:  # type: ignore[type-arg]
    return json.loads((OCR_MINI / "ground_truth.json").read_text(encoding="utf-8"))["documentos"]


@pytest.mark.ac("US-224", 6)
def test_ocr_mini_tiene_al_menos_5_pdf_con_manifiesto_sintetico_y_licencia() -> None:
    manifiesto = _manifiesto()
    pdfs = sorted(p.name for p in OCR_MINI.glob("*.pdf"))

    assert len(pdfs) >= 5
    assert manifiesto["clase"] == "sintetico"
    assert manifiesto["licencia"]
    assert sorted(a["archivo"] for a in manifiesto["archivos"]) == pdfs
    assert {a["cancer"] for a in manifiesto["archivos"]} == {"mama", "prostata"}


@pytest.mark.ac("US-224", 6)
def test_cada_pdf_tiene_su_verdad_de_terreno_por_campo_critico_y_su_checksum() -> None:
    verdad = _verdad()

    for archivo in _manifiesto()["archivos"]:
        contenido = (OCR_MINI / archivo["archivo"]).read_bytes()
        assert contenido.startswith(b"%PDF"), archivo["archivo"]
        assert hashlib.sha256(contenido).hexdigest() == archivo["sha256"], archivo["archivo"]
        assert verdad[archivo["archivo"]]["campos"], archivo["archivo"]
        assert len(verdad[archivo["archivo"]]["campos"]) == archivo["campos_criticos"]


def test_el_valor_de_cada_campo_aparece_en_el_texto_de_su_documento() -> None:
    for nombre, doc in _verdad().items():
        normalizado = "".join(doc["texto"].split()).lower()
        for campo, valor in doc["campos"].items():
            assert "".join(valor.split()).lower() in normalizado, f"{nombre}:{campo}"


def test_ocr_mini_no_contiene_identificadores_reales_ni_fuentes_excluidas() -> None:
    manifiesto = _manifiesto()

    assert manifiesto["fuentes_excluidas"] == ["NCCN", "ESMO"]
    for doc in _verdad().values():
        assert "PACIENTE FICTICIO" in doc["texto"] and "SIN-DOCUMENTO" in doc["texto"]
        assert "NCCN" not in doc["texto"] and "ESMO" not in doc["texto"]
