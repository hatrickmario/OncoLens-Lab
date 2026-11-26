"""Lectores del catálogo de la parte B de L1D-126 (S7.6): ``revision_provisional``, ``subsetOf``, ``equivalenceMatch`` y
``validation.history`` se aceptan y se descartan o se pasan al dominio según su dueño.

La marca de revisión y el historial son procedencia de la revisión clínica: el dominio no los recibe. La jerarquía y el modo
de coincidencia son parte de la regla: el dominio sí. Un catálogo con esos campos mal formados no está disponible."""

import dataclasses
import json
import shutil
from pathlib import Path
from typing import Any

import pytest
from jsonschema import Draft202012Validator
from referencing import Registry, Resource

from app.domain.criterios_aplicabilidad import (
    CriterioDeAplicabilidad,
    ReglaDeAplicabilidad,
    ReglasDePoblacion,
)
from app.infrastructure.catalogo_clinico.aplicabilidad import cargar_criterios_de_aplicabilidad
from app.infrastructure.catalogo_clinico.manifiesto import (
    CatalogoNoDisponible,
    cargar_catalogo_del_manifiesto,
)
from app.infrastructure.catalogo_clinico.poblacion_reglas import (
    _Archivo as _ArchivoDeReglas,
)
from app.infrastructure.catalogo_clinico.poblacion_reglas import (
    leer_reglas_de_poblacion,
)
from tests.support.catalogo_aplicabilidad import APL_1_3_0
from tests.support.contract import CATALOGOS

TIPOS = ("mama", "prostata")


def _copia(tmp_path: Path) -> Path:
    destino = tmp_path / "catalogo"
    shutil.copytree(APL_1_3_0, destino)
    return destino


def _editar(catalogo: Path, tipo: str, nombre: str, cambio: Any) -> None:
    ruta = catalogo / tipo / nombre
    contenido = json.loads(ruta.read_text(encoding="utf-8"))
    cambio(contenido)
    ruta.write_text(json.dumps(contenido), encoding="utf-8")


def _carga(catalogo: Path) -> bool:
    try:
        cargar_criterios_de_aplicabilidad(catalogo, TIPOS)
    except CatalogoNoDisponible:
        return False
    return True


def _criterio(catalogo: Path, tipo: str, clave: str) -> CriterioDeAplicabilidad:
    criterios = cargar_criterios_de_aplicabilidad(catalogo, TIPOS).criterios(tipo)
    return next(c for c in criterios if c.clave == clave)


@pytest.mark.ac("US-121", 1)
def test_carga_el_catalogo_con_revision_provisional_jerarquia_y_modo_cuando_los_declara(
    tmp_path: Path,
) -> None:
    catalogo = _copia(tmp_path)

    her2 = _criterio(catalogo, "mama", "estado_her2")
    extension = _criterio(catalogo, "prostata", "extension")

    assert dict(her2.regla.jerarquia) == {"bajo": "negativo"}
    assert her2.regla.coincidencia_de_equivalencias == "prefijo"
    assert extension.regla.coincidencia_de_equivalencias == "componente"
    assert dict(extension.regla.jerarquia) == {}


def test_el_dominio_no_recibe_la_marca_de_revision_ni_el_historial_cuando_se_carga_el_catalogo() -> (
    None
):
    campos = {
        f.name
        for tipo in (CriterioDeAplicabilidad, ReglaDeAplicabilidad, ReglasDePoblacion)
        for f in dataclasses.fields(tipo)
    }

    assert not {"revision_provisional", "history", "historial", "revision"} & campos


def _poner_en_el_criterio(campo: str, valor: object):
    return lambda contenido: contenido["items"][0].__setitem__(campo, valor)


def _poner_en_la_regla(campo: str, valor: object):
    return lambda contenido: contenido["items"][0]["rule"].__setitem__(campo, valor)


def _poner_en_validation(campo: str, valor: object):
    return lambda contenido: contenido["validation"].__setitem__(campo, valor)


MAL_FORMADOS = {
    "revision_con_rol_desconocido": _poner_en_el_criterio(
        "revision_provisional", {"rol": "oncologo_asesor", "fecha": "2026-11-21"}
    ),
    "revision_con_fecha_invalida": _poner_en_el_criterio(
        "revision_provisional", {"rol": "ia", "fecha": "ayer"}
    ),
    "revision_con_extra": _poner_en_el_criterio(
        "revision_provisional", {"rol": "ia", "fecha": "2026-11-21", "nombre": "x"}
    ),
    "jerarquia_con_valor_numerico": _poner_en_la_regla("subsetOf", {"bajo": 1}),
    "jerarquia_vacia": _poner_en_la_regla("subsetOf", {}),
    "modo_desconocido": _poner_en_la_regla("equivalenceMatch", "regex"),
    "historial_vacio": _poner_en_validation("history", []),
    "historial_con_persona": _poner_en_validation(
        "history",
        [
            {
                "status": "propuesta_revisada",
                "reviewerRole": "oncologo_asesor",
                "date": "2026-10-24",
                "catalogHash": "b" * 64,
                "reviewerName": "alguien",
            }
        ],
    ),
}


