"""Montaje de la ingesta con la extracción de población en abanico (US-242): el ``IngestionPipelineService`` REAL con el
``PopulationFanoutExtractor`` REAL sobre el catálogo y el almacén del ``Montaje`` (memoria o PostgreSQL y Milvus reales).

Se fingen solo los bordes: LLM de extracción, NLI, recuperador por documento, embeddings y *sparse*. Reloj e ids congelados.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Any

from app.application.corpus_ingestion.ingestion_pipeline_service import IngestionPipelineService
from app.application.corpus_ingestion.reporte import ReporteDeIngesta
from app.application.corpus_metadata.metadata_extraction_service import MetadataExtractionService
from app.application.corpus_metadata.population_fanout import (
    ConfiguracionDePoblacion,
    PopulationFanoutExtractor,
)
from app.domain.corpus_seed.documento import DocumentoDeSemilla
from app.domain.criterios_aplicabilidad import CriterioDeAplicabilidad
from app.infrastructure.fetch.fuente_de_texto import FuenteDeTextoDelManifiesto
from app.infrastructure.lenguaje.terminos_prohibidos import cargar_verificador_de_terminos
from app.infrastructure.tokenizer.por_palabras import TokenizadorPorPalabras
from tests.integration.corpus_ingestion.conftest import Montaje, PoblacionObservada
from tests.support.contract import CATALOGOS
from tests.support.fakes import RelojFijo
from tests.support.metadatos import UMBRAL_NLI_DE_TEST, FakeMetadataLlm
from tests.support.poblacion_abanico import (
    TOP_K_DE_TEST,
    VERSION_DE_CATALOGO_DE_TEST,
    VERSION_DEL_MODELO_DE_TEST,
    VERSION_DEL_PROMPT_DE_TEST,
    FakePopulationLlm,
    NliPorValor,
    RecuperadorFalsoPorDocumento,
    criterios_de_mama,
    documentos_e,
)
from tests.support.semilla import (
    DIRECTORIO_DE_FIXTURES,
    FECHA_DE_CORTE_DE_TEST,
    SOLAPE_DE_CHUNK_DE_TEST,
    TAMANO_DE_CHUNK_DE_TEST,
    GeneradorDeIdsFijo,
    politica_de_test,
)

PLANTILLA_DE_TEST = (
    "Criterio: {clave}\nEtiqueta: {etiqueta}\nMáximo de valores: {maximo}\n"
    "<<<FRAGMENTOS\n{fragmentos}\nFRAGMENTOS>>>"
)
CONFIGURACION_DE_TEST = ConfiguracionDePoblacion(
    top_k=TOP_K_DE_TEST,
    max_valores_por_criterio=3,
    max_tokens_de_salida=512,
    concurrencia=1,
    reintentos=1,
    version_del_prompt=VERSION_DEL_PROMPT_DE_TEST,
    version_del_modelo=VERSION_DEL_MODELO_DE_TEST,
    version_del_catalogo=VERSION_DE_CATALOGO_DE_TEST,
    umbral_nli=UMBRAL_NLI_DE_TEST,
)


@dataclass
class MontajeDePoblacion:
    base: Montaje
    llm: FakePopulationLlm
    nli: NliPorValor
    recuperador: RecuperadorFalsoPorDocumento
    servicio: IngestionPipelineService
    configuracion: ConfiguracionDePoblacion

    def ingerir(self, *claves: str) -> ReporteDeIngesta:
        documentos = documentos_e()
        return self.servicio.ingerir(tuple(documentos[c] for c in (claves or tuple(documentos))))

    def ingerir_documentos(self, *documentos: DocumentoDeSemilla) -> ReporteDeIngesta:
        return self.servicio.ingerir(documentos)

    def poblacion_de(self, clave: str) -> PoblacionObservada:
        return self.base.observador.poblacion_de(clave)

    def con_configuracion(self, **cambios: Any) -> MontajeDePoblacion:
        """Otro montaje con el mismo catálogo y almacén (una corrida posterior con otra configuración)."""
        return montar_poblacion(
            self.base,
            self.llm,
            configuracion=replace(self.configuracion, **cambios),
            recuperador=self.recuperador,
            nli=self.nli,
        )


def montar_poblacion(
    base: Montaje,
    llm: FakePopulationLlm | None = None,
    *,
    configuracion: ConfiguracionDePoblacion = CONFIGURACION_DE_TEST,
    recuperador: RecuperadorFalsoPorDocumento | None = None,
    nli: NliPorValor | None = None,
    sinonimos: dict[str, str] | None = None,
) -> MontajeDePoblacion:
    llm = llm if llm is not None else FakePopulationLlm()
    recuperador = recuperador if recuperador is not None else RecuperadorFalsoPorDocumento()
    nli = nli if nli is not None else NliPorValor()
    terminos = cargar_verificador_de_terminos(CATALOGOS)
    extractor = PopulationFanoutExtractor(
        llm=llm,
        nli=nli,
        recuperador=recuperador,
        criterios=_Criterios(),
        plantilla_del_prompt=PLANTILLA_DE_TEST,
        sinonimos=sinonimos or {},
        buscar_terminos_prohibidos=lambda texto: terminos.reglas_coincidentes(
            texto, "studyPopulationValues[].value"
        ),
        configuracion=configuracion,
    )
    servicio = IngestionPipelineService(
        catalogo=base.catalogo,
        almacen_de_chunks=base.almacen,
        embedder=base.embedder,
        codificador_sparse=base.sparse,
        resolutor_de_metadatos=MetadataExtractionService.solo_escalares(
            llm=FakeMetadataLlm(), nli=base.nli_metadatos, umbral_nli=UMBRAL_NLI_DE_TEST
        ),
        fuente=FuenteDeTextoDelManifiesto(DIRECTORIO_DE_FIXTURES, None),
        reloj=RelojFijo(),
        ids=GeneradorDeIdsFijo(),
        politica=politica_de_test(),
        tokenizador=TokenizadorPorPalabras(),
        tamano_de_chunk=TAMANO_DE_CHUNK_DE_TEST,
        solape_de_chunk=SOLAPE_DE_CHUNK_DE_TEST,
        fecha_de_corte=FECHA_DE_CORTE_DE_TEST,
        extractor_de_poblacion=extractor,
        almacen_de_poblacion=base.catalogo,
    )
    return MontajeDePoblacion(base, llm, nli, recuperador, servicio, configuracion)


class _Criterios:
    """``CriteriosDeAplicabilidad`` sobre el catálogo de mama versionado (los seis criterios de FX-06c-c)."""

    def criterios(self, tipo_de_cancer: str) -> tuple[CriterioDeAplicabilidad, ...]:
        return criterios_de_mama() if tipo_de_cancer == "mama" else ()
