"""Desagregación del baseline por tipo de cáncer e idioma y mediana del p95 (US-120 AC-6, M-06.1, M-06.2).

Reglas puras: reciben los resultados por consulta (solo números y banderas, RN-14) y la función que mide una celda; no leen
archivos ni conocen la suite.
"""

from __future__ import annotations

import statistics
from collections.abc import Callable, Mapping, Sequence

from app.evaluation.metricas.resultado import ResultadoConsulta

IDIOMA_ES = "es"
IDIOMA_EN = "en"
IDIOMA_ES_A_EN = "es_a_en"
IDIOMAS_DEL_BASELINE = (IDIOMA_ES, IDIOMA_EN, IDIOMA_ES_A_EN)
ETIQUETA_DE_IDIOMA = {IDIOMA_ES: "es", IDIOMA_EN: "en", IDIOMA_ES_A_EN: "es→en"}

Medida = Mapping[str, float | None]
Celdas = dict[str, dict[str, Medida | None]]


def _es_del_idioma(resultado: ResultadoConsulta, idioma: str) -> bool:
    if idioma == IDIOMA_ES_A_EN:
        return resultado.recuperacion.es_es_en
    return resultado.recuperacion.idioma == idioma


def agregar_por_tipo_e_idioma(
    resultados: Sequence[ResultadoConsulta],
    tipos: Sequence[str],
    medir: Callable[[Sequence[ResultadoConsulta]], Medida],
) -> Celdas:
    """Una celda por tipo de cáncer e idioma (``es``, ``en`` y ``es_a_en``, subconjunto de las consultas en español contra el
    corpus en inglés). Una celda sin consultas es ``None`` («no medida»), nunca ``0.0``."""
    celdas: Celdas = {}
    for tipo in tipos:
        del_tipo = [r for r in resultados if r.recuperacion.cancer == tipo]
        celdas[tipo] = {}
        for idioma in IDIOMAS_DEL_BASELINE:
            consultas = [r for r in del_tipo if _es_del_idioma(r, idioma)]
            celdas[tipo][idioma] = medir(consultas) if consultas else None
    return celdas


def mediana_de_p95(p95_por_corrida: Sequence[float | None]) -> float | None:
    """La mediana de los p95 de ``EVAL_P95_RUNS`` corridas; las que no midieron no cuentan y sin ninguna es ``None`` (≠ 0.0)."""
    medidos = [valor for valor in p95_por_corrida if valor is not None]
    return statistics.median(medidos) if medidos else None
