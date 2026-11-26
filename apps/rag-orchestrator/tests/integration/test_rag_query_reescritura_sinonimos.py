"""`POST /rag/query` con la reescritura sobre el catálogo ampliado de sinónimos (US-277 / L1D-335, `[S7 resp. 2]`).

Catálogo real (el del manifiesto montado) o de prueba en ``tmp_path``; ``QueryRewriter``, Milvus y reranker fingidos en su puerto sobre FX-06a-a.
Cada respuesta la valida contra el spec del proveedor el hook de ``verificacion_proveedor.py`` (US-214).
"""

from __future__ import annotations

import json
from collections.abc import Sequence
from pathlib import Path

import pytest

from app.infrastructure.catalogo_clinico.sinonimos import cargar_terminos_del_catalogo
from tests.support.contract import CATALOGOS
from tests.support.recuperacion import (
    PUNTAJES_FX06A,
    EmbedderFalso,
    RerankerFalso,
    _vector,
    crear_entorno,
    solicitud_de,
)
from tests.support.reescritura import ReescritorFalso, parametros_de_reescritura

# Pregunta coloquial: no nombra el procedimiento con su término técnico, así que el primer loop (TOP_K = 1) solo ve el
# chunk de inyección (0,08, bajo el umbral 0,30). Con el término técnico agregado, el vector acerca ``ch-m1-1``.
Q_COLOQUIAL = (
    "¿Qué describe la evidencia sobre quitarse toda la mama en cáncer de mama HER2 positivo?"
)
Q_SIN_RESPUESTA = "¿Qué describe la evidencia sobre sarcoma sinovial en cáncer de mama?"
TERMINO_EQUIVALENTE = "mastectomy"
TERMINO_FUERA_DEL_CATALOGO = "farmaco-inventado-x"

_PUNTAJES = {
    **PUNTAJES_FX06A,
    Q_COLOQUIAL: {"ch-m1-1": 0.74, "ch-inj-1": 0.08},
    Q_SIN_RESPUESTA: {"ch-m1-1": 0.10, "ch-inj-1": 0.08},
}


class _EmbedderDeSinonimos(EmbedderFalso):
    def embeber(self, texto: str) -> Sequence[float]:
        if texto == Q_COLOQUIAL or texto == Q_SIN_RESPUESTA:
            self.textos.append(texto)
            return _vector(e5=1.0)
        if texto.startswith(Q_COLOQUIAL) and TERMINO_EQUIVALENTE in texto:
            self.textos.append(texto)
            return _vector(e0=1.0)
        if texto.startswith(Q_COLOQUIAL) or texto.startswith(Q_SIN_RESPUESTA):
            self.textos.append(texto)
            return _vector(e6=1.0)
        return super().embeber(texto)


def _entorno(catalogo: Path, propuestos: Sequence[str]):
    reescritor = ReescritorFalso(propuestos)
    reranker = RerankerFalso(_PUNTAJES)
    embedder = _EmbedderDeSinonimos()
    entorno = crear_entorno(
        parametros=parametros_de_reescritura(),
        embedder=embedder,
        reranker=reranker,
        reescritor=reescritor,
        terminos_del_catalogo=cargar_terminos_del_catalogo(catalogo, ("mama", "prostata")),
    )
    return entorno, reescritor, reranker, embedder


def _del_segundo_loop(embedder: EmbedderFalso) -> list[str]:
    """Los textos de búsqueda embebidos tras el primer loop (el primero es la pregunta; el último, el contexto)."""
    return [t for t in embedder.textos[1:] if t.startswith(Q_COLOQUIAL)]


def _catalogo_de_prueba(raiz: Path) -> Path:
    for tipo, items in (
        (
            "mama",
            [
                {
                    "terminoCanonico": "mastectomía",
                    "sinonimos": [
                        {"texto": "mastectomy", "idioma": "en", "relacion": "equivalente"},
                        {
                            "texto": "mastectomía total",
                            "idioma": "es",
                            "relacion": "miembro_de_clase",
                        },
                        {"texto": "cirugía de mama", "idioma": "es", "relacion": "mas_amplio"},
                    ],
                }
            ],
        ),
        ("prostata", []),
    ):
        (raiz / tipo).mkdir(parents=True)
        (raiz / tipo / "sinonimos.json").write_text(
            json.dumps({"version": "1.0.0", "items": items}), encoding="utf-8"
        )
    return raiz


