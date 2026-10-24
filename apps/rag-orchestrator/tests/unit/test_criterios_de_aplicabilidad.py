"""Adapter de criterios de aplicabilidad (L1D-126, D4): forma nueva tolerada, esquema estricto, errores sin ruta."""

import json
from pathlib import Path
from typing import Any

import pytest

from app.domain.criterios_aplicabilidad import LimitesDeRegla
from app.infrastructure.catalogo_clinico.aplicabilidad import cargar_criterios_de_aplicabilidad
from app.infrastructure.catalogo_clinico.manifiesto import CatalogoNoDisponible
from tests.support.catalogo_aplicabilidad import APL_1_0_0
from tests.support.contract import CATALOGOS

SENTINELA = "SENTINELA-RUTA-Y-CONTENIDO"


def _archivo_valido() -> dict[str, Any]:
    return json.loads((APL_1_0_0 / "mama" / "aplicabilidad.json").read_text(encoding="utf-8"))


def _catalogo_con(tmp_path: Path, contenido: object | None, nombre: str = "mama") -> Path:
    carpeta = tmp_path / SENTINELA / nombre
    carpeta.mkdir(parents=True)
    if contenido is not None:
        texto = contenido if isinstance(contenido, str) else json.dumps(contenido)
        (carpeta / "aplicabilidad.json").write_text(texto, encoding="utf-8")
    return tmp_path / SENTINELA


def test_lee_una_lista_en_destination_match_como_tupla_cuando_el_criterio_la_declara(
    tmp_path: Path,
) -> None:
    archivo = _archivo_valido()
    archivo["items"][0]["destination"]["match"] = {"name": ["RE", "RP"], "scope": "tumor"}

    criterios = cargar_criterios_de_aplicabilidad(
        _catalogo_con(tmp_path, archivo), ("mama",)
    ).criterios("mama")

    assert dict(criterios[0].destino.coincidencia) == {"name": ("RE", "RP"), "scope": ("tumor",)}


def test_lee_solo_el_limite_declarado_cuando_la_regla_trae_un_extremo(tmp_path: Path) -> None:
    archivo = _archivo_valido()
    archivo["items"][0]["rule"]["limits"] = {"min": 1}

    criterios = cargar_criterios_de_aplicabilidad(
        _catalogo_con(tmp_path, archivo), ("mama",)
    ).criterios("mama")

    assert criterios[0].regla.limites == LimitesDeRegla(minimo=1.0, maximo=None)


def test_devuelve_vacio_cuando_el_tipo_de_cancer_no_esta_en_el_catalogo() -> None:
    criterios = cargar_criterios_de_aplicabilidad(APL_1_0_0, ("mama", "prostata"))

    assert criterios.criterios("leucemia") == ()


@pytest.mark.parametrize("campo", ["peso", "score", "weight"])
def test_rechaza_el_catalogo_cuando_un_criterio_declara_puntaje_rn_28(
    tmp_path: Path, campo: str
) -> None:
    archivo = _archivo_valido()
    archivo["items"][2][campo] = 3

    with pytest.raises(CatalogoNoDisponible):
        cargar_criterios_de_aplicabilidad(_catalogo_con(tmp_path, archivo), ("mama",))


def test_rechaza_el_catalogo_cuando_un_criterio_no_tiene_study_key(tmp_path: Path) -> None:
    archivo = _archivo_valido()
    del archivo["items"][2]["studyKey"]

    with pytest.raises(CatalogoNoDisponible):
        cargar_criterios_de_aplicabilidad(_catalogo_con(tmp_path, archivo), ("mama",))


def test_rechaza_el_catalogo_cuando_la_regla_declara_un_campo_desconocido(tmp_path: Path) -> None:
    archivo = _archivo_valido()
    archivo["items"][2]["rule"]["peso"] = 1

    with pytest.raises(CatalogoNoDisponible):
        cargar_criterios_de_aplicabilidad(_catalogo_con(tmp_path, archivo), ("mama",))


def test_rechaza_el_catalogo_cuando_el_operador_no_es_conocido(tmp_path: Path) -> None:
    archivo = _archivo_valido()
    archivo["items"][2]["rule"]["operator"] = "expresion"

    with pytest.raises(CatalogoNoDisponible):
        cargar_criterios_de_aplicabilidad(_catalogo_con(tmp_path, archivo), ("mama",))


@pytest.mark.parametrize("contenido", [None, f"{SENTINELA} {{no es json", "[]", {"version": "x"}])
def test_el_error_no_lleva_la_ruta_ni_el_contenido_cuando_aplicabilidad_no_sirve(
    tmp_path: Path, contenido: object
) -> None:
    catalogo = _catalogo_con(tmp_path, contenido)

    with pytest.raises(CatalogoNoDisponible) as error:
        cargar_criterios_de_aplicabilidad(catalogo, ("mama",))

    assert SENTINELA not in str(error.value)
    assert str(tmp_path) not in str(error.value)


def test_rechaza_el_catalogo_cuando_falta_el_archivo_de_un_tipo_que_declara_el_manifiesto(
    tmp_path: Path,
) -> None:
    catalogo = _catalogo_con(tmp_path, _archivo_valido(), "mama")

    with pytest.raises(CatalogoNoDisponible):
        cargar_criterios_de_aplicabilidad(catalogo, ("mama", "prostata"))


def test_carga_los_criterios_de_mama_y_prostata_del_catalogo_del_repositorio() -> None:
    manifiesto = json.loads((CATALOGOS / "manifest.json").read_text(encoding="utf-8"))
    tipos = tuple(manifiesto["cancerTypes"])

    criterios = cargar_criterios_de_aplicabilidad(CATALOGOS, tipos)

    for tipo in tipos:
        declarados = criterios.criterios(tipo)
        assert declarados, tipo
        assert all(c.tipo_de_cancer == tipo and c.clave_de_estudio for c in declarados)


def test_expone_el_estado_de_revision_del_criterio_con_el_vocabulario_del_catalogo() -> None:
    criterios = cargar_criterios_de_aplicabilidad(APL_1_0_0, ("mama", "prostata"))

    assert {c.estado_de_revision for c in criterios.criterios("mama")} == {"propuesta"}
