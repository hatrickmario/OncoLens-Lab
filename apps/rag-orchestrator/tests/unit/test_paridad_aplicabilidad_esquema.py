"""El espejo Pydantic de ``aplicabilidad.json`` no es más laxo que su esquema JSON (L1D-126, Gate 2 M1).

Mismo corpus de variantes por ``jsonschema`` (la fuente: ``packages/clinical-catalogs/schemas``) y por el adapter:
deben coincidir en aceptar o rechazar. Además se comparan propiedades, obligatorios y enumerados."""

import copy
import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest
from jsonschema import Draft202012Validator
from referencing import Registry, Resource

from app.infrastructure.catalogo_clinico.aplicabilidad import (
    _Criterio,
    cargar_criterios_de_aplicabilidad,
)
from app.infrastructure.catalogo_clinico.manifiesto import CatalogoNoDisponible
from tests.support.catalogo_aplicabilidad import APL_1_0_0
from tests.support.contract import CATALOGOS

ESQUEMAS = CATALOGOS / "schemas"
Variante = Callable[[dict[str, Any]], None]


def _leer(nombre: str) -> dict[str, Any]:
    return json.loads((ESQUEMAS / nombre).read_text(encoding="utf-8"))


def _validador() -> Draft202012Validator:
    recursos = [
        (n, Resource.from_contents(_leer(n)))
        for n in ("comun.schema.json", "validation.schema.json")
    ]
    return Draft202012Validator(
        _leer("aplicabilidad.schema.json"), registry=Registry().with_resources(recursos)
    )


def _base() -> dict[str, Any]:
    archivo = json.loads((APL_1_0_0 / "mama" / "aplicabilidad.json").read_text(encoding="utf-8"))
    archivo["validation"] = {
        "scope": ["aplicabilidad"],
        "status": "propuesta_revisada",
        "reviewerRole": "oncologo_asesor",
        "date": "2026-10-24",
        "catalogHash": "a" * 64,
    }
    return archivo


def _item(archivo: dict[str, Any]) -> dict[str, Any]:
    return archivo["items"][0]  # estado_her2: tiene match, equivalences y partial


def _poner(ruta: tuple[str, ...], valor: object) -> Variante:
    def aplicar(archivo: dict[str, Any]) -> None:
        destino: Any = _item(archivo)
        for paso in ruta[:-1]:
            destino = destino[paso]
        destino[ruta[-1]] = valor

    return aplicar


def _raiz(campo: str, valor: object) -> Variante:
    return lambda archivo: archivo.__setitem__(campo, valor)


def _sin(ruta: tuple[str, ...]) -> Variante:
    def aplicar(archivo: dict[str, Any]) -> None:
        destino: Any = _item(archivo)
        for paso in ruta[:-1]:
            destino = destino[paso]
        del destino[ruta[-1]]

    return aplicar


VARIANTES: dict[str, Variante] = {
    "base": lambda archivo: None,
    "match_lista": _poner(("destination", "match"), {"name": ["RE", "RP"]}),
    "sin_match": _sin(("destination", "match")),
    "sin_field": _sin(("destination", "field")),
    "limits_solo_min": _poner(("rule", "limits"), {"min": 1}),
    "limits_con_ceros": _poner(("rule", "limits"), {"min": 0, "max": 0}),
    "sin_label_en": _sin(("label", "en")),
    "studykey_con_punto": _poner(("studyKey",), "biomarcadores.her2"),
    "excluyente_texto": _poner(("isExclusionary",), "true"),
    "excluyente_entero": _poner(("isExclusionary",), 1),
    "limits_vacio": _poner(("rule", "limits"), {}),
    "limits_texto": _poner(("rule", "limits"), {"max": "0"}),
    "limits_booleano": _poner(("rule", "limits"), {"max": True}),
    "equivalences_vacio": _poner(("rule", "equivalences"), {}),
    "equivalencia_lista_vacia": _poner(("rule", "equivalences"), {"positivo": []}),
    "equivalencia_repetida": _poner(("rule", "equivalences"), {"positivo": ["3+", "3+"]}),
    "equivalencia_clave_invalida": _poner(("rule", "equivalences"), {"Con Espacio": ["3+"]}),
    "studykey_vacia": _poner(("studyKey",), ""),
    "studykey_mayuscula": _poner(("studyKey",), "Ecog"),
    "key_con_espacios": _poner(("key",), "estado her2"),
    "tipo_con_puntos": _poner(("cancerType",), ".."),
    "entity_invalida": _poner(("destination", "entity"), "x"),
    "field_invalido": _poner(("destination", "field"), "Value"),
    "match_clave_invalida": _poner(("destination", "match"), {"Nombre": "HER2"}),
    "match_lista_vacia": _poner(("destination", "match"), {"name": []}),
    "match_lista_repetida": _poner(("destination", "match"), {"name": ["RE", "RE"]}),
    "match_valor_vacio": _poner(("destination", "match"), {"name": ""}),
    "match_numero": _poner(("destination", "match"), {"name": 3}),
    "destino_con_extra": _poner(("destination", "peso"), 1),
    "etiqueta_vacia": _poner(("label", "es"), ""),
    "estado_desconocido": _poner(("estado",), "otro"),
    "operador_desconocido": _poner(("rule", "operator"), "expresion"),
    "parcial_desconocido": _poner(("rule", "partial", "when"), "siempre"),
    "sin_partial": _sin(("rule", "partial")),
    "regla_con_extra": _poner(("rule", "peso"), 1),
    "criterio_con_peso": _poner(("peso",), 3),
    "sin_studykey": _sin(("studyKey",)),
    "version_invalida": _raiz("version", "x"),
    "version_de_test": _raiz("version", "test-apl-1.0.1"),
    "items_no_lista": _raiz("items", {}),
    "raiz_con_extra": _raiz("peso", 1),
    "validation_scope_vacio": lambda a: a["validation"].__setitem__("scope", []),
    "validation_scope_repetido": lambda a: a["validation"].__setitem__(
        "scope", ["aplicabilidad", "aplicabilidad"]
    ),
    "validation_scope_desconocido": lambda a: a["validation"].__setitem__("scope", ["otro"]),
    "validation_hash_corto": lambda a: a["validation"].__setitem__("catalogHash", "abc"),
    "validation_fecha_invalida": lambda a: a["validation"].__setitem__("date", "24/10/2026"),
    "validation_sin_status": lambda a: a["validation"].pop("status"),
    "validation_con_extra": lambda a: a["validation"].__setitem__("peso", 1),
}


