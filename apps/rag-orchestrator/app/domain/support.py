"""Plan de soporte de las afirmaciones generadas (RN-01) y lenguaje no permitido (RN-23): reglas puras, sin E/S.

Un solo camino: la opción llega con afirmaciones atómicas por papel (US-245). La resolución del veredicto vive en
``resolucion_de_soporte`` y el saneamiento de las descartadas por citas en ``saneamiento_de_descartadas``.
"""

from __future__ import annotations

from collections.abc import Iterator, Mapping, Sequence
from dataclasses import dataclass
from typing import Literal, Protocol, get_args

from app.domain.atribucion import (
    FormaDeAfirmacion,
    tiene_modal_normativo,
    validar_forma_de_afirmacion,
)
from app.domain.citations import OpcionAceptada, OpcionGenerada
from app.domain.claims import AfirmacionAtomica, PapelDeAfirmacion
from app.domain.lenguaje import (
    Coincidencia,
    FuenteCitada,
    ListaTerminos,
    Nivel,
    ReglasDeSalidaGenerada,
    check_prohibited_terms,
    tapar_citas_textuales_del_corpus,
)
from app.domain.nli import ParNli, ResultadoNli
from app.domain.soporte_por_papel import MotivoDeSoporte

CampoGenerado = Literal[
    "option",
    "rationale",
    "details",
    "unsupportedClaims",
    "limitations[].text",
    "synthesis",
    "studyPopulationValue",
    "studyPopulationValues[].value",
]
CAMPOS_GENERADOS: tuple[CampoGenerado, ...] = get_args(CampoGenerado)


def coincidencias_en_campo_generado(
    texto: str,
    campo: CampoGenerado,
    lista: ListaTerminos,
    fuentes: Sequence[FuenteCitada] = (),
    reglas: ReglasDeSalidaGenerada | None = None,
) -> list[Coincidencia]:
    """RN-23: la política de la salida generada es el Nivel A más ``salidaGenerada.nivelB`` de la lista.

    Solo se revisan los campos GENERADOS; los copiados del corpus pueden traer vocabulario de la lista. Una cita textual
    atribuida de un fragmento que la opción cita no activa el subconjunto B, pero nunca habilita el Nivel A.
    ``reglas`` solo lo pasa la suite para reproducir la política de una lista anterior (línea base, US-249 AC-5).
    """
    if campo not in CAMPOS_GENERADOS:
        return []
    reglas = reglas or lista.reglas_para_salida_generada()
    tapado = tapar_citas_textuales_del_corpus(texto, fuentes)
    coincidencias = check_prohibited_terms(
        tapado,
        lista,
        niveles=reglas.niveles,
        permitir_frases=False,
        solo_ids_b=reglas.ids_nivel_b,
        excepciones_b=reglas.excepciones_nivel_b,
    )
    if tapado == texto:
        return coincidencias
    del_nivel_a = check_prohibited_terms(texto, lista, niveles=("A",), permitir_frases=False)
    return list({c.id: c for c in [*coincidencias, *del_nivel_a]}.values())


def coincidencias_estrictas_en_campo_generado(
    texto: str, campo: CampoGenerado, lista: ListaTerminos, niveles: Sequence[Nivel]
) -> list[Coincidencia]:
    """Lo que mide la suite sobre lo que PROPONE el generador: todos los niveles pedidos, sin la política de salida."""
    if campo not in CAMPOS_GENERADOS:
        return []
    return check_prohibited_terms(texto, lista, niveles=niveles, permitir_frases=False)


RETIRO_ES = "[afirmación retirada: formulación no permitida]"
RETIRO_EN = "[claim removed: disallowed wording]"
NO_MOSTRADO_ES = "(texto no mostrado)"
NO_MOSTRADO_EN = "(text not shown)"


