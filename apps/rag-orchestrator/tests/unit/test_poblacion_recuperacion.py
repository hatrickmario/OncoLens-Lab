"""Selección de fragmentos por criterio (US-242 D3): regla pura y adapter sobre los fragmentos del propio documento."""

from __future__ import annotations

from app.application.corpus_metadata.poblacion_puertos import DocumentoParaExtraer, Fragmento
from app.domain.corpus_metadata.poblacion_recuperacion import (
    indices_mas_relevantes,
    puntaje_lexical,
    terminos_de_consulta,
)
from app.infrastructure.corpus_metadata.recuperador_lexical import RecuperadorLexicalDeFragmentos
from tests.support.poblacion_abanico import criterios_de_mama


def test_terminos_de_consulta_normaliza_ignora_los_cortos_y_suma_los_de_las_secciones_de_poblacion() -> (
    None
):
    terminos = terminos_de_consulta("Estado de HER2", None, "ER")

    assert {"estado", "her2", "eligibility"} <= terminos
    assert "de" not in terminos and "er" not in terminos


def test_puntaje_lexical_cuenta_terminos_distintos_y_no_repeticiones() -> None:
    terminos = frozenset({"her2", "estadio"})

    assert puntaje_lexical("HER2 her2 HER2", terminos) == 1
    assert puntaje_lexical("HER2 y Estadio", terminos) == 2
    assert puntaje_lexical("sin coincidencias", terminos) == 0


def test_indices_mas_relevantes_ordena_por_puntaje_y_desempata_por_posicion() -> None:
    terminos = frozenset({"her2", "stage"})
    textos = ["nada", "her2", "her2 stage", "stage"]

    assert indices_mas_relevantes(textos, terminos, 3) == (2, 1, 3)
    assert indices_mas_relevantes(textos, terminos, 1) == (2,)


def test_indices_mas_relevantes_descarta_los_fragmentos_sin_ningun_termino() -> None:
    assert indices_mas_relevantes(["nada", "otra cosa"], frozenset({"her2"}), 4) == ()


def test_recuperador_lexical_devuelve_a_lo_sumo_k_fragmentos_del_documento_dado() -> None:
    her2 = next(c for c in criterios_de_mama() if c.clave == "estado_her2")
    fragmentos = (
        Fragmento("c1", "Discussion about funding."),
        Fragmento("c2", "Eligible patients had HER2 status positive."),
        Fragmento("c3", "Methods: HER2 status was assessed centrally."),
    )
    documento = DocumentoParaExtraer("d", "d@1", fragmentos)

    recuperador = RecuperadorLexicalDeFragmentos()
    relevantes = recuperador.relevantes(documento, her2, 2)

    assert [f.chunk_id for f in relevantes] == ["c2", "c3"]
    assert recuperador.todos(documento) == fragmentos
    assert set(relevantes) <= set(fragmentos)
