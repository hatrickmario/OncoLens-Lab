"""Verbalización determinista de metadatos para el NLI (US-118, ADR-34): reglas puras, sin adapters."""

from __future__ import annotations

import pytest

from app.domain.corpus_metadata.campos import (
    CAMPOS_ESCALARES,
    CRITERIOS_PLANOS,
    DISENOS_EXTRAIBLES,
    SUBCLAVES_DE_BIOMARCADORES,
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


FRASES_EXACTAS = {
    ("study_design", "eca"): "El estudio es un ensayo controlado aleatorizado",
    ("study_design", "guia"): "El documento es una guía de práctica clínica",
    ("study_design", "observacional"): "El estudio es un estudio observacional",
    ("study_design", "revision_sistematica"): "El documento es una revisión sistemática",
    ("trial_phase", "x"): "El estudio es un ensayo de fase x",
    ("sample_size", "x"): "El estudio incluyó x participantes",
    ("primary_endpoint", "x"): "El criterio de valoración principal del estudio es x",
    ("subtipo", "x"): "La población del estudio tiene el subtipo x",
    ("estadio", "x"): "La población del estudio está en el estadio x",
    ("linea", "x"): "El estudio evalúa el tratamiento en la línea x",
    ("edad", "x"): "La edad de la población del estudio es x",
    ("ecog", "x"): "El estado funcional ECOG de la población del estudio es x",
    ("biomarcadores.her2", "x"): "En la población del estudio, HER2 es x",
    ("biomarcadores.receptores_hormonales", "x"): (
        "En la población del estudio, los receptores hormonales es x"
    ),
    ("biomarcadores.hrr_brca", "x"): "En la población del estudio, HRR/BRCA es x",
}


@pytest.mark.parametrize(("campo", "valor"), sorted(FRASES_EXACTAS))
def test_cada_clave_se_verbaliza_con_su_frase_exacta(campo: str, valor: str) -> None:
    assert verbalizar_metadato(campo, valor) == FRASES_EXACTAS[(campo, valor)]


def test_la_tabla_de_frases_exactas_cubre_todas_las_claves_de_campos_py() -> None:
    cubiertas = {c for c, _ in FRASES_EXACTAS}
    esperadas = (
        {"study_design"}
        | (set(CAMPOS_ESCALARES) - {"study_design"})
        | set(CRITERIOS_PLANOS)
        | {f"biomarcadores.{s}" for s in SUBCLAVES_DE_BIOMARCADORES}
    )

    assert cubiertas == esperadas
    assert {v for c, v in FRASES_EXACTAS if c == "study_design"} == set(DISENOS_EXTRAIBLES)
