"""Evaluación de la extracción de población en abanico (US-242, OL-06, prompt ``poblacion_v1``) con adapters falsos.

Usa la FÁBRICA DE PRODUCCIÓN (``ingest_poblacion.extractor_de_poblacion``) con el LLM y el NLI falsos de la CI: la
composición, el catálogo versionado, la lista de términos prohibidos y el umbral son los reales; solo los modelos son
dobles. Dataset 100 % sintético (FX-06c-c). Las métricas con modelos reales (precisión y cobertura por criterio,
duplicados, ``finish_reason=length`` = 0) son de US-233b.

* ``no_respaldados_conservados`` = valores sin soporte en su fragmento (relleno, fragmento ajeno, inventado, con lenguaje
  prescriptivo) que llegaron al catálogo. Meta = 0 (RN-01, RN-04, RN-23).
* ``cobertura_de_respaldados`` = valores respaldados que se conservaron / valores respaldados. Meta = 1,0 con el NLI falso.
* ``duplicados_conservados`` = valores repetidos tras normalizar. Meta = 0 (RN-27).

La variante ``confia_en_el_llm`` reproduce un paso que guarda lo que el LLM propone (el comportamiento de ``main`` antes
de este change: sin relleno, fragmento ni NLI): la métrica DEBE detectarla (``no_respaldados_conservados > 0``); si no la
detectara, la evaluación no protegería nada.
"""

from __future__ import annotations

from dataclasses import replace
from typing import Any

from app.application.corpus_metadata.poblacion_puertos import DocumentoParaExtraer
from app.application.corpus_metadata.population_fanout import (
    PopulationFanoutExtractor,
    _ResultadoDeCriterio,
)
from app.config.settings import CorpusIngestSettings, Settings
from app.domain.corpus_metadata.poblacion_contadores import ContadoresDePoblacion
from app.domain.corpus_metadata.poblacion_escritura import lista_de_criterio
from app.domain.lenguaje import normalizar_texto
from app.scripts.ingest_poblacion import extractor_de_poblacion
from tests.support.contract import CATALOGOS
from tests.support.poblacion_abanico import (
    FRAGMENTOS_POR_DOCUMENTO,
    FakePopulationLlm,
    NliPorValor,
)

UMBRAL = 0.8
# Cada criterio: tema que el LLM falso propone; el resto del escenario se superpone en orden (EXT-*).
ESCENARIOS = ("EXT-OK", "EXT-RELLENO", "EXT-AJENO", "EXT-NLI", "EXT-PROHIBIDO", "EXT-LARGO")
RESPALDADOS = frozenset({"premenopausal women", "postmenopausal women", "triple-negative"})
DOCUMENTO = DocumentoParaExtraer("doc-e1", "doc-e1@eval", FRAGMENTOS_POR_DOCUMENTO["doc-e1"])


def _produccion() -> PopulationFanoutExtractor:
    return extractor_de_poblacion(
        FakePopulationLlm(ESCENARIOS),
        NliPorValor(),
        UMBRAL,
        "llm-de-evaluacion",
        CorpusIngestSettings(  # type: ignore[call-arg]
            _env_file=None,
            corpus_accepted_licenses=("cc_by",),
            corpus_excluded_sources=("NCCN", "ESMO"),
            corpus_cutoff_date="2026-10-16",
            corpus_chunk_size=12,
            corpus_chunk_overlap=0,
            sparse_vector_source="modelo_embeddings",
            embedding_sparse_weights_path="/x",
            embedding_sparse_weights_sha256="ab" * 32,
        ),
        Settings(_env_file=None, modelos=None, clinical_catalog_path=CATALOGOS),  # type: ignore[call-arg]
    )


def _guardados(extractor: PopulationFanoutExtractor) -> list[str]:
    poblacion = extractor.extraer(DOCUMENTO, ("mama",), None).population_criteria
    return [v["value"] for lista in poblacion.values() if isinstance(lista, list) for v in lista]


def _medir(extractor: PopulationFanoutExtractor) -> dict[str, float]:
    conservados = _guardados(extractor)
    normalizados = [normalizar_texto(v) for v in conservados]
    return {
        "no_respaldados_conservados": len([v for v in conservados if v not in RESPALDADOS]),
        "cobertura_de_respaldados": len(RESPALDADOS & set(conservados)) / len(RESPALDADOS),
        "duplicados_conservados": len(normalizados) - len(set(normalizados)),
    }


class _ConfiaEnElLlm(PopulationFanoutExtractor):
    """Lo que hace un paso que guarda lo que el LLM propone: sin relleno, fragmento, lenguaje ni NLI."""

    def _depurar_y_acotar(self, documento: Any, criterio: Any, salida: Any) -> _ResultadoDeCriterio:
        confiados = tuple(replace(v, resultado_nli="entailment") for v in salida.valores or ())
        lista = lista_de_criterio(confiados, self._configuracion.versiones)
        return _ResultadoDeCriterio(criterio.clave_de_estudio, lista, ContadoresDePoblacion())


def test_ningun_valor_sin_respaldo_llega_al_catalogo_con_la_fabrica_de_produccion() -> None:
    assert _medir(_produccion())["no_respaldados_conservados"] == 0


def test_todo_valor_respaldado_por_su_fragmento_se_conserva_con_la_fabrica_de_produccion() -> None:
    assert _medir(_produccion())["cobertura_de_respaldados"] == 1.0


def test_no_se_conserva_ningun_duplicado_con_la_fabrica_de_produccion() -> None:
    assert _medir(_produccion())["duplicados_conservados"] == 0


def test_la_evaluacion_detecta_un_paso_que_confia_en_el_llm_variante_que_falla_en_main() -> None:
    produccion = _produccion()
    confiado = _ConfiaEnElLlm(
        llm=FakePopulationLlm(
            ESCENARIOS[:-1]
        ),  # sin EXT-LARGO: el escritor ya lo rechaza por su cuenta
        nli=produccion._nli,
        recuperador=produccion._recuperador,
        criterios=produccion._criterios,
        plantilla_del_prompt=produccion._plantilla,
        sinonimos=produccion._sinonimos,
        buscar_terminos_prohibidos=produccion._buscar_terminos_prohibidos,
        configuracion=produccion._configuracion,
    )

    medida = _medir(confiado)

    # fragmento ajeno (her2), valor inventado (estadio) y valor prohibido (ecog): ninguno respaldado por su fragmento.
    assert medida["no_respaldados_conservados"] == 3


def test_la_variante_confia_en_el_llm_sobrescribe_un_metodo_que_existe_en_el_extractor() -> None:
    assert hasattr(PopulationFanoutExtractor, "_depurar_y_acotar")
