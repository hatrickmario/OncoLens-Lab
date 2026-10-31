"""Tipos de la aplicabilidad por criterio (FR-25, RN-28, L1D-127): datos puros, sin E/S.

Un criterio evaluado nunca lleva puntaje ni ponderación (RN-28): solo su estado, los valores copiados y la causa.
"""

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Literal, get_args

EstadoDeCriterio = Literal["coincide", "parcial", "no_coincide", "desconocido"]
ESTADOS: tuple[EstadoDeCriterio, ...] = get_args(EstadoDeCriterio)
CausaDeDesconocido = Literal[
    "falta_en_paciente",
    "no_reportado_por_fuente",
    "valores_en_conflicto",
    "sin_regla_de_comparacion",
    "respaldo_fallido",
]
MotivoInterno = Literal[
    "valor_fuera_de_tabla", "sin_escala", "forma_no_comparable", "destino_no_resoluble"
]
"""Por qué un ``desconocido`` no tiene regla de comparación o no se pudo leer. Los tres primeros salen al contrato como
``sin_regla_de_comparacion`` (US-243); ``destino_no_resoluble`` solo se cuenta en el log (design D2b)."""
MOTIVOS_INTERNOS: tuple[MotivoInterno, ...] = get_args(MotivoInterno)
MOTIVOS_SIN_REGLA_DE_COMPARACION: frozenset[MotivoInterno] = frozenset(
    {"valor_fuera_de_tabla", "sin_escala", "forma_no_comparable"}
)
MotivoParcial = Literal["inclusiva", "mezclada", "rango_solapado", "solo_subgrupo"]
EstadoInterno = Literal[
    "exacto",
    "inclusivo",
    "mezclado",
    "rango_solapado",
    "solo_subgrupo",
    "restringido",
    "en_conflicto",
    "ausente",
    "sin_regla",
]
"""Estados internos de la población del estudio (US-243, design D2): nunca salen en la API, solo los cuatro de RN-28."""
AvisoDelDato = Literal["sin_verificar", "en_conflicto", "faltante"]
OrigenDeMetadatos = Literal["fuente_estructurada", "extraido_verificado", "pendiente"]


AlcanceDeValor = Literal["elegibilidad", "subgrupo", "mencion"]
ALCANCES: tuple[AlcanceDeValor, ...] = get_args(AlcanceDeValor)
MotivoDeFormaInvalida = Literal["demasiados_valores", "alcance_fuera_de_enum", "valor_invalido"]


@dataclass(frozen=True)
class ValorDePoblacion:
    """Un valor de población de un criterio (ADR-47): ``chunk_id`` es ``None`` en la forma antigua, que no lo guardaba."""

    valor: str
    alcance: AlcanceDeValor
    chunk_id: str | None


@dataclass(frozen=True)
class FormaInvalida:
    """Por qué se descartó la lista de un criterio. Nunca lleva el valor ni el texto del fragmento (RN-14)."""

    motivo: MotivoDeFormaInvalida
    chunk_id: str | None


@dataclass(frozen=True)
class CriterioDePoblacion:
    """Lo que el dominio recibe por criterio, venga de la forma antigua o de la nueva (US-241, D6).

    Pendiente (D5) e inválido llevan la lista vacía: el criterio queda sin valor del estudio."""

    valores: tuple[ValorDePoblacion, ...] = ()
    pendiente: bool = False
    invalidez: FormaInvalida | None = None


@dataclass(frozen=True)
class PoblacionDelEstudio:
    """``population_criteria`` y ``metadata_source`` de un documento del catálogo, ya leídos de cualquiera de las dos formas
    guardadas (US-241). ``criterios`` va por clave de estudio (``a`` o ``a.b``); una clave ausente es «sin valor»."""

    metadata_source: OrigenDeMetadatos
    criterios: Mapping[str, CriterioDePoblacion]


@dataclass(frozen=True)
class ValorDelEstudio:
    """Valor de población copiado de la fuente; ``solo_subgrupo`` es la marca ``alcance = subgrupo`` (Q2)."""

    valor: str
    solo_subgrupo: bool = False


@dataclass(frozen=True)
class ProyeccionDeEstado:
    """Estado visible de un criterio con sus motivos (RN-28): ``motivo_parcial`` solo con ``parcial``; ``causa`` solo con
    ``desconocido``. Nunca un puntaje ni un porcentaje."""

    estado: EstadoDeCriterio
    motivo_parcial: MotivoParcial | None = None
    causa: CausaDeDesconocido | None = None
    motivo_interno: MotivoInterno | None = None


@dataclass(frozen=True)
class CriterioEvaluado:
    clave: str
    valor_paciente: str | None
    valor_estudio: str | None
    estado: EstadoDeCriterio
    causa: CausaDeDesconocido | None
    es_excluyente: bool
    motivo_interno: MotivoInterno | None = None
    chunk_citado_id: str | None = None
    """El chunk que cita un valor textual aceptado (US-123); ``None`` = cita el mejor chunk de la fuente (L1D-127)."""
    aviso: AvisoDelDato | None = None
    """Estado del dato del paciente que se comparó (US-124, RN-26): nunca altera ``estado``."""
    motivo_parcial: MotivoParcial | None = None
    """Por qué el criterio es ``parcial`` (US-243); ``None`` con cualquier otro estado."""
    valores_del_estudio: tuple[ValorDePoblacion, ...] = ()
    """Los valores de la lista de los fragmentos que cita la opción, de cualquier alcance (contexto, ADR-47); vacío con la
    forma antigua."""


@dataclass(frozen=True)
class ResumenDeEstados:
    coincide: int
    parcial: int
    no_coincide: int
    desconocido: int


@dataclass(frozen=True)
class ProcedenciaDelDato:
    """Lo que la aplicabilidad lee de la ``provenance`` de un dato del paciente (RN-07): si espera revisión y si está en
    conflicto. Los datos ``rechazado`` y ``reemplazado`` nunca llegan al contexto (RN-07)."""

    requiere_revision: bool = False
    en_conflicto: bool = False


@dataclass(frozen=True)
class DatoDelPaciente:
    """Un valor copiado del contexto con las procedencias de los datos que lo componen (más de una en un destino
    compuesto como RE/RP)."""

    valor: str
    procedencias: tuple[ProcedenciaDelDato, ...]


@dataclass(frozen=True)
class BiomarcadorDelPaciente:
    nombre: str
    valor: str
    meses_atras: int
    procedencia: ProcedenciaDelDato = ProcedenciaDelDato()


@dataclass(frozen=True)
class AtributoDelPaciente:
    clave: str
    valor: str
    meses_atras: int | None
    procedencia: ProcedenciaDelDato = ProcedenciaDelDato()


@dataclass(frozen=True)
class TratamientoPrevioDelPaciente:
    numero_de_linea: int | None
    meses_desde_el_inicio: int | None
    procedencia: ProcedenciaDelDato = ProcedenciaDelDato()


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
    procedencia_del_diagnostico: ProcedenciaDelDato = ProcedenciaDelDato()
    """Estadio, grado y desempeño comparten la ``provenance`` del diagnóstico."""
    datos_criticos_faltantes: frozenset[str] = frozenset()
    """``clinicalContext.missingCriticalData``: claves del checklist; un criterio con esa clave es ``falta_en_paciente``."""
