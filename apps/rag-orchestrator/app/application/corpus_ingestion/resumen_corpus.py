"""Contadores del corpus por tipo de cáncer y fuente en el resumen JSON de la ingesta (US-120 AC-1, FR-19).

Solo identificadores y cifras: nunca contenido, URLs ni credenciales (se imprime en la salida estándar de la CLI).
"""

from __future__ import annotations

from collections import Counter, defaultdict
from collections.abc import Sequence

from app.application.seed_corpus.ports import RegistroDeDocumento


def tipos_de_cancer_de(registro: RegistroDeDocumento) -> tuple[str, ...]:
    """``cancer_type_tags`` se guarda como etiquetas separadas por coma, sin espacios."""
    return tuple(etiqueta for etiqueta in registro.cancer_type_tags.split(",") if etiqueta)


def contar_corpus_por_tipo_y_fuente(
    vigentes: Sequence[RegistroDeDocumento],
) -> dict[str, dict[str, int]]:
    """``{tipo: {fuente: n}}`` con los documentos vigentes y embebidos del catálogo (la misma fuente que el resumen de población)."""
    cuenta: defaultdict[str, Counter[str]] = defaultdict(Counter)
    for registro in vigentes:
        for tipo in tipos_de_cancer_de(registro):
            cuenta[tipo][registro.source_name] += 1
    return {tipo: dict(sorted(cuenta[tipo].items())) for tipo in sorted(cuenta)}
