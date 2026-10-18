"""Medición del runtime y de los candidatos de LLM (US-224 AC-1, AC-2) con el HTTP del runtime fingido (``respx``)."""

from __future__ import annotations

import itertools
import json
from pathlib import Path

import httpx
import pytest
import respx

from app.application.generation import ESQUEMA_DE_GENERACION
from app.evaluation.dataset_loader import cargar_dataset_configurado
from app.scripts.adr39 import runtime_llm
from app.scripts.adr39.config import CandidatoLlm, cargar_config
from tests.evaluation.conftest import DATASET_REAL, RAIZ_REPO

BASE = "http://runtime-local.test:11434"
TAG = "modelo-de-prueba:1b"
PARAMS = {"num_ctx": 8192, "temperature": 0.0, "max_output_tokens": 256, "thinking": False}
SALIDA_VALIDA = json.dumps(
    {"options": [{"option": "o", "rationale": "r", "citedChunkIds": ["M01-1"]}]}
)


def reloj_de_medio_segundo() -> runtime_llm.Reloj:
    contador = itertools.count()
    return lambda: next(contador) * 0.5


def cliente_ollama(http: httpx.Client) -> runtime_llm.ClienteRuntime:
    return runtime_llm.ClienteRuntime(http, BASE, "ollama", reloj_de_medio_segundo(), PARAMS)


def respuesta_chat(contenido: str = SALIDA_VALIDA) -> httpx.Response:
    return httpx.Response(
        200,
        json={
            "message": {"content": contenido},
            "eval_count": 80,
            "eval_duration": 1_000_000_000,
            "prompt_eval_count": 400,
            "prompt_eval_duration": 500_000_000,
        },
    )


def respuesta_ps(gb: float, gpu: float = 1.0) -> httpx.Response:
    size = int(gb * 1e9)
    return httpx.Response(
        200,
        json={"models": [{"name": TAG, "model": TAG, "size": size, "size_vram": int(size * gpu)}]},
    )


def test_prompts_del_dataset_repite_las_preguntas_con_evidencia_hasta_completar_las_llamadas() -> (
    None
):
    dataset = cargar_dataset_configurado(DATASET_REAL)

    prompts = runtime_llm.prompts_del_dataset(dataset, 200)

    assert len(prompts) == 200
    assert all("[chunkId:" in p and "Pregunta:" in p for p in prompts)
    sin_evidencia = [p for p in dataset.preguntas if p.modo_acierto == "sin_evidencia"]
    assert sin_evidencia and all(q.texto not in "".join(prompts) for q in sin_evidencia)  # RN-02


def test_chat_ollama_envia_num_ctx_esquema_y_sin_thinking_y_lee_las_metricas_del_runtime() -> None:
    with respx.mock() as llm, httpx.Client() as http:
        ruta = llm.post(f"{BASE}/api/chat").mock(return_value=respuesta_chat())

        llamada = cliente_ollama(http).chat(TAG, "prompt", ESQUEMA_DE_GENERACION)

    cuerpo = json.loads(ruta.calls[0].request.content)
    assert cuerpo["options"] == {"num_ctx": 8192, "temperature": 0.0, "num_predict": 256}
    assert cuerpo["think"] is False and cuerpo["stream"] is False
    assert cuerpo["format"] == ESQUEMA_DE_GENERACION
    assert llamada.tokens_por_segundo == 80.0
    assert llamada.tokens_prefill == 400 and llamada.segundos_prefill == 0.5
    assert llamada.segundos == 0.5


def test_chat_devuelve_contenido_none_cuando_el_runtime_responde_error() -> None:
    with respx.mock() as llm, httpx.Client() as http:
        llm.post(f"{BASE}/api/chat").mock(return_value=httpx.Response(500))

        llamada = cliente_ollama(http).chat(TAG, "prompt", None)

    assert llamada.contenido is None
    assert llamada.tokens_por_segundo is None  # null, nunca 0