class BuscadorDeTerminos(Protocol):
    """``(texto, campo, fuentes) -> ids de regla``: el puerto ``ProhibitedTermsChecker`` visto desde el dominio.

    ``fuentes`` es OBLIGATORIO: los fragmentos (título y texto del corpus) con los que una cita textual atribuida no activa
    el subconjunto B (RN-23, US-249). Decisión por campo, y ``()`` solo donde es intencional:
    ``rationale`` y ``details`` reciben los fragmentos que cita la opción; ``limitations[].text`` recibe todos los
    entregados (son también sus premisas); ``option``, ``unsupportedClaims`` y las opciones descartadas por citas no
    reciben ninguno (un título o una afirmación sin soporte no es una cita), y ``studyPopulationValue(s)`` tampoco (valor
    extraído, no cita); ``synthesis`` no pasa por este puerto.
    """

    def __call__(
        self, texto: str, campo: CampoGenerado, fuentes: Sequence[FuenteCitada]
    ) -> Sequence[str]: ...


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


@dataclass(frozen=True, eq=False)
class AfirmacionPorPapel(Afirmacion):
    """Una afirmación atómica de una opción: su papel decide qué pasa si no se respalda y ``forma`` si llega en forma."""

    papel: PapelDeAfirmacion
    forma: FormaDeAfirmacion


@dataclass(frozen=True)
class RetiroDeLenguaje:
    """Un fragmento retirado por lenguaje no permitido: solo el campo y las reglas, jamás el texto (RN-23, RN-10)."""

    campo: CampoGenerado
    reglas: tuple[str, ...]
    papel: PapelDeAfirmacion | None = None


@dataclass(frozen=True)
class OpcionPlanificada:
    aceptada: OpcionAceptada
    option: Afirmacion
    afirmaciones: tuple[AfirmacionPorPapel, ...]


@dataclass(frozen=True)
class PlanDeSoporte:
    opciones: tuple[OpcionPlanificada, ...]
    limitaciones: tuple[Afirmacion, ...]

    @property
    def retiros(self) -> tuple[RetiroDeLenguaje, ...]:
        """Los fragmentos que incumplen el lenguaje (RN-23): campo y reglas, nunca el texto."""
        retiros: list[RetiroDeLenguaje] = []
        for opcion in self.opciones:
            if opcion.option.reglas:
                retiros.append(RetiroDeLenguaje(opcion.option.campo, opcion.option.reglas))
            retiros.extend(
                RetiroDeLenguaje(a.campo, a.reglas, a.papel)
                for a in opcion.afirmaciones
                if a.reglas
            )
        retiros.extend(RetiroDeLenguaje(x.campo, x.reglas) for x in self.limitaciones if x.reglas)
        return tuple(retiros)


@dataclass(frozen=True)
class OpcionSinSoporte:
    opcion: OpcionGenerada
    afirmaciones_sin_soporte: tuple[str, ...]
    motivo: MotivoDeSoporte = MotivoDeSoporte.afirmacion_sin_soporte


@dataclass(frozen=True)
class ResultadoSoporte:
    soportadas: tuple[OpcionAceptada, ...]
    descartadas: tuple[OpcionSinSoporte, ...]
    limitaciones: tuple[str, ...]
    omitidas: int


def literal_de_retiro(idioma: str) -> str:
    """El único texto que sustituye a un fragmento con lenguaje no permitido, en el idioma de la pregunta (decisión 16)."""
    return RETIRO_EN if idioma == "en" else RETIRO_ES


def literal_de_texto_no_mostrado(idioma: str) -> str:
    """Lo que ocupa el lugar de una afirmación fuera de forma (alias, longitud, artefactos o modal normativo): su texto nunca se expone."""
    return NO_MOSTRADO_EN if idioma == "en" else NO_MOSTRADO_ES


def soporta(resultado: ResultadoNli, umbral: float) -> bool:
    """Soporte: la clase más probable es ``entailment`` Y su probabilidad alcanza el umbral (RN-01, RN-22, D2)."""
    return resultado.label == "entailment" and resultado.p_entailment >= umbral


