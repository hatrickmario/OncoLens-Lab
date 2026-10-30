"""La suite `evaluate` con `proveedor: local` (US-233a AC-3, AC-4 y AC-7, RN-12, RN-14, ADR-47 R7).

Los modelos de ONNX se sustituyen por fakes en el puerto del cargador (la CI no tiene pesos, RN-14); el generador es el
adapter REAL de Ollama ``/v1`` contra un servidor fingido con ``respx``: todo request se observa y debe ser local.
"""

from __future__ import annotations

import json
from collections.abc import Sequence
from pathlib import Path
from typing import Any

import httpx
import pytest
import respx
import yaml

from app.config.settings import Settings
from app.evaluation.adaptadores_falsos import EmbedderBolsaDePalabras, NliLexico, RerankerLexico
from app.evaluation.evaluate import main
from app.infrastructure.language.detector_local import DetectorDeIdiomaLocal
from app.infrastructure.models.local import ModelosDeRecuperacion
from tests.evaluation.conftest import RAIZ_APP, RAIZ_REPO
from tests.evaluation.test_fidelidad_juez import veredicto
from tests.support.fakes import RelojFijo
from tests.support.modelos import crear_entorno_de_modelos

CONFIG_FAKE = RAIZ_APP / "eval" / "configs" / "test-fake.yaml"
LOCAL = "http://127.0.0.1:11434/v1"
COMPLETIONS = f"{LOCAL}/chat/completions"
HOSTS_LOCALES = {"127.0.0.1", "localhost", "host.docker.internal"}
LIMITE_DE_RSS_MIB = 4489.0
OPCION_SIN_CITA = {
    "options": [
        {
            "option": "Opción de prueba",
            "rationale": "Texto de prueba.",
            "citedFragments": [],
            "details": [],
        }
    ]
}


class EmbedderDePasajesFalso:
    def embeber(self, textos: Sequence[str]) -> list[list[float]]:
        return [list(EmbedderBolsaDePalabras().embeber(t)) for t in textos]


def modelos_fingidos(_: Settings) -> ModelosDeRecuperacion:
    return ModelosDeRecuperacion(
        detector_idioma=DetectorDeIdiomaLocal("es"),
        embedder_consulta=EmbedderBolsaDePalabras(),
        embedder_pasajes=EmbedderDePasajesFalso(),
        reranker=RerankerLexico(),
        clasificador_nli=NliLexico(),
    )


def config_local(tmp_path: Path, *, modelo: str = "gemma-fingido@1", url: str = LOCAL) -> Path:
    crudo = yaml.safe_load(CONFIG_FAKE.read_text(encoding="utf-8"))
    crudo["nombre"] = "test-local"
    crudo["adaptadores"] = {"proveedor": "local", "urls": {"llm": url}}
    crudo["modelos"] = {"llm": modelo}
    crudo["medicion"] = {"reloj": "simulado", "rss_limite_mib": LIMITE_DE_RSS_MIB}
    ruta = tmp_path / "local.yaml"
    ruta.write_text(yaml.safe_dump(crudo), encoding="utf-8")
    return ruta


def respuesta_del_generador() -> httpx.Response:
    return veredicto(json.dumps(OPCION_SIN_CITA))


def correr_local(
    tmp_path: Path,
    config: Path,
    entorno: dict[str, str],
    *,
    cargador: Any = modelos_fingidos,
    lector_rss: Any = lambda: 100.0,
) -> tuple[int, dict[str, Any] | None, list[Any]]:
    salida = tmp_path / "salida"
    with respx.mock(assert_all_called=False) as http:
        http.route().mock(return_value=respuesta_del_generador())
        codigo = main(
            ["--config", str(config), "--suite", "all", "--salida", str(salida)],
            reloj=RelojFijo(),
            entorno=entorno,
            cargador_de_modelos=cargador,
            lector_rss=lector_rss,
        )
        llamadas = list(http.calls)
    archivos = list(salida.glob("*.json")) if salida.exists() else []
    reporte = json.loads(archivos[0].read_text(encoding="utf-8")) if archivos else None
    return codigo, reporte, llamadas


@pytest.mark.ac("US-233a", 3)
def test_con_proveedor_local_todo_request_es_local_y_el_resultado_solo_trae_agregados(
    tmp_path: Path,
) -> None:
    entorno = crear_entorno_de_modelos(tmp_path / "pesos").variables

    codigo, reporte, llamadas = correr_local(tmp_path, config_local(tmp_path), entorno)

    assert codigo == 0 and reporte is not None
    assert llamadas and {c.request.url.host for c in llamadas} <= HOSTS_LOCALES
    privacidad = reporte["privacidad"]
    assert privacidad["llamadas_nube_datos_reales"] == 0
    assert set(privacidad["adaptadores_cubiertos"]) == {"embeddings", "llm", "nli", "reranker"}
    preguntas = (RAIZ_REPO / "data" / "eval" / "fx-t5a-a" / "preguntas.yaml").read_text("utf-8")
    textos = [p["pregunta"] for p in yaml.safe_load(preguntas)["preguntas"]]
    contenido = json.dumps(reporte, ensure_ascii=False)
    assert not any(texto in contenido for texto in textos)