def test_chat_openai_usa_chat_completions_con_response_format_y_toma_los_tokens_de_usage() -> None:
    with respx.mock() as llm, httpx.Client() as http:
        ruta = llm.post(f"{BASE}/v1/chat/completions").mock(
            return_value=httpx.Response(
                200,
                json={
                    "choices": [{"message": {"content": SALIDA_VALIDA}}],
                    "usage": {"completion_tokens": 50, "prompt_tokens": 300},
                },
            )
        )
        cliente = runtime_llm.ClienteRuntime(http, BASE, "openai", reloj_de_medio_segundo(), PARAMS)

        llamada = cliente.chat(TAG, "prompt", ESQUEMA_DE_GENERACION)

    cuerpo = json.loads(ruta.calls[0].request.content)
    assert cuerpo["response_format"]["json_schema"]["schema"] == ESQUEMA_DE_GENERACION
    assert llamada.tokens_generados == 50 and llamada.tokens_por_segundo is None


@pytest.mark.parametrize("esquema", [ESQUEMA_DE_GENERACION, None])
def test_el_cuerpo_v1_del_script_es_el_del_adapter_de_produccion_cuando_se_mide_la_ruta_de_produccion(
    esquema: dict | None,
) -> None:
    from app.infrastructure.llm.openai_compatible import cuerpo_de_peticion

    with respx.mock() as llm, httpx.Client() as http:
        ruta = llm.post(f"{BASE}/v1/chat/completions").mock(
            return_value=httpx.Response(200, json={"choices": [{"message": {"content": "{}"}}]})
        )
        cliente = runtime_llm.ClienteRuntime(http, BASE, "openai", reloj_de_medio_segundo(), PARAMS)

        cliente.chat(TAG, "prompt", esquema)

    enviado = json.loads(ruta.calls[0].request.content)
    assert enviado == cuerpo_de_peticion(TAG, "prompt", esquema, 0.0, 256)


def test_medir_admision_devuelve_la_mediana_de_las_memorias_residentes_tras_el_prompt_mas_largo() -> (
    None
):
    memorias = iter([15.0, 16.0, 15.5])
    with respx.mock() as llm, httpx.Client() as http:
        llm.post(f"{BASE}/api/chat").mock(return_value=respuesta_chat())
        llm.get(f"{BASE}/api/ps").mock(side_effect=lambda _: respuesta_ps(next(memorias)))

        memoria = runtime_llm.medir_admision(cliente_ollama(http), TAG, "prompt largo", 3)

    assert memoria == 15.5


def test_medir_admision_devuelve_none_cuando_el_runtime_no_informa_el_modelo_cargado() -> None:
    with respx.mock() as llm, httpx.Client() as http:
        llm.post(f"{BASE}/api/chat").mock(return_value=respuesta_chat())
        llm.get(f"{BASE}/api/ps").mock(return_value=httpx.Response(200, json={"models": []}))

        assert runtime_llm.medir_admision(cliente_ollama(http), TAG, "p", 3) is None


@pytest.mark.ac("US-224", 2)
def test_medir_candidato_descarta_por_memoria_sin_hacer_las_llamadas_cuando_supera_21_gb() -> None:
    config = cargar_config()
    with respx.mock() as llm, httpx.Client() as http:
        chat = llm.post(f"{BASE}/api/chat").mock(return_value=respuesta_chat())
        llm.get(f"{BASE}/api/ps").mock(return_value=respuesta_ps(24.0))
        llm.get(f"{BASE}/api/tags").mock(return_value=httpx.Response(200, json={"models": []}))

        medido = runtime_llm.medir_candidato(
            cliente_ollama(http),
            CandidatoLlm("D", TAG, "Apache-2.0", True),
            ["p"] * 200,
            config,
            None,
        )

    assert medido["admitido"] is False
    assert medido["memoria_llm_gb"] == 24.0
    assert medido["llamadas"] == 0
    assert (
        chat.call_count == config.repeticiones_admision * 2
    )  # descarga + carga por repetición, ninguna de las 200


