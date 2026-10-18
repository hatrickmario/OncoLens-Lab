"""CLI de la fase B de ADR-39 (US-224 AC-5): ``python -m app.scripts.adr39 <runtime|llm|e2e|ocr|decidir>``.

Lee modelos, URLs y parámetros de ``eval/configs/adr39-fase-b.yaml`` (nada de constantes) y escribe un JSON de
agregados por subcomando en ``--out`` (por defecto ``reports/adr39/``). Las mediciones con modelos reales las lanza el
usuario en la máquina de referencia; este módulo no inventa cifras.
Códigos de salida: 0 ok · 2 configuración inválida · 4 ningún candidato cumple (escalar, US-012 AC-5) ·
6 el OCR dejó residuos · 7 motor OCR no disponible.
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import sys
import time
import uuid
from collections.abc import Callable, Sequence
from datetime import UTC, datetime
from pathlib import Path

import httpx

from app.evaluation.reporte import escribir_reporte
from app.evaluation.rutas import raiz_repo
from app.scripts.adr39 import decidir as decision
from app.scripts.adr39 import e2e, ocr, runtime_llm
from app.scripts.adr39.config import (
    RUTA_CONFIG_POR_DEFECTO,
    ConfigFaseB,
    ConfigFaseBInvalida,
    cargar_config,
)

SALIDA_OK, SALIDA_CONFIG, SALIDA_SIN_CANDIDATO, SALIDA_RESIDUOS, SALIDA_MOTOR = 0, 2, 4, 6, 7
PLAZO_HTTP_S = 300.0
Ahora = Callable[[], datetime]


def _parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="python -m app.scripts.adr39", description=__doc__)
    p.add_argument("subcomando", choices=["runtime", "llm", "e2e", "ocr", "decidir"])
    p.add_argument("--config", type=Path, default=RUTA_CONFIG_POR_DEFECTO)
    p.add_argument("--runs", type=int, help="corridas (por defecto, las de la configuración)")
    p.add_argument("--out", type=Path, default=raiz_repo() / "reports" / "adr39")
    p.add_argument("--runtime", choices=["ollama", "vllm_metal"], default="ollama")
    p.add_argument(
        "--candidato", help="ids separados por comas (llm) o el id del LLM en el stack (e2e)"
    )
    p.add_argument(
        "--llamadas", type=int, help="llamadas por candidato (por defecto, las de la configuración)"
    )
    p.add_argument(
        "--muestras", type=Path, default=Path(os.environ.get("TMPDIR", "/tmp")) / "adr39-muestras"
    )
    p.add_argument(
        "--base-url", help="URL de BFF (e2e); por defecto, la del runtime de la configuración"
    )
    p.add_argument(
        "--origin",
        default="https://localhost",
        help="cabecera Origin de las llamadas a la BFF (e2e)",
    )
    p.add_argument("--cuerpo", type=Path, help="JSON del request de evidence-analyses (e2e)")
    p.add_argument("--pipeline", choices=["s1", "s4"], default="s1")
    p.add_argument(
        "--logs-etapas", type=Path, help="log del pipeline con etapa=… ms=… traceId=… (e2e)"
    )
    p.add_argument("--motor", help="id del motor OCR (un motor por proceso)")
    p.add_argument("--plazo-s", type=float, default=PLAZO_HTTP_S)
    p.add_argument("--tmpdir", type=Path, default=Path(os.environ.get("TMPDIR", "/tmp")))
    p.add_argument(
        "--vigilar",
        type=Path,
        action="append",
        default=[],
        help="rutas donde no deben aparecer archivos (ocr)",
    )
    p.add_argument("--motor-ocr", help="motor OCR elegido, para el p95 de extracción (decidir)")
    p.add_argument(
        "--licencias-aceptadas",
        default="",
        help="licencias condicionadas aceptadas por escrito, separadas por comas",
    )
    return p


def _entorno(ahora: Ahora) -> dict[str, str | None]:
    return {
        "fecha": ahora().isoformat(timespec="seconds"),
        "plataforma": platform.platform(),
        "maquina": platform.machine(),
        "python": platform.python_version(),
        "ollama_flash_attention": os.environ.get("OLLAMA_FLASH_ATTENTION"),
        "ollama_kv_cache_type": os.environ.get("OLLAMA_KV_CACHE_TYPE"),
    }


def _params_llm(config: ConfigFaseB) -> dict[str, object]:
    llm = config.llm
    return {
        "num_ctx": llm["num_ctx"],
        "temperature": llm["temperature"],
        "max_output_tokens": llm["max_output_tokens"],
        "thinking": llm["thinking"],
    }


def _cliente_runtime(
    config: ConfigFaseB, nombre: str, http: httpx.Client
) -> runtime_llm.ClienteRuntime:
    rt = config.runtimes[nombre]
    return runtime_llm.ClienteRuntime(
        http, rt["base_url"], rt["api"], time.monotonic, _params_llm(config)
    )


def _cmd_runtime(a: argparse.Namespace, config: ConfigFaseB, ahora: Ahora) -> int:
    tag = config.candidato(a.candidato or config.candidatos[0].id).tag
    rt = config.runtimes[a.runtime]
    with httpx.Client(timeout=a.plazo_s) as http:
        cliente = _cliente_runtime(config, a.runtime, http)
        medido = runtime_llm.medir_runtime(cliente, http, rt["base_url"], rt["api"], tag)
    escribir_reporte(
        a.out / f"runtime-{a.runtime}.json", {"entorno": _entorno(ahora), "modelo": tag, **medido}
    )
    return SALIDA_OK


def _cmd_llm(a: argparse.Namespace, config: ConfigFaseB, ahora: Ahora) -> int:
    ids = a.candidato.split(",") if a.candidato else [c.id for c in config.candidatos]
    llamadas = a.llamadas or config.llamadas_por_candidato
    prompts = runtime_llm.cargar_prompts(config, raiz_repo(), llamadas)
    dataset_ocr = raiz_repo() / config.ocr["dataset"]
    resultados = []
    with httpx.Client(timeout=a.plazo_s) as http:
        cliente = _cliente_runtime(config, a.runtime, http)
        for id_c in ids:
            candidato = config.candidato(id_c)
            medido = runtime_llm.medir_candidato(cliente, candidato, prompts, config, a.muestras)
            if medido.get("admitido") and dataset_ocr.is_dir():
                medido["estructuracion"] = runtime_llm.medir_estructuracion(
                    cliente, candidato.tag, dataset_ocr, a.runs or config.corridas
                )
            resultados.append(medido)
    escribir_reporte(
        a.out / "llm.json",
        {
            "entorno": _entorno(ahora),
            "runtime": a.runtime,
            "parametros": _params_llm(config),
            "contexto": config.llm["contexto"],
            "descartados_sin_medir": config.llm["descartados_sin_medir"],
            "candidatos": resultados,
        },
    )
    return SALIDA_OK


def _cmd_e2e(a: argparse.Namespace, config: ConfigFaseB, ahora: Ahora) -> int:
    if not a.base_url or not a.cuerpo:
        sys.stderr.write("e2e exige --base-url y --cuerpo\n")
        return SALIDA_CONFIG
    password = os.environ.get("ADR39_PASSWORD", "")
    if not password:
        sys.stderr.write(
            "e2e exige ADR39_PASSWORD en el entorno (credencial del usuario de prueba sintético)\n"
        )
        return SALIDA_CONFIG
    etiqueta = a.candidato or "stack"
    tag = config.candidato(a.candidato).tag if a.candidato else None
    with httpx.Client(timeout=a.plazo_s) as http, httpx.Client(timeout=PLAZO_HTTP_S) as http_llm:
        e2e.iniciar_sesion(http, a.base_url, config.e2e["usuario_de_prueba"], password, a.origin)
        cliente = _cliente_runtime(config, a.runtime, http_llm)
        medido = e2e.medir_e2e(
            http,
            a.base_url,
            config.e2e["ruta"],
            json.loads(a.cuerpo.read_text(encoding="utf-8")),
            a.runs or config.corridas,
            config.consultas_por_corrida_e2e,
            a.origin,
            time.monotonic,
            lambda: str(uuid.uuid4()),
            e2e.ejecutar_comando,
            a.logs_etapas,
            (lambda: cliente.memoria_residente_gb(tag)) if tag else (lambda: None),
        )
    escribir_reporte(
        a.out / f"e2e-{etiqueta}.json",
        {"entorno": _entorno(ahora), "perfil": a.pipeline, "candidato": etiqueta, **medido},
    )
    return SALIDA_OK


def _cmd_ocr(a: argparse.Namespace, config: ConfigFaseB, ahora: Ahora) -> int:
    if not a.motor:
        sys.stderr.write("ocr exige --motor (un motor por proceso, para medir su memoria pico)\n")
        return SALIDA_CONFIG
    motor = ocr.motor_por_id(a.motor, os.environ.get("OCR_LANGUAGES", "spa"))
    vigiladas = a.vigilar or [Path.cwd()]
    resultado = ocr.medir_motor(
        motor, raiz_repo() / config.ocr["dataset"], a.runs or config.corridas,
        a.plazo_s, a.tmpdir, vigiladas, time.monotonic,
    )  # fmt: skip
    escribir_reporte(
        a.out / f"ocr-{a.motor}.json",
        {"entorno": _entorno(ahora), "tmpdir": str(a.tmpdir), **ocr.resultado_a_dict(resultado)},
    )
    if resultado.residuos:
        sys.stderr.write(f"el motor {a.motor} dejó residuos: {', '.join(resultado.residuos)}\n")
        return SALIDA_RESIDUOS
    return SALIDA_OK if resultado.disponible else SALIDA_MOTOR


def _cmd_decidir(a: argparse.Namespace, config: ConfigFaseB, ahora: Ahora) -> int:
    aceptadas = frozenset(x for x in a.licencias_aceptadas.split(",") if x)
    resultado = decision.decidir(config, a.out, a.motor_ocr, aceptadas)
    tabla = decision.tabla_markdown(resultado)
    sys.stdout.write(tabla)
    escribir_reporte(
        a.out / "decision.json",
        {
            "entorno": _entorno(ahora),
            "elegido": resultado.elegido.id if resultado.elegido else None,
            "desempatado_por_memoria": resultado.desempatado_por_memoria,
            "veredictos": resultado.veredictos,
            "riesgo_de_margen": resultado.riesgo_de_margen,
            "respaldo": resultado.respaldo.id if resultado.respaldo else None,
            "escalar_al_usuario": resultado.escalar_al_usuario,
        },
    )
    return SALIDA_SIN_CANDIDATO if resultado.escalar_al_usuario else SALIDA_OK


COMANDOS = {
    "runtime": _cmd_runtime,
    "llm": _cmd_llm,
    "e2e": _cmd_e2e,
    "ocr": _cmd_ocr,
    "decidir": _cmd_decidir,
}


def main(
    argv: Sequence[str] | None = None, ahora: Ahora = lambda: datetime.now(UTC)
) -> int:
    a = _parser().parse_args(argv)
    try:
        config = cargar_config(a.config)
    except (ConfigFaseBInvalida, OSError) as error:
        sys.stderr.write(f"configuración de la fase B inválida: {error}\n")
        return SALIDA_CONFIG
    return COMANDOS[a.subcomando](a, config, ahora)
