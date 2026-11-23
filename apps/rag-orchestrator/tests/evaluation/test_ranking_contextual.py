"""El observador del ranking de la familia `contextual` (US-273 AC-2) ordena como el servicio y cumple el contrato del puerto."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

import pytest

from app.application.ports import CandidatoParaReranker
from app.evaluation.metricas.contextual import ChunkPuntuado
from app.evaluation.ranking_contextual import RegistroDelRanking, RerankerQueRegistra


@dataclass(frozen=True)
class _Candidato:
    chunk_id: str
    chunk_text: str = "texto"


class _RerankerDePuntajes:
    version = "fake-puntajes@1"

    def __init__(self, puntajes: list[float]) -> None:
        self._puntajes = puntajes

    def puntuar(self, pregunta: str, candidatos: Sequence[CandidatoParaReranker]) -> list[float]:
        return self._puntajes


def test_el_top3_respeta_el_orden_denso_cuando_los_puntajes_empatan_como_hace_el_servicio() -> None:
    registro = RegistroDelRanking()
    reranker = RerankerQueRegistra(_RerankerDePuntajes([0.5, 0.5, 0.9, 0.5]), registro)

    reranker.puntuar("q", [_Candidato("z"), _Candidato("b"), _Candidato("m"), _Candidato("a")])

    assert registro.ultimo == (
        ChunkPuntuado("m", 0.9),
        ChunkPuntuado("z", 0.5),
        ChunkPuntuado("b", 0.5),
    )


def test_el_observador_falla_cuando_el_reranker_devuelve_menos_puntajes_que_candidatos() -> None:
    reranker = RerankerQueRegistra(_RerankerDePuntajes([0.5]), RegistroDelRanking())

    with pytest.raises(ValueError):
        reranker.puntuar("q", [_Candidato("a"), _Candidato("b")])
