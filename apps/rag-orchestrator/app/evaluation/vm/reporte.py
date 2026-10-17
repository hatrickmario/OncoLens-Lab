"""Render del reporte ``eval/vm/baseline-S1.md``: puro, la fecha y la huella de DEC-02 llegan inyectadas.

El reporte solo lleva seudónimos ``O<n>``, ids de caso y agregados: ni nombres ni justificaciones (RN-14).
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from app.evaluation.vm.dominio import TIPOS_DE_CANCER, Fila, Medianas

DECLARACION_DE_METAS = "metas no modificadas; criterio de éxito enmendado en DEC-02 [S1 resp. 27]"
NOTA_COHORTE_REAL = (
    "La cohorte real se mide después de G-Piloto (US-152) y se reporta por separado de esta."
)


def _formatear_minutos(valor: float | None) -> str:
    return "sin datos" if valor is None else f"{valor:.1f}".replace(".", ",")


def _rol(participante: str) -> str:
    """``O1`` → «Oncólogo asesor A»: la correspondencia con el nombre vive fuera del repo (DEC-02)."""
    numero = int(participante[1:])
    return f"Oncólogo asesor {chr(64 + numero)}" if 1 <= numero <= 26 else "Oncólogo asesor"


def _tabla_de_medianas(medianas: dict[str, float | None]) -> list[str]:
    filas = [f"| {tipo} | {_formatear_minutos(medianas[tipo])} |" for tipo in TIPOS_DE_CANCER]
    filas.append(f"| total | {_formatear_minutos(medianas['total'])} |")
    return ["| Tipo | Mediana (min) |", "|---|---|", *filas]


def _tareas_no_completadas(filas: Sequence[Fila]) -> list[str]:
    pendientes = [
        (tarea, f["caso"], f["participante"])
        for f in filas
        for tarea, completada in (
            ("VM-1", f["reconstruido"] == "si"),
            ("VM-2", f["autoidentificada"] == "si"),
        )
        if not completada
    ]
    return [f"- {t} · {caso} · {p}" for t, caso, p in sorted(pendientes)] or ["- Ninguna"]


def _tabla_de_checklists(manifiesto: dict[str, Any]) -> list[str]:
    filas = [
        f"| {c['id']} | {c['checklist_reconstruccion']['version']} "
        f"| {c['checklist_reconstruccion']['fecha_validacion_clinica']} |"
        for c in manifiesto["casos"]
    ]
    return ["| Caso | Versión | Fecha de validación clínica |", "|---|---|---|", *filas]


def _leyenda_de_tiempo_maximo(max_minutos: int) -> str:
    return (
        f"Tiempo máximo por tarea: {max_minutos} min (VM_SESSION_MAX_MINUTES); "
        "la tarea no completada cuenta con el tiempo máximo."
    )


def renderizar_reporte(
    filas: Sequence[Fila],
    manifiesto: dict[str, Any],
    medianas: Medianas,
    fecha: str,
    huella_dec02: str,
    max_minutos: int,
) -> str:
    participantes = sorted({f["participante"] for f in filas}, key=lambda p: int(p[1:]))
    casos = {f["caso"] for f in filas}
    secciones = [
        [
            "# Baseline manual de VM-1 y VM-2 — S1",
            "",
            f"Fecha: {fecha}",
            "",
            "## Cohorte sintética",
            "",
        ],
        [NOTA_COHORTE_REAL, ""],
        ["Leyenda de roles: " + ", ".join(f"{p} = {_rol(p)}" for p in participantes), ""],
        [
            f"Sesiones: {len(filas)} · casos: {len(casos)} · participantes: {len(participantes)}",
            _leyenda_de_tiempo_maximo(max_minutos),
            "",
        ],
        [f"Declaración: {DECLARACION_DE_METAS}.", f"SHA-256 de DEC-02: `{huella_dec02}`", ""],
        ["## Checklists de reconstrucción", "", *_tabla_de_checklists(manifiesto), ""],
        ["## VM-1 · tiempo para reconstruir el caso", "", *_tabla_de_medianas(medianas["vm1"]), ""],
        [
            "## VM-2 · tiempo hasta evidencia aplicable (autoidentificada)",
            "",
            *_tabla_de_medianas(medianas["vm2_autoidentificada"]),
            "",
        ],
        [
            "## VM-2 · tiempo hasta evidencia aplicable (validada, base de la meta de DEC-02)",
            "",
            *_tabla_de_medianas(medianas["vm2_validada"]),
            "",
        ],
        ["## Tareas no completadas", "", *_tareas_no_completadas(filas), ""],
    ]
    return "\n".join(linea for seccion in secciones for linea in seccion)
