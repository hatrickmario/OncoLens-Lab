"""Normalización y fragmentación del texto del corpus (US-059 D6): reglas puras, sin adapters."""

from __future__ import annotations

import pytest

from app.domain.corpus_seed.chunking import fragmentar, normalizar_texto
from app.infrastructure.tokenizer.por_palabras import TokenizadorPorPalabras

TOKENIZADOR = TokenizadorPorPalabras()


def palabras(n: int) -> str:
    return " ".join(f"p{i}" for i in range(n))


def test_normaliza_a_nfc() -> None:
    assert normalizar_texto("café") == "café"


def test_unifica_saltos_de_linea_y_colapsa_espacios_y_tabuladores() -> None:
    assert normalizar_texto("uno   dos\t\ttres\r\ncuatro\rcinco") == "uno dos tres\ncuatro\ncinco"


def test_quita_los_espacios_de_los_extremos_de_cada_linea_y_del_texto() -> None:
    assert normalizar_texto("  uno  \n dos \n") == "uno\ndos"


def test_reduce_tres_o_mas_saltos_de_linea_seguidos_a_un_parrafo_en_blanco() -> None:
    assert normalizar_texto("uno\n\n\n\n\ndos") == "uno\n\ndos"


def test_un_texto_que_solo_tiene_espacios_se_normaliza_a_vacio() -> None:
    assert normalizar_texto(" \n\t ") == ""


def test_un_texto_normalizado_no_cambia_al_normalizarlo_otra_vez() -> None:
    texto = normalizar_texto("uno    dos\r\n\r\n\r\ntres ")

    assert normalizar_texto(texto) == texto


def test_un_texto_mas_corto_que_el_tamano_es_un_solo_chunk() -> None:
    assert fragmentar("uno dos tres", TOKENIZADOR, tamano=5, solape=0) == ["uno dos tres"]


def test_parte_en_ventanas_de_tamano_fijo_sin_perder_ni_repetir_nada_cuando_no_hay_solape() -> None:
    texto = palabras(25)

    chunks = fragmentar(texto, TOKENIZADOR, tamano=10, solape=0)

    assert [len(c.split()) for c in chunks] == [10, 10, 5]
    assert " ".join(chunks) == texto


def test_el_solape_repite_las_ultimas_palabras_del_chunk_anterior_al_inicio_del_siguiente() -> None:
    chunks = fragmentar(palabras(12), TOKENIZADOR, tamano=6, solape=2)

    assert chunks == ["p0 p1 p2 p3 p4 p5", "p4 p5 p6 p7 p8 p9", "p8 p9 p10 p11"]


def test_el_ultimo_chunk_no_se_repite_cuando_el_texto_ya_quedo_cubierto_por_el_solape() -> None:
    chunks = fragmentar(palabras(8), TOKENIZADOR, tamano=6, solape=2)

    assert chunks == ["p0 p1 p2 p3 p4 p5", "p4 p5 p6 p7"]


def test_un_texto_vacio_no_da_chunks() -> None:
    assert fragmentar("", TOKENIZADOR, tamano=5, solape=0) == []


@pytest.mark.parametrize(("tamano", "solape"), [(0, 0), (-1, 0), (5, -1), (5, 5), (5, 9)])
def test_rechaza_un_tamano_no_positivo_o_un_solape_que_no_es_menor_que_el_tamano(
    tamano: int, solape: int
) -> None:
    with pytest.raises(ValueError, match="tamano|solape"):
        fragmentar("uno dos", TOKENIZADOR, tamano=tamano, solape=solape)
