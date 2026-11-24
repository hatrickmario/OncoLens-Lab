"""``TokenizadorDeArchivo.codificar_par``: el tramo del pasaje sale de los ``sequence_ids`` de ``tokenizers`` (US-278 D3).

Un ``tokenizer.json`` mínimo generado en el test (WordLevel con la plantilla de pares de XLM-R: ``<s> A </s></s> B </s>``);
sin pesos ni red (RN-12, RN-14).
"""

from __future__ import annotations

from pathlib import Path

import pytest
from tokenizers import Tokenizer, models, pre_tokenizers, processors

from app.infrastructure.models.onnx import TokenizadorDeArchivo

PALABRAS = ["her2", "mama", "terapia", "anti", "cancer", "estadio"]
VOCABULARIO = {
    "<pad>": 1,
    "<s>": 0,
    "</s>": 2,
    "<unk>": 3,
    **{p: 10 + i for i, p in enumerate(PALABRAS)},
}


@pytest.fixture
def tokenizador(tmp_path: Path) -> TokenizadorDeArchivo:
    base = Tokenizer(models.WordLevel(VOCABULARIO, unk_token="<unk>"))
    base.pre_tokenizer = pre_tokenizers.Whitespace()
    base.post_processor = processors.TemplateProcessing(
        single="<s> $A </s>",
        pair="<s> $A </s> </s> $B </s>",
        special_tokens=[("<s>", 0), ("</s>", 2)],
    )
    ruta = tmp_path / "tokenizer.json"
    base.save(str(ruta))
    return TokenizadorDeArchivo(ruta)


def test_devuelve_los_mismos_ids_que_codificar_con_el_par(
    tokenizador: TokenizadorDeArchivo,
) -> None:
    par = tokenizador.codificar_par("her2 mama", "terapia anti her2 estadio")

    assert par.ids == tokenizador.codificar("her2 mama", "terapia anti her2 estadio")


def test_el_tramo_del_pasaje_son_sus_tokens_sin_los_especiales_ni_la_pregunta(
    tokenizador: TokenizadorDeArchivo,
) -> None:
    par = tokenizador.codificar_par("her2 mama", "terapia anti her2 estadio")

    assert par.ids[par.inicio_pasaje : par.fin_pasaje] == [12, 13, 10, 15]
    assert par.ids[: par.inicio_pasaje] == [0, 10, 11, 2, 2]
    assert par.ids[par.fin_pasaje :] == [2]


def test_un_pasaje_vacio_da_un_tramo_vacio_antes_del_separador_final(
    tokenizador: TokenizadorDeArchivo,
) -> None:
    par = tokenizador.codificar_par("her2 mama", "")

    assert par.inicio_pasaje == par.fin_pasaje == len(par.ids) - 1
