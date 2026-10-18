"""Tabla de decisión de la fase B de ADR-39: junta los reportes medidos y aplica las reglas de D3 (``reglas.py``).

Entradas (todas en el directorio de reportes; las produce el usuario al medir y ``ai-eval-runner`` al revisar):
``llm.json`` (``llm``), ``e2e-<id>.json`` (``e2e`` con ese candidato en el stack), ``ocr-<motor>.json`` (``ocr``) y
``revision-<id>.json`` (``{"fidelidad": f, "salidas_prescriptivas": n, "salidas_otro_idioma": n}``, revisión a mano).
Una cifra ausente es ``None`` (pendiente), nunca 0: la decisión no se completa con supuestos.
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from pathlib import Path
from typing import Any

from app.scripts.adr39.config import ConfigFaseB
from app.scripts.adr39.reglas import Candidato, Decision, elegir_candidato


def _leer(ruta: Path) -> dict[str, Any] | None:
    return json.loads(ruta.read_text(encoding="utf-8")) if ruta.is_file() else None


def candidatos_medidos(
    config: ConfigFaseB, reportes: Path, motor_ocr: str | None
) -> list[Candidato]:
    llm = _leer(reportes / "llm.json") or {"candidatos": []}
    por_id: Mapping[str, dict[str, Any]] = {c["id"]: c for c in llm["candidatos"]}
    ocr = _leer(reportes / f"ocr-{motor_ocr}.json") if motor_ocr else None
    p95_ocr = _numero(ocr, "p95_ms") if ocr else None
    return [
        _candidato(c.id, c.licencia, c.licencia_verificada, por_id.get(c.id), reportes, p95_ocr)
        for c in config.candidatos
    ]


def _numero(datos: Mapping[str, Any] | None, clave: str) -> float | None:
    valor = None if datos is None else datos.get(clave)
    return None if valor is None else float(valor)


def _candidato(
    id_c: str,
    licencia: str,
    verificada: bool,
    llm: Mapping[str, Any] | None,
    reportes: Path,
    p95_ocr: float | None,
) -> Candidato:
    e2e = _leer(reportes / f"e2e-{id_c}.json")
    revision = _leer(reportes / f"revision-{id_c}.json")
    p95_estructuracion = _numero((llm or {}).get("estructuracion"), "p95_ms")
    return Candidato(
        id=id_c,
        licencia=licencia,
        licencia_verificada=verificada,
        memoria_llm_gb=_numero(llm, "memoria_llm_gb"),
        memoria_stack_gb=_numero(e2e, "memoria_stack_gb"),
        swap_creciente=None if e2e is None else e2e.get("swap_creciente"),
        json_valido=_numero(llm, "json_valido"),
        e2e_p95_ms=_numero(e2e, "p95_total_ms"),
        extraccion_p95_ms=(
            None if p95_ocr is None or p95_estructuracion is None else p95_ocr + p95_estructuracion
        ),
        fidelidad=_numero(revision, "fidelidad"),
        salidas_prescriptivas=None if revision is None else revision.get("salidas_prescriptivas"),
        salidas_otro_idioma=None if revision is None else revision.get("salidas_otro_idioma"),
    )


def decidir(
    config: ConfigFaseB,
    reportes: Path,
    motor_ocr: str | None,
    licencias_aceptadas: frozenset[str],
) -> Decision:
    return elegir_candidato(
        candidatos_medidos(config, reportes, motor_ocr),
        config.restricciones,
        config.muestra_fidelidad,
        licencias_aceptadas,
    )


def tabla_markdown(decision: Decision) -> str:
    """Tabla de decisión para el ADR: una fila por candidato, con la cifra del descarte o lo que falta medir."""
    filas = ["| Candidato | Estado | Motivo o cifras pendientes |", "|---|---|---|"]
    for v in decision.veredictos:
        detalle = (
            f"{v.descarte.eliminatoria}: {v.descarte.cifra}"
            if v.descarte
            else ", ".join(v.pendientes) or "cumple las eliminatorias"
        )
        filas.append(f"| {v.candidato} | {v.estado} | {detalle} |")
    elegido = decision.elegido.id if decision.elegido else "sin elegir"
    pie = f"\nElegido: **{elegido}**" + (
        " (desempate por menor memoria)" if decision.desempatado_por_memoria else ""
    )
    if decision.escalar_al_usuario:
        pie += "\nNingún candidato supera las eliminatorias: escalar al usuario (US-012 AC-5), sin elegir uno que incumpla."
    if decision.riesgo_de_margen:
        respaldo = decision.respaldo.id if decision.respaldo else "ninguno con margen"
        pie += f"\nMargen < 1 GB en {', '.join(decision.riesgo_de_margen)}; respaldo: {respaldo}."
    return "\n".join(filas) + pie + "\n"
