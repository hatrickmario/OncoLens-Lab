"""Soporte de las afirmaciones generadas (RN-01) y retiro del lenguaje no permitido (RN-23): reglas puras, sin E/S."""

from __future__ import annotations

from collections.abc import Callable, Iterator, Mapping, Sequence
from dataclasses import dataclass, replace
from typing import Literal, get_args

from app.domain.citations import OpcionAceptada, OpcionGenerada
from app.domain.claims import dividir_en_afirmaciones
from app.domain.nli import ParNli, ResultadoNli

CampoGenerado = Literal[
    "option", "rationale", "details", "unsupportedClaims", "limitations[].text", "synthesis"
]
CAMPOS_GENERADOS: tuple[CampoGenerado, ...] = get_args(CampoGenerado)
RETIRO_ES = "[afirmación retirada: formulación no permitida]"
RETIRO_EN = "[claim removed: disallowed wording]"

BuscadorDeTerminos = Callable[[str, CampoGenerado], Sequence[str]]
"""``(texto, campo) -> ids de regla``: el puerto ``ProhibitedTermsChecker`` visto desde el dominio."""


@dataclass(frozen=True, eq=False)
class Afirmacion:
    """Un fragmento generado, el campo del que sale y las reglas de lenguaje que incumple (vacío = limpio).

    Sin igualdad por valor (``eq=False``): dos afirmaciones idénticas son dos fragmentos distintos y cada una conserva su
    propio veredicto.
    """

    texto: str
    campo: CampoGenerado
    reglas: tuple[str, ...]
    premisas: tuple[str, ...]


@dataclass(frozen=True)
class RetiroDeLenguaje:
    """Un fragmento retirado por lenguaje no permitido: solo el campo y las reglas, jamás el texto (RN-23, RN-10)."""

    campo: CampoGenerado
    reglas: tuple[str, ...]


@dataclass(frozen=True)
class OpcionPlanificada:
    aceptada: OpcionAceptada
    option: Afirmacion
    afirmaciones: tuple[Afirmacion, ...]
    # Un elemento por párrafo de detalle, con las afirmaciones que lo componen (ARR-08).
    detalles: tuple[tuple[Afirmacion, ...], ...] = ()


@dataclass(frozen=True)
class PlanDeSoporte:
    opciones: tuple[OpcionPlanificada, ...]
    limitaciones: tuple[Afirmacion, ...]

    @property
    def retiros(self) -> tuple[RetiroDeLenguaje, ...]:
        """Los fragmentos que incumplen el lenguaje (RN-23): campo y reglas, nunca el texto."""
        fragmentos = [
            f
            for o in self.opciones
            for f in (o.option, *o.afirmaciones, *(a for p in o.detalles for a in p))
        ] + list(self.limitaciones)
        return tuple(RetiroDeLenguaje(f.campo, f.reglas) for f in fragmentos if f.reglas)


@dataclass(frozen=True)
class OpcionSinSoporte:
    opcion: OpcionGenerada
    afirmaciones_sin_soporte: tuple[str, ...]


@dataclass(frozen=True)
class ResultadoSoporte:
    soportadas: tuple[OpcionAceptada, ...]
    descartadas: tuple[OpcionSinSoporte, ...]
    limitaciones: tuple[str, ...]
    omitidas: int


def literal_de_retiro(idioma: str) -> str:
    """El único texto que sustituye a un fragmento con lenguaje no permitido, en el idioma de la pregunta (decisión 16)."""
    return RETIRO_EN if idioma == "en" else RETIRO_ES


def soporta(resultado: ResultadoNli, umbral: float) -> bool:
    """Soporte: la clase más probable es ``entailment`` Y su probabilidad alcanza el umbral (RN-01, RN-22, D2)."""
    return resultado.label == "entailment" and resultado.p_entailment >= umbral


