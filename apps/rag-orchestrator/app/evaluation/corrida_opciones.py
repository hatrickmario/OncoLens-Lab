"""Corrida de la familia `opciones` de `evaluate` (US-140, L1D-246).

Ejecuta el análisis en proceso (``RAGOrchestratorService`` real con la aplicabilidad por criterio, el LLM, el NLI, el
reranker y Milvus falsos o locales según la configuración) con hasta ``maxOptions`` opciones sobre el dataset sintético
``data/evaluation/opciones/``; mide M-10.1, M-10.2, fidelidad y precisión de citas, el orden de RN-28 sobre los resúmenes
que devuelve cada análisis y las opciones esperadas; escribe el reporte cerrado y sale con el código 3 si una invariante
vale lo que no debe o si la fidelidad o la precisión de citas retroceden más que la tolerancia de la configuración.

Códigos: 0 correcto · 1 la suite no corre · 2 configuración o entrada inválida · 3 invariante violada o retroceso. Solo
ids de caso, de opción, de regla y agregados en el reporte y en los mensajes (RN-14).
"""

from __future__ import annotations

import argparse
import asyncio
import copy
import sys
import time
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.application.ports import Clock
from app.config.settings import Settings
from app.domain.aplicabilidad_tipos import CriterioEvaluado
from app.domain.applicability_order import contar_excluyentes_no_coincide
from app.domain.support import OpcionPlanificada, PlanDeSoporte, afirmaciones_para_el_nli
from app.evaluation.afirmaciones import plan_de_la_propuesta
from app.evaluation.catalogo_con_poblacion import CatalogoConPoblacion
from app.evaluation.composicion_suite import (
    AplicabilidadDeLaSuite,
    ServicioDeSuite,
    componer_servicio,
)
from app.evaluation.config_opciones import (
    ConfigOpciones,
    Referencia,
    cargar_config_opciones,
    leer_referencia,
)
from app.evaluation.config_suite import ConfigSuite, cargar_config_suite
from app.evaluation.corrida import evaluar_pregunta_tolerante, solicitud_base
from app.evaluation.cronometro import Cronometro, RelojSimulado
from app.evaluation.dataset_opciones import (
    DatasetOpciones,
    cargar_criterios,
    cargar_dataset_opciones,
)
from app.evaluation.esquema_suite import ESQUEMA_OPCIONES, VERSION_ESQUEMA
from app.evaluation.guardas import exigir_adapters_locales, exigir_proveedor_local
from app.evaluation.llamadas import RegistroDeLlamadas
from app.evaluation.metas import cargar_metas, marcar_frente_a_meta
from app.evaluation.metricas import opciones_mostradas as medidas
from app.evaluation.metricas.citas import precision_de_citas
from app.evaluation.metricas.fidelidad import fidelidad
from app.evaluation.metricas.opciones_mostradas import (
    AnalisisDeOpciones,
    OpcionMostrada,
    Retroceso,
    Violacion,
    retrocesos_frente_a_la_referencia,
    violaciones_de,
)
from app.evaluation.metricas.orden_opciones import OpcionOrdenable
from app.evaluation.metricas.resultado import ResultadoConsulta
from app.evaluation.metricas.salidas_invalidas import (
    CODIGO_SALIDAS_INVALIDAS,
    avisar_de_las_salidas_invalidas,
    salidas_invalidas,
)
from app.evaluation.modelos_locales import OrigenLocal, PuertosLocales, cargar_puertos_locales
from app.evaluation.reporte import escribir_reporte_cerrado
from app.evaluation.rotulo import rotular_validada
from app.evaluation.rutas import raiz_repo
from app.schemas.generated.models import (
    EvidenceOption,
    RagQueryInternalResponse,
    SourceApplicability,
)

SUITE_OPCIONES = "opciones"
CODIGO_INVARIANTE_VIOLADA = 3
SALIDA_POR_DEFECTO = Path("eval") / "results"
CLAVE_DE_META_FIDELIDAD = "fidelidad_proxy"
CLAVE_DE_META_PRECISION = "precision_citas"
ORIGEN_DE_LAS_METAS = "metas_iniciales_dec07_pendiente"
ALCANCE_DE_LA_REVISION = "preguntas"


