"""Serialización y agregación de los reportes de ADR-39: solo agregados y configuración, nunca textos (RN-14)."""

from __future__ import annotations

import dataclasses
import json
import math
import re
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


class ReporteFueraDeEsquema(ValueError):
    """El reporte tiene una clave o un valor fuera de la lista blanca; el mensaje da la ruta, nunca el valor."""


@dataclasses.dataclass(frozen=True)
class Numero:
    """Número finito o ``None`` (``null`` ≠ ``0.0``); un booleano no es un número."""


@dataclasses.dataclass(frozen=True)
class Booleano:
    pass


@dataclasses.dataclass(frozen=True)
class Enumerado:
    """Cadena de un conjunto cerrado (rótulos, clases, suites)."""

    valores: frozenset[str]


@dataclasses.dataclass(frozen=True)
class Identificador:
    """Identificador de modelo, versión o huella: un token sin espacios, nunca texto libre."""


@dataclasses.dataclass(frozen=True)
class Objeto:
    campos: dict[str, Any]
    opcionales: frozenset[str] = frozenset()


@dataclasses.dataclass(frozen=True)
class Huella:
    """SHA-256 en hexadecimal minúscula (64 caracteres)."""


@dataclasses.dataclass(frozen=True)
class Lista:
    """Lista de elementos que cumplen todos el mismo esquema."""

    elemento: Any


_HUELLA = re.compile(r"[0-9a-f]{64}")
_IDENTIFICADOR = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:@#+/-]{0,127}")


def validar_esquema_cerrado(valor: Any, esquema: Any, ruta: str = "$") -> None:
    """Lista blanca de claves y de tipos de hoja (ADR-41, «Reporte»): lo demás hace fallar la escritura."""
    if isinstance(esquema, Objeto):
        _validar_objeto(valor, esquema, ruta)
    elif isinstance(esquema, Huella):
        _exigir(
            isinstance(valor, str) and _HUELLA.fullmatch(valor) is not None,
            ruta,
            "no es una huella",
        )
    elif isinstance(esquema, Lista):
        _exigir(isinstance(valor, list), ruta, "no es una lista")
        for i, elemento in enumerate(valor):
            validar_esquema_cerrado(elemento, esquema.elemento, f"{ruta}[{i}]")
    elif isinstance(esquema, Numero):
        _exigir(
            valor is None or (_es_numero(valor) and math.isfinite(valor)), ruta, "no es un número"
        )
    elif isinstance(esquema, Booleano):
        _exigir(isinstance(valor, bool), ruta, "no es un booleano")
    elif isinstance(esquema, Enumerado):
        _exigir(isinstance(valor, str) and valor in esquema.valores, ruta, "fuera del conjunto")
    elif isinstance(esquema, Identificador):
        _exigir(
            isinstance(valor, str) and _IDENTIFICADOR.fullmatch(valor) is not None,
            ruta,
            "no es un identificador",
        )
    else:
        raise TypeError("esquema desconocido")


def _es_numero(valor: Any) -> bool:
    return isinstance(valor, (int, float)) and not isinstance(valor, bool)


def _exigir(condicion: bool, ruta: str, motivo: str) -> None:
    if not condicion:
        raise ReporteFueraDeEsquema(f"{ruta}: {motivo}")


def _validar_objeto(valor: Any, esquema: Objeto, ruta: str) -> None:
    _exigir(isinstance(valor, dict), ruta, "no es un objeto")
    sobrantes = set(valor) - set(esquema.campos)
    _exigir(not sobrantes, ruta, f"{len(sobrantes)} clave(s) no permitida(s)")
    faltantes = set(esquema.campos) - set(valor) - esquema.opcionales
    _exigir(not faltantes, ruta, f"faltan {len(faltantes)} clave(s)")
    for clave, hijo in valor.items():
        validar_esquema_cerrado(hijo, esquema.campos[clave], f"{ruta}.{clave}")


def escribir_reporte_cerrado(ruta: Path, reporte: dict[str, Any], esquema: Objeto) -> None:
    """Escribe el reporte de la suite solo si cumple el esquema cerrado; no deja un archivo a medias."""
    contenido = a_json_seguro(reporte)
    validar_esquema_cerrado(contenido, esquema)
    escribir_reporte(ruta, contenido)


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
