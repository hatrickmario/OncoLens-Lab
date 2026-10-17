"""Serialización y agregación de los reportes de ADR-39: solo agregados y configuración, nunca textos (RN-14)."""

from __future__ import annotations

import dataclasses
import json
import math
from pathlib import Path
from typing import Any

from app.evaluation.model_selection import Descarte, Medicion, Seleccion

CLAVES_PROHIBIDAS = frozenset(
    {"texto", "textos", "pregunta", "fragmento", "afirmacion", "cita", "chunk", "chunks"}
)


def a_json_seguro(valor: Any) -> Any:
    """Convierte dataclasses, tuplas y escalares de numpy a JSON estricto (NaN → null)."""
    if dataclasses.is_dataclass(valor) and not isinstance(valor, type):
        return a_json_seguro(dataclasses.asdict(valor))
    if isinstance(valor, dict):
        return {str(k): a_json_seguro(v) for k, v in valor.items()}
    if isinstance(valor, (list, tuple, set, frozenset)):
        return [a_json_seguro(v) for v in valor]
    if isinstance(valor, float):
        return None if math.isnan(valor) or math.isinf(valor) else valor
    if hasattr(valor, "item") and callable(valor.item):
        return a_json_seguro(valor.item())
    return valor


def claves_con_texto(valor: Any, ruta: str = "") -> list[str]:
    """Rutas de claves que podrían contener textos de preguntas o fragmentos; el reporte debe devolver []."""
    encontradas: list[str] = []
    if isinstance(valor, dict):
        for clave, v in valor.items():
            if str(clave).lower() in CLAVES_PROHIBIDAS:
                encontradas.append(f"{ruta}/{clave}")
            encontradas.extend(claves_con_texto(v, f"{ruta}/{clave}"))
    elif isinstance(valor, list):
        for i, v in enumerate(valor):
            encontradas.extend(claves_con_texto(v, f"{ruta}[{i}]"))
    return encontradas


def escribir_reporte(ruta: Path, reporte: dict[str, Any]) -> None:
    contenido = a_json_seguro(reporte)
    sospechosas = claves_con_texto(contenido)
    if sospechosas:
        raise ValueError(f"el reporte no debe contener textos; claves sospechosas: {sospechosas}")
    ruta.parent.mkdir(parents=True, exist_ok=True)
    ruta.write_text(
        json.dumps(contenido, indent=2, ensure_ascii=False, sort_keys=True, allow_nan=False) + "\n",
        encoding="utf-8",
    )


def seleccion_a_dict(seleccion: Seleccion) -> dict[str, Any]:
    return {
        "etapa": seleccion.etapa,
        "elegido": seleccion.elegido.candidato if seleccion.elegido else "sin_candidato",
        "desempatado_por_memoria": seleccion.desempatado_por_memoria,
        "descartados": [descarte_a_dict(d) for d in seleccion.descartados],
    }


def descarte_a_dict(d: Descarte) -> dict[str, str]:
    return {"candidato": d.candidato, "motivo": d.motivo, "cifra": d.cifra}


def medicion_a_dict(m: Medicion) -> dict[str, Any]:
    return dataclasses.asdict(m)