def exigir_afirmaciones_atomicas(opcion: OpcionGenerada) -> None:
    """RN-01: sin afirmaciones atómicas no hay qué verificar; una opción así jamás llega a un veredicto de soporte.

    Exige exactamente una principal, como el esquema de la generación: sin ella la justificación no se puede componer.
    """
    if not opcion.afirmaciones:
        raise ValueError("la opción debe llegar con afirmaciones atómicas por papel")
    principales = sum(a.papel is PapelDeAfirmacion.principal for a in opcion.afirmaciones)
    if principales != 1:
        raise ValueError("la opción debe llegar con exactamente una afirmación principal")


def planificar_soporte(
    aceptadas: Sequence[OpcionAceptada],
    limitaciones_propuestas: Sequence[str],
    textos_de_chunks: Mapping[str, str],
    buscar_terminos: BuscadorDeTerminos,
    *,
    max_palabras: int,
    titulos_de_chunks: Mapping[str, str] | None = None,
) -> PlanDeSoporte:
    """Asigna a cada afirmación atómica su papel, su forma, su lenguaje (RN-23) y SOLO los chunks que ella cita.

    Las premisas de una limitación son todos los chunks entregados a la generación. ``max_palabras`` es
    ``CLAIM_MAX_WORDS``. ``titulos_de_chunks`` (``chunkId -> título del catálogo``, RN-25) permite reconocer la cita
    textual atribuida («Según ‹título›: «…»») de los fragmentos que cita la opción; sin él no se tapa ninguna cita.
    """
    fuentes = FuentesDeLaConsulta(textos_de_chunks, titulos_de_chunks or {})
    opciones = tuple(
        _planificar_opcion(a, fuentes, buscar_terminos, max_palabras) for a in aceptadas
    )
    todas = tuple(textos_de_chunks.values())
    limitaciones = tuple(
        Afirmacion(
            t,
            "limitations[].text",
            tuple(buscar_terminos(t, "limitations[].text", fuentes.todas())),
            todas,
        )
        for t in limitaciones_propuestas
    )
    return PlanDeSoporte(opciones, limitaciones)


REGLA_MODAL_NORMATIVO = "modal_normativo"
"""Id de regla que el log registra cuando el título de la opción trae un modal normativo (D4-20); nunca el texto."""


def reglas_del_titulo(buscar_terminos: BuscadorDeTerminos, titulo: str) -> tuple[str, ...]:
    """Reglas que incumple el título de la opción (``option``): las de la lista prohibida (RN-23) y, además, la lista de
    modales normativos, que antes solo miraba las afirmaciones (D4-20)."""
    reglas = tuple(buscar_terminos(titulo, "option", ()))
    return (*reglas, REGLA_MODAL_NORMATIVO) if tiene_modal_normativo(titulo) else reglas


@dataclass(frozen=True)
class FuentesDeLaConsulta:
    """Texto y título de cada fragmento entregado a la generación en esta consulta."""

    textos: Mapping[str, str]
    titulos: Mapping[str, str]

    def citadas_por(self, chunk_ids: Sequence[str]) -> tuple[FuenteCitada, ...]:
        """Los fragmentos que cita una opción y de los que se conoce título y texto. Única regla, de producción y de la suite."""
        return tuple(
            FuenteCitada(self.titulos[c], self.textos[c])
            for c in dict.fromkeys(chunk_ids)
            if c in self.titulos and c in self.textos
        )

    def todas(self) -> tuple[FuenteCitada, ...]:
        """Todos los fragmentos entregados: las fuentes de una limitación, cuyas premisas también son todos (RN-01)."""
        return self.citadas_por(tuple(self.textos))


def campo_de_papel(papel: PapelDeAfirmacion) -> CampoGenerado:
    """El campo de la respuesta en el que cae una afirmación atómica: la principal es ``rationale`` y el resto ``details``."""
    return "rationale" if papel is PapelDeAfirmacion.principal else "details"