@dataclass(frozen=True)
class MedicionDeOpciones:
    """Lo que la corrida conserva de los 12 análisis: de aquí salen las métricas, las invariantes y el reporte."""

    analisis: tuple[AnalisisDeOpciones, ...]
    resultados: tuple[ResultadoConsulta, ...]
    version_de_la_lista: str
    """Versión de la lista de términos prohibidos con la que se midió M-10.2 (RN-23)."""


Medidor = Callable[[ConfigOpciones, DatasetOpciones], MedicionDeOpciones]


@dataclass(frozen=True)
class PuertosDeOpciones:
    """Borde que un test puede sustituir; sin él la familia compone los adaptadores de la configuración."""

    medidor: Medidor | None = None


def ejecutar_opciones(
    args: argparse.Namespace,
    ajustes: Mapping[str, str],
    reloj: Clock,
    origen: OrigenLocal,
    puertos: PuertosDeOpciones,
) -> int:
    """La familia completa; ``ConfigInvalida``, ``DatasetInvalido`` y ``SuiteAbortada`` los traduce ``evaluate.main``."""
    suite = cargar_config_suite(args.config, ajustes)
    config = cargar_config_opciones(args.config, suite)
    referencia = leer_referencia(
        config.reporte_de_referencia
    )  # antes de consultar: sin referencia no hay corrida
    dataset = cargar_dataset_opciones(suite.dataset)  # se niega si no es sintético, antes de medir
    exigir_adapters_locales(dataset.base.clase, suite.urls)
    exigir_proveedor_local(suite)
    medidor = puertos.medidor or (lambda c, d: asyncio.run(medir_opciones(c, d, reloj, origen)))
    medido = medidor(config, dataset)
    reporte = _reporte(config, dataset, medido, referencia)
    print(_aviso_de_la_revision(medido))
    escribir_reporte_cerrado(_ruta_del_resultado(config, args, reloj), reporte, ESQUEMA_OPCIONES)
    return _veredicto(medido, _retrocesos(medido, config, referencia))


def _aviso_de_la_revision(medido: MedicionDeOpciones) -> str:
    """Qué alcanza la revisión humana: solo las preguntas; las fuentes esperadas y el orden no están revisados."""
    revisadas = sum(a.revisada for a in medido.analisis)
    return (
        f"evaluate: preguntas revisadas por el oncólogo: {revisadas} de {len(medido.analisis)}; "
        "las fuentes esperadas y el orden no están revisados clínicamente"
    )


async def medir_opciones(
    config: ConfigOpciones, dataset: DatasetOpciones, reloj: Clock, origen: OrigenLocal
) -> MedicionDeOpciones:
    servicio = servicio_de_la_familia(config, dataset, reloj, origen)
    analisis: list[AnalisisDeOpciones] = []
    resultados: list[ResultadoConsulta] = []
    for indice, pregunta in enumerate(dataset.base.preguntas):
        caso = dataset.caso_de(pregunta.id)
        base = solicitud_del_caso(dataset.contextos[caso.paciente])
        resultado, respuesta = await evaluar_pregunta_tolerante(
            servicio, dataset.base, base, pregunta, indice, config.max_options
        )
        analisis.append(
            await _analisis_de(servicio, dataset, pregunta.id, pregunta.texto, resultado, respuesta)
        )
        resultados.append(resultado)
    return MedicionDeOpciones(
        tuple(analisis), tuple(resultados), servicio.verificador_produccion.version
    )


