"""Corrida de la suite: cada pregunta pasa por ``RAGOrchestratorService`` en proceso y deja un ``ResultadoConsulta``."""

from __future__ import annotations

import copy
import json
from collections.abc import Sequence
from typing import Any, TypedDict

from app.application.ports import EvidenciaGenerada
from app.domain.alias_de_chunks import CITA_NO_TRADUCIBLE
from app.domain.citations import OpcionGenerada, validar_citas
from app.evaluation.afirmaciones import (
    AfirmacionAJuzgar,
    afirmaciones_a_juzgar,
    plan_de_la_propuesta,
)
from app.evaluation.composicion_suite import ServicioDeSuite
from app.evaluation.dataset_loader import Pregunta
from app.evaluation.fuente_dataset import DatasetSuite
from app.evaluation.juez_fidelidad import JuezFidelidad
from app.evaluation.lenguaje_estricto import VerificadorEstricto
from app.evaluation.metricas.inyeccion import es_inyeccion_efectiva
from app.evaluation.metricas.prescriptivas import (
    contar_salidas_con_terminos,
    medir_propuesta_cruda,
    medir_salida_mostrada,
)
from app.evaluation.metricas.resultado import LenguajeCrudo, ResultadoConsulta
from app.evaluation.retrieval_metrics import evaluar_pregunta
from app.evaluation.rutas import raiz_repo
from app.evaluation.salida_generada import (
    textos_de_opcion_mostrada,
    textos_de_propuesta,
    textos_de_respuesta,
)
from app.schemas.generated.models import (
    DataClassification,
    RagQueryInternalRequest,
    RagQueryInternalResponse,
    RagQueryStatus,
)

SOLICITUD_BASE = "contracts/examples/rag-query-request.json"
MAX_OPCIONES = 3


def citas_propuestas_de(opciones: Sequence[OpcionGenerada]) -> int:
    """Citas que propuso el generador (M-07.2): los ``chunkId`` reales repetidos en una opción cuentan una vez y cada
    ``CITA_NO_TRADUCIBLE`` cuenta aparte (dos alias inexistentes distintos son dos citas inválidas, no una)."""
    total = 0
    for opcion in opciones:
        no_traducibles = opcion.chunk_ids_citados.count(CITA_NO_TRADUCIBLE)
        reales = set(opcion.chunk_ids_citados) - {CITA_NO_TRADUCIBLE}
        total += len(reales) + no_traducibles
    return total


def solicitud_base() -> dict[str, Any]:
    return json.loads((raiz_repo() / SOLICITUD_BASE).read_text(encoding="utf-8"))


def solicitud_de(
    base: dict[str, Any], pregunta: Pregunta, clase: str, indice: int, catalogo_version: str
) -> RagQueryInternalRequest:
    """La solicitud de ``contracts/examples`` con la pregunta del dataset; el ``traceId`` es el índice (sin azar)."""
    cruda = copy.deepcopy(base)
    cruda["traceId"] = f"req_eval{indice:04d}"
    cruda["query"] = pregunta.texto
    cruda["maxOptions"] = MAX_OPCIONES
    cruda["catalogVersion"] = (
        catalogo_version  # NFR-14: la solicitud usa el catálogo de la configuración
    )
    cruda["dataClassification"] = DataClassification(clase).value
    cruda["clinicalContext"]["diagnosis"]["cancerType"] = pregunta.cancer
    return RagQueryInternalRequest.model_validate(cruda)


async def evaluar_dataset(
    suite: ServicioDeSuite, dataset: DatasetSuite
) -> tuple[list[ResultadoConsulta], list[RagQueryInternalResponse]]:
    base = solicitud_base()
    resultados: list[ResultadoConsulta] = []
    respuestas: list[RagQueryInternalResponse] = []
    for indice, pregunta in enumerate(dataset.preguntas):
        solicitud = solicitud_de(base, pregunta, dataset.clase, indice, suite.catalogo_version)
        generaciones_previas = suite.observaciones.generaciones
        respuesta = await suite.cronometro.medir_async(
            "consulta", suite.servicio.consultar, solicitud
        )
        invocado = suite.observaciones.generaciones > generaciones_previas
        resultados.append(await _resultado_de(suite, dataset, pregunta, respuesta, invocado))
        respuestas.append(respuesta)
    return resultados, respuestas


async def _resultado_de(
    suite: ServicioDeSuite,
    dataset: DatasetSuite,
    pregunta: Pregunta,
    respuesta: RagQueryInternalResponse,
    generador_invocado: bool,
) -> ResultadoConsulta:
    obs = suite.observaciones
    propuesta = obs.propuestas.get(pregunta.texto)
    citas_propuestas = citas_validas = 0
    if generador_invocado and propuesta is not None:
        revisadas = validar_citas(propuesta.opciones, obs.entregados[pregunta.texto])
        citas_validas = sum(len(a.chunk_ids_validos) for a in revisadas.aceptadas)
        citas_propuestas = citas_propuestas_de(propuesta.opciones)
    top = respuesta.topRelevanceScore
    en_nli, en_juez, invalidos = await _fidelidad_de(suite, pregunta.texto, generador_invocado)
    return ResultadoConsulta(
        recuperacion=evaluar_pregunta(pregunta, obs.rankings.get(pregunta.texto, [])),
        revisada=pregunta.id in dataset.revisadas,
        esperaba_sin_evidencia=pregunta.modo_acierto == "sin_evidencia",
        sin_evidencia=respuesta.status == RagQueryStatus.sin_evidencia,
        generador_invocado=generador_invocado,
        top_relevance_score=None if top is None else float(top),
        citas_propuestas=citas_propuestas,
        citas_validas=citas_validas,
        opciones_mostradas=len(respuesta.evidenceOptions),
        opciones_descartadas=len(respuesta.discardedOptions),
        **_lenguaje_de(suite, dataset, pregunta.texto, respuesta),
        afirmaciones_nli=en_nli,
        ids_afirmaciones=tuple(f"{pregunta.id}/a{n}" for n, _ in enumerate(en_nli, 1)),
        veredictos_invalidos_juez=invalidos,
        afirmaciones_juez=en_juez,
    )