@pytest.mark.ac("US-277", 2)
def test_rag_query_expande_con_el_termino_tecnico_del_catalogo_cuando_la_pregunta_coloquial_deja_vacio_el_primer_loop():
    entorno, reescritor, reranker, embedder = _entorno(CATALOGOS, [TERMINO_EQUIVALENTE])

    respuesta = entorno.consultar(solicitud_de(Q_COLOQUIAL))

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert reescritor.invocaciones == 1
    assert cuerpo["status"] == "con_evidencia"
    assert cuerpo["evidenceOptions"][0]["citedSources"][0]["chunkId"] == "ch-m1-1"
    assert _del_segundo_loop(embedder) == [f"{Q_COLOQUIAL} {TERMINO_EQUIVALENTE}"]
    assert reranker.preguntas == [Q_COLOQUIAL, Q_COLOQUIAL]


@pytest.mark.ac("US-277", 4)
def test_rag_query_descarta_el_termino_fuera_del_catalogo_y_puntua_contra_la_pregunta_original():
    entorno, _, reranker, embedder = _entorno(
        CATALOGOS, [TERMINO_FUERA_DEL_CATALOGO, TERMINO_EQUIVALENTE]
    )

    respuesta = entorno.consultar(solicitud_de(Q_COLOQUIAL))

    assert respuesta.status_code == 200
    assert _del_segundo_loop(embedder) == [f"{Q_COLOQUIAL} {TERMINO_EQUIVALENTE}"]
    assert TERMINO_FUERA_DEL_CATALOGO not in " ".join(embedder.textos)
    assert set(reranker.preguntas) == {Q_COLOQUIAL}


@pytest.mark.ac("US-277", 4)
def test_rag_query_no_admite_un_termino_que_solo_es_mas_amplio_o_miembro_de_clase(
    tmp_path: Path,
):
    entorno, reescritor, reranker, embedder = _entorno(
        _catalogo_de_prueba(tmp_path), ["mastectomía total", "cirugía de mama"]
    )

    respuesta = entorno.consultar(solicitud_de(Q_COLOQUIAL))

    cuerpo = respuesta.json()
    assert respuesta.status_code == 200 and reescritor.invocaciones == 1
    # ningún término admitido: lo que se embebe tras el primer loop es la pregunta original, sin términos agregados
    assert all(texto == Q_COLOQUIAL for texto in _del_segundo_loop(embedder))
    assert "mastectomia total" not in " ".join(embedder.textos)
    assert "cirugia de mama" not in " ".join(embedder.textos)
    assert cuerpo["status"] == "sin_evidencia" and cuerpo["topRelevanceScore"] is None
    assert set(reranker.preguntas) == {Q_COLOQUIAL}


@pytest.mark.ac("US-277", 3)
def test_rag_query_no_invoca_la_reescritura_cuando_el_primer_loop_deja_chunks_sobre_el_umbral():
    entorno, reescritor, _, _ = _entorno(CATALOGOS, [TERMINO_EQUIVALENTE])

    respuesta = entorno.consultar(solicitud_de())  # Q_HER2: el primer loop supera el umbral

    cuerpo = respuesta.json()
    assert respuesta.status_code == 200 and cuerpo["status"] == "con_evidencia"
    assert reescritor.invocaciones == 0
    assert cuerpo["meta"]["retrievalParams"]["queryRewrite"] == {
        "applied": False,
        "reason": "no_disparado",
    }


@pytest.mark.ac("US-277", 3)
def test_rag_query_responde_sin_evidencia_con_top_relevance_score_null_y_sin_generacion_cuando_el_segundo_loop_queda_vacio():
    entorno, reescritor, _, _ = _entorno(CATALOGOS, [TERMINO_EQUIVALENTE])

    respuesta = entorno.consultar(solicitud_de(Q_SIN_RESPUESTA))

    cuerpo = respuesta.json()
    assert respuesta.status_code == 200 and cuerpo["status"] == "sin_evidencia"
    assert cuerpo["topRelevanceScore"] is None
    assert cuerpo["evidenceOptions"] == []
    assert entorno.generador.invocaciones == 0
    assert reescritor.invocaciones == 1
