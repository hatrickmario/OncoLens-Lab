"""Soporte de las afirmaciones generadas (RN-01) y retiro del lenguaje no permitido (RN-23): reglas puras, sin E/S."""

from __future__ import annotations

from collections.abc import Callable, Iterator, Mapping, Sequence
from dataclasses import dataclass, replace
from typing import Literal, get_args

from app.domain.atribucion import (
    CLAIM_MAX_WORDS_INICIAL,
    FormaDeAfirmacion,
    componer_con_marco,
    marco_de_atribucion,
    validar_forma_de_afirmacion,
)
from app.domain.citations import OpcionAceptada, OpcionGenerada
from app.domain.claims import AfirmacionAtomica, PapelDeAfirmacion, dividir_en_afirmaciones
from app.domain.lenguaje import Coincidencia, ListaTerminos, Nivel, check_prohibited_terms
from app.domain.nli import ParNli, ResultadoNli
from app.domain.soporte_por_papel import (
    DecisionPorPapel,
    EstadoDeAfirmacion,
    MotivoDeSoporte,
    decidir_opcion_por_papel,
)

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
    texto: str, campo: CampoGenerado, lista: ListaTerminos, niveles: Sequence[Nivel]
) -> list[Coincidencia]:
    """RN-23: solo se revisan los campos GENERADOS; los copiados del corpus pueden traer vocabulario de la lista."""
    if campo not in CAMPOS_GENERADOS:
        return []
    return check_prohibited_terms(texto, lista, niveles=niveles, permitir_frases=False)


RETIRO_ES = "[afirmación retirada: formulación no permitida]"
RETIRO_EN = "[claim removed: disallowed wording]"
NO_MOSTRADO_ES = "(texto no mostrado)"
NO_MOSTRADO_EN = "(text not shown)"

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
    # Solo en las afirmaciones atómicas de una opción con ``claims[]`` (US-245): su papel y si llegan en forma.
    papel: PapelDeAfirmacion | None = None
    forma: FormaDeAfirmacion = FormaDeAfirmacion.valida


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
        return tuple(RetiroDeLenguaje(f.campo, f.reglas, f.papel) for f in fragmentos if f.reglas)


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


def planificar_soporte(
    aceptadas: Sequence[OpcionAceptada],
    limitaciones_propuestas: Sequence[str],
    textos_de_chunks: Mapping[str, str],
    buscar_terminos: BuscadorDeTerminos,
    *,
    max_palabras: int = CLAIM_MAX_WORDS_INICIAL,
) -> PlanDeSoporte:
    """Divide cada justificación en afirmaciones, asigna sus premisas y marca lo que incumple el lenguaje (RN-23).

    Las premisas de una opción son los chunks que cita; las de una limitación, todos los entregados a la generación.
    Una opción con afirmaciones atómicas (US-245) conserva cada una con su papel y solo con SUS chunks citados como
    premisa; ``max_palabras`` es ``CLAIM_MAX_WORDS``.
    """

    def afirmacion(texto: str, campo: CampoGenerado, premisas: tuple[str, ...]) -> Afirmacion:
        return Afirmacion(texto, campo, tuple(buscar_terminos(texto, campo)), premisas)

    todas = tuple(textos_de_chunks.values())
    opciones = []
    for aceptada in aceptadas:
        if aceptada.opcion.afirmaciones:
            opciones.append(
                _planificar_opcion_atomica(
                    aceptada, textos_de_chunks, buscar_terminos, max_palabras
                )
            )
            continue
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


def _planificar_opcion_atomica(
    aceptada: OpcionAceptada,
    textos_de_chunks: Mapping[str, str],
    buscar_terminos: BuscadorDeTerminos,
    max_palabras: int,
) -> OpcionPlanificada:
    """Cada afirmación atómica con su papel, su forma, su lenguaje y SOLO el texto de los chunks válidos que ella cita."""
    return OpcionPlanificada(
        aceptada,
        Afirmacion(
            aceptada.opcion.option,
            "option",
            tuple(buscar_terminos(aceptada.opcion.option, "option")),
            (),
        ),
        tuple(
            _planificar_afirmacion_atomica(
                a, aceptada.chunk_ids_validos, textos_de_chunks, buscar_terminos, max_palabras
            )
            for a in aceptada.opcion.afirmaciones
        ),
    )


