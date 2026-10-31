"""Contadores de la extracción de población en abanico (US-242): lo único que el resumen de la ingesta cuenta.

Solo números: nunca el valor, el fragmento ni la salida del LLM (RN-14).
"""

from __future__ import annotations

from dataclasses import dataclass, fields


@dataclass(frozen=True)
class ContadoresDePoblacion:
    llamadas: int = 0
    valores_rechazados_por_relleno: int = 0
    valores_rechazados_por_chunk_ajeno: int = 0
    valores_sin_soporte: int = 0
    valores_con_lenguaje_prescriptivo: int = 0
    valores_descartados_por_longitud: int = 0
    valores_fuera_del_tope: int = 0
    finish_reason_length: int = 0
    criterios_pendientes: int = 0
    criterios_reutilizados: int = 0

    @property
    def valores_rechazados(self) -> int:
        return self.valores_rechazados_por_relleno + self.valores_rechazados_por_chunk_ajeno

    @property
    def truncado(self) -> bool:
        """``True`` si el tope por fragmento y criterio dejó valores fuera (ADR-47)."""
        return self.valores_fuera_del_tope > 0

    def __add__(self, otro: ContadoresDePoblacion) -> ContadoresDePoblacion:
        return ContadoresDePoblacion(
            **{f.name: getattr(self, f.name) + getattr(otro, f.name) for f in fields(self)}
        )

    def como_diccionario(self) -> dict[str, object]:
        """Claves del resumen JSON de la ingesta (camelCase, como la spec)."""
        return {
            "llamadas": self.llamadas,
            "valoresRechazados": self.valores_rechazados,
            "valoresRechazadosPorMotivo": {
                "relleno": self.valores_rechazados_por_relleno,
                "chunk_ajeno": self.valores_rechazados_por_chunk_ajeno,
            },
            "valoresSinSoporte": self.valores_sin_soporte,
            "valoresConLenguajePrescriptivo": self.valores_con_lenguaje_prescriptivo,
            "valoresDescartadosPorLongitud": self.valores_descartados_por_longitud,
            "valoresFueraDelTope": self.valores_fuera_del_tope,
            "truncado": self.truncado,
            "finishReasonLength": self.finish_reason_length,
            "criteriosPendientes": self.criterios_pendientes,
            "criteriosReutilizados": self.criterios_reutilizados,
        }
