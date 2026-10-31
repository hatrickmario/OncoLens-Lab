"""p95 extremo a extremo de ``POST /platform/evidence-analyses`` y memoria del stack (ADR-39 fase B, AC-3).

Entra por la misma puerta que cualquier cliente (sesión por cookie de un usuario de prueba sintético), con el seed
sintético y el LLM real que el usuario haya levantado; el script no lee PostgreSQL clínico ni ``clinical-minio``. Los
tiempos por etapa se leen de los *logs* del pipeline por ``traceId`` (sin contenido ni PHI): si una etapa no registra su
tiempo, el reporte dice "no desglosado" en vez de estimarlo. Reloj, identificadores y comandos del sistema se inyectan.
"""

from __future__ import annotations

import re
import subprocess
from collections import defaultdict
from collections.abc import Callable, Mapping, Sequence
from pathlib import Path
from typing import Any

import httpx

from app.scripts.adr39.reglas import mediana_estadistica, percentil_95_interpolado

Reloj = Callable[[], float]
GeneradorDeId = Callable[[], str]
Ejecutor = Callable[[Sequence[str]], str]

_ETAPA = re.compile(
    r"etapa=(?P<etapa>\w+).*?\bms=(?P<ms>\d+(?:\.\d+)?).*?traceId=(?P<trace>[\w-]+)"
)
_UNIDADES_GB = {
    "B": 1e-9,
    "KiB": 1.024e-6,
    "MiB": 1.048576e-3,
    "GiB": 1.073741824,
    "kB": 1e-6,
    "MB": 1e-3,
    "GB": 1.0,
}


def ejecutar_comando(orden: Sequence[str]) -> str:
    return subprocess.run(orden, check=True, capture_output=True, text=True, timeout=30).stdout


def tiempos_por_etapa(lineas_de_log: Sequence[str], trace_ids: set[str]) -> dict[str, list[float]]:
    """``etapa=<x> ... ms=<n> ... traceId=<id>`` de las consultas medidas; ignora el resto de las líneas."""
    por_etapa: dict[str, list[float]] = defaultdict(list)
    for linea in lineas_de_log:
        m = _ETAPA.search(linea)
        if m and m["trace"] in trace_ids:
            por_etapa[m["etapa"]].append(float(m["ms"]))
    return dict(por_etapa)


def parsear_memoria_docker(salida: str) -> float:
    """Suma en GB de la columna ``MemUsage`` (``123.4MiB / 7.6GiB``) de ``docker stats --format '{{.MemUsage}}'``."""
    total = 0.0
    for linea in salida.splitlines():
        usada = linea.split("/")[0].strip()
        m = re.fullmatch(r"([\d.]+)\s*([A-Za-z]+)", usada)
        if m:
            total += float(m[1]) * _UNIDADES_GB[m[2]]
    return total


def medir_sistema(ejecutar: Ejecutor) -> dict[str, Any]:
    """Memoria de Docker, presión de memoria y swap de macOS; lo que no se pueda leer queda en ``None`` (nunca 0)."""
    return {
        "docker_gb": _leer(
            lambda: parsear_memoria_docker(
                ejecutar(["docker", "stats", "--no-stream", "--format", "{{.MemUsage}}"])
            )
        ),
        "swap_usado_mb": _leer(lambda: _swap_mb(ejecutar(["sysctl", "-n", "vm.swapusage"]))),
        "memoria_libre_porcentaje": _leer(lambda: _libre(ejecutar(["memory_pressure"]))),
        "ram_total_gb": _leer(lambda: int(ejecutar(["sysctl", "-n", "hw.memsize"])) / 1e9),
    }


def _leer(funcion: Callable[[], float]) -> float | None:
    try:
        return funcion()
    except (OSError, subprocess.SubprocessError, ValueError, KeyError):
        return None


def _swap_mb(salida: str) -> float:
    m = re.search(r"used = ([\d.]+)M", salida)
    if not m:
        raise ValueError("sin used")
    return float(m[1])


def _libre(salida: str) -> float:
    m = re.search(r"free percentage: (\d+)%", salida)
    if not m:
        raise ValueError("sin porcentaje")
    return float(m[1])


