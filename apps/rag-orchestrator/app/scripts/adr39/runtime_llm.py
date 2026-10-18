"""Medición del runtime nativo del LLM (AC-1) y de los candidatos de LLM (AC-2) de ADR-39 fase B.

Habla solo con el runtime local (``base_url`` de la configuración, RN-12). El cliente HTTP y el reloj se inyectan:
los tests usan ``respx`` y un reloj congelado; el modelo real solo corre cuando el usuario lanza el comando.
Los reportes llevan agregados, nunca textos (RN-14); las salidas de la muestra de fidelidad van a un directorio aparte.
"""

from __future__ import annotations

import json
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx

from app.application.generation import ESQUEMA_DE_GENERACION
from app.domain.relevance import ChunkPuntuado
from app.evaluation.dataset_loader import Dataset, Pregunta, cargar_dataset_configurado
from app.prompts.rag_query import construir_prompt_rag_query
from app.scripts.adr39.config import CandidatoLlm, ConfigFaseB
from app.scripts.adr39.reglas import mediana, percentil_95, porcentaje_json_valido

Reloj = Callable[[], float]
BYTES_POR_GB = 1e9  # `ollama ps` informa en GB decimales

PROMPT_ADVERSARIAL = "Responde en prosa libre, sin JSON ni llaves: explica en dos frases qué es un receptor hormonal."


@dataclass(frozen=True)
class Llamada:
    segundos: float
    tokens_generados: int | None
    segundos_generacion: float | None
    tokens_prefill: int | None
    segundos_prefill: float | None
    contenido: str | None  # None = error HTTP, plazo agotado o cuerpo sin contenido

    @property
    def tokens_por_segundo(self) -> float | None:
        if not self.tokens_generados or not self.segundos_generacion:
            return None
        return self.tokens_generados / self.segundos_generacion


def prompts_del_dataset(dataset: Dataset, cuantos: int) -> list[str]:
    """Prompts del S1 sobre las preguntas con evidencia del golden; las citas literales hacen de chunks (contexto fijo).

    Se repiten cíclicamente hasta ``cuantos``. Las preguntas ``sin_evidencia`` no llegan al LLM (RN-02).
    """
    con_evidencia = [
        p for p in dataset.preguntas if p.modo_acierto != "sin_evidencia" and p.evidencia
    ]
    if not con_evidencia:
        raise ValueError("el dataset no tiene preguntas con evidencia")
    return [_prompt_de(con_evidencia[i % len(con_evidencia)]) for i in range(cuantos)]


def _prompt_de(pregunta: Pregunta) -> str:
    fragmentos = [
        ChunkPuntuado(f"{e.documento}-{n}", e.documento, e.cita, 1.0)
        for n, e in enumerate(pregunta.evidencia, start=1)
    ]
    return construir_prompt_rag_query(pregunta.texto, "", fragmentos, pregunta.idioma)


