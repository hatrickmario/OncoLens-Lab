"""Clasificación NLI real por lotes y su procedencia (US-231b AC-1 y AC-2, ADR-39, FR-10, FR-25).

En la ruta rápida el adapter real corre con una sesión de inferencia falsa; con ``-m models`` corre con los pesos reales.
"""

from __future__ import annotations

import pytest

from app.application.ports import NliClassifier, ParNli
from app.domain.modelos import describir_modelo
from app.domain.nli import IndicesDeClase
from app.infrastructure.nli.mdeberta import ClasificadorNliMdeberta
from tests.support.inferencia_falsa import (
    PARES_NLI_FX06AC,
    SesionNliFalsa,
    TokenizadorFalso,
    logits_esperados_de_fx06ac,
)

TOLERANCIA = 1e-6
VERSION = describir_modelo("mdeberta-test", "rev-nli-test", "ab" * 32)


def _pares() -> list[ParNli]:
    return [ParNli(premisa=p, hipotesis=h) for p, h, _ in PARES_NLI_FX06AC]


def _clasificador_con_sesion_falsa(
    indices: tuple[int, int, int] = (0, 1, 2),
) -> ClasificadorNliMdeberta:
    sesion = SesionNliFalsa(logits_esperados_de_fx06ac(TokenizadorFalso(), indices))
    return ClasificadorNliMdeberta(
        sesion,
        TokenizadorFalso(),
        version=VERSION,
        indices=IndicesDeClase(*indices),
        max_length=512,
        max_tokens_por_lote=4096,
    )


@pytest.mark.ac("US-231b", 1)
def test_clasificar_devuelve_la_clase_esperada_con_probabilidades_que_suman_1_para_los_tres_pares_de_fx06ac_en_un_lote_con_sesion_falsa() -> (
    None
):
    clasificador = _clasificador_con_sesion_falsa()

    resultados = clasificador.clasificar(_pares())
    probabilidades = clasificador.probabilidades(_pares())

    assert [r.label for r in resultados] == [esperada for _, _, esperada in PARES_NLI_FX06AC]
    for resultado, p in zip(resultados, probabilidades, strict=True):
        assert abs(p.entailment + p.neutral + p.contradiction - 1.0) < TOLERANCIA
        assert resultado.p_entailment == pytest.approx(p.entailment)


@pytest.mark.models
@pytest.mark.ac("US-231b", 1)
def test_clasificar_devuelve_la_clase_esperada_con_probabilidades_que_suman_1_para_los_tres_pares_de_fx06ac_en_un_lote_con_pesos_reales() -> (
    None
):
    from tests.support.modelos import cargar_modelos_reales

    clasificador = cargar_modelos_reales().clasificador_nli

    resultados = clasificador.clasificar(_pares())
    probabilidades = clasificador.probabilidades(_pares())  # type: ignore[attr-defined]

    assert [r.label for r in resultados] == [esperada for _, _, esperada in PARES_NLI_FX06AC]
    assert all(
        abs(p.entailment + p.neutral + p.contradiction - 1.0) < TOLERANCIA for p in probabilidades
    )


@pytest.mark.ac("US-231b", 2)
def test_la_metainformacion_del_nli_contiene_modelo_version_y_hash_de_la_configuracion() -> None:
    clasificador: NliClassifier = _clasificador_con_sesion_falsa()

    assert clasificador.version == "mdeberta-test@rev-nli-test#sha256:" + "ab" * 32
