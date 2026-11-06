"""El resumen de población cuenta, por tipo de cáncer, idioma y criterio, los documentos con elegibilidad verificada
(US-120 AC-7, ADR-47). Catálogo en memoria y PostgreSQL ``corpus`` real (rol ``rag_corpus``); solo identificadores y contadores."""

from __future__ import annotations

import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest

from app.application.corpus_ingestion.resumen_poblacion import resumir_poblacion_por_tipo_e_idioma
from app.domain.criterios_aplicabilidad import CriterioDeAplicabilidad
from app.infrastructure.catalogo_clinico.aplicabilidad import cargar_criterios_de_aplicabilidad
from tests.integration.corpus_ingestion.conftest import Montaje
from tests.support.contract import CATALOGOS
from tests.support.registros import registro_de_prueba
from tests.support.semilla import DIRECTORIO_DE_FIXTURES

TIPOS = ("mama", "prostata")
IDIOMAS = ("es", "en")
VALOR_SENTINELA = "positivo-sentinela"


def valor(alcance: str) -> list[dict[str, str]]:
    return [{"value": VALOR_SENTINELA, "chunkId": "c-1", "scope": alcance}]


def documento(clave: str, tipo: str, idioma: str, criterios: dict[str, Any]) -> Any:
    return registro_de_prueba(
        f"{clave}@{'a' * 6}",
        version_group_id=clave,
        cancer_type_tags=tipo,
        language=idioma,
        population_criteria=criterios,
        population_form="lista",
        metadata_source="extraido_verificado",
        extracted_fields=tuple(criterios),
    )


def criterios_del_catalogo() -> dict[str, tuple[CriterioDeAplicabilidad, ...]]:
    catalogo = cargar_criterios_de_aplicabilidad(CATALOGOS, TIPOS)
    return {tipo: catalogo.criterios(tipo) for tipo in TIPOS}


@pytest.mark.ac("US-120", 7)
def test_resumen_cuenta_documentos_con_elegibilidad_verificada_por_tipo_idioma_y_criterio_cuando_se_genera(
    fabrica_de_montaje: Callable[[Path], Montaje],
) -> None:
    """[US-120 AC-7] Mama en/es cuentan 1 documento con ``estado_her2``; próstata/en, con solo menciones, cuenta 0; el resumen
    no trae valores ni fragmentos."""
    montaje = fabrica_de_montaje(DIRECTORIO_DE_FIXTURES)
    for registro in (
        documento("m-en-1", "mama", "en", {"biomarcadores.her2": valor("elegibilidad")}),
        documento("m-en-2", "mama", "en", {"biomarcadores.her2": valor("mencion")}),
        documento("m-es-1", "mama", "es", {"biomarcadores.her2": valor("elegibilidad")}),
        documento("p-en-1", "prostata", "en", {"estadio": valor("mencion")}),
    ):
        montaje.catalogo.guardar_documento(registro)

    resumen = resumir_poblacion_por_tipo_e_idioma(
        montaje.catalogo.documentos_vigentes_con_poblacion(), criterios_del_catalogo(), IDIOMAS, 3
    )

    assert resumen["mama"]["en"].documentos == 2
    assert resumen["mama"]["en"].por_criterio is not None
    assert resumen["mama"]["en"].por_criterio["estado_her2"] == 1
    assert (
        resumen["mama"]["es"].documentos,
        (resumen["mama"]["es"].por_criterio or {})["estado_her2"],
    ) == (1, 1)
    prostata_en = resumen["prostata"]["en"]
    assert prostata_en.documentos == 1 and prostata_en.por_criterio is not None
    assert set(prostata_en.por_criterio.values()) == {0}
    assert VALOR_SENTINELA not in json.dumps(
        {
            t: {i: (c.documentos, c.por_criterio) for i, c in por.items()}
            for t, por in resumen.items()
        }
    )
