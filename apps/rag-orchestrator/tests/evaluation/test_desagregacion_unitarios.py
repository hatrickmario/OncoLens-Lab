"""Desagregación del baseline por tipo de cáncer e idioma y mediana del p95 (US-120 AC-6): reglas puras, sin adapters."""

from __future__ import annotations

from collections.abc import Sequence

from app.evaluation.desagregacion import agregar_por_tipo_e_idioma, mediana_de_p95
from app.evaluation.metricas.resultado import ResultadoConsulta
from app.evaluation.retrieval_metrics import ResultadoPregunta

TIPOS = ("mama", "prostata")


def consulta(
    identificador: str, cancer: str, idioma: str, *, es_a_en: bool = False
) -> ResultadoConsulta:
    return ResultadoConsulta(
        recuperacion=ResultadoPregunta(
            id=identificador,
            modo="cualquiera",
            idioma=idioma,
            es_es_en=es_a_en,
            es_control=False,
            cancer=cancer,
            tipo="guia",
            documentos=(),
            recall=1.0,
            rr=1.0,
            puntaje_maximo=None,
        ),
        revisada=False,
        esperaba_sin_evidencia=False,
        sin_evidencia=False,
        generador_invocado=True,
        top_relevance_score=0.9,
        citas_propuestas=0,
        citas_validas=0,
        opciones_mostradas=0,
        opciones_descartadas=0,
    )


def contar(resultados: Sequence[ResultadoConsulta]) -> dict[str, float | None]:
    """Una métrica trazable a mano: cuántas consultas cayeron en la celda."""
    return {"consultas": float(len(resultados))}


def test_cada_celda_agrupa_las_consultas_de_su_tipo_e_idioma() -> None:
    resultados = [
        consulta("a", "mama", "es", es_a_en=True),
        consulta("b", "mama", "es"),
        consulta("c", "mama", "en"),
        consulta("d", "prostata", "en"),
    ]

    celdas = agregar_por_tipo_e_idioma(resultados, TIPOS, contar)

    assert celdas["mama"] == {
        "es": {"consultas": 2.0},
        "en": {"consultas": 1.0},
        "es_a_en": {"consultas": 1.0},
    }
    assert celdas["prostata"]["en"] == {"consultas": 1.0}


def test_una_celda_sin_consultas_es_none_y_no_cero() -> None:
    resultados = [consulta("a", "mama", "es")]

    celdas = agregar_por_tipo_e_idioma(resultados, TIPOS, contar)

    assert celdas["mama"]["en"] is None
    assert celdas["prostata"] == {"es": None, "en": None, "es_a_en": None}


def test_una_consulta_de_un_tipo_ajeno_a_los_pedidos_no_entra_en_ninguna_celda() -> None:
    celdas = agregar_por_tipo_e_idioma([consulta("a", "leucemia", "es")], TIPOS, contar)

    assert set(celdas) == set(TIPOS)
    assert all(celda is None for por_idioma in celdas.values() for celda in por_idioma.values())


def test_la_mediana_del_p95_es_el_valor_central_de_las_corridas() -> None:
    assert mediana_de_p95([3.0, 1.0, 2.0]) == 2.0


def test_la_mediana_de_un_numero_par_de_corridas_promedia_las_dos_centrales() -> None:
    assert mediana_de_p95([1.0, 4.0]) == 2.5


def test_la_mediana_ignora_las_corridas_sin_p95_y_es_none_si_ninguna_lo_midio() -> None:
    assert mediana_de_p95([None, 5.0, None]) == 5.0
    assert mediana_de_p95([None, None]) is None
    assert mediana_de_p95([]) is None
