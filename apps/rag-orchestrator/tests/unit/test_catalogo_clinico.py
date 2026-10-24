"""Regla de versión del catálogo (dominio) y adapter del manifiesto (US-041): sin red ni servicios, solo archivos."""

import pytest

from app.domain.catalogo import CatalogVersionMismatchError, exigir_misma_version_de_catalogo
from app.infrastructure.catalogo_clinico.manifiesto import (
    CatalogoNoDisponible,
    cargar_catalogo_del_manifiesto,
)
from tests.support.contract import CATALOGOS


def test_exigir_misma_version_no_lanza_cuando_las_versiones_son_iguales():
    exigir_misma_version_de_catalogo("1.0.0", "1.0.0")


@pytest.mark.parametrize("solicitada", ["1.0.1", "", "1.0.0 ", "01.0.0"])
def test_exigir_misma_version_lanza_cuando_difieren(solicitada):
    with pytest.raises(CatalogVersionMismatchError):
        exigir_misma_version_de_catalogo(solicitada, "1.0.0")


def test_el_error_de_version_no_lleva_ninguna_de_las_dos_versiones_en_el_mensaje():
    with pytest.raises(CatalogVersionMismatchError) as error:
        exigir_misma_version_de_catalogo("7.7.7", "8.8.8")

    assert "7.7.7" not in str(error.value)
    assert "8.8.8" not in str(error.value)


def test_el_adapter_lee_la_version_del_manifiesto_cuando_el_catalogo_es_el_del_repositorio():
    assert cargar_catalogo_del_manifiesto(CATALOGOS).version() == "1.1.0"


@pytest.mark.parametrize(
    "contenido",
    [None, "no es json", "[]", "{}", '{"version": ""}', '{"version": 3}'],
    ids=["sin_archivo", "no_json", "no_objeto", "sin_version", "version_vacia", "version_numerica"],
)
def test_el_adapter_lanza_catalogo_no_disponible_sin_la_ruta_cuando_el_manifiesto_no_sirve(
    tmp_path, contenido
):
    if contenido is not None:
        (tmp_path / "manifest.json").write_text(contenido, encoding="utf-8")

    with pytest.raises(CatalogoNoDisponible) as error:
        cargar_catalogo_del_manifiesto(tmp_path)

    assert str(tmp_path) not in str(error.value)
