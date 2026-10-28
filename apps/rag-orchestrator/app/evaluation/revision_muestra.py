"""Lectura de la muestra de metadatos revisada por un humano (US-118 → M-08.4, US-132 AC-4).

Formato que escribe la ingesta: ``documentos[].{document_id, campos[].{campo, valor, revision, nota}}``. Aquí solo se
cuentan las revisiones; ``valor`` y ``nota`` no salen de este módulo (RN-14, RN-25). Un valor de ``revision`` fuera de
``correcto | incorrecto | pendiente`` es una entrada inválida y el mensaje nombra el campo y el documento, no el valor.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

from app.evaluation.config_suite import ConfigInvalida

REVISIONES = ("correcto", "incorrecto", "pendiente")


@dataclass(frozen=True)
class ResultadoDeRevision:
    documentos: int
    correctos: int
    incorrectos: int
    pendientes: int
    causa: str | None
    """Por qué no hay exactitud: ``sin_archivo``, ``sin_campos`` o ``todo_pendiente``; ``None`` si se midió."""

    @property
    def revisados(self) -> int:
        return self.correctos + self.incorrectos

    @property
    def exactitud(self) -> float | None:
        return None if self.revisados == 0 else self.correctos / self.revisados


def leer_revision(ruta: Path | None) -> ResultadoDeRevision:
    if ruta is None or not ruta.is_file():
        return ResultadoDeRevision(0, 0, 0, 0, "sin_archivo")
    documentos = _documentos_de(ruta)
    cuentas = {revision: 0 for revision in REVISIONES}
    for documento in documentos:
        for campo in documento.get("campos", []):
            cuentas[_revision_de(documento, campo)] += 1
    resultado = ResultadoDeRevision(
        len(documentos), cuentas["correcto"], cuentas["incorrecto"], cuentas["pendiente"], None
    )
    if resultado.revisados > 0:
        return resultado
    causa = "todo_pendiente" if resultado.pendientes > 0 else "sin_campos"
    return ResultadoDeRevision(len(documentos), 0, 0, resultado.pendientes, causa)


def _documentos_de(ruta: Path) -> list[dict[str, Any]]:
    try:
        contenido = yaml.safe_load(ruta.read_text(encoding="utf-8"))
        documentos = contenido["documentos"]
    except (OSError, yaml.YAMLError, KeyError, TypeError):
        raise ConfigInvalida(
            "el archivo de revisión de la muestra no tiene la forma esperada"
        ) from None
    if not isinstance(documentos, list) or not all(isinstance(d, dict) for d in documentos):
        raise ConfigInvalida("el archivo de revisión de la muestra no tiene la forma esperada")
    return documentos


def _revision_de(documento: dict[str, Any], campo: Any) -> str:
    revision = campo.get("revision") if isinstance(campo, dict) else None
    if revision not in REVISIONES:
        nombre = campo.get("campo") if isinstance(campo, dict) else None
        raise ConfigInvalida(
            f"revision inválida en el campo {nombre} del documento {documento.get('document_id')}"
        )
    return str(revision)
