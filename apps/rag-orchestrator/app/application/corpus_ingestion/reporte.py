"""Reporte de una ingesta en lote (US-117a): identificadores, estado, motivo y recuentos.

Nunca lleva contenido de los documentos, URLs ni mensajes de excepción: se imprime en la salida estándar de la CLI.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from enum import StrEnum
from typing import Any


class Estado(StrEnum):
    """Resultado de un documento en ESTA corrida (clave ``estado`` del resumen JSON).

    No es el ``status`` del catálogo (``corpus_document.status``, ``STATUS_*`` de ``domain/corpus_seed/versionado``):
    ``omitido`` no existe en el catálogo (el documento sigue ``embebido``) y ``pendiente``/``normalizado`` no existen
    aquí. Los nombres del JSON se conservan porque la spec y los contadores los fijan.
    """

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

    @property
    def hubo_errores(self) -> bool:
        return any(r.estado is Estado.ERROR for r in self.resultados)

    def contadores(self) -> dict[str, int]:
        """Un contador por estado, todos presentes aunque valgan 0."""
        recuento = Counter(r.estado for r in self.resultados)
        return {estado.value: recuento.get(estado, 0) for estado in Estado}

    def como_diccionario(self) -> dict[str, Any]:
        return {
            "documentos": [
                {
                    "document_key": r.document_key,
                    "estado": r.estado.value,
                    "motivo": r.motivo,
                    "chunks": r.chunks,
                    "reanudado": r.reanudado,
                    "retirada_de_vigente": r.retirada_de_vigente,
                }
                for r in self.resultados
            ],
            "resumen": self.contadores(),
            "release_id": self.release_id,
        }

    def resultado_de(self, document_key: str) -> ResultadoDeIngesta:
        return next(r for r in self.resultados if r.document_key == document_key)
