"""Criterios de población de un documento (RN-25, FR-19): copiados de la fuente estructurada o no_disponible."""

from __future__ import annotations

from app.domain.corpus_seed.poblacion import CRITERIOS_DE_POBLACION, resolver_criterios_poblacion


def test_sin_criterios_estructurados_cada_uno_de_los_seis_vale_no_disponible() -> None:
    criterios = resolver_criterios_poblacion(None)

    assert criterios == dict.fromkeys(CRITERIOS_DE_POBLACION, "no_disponible")
    assert len(criterios) == 6


def test_copia_los_criterios_que_la_fuente_declara_y_deja_el_resto_en_no_disponible() -> None:
    criterios = resolver_criterios_poblacion({"estadio": "metastasico", "linea": "primera"})

    assert criterios["estadio"] == "metastasico" and criterios["linea"] == "primera"
    assert [k for k, v in criterios.items() if v == "no_disponible"] == [
        "subtipo",
        "biomarcadores",
        "edad",
        "ecog",
    ]


def test_un_criterio_vacio_en_la_fuente_cuenta_como_no_disponible() -> None:
    assert resolver_criterios_poblacion({"edad": ""})["edad"] == "no_disponible"


def test_ignora_las_claves_que_no_son_de_los_seis_criterios_en_lugar_de_inventar_columnas() -> None:
    criterios = resolver_criterios_poblacion({"sexo": "femenino"})

    assert set(criterios) == set(CRITERIOS_DE_POBLACION)


def test_no_modifica_el_mapa_de_entrada() -> None:
    entrada = {"estadio": "metastasico"}

    resolver_criterios_poblacion(entrada)

    assert entrada == {"estadio": "metastasico"}
