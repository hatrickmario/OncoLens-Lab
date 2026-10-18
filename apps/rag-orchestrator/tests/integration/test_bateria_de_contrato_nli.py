"""Batería de contrato del NLI (US-231b AC-3, S1 resp. 3, RN-01).

La misma batería corre sobre el adapter REAL (sesión falsa en la ruta rápida; pesos con ``-m models``) y sobre el FAKE:
misma firma, nunca ``None``, ``label`` dentro del conjunto permitido y el mismo error del puerto ante un fallo.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence

import pytest

from app.application.ports import FalloDeInferencia, NliClassifier, ParNli, ResultadoNli
from app.domain.nli import ETIQUETAS_NLI, IndicesDeClase
from app.infrastructure.nli.mdeberta import ClasificadorNliMdeberta
from tests.support.inferencia_falsa import (
    PARES_NLI_FX06AC,
    SesionNliFalsa,
    TokenizadorFalso,
    logits_esperados_de_fx06ac,
)
from tests.support.nli_falso import NliFalso

SECRETO_CLINICO = "texto-clinico-que-no-debe-salir"


def _pares() -> list[ParNli]:
    return [ParNli(premisa=p, hipotesis=h) for p, h, _ in PARES_NLI_FX06AC]


def _real(rompe: bool = False) -> NliClassifier:
    error = RuntimeError(f"fallo del runtime con {SECRETO_CLINICO}") if rompe else None
    return ClasificadorNliMdeberta(
        SesionNliFalsa(logits_esperados_de_fx06ac(TokenizadorFalso()), error=error),
        TokenizadorFalso(),
        version="mdeberta-test@rev#sha256:abc",
        indices=IndicesDeClase(0, 1, 2),
        max_length=512,
        max_tokens_por_lote=4096,
    )


def _fake(rompe: bool = False) -> NliClassifier:
    return NliFalso(error=RuntimeError(SECRETO_CLINICO) if rompe else None)


def _con_pesos_reales(rompe: bool = False) -> NliClassifier:
    from tests.support.modelos import cargar_modelos_reales

    assert not rompe, "el fallo del modelo real se cubre con la sesión falsa"
    return cargar_modelos_reales().clasificador_nli


FABRICAS: dict[str, Callable[..., NliClassifier]] = {
    "real-con-sesion-falsa": _real,
    "fake": _fake,
    "real-con-pesos": _con_pesos_reales,
}


def _devuelve_un_resultado_por_par_en_el_mismo_orden_y_nunca_none(
    fabrica: Callable[..., NliClassifier],
) -> None:
    resultados = fabrica().clasificar(_pares())

    assert len(resultados) == len(PARES_NLI_FX06AC)
    assert all(isinstance(r, ResultadoNli) for r in resultados)
    assert all(r.label in ETIQUETAS_NLI for r in resultados)
    assert all(type(r.p_entailment) is float and 0.0 <= r.p_entailment <= 1.0 for r in resultados)


def _un_lote_vacio_devuelve_lista_vacia(fabrica: Callable[..., NliClassifier]) -> None:
    assert fabrica().clasificar([]) == []


def _declara_su_version_como_texto_no_vacio(fabrica: Callable[..., NliClassifier]) -> None:
    version = fabrica().version

    assert isinstance(version, str) and version


def _el_fallo_del_modelo_lanza_el_error_del_puerto_sin_texto_de_la_premisa_ni_de_la_hipotesis(
    fabrica: Callable[..., NliClassifier],
) -> None:
    with pytest.raises(FalloDeInferencia) as error:
        fabrica(rompe=True).clasificar(_pares())

    mensaje = f"{error.value} {error.value!r}"
    assert SECRETO_CLINICO not in mensaje
    assert all(p.premisa not in mensaje and p.hipotesis not in mensaje for p in _pares())
    assert error.value.__cause__ is None
    assert error.value.__suppress_context__ or error.value.__context__ is None


def _un_par_con_hipotesis_mas_larga_que_el_maximo_lanza_el_error_del_puerto(
    fabrica: Callable[..., NliClassifier],
) -> None:
    hipotesis_larga = "palabra " * 600  # recortar la hipótesis validaría una afirmación a medias (RN-01)

    with pytest.raises(FalloDeInferencia):
        fabrica().clasificar([ParNli(premisa="premisa corta", hipotesis=hipotesis_larga)])


def _una_premisa_mas_larga_que_el_maximo_se_clasifica_por_ventanas_sin_fallar(
    fabrica: Callable[..., NliClassifier],
) -> None:
    premisa_larga = "palabra " * 600

    resultados = fabrica().clasificar([ParNli(premisa=premisa_larga, hipotesis="hipotesis corta")])

    assert len(resultados) == 1 and resultados[0].label in ETIQUETAS_NLI


BATERIA: Sequence[Callable[..., None]] = (
    _devuelve_un_resultado_por_par_en_el_mismo_orden_y_nunca_none,
    _un_lote_vacio_devuelve_lista_vacia,
    _declara_su_version_como_texto_no_vacio,
    _el_fallo_del_modelo_lanza_el_error_del_puerto_sin_texto_de_la_premisa_ni_de_la_hipotesis,
    _un_par_con_hipotesis_mas_larga_que_el_maximo_lanza_el_error_del_puerto,
    _una_premisa_mas_larga_que_el_maximo_se_clasifica_por_ventanas_sin_fallar,
)


def _combinaciones() -> list[object]:
    """Toda verificación sobre toda fábrica, salvo el fallo con pesos reales (no se puede provocar: lo cubre la sesión falsa)."""
    casos: list[object] = []
    for nombre, fabrica in FABRICAS.items():
        for verificacion in BATERIA:
            if nombre == "real-con-pesos" and verificacion is _el_fallo_del_modelo_lanza_el_error_del_puerto_sin_texto_de_la_premisa_ni_de_la_hipotesis:
                continue
            marcas = [pytest.mark.models] if nombre == "real-con-pesos" else []
            casos.append(
                pytest.param(
                    fabrica,
                    verificacion,
                    marks=marcas,
                    id=f"{nombre}-{verificacion.__name__.strip('_')}",
                )
            )
    return casos


@pytest.mark.ac("US-231b", 3)
@pytest.mark.parametrize(("fabrica", "verificacion"), _combinaciones())
def test_la_misma_bateria_pasa_sobre_el_nli_real_y_sobre_el_fake(
    fabrica: Callable[..., NliClassifier], verificacion: Callable[..., None]
) -> None:
    verificacion(fabrica)
