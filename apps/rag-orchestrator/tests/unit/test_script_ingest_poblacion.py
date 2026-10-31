"""``python -m app.scripts.ingest`` con la extracción de población en abanico (US-242): configuración y composición (RN-22)."""

from __future__ import annotations

import pytest

from app.application.corpus_metadata.population_fanout import PopulationFanoutExtractor
from app.config.settings import (
    POBLACION_CONCURRENCIA_INICIAL,
    POBLACION_MAX_TOKENS_DE_SALIDA_INICIAL,
    POBLACION_REINTENTOS_INICIAL,
    POBLACION_TOP_K_INICIAL,
    POBLACION_VERSION_DEL_PROMPT_INICIAL,
    CorpusIngestSettings,
    Settings,
)
from app.scripts import ingest
from app.scripts.ingest_poblacion import (
    CatalogoDePoblacionNoConfigurado,
    extractor_de_poblacion,
)
from tests.support.contract import CATALOGOS
from tests.support.ingesta import CodificadorSparseFalso
from tests.support.metadatos import FakeMetadataLlm, nli_de_metadatos
from tests.support.poblacion_abanico import FakePopulationLlm
from tests.support.semilla import EmbedderFalso
from tests.unit.test_script_ingest import ARGUMENTOS, entorno  # noqa: F401


def _ajustes(**cambios: object) -> CorpusIngestSettings:
    return CorpusIngestSettings(_env_file=None, **cambios)  # type: ignore[call-arg,arg-type]


def test_la_extraccion_de_poblacion_arranca_con_los_valores_del_spike_us_240(
    entorno: pytest.MonkeyPatch,  # noqa: F811
) -> None:
    ajustes = _ajustes()

    assert (
        ajustes.population_extraction_top_k,
        ajustes.population_extraction_max_output_tokens,
        ajustes.population_extraction_concurrency,
        ajustes.population_extraction_retries,
        ajustes.population_prompt_version,
        ajustes.population_max_values_per_criterion,
    ) == (4, 512, 1, 1, "poblacion_v1", 3)
    assert (
        POBLACION_TOP_K_INICIAL,
        POBLACION_MAX_TOKENS_DE_SALIDA_INICIAL,
        POBLACION_CONCURRENCIA_INICIAL,
        POBLACION_REINTENTOS_INICIAL,
        POBLACION_VERSION_DEL_PROMPT_INICIAL,
    ) == (4, 512, 1, 1, "poblacion_v1")


def test_las_claves_de_la_extraccion_de_poblacion_se_leen_del_entorno(
    entorno: pytest.MonkeyPatch,  # noqa: F811
) -> None:
    entorno.setenv("POPULATION_EXTRACTION_TOP_K", "6")
    entorno.setenv("POPULATION_EXTRACTION_CONCURRENCY", "2")
    entorno.setenv("POPULATION_MAX_VALUES_PER_CRITERION", "5")

    ajustes = _ajustes()

    assert (
        ajustes.population_extraction_top_k,
        ajustes.population_extraction_concurrency,
        ajustes.population_max_values_per_criterion,
    ) == (6, 2, 5)


@pytest.mark.parametrize(
    "clave",
    [
        "POPULATION_EXTRACTION_TOP_K",
        "POPULATION_EXTRACTION_MAX_OUTPUT_TOKENS",
        "POPULATION_EXTRACTION_CONCURRENCY",
        "POPULATION_MAX_VALUES_PER_CRITERION",
    ],
)
def test_un_valor_no_positivo_de_la_extraccion_de_poblacion_se_rechaza_en_la_configuracion(
    entorno: pytest.MonkeyPatch,  # noqa: F811
    clave: str,
) -> None:
    entorno.setenv(clave, "0")

    with pytest.raises(ValueError, match=clave.lower()):
        _ajustes()


def test_la_composicion_construye_el_extractor_con_el_catalogo_versionado_y_la_configuracion(
    entorno: pytest.MonkeyPatch,  # noqa: F811
) -> None:
    ambiente = Settings(_env_file=None, modelos=None, clinical_catalog_path=CATALOGOS)  # type: ignore[call-arg]

    extractor = extractor_de_poblacion(
        FakePopulationLlm(), nli_de_metadatos(), 0.8, "llm-x", _ajustes(), ambiente
    )

    assert isinstance(extractor, PopulationFanoutExtractor)


def test_la_composicion_se_niega_sin_ruta_de_catalogo_nombrando_solo_la_variable(
    entorno: pytest.MonkeyPatch,  # noqa: F811
) -> None:
    ambiente = Settings(_env_file=None, modelos=None, clinical_catalog_path=None)  # type: ignore[call-arg]

    with pytest.raises(CatalogoDePoblacionNoConfigurado) as fallo:
        extractor_de_poblacion(
            FakePopulationLlm(), nli_de_metadatos(), 0.8, "llm-x", _ajustes(), ambiente
        )

    assert str(fallo.value) == "CLINICAL_CATALOG_PATH"


def test_la_cli_con_llm_de_poblacion_y_sin_catalogo_sale_con_1_nombrando_la_variable_antes_de_conectar(
    entorno: pytest.MonkeyPatch,  # noqa: F811
    capsys: pytest.CaptureFixture[str],
) -> None:
    entorno.delenv("CLINICAL_CATALOG_PATH", raising=False)

    codigo = ingest.main(
        ARGUMENTOS,
        embedder=EmbedderFalso(),
        sparse=CodificadorSparseFalso(),
        llm=FakeMetadataLlm(),
        nli=nli_de_metadatos(),
        llm_poblacion=FakePopulationLlm(),
    )

    capturado = capsys.readouterr()
    assert codigo == 1 and capturado.err.strip() == "ingest: CLINICAL_CATALOG_PATH"
    assert capturado.out == ""


def test_la_cli_con_una_version_de_prompt_sin_plantilla_sale_con_1_nombrando_la_variable(
    entorno: pytest.MonkeyPatch,  # noqa: F811
    capsys: pytest.CaptureFixture[str],
) -> None:
    entorno.setenv("CLINICAL_CATALOG_PATH", str(CATALOGOS))
    entorno.setenv("POPULATION_PROMPT_VERSION", "poblacion_v999")

    codigo = ingest.main(
        ARGUMENTOS,
        embedder=EmbedderFalso(),
        sparse=CodificadorSparseFalso(),
        llm=FakeMetadataLlm(),
        nli=nli_de_metadatos(),
        llm_poblacion=FakePopulationLlm(),
    )

    assert codigo == 1
    assert capsys.readouterr().err.strip() == "ingest: POPULATION_PROMPT_VERSION"
