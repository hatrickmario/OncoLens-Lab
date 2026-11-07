"""Bloques ``documentado`` del chat (US-261 AC-1, ADR-34): reglas puras, sin E/S.

El LLM solo elige los ``factRef`` que quiere citar; el texto de cada bloque lo escribe el código con ``describir_hecho``,
byte a byte. Un bloque por hecho (cada uno enlaza un único dato del paciente) y la secuencia sale del dato, no del LLM:
orden ascendente de día relativo, un hecho sin fecha confiable al final y, a igual día, el orden de los hechos del turno.
"""

from __future__ import annotations

from collections.abc import Sequence

from app.domain.chat.descripcion_de_hechos import describir_hecho
from app.domain.chat.enlaces_del_caso import clave_de_dia
from app.domain.chat.turno import BloqueDelTurno, HechoDelCaso, TipoDeBloque


def bloques_documentados(
    fact_refs: Sequence[str], hechos: Sequence[HechoDelCaso]
) -> tuple[BloqueDelTurno, ...]:
    """Un bloque ``documentado`` por hecho citado (sin repetir), con la descripción determinista del hecho como texto.

    Un ``factRef`` que no es de los hechos del turno es un error de programación (el nodo ya omitió esas afirmaciones)."""
    posicion = {h.ref: i for i, h in enumerate(hechos)}
    citados = [hechos[posicion[ref]] for ref in dict.fromkeys(fact_refs)]
    citados.sort(key=lambda h: (clave_de_dia(h.dia_relativo), posicion[h.ref]))
    return tuple(
        BloqueDelTurno(TipoDeBloque.documentado, describir_hecho(h), (h.ref,)) for h in citados
    )
