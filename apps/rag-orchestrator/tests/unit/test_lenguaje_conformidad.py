"""Conformidad de ``check_prohibited_terms`` con la referencia TypeScript (RN-23, US-068 AC-2)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from app.domain.lenguaje import ListaTerminos, check_prohibited_terms

RAIZ = Path(__file__).resolve().parents[4]
CASOS = RAIZ / "packages" / "clinical-language" / "conformidad" / "casos.json"
LISTA = RAIZ / "packages" / "clinical-catalogs" / "lenguaje" / "terminos-prohibidos.json"


def _casos() -> list[dict[str, Any]]:
    return json.loads(CASOS.read_text(encoding="utf-8"))["casos"]


@pytest.mark.ac("US-068", 2)
def test_check_prohibited_terms_casos_de_conformidad_mismos_ids_y_niveles() -> None:
    lista = ListaTerminos.model_validate_json(LISTA.read_text(encoding="utf-8"))
    casos = _casos()
    assert len(casos) >= 150

    discrepancias = []
    for caso in casos:
        coincidencias = check_prohibited_terms(
            caso["texto"],
            lista,
            niveles=tuple(caso["niveles"]),
            permitir_frases=caso["permitirFrases"],
        )
        obtenido = [{"id": c.id, "nivel": c.nivel} for c in coincidencias]
        if obtenido != caso["esperado"]:
            discrepancias.append((caso["texto"], caso["esperado"], obtenido))

    assert discrepancias == []
