"""Batería de contrato de los adapters de recuperación (US-231a AC-5, S1 resp. 12, RN-02).

La misma batería corre sobre el adapter REAL (con la sesión de inferencia falsa en la ruta rápida y con los pesos en
``models``) y sobre el FAKE: mismas firmas, mismo error al fallar, ``None`` jamás disfrazado de ``0.0`` y el fallo de
un modelo llega a ``/rag/query`` como ``503 RETRIEVAL_UNAVAILABLE``.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass

import pytest

from app.application.ports import (
    ChunkEncontrado,
    FalloDeInferencia,
    LanguageDetector,
    QueryEmbedder,
    Reranker,
)
from app.application.seed_corpus.ports import PassageEmbedder
from app.infrastructure.embeddings.bge_m3 import (
    EmbedderDeConsultaBgeM3,
    EmbedderDePasajesBgeM3,
    NucleoBgeM3,
)
from app.infrastructure.language.detector_local import DetectorDeIdiomaLocal
from app.infrastructure.reranker.bge_reranker import BgeReranker
from tests.support.contract import assert_matches_spec
from tests.support.inferencia_falsa import (
    PASAJES_FX06AC,
    SesionDeEmbeddingsFalsa,
    SesionDeLogitsFalsa,
    TokenizadorFalso,
)
from tests.support.recuperacion import (
    Q_HER2,
    Q_SIN,
    DetectorIdiomaFalso,
    EmbedderFalso,
    RerankerFalso,
    crear_entorno,
    solicitud_de,
)
from tests.support.semilla import EmbedderFalso as PasajesFalso

MAX_PARES = 12  # RERANKER_MAX_PAIRS (ADR-39)
DIMENSION = 8  # la de los vectores de FX-06a-a
RESPUESTA_503 = "#/paths/~1rag~1query/post/responses/503"
RESPUESTA = "#/components/schemas/RagQueryInternalResponse"


@dataclass
class Adaptadores:
    consulta: QueryEmbedder
    pasajes: PassageEmbedder
    reranker: Reranker
    detector: LanguageDetector


def _reales(rompe: str | None = None) -> Adaptadores:
    error = RuntimeError("fallo interno del runtime con texto clínico")
    nucleo = NucleoBgeM3(
        SesionDeEmbeddingsFalsa(DIMENSION, error=error if rompe == "embeddings" else None),
        TokenizadorFalso(),
        modelo="BAAI/bge-m3@rev-test",
        dimension=DIMENSION,
        max_length=512,
        max_tokens_por_lote=4096,
    )
    return Adaptadores(
        consulta=EmbedderDeConsultaBgeM3(nucleo),
        pasajes=EmbedderDePasajesBgeM3(nucleo),
        reranker=BgeReranker(
            SesionDeLogitsFalsa(error=error if rompe == "reranker" else None),
            TokenizadorFalso(),
            version="reranker-test@rev#sha256:abc",
            max_length=512,
            max_pairs=MAX_PARES,
            max_tokens_por_lote=4096,
        ),
        detector=DetectorDeIdiomaLocal("es"),
    )


def _fakes(rompe: str | None = None) -> Adaptadores:
    fallo = FalloDeInferencia("fallo del fake")
    pasajes = PasajesFalso(DIMENSION)
    if rompe == "embeddings":
        pasajes.error = fallo
    return Adaptadores(
        consulta=EmbedderFalso(error=fallo if rompe == "embeddings" else None),
        pasajes=pasajes,
        reranker=RerankerFalso(error=fallo if rompe == "reranker" else None, max_pairs=MAX_PARES),
        detector=DetectorIdiomaFalso(),
    )


def _con_pesos_reales(rompe: str | None = None) -> Adaptadores:
    from tests.support.modelos import cargar_modelos_reales

    assert rompe is None, "el fallo del modelo real se cubre con la sesión falsa"
    modelos = cargar_modelos_reales()
    return Adaptadores(
        modelos.embedder_consulta,
        modelos.embedder_pasajes,
        modelos.reranker,
        modelos.detector_idioma,
    )


FABRICAS = {
    "real-con-sesion-falsa": _reales,
    "fake": _fakes,
    "real-con-pesos": pytest.param(_con_pesos_reales, marks=pytest.mark.models),
}


def _candidatos() -> list[ChunkEncontrado]:
    return [
        ChunkEncontrado(chunk_id=i, document_id=f"doc-{i}", chunk_text=t, similitud_dense=0.5)
        for i, t in PASAJES_FX06AC.items()
    ]


# --- verificaciones de la batería: reciben la fábrica (real o fake) y no saben cuál es --------------------------------


def _la_consulta_devuelve_floats_y_declara_su_modelo(fabrica: Callable[..., Adaptadores]) -> None:
    adaptadores = fabrica()
    vector = adaptadores.consulta.embeber(Q_HER2)

    assert isinstance(adaptadores.consulta.modelo, str) and adaptadores.consulta.modelo
    assert len(vector) > 0 and all(isinstance(x, float) for x in vector)


def _los_pasajes_devuelven_un_vector_por_texto_en_el_mismo_orden(
    fabrica: Callable[..., Adaptadores],
) -> None:
    textos = list(PASAJES_FX06AC.values())
    vectores = fabrica().pasajes.embeber(textos)

    assert len(vectores) == len(textos)
    assert len({len(v) for v in vectores}) == 1
    assert vectores[0] == fabrica().pasajes.embeber(textos[:1])[0]


def _el_reranker_devuelve_un_puntaje_por_candidato_en_cero_uno_y_nunca_none(
    fabrica: Callable[..., Adaptadores],
) -> None:
    reranker = fabrica().reranker
    puntajes = reranker.puntuar(Q_HER2, _candidatos())

    assert isinstance(reranker.version, str) and reranker.version
    assert len(puntajes) == len(PASAJES_FX06AC)
    assert all(type(p) is float and 0.0 <= p <= 1.0 for p in puntajes)
    assert reranker.puntuar(Q_HER2, []) == []


def _mas_pares_que_el_maximo_falla_con_el_error_del_puerto(
    fabrica: Callable[..., Adaptadores],
) -> None:
    candidatos = _candidatos() * 5  # 15 > MAX_PARES

    with pytest.raises(FalloDeInferencia):
        fabrica().reranker.puntuar(Q_HER2, candidatos)
    assert len(fabrica().reranker.puntuar(Q_HER2, candidatos[:MAX_PARES])) == MAX_PARES


def _el_detector_devuelve_es_o_en(fabrica: Callable[..., Adaptadores]) -> None:
    assert fabrica().detector.detectar(Q_HER2) in ("es", "en")


def _el_fallo_de_un_modelo_se_propaga_con_el_error_del_puerto(
    fabrica: Callable[..., Adaptadores],
) -> None:
    with pytest.raises(FalloDeInferencia):
        fabrica(rompe="embeddings").consulta.embeber(Q_HER2)
    with pytest.raises(FalloDeInferencia):
        fabrica(rompe="embeddings").pasajes.embeber([Q_HER2])
    with pytest.raises(FalloDeInferencia):
        fabrica(rompe="reranker").reranker.puntuar(Q_HER2, _candidatos())


def _sin_evidencia_el_puntaje_maximo_es_null_y_nunca_cero(
    fabrica: Callable[..., Adaptadores],
) -> None:
    adaptadores = fabrica()
    entorno = crear_entorno(
        embedder=adaptadores.consulta,  # type: ignore[arg-type]
        reranker=adaptadores.reranker,  # type: ignore[arg-type]
        detector_idioma=adaptadores.detector,  # type: ignore[arg-type]
    )

    respuesta = entorno.consultar(solicitud_de(Q_SIN))

    assert respuesta.status_code == 200
    assert_matches_spec(RESPUESTA, respuesta.json())
    assert respuesta.json()["status"] == "sin_evidencia"
    assert respuesta.json()["topRelevanceScore"] is None


BATERIA: Sequence[Callable[..., None]] = (
    _la_consulta_devuelve_floats_y_declara_su_modelo,
    _los_pasajes_devuelven_un_vector_por_texto_en_el_mismo_orden,
    _el_reranker_devuelve_un_puntaje_por_candidato_en_cero_uno_y_nunca_none,
    _mas_pares_que_el_maximo_falla_con_el_error_del_puerto,
    _el_detector_devuelve_es_o_en,
    _el_fallo_de_un_modelo_se_propaga_con_el_error_del_puerto,
    _sin_evidencia_el_puntaje_maximo_es_null_y_nunca_cero,
)


@pytest.mark.ac("US-231a", 5)
@pytest.mark.parametrize("fabrica", list(FABRICAS.values()), ids=list(FABRICAS))
@pytest.mark.parametrize("verificacion", BATERIA, ids=[v.__name__.strip("_") for v in BATERIA])
def test_la_misma_bateria_pasa_sobre_el_adapter_real_y_sobre_el_fake(
    fabrica: Callable[..., Adaptadores], verificacion: Callable[..., None]
) -> None:
    verificacion(fabrica)


@pytest.mark.ac("US-231a", 5)
@pytest.mark.parametrize("fabrica", [_reales, _fakes], ids=["real-con-sesion-falsa", "fake"])
@pytest.mark.parametrize("modelo_roto", ["embeddings", "reranker"])
def test_el_fallo_de_un_modelo_llega_a_rag_query_como_503_retrieval_unavailable_en_real_y_en_fake(
    fabrica: Callable[..., Adaptadores], modelo_roto: str
) -> None:
    adaptadores = fabrica(rompe=modelo_roto)
    entorno = crear_entorno(
        embedder=adaptadores.consulta,  # type: ignore[arg-type]
        reranker=adaptadores.reranker,  # type: ignore[arg-type]
        detector_idioma=adaptadores.detector,  # type: ignore[arg-type]
    )

    respuesta = entorno.consultar(solicitud_de(Q_HER2))

    assert respuesta.status_code == 503
    assert_matches_spec(RESPUESTA_503, respuesta.json())
    assert respuesta.json()["error"] == "RETRIEVAL_UNAVAILABLE"
    assert entorno.generador.invocaciones == 0
    assert "fallo" not in respuesta.text and Q_HER2 not in respuesta.text