def _planificar_opcion(
    aceptada: OpcionAceptada,
    fuentes: FuentesDeLaConsulta,
    buscar_terminos: BuscadorDeTerminos,
    max_palabras: int,
) -> OpcionPlanificada:
    exigir_afirmaciones_atomicas(aceptada.opcion)
    citadas = fuentes.citadas_por(aceptada.chunk_ids_validos)
    return OpcionPlanificada(
        aceptada,
        Afirmacion(
            aceptada.opcion.option,
            "option",
            reglas_del_titulo(buscar_terminos, aceptada.opcion.option),
            (),
        ),
        tuple(
            _planificar_afirmacion(
                a,
                aceptada.chunk_ids_validos,
                fuentes.textos,
                citadas,
                buscar_terminos,
                max_palabras,
            )
            for a in aceptada.opcion.afirmaciones
        ),
    )


def _planificar_afirmacion(
    afirmacion: AfirmacionAtomica,
    chunk_ids_validos: Sequence[str],
    textos_de_chunks: Mapping[str, str],
    citadas_por_la_opcion: Sequence[FuenteCitada],
    buscar_terminos: BuscadorDeTerminos,
    max_palabras: int,
) -> AfirmacionPorPapel:
    campo = campo_de_papel(afirmacion.papel)
    citados = dict.fromkeys(c for c in afirmacion.chunk_ids if c in chunk_ids_validos)
    return AfirmacionPorPapel(
        afirmacion.texto,
        campo,
        tuple(buscar_terminos(afirmacion.texto, campo, citadas_por_la_opcion)),
        tuple(textos_de_chunks[c] for c in citados if c in textos_de_chunks),
        afirmacion.papel,
        validar_forma_de_afirmacion(afirmacion.texto, max_palabras),
    )


def afirmaciones_para_el_nli(plan: PlanDeSoporte) -> Iterator[Afirmacion]:
    """Lo que de verdad va al NLI, en un orden único que comparten ``pares_a_verificar`` y ``verificar_soporte``.

    RN-23: una afirmación con lenguaje prohibido nunca puede quedar soportada, ni aunque el NLI la implicara; por eso no
    se envía (además ahorra inferencia), y tampoco las de una opción cuyo propio texto ya incumple.
    """
    for opcion in plan.opciones:
        if not opcion.option.reglas:
            yield from (
                a
                for a in opcion.afirmaciones
                if not a.reglas and a.forma is FormaDeAfirmacion.valida
            )
    yield from (limitacion for limitacion in plan.limitaciones if not limitacion.reglas)


def pares_a_verificar(plan: PlanDeSoporte) -> list[ParNli]:
    return [
        ParNli(premisa, a.texto) for a in afirmaciones_para_el_nli(plan) for premisa in a.premisas
    ]


def veredictos_por_afirmacion(
    plan: PlanDeSoporte, resultados: Sequence[ResultadoNli], umbral: float
) -> dict[Afirmacion, bool]:
    """Asigna los resultados del NLI a SU afirmación: único recorrido de ``afirmaciones_para_el_nli``.

    Cada afirmación toma tantos resultados como premisas envió, en el orden de ``pares_a_verificar``; una afirmación es
    soportada si alguna premisa la soporta (``soporta``). Si el total no cuadra, es un error de contrato (RN-01): el
    NLI nunca reparte un ``entailment`` a una afirmación que no lo pidió.
    """
    if len(resultados) != sum(len(a.premisas) for a in afirmaciones_para_el_nli(plan)):
        raise ValueError("la cantidad de resultados del NLI no coincide con la de pares")
    veredictos: dict[Afirmacion, bool] = {}
    inicio = 0
    for afirmacion in afirmaciones_para_el_nli(plan):
        fin = inicio + len(afirmacion.premisas)
        veredictos[afirmacion] = any(soporta(r, umbral) for r in resultados[inicio:fin])
        inicio = fin
    return veredictos
