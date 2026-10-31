"""El paso de metadatos con el abanico activo pide solo escalares (US-242 D8); sin él conserva el camino de US-118."""

from __future__ import annotations

from app.application.corpus_metadata.metadata_extraction_service import MetadataExtractionService
from app.domain.corpus_seed.poblacion import CRITERIOS_DE_POBLACION
from tests.support.metadatos import UMBRAL_NLI_DE_TEST, FakeMetadataLlm, nli_de_metadatos
from tests.support.poblacion_abanico import documentos_e


def _prompt(servicio: MetadataExtractionService, llm: FakeMetadataLlm) -> str:
    servicio.resolver(documentos_e()["doc-e1"], "texto sintetico", ["texto sintetico"])
    return llm.prompts[0]


def test_solo_escalares_no_pide_ningun_criterio_de_poblacion_al_llm_de_metadatos() -> None:
    llm = FakeMetadataLlm()
    servicio = MetadataExtractionService.solo_escalares(
        llm=llm, nli=nli_de_metadatos(), umbral_nli=UMBRAL_NLI_DE_TEST
    )

    linea = next(
        p for p in _prompt(servicio, llm).splitlines() if p.startswith("Campos solicitados")
    )

    assert "trial_phase" in linea
    assert not [c for c in CRITERIOS_DE_POBLACION if c in linea]


def test_el_servicio_por_defecto_sigue_pidiendo_los_criterios_de_poblacion() -> None:
    llm = FakeMetadataLlm()
    servicio = MetadataExtractionService(
        llm=llm, nli=nli_de_metadatos(), umbral_nli=UMBRAL_NLI_DE_TEST
    )

    linea = next(
        p for p in _prompt(servicio, llm).splitlines() if p.startswith("Campos solicitados")
    )

    assert all(c in linea for c in CRITERIOS_DE_POBLACION)


def test_solo_escalares_ignora_la_poblacion_que_el_llm_proponga_igualmente() -> None:
    llm = FakeMetadataLlm(por_defecto={"population_criteria": {"estadio": "IV"}})
    servicio = MetadataExtractionService.solo_escalares(
        llm=llm, nli=nli_de_metadatos(), umbral_nli=UMBRAL_NLI_DE_TEST
    )

    resueltos = servicio.resolver(documentos_e()["doc-e1"], "texto", ["texto"])

    assert "estadio" not in {c.campo for c in resueltos.campos_verificados}
