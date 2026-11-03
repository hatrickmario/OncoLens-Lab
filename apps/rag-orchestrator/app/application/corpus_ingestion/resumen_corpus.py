"""Contadores del corpus por tipo de cáncer y fuente en el resumen JSON de la ingesta (US-120 AC-1, FR-19).

Solo identificadores y cifras: nunca contenido, URLs ni credenciales (se imprime en la salida estándar de la CLI).
"""

from __future__ import annotations

from collections import Counter, defaultdict
from collections.abc import Sequence

from app.application.corpus_ingestion.reporte import Estado, ReporteDeIngesta
from app.domain.corpus_seed.documento import DocumentoDeSemilla

# ``omitido`` = el documento ya estaba ``embebido`` y vigente con ese contenido: sigue contando en el corpus.
ESTADOS_VIGENTES = frozenset({Estado.EMBEBIDO, Estado.OMITIDO})


def contar_corpus_por_tipo_y_fuente(
    documentos: Sequence[DocumentoDeSemilla], reporte: ReporteDeIngesta
) -> dict[str, dict[str, int]]:
    """``{tipo: {fuente: n}}`` con los documentos del manifiesto que quedan vigentes tras la corrida."""
    vigentes = {r.document_key for r in reporte.resultados if r.estado in ESTADOS_VIGENTES}
    cuenta: defaultdict[str, Counter[str]] = defaultdict(Counter)
    for documento in documentos:
        if documento.document_key in vigentes:
            for tipo in documento.cancer_type_tags:
                cuenta[tipo][documento.source_name] += 1
    return {tipo: dict(sorted(cuenta[tipo].items())) for tipo in sorted(cuenta)}
