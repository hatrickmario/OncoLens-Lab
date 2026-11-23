"""Ventanas del reranker en ``/rag/query`` (US-278 AC-1, AC-2, AC-3, AC-6; RN-02, RN-03, RN-22, RN-28).

``BgeReranker`` real sobre una sesión de logits por marcas y un tokenizador de una palabra por token: el borde es la
sesión de inferencia. Cada respuesta se valida contra ``openapi.yaml`` con el hook de verificación del proveedor
(US-214, ``conftest.py``): sin campos fuera del spec, con ``primera`` y con ``maximo`` (task 1.4b).
"""

from __future__ import annotations

import math

import pytest
from pydantic import ValidationError

from app.config.errores_de_configuracion import describir_errores
from app.config.settings import Settings
from tests.support.inferencia_falsa import id_de_palabra
from tests.support.modelos import CLAVES_ADR39_DE_PRUEBA
from tests.support.recuperacion import Q_HER2, EntornoDeRecuperacion, solicitud_de
from tests.support.ventanas_del_reranker import (
    EVIDENCIA,
    MAX_LENGTH,
    VERSION,
    SesionPorMarcas,
    chunk_largo,
    entorno_con,
    relleno,
    reranker_de_ventanas,
)

TEXTO_LARGO = f"{relleno('a', 30)} {EVIDENCIA}"  # 39 tokens de pasaje; con capacidad 13 y solape 3: 4 ventanas
VENTANAS_DEL_TEXTO_LARGO = 4

# Capturados de ``main`` antes del cambio, con ``TEXTO_LARGO`` y un chunk corto, sin ``RERANKER_CHUNK_WINDOWS``.
SECUENCIA_CORTA_DE_MAIN = [0, 63458, 96553, 18273, 98965, 30269, 29279, 80272, 88324, 99822, 46356, 78770, 76894, 45669, 8804, 47712, 2, 2, 29279, 80272, 88324, 99822, 46356, 78770, 2]  # fmt: skip
SECUENCIA_LARGA_DE_MAIN = [0, 63458, 96553, 18273, 98965, 30269, 29279, 80272, 88324, 99822, 46356, 78770, 76894, 45669, 8804, 47712, 2, 2, 89016, 3398, 28828, 11698, 19855, 73053, 59267, 50105, 80810, 17428, 92318, 71024, 68570, 2]  # fmt: skip
PUNTAJE_DEL_CHUNK_CORTO_DE_MAIN = 0.9241418199787566
PROCEDENCIA_DE_MAIN = f"BAAI/bge-reranker-v2-m3@rev-ventanas-test#sha256:{'c' * 64}"


def _sigmoide(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))


def _puntajes_sobre_el_umbral(entorno: EntornoDeRecuperacion) -> list[tuple[str, float]]:
    return [
        (c.chunk_id, c.relevance_score)
        for r in entorno.generador.recuperaciones
        for c in r.chunks_sobre_umbral
    ]


def _pasaje_de(secuencia: list[int]) -> list[int]:
    """Los ids del pasaje: lo que sigue a los dos separadores de la pregunta, sin el separador final."""
    return secuencia[secuencia.index(2) + 2 : -1]


@pytest.mark.ac("US-278", 1)
def test_el_relevance_score_del_chunk_largo_es_el_de_su_ventana_de_mayor_puntaje_y_las_ventanas_lo_cubren_entero_cuando_el_modo_es_maximo():
    sesion = SesionPorMarcas({"IIA": 2.5})  # solo la última ventana contiene la marca
    entorno = entorno_con(
        [chunk_largo("ch-largo-a", "doc-m1", TEXTO_LARGO)],
        reranker_de_ventanas(sesion, "maximo"),
    )

    respuesta = entorno.consultar(solicitud_de(Q_HER2))

    assert respuesta.status_code == 200
    secuencias = sesion.secuencias
    assert len(secuencias) == VENTANAS_DEL_TEXTO_LARGO
    assert all(len(s) <= MAX_LENGTH for s in secuencias)
    cubiertos = {i for s in secuencias for i in _pasaje_de(s)}
    assert cubiertos == {id_de_palabra(p) for p in TEXTO_LARGO.split()}
    assert _puntajes_sobre_el_umbral(entorno) == [("ch-largo-a", pytest.approx(_sigmoide(2.5)))]
    assert respuesta.json()["topRelevanceScore"] == pytest.approx(_sigmoide(2.5))


@pytest.mark.ac("US-278", 2)
def test_el_reranker_envia_una_secuencia_por_candidato_con_los_puntajes_y_la_procedencia_de_main_cuando_no_se_define_el_modo():
    sesion = SesionPorMarcas({"HER2": 2.5})
    entorno = entorno_con(
        [
            chunk_largo("ch-largo-a", "doc-m1", TEXTO_LARGO, 1.0),
            chunk_largo("ch-corto-b", "doc-m1-v0", "evidencia para cáncer de mama HER2", 0.9),
        ],
        reranker_de_ventanas(sesion),  # sin modo: el que traen los valores por defecto
    )

    respuesta = entorno.consultar(solicitud_de(Q_HER2))

    assert respuesta.status_code == 200
    assert sesion.secuencias == [SECUENCIA_CORTA_DE_MAIN, SECUENCIA_LARGA_DE_MAIN]
    assert _puntajes_sobre_el_umbral(entorno) == [("ch-corto-b", PUNTAJE_DEL_CHUNK_CORTO_DE_MAIN)]
    cuerpo = respuesta.json()
    assert cuerpo["topRelevanceScore"] == PUNTAJE_DEL_CHUNK_CORTO_DE_MAIN
    assert cuerpo["meta"]["rerankerModel"] == PROCEDENCIA_DE_MAIN == VERSION


