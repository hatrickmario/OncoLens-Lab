"""Raíz de composición de la extracción de población en abanico para ``python -m app.scripts.ingest`` (US-242, RN-22).

Lee del catálogo clínico montado (``CLINICAL_CATALOG_PATH``, solo lectura) los criterios de aplicabilidad vigentes, sus
sinónimos y la lista de términos prohibidos (RN-23); toma de ``CorpusIngestSettings`` los valores a calibrar. Sin
``CLINICAL_CATALOG_PATH`` falla cerrada nombrando solo la variable. El LLM es el local (RN-12).
"""

from __future__ import annotations

from pathlib import Path

from app.application.corpus_metadata.esquema_poblacion import cargar_plantilla
from app.application.corpus_metadata.population_fanout import (
    ConfiguracionDePoblacion,
    PopulationFanoutExtractor,
)
from app.application.corpus_metadata.poblacion_puertos import LlmDePoblacion
from app.application.ports import NliClassifier
from app.config.settings import CorpusIngestSettings, Settings
from app.infrastructure.catalogo_clinico.aplicabilidad import cargar_criterios_de_aplicabilidad
from app.infrastructure.catalogo_clinico.manifiesto import cargar_catalogo_del_manifiesto
from app.infrastructure.catalogo_clinico.sinonimos import cargar_sinonimos
from app.infrastructure.corpus_metadata.recuperador_lexical import RecuperadorLexicalDeFragmentos
from app.infrastructure.lenguaje.terminos_prohibidos import cargar_verificador_de_terminos

CAMPO_DE_VALOR_GENERADO = "studyPopulationValues[].value"


class CatalogoDePoblacionNoConfigurado(RuntimeError):
    """Sin ``CLINICAL_CATALOG_PATH`` no hay criterios que extraer. El mensaje es solo el NOMBRE de la variable."""


def extractor_de_poblacion(
    llm: LlmDePoblacion,
    nli: NliClassifier,
    umbral_nli: float,
    nombre_del_llm: str,
    ajustes: CorpusIngestSettings,
    ambiente: Settings,
) -> PopulationFanoutExtractor:
    catalogos = _ruta_del_catalogo(ambiente)
    catalogo = cargar_catalogo_del_manifiesto(catalogos)
    tipos = catalogo.tipos_de_cancer()
    verificador = cargar_verificador_de_terminos(catalogos)
    return PopulationFanoutExtractor(
        llm=llm,
        nli=nli,
        recuperador=RecuperadorLexicalDeFragmentos(),
        criterios=cargar_criterios_de_aplicabilidad(catalogos, tipos),
        plantilla_del_prompt=cargar_plantilla(ajustes.population_prompt_version),
        sinonimos=cargar_sinonimos(catalogos, tipos),
        buscar_terminos_prohibidos=lambda texto: verificador.reglas_coincidentes(
            texto, CAMPO_DE_VALOR_GENERADO
        ),
        configuracion=ConfiguracionDePoblacion(
            top_k=ajustes.population_extraction_top_k,
            max_valores_por_criterio=ajustes.population_max_values_per_criterion,
            max_tokens_de_salida=ajustes.population_extraction_max_output_tokens,
            concurrencia=ajustes.population_extraction_concurrency,
            reintentos=ajustes.population_extraction_retries,
            version_del_prompt=ajustes.population_prompt_version,
            version_del_modelo=nombre_del_llm,
            version_del_catalogo=catalogo.version(),
            umbral_nli=umbral_nli,
        ),
    )


def _ruta_del_catalogo(ambiente: Settings) -> Path:
    if ambiente.clinical_catalog_path is None:
        raise CatalogoDePoblacionNoConfigurado("CLINICAL_CATALOG_PATH")
    return ambiente.clinical_catalog_path
