"""Salidas con términos prohibidos (RN-23): en la propuesta cruda del generador y en la salida mostrada (meta: 0)."""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from typing import Any

from app.domain.support import CampoGenerado
from app.prompts.rag_query import FORMULA_DE_ATRIBUCION
from app.evaluation.lenguaje_estricto import VerificadorEstricto
from app.evaluation.metricas.resultado import LenguajeCrudo, ResultadoConsulta

TextoGenerado = tuple[CampoGenerado, str]


def contar_salidas_con_terminos(
    textos: Iterable[TextoGenerado], verificador: VerificadorEstricto
) -> int:
    """Cuántos campos generados traen al menos un término de los niveles A o B (cada campo cuenta una vez)."""
    return sum(verificador.contiene_terminos(texto, campo) for campo, texto in textos)


def cumple_formula_de_atribucion(texto: str) -> bool:
    """El texto abre atribuyendo lo que sigue a la fuente («La fuente [cita] describe que…»)."""
    return FORMULA_DE_ATRIBUCION.match(texto) is not None


def medir_propuesta_cruda(
    textos: Iterable[TextoGenerado],
    justificaciones: Sequence[str],
    textos_del_corpus_citado: Iterable[str],
    verificador: VerificadorEstricto,
) -> LenguajeCrudo:
    """Qué términos de la lista trae lo que el generador propuso y cuáles copió del corpus que cita (AC-3, AC-4)."""
    ids_del_corpus = {
        c.id for texto in textos_del_corpus_citado for c in verificador.coincidencias_en(texto)
    }
    ids_a: set[str] = set()
    ids_b: set[str] = set()
    campos_a = campos_b = con_termino = reproducen = 0
    for campo, texto in textos:
        coincidencias = verificador.coincidencias_generadas(texto, campo)
        de_a = {c.id for c in coincidencias if c.nivel == "A"}
        de_b = {c.id for c in coincidencias if c.nivel == "B"}
        ids_a |= de_a
        ids_b |= de_b
        campos_a += bool(de_a)
        campos_b += bool(de_b)
        con_termino += bool(de_a or de_b)
        reproducen += bool((de_a | de_b) & ids_del_corpus)
    return LenguajeCrudo(
        campos_nivel_a=campos_a,
        campos_nivel_b=campos_b,
        campos_con_termino=con_termino,
        reproducen_corpus=reproducen,
        ids_nivel_a=frozenset(ids_a),
        ids_nivel_b=frozenset(ids_b),
        opciones=len(justificaciones),
        opciones_con_formula=sum(cumple_formula_de_atribucion(j) for j in justificaciones),
    )


def terminos_prohibidos(resultados: Sequence[ResultadoConsulta]) -> dict[str, Any]:
    crudos = [r.lenguaje_crudo for r in resultados]
    return {
        "propuesta_cruda": sum(r.salidas_prohibidas_crudas for r in resultados),
        "salida_mostrada": sum(r.salidas_prohibidas_mostradas for r in resultados),
        "propuesta_cruda_por_nivel": {
            "A": sum(c.campos_nivel_a for c in crudos),
            "B": sum(c.campos_nivel_b for c in crudos),
        },
        "terminos_compartidos_con_corpus_citado": sum(c.reproducen_corpus for c in crudos),
        "terminos_nivel_a": sorted(frozenset().union(*(c.ids_nivel_a for c in crudos))),
        "terminos_nivel_b": sorted(frozenset().union(*(c.ids_nivel_b for c in crudos))),
        "atribucion": {
            "opciones": sum(c.opciones for c in crudos),
            "con_formula": sum(c.opciones_con_formula for c in crudos),
        },
    }
