"""Resolución del soporte por papel (RN-01, RN-23, US-245): del plan y los resultados del NLI a soportadas y descartadas.

Reglas puras, sin E/S. La decisión por papel vive en ``soporte_por_papel``; aquí se aplica a cada opción planificada.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import replace

from app.domain.atribucion import componer_con_marco, marco_de_atribucion
from app.domain.citations import OpcionAceptada, OpcionGenerada
from app.domain.claims import PapelDeAfirmacion
from app.domain.nli import ResultadoNli
from app.domain.soporte_por_papel import (
    DecisionPorPapel,
    EstadoDeAfirmacion,
    MotivoDeSoporte,
    decidir_opcion_por_papel,
    decidir_opcion_retirada_por_lenguaje,
    es_causa_de_descarte,
    estado_por_lenguaje_y_forma,
)
from app.domain.support import (
    Afirmacion,
    AfirmacionPorPapel,
    OpcionPlanificada,
    OpcionSinSoporte,
    PlanDeSoporte,
    ResultadoSoporte,
    literal_de_retiro,
    literal_de_texto_no_mostrado,
    veredictos_por_afirmacion,
)


def verificar_soporte(
    plan: PlanDeSoporte, resultados: Sequence[ResultadoNli], umbral: float, idioma: str
) -> ResultadoSoporte:
    """RN-01: opción = regla por papel de sus afirmaciones; limitación = soportada o se omite y se cuenta.

    ``resultados`` alinea 1:1 con ``pares_a_verificar(plan)``; cualquier otra cantidad es un error de contrato.
    """
    veredictos = veredictos_por_afirmacion(plan, resultados, umbral)
    soportadas: list[OpcionAceptada] = []
    descartadas: list[OpcionSinSoporte] = []
    omitidas = 0
    for planificada in plan.opciones:
        resuelta, omitidas_por_papel = resolver_por_papel(planificada, veredictos, idioma)
        omitidas += omitidas_por_papel
        if isinstance(resuelta, OpcionSinSoporte):
            descartadas.append(resuelta)
        else:
            soportadas.append(resuelta)
    limitaciones = [x.texto for x in plan.limitaciones if not x.reglas and veredictos[x]]
    return ResultadoSoporte(
        tuple(soportadas),
        tuple(descartadas),
        tuple(limitaciones),
        len(plan.limitaciones) - len(limitaciones) + omitidas,
    )


def resolver_por_papel(
    planificada: OpcionPlanificada, veredictos: Mapping[Afirmacion, bool], idioma: str
) -> tuple[OpcionAceptada | OpcionSinSoporte, int]:
    """Aplica la regla por papel a una opción.

    Conservada: ``rationale`` y ``details`` se recomponen SOLO con las afirmaciones que se soportaron (las secundarias
    omitidas no salen en ningún campo) y se devuelven las omitidas. Descartada: ver ``_descartar_por_papel``.
    """
    estados = [(a.papel, _estado_de(a, veredictos)) for a in planificada.afirmaciones]
    decision = (
        decidir_opcion_retirada_por_lenguaje()
        if planificada.option.reglas
        else decidir_opcion_por_papel(estados)
    )
    if not decision.conservar:
        return _descartar_por_papel(planificada, estados, decision, idioma), 0
    origen = planificada.aceptada.opcion
    conservadas = tuple(
        atomica
        for posicion, atomica in enumerate(origen.afirmaciones)
        if posicion not in decision.posiciones_omitidas
    )
    composicion = componer_con_marco(conservadas, idioma)
    opcion = replace(
        origen,
        rationale=composicion.rationale,
        details=composicion.details,
        afirmaciones=conservadas,
    )
    return replace(planificada.aceptada, opcion=opcion), len(decision.posiciones_omitidas)


def _estado_de(
    afirmacion: AfirmacionPorPapel, veredictos: Mapping[Afirmacion, bool]
) -> EstadoDeAfirmacion:
    """Lenguaje de la lista → forma → NLI (el NLI solo juzga lo que llegó en forma)."""
    estado = estado_por_lenguaje_y_forma(afirmacion.reglas, afirmacion.forma)
    if estado is not EstadoDeAfirmacion.en_forma:
        return estado
    return (
        EstadoDeAfirmacion.soportada_por_nli
        if veredictos.get(afirmacion, False)
        else EstadoDeAfirmacion.sin_soporte
    )


def texto_a_mostrar(texto: str, estado: EstadoDeAfirmacion, idioma: str) -> str:
    """El texto de una afirmación solo sale si no incumple la lista ni llegó fuera de forma (RN-23); si no, un literal."""
    if estado is EstadoDeAfirmacion.lenguaje_no_permitido:
        return literal_de_retiro(idioma)
    if estado in (EstadoDeAfirmacion.modal_normativo, EstadoDeAfirmacion.fuera_de_forma):
        return literal_de_texto_no_mostrado(idioma)
    return texto


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
        (papel, estado, texto_a_mostrar(afirmacion.texto, estado, idioma))
        for afirmacion, (papel, estado) in zip(planificada.afirmaciones, estados, strict=True)
    ]
    causas = [texto for papel, estado, texto in visibles if es_causa_de_descarte(papel, estado)]
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
