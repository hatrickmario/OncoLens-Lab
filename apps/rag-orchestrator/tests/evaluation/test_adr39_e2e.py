"""p95 extremo a extremo y memoria del stack (US-224 AC-3) con la BFF fingida (``respx``) y comandos del sistema falsos."""

from __future__ import annotations

import itertools
import subprocess
from collections.abc import Sequence
from pathlib import Path

import httpx
import pytest
import respx

from app.scripts.adr39 import e2e

BASE = "https://bff.test"
URL = f"{BASE}/platform/evidence-analyses"
CUERPO = {"patientId": "8f2b3c4d-9a1e-4b5c-8d6e-7f8091a2b3c4", "query": "pregunta sintética"}


def reloj_de_dos_segundos() -> e2e.Reloj:
    contador = itertools.count()
    return lambda: next(contador) * 2.0


def ids_congelados() -> e2e.GeneradorDeId:
    contador = itertools.count(1)
    return lambda: f"trace-{next(contador)}"


def sistema_falso(swap_mb: Sequence[int], docker: Sequence[str] = ("2GiB / 8GiB",)):  # type: ignore[no-untyped-def]
    swaps = iter(swap_mb)
    dockers = itertools.cycle(docker)

    def ejecutar(orden: Sequence[str]) -> str:
        if orden[0] == "docker":
            return next(dockers)
        if orden[:2] == ["sysctl", "-n"] and orden[2] == "vm.swapusage":
            return f"total = 2048.00M  used = {next(swaps)}.00M  free = 1.00M  (encrypted)"
        if orden[0] == "memory_pressure":
            return "System-wide memory free percentage: 41%"
        return "34359738368"  # hw.memsize: 32 GiB

    return ejecutar


def test_parsear_memoria_docker_suma_la_columna_en_gb() -> None:
    salida = "512MiB / 7.6GiB\n1.5GiB / 7.6GiB\n"

    assert e2e.parsear_memoria_docker(salida) == pytest.approx(
        0.5 * 1.048576e-3 * 1024 + 1.5 * 1.073741824
    )


def test_tiempos_por_etapa_solo_cuenta_las_consultas_medidas() -> None:
    log = [
        "event=pipeline etapa=reranker ms=120 traceId=trace-1",
        "event=pipeline etapa=generacion ms=8000.5 traceId=trace-1",
        "event=pipeline etapa=reranker ms=999 traceId=otra-consulta",
        "linea sin etapa traceId=trace-1",
    ]

    assert e2e.tiempos_por_etapa(log, {"trace-1"}) == {"reranker": [120.0], "generacion": [8000.5]}


def test_medir_sistema_deja_none_cuando_un_comando_no_esta_disponible() -> None:
    def sin_comandos(orden: Sequence[str]) -> str:
        raise subprocess.CalledProcessError(1, orden)

    medido = e2e.medir_sistema(sin_comandos)

    assert medido == {
        "docker_gb": None,
        "swap_usado_mb": None,
        "memoria_libre_porcentaje": None,
        "ram_total_gb": None,
    }


def test_iniciar_sesion_falla_sin_exponer_la_credencial_cuando_el_login_no_responde_204() -> None:
    with respx.mock() as bff, httpx.Client() as http:
        bff.post(f"{BASE}/platform/auth/login").mock(return_value=httpx.Response(401))

        with pytest.raises(RuntimeError) as error:
            e2e.iniciar_sesion(http, BASE, "doc1@test.local", "clave-secreta", "https://bff.test")

    assert "clave-secreta" not in str(error.value)


def test_medir_corrida_envia_origin_y_trace_id_y_cuenta_los_errores() -> None:
    respuestas = iter(
        [httpx.Response(200, json={}), httpx.Response(503), httpx.Response(200, json={})]
    )
    with respx.mock() as bff, httpx.Client() as http:
        ruta = bff.post(URL).mock(side_effect=lambda _: next(respuestas))

        r = e2e.medir_corrida(
            http, URL, CUERPO, 3, "https://bff.test", reloj_de_dos_segundos(), ids_congelados()
        )

    assert r["errores"] == 1
    assert r["p95_ms"] == 2000.0 and r["p50_ms"] == 2000.0
    assert r["trace_ids"] == {"trace-1", "trace-2", "trace-3"}
    primera = ruta.calls[0].request
    assert (
        primera.headers["origin"] == "https://bff.test"
        and primera.headers["x-trace-id"] == "trace-1"
    )


@pytest.mark.ac("US-224", 3)
def test_medir_e2e_informa_p95_total_memoria_del_stack_y_swap_creciente(tmp_path: Path) -> None:
    log = tmp_path / "pipeline.log"
    log.write_text("etapa=generacion ms=7000 traceId=trace-1\n", encoding="utf-8")
    with respx.mock() as bff, httpx.Client() as http:
        bff.post(URL).mock(return_value=httpx.Response(200, json={}))

        medido = e2e.medir_e2e(
            http, BASE, "/platform/evidence-analyses", CUERPO, corridas=3, consultas=30,
            origin="https://bff.test", reloj=reloj_de_dos_segundos(), nuevo_id=ids_congelados(),
            ejecutar=sistema_falso([100, 100, 150, 180], docker=("2GiB / 8GiB", "3GiB / 8GiB", "2.5GiB / 8GiB")),
            archivo_de_log=log, memoria_llm_gb=lambda: 15.2,
        )  # fmt: skip

    assert medido["p95_total_ms"] == 2000.0
    assert medido["errores"] == 0
    assert medido["docker_pico_gb"] == pytest.approx(3 * 1.073741824)
    assert medido["memoria_stack_gb"] == pytest.approx(15.2 + 3 * 1.073741824)
    assert medido["swap_creciente"] is True
    assert medido["etapas"] == {"generacion": {"p95_ms": 7000.0, "muestras": 1}}


def test_medir_e2e_declara_etapas_no_desglosadas_y_memoria_none_cuando_no_hay_datos() -> None:
    def sin_comandos(orden: Sequence[str]) -> str:
        raise FileNotFoundError(orden[0])

    with respx.mock() as bff, httpx.Client() as http:
        bff.post(URL).mock(return_value=httpx.Response(200, json={}))

        medido = e2e.medir_e2e(
            http, BASE, "/platform/evidence-analyses", CUERPO, 1, 2, "https://bff.test",
            reloj_de_dos_segundos(), ids_congelados(), sin_comandos, None, lambda: None,
        )  # fmt: skip

    assert medido["etapas"] == "no desglosado"
    assert medido["memoria_stack_gb"] is None and medido["swap_creciente"] is None  # null, nunca 0
