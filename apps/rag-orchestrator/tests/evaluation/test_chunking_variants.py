from __future__ import annotations

import re

import pytest
from app.evaluation.chunking_variants import (
    ESTRATEGIA_ESTRUCTURA,
    ESTRATEGIA_TAMANO_FIJO,
    Seccion,
    Variante,
    fragmentar,
    fragmentar_por_estructura,
    fragmentar_tamano_fijo,
    solapamiento_en_tokens,
    variantes_admitidas,
)


class TokenizadorPalabras:
    """Un token por palabra: cumple el puerto sin cargar ningún modelo."""

    def __init__(self, max_length: int = 512, tokens_especiales: int = 2) -> None:
        self.max_length = max_length
        self.tokens_especiales = tokens_especiales

    def desplazamientos(self, texto: str) -> list[tuple[int, int]]:
        return [(m.start(), m.end()) for m in re.finditer(r"\S+", texto)]


def palabras(n: int, prefijo: str = "w") -> str:
    return " ".join(f"{prefijo}{i}" for i in range(n))


def test_fragmentar_tamano_fijo_sin_solapamiento_parte_en_ventanas_contiguas() -> None:
    chunks = fragmentar_tamano_fijo("D", palabras(10), TokenizadorPalabras(), tamano=4, solapamiento_pct=0.0)

    assert [c.tokens for c in chunks] == [4, 4, 2]
    assert chunks[0].texto == "w0 w1 w2 w3" and chunks[2].texto == "w8 w9"


def test_fragmentar_tamano_fijo_con_solapamiento_repite_los_ultimos_tokens() -> None:
    chunks = fragmentar_tamano_fijo("D", palabras(10), TokenizadorPalabras(), tamano=4, solapamiento_pct=0.5)

    assert chunks[0].texto == "w0 w1 w2 w3" and chunks[1].texto == "w2 w3 w4 w5"
    assert chunks[-1].texto.endswith("w9")


def test_fragmentar_tamano_fijo_el_ultimo_chunk_no_se_duplica_cuando_cabe_exacto() -> None:
    chunks = fragmentar_tamano_fijo("D", palabras(8), TokenizadorPalabras(), tamano=4, solapamiento_pct=0.0)

    assert len(chunks) == 2


def test_fragmentar_tamano_fijo_texto_vacio_no_produce_chunks() -> None:
    assert fragmentar_tamano_fijo("D", "   ", TokenizadorPalabras(), 4, 0.0) == []


def test_fragmentar_tamano_fijo_rechaza_solapamiento_igual_al_tamano() -> None:
    with pytest.raises(ValueError):
        fragmentar_tamano_fijo("D", palabras(10), TokenizadorPalabras(), 4, 1.0)


def test_solapamiento_en_tokens_redondea_el_porcentaje() -> None:
    assert solapamiento_en_tokens(512, 0.125) == 64


@pytest.mark.ac("US-012", 11)
def test_fragmentar_por_estructura_respeta_los_limites_de_seccion_y_conserva_el_nombre_ac11() -> None:
    secciones = [Seccion("Métodos", palabras(3, "m")), Seccion("Resultados", palabras(3, "r")), Seccion("Discusión", palabras(3, "d"))]

    chunks = fragmentar_por_estructura("D", secciones, TokenizadorPalabras(), tamano=5, solapamiento_pct=0.0)

    assert [c.seccion for c in chunks] == ["Métodos", "Resultados", "Discusión"]
    assert not any("m0" in c.texto and "r0" in c.texto for c in chunks)


def test_fragmentar_por_estructura_agrupa_secciones_cortas_hasta_el_tamano() -> None:
    secciones = [Seccion("A", palabras(2, "a")), Seccion("B", palabras(2, "b")), Seccion("C", palabras(4, "c"))]

    chunks = fragmentar_por_estructura("D", secciones, TokenizadorPalabras(), tamano=5, solapamiento_pct=0.0)

    assert [c.seccion for c in chunks] == ["A", "C"]
    assert chunks[0].tokens == 4


def test_fragmentar_por_estructura_parte_con_tamano_fijo_la_seccion_que_excede() -> None:
    secciones = [Seccion("Larga", palabras(10, "l")), Seccion("Corta", palabras(2, "c"))]

    chunks = fragmentar_por_estructura("D", secciones, TokenizadorPalabras(), tamano=4, solapamiento_pct=0.0)

    assert [c.seccion for c in chunks] == ["Larga", "Larga", "Larga", "Corta"]
    assert max(c.tokens for c in chunks) <= 4


def test_fragmentar_por_estructura_texto_sin_secciones_cae_a_tamano_fijo() -> None:
    chunks = fragmentar_por_estructura("D", [Seccion("", palabras(10))], TokenizadorPalabras(), tamano=4, solapamiento_pct=0.0)

    assert [c.tokens for c in chunks] == [4, 4, 2]


def test_variantes_admitidas_omite_las_que_superan_la_longitud_maxima_y_anota_el_motivo() -> None:
    variantes = [Variante(t, 0.0, ESTRATEGIA_TAMANO_FIJO) for t in (256, 512, 1024)]

    admitidas, omitidas = variantes_admitidas(variantes, TokenizadorPalabras(max_length=512, tokens_especiales=2))

    assert [v.tamano for v in admitidas] == [256]
    assert [o["variante"] for o in omitidas] == ["tamano_fijo-512-0pct", "tamano_fijo-1024-0pct"]
    assert "514" in str(omitidas[0]["motivo"])


def test_variante_simplicidad_tamano_fijo_sin_solape_es_la_mas_simple() -> None:
    assert Variante(512, 0.0, ESTRATEGIA_TAMANO_FIJO).simplicidad == 0
    assert Variante(512, 0.1, ESTRATEGIA_TAMANO_FIJO).simplicidad == 1
    assert Variante(512, 0.1, ESTRATEGIA_ESTRUCTURA).simplicidad == 2


def test_fragmentar_dispatcha_por_estrategia() -> None:
    secciones = [Seccion("A", palabras(3)), Seccion("B", palabras(3, "b"))]
    tok = TokenizadorPalabras()

    fijo = fragmentar("D", secciones, tok, Variante(100, 0.0, ESTRATEGIA_TAMANO_FIJO))
    estructura = fragmentar("D", secciones, tok, Variante(4, 0.0, ESTRATEGIA_ESTRUCTURA))

    assert len(fijo) == 1 and len(estructura) == 2