class ClienteRuntime:
    """Una llamada de chat al runtime local, con las métricas que el runtime entrega."""

    def __init__(
        self,
        cliente: httpx.Client,
        base_url: str,
        api: str,
        reloj: Reloj,
        params: Mapping[str, Any],
    ) -> None:
        self._http = cliente
        self._base = base_url.rstrip("/")
        self._api = api
        self._reloj = reloj
        self._params = params

    def chat(self, tag: str, prompt: str, esquema: Mapping[str, Any] | None) -> Llamada:
        inicio = self._reloj()
        try:
            if self._api == "ollama":
                crudo = self._chat_ollama(tag, prompt, esquema)
            else:
                crudo = self._chat_openai(tag, prompt, esquema)
        except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError):
            return Llamada(self._reloj() - inicio, None, None, None, None, None)
        return Llamada(self._reloj() - inicio, **crudo)

    def _chat_ollama(
        self, tag: str, prompt: str, esquema: Mapping[str, Any] | None
    ) -> dict[str, Any]:
        cuerpo: dict[str, Any] = {
            "model": tag,
            "messages": [{"role": "user", "content": prompt}],
            "stream": False,
            "think": bool(self._params.get("thinking", False)),
            "options": {
                "num_ctx": self._params["num_ctx"],
                "temperature": self._params["temperature"],
                "num_predict": self._params["max_output_tokens"],
            },
        }
        if esquema is not None:
            cuerpo["format"] = dict(esquema)
        r = self._http.post(f"{self._base}/api/chat", json=cuerpo)
        r.raise_for_status()
        d = r.json()
        return {
            "tokens_generados": d.get("eval_count"),
            "segundos_generacion": _ns_a_s(d.get("eval_duration")),
            "tokens_prefill": d.get("prompt_eval_count"),
            "segundos_prefill": _ns_a_s(d.get("prompt_eval_duration")),
            "contenido": d["message"]["content"],
        }

    def _chat_openai(
        self, tag: str, prompt: str, esquema: Mapping[str, Any] | None
    ) -> dict[str, Any]:
        cuerpo: dict[str, Any] = {
            "model": tag,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": self._params["temperature"],
            "max_tokens": self._params["max_output_tokens"],
            "stream": False,
        }
        if esquema is not None:
            cuerpo["response_format"] = {
                "type": "json_schema",
                "json_schema": {
                    "name": "generation_output",
                    "schema": dict(esquema),
                    "strict": True,
                },
            }
        r = self._http.post(f"{self._base}/v1/chat/completions", json=cuerpo)
        r.raise_for_status()
        d = r.json()
        uso = d.get("usage") or {}
        return {
            "tokens_generados": uso.get("completion_tokens"),
            "segundos_generacion": None,  # el API OpenAI no separa prefill de generación
            "tokens_prefill": uso.get("prompt_tokens"),
            "segundos_prefill": None,
            "contenido": d["choices"][0]["message"]["content"],
        }

    def memoria_residente_gb(self, tag: str) -> float | None:
        """Memoria residente (pesos + KV) que informa el runtime, como ``ollama ps``; ``None`` si no la expone."""
        if self._api != "ollama":
            return None
        r = self._http.get(f"{self._base}/api/ps")
        r.raise_for_status()
        modelo = next(
            (m for m in r.json().get("models", []) if tag in (m.get("name"), m.get("model"))), None
        )
        return modelo["size"] / BYTES_POR_GB if modelo else None

    def porcentaje_gpu(self, tag: str) -> float | None:
        if self._api != "ollama":
            return None
        r = self._http.get(f"{self._base}/api/ps")
        r.raise_for_status()
        modelo = next(
            (m for m in r.json().get("models", []) if tag in (m.get("name"), m.get("model"))), None
        )
        if not modelo or not modelo.get("size"):
            return None
        return 100.0 * modelo.get("size_vram", 0) / modelo["size"]

    def digest(self, tag: str) -> str | None:
        """ID del modelo que informa ``ollama list`` (el ADR lo registra junto al tag)."""
        if self._api != "ollama":
            return None
        r = self._http.get(f"{self._base}/api/tags")
        r.raise_for_status()
        modelo = next(
            (m for m in r.json().get("models", []) if tag in (m.get("name"), m.get("model"))), None
        )
        return str(modelo["digest"])[:12] if modelo else None

    def descargar(self, tag: str) -> None:
        if self._api == "ollama":
            self._http.post(
                f"{self._base}/api/chat", json={"model": tag, "messages": [], "keep_alive": 0}
            )


def _ns_a_s(valor: int | None) -> float | None:
    return None if valor is None else valor / 1e9


