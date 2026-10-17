"""Las consultas por documento de ``MilvusRepository`` no actúan con un resultado truncado por el tope de Milvus (borde: cliente falso)."""

from __future__ import annotations

from typing import Any

import pytest

from app.infrastructure.milvus.repository import (
    LIMITE_DE_CONSULTA,
    ConsultaTruncada,
    MilvusRepository,
)
from tests.support.milvus import ajustes_de_milvus


class ClienteQueDevuelve:
    """Cliente pymilvus mínimo: ``query`` entrega ``n`` filas y ``upsert`` registra lo reescrito."""

    def __init__(self, n: int) -> None:
        self.n, self.reescritas = n, 0

    def query(self, *_: Any, **__: Any) -> list[dict[str, Any]]:
        return [{"chunk_id": f"c{i}", "is_current": True} for i in range(self.n)]

    def upsert(self, _: str, filas: list[dict[str, Any]]) -> None:
        self.reescritas += len(filas)


def repositorio(cliente: ClienteQueDevuelve) -> MilvusRepository:
    return MilvusRepository(cliente, ajustes_de_milvus("http://x", "corpus_test_unitario"))  # type: ignore[arg-type]


def test_un_resultado_que_alcanza_el_tope_no_se_reescribe_a_medias_al_apagar() -> None:
    cliente = ClienteQueDevuelve(LIMITE_DE_CONSULTA)

    with pytest.raises(ConsultaTruncada):
        repositorio(cliente).marcar_no_vigentes("d")

    assert cliente.reescritas == 0


def test_un_resultado_por_debajo_del_tope_se_procesa_completo() -> None:
    cliente = ClienteQueDevuelve(LIMITE_DE_CONSULTA - 1)

    assert repositorio(cliente).marcar_no_vigentes("d") == LIMITE_DE_CONSULTA - 1
