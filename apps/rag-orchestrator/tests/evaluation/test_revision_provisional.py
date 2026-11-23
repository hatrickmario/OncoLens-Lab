"""Regla única de ``revision_provisional`` de los datasets de `evaluate` (``[S7 resp. 1]``, design D7 de l1d-334)."""

from __future__ import annotations

import json
from datetime import date

import pytest

from app.evaluation.dataset_loader import DatasetInvalido
from app.evaluation.revision_provisional import (
    ROLES_DE_REVISION_PROVISIONAL,
    RevisionProvisional,
    exigir_revision_provisional,
)
from tests.evaluation.conftest import RAIZ_REPO


def test_acepta_rol_ia_con_fecha_iso_en_texto() -> None:
    marca = exigir_revision_provisional({"rol": "ia", "fecha": "2026-11-22"}, "manifest.yaml")

    assert marca == RevisionProvisional("ia", "2026-11-22")


def test_acepta_la_fecha_que_yaml_convierte_en_date() -> None:
    marca = exigir_revision_provisional({"rol": "ia", "fecha": date(2026, 11, 22)}, "manifest.yaml")

    assert marca.fecha == "2026-11-22"


@pytest.mark.parametrize(
    "revision",
    [
        None,
        "ia",
        {"rol": "ia"},
        {"fecha": "2026-11-22"},
        {
            "rol": "ia",
            "fecha": "2026-11-22",
            "nombre": "x",
        },  # ninguna otra clave: nunca un nombre de persona (RN-10)
    ],
)
def test_rechaza_una_forma_distinta_de_rol_y_fecha(revision: object) -> None:
    with pytest.raises(DatasetInvalido, match="revision_provisional"):
        exigir_revision_provisional(revision, "manifest.yaml")


def test_rechaza_un_rol_fuera_del_conjunto_cerrado_sin_repetir_su_valor() -> None:
    with pytest.raises(DatasetInvalido, match="rol") as error:
        exigir_revision_provisional({"rol": "oncologo", "fecha": "2026-11-22"}, "manifest.yaml")

    assert "oncologo" not in str(error.value)


@pytest.mark.parametrize("fecha", ["22/11/2026", "ayer", "", 20261122, None])
def test_rechaza_una_fecha_que_no_es_iso(fecha: object) -> None:
    with pytest.raises(DatasetInvalido, match="fecha"):
        exigir_revision_provisional({"rol": "ia", "fecha": fecha}, "manifest.yaml")


def test_roles_de_revision_provisional_coinciden_con_el_enum_del_catalogo() -> None:
    """Paridad con ``comun.schema.json#/$defs/revisionProvisional`` (l1d-126 parte A): una sola fuente del conjunto de roles."""
    ruta = RAIZ_REPO / "packages" / "clinical-catalogs" / "schemas" / "comun.schema.json"
    esquema = json.loads(ruta.read_text(encoding="utf-8"))

    enum_del_catalogo = esquema["$defs"]["revisionProvisional"]["properties"]["rol"]["enum"]

    assert set(ROLES_DE_REVISION_PROVISIONAL) == set(enum_del_catalogo)
