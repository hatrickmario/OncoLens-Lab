"""Un metadato se conserva solo si el NLI lo confirma contra el texto de la fuente (RN-25, RN-01)."""

from __future__ import annotations

from collections.abc import Sequence

from app.domain.nli import ResultadoNli
from app.domain.support import soporta


def metadato_verificado(resultados: Sequence[ResultadoNli], umbral: float) -> bool:
    """``True`` si algún chunk del documento implica el metadato con ``p_entailment`` >= ``umbral`` (``soporta()``).

    Sin resultados (documento sin chunks) no hay soporte: nunca se conserva un metadato sin respaldo (RN-25).
    """
    return any(soporta(resultado, umbral) for resultado in resultados)
