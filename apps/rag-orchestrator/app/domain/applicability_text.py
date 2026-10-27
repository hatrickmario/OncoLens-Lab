"""Camino textual de la aplicabilidad (FR-25, US-123, RN-01): tipos puros, sin E/S.

El LLM solo **propone** el valor que el texto de la fuente da a un criterio; este módulo define qué se le entrega y qué
devuelve. Las reglas de validación (cita, lenguaje, soporte) y la normalización al catálogo se añaden aquí sin tocar
ningún puerto.
"""

import re
import unicodedata
from collections.abc import Callable, Sequence
from dataclasses import dataclass, replace
from enum import StrEnum

from app.domain.aplicabilidad_tipos import CriterioEvaluado, ValorDelEstudio
from app.domain.applicability_rules import evaluar_criterio
from app.domain.citations import OpcionGenerada, validar_citas
from app.domain.criterios_aplicabilidad import CriterioDeAplicabilidad
from app.domain.nli import ParNli
from app.domain.support import CampoGenerado


@dataclass(frozen=True)
class CriterioPendiente:
    """Un criterio del catálogo sobre el que la fuente no trae valor estructurado: solo su clave y sus etiquetas."""

    clave: str
    etiqueta_es: str
    etiqueta_en: str | None


@dataclass(frozen=True)
class ChunkDeFuente:
    """Un chunk recuperado de la fuente en esta consulta: lo único que una propuesta puede citar (RN-01)."""

    chunk_id: str
    texto: str


@dataclass(frozen=True)
class FuenteParaProponer:
    """Lo que el LLM recibe de cada fuente: sus criterios pendientes y sus chunks. Nunca datos del paciente (RN-11)."""

    external_id: str
    criterios: tuple[CriterioPendiente, ...]
    chunks: tuple[ChunkDeFuente, ...]


@dataclass(frozen=True)
class PropuestaDePoblacion:
    """Lo único que sobrevive de la salida del LLM: criterio, valor del estudio y ``chunkId`` citado (sin estado)."""

    external_id: str
    criterio: str
    valor: str
    chunk_id: str


# --- qué se le pide al LLM (D1) ------------------------------------------------------------------------------------


def criterios_pendientes_de_texto(
    evaluados: Sequence[CriterioEvaluado], criterios: Sequence[CriterioDeAplicabilidad]
) -> tuple[CriterioPendiente, ...]:
    """Los criterios sin valor estructurado de una fuente, en el orden del catálogo (design D1).

    Un criterio con valor del estudio ya leído de ``population_criteria`` nunca va al LLM (US-122 AC-6); tampoco el que
    tiene un destino que el resolvedor no sabe leer, que es un error del catálogo y no una pregunta al texto."""
    catalogo = {c.clave: c for c in criterios}
    return tuple(
        CriterioPendiente(e.clave, catalogo[e.clave].etiqueta_es, catalogo[e.clave].etiqueta_en)
        for e in evaluados
        if e.valor_estudio is None and e.motivo_interno != "destino_no_resoluble"
    )


# --- validar lo que propone el LLM (D3, RN-01, RN-04, RN-23) -------------------------------------------------------


class MotivoDeRechazo(StrEnum):
    cita_fuera_de_la_fuente = "cita_fuera_de_la_fuente"
    lenguaje_no_permitido = "lenguaje_no_permitido"


BuscadorDeTerminos = Callable[[str, CampoGenerado], Sequence[str]]
"""``(texto, campo) -> ids de regla``: el puerto ``ProhibitedTermsChecker`` visto desde el dominio."""


@dataclass(frozen=True)
class PropuestaPlanificada:
    """Una propuesta con cita válida y lenguaje limpio: solo falta el NLI, con el chunk citado como premisa."""

    propuesta: PropuestaDePoblacion
    premisa: str
    hipotesis: str
    """``{etiqueta del criterio}: {valor}``: el valor suelto («negativo») lo implicaría un chunk que lo diga de otro
    biomarcador («ER-negative, HER2-positive»); con el criterio nombrado la afirmación es sobre el criterio pedido."""


@dataclass(frozen=True)
class PlanDePropuestas:
    por_validar: tuple[PropuestaPlanificada, ...]
    rechazadas: tuple[tuple[PropuestaDePoblacion, MotivoDeRechazo], ...]


@dataclass(frozen=True)
class ResultadoDePropuestas:
    aceptadas: tuple[PropuestaDePoblacion, ...]
    omitidas: int


def planificar_propuestas(
    propuestas: Sequence[PropuestaDePoblacion],
    fuentes: Sequence[FuenteParaProponer],
    buscar_terminos: BuscadorDeTerminos,
) -> PlanDePropuestas:
    """Separa las propuestas que van al NLI de las que se rechazan antes, en el orden de ``validar_propuesta`` (D3).

    Se ignoran, sin contarlas como omitidas, las de una fuente o un criterio que no se pidió y las repetidas (gana la
    primera): el LLM no afirmó nada que el sistema tuviera que mostrar."""
    por_fuente = {f.external_id: f for f in fuentes}
    vistas: set[tuple[str, str]] = set()
    por_validar: list[PropuestaPlanificada] = []
    rechazadas: list[tuple[PropuestaDePoblacion, MotivoDeRechazo]] = []
    for propuesta in propuestas:
        origen = por_fuente.get(propuesta.external_id)
        clave = (propuesta.external_id, propuesta.criterio)
        if origen is None or not _se_pidio(origen, propuesta) or clave in vistas:
            continue
        vistas.add(clave)
        motivo = _motivo_de_rechazo(propuesta, origen, buscar_terminos)
        if motivo is not None:
            rechazadas.append((propuesta, motivo))
        else:
            por_validar.append(
                PropuestaPlanificada(
                    propuesta, _texto_del_chunk(origen, propuesta), _hipotesis_de(origen, propuesta)
                )
            )
    return PlanDePropuestas(tuple(por_validar), tuple(rechazadas))


