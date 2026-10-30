"""Extracción de la población del estudio en abanico (US-242, ADR-47): aceptación de AC-1…AC-9 sobre FX-06c-c.

Integración: el ``IngestionPipelineService`` real con el ``PopulationFanoutExtractor`` real, sobre memoria y, donde existe
el Compose de test, PostgreSQL ``corpus`` y Milvus reales. Se fingen solo los bordes (LLM, NLI, recuperador, embeddings).
"""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

import pytest

from tests.integration.corpus_ingestion.conftest import Montaje
from tests.integration.corpus_ingestion.montaje_poblacion import (
    MontajeDePoblacion,
    montar_poblacion,
)
from tests.support.poblacion_abanico import (
    CRITERIOS_DE_MAMA,
    FRAGMENTOS_POR_DOCUMENTO,
    TOP_K_DE_TEST,
    VERSION_DE_CATALOGO_DE_TEST,
    VERSION_DEL_MODELO_DE_TEST,
    VERSION_DEL_PROMPT_DE_TEST,
    FakePopulationLlm,
)
from tests.support.semilla import DIRECTORIO_DE_FIXTURES


@pytest.fixture
def montar(fabrica_de_montaje: Callable[[Path], Montaje]) -> Callable[..., MontajeDePoblacion]:
    def _montar(llm: FakePopulationLlm | None = None, **kwargs: object) -> MontajeDePoblacion:
        return montar_poblacion(fabrica_de_montaje(DIRECTORIO_DE_FIXTURES), llm, **kwargs)  # type: ignore[arg-type]

    return _montar


def _procedencia(nli: str = "entailment") -> dict[str, str]:
    return {
        "promptVersion": VERSION_DEL_PROMPT_DE_TEST,
        "modelVersion": VERSION_DEL_MODELO_DE_TEST,
        "catalogVersion": VERSION_DE_CATALOGO_DE_TEST,
        "nliResult": nli,
    }


@pytest.mark.ac("US-242", 1)
def test_ingesta_doce_e1_seis_llamadas_valores_con_fragmento(
    montar: Callable[..., MontajeDePoblacion],
) -> None:
    """[US-242 AC-1] Seis llamadas por documento (una por criterio) y los valores se guardan con su fragmento y su procedencia."""
    montaje = montar()

    reporte = montaje.ingerir("doc-e1")

    assert reporte.resultado_de("doc-e1").estado.value == "embebido"
    assert montaje.llm.invocaciones == len(CRITERIOS_DE_MAMA) == 6
    assert sorted(c.criterio for c in montaje.llm.llamadas) == sorted(CRITERIOS_DE_MAMA)
    ids_de_doc_e1 = {f.chunk_id for f in FRAGMENTOS_POR_DOCUMENTO["doc-e1"]}
    assert all(
        0 < len(c.chunk_ids) <= TOP_K_DE_TEST and set(c.chunk_ids) <= ids_de_doc_e1
        for c in montaje.llm.llamadas
    )
    poblacion = montaje.poblacion_de("doc-e1")
    assert poblacion.metadata_source == "extraido_verificado"
    assert poblacion.population_criteria["estado_menopausico"] == [
        {
            "value": valor,
            "chunkId": "ch-e1-1",
            "scope": "elegibilidad",
            **_procedencia(),
        }
        for valor in ("premenopausal women", "postmenopausal women")
    ]


@pytest.mark.ac("US-242", 2)
def test_ingesta_relleno_y_fragmento_ajeno_dejan_lista_vacia_y_se_cuentan(
    montar: Callable[..., MontajeDePoblacion],
) -> None:
    """[US-242 AC-2] El relleno y el fragmento ajeno dejan el criterio vacío y suman a ``valoresRechazados`` por motivo."""
    montaje = montar(FakePopulationLlm(("EXT-OK", "EXT-RELLENO", "EXT-AJENO")))

    reporte = montaje.ingerir("doc-e1")

    assert reporte.resultado_de("doc-e1").estado.value == "embebido"
    criterios = montaje.poblacion_de("doc-e1").population_criteria
    assert criterios["ecog"] == []
    assert criterios["estadio"] == []
    assert criterios["biomarcadores.her2"] == []
    assert len(criterios["estado_menopausico"]) == 2
    contadores = reporte.contadores_de_poblacion
    assert contadores.valores_rechazados == 3
    assert (
        contadores.valores_rechazados_por_relleno,
        contadores.valores_rechazados_por_chunk_ajeno,
    ) == (2, 1)
    resumen = reporte.como_diccionario()["poblacion"]
    assert resumen["valoresRechazados"] == 3
    assert resumen["valoresRechazadosPorMotivo"] == {"relleno": 2, "chunk_ajeno": 1}


@pytest.mark.ac("US-242", 3)
def test_ingesta_valor_sin_soporte_nli_no_se_guarda_y_se_cuenta(
    montar: Callable[..., MontajeDePoblacion],
) -> None:
    """[US-242 AC-3] Un valor que el NLI no confirma contra su fragmento no se guarda y suma a ``valoresSinSoporte``."""
    montaje = montar(FakePopulationLlm(("EXT-OK", "EXT-NLI")))

    reporte = montaje.ingerir("doc-e1")

    criterios = montaje.poblacion_de("doc-e1").population_criteria
    assert criterios["estadio"] == []
    assert len(criterios["estado_menopausico"]) == 2
    assert reporte.contadores_de_poblacion.valores_sin_soporte == 1
    assert reporte.como_diccionario()["poblacion"]["valoresSinSoporte"] == 1