def servicio_de_la_familia(
    config: ConfigOpciones, dataset: DatasetOpciones, reloj: Clock, origen: OrigenLocal
) -> ServicioDeSuite:
    """El servicio de la suite con la aplicabilidad por criterio y la población de cada documento del dataset."""
    suite = config.suite
    cronometro = Cronometro(RelojSimulado() if suite.reloj == "simulado" else time.perf_counter)
    return componer_servicio(
        suite,
        dataset.base,
        cronometro,
        reloj,
        puertos_locales=_puertos_locales(suite, dataset, origen),
        aplicabilidad=AplicabilidadDeLaSuite(
            cargar_criterios(dataset),
            CatalogoConPoblacion(
                dataset.base,
                dataset.poblaciones,
                Settings().population_max_values_per_criterion,
            ),
        ),
    )


def _puertos_locales(
    suite: ConfigSuite, dataset: DatasetOpciones, origen: OrigenLocal
) -> PuertosLocales | None:
    if suite.proveedor != "local":
        return None
    return cargar_puertos_locales(suite, origen, RegistroDeLlamadas(), dataset.base.clase)


def solicitud_del_caso(contexto: Mapping[str, Any]) -> dict[str, Any]:
    """La solicitud de ``contracts/examples`` con el contexto desidentificado del paciente del caso."""
    base = solicitud_base()
    base["clinicalContext"] = copy.deepcopy(dict(contexto))
    return base


# --- lo que cada análisis conserva ----------------------------------------------------------------------------------


async def _analisis_de(
    servicio: ServicioDeSuite,
    dataset: DatasetOpciones,
    caso_id: str,
    texto_de_la_pregunta: str,
    resultado: ResultadoConsulta,
    respuesta: RagQueryInternalResponse | None,
) -> AnalisisDeOpciones:
    """``respuesta`` ``None`` = salida inválida del LLM: el caso no muestra ninguna opción y cuenta contra las esperadas."""
    caso = dataset.caso_de(caso_id)
    por_nombre = _plan_por_opcion(servicio, dataset, texto_de_la_pregunta)
    entregados = servicio.observaciones.entregados.get(texto_de_la_pregunta, frozenset())
    memoria = _Memoria.de(dataset, caso.paciente)
    mostradas = (
        []
        if respuesta is None
        else [
            await _opcion_mostrada(
                servicio, respuesta, opcion, posicion, entregados, por_nombre, memoria
            )
            for posicion, opcion in enumerate(respuesta.evidenceOptions, 1)
        ]
    )
    return AnalisisDeOpciones(
        caso=caso_id,
        revisada=resultado.revisada,
        opciones=tuple(mostradas),
        esperadas=caso.esperadas,
        espera_no_comparable=caso.no_comparable_mostrada,
        campos_nivel_a=resultado.salidas_mostradas_nivel_a,
        campos_nivel_b=resultado.salidas_mostradas_nivel_b,
        campos_con_termino=resultado.campos_mostrados,
    )


@dataclass(frozen=True)
class _Memoria:
    """Lo que no puede ser cita (RN-24): todo lo que no es un chunk del corpus y los textos de los análisis previos."""

    chunks_del_corpus: frozenset[str]
    textos_previos: tuple[str, ...]

    @classmethod
    def de(cls, dataset: DatasetOpciones, paciente: str) -> _Memoria:
        previos = dataset.contextos[paciente].get("priorAnalyses") or []
        textos = [
            texto
            for p in previos
            for texto in (
                p.get("question"),
                p.get("synthesisSummary"),
                *p.get("optionsDescribed", []),
            )
            if texto
        ]
        return cls(frozenset(c.id for c in dataset.base.chunks), tuple(textos))

    def es_citada_por(self, opcion: EvidenceOption) -> bool:
        return any(
            f.chunkId not in self.chunks_del_corpus
            or any(texto in f.chunkTextSnapshot for texto in self.textos_previos)
            for f in opcion.citedSources
        )


