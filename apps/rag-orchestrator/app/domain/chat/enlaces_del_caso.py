"""Enlaces de una afirmación del turno ``caso`` con los hechos del paciente (US-260, RN-01, ADR-34): reglas puras, sin E/S.

Una afirmación sobre el caso solo se muestra si enlaza al menos un hecho enviado en ESTE turno y todos los que enlaza son de
este turno; su premisa de NLI es la verbalización determinista de esos hechos, nunca el texto generado. El orden de una
serie (la evolución de un valor) lo decide el día relativo del dato, no el orden en que el LLM la escribió.
"""

from __future__ import annotations

from collections.abc import Collection, Mapping, Sequence

from app.domain.chat.turno import HechoDelCaso, PropuestaDelTurno

SEPARADOR_DE_PREMISAS = "; "
_SIN_FECHA = (1, 0)
"""Clave de orden de un dato sin fecha confiable: después de cualquier día conocido."""


def filtrar_afirmaciones_sin_enlace(
    propuestas: Sequence[PropuestaDelTurno], refs_del_turno: Collection[str]
) -> tuple[tuple[PropuestaDelTurno, ...], tuple[PropuestaDelTurno, ...]]:
    """(con enlace válido, sin enlace válido). Sin ``factRef`` o con alguno ajeno al turno no hay enlace: no llega al NLI."""
    con_enlace: list[PropuestaDelTurno] = []
    sin_enlace: list[PropuestaDelTurno] = []
    for propuesta in propuestas:
        enlaza = bool(propuesta.fact_refs) and all(r in refs_del_turno for r in propuesta.fact_refs)
        (con_enlace if enlaza else sin_enlace).append(propuesta)
    return tuple(con_enlace), tuple(sin_enlace)


def cabe_en_el_nli(texto: str, max_palabras: int) -> bool:
    """Una hipótesis más larga que el tope de palabras de la configuración haría fallar cerrado al NLI: se omite antes."""
    return len(texto.split()) <= max_palabras


def premisa_de_los_hechos(fact_refs: Sequence[str], hechos: Sequence[HechoDelCaso]) -> str:
    """La verbalización determinista de los hechos citados, en el orden de la cita y sin repetir (ADR-34)."""
    verbalizacion = {h.ref: h.verbalizacion for h in hechos}
    unicos = dict.fromkeys(fact_refs)
    return SEPARADOR_DE_PREMISAS.join(verbalizacion[r] for r in unicos)


def ordenar_series_por_dia_relativo(
    propuestas: Sequence[PropuestaDelTurno], hechos: Sequence[HechoDelCaso]
) -> tuple[PropuestaDelTurno, ...]:
    """Ordena los ``factRef`` de cada afirmación y las afirmaciones de una misma serie por día relativo ascendente.

    Las afirmaciones que no son de una serie conservan su lugar; las de una serie se reparten, ya ordenadas, entre los
    lugares que ocupaban. Un hecho sin fecha confiable (``None``) va al final: nunca se trata como día ``0``."""
    dias = {h.ref: h.dia_relativo for h in hechos}
    series = {h.ref: h.serie for h in hechos}
    ordenadas = [_con_refs_ordenados(p, dias) for p in propuestas]
    for lugares in _lugares_por_serie(ordenadas, series).values():
        miembros = sorted((ordenadas[i] for i in lugares), key=lambda p: _dia_de(p, dias))
        for lugar, miembro in zip(lugares, miembros, strict=True):
            ordenadas[lugar] = miembro
    return tuple(ordenadas)


def _con_refs_ordenados(
    propuesta: PropuestaDelTurno, dias: Mapping[str, int | None]
) -> PropuestaDelTurno:
    refs = tuple(sorted(propuesta.fact_refs, key=lambda r: _clave_de_dia(dias.get(r))))
    return PropuestaDelTurno(propuesta.texto, refs, propuesta.citas)


def _dia_de(propuesta: PropuestaDelTurno, dias: Mapping[str, int | None]) -> tuple[int, int]:
    return min((_clave_de_dia(dias.get(r)) for r in propuesta.fact_refs), default=_SIN_FECHA)


def _clave_de_dia(dia: int | None) -> tuple[int, int]:
    """(0, día) para un día conocido; (1, 0) para ``None``, que ordena después de cualquier día."""
    return _SIN_FECHA if dia is None else (0, dia)


def _lugares_por_serie(
    propuestas: Sequence[PropuestaDelTurno], series: Mapping[str, str | None]
) -> dict[str, list[int]]:
    """Por serie, los lugares de las afirmaciones cuyos hechos son todos de esa serie; las demás no entran."""
    lugares: dict[str, list[int]] = {}
    for lugar, propuesta in enumerate(propuestas):
        de_la_serie = {series.get(r) for r in propuesta.fact_refs}
        if len(de_la_serie) == 1 and (serie := next(iter(de_la_serie))) is not None:
            lugares.setdefault(serie, []).append(lugar)
    return lugares
