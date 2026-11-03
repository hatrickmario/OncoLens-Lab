"""Contadores del corpus por tipo de cáncer y fuente en el resumen JSON de la ingesta (US-120 AC-1, FR-19).

Solo identificadores y cifras: nunca contenido, URLs ni credenciales (se imprime en la salida estándar de la CLI).
"""

from __future__ import annotations

from collections.abc import Sequence

from app.application.corpus_ingestion.reporte import ReporteDeIngesta
from app.domain.corpus_seed.documento import DocumentoDeSemilla


def contar_corpus_por_tipo_y_fuente(
    documentos: Sequence[DocumentoDeSemilla], reporte: ReporteDeIngesta
) -> dict[str, dict[str, int]]:
    """``{tipo: {fuente: n}}`` con los documentos del manifiesto que quedan vigentes tras la corrida."""
    raise NotImplementedError