def _planificar_afirmacion_atomica(
    afirmacion: AfirmacionAtomica,
    chunk_ids_validos: Sequence[str],
    textos_de_chunks: Mapping[str, str],
    buscar_terminos: BuscadorDeTerminos,
    max_palabras: int,
) -> Afirmacion:
    campo: CampoGenerado = (
        "rationale" if afirmacion.papel is PapelDeAfirmacion.principal else "details"
    )
    citados = dict.fromkeys(c for c in afirmacion.chunk_ids if c in chunk_ids_validos)
    return Afirmacion(
        afirmacion.texto,
        campo,
        tuple(buscar_terminos(afirmacion.texto, campo)),
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
            for parrafo in opcion.detalles:
                if not any(a.reglas for a in parrafo):
                    yield from parrafo
    yield from (limitacion for limitacion in plan.limitaciones if not limitacion.reglas)


def pares_a_verificar(plan: PlanDeSoporte) -> list[ParNli]:
    return [
        ParNli(premisa, a.texto) for a in afirmaciones_para_el_nli(plan) for premisa in a.premisas
    ]


def _veredictos_por_afirmacion(
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
        if planificada.aceptada.opcion.afirmaciones:
            resuelta, omitidas_por_papel = _resolver_por_papel(planificada, veredictos, idioma)
            parrafos_omitidos += omitidas_por_papel
            if isinstance(resuelta, OpcionSinSoporte):
                descartadas.append(resuelta)
            else:
                soportadas.append(resuelta)
            continue
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


def _estado_por_lenguaje_y_forma(
    reglas: tuple[str, ...], forma: FormaDeAfirmacion
) -> EstadoDeAfirmacion:
    """Orden de validación previo al NLI: lenguaje de la lista → forma. ``soportada`` solo significa «llega en forma»."""
    if reglas:
        return EstadoDeAfirmacion.lenguaje_no_permitido
    if forma is FormaDeAfirmacion.modal_normativo:
        return EstadoDeAfirmacion.modal_normativo
    if forma is not FormaDeAfirmacion.valida:
        return EstadoDeAfirmacion.fuera_de_forma
    return EstadoDeAfirmacion.soportada


def _estado_de(afirmacion: Afirmacion, veredictos: Mapping[Afirmacion, bool]) -> EstadoDeAfirmacion:
    """Lenguaje de la lista → forma → NLI (el NLI solo juzga lo que llegó en forma)."""
    estado = _estado_por_lenguaje_y_forma(afirmacion.reglas, afirmacion.forma)
    if estado is not EstadoDeAfirmacion.soportada:
        return estado
    return (
        EstadoDeAfirmacion.soportada
        if veredictos.get(afirmacion, False)
        else EstadoDeAfirmacion.sin_soporte
    )


def _resolver_por_papel(
    planificada: OpcionPlanificada, veredictos: Mapping[Afirmacion, bool], idioma: str
) -> tuple[OpcionAceptada | OpcionSinSoporte, int]:
    """Aplica ``decidir_opcion_por_papel`` a una opción con afirmaciones atómicas.

    Conservada: ``rationale`` y ``details`` se recomponen SOLO con las afirmaciones que se soportaron (las secundarias
    omitidas no salen en ningún campo) y se devuelven las omitidas. Descartada: ver ``_descartar_por_papel``.
    """
    afirmaciones = planificada.afirmaciones
    estados = [(a.papel, _estado_de(a, veredictos)) for a in afirmaciones if a.papel is not None]
    decision = decidir_opcion_por_papel(estados, option_incumple=bool(planificada.option.reglas))
    if not decision.conservar:
        return _descartar_por_papel(planificada, estados, decision, idioma), 0
    origen = planificada.aceptada.opcion
    conservadas = tuple(
        atomica
        for posicion, atomica in enumerate(origen.afirmaciones)
        if posicion not in decision.omitidas
    )
    composicion = componer_con_marco(conservadas, idioma)
    opcion = replace(
        origen,
        rationale=composicion.rationale,
        details=composicion.details,
        afirmaciones=conservadas,
    )
    return replace(planificada.aceptada, opcion=opcion), len(decision.omitidas)


def _texto_a_mostrar(texto: str, estado: EstadoDeAfirmacion, idioma: str) -> str:
    """El texto de una afirmación solo sale si no incumple la lista ni llegó fuera de forma (RN-23); si no, un literal."""
    if estado is EstadoDeAfirmacion.lenguaje_no_permitido:
        return literal_de_retiro(idioma)
    if estado in (EstadoDeAfirmacion.modal_normativo, EstadoDeAfirmacion.fuera_de_forma):
        return literal_de_texto_no_mostrado(idioma)
    return texto


def _causa_el_descarte(papel: PapelDeAfirmacion, estado: EstadoDeAfirmacion) -> bool:
    """Lenguaje de la lista y modal normativo descartan en cualquier papel; el resto, solo la principal y la salvedad."""
    return estado in (
        EstadoDeAfirmacion.lenguaje_no_permitido,
        EstadoDeAfirmacion.modal_normativo,
    ) or (papel is not PapelDeAfirmacion.secundaria and estado is not EstadoDeAfirmacion.soportada)


def _descartar_por_papel(
    planificada: OpcionPlanificada,
    estados: Sequence[tuple[PapelDeAfirmacion, EstadoDeAfirmacion]],
    decision: DecisionPorPapel,
    idioma: str,
) -> OpcionSinSoporte:
    """``unsupportedClaims`` lista solo las causas del descarte; una secundaria sin respaldo no es causa y no se muestra.
    La justificación de la descartada nunca expone una principal retirada u oculta."""
    origen = planificada.aceptada.opcion
    retirada = bool(planificada.option.reglas)
    visibles = [
        (papel, estado, _texto_a_mostrar(afirmacion.texto, estado, idioma))
        for afirmacion, (papel, estado) in zip(planificada.afirmaciones, estados, strict=True)
    ]
    causas = [texto for papel, estado, texto in visibles if _causa_el_descarte(papel, estado)]
    if retirada:
        causas.insert(0, literal_de_retiro(idioma))
    principal_visible = next(
        texto for papel, _, texto in visibles if papel is PapelDeAfirmacion.principal
    )
    return OpcionSinSoporte(
        OpcionGenerada(
            literal_de_retiro(idioma) if retirada else origen.option,
            marco_de_atribucion(idioma) + principal_visible,
            origen.chunk_ids_citados,
        ),
        tuple(causas),
        decision.motivo or MotivoDeSoporte.afirmacion_sin_soporte,
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
    con_lenguaje = retirada or any(a.reglas for a in planificada.afirmaciones)
    return OpcionSinSoporte(
        OpcionGenerada(
            literal if retirada else origen.option, " ".join(partes), origen.chunk_ids_citados
        ),
        tuple(sin_soporte),
        MotivoDeSoporte.lenguaje_no_permitido
        if con_lenguaje
        else MotivoDeSoporte.afirmacion_sin_soporte,
    )


def retirar_texto_prohibido(
    opcion: OpcionGenerada,
    buscar_terminos: BuscadorDeTerminos,
    idioma: str,
    max_palabras: int = CLAIM_MAX_WORDS_INICIAL,
) -> tuple[OpcionGenerada, tuple[RetiroDeLenguaje, ...]]:
    """RN-23 en una opción que ya salió del flujo (descartada por sus citas): sus fragmentos prohibidos se reemplazan.

    Con afirmaciones atómicas, la justificación de la descartada es el marco más la principal, y una principal prohibida o
    fuera de forma nunca se expone (se sustituye por el literal de retiro o por «(texto no mostrado)»).
    """
    literal = literal_de_retiro(idioma)
    retiros: list[RetiroDeLenguaje] = []
    reglas_de_la_opcion = tuple(buscar_terminos(opcion.option, "option"))
    if reglas_de_la_opcion:
        retiros.append(RetiroDeLenguaje("option", reglas_de_la_opcion))
    if opcion.afirmaciones:
        return _retirar_de_la_principal(
            opcion, reglas_de_la_opcion, retiros, buscar_terminos, idioma, max_palabras
        )
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


def _retirar_de_la_principal(
    opcion: OpcionGenerada,
    reglas_de_la_opcion: tuple[str, ...],
    retiros: list[RetiroDeLenguaje],
    buscar_terminos: BuscadorDeTerminos,
    idioma: str,
    max_palabras: int,
) -> tuple[OpcionGenerada, tuple[RetiroDeLenguaje, ...]]:
    literal = literal_de_retiro(idioma)
    principal = next(a for a in opcion.afirmaciones if a.papel is PapelDeAfirmacion.principal)
    reglas = tuple(buscar_terminos(principal.texto, "rationale"))
    if reglas:
        retiros.append(RetiroDeLenguaje("rationale", reglas, PapelDeAfirmacion.principal))
    estado = _estado_por_lenguaje_y_forma(
        reglas, validar_forma_de_afirmacion(principal.texto, max_palabras)
    )
    visible = _texto_a_mostrar(principal.texto, estado, idioma)
    return (
        OpcionGenerada(
            literal if reglas_de_la_opcion else opcion.option,
            marco_de_atribucion(idioma) + visible,
            opcion.chunk_ids_citados,
        ),
        tuple(retiros),
    )
