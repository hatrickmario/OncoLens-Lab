"""Salidas con términos prohibidos (RN-23): en la propuesta cruda del generador y en la salida mostrada (meta: 0)."""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from typing import Any

from app.domain.support import CampoGenerado
from app.evaluation.lenguaje_estricto import VerificadorEstricto
from app.evaluation.metricas.resultado import ResultadoConsulta

TextoGenerado = tuple[CampoGenerado, str]


def contar_salidas_con_terminos(
    textos: Iterable[TextoGenerado], verificador: VerificadorEstricto
) -> int:
    """Cuántos campos generados traen al menos un término de los niveles A o B (cada campo cuenta una vez)."""
    return sum(verificador.contiene_terminos(texto, campo) for campo, texto in textos)


def terminos_prohibidos(resultados: Sequence[ResultadoConsulta]) -> dict[str, Any]:
    return {
        "propuesta_cruda": sum(r.salidas_prohibidas_crudas for r in resultados),
        "salida_mostrada": sum(r.salidas_prohibidas_mostradas for r in resultados),
    }


def cumple_formula_de_atribucion(texto: str) -> bool:
    raise NotImplementedError("no implementado")