class _LenguajeDeLaConsulta(TypedDict):
    salidas_prohibidas_crudas: int
    salidas_prohibidas_mostradas: int
    salidas_mostradas_nivel_a: int
    salidas_mostradas_nivel_b: int
    campos_mostrados: tuple[tuple[str, str], ...]
    lenguaje_crudo: LenguajeCrudo
    caso_inyeccion: bool
    inyecciones_efectivas: int


def _lenguaje_de(
    suite: ServicioDeSuite,
    dataset: DatasetSuite,
    texto_pregunta: str,
    respuesta: RagQueryInternalResponse,
) -> _LenguajeDeLaConsulta:
    """Términos prohibidos (RN-23) en la propuesta cruda y en lo mostrado, e inyección efectiva (SEG-13)."""
    verificador = suite.verificador_estricto
    propuesta = suite.observaciones.propuestas.get(texto_pregunta)
    entregados = suite.observaciones.entregados.get(texto_pregunta, frozenset())
    caso_inyeccion = bool(entregados & {c.id for c in dataset.chunks if c.inyeccion})
    efectivas = _inyecciones_efectivas(respuesta, entregados, verificador) if caso_inyeccion else 0
    mostrada = medir_salida_mostrada(textos_de_respuesta(respuesta), verificador)
    crudo = _lenguaje_crudo_de(
        suite, propuesta, suite.observaciones.textos_entregados.get(texto_pregunta, {})
    )
    return {
        "salidas_prohibidas_crudas": crudo.campos_con_termino,
        "salidas_prohibidas_mostradas": mostrada.campos_con_termino,
        "salidas_mostradas_nivel_a": mostrada.campos_nivel_a,
        "salidas_mostradas_nivel_b": mostrada.campos_nivel_b,
        "campos_mostrados": mostrada.campos,
        "lenguaje_crudo": crudo,
        "caso_inyeccion": caso_inyeccion,
        "inyecciones_efectivas": efectivas,
    }


def _lenguaje_crudo_de(
    suite: ServicioDeSuite, propuesta: EvidenciaGenerada | None, entregados: dict[str, str]
) -> LenguajeCrudo:
    """Términos por nivel en la propuesta cruda y cuáles copia del corpus que ella misma cita (ARR-03 AC-3, AC-4)."""
    if propuesta is None:
        return LenguajeCrudo()
    citados = {c for opcion in propuesta.opciones for c in opcion.chunk_ids_citados}
    return medir_propuesta_cruda(
        textos_de_propuesta(propuesta),
        [opcion.rationale for opcion in propuesta.opciones],
        [texto for chunk, texto in entregados.items() if chunk in citados],
        suite.verificador_estricto,
    )


def _inyecciones_efectivas(
    respuesta: RagQueryInternalResponse,
    entregados: frozenset[str],
    verificador: VerificadorEstricto,
) -> int:
    """Opciones mostradas que obedecieron la inyección: término prohibido o cita fuera de lo entregado (SEG-13)."""
    return sum(
        es_inyeccion_efectiva(
            tiene_termino_prohibido=bool(
                contar_salidas_con_terminos(textos_de_opcion_mostrada(opcion), verificador)
            ),
            chunks_citados={fuente.chunkId for fuente in opcion.citedSources},
            chunks_entregados=entregados,
        )
        for opcion in respuesta.evidenceOptions
    )


async def _fidelidad_de(
    suite: ServicioDeSuite, texto_pregunta: str, generador_invocado: bool
) -> tuple[tuple[bool, ...], tuple[bool, ...] | None, int]:
    """Veredicto por afirmación de la propuesta cruda: el NLI (principal), el juez LLM (secundario, si lo hay) y
    cuántos veredictos del juez no se pudieron interpretar en esta consulta."""
    propuesta = suite.observaciones.propuestas.get(texto_pregunta)
    if not generador_invocado or propuesta is None:
        return (), None if suite.juez_llm is None else (), 0
    plan = plan_de_la_propuesta(
        propuesta,
        suite.observaciones.textos_entregados[texto_pregunta],
        suite.verificador_produccion.reglas_coincidentes,
    )
    afirmaciones = afirmaciones_a_juzgar(plan)
    del_nli = await _veredictos(suite.juez_nli, afirmaciones)
    if suite.juez_llm is None:
        return del_nli, None, 0
    invalidos_antes = suite.juez_llm.veredictos_invalidos
    del_juez = await _veredictos(suite.juez_llm, afirmaciones)
    return del_nli, del_juez, suite.juez_llm.veredictos_invalidos - invalidos_antes


async def _veredictos(
    juez: JuezFidelidad, afirmaciones: list[AfirmacionAJuzgar]
) -> tuple[bool, ...]:
    return tuple([await juez.juzgar_soporte(a.texto, a.premisas) for a in afirmaciones])
