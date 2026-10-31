"""Tercera tanda del Gate 2 de L1D-298: mutantes vivos del proponente y fronteras de la configuración."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any

import httpx
import pytest
import respx

from app.application.ports import ApplicabilityTextProposer
from app.config.modelos import ConfigInvalida as ConfigDeModelosInvalida
from app.config.modelos import cargar_config_modelos
from app.config.settings import Settings
from app.domain.applicability_text import ChunkDeFuente, CriterioPendiente, FuenteParaProponer
from app.evaluation.composicion_suite import componer_servicio
from app.evaluation.config_suite import ConfigInvalida, cargar_config_suite
from app.evaluation.cronometro import Cronometro, RelojSimulado
from app.evaluation.evaluate import FuenteDatasetEnDirectorio
from app.evaluation.llamadas import RegistroDeLlamadas
from app.evaluation.modelos_locales import OrigenLocal, PuertosLocales, cargar_puertos_locales
from app.infrastructure.llm.fabrica_local import crear_proponente_local
from app.infrastructure.llm.openai_compatible import cuerpo_de_peticion
from app.infrastructure.llm.proponente_de_aplicabilidad import LlmApplicabilityTextProposer
from tests.evaluation.test_fidelidad_juez import CONFIG, LOCAL
from tests.evaluation.test_proveedor_local_aceptacion import modelos_fingidos
from tests.evaluation.test_proveedor_local_unitarios import config_local
from tests.support.fakes import RelojFijo
from tests.support.modelos import crear_entorno_de_modelos

FUENTE = FuenteParaProponer(
    "doc-x",
    (CriterioPendiente("estado_her2", "Estado de HER2", "HER2 status"),),
    (ChunkDeFuente("ch-1", "HER2-negative disease."),),
)


def _servicio_local(tmp_path: Path, registro: RegistroDeLlamadas, **entorno: str) -> Any:
    config = config_local()
    variables = crear_entorno_de_modelos(tmp_path / "pesos").con(**entorno)
    puertos = cargar_puertos_locales(
        config, OrigenLocal(variables, modelos_fingidos, lambda: 0.0), registro, "sintetico"
    )
    dataset = FuenteDatasetEnDirectorio(config.dataset).cargar()
    return puertos, componer_servicio(
        config, dataset, Cronometro(RelojSimulado()), RelojFijo(), puertos_locales=puertos
    )


def test_el_servicio_local_usa_el_proponente_de_produccion_y_cada_llamada_queda_registrada(
    tmp_path: Path,
) -> None:
    registro = RegistroDeLlamadas()
    _, servicio = _servicio_local(tmp_path, registro)
    proponente = servicio.servicio._textual._proponente  # noqa: SLF001
    registro.llamadas.clear()  # la composición ya embebió el corpus: solo importa la llamada del proponente

    with respx.mock() as http:
        ruta = http.post(f"{LOCAL}/chat/completions").mock(
            return_value=httpx.Response(
                200, json={"choices": [{"message": {"content": json.dumps({"proposals": []})}}]}
            )
        )
        asyncio.run(proponente.proponer([FUENTE]))

    assert isinstance(proponente, LlmApplicabilityTextProposer)
    assert ruta.call_count == 1
    assert [(c.adaptador, c.clase_datos) for c in registro.llamadas] == [("llm", "sintetico")]


def _huella_del_proponente(proponente: LlmApplicabilityTextProposer) -> tuple[object, ...]:
    cliente: Any = proponente._cliente  # noqa: SLF001
    cliente = getattr(cliente, "_interno", cliente)
    return (
        cliente._url,  # noqa: SLF001
        cliente._model,  # noqa: SLF001
        cliente._timeout_s,  # noqa: SLF001
        cliente._max_output_tokens,  # noqa: SLF001
        cliente._temperature,  # noqa: SLF001
        proponente._max_chars_fragmentos,  # noqa: SLF001
    )


def test_el_proponente_de_la_suite_y_el_de_produccion_tienen_la_misma_configuracion(
    tmp_path: Path,
) -> None:
    puertos, _ = _servicio_local(
        tmp_path,
        RegistroDeLlamadas(),
        LLM_REQUEST_TIMEOUT_MS="12345",
        LLM_MAX_OUTPUT_TOKENS="777",
        LLM_TEMPERATURE="0.3",
        LLM_FRAGMENTS_MAX_CHARS="999",
    )
    config = config_local()
    de_produccion = crear_proponente_local(
        Settings(
            _env_file=None,  # type: ignore[call-arg]
            llm_base_url=config.urls["llm"],
            llm_model=config.llm_modelo,
            llm_request_timeout_ms=12345,
            llm_max_output_tokens=777,
            llm_temperature=0.3,
            llm_fragments_max_chars=999,
        )
    )

    assert isinstance(puertos, PuertosLocales)
    assert _huella_del_proponente(puertos.proponente) == _huella_del_proponente(de_produccion)
    assert _huella_del_proponente(puertos.proponente)[-1] == 999


def test_el_proponente_de_los_puertos_locales_cumple_el_puerto_de_aplicabilidad(
    tmp_path: Path,
) -> None:
    puertos, _ = _servicio_local(tmp_path, RegistroDeLlamadas())

    proponente: ApplicabilityTextProposer = puertos.proponente
    assert hasattr(proponente, "proponer")


def test_una_clave_ausente_se_nombra_en_las_claves_de_la_configuracion_de_modelos(
    tmp_path: Path,
) -> None:
    entorno = crear_entorno_de_modelos(tmp_path / "pesos").con(NLI_MODEL=None)

    with pytest.raises(ConfigDeModelosInvalida) as error:
        cargar_config_modelos(entorno)

    assert error.value.claves == ("NLI_MODEL",)


def test_un_solapamiento_igual_al_tamano_del_chunk_nombra_la_clave_del_solapamiento(
    tmp_path: Path,
) -> None:
    entorno = crear_entorno_de_modelos(tmp_path / "pesos").con(
        CORPUS_CHUNK_SIZE="1024", CORPUS_CHUNK_OVERLAP="1024"
    )

    with pytest.raises(ConfigDeModelosInvalida) as error:
        cargar_config_modelos(entorno)

    assert error.value.claves == ("CORPUS_CHUNK_OVERLAP",)


def test_la_semilla_cero_llega_al_cuerpo_de_la_peticion() -> None:
    cuerpo = cuerpo_de_peticion("m", "u", {"type": "object"}, 0.0, 8, semilla=0)

    assert cuerpo["seed"] == 0


def test_la_muestra_minima_con_digitos_no_ascii_se_rechaza() -> None:
    entorno = {
        "EVAL_JUDGE_MODEL": "m@1",
        "EVAL_JUDGE_BASE_URL": LOCAL,
        "JUEZ_ACUERDO_MINIMO": "0.7",
        "JUEZ_MUESTRA_MINIMA": "٣",
    }

    with pytest.raises(ConfigInvalida, match="muestra_minima"):
        cargar_config_suite(CONFIG, entorno)