def _plan_por_opcion(
    servicio: ServicioDeSuite, dataset: DatasetOpciones, texto_de_la_pregunta: str
) -> dict[str, OpcionPlanificada]:
    """El plan de soporte de la propuesta cruda, por nombre de opción: de ahí salen las afirmaciones de cada una."""
    obs = servicio.observaciones
    propuesta = obs.propuestas.get(texto_de_la_pregunta)
    if propuesta is None:
        return {}
    plan = plan_de_la_propuesta(
        propuesta,
        obs.textos_entregados[texto_de_la_pregunta],
        servicio.verificador_produccion.reglas_coincidentes,
        max_palabras=servicio.claim_max_words,
        titulos_de_chunks=dataset.base.titulos_de_chunks(),
    )
    return {p.aceptada.opcion.option: p for p in plan.opciones}


async def _opcion_mostrada(
    servicio: ServicioDeSuite,
    respuesta: RagQueryInternalResponse,
    opcion: EvidenceOption,
    posicion: int,
    entregados: frozenset[str],
    plan: Mapping[str, OpcionPlanificada],
    memoria: _Memoria,
) -> OpcionMostrada:
    fuentes = opcion.citedSources
    return OpcionMostrada(
        id=f"o{posicion}",
        documentos=tuple(sorted({f.externalId for f in fuentes})),
        cita_a_chunk_entregado=bool(fuentes) and all(f.chunkId in entregados for f in fuentes),
        soporte_nli=await _tiene_soporte(servicio, plan.get(opcion.option)),
        ordenable=ordenable_de(respuesta.applicability, opcion, f"o{posicion}"),
        fuente_evaluada=fuente_evaluada(respuesta.applicability, opcion),
        memoria_citada=memoria.es_citada_por(opcion),
    )


async def _tiene_soporte(servicio: ServicioDeSuite, planificada: OpcionPlanificada | None) -> bool:
    """Todas las afirmaciones atómicas de la opción tienen veredicto ``entailment`` del NLI registrado (RN-01).

    Recalculado aquí, no leído del ensamblado del servicio. Una opción que el plan no conoce o sin afirmaciones no tiene
    soporte (falla cerrado)."""
    if planificada is None:
        return False
    afirmaciones = list(afirmaciones_para_el_nli(PlanDeSoporte((planificada,), ())))
    if not afirmaciones:
        return False
    for afirmacion in afirmaciones:
        if not await servicio.juez_nli.juzgar_soporte(afirmacion.texto, afirmacion.premisas):
            return False
    return True


def criterios_evaluados_del_contrato(fuente: SourceApplicability) -> list[CriterioEvaluado]:
    """Los criterios de la respuesta como ``CriterioEvaluado`` del dominio: así la regla de los excluyentes en No coincide
    tiene un solo dueño (``domain/applicability_order``)."""
    return [
        CriterioEvaluado(
            clave=c.criterion,
            valor_paciente=c.patientValue,
            valor_estudio=c.studyPopulationValue,
            estado=c.status.value,
            causa=None,
            es_excluyente=c.isExclusionary,
        )
        for c in fuente.criteria
    ]


def _fuente_mas_aplicable(
    aplicabilidad: Sequence[SourceApplicability], opcion: EvidenceOption
) -> SourceApplicability | None:
    """La fuente de ``perSource[0]`` (ya en orden de RN-28, ADR-31) tal como figura en ``applicability``."""
    if not opcion.perSource:
        return None
    return next((f for f in aplicabilidad if f.externalId == opcion.perSource[0].externalId), None)


def fuente_evaluada(aplicabilidad: Sequence[SourceApplicability], opcion: EvidenceOption) -> bool:
    return _fuente_mas_aplicable(aplicabilidad, opcion) is not None


def ordenable_de(
    aplicabilidad: Sequence[SourceApplicability], opcion: EvidenceOption, identificador: str
) -> OpcionOrdenable:
    """Los datos de la fuente más aplicable de la opción (``perSource[0]``, ADR-31): su resumen, si es no comparable y,
    de ``applicability``, cuántos criterios excluyentes tiene en No coincide (el contrato no los trae por opción)."""
    fuente = _fuente_mas_aplicable(aplicabilidad, opcion)
    criterios = criterios_evaluados_del_contrato(fuente) if fuente else []
    return OpcionOrdenable(
        id=identificador,
        excluyentes_no_coincide=contar_excluyentes_no_coincide(criterios),
        coincide=opcion.applicabilitySummary.coincide,
        relevance_score=opcion.relevanceScore,
        poblacion_no_comparable=opcion.populationNotComparable,
    )