def _se_pidio(fuente: FuenteParaProponer, propuesta: PropuestaDePoblacion) -> bool:
    return any(c.clave == propuesta.criterio for c in fuente.criterios)


def _motivo_de_rechazo(
    propuesta: PropuestaDePoblacion, fuente: FuenteParaProponer, buscar_terminos: BuscadorDeTerminos
) -> MotivoDeRechazo | None:
    """La cita es un chunk recuperado DE ESA fuente en esta consulta (``validar_citas``); luego el filtro RN-23."""
    citada = OpcionGenerada(propuesta.valor, propuesta.valor, (propuesta.chunk_id,))
    ids_de_la_fuente = {c.chunk_id for c in fuente.chunks}
    if not validar_citas([citada], ids_de_la_fuente).aceptadas:
        return MotivoDeRechazo.cita_fuera_de_la_fuente
    if buscar_terminos(propuesta.valor, "studyPopulationValue"):
        return MotivoDeRechazo.lenguaje_no_permitido
    return None


def _hipotesis_de(fuente: FuenteParaProponer, propuesta: PropuestaDePoblacion) -> str:
    etiqueta = next(c.etiqueta_es for c in fuente.criterios if c.clave == propuesta.criterio)
    return f"{etiqueta}: {propuesta.valor}"


def _texto_del_chunk(fuente: FuenteParaProponer, propuesta: PropuestaDePoblacion) -> str:
    return next(c.texto for c in fuente.chunks if c.chunk_id == propuesta.chunk_id)


def pares_para_el_nli(plan: PlanDePropuestas) -> list[ParNli]:
    """Premisa = texto del chunk citado; hipótesis = el criterio y su valor, en el orden de ``plan.por_validar``."""
    return [ParNli(p.premisa, p.hipotesis) for p in plan.por_validar]


def aceptar_propuestas(plan: PlanDePropuestas, soportadas: Sequence[bool]) -> ResultadoDePropuestas:
    """Acepta las propuestas que el NLI soporta; toda afirmación rechazada, antes o después del NLI, es una omitida."""
    if len(soportadas) != len(plan.por_validar):
        raise ValueError("debe haber un veredicto del NLI por propuesta a validar")
    aceptadas = tuple(
        p.propuesta for p, soporta in zip(plan.por_validar, soportadas, strict=True) if soporta
    )
    omitidas = len(plan.rechazadas) + len(plan.por_validar) - len(aceptadas)
    return ResultadoDePropuestas(aceptadas, omitidas)


# --- aplicar el valor aceptado con la regla del catálogo (D4, OQ-1) ----------------------------------------------------


def normalizar_valor_al_catalogo(criterio: CriterioDeAplicabilidad, valor: str) -> str:
    """El valor sin los rótulos del propio criterio, para compararlo con la regla del catálogo (design D4).

    «HER2 negativo» → ``negativo``. Los rótulos salen del catálogo (etiquetas, clave de estudio, clave y nombres del
    destino); si el valor es solo el rótulo se conserva tal cual. Sin LLM y sin inventar sinónimos."""
    plegado = _plegado(valor)
    quitar = [False] * len(valor)
    for rotulo in _rotulos_de(criterio):
        for coincidencia in re.finditer(rf"(?<!\w){re.escape(_plegado(rotulo))}(?!\w)", plegado):
            quitar[slice(*coincidencia.span())] = [True] * (
                coincidencia.end() - coincidencia.start()
            )
    resto = "".join(" " if borrar else letra for letra, borrar in zip(valor, quitar, strict=True))
    limpio = re.sub(r"\s+", " ", resto).strip(" \t:=,;.-–—")
    return limpio or valor


def _plegado(texto: str) -> str:
    """Minúsculas y sin tildes, letra a letra: conserva la longitud para borrar sobre el texto original."""
    return "".join(unicodedata.normalize("NFD", letra)[0].lower() for letra in texto)


def _rotulos_de(criterio: CriterioDeAplicabilidad) -> set[str]:
    nombres = {n for valores in criterio.destino.coincidencia.values() for n in valores}
    hoja = criterio.clave_de_estudio.rpartition(".")[2]
    candidatos = {
        criterio.etiqueta_es,
        criterio.etiqueta_en or "",
        hoja.replace("_", " "),
        criterio.clave.replace("_", " "),
        *nombres,
    }
    return {c for c in candidatos if c}


def con_valor_textual(
    criterio: CriterioDeAplicabilidad, evaluado: CriterioEvaluado, propuesta: PropuestaDePoblacion
) -> CriterioEvaluado:
    """El criterio con el valor textual aceptado: el estado lo pone la regla del catálogo sobre el valor normalizado.

    ``valor_estudio`` es el texto propuesto y verificado por el NLI (no el normalizado) y cita el chunk de la propuesta;
    el valor del paciente no se toca (ADR-34). Si el valor no encaja en la regla queda ``desconocido`` (OQ-1)."""
    normalizado = normalizar_valor_al_catalogo(criterio, propuesta.valor)
    veredicto = evaluar_criterio(criterio, evaluado.valor_paciente, ValorDelEstudio(normalizado))
    return replace(veredicto, valor_estudio=propuesta.valor, chunk_citado_id=propuesta.chunk_id)