def planificar_soporte(
    aceptadas: Sequence[OpcionAceptada],
    limitaciones_propuestas: Sequence[str],
    textos_de_chunks: Mapping[str, str],
    buscar_terminos: BuscadorDeTerminos,
) -> PlanDeSoporte:
    """Divide cada justificación en afirmaciones, asigna sus premisas y marca lo que incumple el lenguaje (RN-23).

    Las premisas de una opción son los chunks que cita; las de una limitación, todos los entregados a la generación.
    """

    def afirmacion(texto: str, campo: CampoGenerado, premisas: tuple[str, ...]) -> Afirmacion:
        return Afirmacion(texto, campo, tuple(buscar_terminos(texto, campo)), premisas)

    todas = tuple(textos_de_chunks.values())
    opciones = []
    for aceptada in aceptadas:
        premisas = tuple(textos_de_chunks[c] for c in aceptada.chunk_ids_validos)
        opciones.append(
            OpcionPlanificada(
                aceptada,
                afirmacion(aceptada.opcion.option, "option", ()),
                tuple(
                    afirmacion(a, "rationale", premisas)
                    for a in dividir_en_afirmaciones(aceptada.opcion.rationale)
                ),
                tuple(
                    tuple(afirmacion(a, "details", premisas) for a in dividir_en_afirmaciones(p))
                    for p in aceptada.opcion.details
                ),
            )
        )
    limitaciones = tuple(
        afirmacion(t, "limitations[].text", todas) for t in limitaciones_propuestas
    )
    return PlanDeSoporte(tuple(opciones), limitaciones)


def _afirmaciones_para_el_nli(plan: PlanDeSoporte) -> Iterator[Afirmacion]:
    """Lo que de verdad va al NLI, en un orden único que comparten ``pares_a_verificar`` y ``verificar_soporte``.

    RN-23: una afirmación con lenguaje prohibido nunca puede quedar soportada, ni aunque el NLI la implicara; por eso no
    se envía (además ahorra inferencia), y tampoco las de una opción cuyo propio texto ya incumple.
    """
    for opcion in plan.opciones:
        if not opcion.option.reglas:
            yield from (a for a in opcion.afirmaciones if not a.reglas)
            for parrafo in opcion.detalles:
                if not any(a.reglas for a in parrafo):
                    yield from parrafo
    yield from (limitacion for limitacion in plan.limitaciones if not limitacion.reglas)


def pares_a_verificar(plan: PlanDeSoporte) -> list[ParNli]:
    return [
        ParNli(premisa, a.texto) for a in _afirmaciones_para_el_nli(plan) for premisa in a.premisas
    ]


def _veredictos_por_afirmacion(
    plan: PlanDeSoporte, resultados: Sequence[ResultadoNli], umbral: float
) -> dict[Afirmacion, bool]:
    """Asigna los resultados del NLI a SU afirmación: único recorrido de ``_afirmaciones_para_el_nli``.

    Cada afirmación toma tantos resultados como premisas envió, en el orden de ``pares_a_verificar``; una afirmación es
    soportada si alguna premisa la soporta (``soporta``). Si el total no cuadra, es un error de contrato (RN-01): el
    NLI nunca reparte un ``entailment`` a una afirmación que no lo pidió.
    """
    if len(resultados) != sum(len(a.premisas) for a in _afirmaciones_para_el_nli(plan)):
        raise ValueError("la cantidad de resultados del NLI no coincide con la de pares")
    veredictos: dict[Afirmacion, bool] = {}
    inicio = 0
    for afirmacion in _afirmaciones_para_el_nli(plan):
        fin = inicio + len(afirmacion.premisas)
        veredictos[afirmacion] = any(soporta(r, umbral) for r in resultados[inicio:fin])
        inicio = fin
    return veredictos


def verificar_soporte(
    plan: PlanDeSoporte, resultados: Sequence[ResultadoNli], umbral: float, idioma: str
) -> ResultadoSoporte:
    """RN-01: opción = todas sus afirmaciones soportadas; limitación = soportada o se omite y se cuenta.

    ``resultados`` alinea 1:1 con ``pares_a_verificar(plan)``; cualquier otra cantidad es un error de contrato.
    """
    veredictos = _veredictos_por_afirmacion(plan, resultados, umbral)
    literal = literal_de_retiro(idioma)
    soportadas: list[OpcionAceptada] = []
    descartadas: list[OpcionSinSoporte] = []
    parrafos_omitidos = 0
    for planificada in plan.opciones:
        sin_soporte = _descartar_si_no_se_soporta(planificada, veredictos, literal)
        if sin_soporte is None:
            aceptada, omitidos = _con_detalles_soportados(planificada, veredictos)
            soportadas.append(aceptada)
            parrafos_omitidos += omitidos
        else:
            descartadas.append(sin_soporte)
    limitaciones = [x.texto for x in plan.limitaciones if not x.reglas and veredictos[x]]
    return ResultadoSoporte(
        tuple(soportadas),
        tuple(descartadas),
        tuple(limitaciones),
        len(plan.limitaciones) - len(limitaciones) + parrafos_omitidos,
    )


