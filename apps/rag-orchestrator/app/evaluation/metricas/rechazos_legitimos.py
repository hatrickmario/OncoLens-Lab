"""Regresión de falsos positivos del filtro de RN-23 (US-249 AC-5): ¿rechaza más salidas legítimas que la línea base 1.5.0?

Una salida legítima DESCRIBE lo que dice la evidencia sin dirigirse al paciente. La propuesta cruda del generador de una
pregunta de control legítimo (``legitima: true`` en el dataset) pasa por el filtro de producción vigente y por el de la línea
base (mismo adapter y mismas fuentes citadas; solo cambian la lista y la política). Con el generador guionado la propuesta es
la del dataset; con el real, la que produjo. Solo ids de pregunta y de regla: nunca el texto (RN-14).
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from app.application.ports import EvidenciaGenerada, ProhibitedTermsChecker
from app.domain.support import FuentesDeLaConsulta
from app.evaluation.fuente_dataset import DatasetSuite
from app.evaluation.metricas.resultado import RechazoDeSalidaLegitima, ResultadoConsulta
from app.evaluation.salida_generada import grupos_de_propuesta


def ids_de_preguntas_de_control_legitimo(dataset: DatasetSuite) -> frozenset[str]:
    """Las preguntas cuya propuesta guionada está marcada ``legitima: true``."""
    return frozenset(
        pregunta
        for pregunta, opciones in dataset.propuestas.items()
        if any(o.legitima for o in opciones)
    )


def medir_salida_legitima(
    propuesta: EvidenciaGenerada,
    consulta: FuentesDeLaConsulta,
    vigente: ProhibitedTermsChecker,
    linea_base: ProhibitedTermsChecker,
) -> RechazoDeSalidaLegitima:
    """Las reglas que cada filtro aplica a lo que la propuesta cruda dice, con las mismas fuentes que da producción."""
    vigentes: list[str] = []
    de_la_base: list[str] = []
    for grupo in grupos_de_propuesta(propuesta, consulta):
        for campo, texto in grupo.textos:
            vigentes += vigente.reglas_coincidentes(texto, campo, grupo.fuentes)
            de_la_base += linea_base.reglas_coincidentes(texto, campo, grupo.fuentes)
    return RechazoDeSalidaLegitima(tuple(dict.fromkeys(vigentes)), tuple(dict.fromkeys(de_la_base)))


class RechazosLegitimos:
    """El agregado del reporte: cuántas salidas legítimas rechaza cada lista y si la diferencia supera la tolerancia."""

    def __init__(self, resultados: Sequence[ResultadoConsulta], tolerancia: int) -> None:
        self._tolerancia = tolerancia
        self._controles = [
            (r.recuperacion.id, r.salida_legitima)
            for r in resultados
            if r.salida_legitima is not None
        ]

    @property
    def hay_controles(self) -> bool:
        return bool(self._controles)

    @property
    def con_la_lista_1_5_0(self) -> int:
        return sum(bool(s.reglas_de_la_linea_base) for _, s in self._controles)

    @property
    def con_la_lista_vigente(self) -> int:
        return sum(bool(s.reglas_vigentes) for _, s in self._controles)

    @property
    def diferencia(self) -> int:
        return self.con_la_lista_vigente - self.con_la_lista_1_5_0

    @property
    def supera_la_tolerancia(self) -> bool:
        return self.diferencia > self._tolerancia

    @property
    def nuevos(self) -> tuple[tuple[str, str], ...]:
        """``(id de la pregunta, id de la regla)`` de cada salida legítima que solo la lista vigente rechaza."""
        return tuple(
            (pregunta, regla)
            for pregunta, s in self._controles
            if s.reglas_vigentes and not s.reglas_de_la_linea_base
            for regla in s.reglas_vigentes
        )

    def para_el_reporte(self) -> dict[str, Any]:
        return {
            "salidas_legitimas": len(self._controles),
            "con_la_lista_1_5_0": self.con_la_lista_1_5_0,
            "con_la_lista_vigente": self.con_la_lista_vigente,
            "diferencia": self.diferencia,
            "tolerancia": self._tolerancia,
        }
