"""Vector *sparse* léxico de BGE-M3 (ADR-39): regla pura sobre los pesos por token, sin modelo ni E/S."""

from __future__ import annotations

from collections.abc import Sequence


def agrupar_pesos_por_token(ids: Sequence[int], pesos: Sequence[float]) -> dict[int, float]:
    """``{id_de_token: peso}`` con el máximo por token, sin los tokens especiales (primero y último) ni los pesos <= 0.

    ``ids`` y ``pesos`` van alineados (un peso ``relu(sparse_linear(h))`` por token). Puede devolver un mapa vacío: quien
    lo usa decide si eso es un fallo (la ingesta lo trata como tal, Milvus no admite un vector vacío).
    """
    especiales = {ids[0], ids[-1]} if ids else set()
    resultado: dict[int, float] = {}
    for token, peso in zip(ids, pesos, strict=True):
        if token not in especiales and peso > 0:
            resultado[token] = max(resultado.get(token, 0.0), float(peso))
    return resultado