def iniciar_sesion(
    http: httpx.Client,
    base_url: str,
    email: str,
    password: str,
    origin: str,
    ruta: str = "/platform/auth/login",
) -> None:
    """``POST <ruta>`` (por defecto ``/platform/auth/login``; 204 + cookie opaca); la contraseña llega por entorno."""
    r = http.post(
        f"{base_url.rstrip('/')}{ruta}",
        json={"email": email, "password": password},
        headers={"Origin": origin},
    )
    if r.status_code != 204:
        raise RuntimeError(f"el inicio de sesión de prueba respondió {r.status_code}")
    # La cookie de sesión es `Secure`: httpx la descarta sobre http://127.0.0.1, así que se reenvía a mano.
    pares = [c.split(";", 1)[0] for c in r.headers.get_list("set-cookie")]
    if pares:
        http.headers["Cookie"] = "; ".join(pares)


def medir_corrida(
    http: httpx.Client,
    url: str,
    cuerpo: Mapping[str, Any],
    consultas: int,
    origin: str,
    reloj: Reloj,
    nuevo_id: GeneradorDeId,
) -> dict[str, Any]:
    tiempos_ms: list[float] = []
    ids: set[str] = set()
    errores = 0
    for _ in range(consultas):
        trace_id = nuevo_id()
        ids.add(trace_id)
        inicio = reloj()
        try:
            r = http.post(
                url, json=dict(cuerpo), headers={"Origin": origin, "X-Trace-Id": trace_id}
            )
            errores += r.status_code != 200
        except httpx.HTTPError:
            errores += 1
        tiempos_ms.append((reloj() - inicio) * 1000)
    return {
        "p50_ms": mediana_estadistica(tiempos_ms),
        "p95_ms": percentil_95_interpolado(tiempos_ms),
        "errores": errores,
        "trace_ids": ids,
    }


def medir_e2e(
    http: httpx.Client,
    base_url: str,
    ruta: str,
    cuerpo: Mapping[str, Any],
    corridas: int,
    consultas: int,
    origin: str,
    reloj: Reloj,
    nuevo_id: GeneradorDeId,
    ejecutar: Ejecutor,
    archivo_de_log: Path | None,
    memoria_llm_gb: Callable[[], float | None],
) -> dict[str, Any]:
    """3 corridas de ``consultas``: p95 total y por etapa, memoria del stack y swap antes y después."""
    antes = medir_sistema(ejecutar)
    resultados: list[dict[str, Any]] = []
    muestras: list[dict[str, Any]] = []
    for _ in range(corridas):
        resultados.append(
            medir_corrida(
                http, f"{base_url.rstrip('/')}{ruta}", cuerpo, consultas, origin, reloj, nuevo_id
            )
        )
        muestras.append(medir_sistema(ejecutar))  # al terminar cada corrida, con el stack caliente
    despues = muestras[-1]
    llm_gb = memoria_llm_gb()
    docker_gb = _maximo([m["docker_gb"] for m in muestras])
    return {
        "perfil_consultas": consultas,
        "corridas": corridas,
        "p95_total_ms": mediana_estadistica([r["p95_ms"] for r in resultados]),
        "p50_total_ms": mediana_estadistica([r["p50_ms"] for r in resultados]),
        "errores": sum(r["errores"] for r in resultados),
        "etapas": _etapas(archivo_de_log, set().union(*(r["trace_ids"] for r in resultados))),
        "memoria_llm_gb": llm_gb,
        "docker_pico_gb": docker_gb,
        "memoria_stack_gb": None if llm_gb is None or docker_gb is None else llm_gb + docker_gb,
        "sistema_antes": antes,
        "sistema_despues": despues,
        "swap_creciente": _swap_crece(antes["swap_usado_mb"], despues["swap_usado_mb"]),
    }


def _maximo(valores: Sequence[float | None]) -> float | None:
    presentes = [v for v in valores if v is not None]
    return max(presentes) if presentes else None


def _swap_crece(antes: float | None, despues: float | None) -> bool | None:
    return None if antes is None or despues is None else despues > antes


def _etapas(archivo: Path | None, trace_ids: set[str]) -> dict[str, Any] | str:
    if archivo is None:
        return "no desglosado"
    por_etapa = tiempos_por_etapa(archivo.read_text(encoding="utf-8").splitlines(), trace_ids)
    if not por_etapa:
        return "no desglosado"
    return {
        e: {"p95_ms": percentil_95_interpolado(v), "muestras": len(v)}
        for e, v in sorted(por_etapa.items())
    }