def medir_runtime(
    cliente: ClienteRuntime, http: httpx.Client, base_url: str, api: str, tag: str
) -> dict[str, Any]:
    """AC-1: (a) GPU Metal, (b) API compatible con OpenAI, (c) JSON restringido por esquema.

    Lo que el script no puede observar queda en ``null`` con la instrucción de comprobarlo a mano (vllm-metal: log de
    arranque y monitor de GPU); nunca se supone.
    """
    base = base_url.rstrip("/")
    version = _version(http, base, api)
    cliente.chat(tag, "Responde ok.", None)  # carga el modelo antes de leer la GPU
    adversarial = cliente.chat(tag, PROMPT_ADVERSARIAL, ESQUEMA_DE_GENERACION)
    openai = _forma_openai(http, base, tag)
    restringido = (
        None
        if adversarial.contenido is None
        else porcentaje_json_valido([adversarial.contenido], ESQUEMA_DE_GENERACION) == 1.0
    )
    return {
        "api": api,
        "version": version,
        "gpu_porcentaje": cliente.porcentaje_gpu(tag),
        "gpu_nota": None
        if api == "ollama"
        else "comprobar a mano: dispositivo mps/Metal en el log de arranque y ocupación de GPU",
        "api_openai_compatible": openai,
        "json_restringido_por_runtime": restringido,
        "restriccion_nota": "salida válida contra el esquema aun con un prompt que pide prosa libre; si es false o null, la restricción no la aplica el runtime y solo se valida después",
    }


def _version(http: httpx.Client, base: str, api: str) -> str | None:
    try:
        ruta = "/api/version" if api == "ollama" else "/version"
        return str(http.get(f"{base}{ruta}").json().get("version"))
    except (httpx.HTTPError, ValueError, AttributeError):
        return None


def _forma_openai(http: httpx.Client, base: str, tag: str) -> bool:
    try:
        r = http.post(
            f"{base}/v1/chat/completions",
            json={"model": tag, "messages": [{"role": "user", "content": "ok"}], "max_tokens": 8},
        )
        cuerpo = r.json()
        return r.status_code == 200 and isinstance(cuerpo["choices"][0]["message"]["content"], str)
    except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError):
        return False


def medir_admision(
    cliente: ClienteRuntime, tag: str, prompt_mas_largo: str, repeticiones: int
) -> float | None:
    """Memoria residente tras cargar con ``num_ctx`` y procesar el prompt más largo (D1/D3); mediana de N cargas."""
    cifras: list[float] = []
    for _ in range(repeticiones):
        cliente.descargar(tag)
        cliente.chat(tag, prompt_mas_largo, ESQUEMA_DE_GENERACION)
        memoria = cliente.memoria_residente_gb(tag)
        if memoria is not None:
            cifras.append(memoria)
    return mediana(cifras) if cifras else None


def medir_candidato(
    cliente: ClienteRuntime,
    candidato: CandidatoLlm,
    prompts: Sequence[str],
    config: ConfigFaseB,
    dir_muestras: Path | None,
) -> dict[str, Any]:
    """Admisión por memoria y, si pasa, ``llamadas_por_candidato`` llamadas (3 corridas, mediana por métrica)."""
    r = config.restricciones
    memoria = medir_admision(
        cliente, candidato.tag, max(prompts, key=len), config.repeticiones_admision
    )
    base = {
        "id": candidato.id,
        "tag": candidato.tag,
        "digest": cliente.digest(candidato.tag),
        "memoria_llm_gb": memoria,
    }
    if memoria is None:
        return {**base, "admitido": None, "nota": "el runtime no informó la memoria residente"}
    if memoria > r.llm_memory_budget_gb:
        return {**base, "admitido": False, "llamadas": 0}
    corridas = [_corrida(cliente, candidato.tag, list(prompts)) for _ in range(config.corridas)]
    if dir_muestras is not None:
        _guardar_muestra(dir_muestras, candidato.id, corridas[0], config.muestra_fidelidad)
    return {
        **base,
        "admitido": True,
        "llamadas": len(prompts) * config.corridas,
        "json_valido": mediana([c["json_valido"] for c in corridas]),
        "tokens_por_segundo": _mediana_o_none([c["tok_s"] for c in corridas]),
        "prefill_tokens_por_segundo": _mediana_o_none([c["prefill_tok_s"] for c in corridas]),
        "p50_ms": mediana([c["p50_ms"] for c in corridas]),
        "p95_ms": mediana([c["p95_ms"] for c in corridas]),
        "corridas": [{k: v for k, v in c.items() if k != "salidas"} for c in corridas],
    }


