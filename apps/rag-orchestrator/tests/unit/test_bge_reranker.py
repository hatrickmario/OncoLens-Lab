"""Adapter de bge-reranker-v2-m3 (US-231a AC-2, AC-5): sigmoide, orden, límite de pares, truncado y errores."""

from __future__ import annotations

import math

import numpy as np
import pytest

from app.application.ports import ChunkEncontrado, FalloDeInferencia
from app.infrastructure.reranker.bge_reranker import BgeReranker
from tests.support.inferencia_falsa import ID_SEP, SesionDeLogitsFalsa, TokenizadorFalso

TEXTO_SECRETO = "texto-clinico-que-no-debe-salir-en-el-error"


def _chunk(texto: str, id_: str = "c") -> ChunkEncontrado:
    return ChunkEncontrado(chunk_id=id_, document_id="d", chunk_text=texto, similitud_dense=0.1)


def _reranker(
    sesion: object | None = None, codificador: object | None = None, **cambios: object
) -> BgeReranker:
    valores: dict[str, object] = {
        "version": "BAAI/bge-reranker-v2-m3@rev#sha256:abc",
        "max_length": 64,
        "max_pairs": 12,
        "max_tokens_por_lote": 4096,
        **cambios,
    }
    return BgeReranker(
        sesion or SesionDeLogitsFalsa(),  # type: ignore[arg-type]
        codificador or TokenizadorFalso(),  # type: ignore[arg-type]
        **valores,  # type: ignore[arg-type]
    )


def _sigmoide(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))


def test_expone_la_version_recibida_de_la_configuracion() -> None:
    assert _reranker().version == "BAAI/bge-reranker-v2-m3@rev#sha256:abc"


def test_normaliza_cada_logit_con_sigmoide_en_el_orden_de_los_candidatos() -> None:
    reranker = _reranker(sesion=SesionDeLogitsFalsa(logits=[2.0, -1.0, 0.0]))

    puntajes = reranker.puntuar("pregunta", [_chunk("a"), _chunk("b"), _chunk("c")])

    assert puntajes == pytest.approx([_sigmoide(2.0), _sigmoide(-1.0), 0.5])


def test_un_logit_muy_negativo_da_un_puntaje_en_cero_y_uno_muy_positivo_en_uno_sin_desbordar() -> (
    None
):
    reranker = _reranker(sesion=SesionDeLogitsFalsa(logits=[-1000.0, 1000.0]))

    assert reranker.puntuar("p", [_chunk("a"), _chunk("b")]) == [0.0, 1.0]


def test_envia_al_modelo_la_pareja_pregunta_pasaje() -> None:
    codificador = TokenizadorFalso()

    _reranker(codificador=codificador).puntuar("her2 mama", [_chunk("anti her2")])

    assert codificador.llamadas == [("her2 mama", "anti her2")]


def test_el_puntaje_de_cada_candidato_no_depende_de_la_posicion_ni_del_lote() -> None:
    candidatos = [
        _chunk("her2 mama cancer"),
        _chunk("x"),
        _chunk("her2 her2 mama uno dos tres cuatro"),
    ]
    solos = [_reranker().puntuar("her2 mama", [c])[0] for c in candidatos]

    en_lotes = _reranker(max_tokens_por_lote=12).puntuar("her2 mama", candidatos)

    assert en_lotes == pytest.approx(solos)


def test_mas_pares_que_el_maximo_falla_con_el_error_del_puerto_sin_truncar_en_silencio() -> None:
    sesion = SesionDeLogitsFalsa()
    reranker = _reranker(sesion=sesion, max_pairs=2)

    with pytest.raises(FalloDeInferencia):
        reranker.puntuar("p", [_chunk("a"), _chunk("b"), _chunk("c")])

    assert sesion.lotes == []


def test_sin_candidatos_devuelve_lista_vacia_sin_invocar_al_modelo() -> None:
    sesion = SesionDeLogitsFalsa()

    assert _reranker(sesion=sesion).puntuar("p", []) == []
    assert sesion.lotes == []


def test_trunca_cada_par_al_maximo_conservando_el_separador_final() -> None:
    sesion = SesionDeLogitsFalsa()

    _reranker(sesion=sesion, max_length=8).puntuar("uno dos", [_chunk("a b c d e f g h i j k l")])

    secuencia = sesion.lotes[0][0]
    assert len(secuencia) == 8 and secuencia[-1] == ID_SEP


@pytest.mark.parametrize(
    "salida",
    [
        np.array([[np.nan]], dtype=np.float32),
        np.array([[np.inf]], dtype=np.float32),
        np.array([[1.0], [2.0]], dtype=np.float32),
        np.array([[1.0, 2.0]], dtype=np.float32),
    ],
    ids=["nan", "infinito", "lote-de-mas", "dos-columnas"],
)
def test_una_salida_no_finita_o_con_forma_inesperada_falla_en_vez_de_inventar_un_puntaje(
    salida: np.ndarray,
) -> None:
    class SesionFija:
        def ejecutar(self, secuencias):
            return salida

    with pytest.raises(FalloDeInferencia):
        _reranker(sesion=SesionFija()).puntuar("p", [_chunk("a")])


@pytest.mark.parametrize("origen", ["sesion", "codificador"])
def test_un_fallo_del_modelo_se_traduce_al_error_del_puerto_sin_texto_ni_causa(origen: str) -> None:
    causa = RuntimeError(TEXTO_SECRETO)
    reranker = _reranker(
        sesion=SesionDeLogitsFalsa(error=causa if origen == "sesion" else None),
        codificador=TokenizadorFalso(error=causa if origen == "codificador" else None),
    )

    with pytest.raises(FalloDeInferencia) as error:
        reranker.puntuar(TEXTO_SECRETO, [_chunk(TEXTO_SECRETO)])

    assert TEXTO_SECRETO not in f"{error.value} {error.value!r}"
    assert error.value.__cause__ is None and error.value.__suppress_context__ is True
