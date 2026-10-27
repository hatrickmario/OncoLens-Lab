"""Tipos de la aplicabilidad por criterio (FR-25, RN-28, L1D-127): datos puros, sin E/S.

Un criterio evaluado nunca lleva puntaje ni ponderación (RN-28): solo su estado, los valores copiados y la causa.
"""

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Literal, get_args

EstadoDeCriterio = Literal["coincide", "parcial", "no_coincide", "desconocido"]
ESTADOS: tuple[EstadoDeCriterio, ...] = get_args(EstadoDeCriterio)
CausaDeDesconocido = Literal["falta_en_paciente", "no_reportado_por_fuente"]
MotivoInterno = Literal[
    "valor_fuera_de_tabla", "sin_escala", "forma_no_comparable", "destino_no_resoluble"
]
"""Por qué un ``desconocido`` no lleva causa en el contrato: solo se cuenta en el log, nunca se envía (design D2b)."""
MOTIVOS_INTERNOS: tuple[MotivoInterno, ...] = get_args(MotivoInterno)
OrigenDeMetadatos = Literal["fuente_estructurada", "extraido_verificado", "pendiente"]


@dataclass(frozen=True)
class PoblacionDelEstudio:
    """``population_criteria`` y ``metadata_source`` de un documento del catálogo, tal como están guardados."""

    metadata_source: OrigenDeMetadatos
    criterios: Mapping[str, object]


@dataclass(frozen=True)
class ValorDelEstudio:
    """Valor de población copiado de la fuente; ``solo_subgrupo`` es la marca ``alcance = subgrupo`` (Q2)."""

    valor: str
    solo_subgrupo: bool = False


@dataclass(frozen=True)
class CriterioEvaluado:
    clave: str
    valor_paciente: str | None
    valor_estudio: str | None
    estado: EstadoDeCriterio
    causa: CausaDeDesconocido | None
    es_excluyente: bool
    motivo_interno: MotivoInterno | None = None


@dataclass(frozen=True)
class ResumenDeEstados:
    coincide: int
    parcial: int
    no_coincide: int
    desconocido: int


@dataclass(frozen=True)
class BiomarcadorDelPaciente:
    nombre: str
    valor: str
    meses_atras: int


@dataclass(frozen=True)
class AtributoDelPaciente:
    clave: str
    valor: str
    meses_atras: int | None


@dataclass(frozen=True)
class TratamientoPrevioDelPaciente:
    numero_de_linea: int | None
    meses_desde_el_inicio: int | None


@dataclass(frozen=True)
class ContextoDelPaciente:
    """Lo que la aplicabilidad lee del ``clinicalContext`` (ya desidentificado): copias, nunca texto generado."""

    biomarcadores: tuple[BiomarcadorDelPaciente, ...] = ()
    valor_de_estadio: str | None = None
    grado: str | None = None
    escala_de_desempeno: str | None = None
    valor_de_desempeno: int | None = None
    atributos: tuple[AtributoDelPaciente, ...] = ()
    tratamientos_previos: tuple[TratamientoPrevioDelPaciente, ...] = ()