def _corrida(cliente: ClienteRuntime, tag: str, prompts: list[str]) -> dict[str, Any]:
    llamadas = [cliente.chat(tag, p, ESQUEMA_DE_GENERACION) for p in prompts]
    tiempos_ms = [c.segundos * 1000 for c in llamadas]
    tok_s = [x for x in (c.tokens_por_segundo for c in llamadas) if x is not None]
    prefill = [
        c.tokens_prefill / c.segundos_prefill
        for c in llamadas
        if c.tokens_prefill and c.segundos_prefill
    ]
    salidas = [c.contenido for c in llamadas]
    return {
        "json_valido": porcentaje_json_valido(salidas, ESQUEMA_DE_GENERACION),
        "tok_s": mediana(tok_s) if tok_s else None,
        "prefill_tok_s": mediana(prefill) if prefill else None,
        "p50_ms": mediana(tiempos_ms),
        "p95_ms": percentil_95(tiempos_ms),
        "salidas": salidas,
    }


def _mediana_o_none(valores: Sequence[float | None]) -> float | None:
    presentes = [v for v in valores if v is not None]
    return mediana(presentes) if presentes else None


def _guardar_muestra(
    directorio: Path, id_candidato: str, corrida: Mapping[str, Any], n: int
) -> None:
    """Salidas para la revisión a mano de ``ai-eval-runner`` (≥ 20); fuera de ``reports/``: nunca se versionan."""
    directorio.mkdir(parents=True, exist_ok=True)
    con_salida = [s for s in corrida["salidas"] if s is not None][:n]
    (directorio / f"{id_candidato}.jsonl").write_text(
        "".join(json.dumps({"salida": s}, ensure_ascii=False) + "\n" for s in con_salida),
        encoding="utf-8",
    )


def cargar_prompts(config: ConfigFaseB, raiz: Path, cuantos: int) -> list[str]:
    return prompts_del_dataset(cargar_dataset_configurado(raiz / config.llm["dataset"]), cuantos)


def medir_estructuracion(
    cliente: ClienteRuntime, tag: str, dataset_ocr: Path, corridas: int
) -> dict[str, Any]:
    """p95 por documento de estructurar el texto de verdad de terreno de ``ocr-mini`` (aísla el LLM del OCR, D3).

    El prompt de extracción real es de FEAT-01b (S2): este es un prompt mínimo y fijo, solo para el tiempo.
    """
    documentos = json.loads((dataset_ocr / "ground_truth.json").read_text(encoding="utf-8"))[
        "documentos"
    ]
    p95_por_corrida: list[float] = []
    validos: list[float] = []
    for _ in range(corridas):
        tiempos: list[float] = []
        salidas: list[str | None] = []
        for doc in documentos.values():
            claves = list(doc["campos"])
            esquema = {
                "type": "object",
                "properties": {k: {"type": "string"} for k in claves},
                "required": claves,
            }
            llamada = cliente.chat(tag, _prompt_estructuracion(doc["texto"], claves), esquema)
            tiempos.append(llamada.segundos * 1000)
            salidas.append(llamada.contenido if _cumple(llamada.contenido, esquema) else None)
        p95_por_corrida.append(percentil_95(tiempos))
        validos.append(sum(s is not None for s in salidas) / len(salidas))
    return {
        "p95_ms": mediana(p95_por_corrida),
        "json_valido": mediana(validos),
        "documentos": len(documentos),
    }


def _cumple(salida: str | None, esquema: Mapping[str, Any]) -> bool:
    return salida is not None and porcentaje_json_valido([salida], esquema) == 1.0


def _prompt_estructuracion(texto: str, claves: Sequence[str]) -> str:
    return (
        "Extrae del informe los campos indicados y entrega únicamente el JSON conforme al esquema; "
        f"campos: {', '.join(claves)}.\n\nInforme:\n{texto}"
    )