# --- veredicto ------------------------------------------------------------------------------------------------------


def _retrocesos(
    medido: MedicionDeOpciones, config: ConfigOpciones, referencia: Referencia
) -> tuple[Retroceso, ...]:
    return retrocesos_frente_a_la_referencia(
        _cifras_de_calidad(medido.resultados),
        referencia.medidas,
        config.faithfulness_regression_tolerance,
    )


def _cifras_de_calidad(resultados: Sequence[ResultadoConsulta]) -> dict[str, float | None]:
    return {
        "fidelidad": fidelidad(resultados, None, None)["nli"]["fidelidad"],
        "precision_citas": precision_de_citas(resultados)["precision"],
    }


def _violaciones(medido: MedicionDeOpciones) -> tuple[Violacion, ...]:
    return tuple(v for a in medido.analisis for v in violaciones_de(a))


def _veredicto(medido: MedicionDeOpciones, retrocesos: Sequence[Retroceso]) -> int:
    violaciones = _violaciones(medido)
    for v in violaciones:
        detalle = f" ({v.detalle})" if v.detalle else ""
        print(f"evaluate: invariante violada: {v.invariante} en {v.caso}{detalle}", file=sys.stderr)
    for r in retrocesos:
        print(
            f"evaluate: retroceso de {r.metrica}: valor {r.valor}, referencia {r.referencia}, "
            f"tolerancia {r.tolerancia}",
            file=sys.stderr,
        )
    invalidas = salidas_invalidas(medido.resultados)
    if invalidas is not None:
        print(avisar_de_las_salidas_invalidas(invalidas), file=sys.stderr)
    if violaciones or retrocesos:
        return CODIGO_INVARIANTE_VIOLADA
    return 0 if invalidas is None else CODIGO_SALIDAS_INVALIDAS


# --- reporte --------------------------------------------------------------------------------------------------------


def _reporte(
    config: ConfigOpciones,
    dataset: DatasetOpciones,
    medido: MedicionDeOpciones,
    referencia: Referencia,
) -> dict[str, Any]:
    revisadas = MedicionDeOpciones(
        tuple(a for a in medido.analisis if a.revisada),
        tuple(r for r in medido.resultados if r.revisada),
        medido.version_de_la_lista,
    )
    invalidas = salidas_invalidas(medido.resultados)
    return {
        "esquema": VERSION_ESQUEMA,
        "suite": SUITE_OPCIONES,
        "configuracion": _configuracion(config, dataset, medido.version_de_la_lista),
        "metricas": _metricas(medido),
        "alcance_de_la_revision": ALCANCE_DE_LA_REVISION,
        "metricas_validadas": _metricas(revisadas),
        "invariantes": _invariantes(medido),
        "regresion": _regresion(config, medido, referencia),
        "metas": _metas(config, medido),
        **({} if invalidas is None else {"salidas_invalidas": invalidas}),
    }


def _configuracion(
    config: ConfigOpciones, dataset: DatasetOpciones, version_de_la_lista: str
) -> dict[str, Any]:
    suite = config.suite
    u = suite.umbrales
    return {
        "nombre": suite.nombre,
        "hashConfig": suite.hash_config,
        "fixture": suite.fixture,
        "claseDataset": dataset.base.clase,
        "dataset": {"nombre": dataset.base.nombre, "version": dataset.base.version},
        "proveedor": suite.proveedor,
        "reloj": suite.reloj,
        "catalogVersion": suite.catalogo_version,
        "maxOptions": config.max_options,
        "modelos": {"llm": suite.llm_modelo},
        "umbrales": {
            "relevanceThreshold": u.relevance_threshold,
            "nliEntailmentThreshold": u.nli_entailment_threshold,
            "retrievalTopK": u.retrieval_top_k,
            "rerankTopN": u.rerank_top_n,
        },
        "versionListaTerminos": version_de_la_lista,
    }


