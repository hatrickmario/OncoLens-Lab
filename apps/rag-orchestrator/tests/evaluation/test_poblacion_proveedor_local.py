"""La familia `poblacion` de `evaluate` con `adaptadores.proveedor: local` (L1D-299, US-233b AC-2; S7-D1, RN-12, RN-14).

Los pesos de ONNX se sustituyen por fakes en el puerto del cargador (la CI no tiene pesos); el LLM es el adapter REAL de
Ollama ``/v1`` contra un servidor fingido con ``respx``: todo request se observa y debe ser local.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import httpx
import pytest
import respx

from app.config.settings import Settings
from app.evaluation.adaptadores_falsos import NliGuionado
from app.evaluation.config_poblacion import cargar_config_poblacion
from app.evaluation.corrida_poblacion import MedicionSinEvidencia, PuertosDePoblacion
from app.evaluation.evaluate import main
from app.infrastructure.models.local import ModelosDeRecuperacion
from tests.evaluation.conftest import RAIZ_APP
from tests.evaluation.dorado_de_prueba import escribir_config, escribir_dorado
from tests.evaluation.test_proveedor_local_aceptacion import modelos_fingidos as _modelos_lexicos
from tests.support.fakes import RelojFijo
from tests.support.modelos import crear_entorno_de_modelos

LOCAL = "http://127.0.0.1:11434/v1"
HOSTS_LOCALES = {"127.0.0.1", "localhost", "host.docker.internal"}
VALORES_DEL_LLM = {
    "values": [{"value": "HER2-positive", "chunkId": "ch-t1-1", "scope": "elegibilidad"}]
}


def modelos_fingidos(ajustes: Settings) -> ModelosDeRecuperacion:
    """Los pesos de la CI son dobles; el NLI confirma siempre: lo que se mide es la orquestación, no el modelo."""
    lexicos = _modelos_lexicos(ajustes)
    return ModelosDeRecuperacion(
        detector_idioma=lexicos.detector_idioma,
        embedder_consulta=lexicos.embedder_consulta,
        embedder_pasajes=lexicos.embedder_pasajes,
        reranker=lexicos.reranker,
        clasificador_nli=NliGuionado("entailment"),
    )


def _cambios_locales(*, modelo: str = "gemma-fingido@1", url: str = LOCAL) -> dict[str, Any]:
    """Las secciones que ``poblacion-local.yaml`` añade a la configuración falsa: la configuración común de la suite
    (modelos, umbrales, catálogo) más el proveedor local."""
    return {
        "nombre": "test-poblacion-local",
        "medicion": {"reloj": "simulado", "rss_limite_mib": 4489},
        "adaptadores": {"proveedor": "local", "urls": {"llm": url}},
        "modelos": {"llm": modelo},
        "semilla_bootstrap": 20261122,
        "bootstrap_repeticiones": 200,
        "umbrales": {
            "relevance_threshold": 0.30,
            "nli_entailment_threshold": 0.8,
            "retrieval_top_k": 30,
            "rerank_top_n": 10,
        },
        "catalogo": {
            "ruta": "packages/clinical-catalogs",
            "version": "2026.10.0",
            "ruta_terminos": "packages/clinical-catalogs",
        },
    }


def _respuesta_del_llm(finish_reason: str = "stop") -> httpx.Response:
    contenido = (
        json.dumps(VALORES_DEL_LLM) if finish_reason == "stop" else '{"values": [{"value": "'
    )
    return httpx.Response(
        200,
        json={"choices": [{"message": {"content": contenido}, "finish_reason": finish_reason}]},
    )


def _correr_local(
    tmp_path: Path,
    *,
    entorno: dict[str, str] | None = None,
    cargador: Any = modelos_fingidos,
    finish_reason: str = "stop",
    **cambios: Any,
) -> tuple[int, dict[str, Any] | None, list[Any]]:
    carpeta = escribir_dorado(tmp_path / "dorado")
    config = escribir_config(tmp_path, carpeta, **{**_cambios_locales(), **cambios})
    salida = tmp_path / "salida"
    pesos = (
        entorno if entorno is not None else crear_entorno_de_modelos(tmp_path / "pesos").variables
    )
    with respx.mock(assert_all_called=False) as http:
        http.route().mock(return_value=_respuesta_del_llm(finish_reason))
        codigo = main(
            ["--config", str(config), "--suite", "poblacion", "--salida", str(salida)],
            reloj=RelojFijo(),
            entorno=pesos,
            cargador_de_modelos=cargador,
            puertos_poblacion=PuertosDePoblacion(lambda _c: MedicionSinEvidencia(1.0, 0)),
        )
        llamadas = list(http.calls)
    escritos = list(salida.glob("*.json")) if salida.exists() else []
    reporte = json.loads(escritos[0].read_text(encoding="utf-8")) if escritos else None
    return codigo, reporte, llamadas


@pytest.mark.ac("US-233b", 2)
def test_poblacion_corre_y_declara_proveedor_local_cuando_la_configuracion_es_poblacion_local(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """Corre y declara proveedor local cuando la configuración es poblacion-local [US-233b AC-2]."""
    codigo, reporte, llamadas = _correr_local(tmp_path)

    assert codigo == 0, capsys.readouterr().err
    assert reporte is not None
    assert reporte["configuracion"]["proveedor"] == "local"
    assert llamadas and {c.request.url.host for c in llamadas} <= HOSTS_LOCALES
    her2 = {c["criterio"]: c for c in reporte["metricas"]["por_criterio"]}["estado_her2"]
    assert (her2["obtenidos"], her2["coincidentes"]) == (1, 1)


@pytest.mark.ac("US-233b", 2)
def test_poblacion_no_guarda_valores_cuando_el_nli_inyectado_no_los_confirma(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """El NLI del puerto se observa: con un NLI neutral el LLM propone pero nada se guarda [US-233b AC-2]."""

    def modelos_neutrales(ajustes: Settings) -> ModelosDeRecuperacion:
        base = modelos_fingidos(ajustes)
        return ModelosDeRecuperacion(
            detector_idioma=base.detector_idioma,
            embedder_consulta=base.embedder_consulta,
            embedder_pasajes=base.embedder_pasajes,
            reranker=base.reranker,
            clasificador_nli=NliGuionado("neutral"),
        )

    codigo, reporte, _ = _correr_local(tmp_path, cargador=modelos_neutrales)

    assert codigo == 0, capsys.readouterr().err
    assert reporte is not None
    her2 = {c["criterio"]: c for c in reporte["metricas"]["por_criterio"]}["estado_her2"]
    assert her2["obtenidos"] == 0


@pytest.mark.ac("US-233b", 2)
def test_poblacion_termina_distinto_de_cero_nombrando_la_variable_y_sin_reporte_cuando_falta_un_peso(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """Termina con código ≠ 0 nombrando la variable y sin reporte cuando falta un peso [US-233b AC-2]."""
    entorno = crear_entorno_de_modelos(tmp_path / "pesos").con(NLI_MODEL_PATH=None)

    codigo, reporte, llamadas = _correr_local(tmp_path, entorno=entorno, cargador=None)

    error = capsys.readouterr().err
    assert (codigo != 0, reporte, llamadas) == (True, None, [])
    assert "NLI_MODEL_PATH" in error and str(tmp_path) not in error
    assert not (tmp_path / "salida").exists()


@pytest.mark.ac("US-233b", 2)
@pytest.mark.parametrize("modelo", ["gemma-fingido:cloud", "x:1b-cloud"])
def test_poblacion_termina_distinto_de_cero_sin_requests_cuando_el_modelo_es_de_nube(
    tmp_path: Path, modelo: str, capsys: pytest.CaptureFixture[str]
) -> None:
    """Termina con código ≠ 0 y sin reporte cuando el proveedor es de nube [US-233b AC-2] (RN-12)."""
    codigo, reporte, llamadas = _correr_local(tmp_path, modelos={"llm": modelo})

    error = capsys.readouterr().err
    assert (codigo != 0, reporte, llamadas) == (True, None, [])
    assert "nube" in error and modelo not in error


@pytest.mark.ac("US-233b", 2)
def test_poblacion_termina_distinto_de_cero_sin_requests_cuando_la_url_del_llm_no_es_local(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """Termina con código ≠ 0 y sin reporte cuando la URL del LLM no es local [US-233b AC-2] (RN-12)."""
    nube = {"proveedor": "local", "urls": {"llm": "https://api.nube-de-prueba.invalid/v1"}}

    codigo, reporte, llamadas = _correr_local(tmp_path, adaptadores=nube)

    assert (codigo != 0, reporte, llamadas) == (True, None, [])
    assert "llm" in capsys.readouterr().err


def test_poblacion_local_sale_con_codigo_3_y_nombra_documento_y_criterio_cuando_el_llm_corta_por_longitud(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    codigo, _, _ = _correr_local(tmp_path, finish_reason="length")

    error = capsys.readouterr().err
    assert codigo == 3
    assert "finish_reason length en doc-t1 / estado_her2" in error


def test_la_configuracion_poblacion_local_versionada_declara_el_proveedor_local_y_las_mismas_metas_que_la_falsa() -> (
    None
):
    local = cargar_config_poblacion(RAIZ_APP / "eval" / "configs" / "poblacion-local.yaml")
    falsa = cargar_config_poblacion(RAIZ_APP / "eval" / "configs" / "test-poblacion.yaml")

    assert local.proveedor == "local" and local.suite is not None
    assert local.suite.urls["llm"].startswith("http://127.0.0.1")
    assert local.metas == falsa.metas and local.dataset == falsa.dataset
    assert falsa.suite is None
