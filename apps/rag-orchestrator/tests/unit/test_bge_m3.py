"""Adapter de BGE-M3 (US-231a AC-1, AC-5): prefijos, lote, truncado, normalización y traducción de errores."""

from __future__ import annotations

import numpy as np
import pytest

from app.application.ports import FalloDeInferencia
from app.infrastructure.embeddings.bge_m3 import (
    EmbedderDeConsultaBgeM3,
    EmbedderDePasajesBgeM3,
    NucleoBgeM3,
)
from tests.support.inferencia_falsa import (
    ID_SEP,
    SesionDeEmbeddingsFalsa,
    TokenizadorFalso,
)

DIMENSION = 16
TEXTO_SECRETO = "texto-clinico-que-no-debe-salir-en-el-error"


def _nucleo(
    sesion: object | None = None,
    tokenizador: object | None = None,
    **cambios: object,
) -> NucleoBgeM3:
    valores: dict[str, object] = {
        "modelo": "BAAI/bge-m3@rev-test",
        "dimension": DIMENSION,
        "max_length": 64,
        "max_tokens_por_lote": 4096,
        **cambios,
    }
    return NucleoBgeM3(
        sesion or SesionDeEmbeddingsFalsa(DIMENSION),  # type: ignore[arg-type]
        tokenizador or TokenizadorFalso(),  # type: ignore[arg-type]
        **valores,  # type: ignore[arg-type]
    )


def test_el_embedder_de_consulta_expone_el_modelo_configurado() -> None:
    assert EmbedderDeConsultaBgeM3(_nucleo()).modelo == "BAAI/bge-m3@rev-test"


def test_el_puerto_de_consulta_antepone_el_prefijo_de_pregunta() -> None:
    tokenizador = TokenizadorFalso()
    nucleo = _nucleo(
        tokenizador=tokenizador, prefijo_consulta="pregunta: ", prefijo_pasaje="pasaje: "
    )

    EmbedderDeConsultaBgeM3(nucleo).embeber("her2")

    assert tokenizador.llamadas == [("pregunta: her2", None)]


def test_el_puerto_de_pasaje_antepone_el_prefijo_de_pasaje() -> None:
    tokenizador = TokenizadorFalso()
    nucleo = _nucleo(
        tokenizador=tokenizador, prefijo_consulta="pregunta: ", prefijo_pasaje="pasaje: "
    )

    EmbedderDePasajesBgeM3(nucleo).embeber(["her2"])

    assert tokenizador.llamadas == [("pasaje: her2", None)]


def test_sin_prefijos_configurados_el_texto_llega_intacto_al_modelo() -> None:
    tokenizador = TokenizadorFalso()
    nucleo = _nucleo(tokenizador=tokenizador)

    EmbedderDeConsultaBgeM3(nucleo).embeber("her2")
    EmbedderDePasajesBgeM3(nucleo).embeber(["her2"])

    assert tokenizador.llamadas == [("her2", None), ("her2", None)]


def test_los_dos_puertos_comparten_una_sola_sesion() -> None:
    sesion = SesionDeEmbeddingsFalsa(DIMENSION)
    nucleo = _nucleo(sesion=sesion)

    EmbedderDeConsultaBgeM3(nucleo).embeber("her2")
    EmbedderDePasajesBgeM3(nucleo).embeber(["her2"])

    assert len(sesion.lotes) == 2


def test_el_vector_de_la_consulta_tiene_la_dimension_configurada_y_norma_uno() -> None:
    vector = EmbedderDeConsultaBgeM3(_nucleo()).embeber("her2 positive breast cancer")

    assert len(vector) == DIMENSION
    assert float(np.linalg.norm(vector)) == pytest.approx(1.0)


def test_los_pasajes_devuelven_un_vector_por_texto_en_el_orden_recibido() -> None:
    textos = ["a b c d e f g h", "her2", "breast cancer her2 positive early"]
    esperados = [EmbedderDeConsultaBgeM3(_nucleo()).embeber(t) for t in textos]

    vectores = EmbedderDePasajesBgeM3(_nucleo()).embeber(textos)

    assert np.allclose(vectores, esperados)


def test_los_pasajes_se_parten_en_lotes_que_respetan_el_presupuesto_de_tokens() -> None:
    sesion = SesionDeEmbeddingsFalsa(DIMENSION)
    nucleo = _nucleo(sesion=sesion, max_tokens_por_lote=18)
    textos = ["uno dos tres cuatro"] * 4  # 6 ids por secuencia

    vectores = EmbedderDePasajesBgeM3(nucleo).embeber(textos)

    assert len(vectores) == 4
    assert [len(lote) for lote in sesion.lotes] == [3, 1]


def test_los_pasajes_vacios_no_invocan_al_modelo() -> None:
    sesion = SesionDeEmbeddingsFalsa(DIMENSION)

    assert EmbedderDePasajesBgeM3(_nucleo(sesion=sesion)).embeber([]) == []
    assert sesion.lotes == []


def test_un_texto_mas_largo_que_el_maximo_se_trunca_conservando_el_separador_final() -> None:
    sesion = SesionDeEmbeddingsFalsa(DIMENSION)
    nucleo = _nucleo(sesion=sesion, max_length=6)

    EmbedderDeConsultaBgeM3(nucleo).embeber("uno dos tres cuatro cinco seis siete")

    secuencia = sesion.lotes[0][0]
    assert len(secuencia) == 6 and secuencia[-1] == ID_SEP


def test_una_dimension_distinta_de_la_configurada_falla_con_el_error_del_puerto() -> None:
    nucleo = _nucleo(sesion=SesionDeEmbeddingsFalsa(DIMENSION + 1))

    with pytest.raises(FalloDeInferencia):
        EmbedderDeConsultaBgeM3(nucleo).embeber("her2")


def test_una_salida_con_forma_inesperada_falla_con_el_error_del_puerto() -> None:
    class SesionPlana:
        def ejecutar(self, secuencias):
            return np.zeros((len(secuencias), DIMENSION), dtype=np.float32)

    with pytest.raises(FalloDeInferencia):
        EmbedderDeConsultaBgeM3(_nucleo(sesion=SesionPlana())).embeber("her2")


@pytest.mark.parametrize("origen", ["sesion", "tokenizador"])
def test_un_fallo_del_modelo_se_traduce_al_error_del_puerto_sin_texto_ni_causa(origen: str) -> None:
    causa = RuntimeError(TEXTO_SECRETO)
    nucleo = _nucleo(
        sesion=SesionDeEmbeddingsFalsa(DIMENSION, error=causa if origen == "sesion" else None),
        tokenizador=TokenizadorFalso(error=causa if origen == "tokenizador" else None),
    )

    with pytest.raises(FalloDeInferencia) as error:
        EmbedderDeConsultaBgeM3(nucleo).embeber(TEXTO_SECRETO)

    assert TEXTO_SECRETO not in f"{error.value} {error.value!r}"
    assert error.value.__cause__ is None and error.value.__suppress_context__ is True
