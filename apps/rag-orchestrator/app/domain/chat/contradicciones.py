"""Contradicciones del expediente en el chat (US-262, RN-08, AC-T3.2, RN-01): reglas puras, sin E/S ni LLM.

Backend 1 marca cada par de datos en conflicto con el ``factRef`` de su contraparte (``CaseFact.conflictWith``). Aquí:

- ``es_pregunta_de_contradicciones()``: la pregunta nombra un término fijo (sin LLM).
- ``pares_en_conflicto()`` y ``bloques_de_conflicto()``: un bloque ``conflicto`` por par, con la etiqueta de configuración,
  los dos valores tal como los describe ``describir_hecho`` (con su momento y su estado de revisión) y los ``factRef`` de
  ambos. El sistema nunca elige uno ni resuelve el conflicto: es decisión del oncólogo (RN-08).
- ``afirmaciones_que_resuelven_conflicto()``: las afirmaciones del LLM que enlazan a un hecho en conflicto sin su
  contraparte; el nodo ``caso`` las omite antes del NLI (la IA no resuelve).
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import replace

from app.domain.chat.descripcion_de_hechos import describir_hecho
from app.domain.chat.enlaces_del_caso import clave_de_dia
from app.domain.chat.turno import BloqueDelTurno, HechoDelCaso, PropuestaDelTurno, TipoDeBloque
from app.domain.lenguaje import normalizar_texto

SEPARADOR_DE_VALORES = " Frente a: "

_TERMINOS_DE_CONTRADICCION = re.compile(
    r"\bcontradic\w+|\binconsisten\w+|\bdiscrepan\w+|\bcorregid[oa]s?\b|\bcorreccion(?:es)?\b"
)
"""Sobre el texto normalizado (minúsculas, sin acentos ni signos): contradicción, inconsistencia, discrepancia, corregido
y corrección. «correcto» a secas no cuenta: pregunta por el valor, no por el conflicto."""


def es_pregunta_de_contradicciones(pregunta: str) -> bool:
    """``True`` si la pregunta pide las contradicciones o correcciones del expediente (regla léxica, sin LLM)."""
    return _TERMINOS_DE_CONTRADICCION.search(normalizar_texto(pregunta)) is not None


def pares_en_conflicto(
    hechos: Sequence[HechoDelCaso],
) -> tuple[tuple[HechoDelCaso, HechoDelCaso], ...]:
    """Cada par de datos en conflicto, una sola vez aunque ambos lo marquen, con el hecho de menor día relativo primero
    (uno sin fecha confiable, al final) y los pares en el mismo orden. Una marca cuya contraparte no está entre los hechos
    del turno no forma par: no habría dos valores que mostrar."""
    por_ref = {h.ref: h for h in hechos}
    vistos: set[frozenset[str]] = set()
    pares: list[tuple[HechoDelCaso, HechoDelCaso]] = []
    for hecho in hechos:
        otro = por_ref.get(hecho.conflicto_con) if hecho.conflicto_con is not None else None
        if otro is None or frozenset((hecho.ref, otro.ref)) in vistos:
            continue
        vistos.add(frozenset((hecho.ref, otro.ref)))
        primero, segundo = sorted((hecho, otro), key=_orden_de_aparicion)
        pares.append((primero, segundo))
    return tuple(sorted(pares, key=lambda par: _orden_de_aparicion(par[0])))


def bloques_de_conflicto(
    hechos: Sequence[HechoDelCaso], etiqueta: str
) -> tuple[BloqueDelTurno, ...]:
    """Un bloque ``conflicto`` por par: la etiqueta de configuración y los dos valores con su momento y su estado de
    revisión, sin elegir ninguno. Ambos ``factRef`` van en el bloque (RN-01): la UI enlaza cada valor a su fuente."""
    return tuple(
        BloqueDelTurno(
            TipoDeBloque.conflicto,
            f"{etiqueta}: {_valor_del_par(primero)}{SEPARADOR_DE_VALORES}{_valor_del_par(segundo)}",
            (primero.ref, segundo.ref),
        )
        for primero, segundo in pares_en_conflicto(hechos)
    )


def hechos_con_marca_sin_contraparte(hechos: Sequence[HechoDelCaso]) -> tuple[HechoDelCaso, ...]:
    """Los hechos marcados en conflicto cuya contraparte no está entre los del turno: no forman par, pero tampoco se
    puede decir que no hay contradicciones (RN-08): el turno lo declara."""
    refs = {h.ref for h in hechos}
    return tuple(h for h in hechos if h.conflicto_con is not None and h.conflicto_con not in refs)


def afirmaciones_que_resuelven_conflicto(
    propuestas: Sequence[PropuestaDelTurno], hechos: Sequence[HechoDelCaso]
) -> tuple[PropuestaDelTurno, ...]:
    """Las afirmaciones que enlazan a un hecho de un par en conflicto sin enlazar también a su contraparte: darían por
    bueno un valor y callarían el otro, y eso lo decide el oncólogo (AC-T3.2). Una que cita ambos valores no resuelve:
    sigue al chequeo numérico y al NLI como cualquier afirmación."""
    pares = pares_en_conflicto(hechos)
    return tuple(
        p
        for p in propuestas
        if any((a.ref in p.fact_refs) != (b.ref in p.fact_refs) for a, b in pares)
    )


def _valor_del_par(hecho: HechoDelCaso) -> str:
    """La descripción del hecho sin su marca «en conflicto con otro dato»: el bloque ya dice que es un par por conciliar."""
    return describir_hecho(replace(hecho, conflicto_con=None))


def _orden_de_aparicion(hecho: HechoDelCaso) -> tuple[tuple[int, int], str]:
    return clave_de_dia(hecho.dia_relativo), hecho.ref
