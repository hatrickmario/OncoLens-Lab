"""Una sola regla para «los documentos de la muestra humana»: solo ``extraido_verificado``, por ``document_id`` (L1D-117 5.3)."""

from __future__ import annotations

from dataclasses import dataclass

from app.domain.corpus_metadata.resultado import (
    EXTRAIDO_VERIFICADO,
    FUENTE_ESTRUCTURADA,
    PENDIENTE,
    solo_extraidos_verificados,
)


@dataclass(frozen=True)
class Fila:
    document_id: str
    metadata_source: str


def test_solo_extraidos_verificados_deja_los_verificados_ordenados_por_id() -> None:
    filas = [
        Fila("d-3", EXTRAIDO_VERIFICADO),
        Fila("d-2", PENDIENTE),
        Fila("d-1", EXTRAIDO_VERIFICADO),
        Fila("d-0", FUENTE_ESTRUCTURADA),
    ]

    assert [f.document_id for f in solo_extraidos_verificados(filas)] == ["d-1", "d-3"]


def test_solo_extraidos_verificados_devuelve_vacio_sin_filas_o_sin_verificados() -> None:
    assert solo_extraidos_verificados([]) == []
    assert solo_extraidos_verificados([Fila("d-1", PENDIENTE)]) == []
