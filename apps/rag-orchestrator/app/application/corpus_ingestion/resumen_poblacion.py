"""Resumen de la población del corpus por tipo de cáncer e idioma (US-120 AC-7, ADR-47): solo identificadores y contadores."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from app.application.seed_corpus.ports import RegistroDeDocumento
from app.domain.aplicabilidad_tipos import PoblacionDelEstudio
from app.domain.corpus_metadata.resultado import EXTRAIDO_VERIFICADO
from app.domain.criterios_aplicabilidad import CriterioDeAplicabilidad
from app.domain.poblacion_del_estudio import poblacion_desde_lo_guardado

ALCANCE_DE_ELEGIBILIDAD = "elegibilidad"


@dataclass(frozen=True)
class CeldaDePoblacion:
    """Documentos de un tipo e idioma y, por criterio, cuántos tienen ≥ 1 valor ``elegibilidad`` verificado.

    ``por_criterio`` es ``None`` (no ``0``) cuando no hay documentos: la celda está «sin documentos»."""

    documentos: int
    por_criterio: Mapping[str, int] | None

    @property
    def sin_documentos(self) -> bool:
        return self.documentos == 0


def resumir_poblacion_por_tipo_e_idioma(
    documentos: Sequence[RegistroDeDocumento],
    criterios: Mapping[str, Sequence[CriterioDeAplicabilidad]],
    idiomas: Sequence[str],
    max_valores: int,
) -> dict[str, dict[str, CeldaDePoblacion]]:
    """Una celda por tipo de cáncer de ``criterios`` e idioma de ``idiomas``.

    Un documento cuenta para un criterio si su población es ``extraido_verificado`` y trae ≥ 1 valor de alcance
    ``elegibilidad`` para la clave de estudio del criterio (``mencion`` y ``subgrupo`` no cuentan). Los criterios salen del
    catálogo de aplicabilidad, sin lista local. Solo identificadores y contadores: nunca valores ni fragmentos (RN-14)."""
    resumen: dict[str, dict[str, CeldaDePoblacion]] = {}
    for tipo, de_ese_tipo in criterios.items():
        resumen[tipo] = {}
        for idioma in idiomas:
            poblaciones = [
                _poblacion_verificada(registro, max_valores)
                for registro in documentos
                if registro.language == idioma and tipo in _tipos_del(registro)
            ]
            resumen[tipo][idioma] = _celda(poblaciones, de_ese_tipo)
    return resumen


def _tipos_del(registro: RegistroDeDocumento) -> tuple[str, ...]:
    """``cancer_type_tags`` se guarda como etiquetas separadas por coma, sin espacios."""
    return tuple(etiqueta for etiqueta in registro.cancer_type_tags.split(",") if etiqueta)


def _poblacion_verificada(
    registro: RegistroDeDocumento, max_valores: int
) -> PoblacionDelEstudio | None:
    """``None`` si la población no es ``extraido_verificado``: sin verificar no cuenta (ADR-47)."""
    if registro.metadata_source != EXTRAIDO_VERIFICADO:
        return None
    return poblacion_desde_lo_guardado(
        EXTRAIDO_VERIFICADO, registro.population_criteria, max_valores
    )


def _celda(
    poblaciones: Sequence[PoblacionDelEstudio | None],
    criterios: Sequence[CriterioDeAplicabilidad],
) -> CeldaDePoblacion:
    if not poblaciones:
        return CeldaDePoblacion(0, None)
    return CeldaDePoblacion(
        len(poblaciones),
        {
            criterio.clave: sum(
                1 for poblacion in poblaciones if _tiene_elegibilidad(poblacion, criterio)
            )
            for criterio in criterios
        },
    )


def _tiene_elegibilidad(
    poblacion: PoblacionDelEstudio | None, criterio: CriterioDeAplicabilidad
) -> bool:
    if poblacion is None:
        return False
    del_estudio = poblacion.criterios.get(criterio.clave_de_estudio)
    return del_estudio is not None and any(
        valor.alcance == ALCANCE_DE_ELEGIBILIDAD for valor in del_estudio.valores
    )


def como_diccionario(resumen: Mapping[str, Mapping[str, CeldaDePoblacion]]) -> dict[str, Any]:
    """Para el resumen JSON de la ingesta y el reporte: ``{tipo: {idioma: {documentos, sin_documentos, criterios}}}``; una celda
    sin documentos lleva ``criterios: null``."""
    return {
        tipo: {
            idioma: {
                "documentos": celda.documentos,
                "sin_documentos": celda.sin_documentos,
                "criterios": None if celda.por_criterio is None else dict(celda.por_criterio),
            }
            for idioma, celda in por_idioma.items()
        }
        for tipo, por_idioma in resumen.items()
    }