@pytest.mark.ac("US-278", 2)
def test_el_arranque_toma_primera_y_el_solape_inicial_cuando_el_entorno_no_define_las_claves(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("RERANKER_CHUNK_WINDOWS", raising=False)
    monkeypatch.delenv("RERANKER_WINDOW_OVERLAP", raising=False)

    ajustes = Settings(_env_file=None)  # type: ignore[call-arg]

    assert ajustes.reranker_chunk_windows == "primera"
    assert ajustes.reranker_window_overlap == 64


@pytest.mark.ac("US-278", 2)
@pytest.mark.parametrize(
    ("entorno", "variable"),
    [
        ({"RERANKER_CHUNK_WINDOWS": "promedio"}, "RERANKER_CHUNK_WINDOWS"),
        (
            {
                **CLAVES_ADR39_DE_PRUEBA,
                "MODEL_CACHE_DIR": "/modelos",
                "DATA_CACHE_DIR": "/modelos",
                "RERANKER_WINDOW_OVERLAP": "512",
            },
            "RERANKER_WINDOW_OVERLAP",
        ),
    ],
    ids=["modo-fuera-del-conjunto", "solape-igual-que-RERANKER_MAX_LENGTH"],
)
def test_el_arranque_falla_nombrando_la_clave_y_no_su_valor_cuando_la_configuracion_de_ventanas_es_invalida(
    monkeypatch: pytest.MonkeyPatch, entorno: dict[str, str], variable: str
) -> None:
    for nombre, valor in entorno.items():
        monkeypatch.setenv(nombre, valor)

    with pytest.raises(ValidationError) as error:
        Settings(_env_file=None)  # type: ignore[call-arg]

    eventos = describir_errores(error.value)
    assert variable in {e.get("variable") for e in eventos} | {
        e["regla"].split(":")[0] for e in eventos
    }
    assert "promedio" not in str(eventos)


@pytest.mark.ac("US-278", 3)
def test_dos_chunks_con_el_mismo_maximo_se_ordenan_por_chunk_id_y_el_puntaje_no_depende_del_lote_cuando_el_modo_es_maximo():
    marcas = {
        "marcaalfa": 2.5,
        "marcabeta": 2.5,
    }  # alfa en la última ventana de a, beta en la segunda de b
    texto_a = f"{relleno('a', 36)} marcaalfa"
    texto_b = f"{relleno('b', 15)} marcabeta {relleno('c', 21)}"
    chunks = [
        chunk_largo("ch-larga-b", "doc-m1", texto_b, 1.0),  # el más cercano en la recuperación
        chunk_largo("ch-larga-a", "doc-m1-v0", texto_a, 0.9),
    ]

    resultados = []
    for presupuesto in (4096, 40):  # 40 = una ventana por lote
        entorno = entorno_con(
            chunks,
            reranker_de_ventanas(
                SesionPorMarcas(marcas), "maximo", max_tokens_por_lote=presupuesto
            ),
        )
        assert entorno.consultar(solicitud_de(Q_HER2)).status_code == 200
        resultados.append(_puntajes_sobre_el_umbral(entorno))

    esperado = [
        ("ch-larga-a", pytest.approx(_sigmoide(2.5))),
        ("ch-larga-b", pytest.approx(_sigmoide(2.5))),
    ]
    assert resultados == [esperado, esperado]
    assert resultados[0][0][1] == resultados[0][1][1] == resultados[1][0][1]


@pytest.mark.ac("US-278", 6)
@pytest.mark.parametrize(
    ("modo", "secuencias_esperadas"),
    [("maximo", VENTANAS_DEL_TEXTO_LARGO), ("primera", 1)],
)
def test_rag_query_responde_sin_evidencia_con_top_null_y_sin_llamar_al_llm_cuando_ninguna_ventana_supera_el_umbral(
    modo: str, secuencias_esperadas: int
) -> None:
    sesion = SesionPorMarcas()  # todas las ventanas puntúan LOGIT_BAJO: sigmoide(-4) < 0,30
    entorno = entorno_con(
        [chunk_largo("ch-largo-a", "doc-m1", TEXTO_LARGO)],
        reranker_de_ventanas(sesion, modo),  # type: ignore[arg-type]
    )

    respuesta = entorno.consultar(solicitud_de(Q_HER2))

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["status"] == "sin_evidencia"
    assert cuerpo["topRelevanceScore"] is None
    assert entorno.generador.invocaciones == 0
    assert len(sesion.secuencias) == secuencias_esperadas
