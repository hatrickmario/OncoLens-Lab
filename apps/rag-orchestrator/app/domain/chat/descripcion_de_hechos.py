"""Descripción determinista de los hechos del caso (US-260, ADR-34): reglas puras, sin E/S.

``describir_hecho`` es el único dueño de la frase con que un hecho se presenta al LLM (línea del prompt) y se verifica
(premisa del NLI): una frase completa con el valor y su momento respecto del diagnóstico. Así lo que el prompt pide escribir
está en la premisa, y una afirmación idéntica a la descripción de sus hechos queda soportada por identidad (entailment
trivial) sin invocar al NLI; toda paráfrasis sigue pasando por él.

El estado de revisión solo se escribe cuando exige cautela (``requiere_revision`` o un conflicto vigente): ``auto_aceptado``
NO cuenta como «sin verificar» (decisión de L1D-317, alineada con ``etiqueta_de_procedencia`` de RN-07), y el enum crudo
nunca llega al texto.
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Sequence

from app.domain.chat.turno import HechoDelCaso
from app.domain.lenguaje import sin_tildes

SEPARADOR_DE_FRASES = " "
ESTADO_REQUIERE_REVISION = "requiere_revision"
TEXTO_REQUIERE_REVISION = "requiere revisión"
TEXTO_EN_CONFLICTO = "en conflicto con otro dato"
TEXTO_SIN_FECHA = "sin fecha confiable"
TEXTO_AL_DIAGNOSTICO = "al momento del diagnóstico"
_MOMENTO_RELATIVO = re.compile(r"(?<!\w)(\d+)\s*dias?\s+(antes|despues)\b")
"""Forma de ``_dias_antes_o_despues`` sobre el texto sin tildes: «N día(s) antes|después del diagnóstico»."""


def describir_hecho(hecho: HechoDelCaso) -> str:
    """La frase completa del hecho: su verbalización, su momento y, solo si exige cautela, su estado de revisión."""
    partes = [_con_mayuscula_inicial(hecho.verbalizacion.strip().rstrip(".")), _momento_de(hecho)]
    if hecho.dia_relativo_fin is not None:
        partes.append(_fin_de(hecho.dia_relativo_fin))
    if hecho.estado_de_revision == ESTADO_REQUIERE_REVISION:
        partes.append(TEXTO_REQUIERE_REVISION)
    if hecho.conflicto_con is not None:
        partes.append(TEXTO_EN_CONFLICTO)
    return f"{', '.join(partes)}."


def describir_hechos(fact_refs: Sequence[str], hechos: Sequence[HechoDelCaso]) -> str:
    """Las frases de los hechos citados en el orden de la cita y sin repetir: la premisa del NLI (ADR-34)."""
    por_ref = {h.ref: h for h in hechos}
    return SEPARADOR_DE_FRASES.join(describir_hecho(por_ref[r]) for r in dict.fromkeys(fact_refs))


def es_la_descripcion_de(
    texto: str, fact_refs: Sequence[str], hechos: Sequence[HechoDelCaso]
) -> bool:
    """``True`` si el texto es la descripción de esos hechos salvo NFC, espacios, mayúsculas y punto final.

    Identidad implica entailment: es el único atajo lógico sobre el NLI (ADR-34); una paráfrasis no lo cumple."""
    return _normalizado(texto) == _normalizado(describir_hechos(fact_refs, hechos))


def sentidos_del_momento(texto: str) -> set[tuple[int, str]]:
    """Los «N días antes/después» que escribe un texto como (N, ``antes`` | ``despues``): lee el formato de ``_dias_antes_o_despues``
    (el del momento de inicio y el del fin del intervalo) y no distingue tildes ni mayúsculas."""
    return {(int(dias), sentido) for dias, sentido in _MOMENTO_RELATIVO.findall(sin_tildes(texto))}


def _momento_de(hecho: HechoDelCaso) -> str:
    dia = hecho.dia_relativo
    if dia is None:
        return TEXTO_SIN_FECHA  # nunca «día 0»: sin fecha confiable no hay momento
    return TEXTO_AL_DIAGNOSTICO if dia == 0 else _dias_antes_o_despues(dia)


def _fin_de(dia: int) -> str:
    """El fin de un hecho con intervalo: «hasta N días antes del diagnóstico» (misma forma que el momento)."""
    return "hasta el momento del diagnóstico" if dia == 0 else f"hasta {_dias_antes_o_despues(dia)}"


def _dias_antes_o_despues(dia: int) -> str:
    """«N día(s) antes|después del diagnóstico»: el único escritor de la forma que lee ``sentidos_del_momento``."""
    unidad = "día" if abs(dia) == 1 else "días"
    sentido = "después" if dia > 0 else "antes"
    return f"{abs(dia)} {unidad} {sentido} del diagnóstico"


def _con_mayuscula_inicial(texto: str) -> str:
    return texto[:1].upper() + texto[1:]


def _normalizado(texto: str) -> str:
    unido = " ".join(unicodedata.normalize("NFC", texto).split())
    return unido.rstrip(".").casefold()
