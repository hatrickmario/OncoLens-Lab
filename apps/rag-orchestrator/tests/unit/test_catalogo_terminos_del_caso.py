"""Cargadores del catálogo del segundo loop contextual (US-271, ADR-52, RN-27): léxico y términos del caso (test después).

Leen el catálogo real del repositorio; un archivo ausente o fuera de forma es ``CatalogoNoDisponible`` sin ruta ni contenido.
"""

import json

import pytest

from app.infrastructure.catalogo_clinico.manifiesto import CatalogoNoDisponible
from app.infrastructure.catalogo_clinico.terminos_del_caso import (
    cargar_catalogo_de_terminos,
    cargar_marcos_de_pregunta,
)
from app.bootstrap import _marcos_de_pregunta_montados
from tests.support.contract import CATALOGOS
from tests.support.fakes import settings_de_prueba


def test_cargador_lee_el_lexico_del_catalogo_normalizado_cuando_el_archivo_existe():
    # El léxico tiene versión PROPIA (no la del manifest); que no se desfase del catálogo lo fija
    # `catalog:version-guard` (CON_VERSION_PROPIA incluye lenguaje/marcos-de-pregunta.json), no este test.
    lexico = cargar_marcos_de_pregunta(CATALOGOS)

    assert (
        lexico.version
        == json.loads((CATALOGOS / "lenguaje" / "marcos-de-pregunta.json").read_text("utf-8"))[
            "version"
        ]
    )
    assert "evidencia" in lexico.por_idioma["es"].vacias
    assert "evidence" in lexico.por_idioma["en"].vacias
    assert "evidencia cientifica" in lexico.por_idioma["es"].marcos


def test_cargador_ofrece_etiquetas_estadios_grados_y_biomarcadores_en_el_orden_del_catalogo():
    catalogo = cargar_catalogo_de_terminos(CATALOGOS, ("mama", "prostata"))

    assert catalogo.etiqueta_de_tipo == {"mama": "Cáncer de mama", "prostata": "Cáncer de próstata"}
    assert catalogo.estadios["mama"]["tnm 8"]["iia"] == "IIA"
    assert catalogo.grados["prostata"] == ("ISUP 1", "ISUP 2", "ISUP 3", "ISUP 4", "ISUP 5")
    assert (
        catalogo.grados["mama"] == ()
    )  # Nottingham no entra a la consulta: solo Gleason/ISUP (B-08)
    nombres = [b.nombre for b in catalogo.biomarcadores["mama"]]
    assert nombres == [
        "re",
        "rp",
        "her2",
        "ki 67",
        "brca",
    ]  # el orden de datos-criticos, sin repetir HER2
    assert catalogo.biomarcadores["mama"][2].valores["3"] == "3+"
    assert catalogo.biomarcadores["prostata"][0].termino == "Antígeno prostático específico (PSA)"


def test_cargador_ofrece_los_biomarcadores_no_anclables_del_catalogo_solo_para_prostata():
    catalogo = cargar_catalogo_de_terminos(CATALOGOS, ("mama", "prostata"))

    assert catalogo.biomarcadores_no_anclables == {"prostata": frozenset({"psa"})}


def test_cargador_falla_sin_ruta_ni_contenido_cuando_el_lexico_no_esta_en_el_catalogo(tmp_path):
    with pytest.raises(CatalogoNoDisponible) as error:
        cargar_marcos_de_pregunta(tmp_path)

    assert str(tmp_path) not in str(error.value)


def test_cargador_falla_sin_contenido_cuando_el_lexico_esta_fuera_de_forma(tmp_path):
    (tmp_path / "lenguaje").mkdir()
    (tmp_path / "lenguaje" / "marcos-de-pregunta.json").write_text(
        json.dumps({"version": "1.7.0", "es": "SENTINELA"}), encoding="utf-8"
    )

    with pytest.raises(CatalogoNoDisponible) as error:
        cargar_marcos_de_pregunta(tmp_path)

    assert "SENTINELA" not in str(error.value) and str(tmp_path) not in str(error.value)


def test_cargador_falla_cuando_un_tipo_del_manifiesto_no_tiene_sus_archivos(tmp_path):
    (tmp_path / "escalas.json").write_text("{}", encoding="utf-8")

    with pytest.raises(CatalogoNoDisponible):
        cargar_catalogo_de_terminos(tmp_path, ("mama",))


def test_arranque_no_carga_el_lexico_cuando_el_indicador_esta_apagado_aunque_el_catalogo_no_lo_tenga(
    tmp_path,
):
    settings = settings_de_prueba(clinical_catalog_path=tmp_path)

    assert _marcos_de_pregunta_montados(settings) is None


def test_arranque_falla_cuando_el_indicador_esta_activo_y_el_catalogo_no_trae_el_lexico(tmp_path):
    settings = settings_de_prueba(
        clinical_catalog_path=tmp_path, query_context_expansion_enabled=True
    )

    with pytest.raises(CatalogoNoDisponible):
        _marcos_de_pregunta_montados(settings)
