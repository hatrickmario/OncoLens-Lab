"""Texto del turno de fuentes y limitaciones (US-266, RN-04, RN-25, RN-23, FR-10): reglas puras, sin E/S.

Todo lo que el turno dice sale del catálogo del corpus, de la release vigente o del estado del hilo; el LLM no escribe ni una
palabra. Un metadato ausente es «No disponible» (RN-25), nunca ``0`` ni un valor inferido. Este módulo es el único dueño
del literal «No disponible» de los bloques ``fuente`` del chat (la población del estudio usa su propio ``no_disponible``)
y de la frase de FR-10.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from datetime import date

from app.domain.chat.bloques_de_evidencia import CriterioParaMostrar, criterio_legible
from app.domain.chat.estado import LimitacionesDelAnalisis, UltimaEvidencia
from app.domain.citations import FichaDeFuente

TEXTO_NO_DISPONIBLE_RN25 = "No disponible"
FRASE_DE_APLICABILIDAD = "La evidencia encontrada no permite establecer por sí sola la aplicabilidad de un tratamiento a este paciente"
"""FR-10 (texto asumido en el backlog): la evidencia describe, no decide por el paciente."""
MENSAJE_SIN_CONSULTA = "Aún no se ha consultado evidencia en esta conversación"
MENSAJE_SIN_FUENTES_CITADAS = "La última consulta de evidencia no citó ninguna fuente"

_ESTADO_DESCONOCIDO = "desconocido"


def chunks_citados(ultima: UltimaEvidencia, citas_mostradas: Iterable[str]) -> tuple[str, ...]:
    """Los ``chunkId`` evaluados por el último turno de evidencia que el hilo mostró como cita (en el orden del reranker)."""
    mostradas = set(citas_mostradas)
    return tuple(dict.fromkeys(c for c in ultima.chunk_ids if c in mostradas))


def _o_no_disponible(valor: object | None) -> str:
    return TEXTO_NO_DISPONIBLE_RN25 if valor is None or valor == "" else str(valor)


def texto_de_la_fuente(ficha: FichaDeFuente | None) -> str:
    """Título, nombre de la fuente, año, idioma y licencia COPIADOS de la ficha del catálogo (RN-04, AC-T1.3). Sin ficha o
    con un metadato ausente, «No disponible» (RN-25)."""
    anio = None if ficha is None or ficha.published_at is None else ficha.published_at.year
    return (
        f"Fuente: {_o_no_disponible(ficha and ficha.title)}. "
        f"Nombre de la fuente: {_o_no_disponible(ficha and ficha.source_name)}. "
        f"Año de publicación: {_o_no_disponible(anio)}. "
        f"Idioma: {_o_no_disponible(ficha and ficha.language)}. "
        f"Licencia: {_o_no_disponible(ficha and ficha.license_class)}."
    )


def texto_de_limitaciones_de_la_recuperacion(
    fecha_de_corte: date, fuentes_no_incluidas: Sequence[str], fragmentos_evaluados: int
) -> str:
    """Alcance de la recuperación (AC-06.2): fecha de corte del corpus, fuentes no incluidas (solo su nombre) y fragmentos
    que evaluó el *reranker* en la última consulta de evidencia."""
    excluidas = (
        ", ".join(fuentes_no_incluidas)
        if fuentes_no_incluidas
        else "ninguna declarada en la release vigente"
    )
    return (
        f"Alcance de la recuperación: el corpus tiene fecha de corte {fecha_de_corte.isoformat()}; "
        f"fuentes no incluidas: {excluidas}; "
        f"fragmentos de evidencia evaluados en la última consulta: {fragmentos_evaluados}."
    )


def limitaciones_del_analisis(
    criterios_mostrados: Iterable[CriterioParaMostrar],
    opciones_descartadas: int,
    hubo_opciones: bool = True,
) -> LimitacionesDelAnalisis:
    """Los criterios de aplicabilidad que quedaron «Desconocido» en las opciones mostradas (sin repetir) y las descartadas."""
    desconocidos = dict.fromkeys(
        criterio_legible(c.criterio) for c in criterios_mostrados if c.estado == _ESTADO_DESCONOCIDO
    )
    return LimitacionesDelAnalisis(tuple(desconocidos), opciones_descartadas, hubo_opciones)


def texto_de_limitaciones_de_la_evidencia(limitaciones: LimitacionesDelAnalisis | None) -> str:
    """Criterios sin determinar y opciones descartadas del último análisis, más la frase de FR-10. Sin el análisis en el
    estado (hilo rehidratado, ``None``) remite al análisis registrado y no inventa ningún valor."""
    if limitaciones is None:
        detalle = (
            "el detalle de los criterios de aplicabilidad en estado Desconocido y de las opciones descartadas "
            "está en el análisis registrado de esta conversación"
        )
    elif not limitaciones.hubo_opciones:
        detalle = (
            "el último análisis no produjo opciones; "
            f"opciones descartadas por falta de soporte: {limitaciones.opciones_descartadas}"
        )
    else:
        criterios = (
            ", ".join(limitaciones.criterios_desconocidos)
            if limitaciones.criterios_desconocidos
            else None
        )
        desconocidos = (
            f"criterios de aplicabilidad en estado Desconocido: {criterios}"
            if criterios
            else "ningún criterio de aplicabilidad quedó en estado Desconocido"
        )
        detalle = f"{desconocidos}; opciones descartadas por falta de soporte: {limitaciones.opciones_descartadas}"
    return f"Limitaciones de la evidencia: {detalle}. {FRASE_DE_APLICABILIDAD}."