def _con_detalles_soportados(
    planificada: OpcionPlanificada, veredictos: dict[Afirmacion, bool]
) -> tuple[OpcionAceptada, int]:
    """El detalle es opcional: un párrafo se conserva solo si TODAS sus afirmaciones se soportan y cumplen RN-23.

    El que no, se omite (no descarta la opción, que ya se soportó) y se cuenta; sin párrafos válidos, ``details`` queda
    vacío y la respuesta lo omite.
    """
    aceptada = planificada.aceptada
    if not planificada.detalles:
        return aceptada, 0
    conservados = [
        texto
        for texto, parrafo in zip(aceptada.opcion.details, planificada.detalles, strict=True)
        if parrafo and not any(a.reglas for a in parrafo) and all(veredictos[a] for a in parrafo)
    ]
    omitidos = len(planificada.detalles) - len(conservados)
    return replace(aceptada, opcion=replace(aceptada.opcion, details=tuple(conservados))), omitidos


def _descartar_si_no_se_soporta(
    planificada: OpcionPlanificada, veredictos: dict[Afirmacion, bool], literal: str
) -> OpcionSinSoporte | None:
    """``None`` si todas las afirmaciones de la opción se soportan; si no, la opción descartada con sus afirmaciones.

    Lo prohibido se reemplaza por ``literal`` (RN-23) y cuenta como sin soporte; una opción cuyo propio texto incumple
    se descarta entera sin veredictos del NLI. Sin afirmaciones verificables no hay soporte (falla cerrado).
    """
    sin_soporte: list[str] = []
    partes: list[str] = []
    retirada = bool(planificada.option.reglas)
    if retirada:
        sin_soporte.append(literal)
    for afirmacion in planificada.afirmaciones:
        if afirmacion.reglas:
            sin_soporte.append(literal)
            partes.append(literal)
            continue
        partes.append(afirmacion.texto)
        if not retirada and not veredictos[afirmacion]:
            sin_soporte.append(afirmacion.texto)
    if planificada.afirmaciones and not sin_soporte:
        return None
    origen = planificada.aceptada.opcion
    return OpcionSinSoporte(
        OpcionGenerada(
            literal if retirada else origen.option, " ".join(partes), origen.chunk_ids_citados
        ),
        tuple(sin_soporte),
    )


def retirar_texto_prohibido(
    opcion: OpcionGenerada, buscar_terminos: BuscadorDeTerminos, idioma: str
) -> tuple[OpcionGenerada, tuple[RetiroDeLenguaje, ...]]:
    """RN-23 en una opción que ya salió del flujo (descartada por sus citas): sus fragmentos prohibidos se reemplazan."""
    literal = literal_de_retiro(idioma)
    retiros: list[RetiroDeLenguaje] = []
    reglas_de_la_opcion = tuple(buscar_terminos(opcion.option, "option"))
    if reglas_de_la_opcion:
        retiros.append(RetiroDeLenguaje("option", reglas_de_la_opcion))
    partes = []
    for afirmacion in dividir_en_afirmaciones(opcion.rationale):
        reglas = tuple(buscar_terminos(afirmacion, "rationale"))
        if reglas:
            retiros.append(RetiroDeLenguaje("rationale", reglas))
        partes.append(literal if reglas else afirmacion)
    if not retiros:
        return opcion, ()
    return (
        OpcionGenerada(
            literal if reglas_de_la_opcion else opcion.option,
            " ".join(partes),
            opcion.chunk_ids_citados,
        ),
        tuple(retiros),
    )
