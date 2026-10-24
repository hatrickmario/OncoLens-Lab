"""Criterios de aplicabilidad del catálogo clínico (L1D-126, ADR-29, RN-28): tipos y puerto, sin I/O.

Son datos declarativos de ``<CLINICAL_CATALOG_PATH>/<tipo>/aplicabilidad.json``, sin puntaje (RN-28). El significado
operativo de cada operador lo implementa el motor de aplicabilidad (US-122) sobre este puerto, nunca sobre el adapter.
"""

from collections.abc import Mapping
from dataclasses import dataclass
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
class CriterioDeAplicabilidad:
    clave: str
    tipo_de_cancer: str
    clave_de_estudio: str
    etiqueta_es: str
    etiqueta_en: str | None
    destino: DestinoDelCriterio
    es_excluyente: bool
    regla: ReglaDeAplicabilidad
    estado: str


class CriteriosDeAplicabilidad(Protocol):
    """Criterios del catálogo montado, leídos una vez al arrancar."""

    def criterios(self, tipo_de_cancer: str) -> tuple[CriterioDeAplicabilidad, ...]:
        """Criterios del tipo en el orden del archivo; ``()`` si el catálogo no declara ese tipo."""
        ...