@pytest.mark.parametrize("nombre", list(MAL_FORMADOS))
def test_rechaza_el_catalogo_cuando_un_campo_de_la_parte_b_esta_mal_formado(
    tmp_path: Path, nombre: str
) -> None:
    catalogo = _copia(tmp_path)
    _editar(catalogo, "mama", "aplicabilidad.json", MAL_FORMADOS[nombre])

    assert _carga(catalogo) is False


def test_carga_el_catalogo_cuando_la_validacion_trae_historial_de_revisiones(
    tmp_path: Path,
) -> None:
    catalogo = _copia(tmp_path)
    contenido = json.loads((catalogo / "mama" / "aplicabilidad.json").read_text(encoding="utf-8"))

    assert contenido["validation"]["history"]
    assert _carga(catalogo) is True


def test_carga_las_reglas_de_poblacion_cuando_un_criterio_trae_revision_provisional(
    tmp_path: Path,
) -> None:
    catalogo = _copia(tmp_path)
    contenido = json.loads(
        (catalogo / "prostata" / "poblacion-reglas.json").read_text(encoding="utf-8")
    )

    assert "revision_provisional" in contenido["criteria"]["extension"]
    reglas = leer_reglas_de_poblacion(catalogo / "prostata" / "poblacion-reglas.json")
    assert "no_metastasica" in reglas.de("extension").sinonimos


@pytest.mark.parametrize(
    "marca",
    [
        {"rol": "oncologo_asesor", "fecha": "2026-11-21"},
        {"rol": "ia", "fecha": "ayer"},
        {"rol": "ia"},
        {"rol": "ia", "fecha": "2026-11-21", "nombre": "x"},
    ],
    ids=["rol_desconocido", "fecha_invalida", "sin_fecha", "con_extra"],
)
def test_rechaza_las_reglas_de_poblacion_cuando_revision_provisional_esta_mal_formada(
    tmp_path: Path, marca: dict[str, str]
) -> None:
    catalogo = _copia(tmp_path)
    _editar(
        catalogo,
        "prostata",
        "poblacion-reglas.json",
        lambda c: c["criteria"]["extension"].__setitem__("revision_provisional", marca),
    )

    with pytest.raises(CatalogoNoDisponible):
        leer_reglas_de_poblacion(catalogo / "prostata" / "poblacion-reglas.json")


def _validador_de_reglas() -> Draft202012Validator:
    esquemas = CATALOGOS / "schemas"
    recursos = [
        (n, Resource.from_contents(json.loads((esquemas / n).read_text(encoding="utf-8"))))
        for n in ("comun.schema.json",)
    ]
    esquema = json.loads((esquemas / "poblacion-reglas.schema.json").read_text(encoding="utf-8"))
    return Draft202012Validator(esquema, registry=Registry().with_resources(recursos))


def test_el_modelo_de_reglas_declara_las_mismas_propiedades_por_criterio_que_el_esquema() -> None:
    esquema = json.loads(
        (CATALOGOS / "schemas" / "poblacion-reglas.schema.json").read_text(encoding="utf-8")
    )
    del_esquema = esquema["properties"]["criteria"]["additionalProperties"]["properties"]
    del_modelo = _ArchivoDeReglas.model_json_schema()["$defs"]["_ReglasDelCriterio"]["properties"]

    assert set(del_modelo) == set(del_esquema)


def test_el_catalogo_real_cumple_el_esquema_de_reglas_y_el_modelo_lo_acepta_cuando_se_leen_los_dos_tipos() -> (
    None
):
    validador = _validador_de_reglas()
    for tipo in TIPOS:
        ruta = CATALOGOS / tipo / "poblacion-reglas.json"
        contenido = json.loads(ruta.read_text(encoding="utf-8"))

        assert validador.is_valid(contenido)
        leer_reglas_de_poblacion(ruta)  # no lanza: el modelo no es más estricto que el esquema


def test_el_catalogo_real_se_carga_completo_con_la_version_del_manifiesto() -> None:
    catalogo = cargar_catalogo_del_manifiesto(CATALOGOS)

    criterios = cargar_criterios_de_aplicabilidad(CATALOGOS, catalogo.tipos_de_cancer())

    assert {c.clave for c in criterios.criterios("prostata")} >= {"extension", "hrr_brca"}
    assert criterios.criterios("mama")


@pytest.mark.parametrize(
    ("tipo", "clave"),
    [("mama", "estado_her2"), ("prostata", "extension")],
    ids=["her2", "extension"],
)
def test_la_fixture_iguala_al_criterio_del_catalogo_real_cuando_se_leen_los_dos(
    tipo: str, clave: str
) -> None:
    de_la_fixture = _criterio(APL_1_3_0, tipo, clave)
    real = cargar_criterios_de_aplicabilidad(CATALOGOS, TIPOS).criterios(tipo)

    assert de_la_fixture == next(c for c in real if c.clave == clave)
