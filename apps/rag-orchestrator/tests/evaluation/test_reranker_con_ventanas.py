"""``RerankerConVentanas``: el contrato que la suite exige a un reranker para comparar brazos de ventanas (US-278)."""

from __future__ import annotations

import pytest

from app.evaluation.adaptadores_falsos import RerankerLexico
from app.evaluation.guardas import SuiteAbortada
from app.evaluation.llamadas import RegistroDeLlamadas
from app.evaluation.modelos_locales import RerankerRegistrado
from app.evaluation.reranker_con_ventanas import RerankerConVentanas
from tests.support.recuperacion import RerankerFalso
from tests.support.ventanas_del_reranker import SesionPorMarcas, reranker_de_ventanas


def _registrado(interno: object) -> RerankerRegistrado:
    return RerankerRegistrado(interno, RegistroDeLlamadas(), "sintetico")  # type: ignore[arg-type]


@pytest.mark.parametrize(
    "reranker",
    [
        pytest.param(reranker_de_ventanas(SesionPorMarcas()), id="BgeReranker"),
        pytest.param(RerankerLexico(), id="RerankerLexico"),
        pytest.param(_registrado(RerankerLexico()), id="RerankerRegistrado"),
    ],
)
def test_los_rerankers_con_etapa_cumplen_el_protocolo_de_ventanas(reranker: object) -> None:
    assert isinstance(reranker, RerankerConVentanas)


def test_un_reranker_sin_etapa_no_cumple_el_protocolo_de_ventanas() -> None:
    assert not isinstance(RerankerFalso(), RerankerConVentanas)


def test_el_registrado_sobre_un_reranker_sin_etapa_no_expone_configuracion_y_rechaza_variantes() -> (
    None
):
    registrado = _registrado(RerankerFalso())

    assert registrado.configuracion is None
    with pytest.raises(SuiteAbortada, match="RERANKER_"):
        registrado.variante(modo_de_ventanas="maximo")


def test_la_variante_del_registrado_conserva_lo_que_no_se_cambia_y_sigue_registrada() -> None:
    registrado = _registrado(RerankerLexico(solape=2, max_length=12))

    otra = registrado.variante(modo_de_ventanas="maximo")

    assert isinstance(otra, RerankerRegistrado)
    assert otra.configuracion is not None
    assert (otra.configuracion.modo, otra.configuracion.solape, otra.configuracion.max_length) == (
        "maximo",
        2,
        12,
    )
