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

    assert datos.etiquetas("mama")["estado_menopausico"] == "Estado menopáusico"
    assert datos.etiquetas("mama")["ki67"] == "Ki-67"


def test_devuelve_none_cuando_la_clave_es_de_otro_tipo() -> None:
    datos = cargar_datos_criticos(CATALOGOS, ("mama", "prostata"))

    assert "psa_serie" not in datos.etiquetas("mama")
    assert "psa_serie" in datos.etiquetas("prostata")


def test_devuelve_none_y_sin_claves_cuando_el_tipo_no_esta_en_el_catalogo() -> None:
    datos = cargar_datos_criticos(CATALOGOS, ("mama",))

    assert dict(datos.etiquetas("leucemia")) == {}


def test_expone_las_claves_del_tipo_con_su_etiqueta() -> None:
    datos = cargar_datos_criticos(CATALOGOS, ("mama",))

    assert {"estado_menopausico", "ki67"} <= set(datos.etiquetas("mama"))
    assert all(etiqueta for etiqueta in datos.etiquetas("mama").values())


def test_devuelve_los_tipos_de_documento_fuente_en_el_orden_del_catalogo_cuando_el_tipo_esta() -> (
    None
):
    datos = cargar_datos_criticos(CATALOGOS, ("mama", "prostata"))

    fuentes = datos.tipos_de_documento("mama")

    assert list(fuentes)[:3] == ["histologia", "grado", "tnm"]
    assert fuentes["ki67"] == ("examen",)
    assert fuentes["estado_menopausico"] == ("historia_clinica",)
    assert fuentes["tnm"] == ("historia_clinica", "examen")
    assert set(datos.tipos_de_documento("prostata")) == set(datos.etiquetas("prostata"))


def test_devuelve_sin_fuentes_cuando_el_tipo_no_esta_en_el_catalogo() -> None:
    datos = cargar_datos_criticos(CATALOGOS, ("mama",))

    assert dict(datos.tipos_de_documento("leucemia")) == {}


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
        lambda a: a["items"][0].pop("sourceDocumentTypes"),
        lambda a: a["items"][0].update(sourceDocumentTypes=[]),
        lambda a: a["items"][0].update(sourceDocumentTypes=["patologia"]),
    ],
    ids=[
        "clave_con_mayusculas",
        "clave_con_espacio",
        "etiqueta_vacia",
        "sin_etiqueta",
        "clave_repetida",
        "tipo_ajeno",
        "sin_items",
        "sin_tipos_de_documento_fuente",
        "tipos_de_documento_fuente_vacios",
        "tipo_de_documento_fuera_del_enum",
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
