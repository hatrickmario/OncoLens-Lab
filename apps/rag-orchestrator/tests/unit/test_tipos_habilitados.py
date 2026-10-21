"""Reglas puras de los tipos de cáncer habilitados (US-043, RN-20) y su lectura del manifiesto y del entorno."""

import pytest

from app.config.settings import Settings
from app.domain.tipos_habilitados import (
    TipoNoHabilitadoError,
    exigir_tipo_habilitado,
    tipos_ausentes_del_catalogo,
)
from app.infrastructure.catalogo_clinico.manifiesto import (
    CatalogoNoDisponible,
    cargar_catalogo_del_manifiesto,
)
from tests.support.contract import CATALOGOS


def test_exigir_tipo_habilitado_no_lanza_cuando_el_tipo_esta_en_la_lista():
    exigir_tipo_habilitado("mama", ("mama", "prostata"))


@pytest.mark.parametrize("tipo", ["pulmon", "Mama", "mama ", ""])
def test_exigir_tipo_habilitado_lanza_sin_eco_del_tipo_cuando_no_coincide_exactamente(tipo):
    with pytest.raises(TipoNoHabilitadoError) as error:
        exigir_tipo_habilitado(tipo, ("mama", "prostata"))

    assert tipo not in str(error.value) or tipo == ""


def test_exigir_tipo_habilitado_lanza_cuando_la_lista_esta_vacia():
    with pytest.raises(TipoNoHabilitadoError):
        exigir_tipo_habilitado("mama", ())


def test_tipos_ausentes_del_catalogo_devuelve_solo_los_que_el_manifiesto_no_declara():
    assert tipos_ausentes_del_catalogo(("mama", "pulmon"), ("mama", "prostata")) == ["pulmon"]
    assert tipos_ausentes_del_catalogo(("mama",), ("mama", "prostata")) == []


def test_settings_separa_por_comas_los_tipos_habilitados_y_descarta_vacios():
    ajustes = Settings(_env_file=None, enabled_cancer_types=" mama, prostata ,")  # type: ignore[call-arg, arg-type]

    assert ajustes.enabled_cancer_types == ("mama", "prostata")


def test_settings_deja_los_tipos_habilitados_vacios_cuando_la_variable_no_esta_definida(
    monkeypatch,
):
    monkeypatch.delenv("ENABLED_CANCER_TYPES", raising=False)

    assert Settings(_env_file=None).enabled_cancer_types == ()  # type: ignore[call-arg]


def test_el_adapter_lee_los_tipos_de_cancer_del_manifiesto_del_repositorio():
    assert cargar_catalogo_del_manifiesto(CATALOGOS).tipos_de_cancer() == ("mama", "prostata")


@pytest.mark.parametrize(
    "tipos", ["", '"mama"', "[1]", "null"], ids=["vacio", "texto", "numero", "nulo"]
)
def test_el_adapter_lanza_catalogo_no_disponible_cuando_cancer_types_no_es_una_lista_de_textos(
    tmp_path, tipos
):
    contenido = '{"version": "1.0.0", "cancerTypes": %s}' % (tipos or "{}")
    (tmp_path / "manifest.json").write_text(contenido, encoding="utf-8")

    with pytest.raises(CatalogoNoDisponible):
        cargar_catalogo_del_manifiesto(tmp_path)
