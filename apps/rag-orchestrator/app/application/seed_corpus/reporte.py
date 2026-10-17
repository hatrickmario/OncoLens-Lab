"""Reporte de una carga de la semilla (US-059 D3): identificadores, resultado, motivo y recuentos.

Nunca lleva contenido de los documentos ni URLs: el reporte se imprime en la salida estándar del cargador.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from enum import StrEnum
from typing import Any


class Resultado(StrEnum):
    CARGADO = "cargado"
    NUEVA_VERSION = "nueva_version"
    OMITIDO = "omitido"
    RECHAZADO = "rechazado"
    ERROR = "error"


@dataclass(frozen=True)
class ResultadoDeDocumento:
    document_key: str
    resultado: Resultado
    motivo: str | None = None
    chunks: int = 0
    # Un rechazo por licencia o fuente retiró la versión vigente del grupo (decidido por el usuario, 2026-10-20).
    retirada_de_vigente: bool = False


@dataclass(frozen=True)
class ReporteDeCarga:
    resultados: tuple[ResultadoDeDocumento, ...]
    release_id: str | None

    @property
    def hubo_errores(self) -> bool:
        return any(r.resultado is Resultado.ERROR for r in self.resultados)

    def resultado_de(self, document_key: str) -> ResultadoDeDocumento:
        return next(r for r in self.resultados if r.document_key == document_key)

    def como_diccionario(self) -> dict[str, Any]:
        recuento = Counter(r.resultado.value for r in self.resultados)
        return {
            "documentos": [
                {
                    "document_key": r.document_key,
                    "resultado": r.resultado.value,
                    "motivo": r.motivo,
                    "chunks": r.chunks,
                    "retirada_de_vigente": r.retirada_de_vigente,
                }
                for r in self.resultados
            ],
            "resumen": {
                resultado.value: recuento.get(resultado.value, 0) for resultado in Resultado
            },
            "release_id": self.release_id,
        }