def _aplicar(nombre: str) -> dict[str, Any]:
    archivo = copy.deepcopy(_base())
    VARIANTES[nombre](archivo)
    return archivo


def _lo_acepta_el_adapter(archivo: dict[str, Any], tmp_path: Path) -> bool:
    (tmp_path / "mama").mkdir()
    (tmp_path / "mama" / "aplicabilidad.json").write_text(json.dumps(archivo), encoding="utf-8")
    try:
        cargar_criterios_de_aplicabilidad(tmp_path, ("mama",))
    except CatalogoNoDisponible:
        return False
    return True


@pytest.mark.parametrize("nombre", list(VARIANTES))
def test_adapter_acepta_o_rechaza_igual_que_el_esquema_json_cuando_se_aplica_la_variante(
    tmp_path: Path, nombre: str
) -> None:
    archivo = _aplicar(nombre)

    segun_el_esquema = Draft202012Validator.is_valid(_validador(), archivo)

    assert _lo_acepta_el_adapter(archivo, tmp_path) is segun_el_esquema


@pytest.mark.parametrize(
    "valor_de_excluyente", ["true", 1, {}, "1"], ids=["texto", "entero", "objeto", "uno"]
)
def test_rechaza_el_catalogo_cuando_is_exclusionary_no_es_booleano_estricto(
    tmp_path: Path, valor_de_excluyente: object
) -> None:
    archivo = _base()
    _item(archivo)["isExclusionary"] = valor_de_excluyente

    assert _lo_acepta_el_adapter(archivo, tmp_path) is False


@pytest.mark.parametrize("tipo", ["..", "Mama", "mama/../x", "", "mama1"])
def test_rechaza_el_catalogo_cuando_el_tipo_del_manifiesto_no_es_solo_minusculas(
    tmp_path: Path, tipo: str
) -> None:
    with pytest.raises(CatalogoNoDisponible):
        cargar_criterios_de_aplicabilidad(tmp_path, (tipo,))


def _criterio_del_esquema() -> dict[str, Any]:
    return _leer("aplicabilidad.schema.json")["$defs"]["criterio"]


def test_el_modelo_declara_las_mismas_propiedades_y_obligatorios_que_el_esquema_del_criterio() -> (
    None
):
    del_esquema = _criterio_del_esquema()
    del_modelo = _Criterio.model_json_schema()

    assert set(del_modelo["properties"]) == set(del_esquema["properties"])
    assert set(del_modelo.get("required", ())) == set(del_esquema["required"])


def test_el_modelo_declara_los_mismos_enumerados_que_el_esquema() -> None:
    esquema = _leer("aplicabilidad.schema.json")
    modelo = _Criterio.model_json_schema()
    regla_modelo = modelo["$defs"]["_Regla"]

    assert set(modelo["properties"]["estado"]["enum"]) == set(
        _leer("comun.schema.json")["$defs"]["estado"]["enum"]
    )
    assert set(regla_modelo["properties"]["operator"]["enum"]) == set(
        esquema["$defs"]["regla"]["properties"]["operator"]["enum"]
    )
    assert set(modelo["$defs"]["_Parcial"]["properties"]["when"]["enum"]) == set(
        esquema["$defs"]["regla"]["properties"]["partial"]["properties"]["when"]["enum"]
    )