@pytest.mark.ac("US-224", 2)
def test_medir_candidato_mide_json_valido_tokens_por_segundo_y_p95_cuando_es_admitido(
    tmp_path: Path,
) -> None:
    config = cargar_config()
    salidas = itertools.cycle([SALIDA_VALIDA, "no es json"])
    with respx.mock() as llm, httpx.Client() as http:
        llm.post(f"{BASE}/api/chat").mock(side_effect=lambda _: respuesta_chat(next(salidas)))
        llm.get(f"{BASE}/api/ps").mock(return_value=respuesta_ps(15.0))
        llm.get(f"{BASE}/api/tags").mock(
            return_value=httpx.Response(
                200, json={"models": [{"name": TAG, "digest": "2dd70431afed99"}]}
            )
        )

        medido = runtime_llm.medir_candidato(
            cliente_ollama(http),
            CandidatoLlm("A", TAG, "Apache-2.0", True),
            ["p"] * 10,
            config,
            tmp_path,
        )

    assert medido["admitido"] is True
    assert medido["digest"] == "2dd70431afed"
    assert medido["json_valido"] == 0.5
    assert medido["tokens_por_segundo"] == 80.0
    assert medido["p95_ms"] == 500.0
    assert medido["llamadas"] == 10 * config.corridas
    muestra = (tmp_path / "A.jsonl").read_text(encoding="utf-8").splitlines()
    assert (
        len(muestra) == 5
    )  # solo las salidas con contenido de la primera corrida (10 llamadas, la mitad vacías de JSON)


def test_medir_runtime_ollama_registra_gpu_api_openai_y_restriccion_por_esquema() -> None:
    with respx.mock() as llm, httpx.Client() as http:
        llm.get(f"{BASE}/api/version").mock(
            return_value=httpx.Response(200, json={"version": "0.34.4"})
        )
        llm.post(f"{BASE}/api/chat").mock(return_value=respuesta_chat())
        llm.get(f"{BASE}/api/ps").mock(return_value=respuesta_ps(15.0, gpu=1.0))
        llm.post(f"{BASE}/v1/chat/completions").mock(
            return_value=httpx.Response(200, json={"choices": [{"message": {"content": "ok"}}]})
        )

        medido = runtime_llm.medir_runtime(cliente_ollama(http), http, BASE, "ollama", TAG)

    assert medido["version"] == "0.34.4"
    assert medido["gpu_porcentaje"] == 100.0
    assert medido["api_openai_compatible"] is True
    assert medido["json_restringido_por_runtime"] is True


def test_medir_runtime_deja_la_gpu_en_none_con_la_instruccion_manual_cuando_el_runtime_no_la_expone() -> (
    None
):
    with respx.mock() as llm, httpx.Client() as http:
        llm.get(f"{BASE}/version").mock(return_value=httpx.Response(404))
        llm.post(f"{BASE}/v1/chat/completions").mock(
            return_value=httpx.Response(
                200, json={"choices": [{"message": {"content": "prosa libre"}}]}
            )
        )
        cliente = runtime_llm.ClienteRuntime(http, BASE, "openai", reloj_de_medio_segundo(), PARAMS)

        medido = runtime_llm.medir_runtime(cliente, http, BASE, "openai", TAG)

    assert medido["gpu_porcentaje"] is None
    assert "log de arranque" in medido["gpu_nota"]
    assert (
        medido["json_restringido_por_runtime"] is False
    )  # respondió prosa: la restricción no la aplica el runtime


def test_medir_estructuracion_calcula_el_p95_por_documento_sobre_el_texto_de_verdad_de_terreno() -> (
    None
):
    dataset_ocr = RAIZ_REPO / "data" / "eval" / "ocr-mini"
    verdad = json.loads((dataset_ocr / "ground_truth.json").read_text(encoding="utf-8"))[
        "documentos"
    ]
    with respx.mock() as llm, httpx.Client() as http:

        def responder(peticion: httpx.Request) -> httpx.Response:
            esquema = json.loads(peticion.content)["format"]
            return respuesta_chat(json.dumps({k: "v" for k in esquema["required"]}))

        llm.post(f"{BASE}/api/chat").mock(side_effect=responder)

        medido = runtime_llm.medir_estructuracion(cliente_ollama(http), TAG, dataset_ocr, 3)

    assert medido["documentos"] == len(verdad)
    assert medido["p95_ms"] == 500.0
    assert medido["json_valido"] == 1.0