@pytest.mark.ac("US-233a", 3)
@pytest.mark.parametrize("modelo", ["gemma-fingido:cloud", "x:1b-cloud"])
def test_un_alias_de_modelo_de_nube_aborta_antes_de_crear_el_cliente_sin_enviar_requests(
    tmp_path: Path, modelo: str, capsys: pytest.CaptureFixture[str]
) -> None:
    entorno = crear_entorno_de_modelos(tmp_path / "pesos").variables

    codigo, reporte, llamadas = correr_local(
        tmp_path, config_local(tmp_path, modelo=modelo), entorno
    )

    assert (codigo != 0, reporte, llamadas) == (True, None, [])
    error = capsys.readouterr().err
    assert "nube" in error and modelo not in error


@pytest.mark.ac("US-233a", 3)
def test_una_url_del_generador_fuera_de_la_lista_local_aborta_sin_requests(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    entorno = crear_entorno_de_modelos(tmp_path / "pesos").variables
    config = config_local(tmp_path, url="https://api.nube-de-prueba.invalid/v1")

    codigo, reporte, llamadas = correr_local(tmp_path, config, entorno)

    assert (codigo != 0, reporte, llamadas) == (True, None, [])
    assert "llm" in capsys.readouterr().err


@pytest.mark.ac("US-233a", 4)
def test_sin_los_pesos_la_suite_termina_distinto_de_cero_nombrando_la_variable_y_sin_cifras(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    entorno = crear_entorno_de_modelos(tmp_path / "pesos").con(NLI_MODEL_PATH=None)

    codigo, reporte, llamadas = correr_local(
        tmp_path, config_local(tmp_path), entorno, cargador=None
    )

    assert (codigo != 0, reporte, llamadas) == (True, None, [])
    assert "NLI_MODEL_PATH" in capsys.readouterr().err
    assert not (tmp_path / "salida").exists()


@pytest.mark.ac("US-233a", 4)
def test_con_un_archivo_de_pesos_ausente_la_suite_nombra_la_variable_y_no_la_ruta(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    pesos = crear_entorno_de_modelos(tmp_path / "pesos")
    pesos.ruta_de("RERANKER_MODEL_PATH").unlink()

    codigo, reporte, _ = correr_local(
        tmp_path, config_local(tmp_path), pesos.variables, cargador=None
    )

    error = capsys.readouterr().err
    assert (codigo != 0, reporte) == (True, None)
    assert "RERANKER_MODEL_PATH" in error and str(tmp_path) not in error


@pytest.mark.ac("US-233a", 7)
def test_el_reporte_registra_el_rss_maximo_la_latencia_del_nli_y_la_marca_de_exceso(
    tmp_path: Path,
) -> None:
    entorno = crear_entorno_de_modelos(tmp_path / "pesos").variables

    codigo, reporte, _ = correr_local(
        tmp_path,
        config_local(tmp_path),
        entorno,
        lector_rss=lambda: LIMITE_DE_RSS_MIB + 10.0,
    )

    assert codigo == 0 and reporte is not None
    recursos = reporte["recursos_nli"]
    assert recursos["rss_maximo_mib"] == LIMITE_DE_RSS_MIB + 10.0
    assert (recursos["rss_limite_mib"], recursos["supera_el_limite"]) == (LIMITE_DE_RSS_MIB, True)
    # Reloj simulado: cada lote dura 1 ms; la latencia por hipótesis reparte el lote entre sus hipótesis.
    assert recursos["latencia_ms"]["por_lote"]["p50_ms"] == 1.0
    assert recursos["latencia_ms"]["por_lote"]["p95_ms"] == 1.0
    por_hipotesis = recursos["latencia_ms"]["por_hipotesis"]
    assert por_hipotesis["n"] >= recursos["latencia_ms"]["por_lote"]["n"] > 0
    assert 0 < por_hipotesis["p50_ms"] <= 1.0


@pytest.mark.ac("US-233a", 7)
def test_un_rss_dentro_del_limite_no_marca_exceso(tmp_path: Path) -> None:
    entorno = crear_entorno_de_modelos(tmp_path / "pesos").variables

    _, reporte, _ = correr_local(
        tmp_path, config_local(tmp_path), entorno, lector_rss=lambda: LIMITE_DE_RSS_MIB
    )

    assert reporte is not None and reporte["recursos_nli"]["supera_el_limite"] is False
