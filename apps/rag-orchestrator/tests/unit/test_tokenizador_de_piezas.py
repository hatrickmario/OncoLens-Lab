"""Tokenizer de piezas del cargador de la semilla (US-231b D7): una pieza por token y la concatenación es el texto."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.infrastructure.models.onnx import TokenizadorDeArchivo
from app.infrastructure.tokenizer.de_archivo import TokenizadorDePiezas
from tests.support.onnx_minimo import tokenizer_json


@pytest.fixture
def ruta(tmp_path: Path) -> Path:
    archivo = tmp_path / "tokenizer.json"
    archivo.write_bytes(tokenizer_json())
    return archivo


@pytest.mark.parametrize(
    "texto",
    [
        "hola mundo",
        "  hola   mundo  \n\nhola\tmundo\n",
        "hola, mundo: ¿hola? café ñandú",
        "palabra-desconocida hola",
        "x",
    ],
)
def test_la_concatenacion_de_las_piezas_es_el_texto_original(ruta: Path, texto: str) -> None:
    assert "".join(TokenizadorDePiezas(ruta).tokenizar(texto)) == texto


@pytest.mark.parametrize("texto", ["hola mundo hola", "hola   mundo\n\nhola", "hola, mundo: hola"])
def test_hay_una_pieza_por_token_del_modelo(ruta: Path, texto: str) -> None:
    piezas = TokenizadorDePiezas(ruta).tokenizar(texto)

    assert len(piezas) == len(TokenizadorDeArchivo(ruta).codificar(texto))


def test_un_texto_vacio_no_tiene_piezas(ruta: Path) -> None:
    assert TokenizadorDePiezas(ruta).tokenizar("") == []


def test_el_espacio_previo_al_primer_token_viaja_con_la_primera_pieza(ruta: Path) -> None:
    assert TokenizadorDePiezas(ruta).tokenizar("   hola mundo")[0].startswith("   hola")


def test_el_tokenizador_no_trunca_un_texto_largo(ruta: Path) -> None:
    assert len(TokenizadorDePiezas(ruta).tokenizar("hola " * 5000)) == 5000
