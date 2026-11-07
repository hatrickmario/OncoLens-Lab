"""Adapter de ``DatosDeRelevancia`` sobre el catálogo real montado (US-264, RN-29): destinos, criterios y sinónimos."""

import json
from pathlib import Path

import pytest

from app.infrastructure.catalogo_clinico.manifiesto import CatalogoNoDisponible
from app.infrastructure.catalogo_clinico.relevancia import cargar_datos_de_relevancia
from tests.support.contract import CATALOGOS


def test_expone_el_destino_del_catalogo_de_cada_dato_critico_cuando_el_tipo_esta():
    datos = cargar_datos_de_relevancia(CATALOGOS, ("mama",))

    por_clave = {d.clave: d for d in datos.datos_criticos("mama")}

    menopausia = por_clave["estado_menopausico"]
    assert menopausia.etiqueta == "Estado menopáusico"
    assert menopausia.destino.entidad == "ClinicalAttribute"
    assert menopausia.destino.campo == "value"
    assert dict(menopausia.destino.coincidencia) == {"attribute_key": ("estado_menopausico",)}
    assert dict(por_clave["her2_ihq"].destino.coincidencia) == {
        "name": ("HER2",),
        "exam.exam_type": ("IHQ",),
    }
    assert por_clave["tratamientos_previos"].destino.campo is None


def test_conserva_el_orden_del_catalogo_en_los_datos_criticos():
    datos = cargar_datos_de_relevancia(CATALOGOS, ("mama",))

    claves = [d.clave for d in datos.datos_criticos("mama")]

    archivo = json.loads((CATALOGOS / "mama" / "datos-criticos.json").read_text(encoding="utf-8"))
    assert claves == [item["key"] for item in archivo["items"]]


def test_devuelve_los_criterios_y_los_sinonimos_del_tipo_cuando_el_tipo_esta():
    datos = cargar_datos_de_relevancia(CATALOGOS, ("mama", "prostata"))

    assert "estado_menopausico" in {c.clave for c in datos.criterios("mama")}
    assert datos.sinonimos("mama")["ki67"] == "ki 67"  # normalizado: el guion es un separador
    assert "psa" not in datos.sinonimos("mama")


def test_devuelve_vacio_cuando_el_tipo_no_esta_en_el_catalogo():
    datos = cargar_datos_de_relevancia(CATALOGOS, ("mama",))

    assert datos.datos_criticos("leucemia") == ()
    assert datos.criterios("leucemia") == ()
    assert dict(datos.sinonimos("leucemia")) == {}


def test_falla_cerrado_sin_ruta_ni_contenido_cuando_el_catalogo_no_tiene_destino(
    tmp_path: Path,
):
    carpeta = tmp_path / "SENTINELA-RUTA" / "mama"
    carpeta.mkdir(parents=True)
    item = {
        "key": "ki67",
        "cancerType": "mama",
        "label": {"es": "Ki-67"},
        "sourceDocumentTypes": ["examen"],
    }
    (carpeta / "datos-criticos.json").write_text(json.dumps({"items": [item]}), encoding="utf-8")

    with pytest.raises(CatalogoNoDisponible) as error:
        cargar_datos_de_relevancia(tmp_path / "SENTINELA-RUTA", ("mama",))

    assert "SENTINELA" not in str(error.value)
