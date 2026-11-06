"""Reglas del resumen de población por tipo e idioma (US-120 AC-7): puras, sobre filas del catálogo y criterios del catálogo."""

from __future__ import annotations

import json
from typing import Any

from app.application.corpus_ingestion.resumen_poblacion import (
    como_diccionario,
    resumir_poblacion_por_tipo_e_idioma,
)
from app.application.seed_corpus.ports import RegistroDeDocumento
from app.domain.criterios_aplicabilidad import CriterioDeAplicabilidad
from app.infrastructure.catalogo_clinico.aplicabilidad import cargar_criterios_de_aplicabilidad
from tests.support.contract import CATALOGOS
from tests.support.registros import registro_de_prueba

IDIOMAS = ("es", "en")
CATALOGO = cargar_criterios_de_aplicabilidad(CATALOGOS, ("mama", "prostata"))
CRITERIOS: dict[str, tuple[CriterioDeAplicabilidad, ...]] = {
    "mama": CATALOGO.criterios("mama"),
    "prostata": CATALOGO.criterios("prostata"),
}


def elegibilidad(clave: str, alcance: str = "elegibilidad") -> dict[str, Any]:
    return {clave: [{"value": "v", "chunkId": "c-1", "scope": alcance}]}


def documento(
    clave: str,
    tipo: str = "mama",
    idioma: str = "en",
    criterios: dict[str, Any] | None = None,
    origen: str = "extraido_verificado",
) -> RegistroDeDocumento:
    return registro_de_prueba(
        f"{clave}@aaaaaa",
        cancer_type_tags=tipo,
        language=idioma,
        population_criteria=criterios or {},
        population_form="lista",
        metadata_source=origen,
    )


def resumir(*documentos: RegistroDeDocumento) -> dict[str, Any]:
    return resumir_poblacion_por_tipo_e_idioma(documentos, CRITERIOS, IDIOMAS, 3)


def test_un_valor_de_elegibilidad_verificado_cuenta_para_el_criterio_de_su_clave_de_estudio() -> (
    None
):
    celda = resumir(documento("a", criterios=elegibilidad("biomarcadores.her2")))["mama"]["en"]

    assert celda.por_criterio["estado_her2"] == 1


def test_un_valor_solo_mencionado_no_cuenta_como_elegibilidad() -> None:
    celda = resumir(documento("a", criterios=elegibilidad("biomarcadores.her2", "mencion")))[
        "mama"
    ]["en"]

    assert celda.documentos == 1 and celda.por_criterio["estado_her2"] == 0


def test_un_valor_de_subgrupo_tampoco_cuenta_como_elegibilidad() -> None:
    celda = resumir(documento("a", criterios=elegibilidad("biomarcadores.her2", "subgrupo")))[
        "mama"
    ]["en"]

    assert celda.por_criterio["estado_her2"] == 0


def test_una_poblacion_sin_verificar_no_cuenta_aunque_traiga_elegibilidad() -> None:
    celda = resumir(
        documento("a", criterios=elegibilidad("biomarcadores.her2"), origen="pendiente")
    )["mama"]["en"]

    assert celda.documentos == 1 and celda.por_criterio["estado_her2"] == 0


def test_un_documento_se_cuenta_una_vez_por_criterio_aunque_tenga_varios_valores() -> None:
    varios = {
        "biomarcadores.her2": [
            {"value": "v1", "chunkId": "c-1", "scope": "elegibilidad"},
            {"value": "v2", "chunkId": "c-2", "scope": "elegibilidad"},
        ]
    }

    celda = resumir(documento("a", criterios=varios))["mama"]["en"]

    assert celda.por_criterio["estado_her2"] == 1


def test_un_documento_con_dos_tipos_cuenta_en_cada_uno() -> None:
    doble = documento("a", tipo="mama,prostata", criterios=elegibilidad("biomarcadores.her2"))

    resumen = resumir(doble)

    assert resumen["mama"]["en"].documentos == resumen["prostata"]["en"].documentos == 1


def test_la_celda_de_un_idioma_sin_documentos_tiene_conteos_nulos_y_no_ceros() -> None:
    resumen = resumir(documento("a", idioma="en"))

    celda = resumen["prostata"]["es"]
    assert (celda.documentos, celda.por_criterio, celda.sin_documentos) == (0, None, True)


def test_los_criterios_salen_del_catalogo_de_aplicabilidad_y_no_de_una_lista_local() -> None:
    celda = resumir(documento("a"))["mama"]["en"]

    assert set(celda.por_criterio) == {c.clave for c in CRITERIOS["mama"]}


def test_un_documento_de_otro_idioma_no_entra_en_la_celda() -> None:
    resumen = resumir(documento("a", idioma="es"))

    assert resumen["mama"]["en"].documentos == 0 and resumen["mama"]["es"].documentos == 1


def test_el_diccionario_del_resumen_trae_solo_identificadores_y_contadores() -> None:
    resumen = resumir(documento("a", criterios=elegibilidad("biomarcadores.her2")))

    salida = como_diccionario(resumen)

    assert salida["mama"]["en"]["documentos"] == 1
    assert salida["mama"]["en"]["sin_documentos"] is False
    assert salida["mama"]["en"]["criterios"]["estado_her2"] == 1
    assert salida["mama"]["es"] == {"documentos": 0, "sin_documentos": True, "criterios": None}
    assert '"v"' not in json.dumps(salida)
