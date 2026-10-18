"""Soporte de las afirmaciones generadas (RN-01) y retiro del lenguaje no permitido (RN-23): reglas puras, sin E/S."""

from __future__ import annotations

from collections.abc import Callable, Iterator, Mapping, Sequence
from dataclasses import dataclass

from app.domain.citations import OpcionAceptada, OpcionGenerada
from app.domain.claims import dividir_en_afirmaciones
from app.domain.nli import ParNli, ResultadoNli

CAMPOS_GENERADOS = ("option", "rationale", "unsupportedClaims", "limitations[].text", "synthesis")
RETIRO_ES = "[afirmación retirada: formulación no permitida]"
RETIRO_EN = "[claim removed: disallowed wording]"

BuscadorDeTerminos = Callable[[str, str], Sequence[str]]
"""``(texto, campo) -> ids de regla``: el puerto ``ProhibitedTermsChecker`` visto desde el dominio."""


@dataclass(frozen=True)
class Afirmacion:
    """Un fragmento generado, el campo del que sale y las reglas de lenguaje que incumple (vacío = limpio)."""

    texto: str
    campo: str
    reglas: tuple[str, ...]
    premisas: tuple[str, ...]


@dataclass(frozen=True)
class RetiroDeLenguaje:
    """Un fragmento retirado por lenguaje no permitido: solo el campo y las reglas, jamás el texto (RN-23, RN-10)."""

    campo: str
    reglas: tuple[str, ...]


@dataclass(frozen=True)
class OpcionPlanificada:
    aceptada: OpcionAceptada
    option: Afirmacion
    afirmaciones: tuple[Afirmacion, ...]


@dataclass(frozen=True)
class PlanDeSoporte:
    opciones: tuple[OpcionPlanificada, ...]
    limitaciones: tuple[Afirmacion, ...]

    @property
    def retiros(self) -> tuple[RetiroDeLenguaje, ...]:
        """Los fragmentos que incumplen el lenguaje (RN-23): campo y reglas, nunca el texto."""
        fragmentos = [f for o in self.opciones for f in (o.option, *o.afirmaciones)] + list(
            self.limitaciones
        )
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
    """Soporte por UMBRAL sobre ``p_entailment`` (RN-01, RN-22); una ``contradiction`` jamás soporta (falla cerrado)."""
    return resultado.label != "contradiction" and resultado.p_entailment >= umbral


def planificar_soporte(
    aceptadas: Sequence[OpcionAceptada],
    limitaciones_propuestas: Sequence[str],
    textos_de_chunks: Mapping[str, str],
    buscar_terminos: BuscadorDeTerminos,
) -> PlanDeSoporte:
    """Divide cada justificación en afirmaciones, asigna sus premisas y marca lo que incumple el lenguaje (RN-23).

    Las premisas de una opción son los chunks que cita; las de una limitación, todos los entregados a la generación.
    """

    def afirmacion(texto: str, campo: str, premisas: tuple[str, ...]) -> Afirmacion:
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
            )
        )
    limitaciones = tuple(
        afirmacion(t, "limitations[].text", todas) for t in limitaciones_propuestas
    )
    return PlanDeSoporte(tuple(opciones), limitaciones)


def _afirmaciones_para_el_nli(plan: PlanDeSoporte) -> Iterator[Afirmacion]:
    """Lo que de verdad va al NLI, en un orden único que comparten ``pares_a_verificar`` y ``verificar_soporte``.

    Una afirmación con lenguaje prohibido ya está perdida: no se envía (ahorra inferencia), y tampoco las de una opción
    cuyo texto ya incumple.
    """
    for opcion in plan.opciones:
        if not opcion.option.reglas:
            yield from (a for a in opcion.afirmaciones if not a.reglas)
    yield from (limitacion for limitacion in plan.limitaciones if not limitacion.reglas)


def pares_a_verificar(plan: PlanDeSoporte) -> list[ParNli]:
    return [
        ParNli(premisa, a.texto) for a in _afirmaciones_para_el_nli(plan) for premisa in a.premisas
    ]


def verificar_soporte(
    plan: PlanDeSoporte, resultados: Sequence[ResultadoNli], umbral: float, idioma: str
) -> ResultadoSoporte:
    """RN-01: opción = todas sus afirmaciones soportadas; limitación = soportada o se omite y se cuenta.

    ``resultados`` alinea 1:1 con ``pares_a_verificar(plan)``; cualquier otra cantidad es un error de contrato.
    """
    disponibles = iter(resultados)

    def soportada(a: Afirmacion) -> bool:
        tomados = [next(disponibles, None) for _ in a.premisas]
        if None in tomados:
            raise ValueError("faltan resultados del NLI")
        return any(soporta(r, umbral) for r in tomados if r is not None)

    literal = literal_de_retiro(idioma)
    soportadas: list[OpcionAceptada] = []
    descartadas: list[OpcionSinSoporte] = []
    for planificada in plan.opciones:
        sin_soporte, partes = [], []
        retirada = bool(planificada.option.reglas)
        if retirada:
            sin_soporte.append(literal)
        for a in planificada.afirmaciones:
            if a.reglas:
                sin_soporte.append(literal)
                partes.append(literal)
                continue
            partes.append(a.texto)
            if not retirada and not soportada(a):
                sin_soporte.append(a.texto)
        if planificada.afirmaciones and not sin_soporte:
            soportadas.append(planificada.aceptada)
            continue
        origen = planificada.aceptada.opcion
        descartadas.append(
            OpcionSinSoporte(
                OpcionGenerada(
                    literal if retirada else origen.option,
                    " ".join(partes),
                    origen.chunk_ids_citados,
                ),
                tuple(sin_soporte),
            )
        )
    limitaciones = [x.texto for x in plan.limitaciones if not x.reglas and soportada(x)]
    if next(disponibles, None) is not None:
        raise ValueError("sobran resultados del NLI")
    return ResultadoSoporte(
        tuple(soportadas),
        tuple(descartadas),
        tuple(limitaciones),
        len(plan.limitaciones) - len(limitaciones),
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
