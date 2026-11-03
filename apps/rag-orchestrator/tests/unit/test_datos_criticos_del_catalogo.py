"""Adapter de `datos-criticos.json` (US-116 / L1D-113): etiquetas en español por tipo, fallo cerrado, errores sin ruta."""

import json
from pathlib import Path
from typing import Any

import pytest

from app.infrastructure.catalogo_clinico.datos_criticos import cargar_datos_criticos
from app.infrastructure.catalogo_clinico.manifiesto import CatalogoNoDisponible
from tests.support.contract import CATALOGOS

SENTINELA = "SENTINELA-RUTA-Y-CONTENIDO"


def _archivo_valido() -> dict[str, Any]:
    return json.loads((CATALOGOS / "mama" / "datos-criticos.json").read_text(encoding="utf-8"))


def _catalogo_con(tmp_path: Path, contenido: object | None, tipo: str = "mama") -> Path:
    carpeta = tmp_path / SENTINELA / tipo
    carpeta.mkdir(parents=True)
    if contenido is not None:
        texto = contenido if isinstance(contenido, str) else json.dumps(contenido)
        (carpeta / "datos-criticos.json").write_text(texto, encoding="utf-8")
    return tmp_path / SENTINELA


def test_devuelve_la_etiqueta_en_espanol_cuando_la_clave_es_del_tipo() -> None:
    datos = cargar_datos_criticos(CATALOGOS, ("mama", "prostata"))

    assert datos.etiqueta("mama", "estado_menopausico") == "Estado menopáusico"
    assert datos.etiqueta("mama", "ki67") == "Ki-67"


def test_devuelve_none_cuando_la_clave_es_de_otro_tipo() -> None:
    datos = cargar_datos_criticos(CATALOGOS, ("mama", "prostata"))

    assert datos.etiqueta("mama", "psa_serie") is None
    assert datos.etiqueta("prostata", "psa_serie") is not None


def test_devuelve_none_y_sin_claves_cuando_el_tipo_no_esta_en_el_catalogo() -> None:
    datos = cargar_datos_criticos(CATALOGOS, ("mama",))

    assert datos.etiqueta("leucemia", "ki67") is None
    assert datos.claves("leucemia") == frozenset()


def test_expone_las_claves_del_tipo() -> None:
    datos = cargar_datos_criticos(CATALOGOS, ("mama",))

    assert {"estado_menopausico", "ki67"} <= datos.claves("mama")
    assert "psa_serie" not in datos.claves("mama")


def test_falla_cerrado_sin_ruta_cuando_el_archivo_falta(tmp_path: Path) -> None:
    with pytest.raises(CatalogoNoDisponible) as error:
        cargar_datos_criticos(_catalogo_con(tmp_path, None), ("mama",))

    assert SENTINELA not in str(error.value)


@pytest.mark.parametrize(
    "mutar",
    [
        lambda a: a["items"][0].update(key="Ki67"),
        lambda a: a["items"][0].update(key="ki 67"),
        lambda a: a["items"][0].update(label={"es": ""}),
        lambda a: a["items"][0].pop("label"),
        lambda a: a["items"][1].update(key=a["items"][0]["key"]),
        lambda a: a["items"][0].update(cancerType="prostata"),
        lambda a: a.pop("items"),
    ],
    ids=[
        "clave_con_mayusculas",
        "clave_con_espacio",
        "etiqueta_vacia",
        "sin_etiqueta",
        "clave_repetida",
        "tipo_ajeno",
        "sin_items",
    ],
)
def test_falla_cerrado_sin_ruta_cuando_el_archivo_no_cumple_el_esquema(
    tmp_path: Path, mutar
) -> None:
    archivo = _archivo_valido()
    mutar(archivo)

    with pytest.raises(CatalogoNoDisponible) as error:
        cargar_datos_criticos(_catalogo_con(tmp_path, archivo), ("mama",))

    assert SENTINELA not in str(error.value)


def test_falla_cerrado_cuando_el_json_es_ilegible(tmp_path: Path) -> None:
    with pytest.raises(CatalogoNoDisponible):
        cargar_datos_criticos(_catalogo_con(tmp_path, "{no es json"), ("mama",))


def test_falla_cerrado_cuando_el_manifiesto_declara_un_tipo_invalido(tmp_path: Path) -> None:
    with pytest.raises(CatalogoNoDisponible):
        cargar_datos_criticos(tmp_path, ("..",))
