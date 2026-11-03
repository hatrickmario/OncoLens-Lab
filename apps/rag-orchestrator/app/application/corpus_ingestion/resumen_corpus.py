"""Contadores del corpus por tipo de cáncer y fuente en el resumen JSON de la ingesta (US-120 AC-1, FR-19).

Solo identificadores y cifras: nunca contenido, URLs ni credenciales (se imprime en la salida estándar de la CLI).
"""

from __future__ import annotations

from collections.abc import Sequence

from app.application.seed_corpus.ports import RegistroDeDocumento


def tipos_de_cancer_de(registro: RegistroDeDocumento) -> tuple[str, ...]:
    """``cancer_type_tags`` se guarda como etiquetas separadas por coma, sin espacios."""
    raise NotImplementedError


def contar_corpus_por_tipo_y_fuente(
    vigentes: Sequence[RegistroDeDocumento],
) -> dict[str, dict[str, int]]:
    """``{tipo: {fuente: n}}`` con los documentos vigentes y embebidos del catálogo (la misma fuente que el resumen de población)."""
    raise NotImplementedError