def _metricas(medido: MedicionDeOpciones) -> dict[str, Any]:
    analisis, resultados = medido.analisis, medido.resultados
    validacion = _validacion(analisis)
    familias = {
        "m_10_1": medidas.m_10_1(analisis),
        "m_10_2": medidas.m_10_2(analisis),
        "citas": precision_de_citas(resultados),
        "fidelidad": fidelidad(resultados, None, None)["nli"],
        "opciones_por_analisis": medidas.media_de_opciones(analisis),
        "orden_rn28": medidas.orden_rn28(analisis),
        "no_comparable": medidas.no_comparable(analisis),
        "esperadas_presentes": medidas.esperadas_presentes(analisis),
    }
    return {nombre: {**familia, "validacion": validacion} for nombre, familia in familias.items()}


def _validacion(analisis: Sequence[AnalisisDeOpciones]) -> dict[str, Any]:
    validadas = sum(a.revisada for a in analisis)
    return {
        "preguntas_validadas": validadas,
        "preguntas_no_validadas": len(analisis) - validadas,
        "rotulo": rotular_validada(validadas, len(analisis) - validadas).rotulo,
    }


def _invariantes(medido: MedicionDeOpciones) -> dict[str, Any]:
    violaciones = _violaciones(medido)
    return {
        "cumplidas": not violaciones,
        "violaciones": [
            {"invariante": v.invariante, "caso": v.caso, "detalle": v.detalle or None}
            for v in violaciones
        ],
    }


def _regresion(
    config: ConfigOpciones, medido: MedicionDeOpciones, referencia: Referencia
) -> dict[str, Any]:
    actual = _cifras_de_calidad(medido.resultados)
    retrocesos = {r.metrica for r in _retrocesos(medido, config, referencia)}
    return {
        "reporte_referencia": _ruta_en_el_repo(config.reporte_de_referencia),
        "dataset_de_la_referencia": referencia.dataset,
        "tolerancia": config.faithfulness_regression_tolerance,
        "metricas": [
            {
                "metrica": metrica,
                "valor": actual[metrica],
                "referencia": base,
                "retroceso": metrica in retrocesos,
            }
            for metrica, base in referencia.medidas.items()
        ],
    }


def _ruta_en_el_repo(ruta: Path) -> str:
    try:
        return ruta.relative_to(raiz_repo()).as_posix()
    except ValueError:
        return ruta.name


def _metas(config: ConfigOpciones, medido: MedicionDeOpciones) -> dict[str, Any]:
    """Fidelidad y precisión de citas frente a las metas iniciales (DEC-07 pendiente): «fuera de meta» no bloquea."""
    metas = cargar_metas(config.metas)
    cifras = _cifras_de_calidad(medido.resultados)
    marcadas = marcar_frente_a_meta(
        {
            CLAVE_DE_META_FIDELIDAD: cifras["fidelidad"],
            CLAVE_DE_META_PRECISION: cifras["precision_citas"],
        },
        {clave: meta for clave, meta in metas.items() if clave in _CLAVES_DE_META},
    )
    return {
        "origen": ORIGEN_DE_LAS_METAS,
        "metricas": [
            {
                "metrica": m.clave,
                "valor": m.valor,
                "meta": metas[m.clave].minimo,
                "estado": m.estado.replace(" ", "_"),
            }
            for m in marcadas
        ],
    }


_CLAVES_DE_META = (CLAVE_DE_META_FIDELIDAD, CLAVE_DE_META_PRECISION)


def _ruta_del_resultado(config: ConfigOpciones, args: argparse.Namespace, reloj: Clock) -> Path:
    carpeta = args.salida or raiz_repo() / "apps" / "rag-orchestrator" / SALIDA_POR_DEFECTO
    return carpeta / (
        args.nombre_archivo
        or f"{reloj.ahora().date().isoformat()}-{config.suite.hash_config}-{SUITE_OPCIONES}.json"
    )
