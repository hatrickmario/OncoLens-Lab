"""Reporte de una ingesta en lote (US-117a): identificadores, estado, motivo y recuentos.

Nunca lleva contenido de los documentos, URLs ni mensajes de excepción: se imprime en la salida estándar de la CLI.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum


class Estado(StrEnum):
    EMBEBIDO = "embebido"
    OMITIDO = "omitido"
    RECHAZADO_LICENCIA = "rechazado_licencia"
    ERROR = "error"


@dataclass(frozen=True)
class ResultadoDeIngesta:
    document_key: str
    estado: Estado
    # Rechazo: motivo de admisibilidad. Error: ``<etapa>: <clase>``. Nunca el mensaje de la excepción.
    motivo: str | None = None
    chunks: int = 0
    # El documento tenía una fila a medias del mismo contenido (``normalizado``/``error``) y se retomó.
    reanudado: bool = False
    # Un rechazo por licencia o fuente retiró la versión vigente del grupo (RN-21, RN-05).
    retirada_de_vigente: bool = False


@dataclass(frozen=True)
class ReporteDeIngesta:
    resultados: tuple[ResultadoDeIngesta, ...]
    release_id: str | None

    def resultado_de(self, document_key: str) -> ResultadoDeIngesta:
        return next(r for r in self.resultados if r.document_key == document_key)
