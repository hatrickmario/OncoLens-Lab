"""Criterios de aplicabilidad del catálogo clínico (L1D-126, ADR-29, RN-28): tipos y puerto, sin I/O.

Son datos declarativos de ``<CLINICAL_CATALOG_PATH>/<tipo>/aplicabilidad.json``, sin puntaje (RN-28). El significado
operativo de cada operador lo implementa el motor de aplicabilidad (US-122) sobre este puerto, nunca sobre el adapter.
"""

from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Literal, Protocol


# Vocabularios cerrados del catálogo (una sola fuente; el adapter los importa).
OperadorDeRegla = Literal["igualdad", "pertenencia", "rango"]
CondicionDeParcial = Literal["solo_subgrupo", "rango_solapado"]
EstadoDeRevision = Literal["propuesta", "pendiente", "revisado"]


@dataclass(frozen=True)
class DestinoDelCriterio:
    """Dónde vive el dato del paciente en Backend 1 (metadato: Backend 2 no lo consulta, RN-29)."""

    entidad: str
    campo: str | None
    coincidencia: Mapping[str, tuple[str, ...]]


@dataclass(frozen=True)
class LimitesDeRegla:
    """Cotas del catálogo para una regla de rango; ``None`` = sin cota en ese extremo."""

    minimo: float | None
    maximo: float | None


@dataclass(frozen=True)
class ReglaDeAplicabilidad:
    operador: OperadorDeRegla
    parcial_cuando: CondicionDeParcial
    equivalencias: Mapping[str, tuple[str, ...]]
    limites: LimitesDeRegla | None


@dataclass(frozen=True)
class ReglasDePoblacion:
    """Datos del catálogo para leer la población en lista de un criterio (US-243, RN-22, RN-27): nunca literales en código.

    ``sinonimos`` lleva código canónico → textos que lo nombran (es/en); lo que no mapea queda ``no_mapeado``.
    ``escala`` y ``grupos`` son la tabla ordenada de un criterio de rango (estadio): sin ella no hay regla de comparación."""

    marcadores_de_restriccion: tuple[str, ...] = ()
    sinonimos: Mapping[str, tuple[str, ...]] = field(default_factory=dict)
    escala: tuple[str, ...] = ()
    grupos: Mapping[str, tuple[str, ...]] = field(default_factory=dict)
    disenos_que_mezclan: tuple[str, ...] = ()
    """``study_design`` cuyos fragmentos reúnen varias poblaciones sin desagregar: una lista inclusiva queda ``mezclada``."""


@dataclass(frozen=True)
class CriterioDeAplicabilidad:
    clave: str
    tipo_de_cancer: str
    clave_de_estudio: str
    etiqueta_es: str
    etiqueta_en: str | None
    destino: DestinoDelCriterio
    es_excluyente: bool
    regla: ReglaDeAplicabilidad
    estado_de_revision: EstadoDeRevision
    poblacion: ReglasDePoblacion = field(default_factory=ReglasDePoblacion)


class CriteriosDeAplicabilidad(Protocol):
    """Criterios del catálogo montado, leídos una vez al arrancar."""

    def criterios(self, tipo_de_cancer: str) -> tuple[CriterioDeAplicabilidad, ...]:
        """Criterios del tipo en el orden del archivo. ``()`` significa que el tipo no está declarado o que su archivo
        tiene ``items`` vacío: el consumidor no distingue ambos casos."""
        ...
