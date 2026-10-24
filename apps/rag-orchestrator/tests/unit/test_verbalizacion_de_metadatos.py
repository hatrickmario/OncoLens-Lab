"""Verbalización determinista de metadatos para el NLI (US-118, ADR-34): reglas puras, sin adapters."""

from __future__ import annotations

import pytest

from app.domain.corpus_metadata.campos import (
    CAMPOS_ESCALARES,
    DISENOS_EXTRAIBLES,
    claves_de_poblacion_admitidas,
)
from app.domain.corpus_metadata.verbalizacion import CampoSinVerbalizacion, verbalizar_metadato


def test_verbaliza_la_fase_del_ensayo_en_espanol() -> None:
    assert verbalizar_metadato("trial_phase", "III") == "El estudio es un ensayo de fase III"


def test_verbaliza_el_tamano_de_la_muestra_como_participantes() -> None:
    assert verbalizar_metadato("sample_size", 500) == "El estudio incluyó 500 participantes"


def test_verbaliza_un_biomarcador_con_su_nombre_legible() -> None:
    assert (
        verbalizar_metadato("biomarcadores.her2", "positivo")
        == "En la población del estudio, HER2 es positivo"
    )


def test_la_misma_entrada_da_siempre_la_misma_hipotesis() -> None:
    assert verbalizar_metadato("estadio", "I–III") == verbalizar_metadato("estadio", "I–III")


def test_cada_diseno_extraible_tiene_una_hipotesis_distinta() -> None:
    hipotesis = {verbalizar_metadato("study_design", d) for d in DISENOS_EXTRAIBLES}

    assert len(hipotesis) == len(DISENOS_EXTRAIBLES)


def test_toda_clave_que_la_ingesta_puede_escribir_tiene_plantilla() -> None:
    for clave in sorted(claves_de_poblacion_admitidas()):
        assert " x" in verbalizar_metadato(clave, "x"), clave
    for campo in set(CAMPOS_ESCALARES) - {"study_design"}:
        assert " x" in verbalizar_metadato(campo, "x"), campo


@pytest.mark.parametrize(
    ("campo", "valor"),
    [("grupo_sanguineo", "A"), ("biomarcadores.ki67", "alto"), ("study_design", "otro")],
)
def test_un_campo_o_valor_sin_plantilla_falla_en_vez_de_improvisar_una_hipotesis(
    campo: str, valor: str
) -> None:
    with pytest.raises(CampoSinVerbalizacion):
        verbalizar_metadato(campo, valor)


def test_ninguna_plantilla_usa_lenguaje_prescriptivo() -> None:
    prohibidas = ("recomend", "debe recibir", "debería", "indicado para")
    todas = [verbalizar_metadato(c, "x") for c in claves_de_poblacion_admitidas()] + [
        verbalizar_metadato(c, "x") for c in set(CAMPOS_ESCALARES) - {"study_design"}
    ]

    assert not [t for t in todas if any(p in t.lower() for p in prohibidas)]
