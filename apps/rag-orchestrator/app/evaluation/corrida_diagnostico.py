"""Corrida de la familia `diagnostico` de `evaluate` (US-276, L1D-334): en qué etapa de la consulta se pierde el fragmento
esperado cuando dos redacciones del mismo significado dan resultados distintos.

Ejecuta cada redacción del dataset ``parafrasis-v1`` por el ``RAGOrchestratorService`` real (con los adaptadores falsos o
locales de la configuración) sobre el corpus del dataset ``s5-corpus-ampliado`` en memoria. Unos observadores sobre los mismos
puertos anotan el orden denso, los pares y puntajes del *reranker* y el veredicto del NLI por afirmación (los eventos de log
no traen esos datos); las reglas puras de ``metricas/diagnostico.py`` asignan la pérdida de cada par a una sola etapa. Escribe
``<nombre>.json`` (esquema cerrado) y ``<nombre>.md`` (las mismas cifras) con ids, puestos y puntajes: nunca el texto de una
pregunta, de un chunk ni de una afirmación (RN-14).

Códigos: 0 correcto · 1 la suite no corre (dataset, proveedores o servicio) · 2 configuración o uso inválidos. La familia no
compara contra metas ni propone cambiar ningún umbral: es un insumo de diagnóstico.
"""

from __future__ import annotations

import argparse
import asyncio
import time
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Any

from app.application.errores import LlmSalidaInvalidaError
from app.application.ports import ChunkSearch, Clock
from app.evaluation.composicion_suite import (
    Adaptadores,
    ServicioDeSuite,
    adaptadores_de_suite,
    componer_servicio,
)
from app.evaluation.config_diagnostico import ConfigDiagnostico, cargar_config_diagnostico
from app.evaluation.config_suite import cargar_config_suite
from app.evaluation.corrida import MAX_OPCIONES, solicitud_base, solicitud_de
from app.evaluation.cronometro import Cronometro, RelojSimulado
from app.evaluation.dataset_diagnostico import (
    DatasetDiagnostico,
    ParDeParafrasis,
    RedaccionDePar,
    cargar_dataset_diagnostico,
    dataset_para_el_servicio,
)
from app.evaluation.esquema_suite import ESQUEMA_DIAGNOSTICO, VERSION_ESQUEMA
from app.evaluation.fuente_dataset import DatasetSuite
from app.evaluation.guardas import exigir_adapters_locales, exigir_proveedor_local
from app.evaluation.llamadas import RegistroDeLlamadas
from app.evaluation.metricas.diagnostico import (
    NOTA_DE_CALIBRACION,
    REGLA_DE_ASIGNACION,
    AsignacionDePar,
    RedaccionObservada,
    asignar_par,
    histograma_de_p_entailment,
    observar_chunk_esperado,
    recuento_de_causas_sin_asignar,
    recuento_en_banda,
    recuento_por_etapa,
)
from app.evaluation.modelos_locales import OrigenLocal, PuertosLocales, cargar_puertos_locales
from app.evaluation.observadores_diagnostico import (
    BuscadorDeDiagnostico,
    GeneradorDeDiagnostico,
    NliDeDiagnostico,
    RegistroDeDiagnostico,
    RerankerDeDiagnostico,
)
from app.evaluation.reporte import escribir_reporte_cerrado
from app.evaluation.rotulo import rotular_validada
from app.evaluation.rutas import raiz_repo
from app.schemas.generated.models import RagMeta, RagQueryInternalResponse

SUITE_DIAGNOSTICO = "diagnostico"
SALIDA_POR_DEFECTO = Path("eval") / "results"


@dataclass(frozen=True)
class PuertosDeDiagnostico:
    """Bordes que un test puede sustituir; sin ellos la familia compone los adaptadores de la configuración."""

    adaptadores: Adaptadores | None = None
    buscador: ChunkSearch | None = None
    """La búsqueda densa; por defecto, la búsqueda en memoria sobre el corpus del dataset."""


@dataclass(frozen=True)
class FilaDeRedaccion:
    """Una pregunta del informe: lo que cada etapa hizo con el primer fragmento esperado y cómo terminó la consulta.

    ``None`` = no observado (≠ ``0``): el chunk no llegó a esa etapa, el generador no se invocó o el NLI no recibió nada."""

    par: str
    redaccion: str
    pregunta_id: str
    idioma: str
    chunk_esperado: str | None
    puesto_denso: int | None
    entro_en_pares: bool | None
    relevance_score: float | None
    supero_umbral: bool | None
    con_evidencia: bool
    opciones_generadas: int | None
    opciones_mostradas: int
    opciones_descartadas: int
    afirmaciones_aprobadas: int | None
    afirmaciones_descartadas: int | None
    loops: int

    def observada(self) -> RedaccionObservada:
        al_nli = None
        if self.afirmaciones_aprobadas is not None and self.afirmaciones_descartadas is not None:
            al_nli = self.afirmaciones_aprobadas + self.afirmaciones_descartadas
        return RedaccionObservada(
            self.puesto_denso,
            self.entro_en_pares,
            self.supero_umbral,
            self.con_evidencia,
            self.opciones_generadas,
            al_nli,
        )


@dataclass(frozen=True)
class MedicionDeDiagnostico:
    filas: tuple[FilaDeRedaccion, ...]
    p_entailment_descartadas: tuple[float, ...]
    reranker_max_pairs: int | None
    salidas_invalidas: int
    modelos_respondidos: Mapping[str, str]
    """Embeddings, reranker y NLI que respondieron (``meta`` de la respuesta); vacío si ninguna respondió."""


def ejecutar_diagnostico(
    args: argparse.Namespace,
    ajustes: Mapping[str, str],
    reloj: Clock,
    origen: OrigenLocal,
    puertos: PuertosDeDiagnostico,
) -> int:
    """La familia completa; ``ConfigInvalida``, ``DatasetInvalido`` y ``SuiteAbortada`` los traduce ``evaluate.main``."""
    suite = cargar_config_suite(args.config, ajustes)
    config = cargar_config_diagnostico(args.config, suite)
    dataset = cargar_dataset_diagnostico(suite.dataset, config.pares_minimos)  # antes de medir
    exigir_adapters_locales(dataset.clase, suite.urls)
    exigir_proveedor_local(suite)
    medicion = asyncio.run(medir_diagnostico(config, dataset, origen, reloj, puertos))
    reporte = _reporte(config, dataset, medicion)
    ruta = _ruta_del_resultado(config, args, reloj)
    escribir_reporte_cerrado(ruta, reporte, ESQUEMA_DIAGNOSTICO)
    ruta.with_suffix(".md").write_text(informe_legible(reporte), encoding="utf-8")
    print(_resumen(reporte))
    return 0


# --- la medición --------------------------------------------------------------------------------------------------------


async def medir_diagnostico(
    config: ConfigDiagnostico,
    dataset: DatasetDiagnostico,
    origen: OrigenLocal,
    reloj: Clock,
    puertos: PuertosDeDiagnostico,
) -> MedicionDeDiagnostico:
    suite = config.suite
    registro = RegistroDeDiagnostico()
    corpus = dataset_para_el_servicio(dataset)
    locales = _puertos_locales(config, dataset, origen)
    servicio = _servicio(config, corpus, locales, puertos, registro, reloj)
    base = solicitud_base()
    filas: list[FilaDeRedaccion] = []
    descartadas: list[float] = []
    invalidas = 0
    modelos: dict[str, str] = {}
    for indice, (par, redaccion, pregunta) in enumerate(dataset.preguntas()):
        registro.reiniciar()
        solicitud = solicitud_de(
            base, pregunta, dataset.clase, indice, suite.catalogo_version, MAX_OPCIONES
        )
        try:
            respuesta: RagQueryInternalResponse | None = await servicio.servicio.consultar(
                solicitud
            )
        except (
            LlmSalidaInvalidaError
        ):  # una salida inválida del LLM es un caso sin evidencia, no el fin de la suite
            respuesta = None
            invalidas += 1
        filas.append(_fila(config, par, redaccion, respuesta, registro))
        descartadas.extend(a.p_entailment for a in registro.afirmaciones if not a.soportada)
        if respuesta is not None and not modelos:
            modelos = _modelos_de_recuperacion(respuesta.meta)
    return MedicionDeDiagnostico(
        tuple(filas),
        tuple(descartadas),
        locales.reranker_max_pairs if locales else config.reranker_max_pairs,
        invalidas,
        modelos,
    )


def _puertos_locales(
    config: ConfigDiagnostico, dataset: DatasetDiagnostico, origen: OrigenLocal
) -> PuertosLocales | None:
    if config.suite.proveedor != "local":
        return None
    return cargar_puertos_locales(config.suite, origen, RegistroDeLlamadas(), dataset.clase)


def _servicio(
    config: ConfigDiagnostico,
    corpus: DatasetSuite,
    locales: PuertosLocales | None,
    puertos: PuertosDeDiagnostico,
    registro: RegistroDeDiagnostico,
    reloj: Clock,
) -> ServicioDeSuite:
    """El servicio de la suite con los puertos de la configuración decorados por los observadores (sin cambiar su contrato)."""
    suite = config.suite
    base = puertos.adaptadores or adaptadores_de_suite(suite, corpus, locales)
    observados = replace(
        base,
        reranker=RerankerDeDiagnostico(base.reranker, registro),
        generador=GeneradorDeDiagnostico(base.generador, registro),
        clasificador_nli=NliDeDiagnostico(
            base.clasificador_nli, registro, suite.umbrales.nli_entailment_threshold
        ),
    )
    cronometro = Cronometro(RelojSimulado() if suite.reloj == "simulado" else time.perf_counter)
    return componer_servicio(
        suite,
        corpus,
        cronometro,
        reloj,
        puertos_locales=locales,
        adaptadores=observados,
        envolver_buscador=lambda interno: BuscadorDeDiagnostico(
            puertos.buscador or interno, registro
        ),
        reranker_max_pairs=config.reranker_max_pairs,
    )


def _fila(
    config: ConfigDiagnostico,
    par: ParDeParafrasis,
    redaccion: RedaccionDePar,
    respuesta: RagQueryInternalResponse | None,
    registro: RegistroDeDiagnostico,
) -> FilaDeRedaccion:
    """Lo observado de una consulta. Con varios loops (RN-02, ADR-52) la etapa se lee del ÚLTIMO: es el que decide lo que
    ve el médico (D5); ``loops`` cuenta cuántos hubo."""
    umbrales = config.suite.umbrales
    loops = registro.loops()
    observado = observar_chunk_esperado(
        par.chunks_esperados,
        loops[-1] if loops else None,
        umbrales.retrieval_top_k,
        umbrales.relevance_threshold,
    )
    afirmaciones = registro.afirmaciones
    return FilaDeRedaccion(
        par=par.id,
        redaccion=redaccion.id,
        pregunta_id=f"{par.id}-{redaccion.id}",
        idioma=redaccion.idioma,
        chunk_esperado=observado.chunk_esperado,
        puesto_denso=observado.puesto_denso,
        entro_en_pares=observado.entro_en_pares,
        relevance_score=observado.relevance_score,
        supero_umbral=observado.supero_umbral,
        con_evidencia=respuesta is not None and bool(respuesta.evidenceOptions),
        opciones_generadas=sum(registro.opciones_propuestas)
        if registro.opciones_propuestas
        else None,
        opciones_mostradas=len(respuesta.evidenceOptions) if respuesta else 0,
        opciones_descartadas=len(respuesta.discardedOptions) if respuesta else 0,
        afirmaciones_aprobadas=sum(a.soportada for a in afirmaciones) if afirmaciones else None,
        afirmaciones_descartadas=sum(not a.soportada for a in afirmaciones)
        if afirmaciones
        else None,
        loops=len(loops),
    )


def _modelos_de_recuperacion(meta: RagMeta) -> dict[str, str]:
    """Embeddings, reranker y NLI tal como los declaró el servicio (``<modelo>@<revisión>#sha256:<hash>``)."""
    return {
        "embeddings": meta.embeddingModel,
        "reranker": meta.rerankerModel,
        "nli": meta.nliModel,
    }


# --- el informe ---------------------------------------------------------------------------------------------------------


def _asignaciones(
    dataset: DatasetDiagnostico, filas: Sequence[FilaDeRedaccion]
) -> list[AsignacionDePar]:
    por_par: dict[str, list[tuple[str, RedaccionObservada]]] = {p.id: [] for p in dataset.pares}
    for fila in filas:
        por_par[fila.par].append((fila.redaccion, fila.observada()))
    return [asignar_par(par, redacciones) for par, redacciones in por_par.items()]


def _reporte(
    config: ConfigDiagnostico, dataset: DatasetDiagnostico, medicion: MedicionDeDiagnostico
) -> dict[str, Any]:
    suite = config.suite
    u = suite.umbrales
    asignaciones = _asignaciones(dataset, medicion.filas)
    tipos = {p.id: p.tipo for p in dataset.pares}
    descartadas = medicion.p_entailment_descartadas
    sin_validar = len(medicion.filas)
    return {
        "esquema": VERSION_ESQUEMA,
        "suite": SUITE_DIAGNOSTICO,
        "configuracion": {
            "nombre": suite.nombre,
            "hashConfig": suite.hash_config,
            "fixture": suite.fixture,
            "claseDataset": dataset.clase,
            "dataset": {"nombre": dataset.nombre, "version": dataset.version},
            "corpus": {
                "nombre": dataset.corpus.nombre,
                "version": dataset.corpus.version,
                "release": dataset.corpus.release,
                "recuento_de_chunks": len(dataset.corpus.chunks),
            },
            "proveedor": suite.proveedor,
            "reloj": suite.reloj,
            "catalogVersion": suite.catalogo_version,
            "modelos": {"llm": suite.llm_modelo, **medicion.modelos_respondidos},
            "umbrales": {
                "relevanceThreshold": u.relevance_threshold,
                "nliEntailmentThreshold": u.nli_entailment_threshold,
                "retrievalTopK": u.retrieval_top_k,
                "rerankTopN": u.rerank_top_n,
                "rerankerMaxPairs": medicion.reranker_max_pairs,
            },
        },
        "validacion": {
            "preguntas_validadas": 0,
            "preguntas_no_validadas": sin_validar,
            "rotulo": rotular_validada(0, sin_validar).rotulo,
        },
        "revision_provisional": {
            "rol": dataset.revision_provisional.rol,
            "fecha": dataset.revision_provisional.fecha,
        },
        "regla_de_asignacion": [
            {"orden": orden, "etapa": etapa, "condicion": condicion}
            for orden, etapa, condicion in REGLA_DE_ASIGNACION
        ],
        "preguntas": [_fila_del_informe(f) for f in medicion.filas],
        "pares": [
            {
                "par": a.par,
                "tipo": tipos[a.par],
                "resultado": a.resultado,
                "etapa": a.etapa,
                "causa": a.causa,
                "redaccion_perdida": a.redaccion_perdida,
            }
            for a in asignaciones
        ],
        "recuento_por_etapa": recuento_por_etapa(asignaciones),
        "sin_asignar_por_causa": recuento_de_causas_sin_asignar(asignaciones),
        "nli": {
            "umbral": u.nli_entailment_threshold,
            "banda_inferior": config.nli_banda_inferior,
            "ancho_de_tramo": config.nli_ancho_de_tramo,
            "descartadas": len(descartadas),
            "tramos": [
                {"desde": t.desde, "hasta": t.hasta, "recuento": t.recuento}
                for t in histograma_de_p_entailment(descartadas, config.nli_ancho_de_tramo)
            ],
            "en_banda": recuento_en_banda(
                descartadas, config.nli_banda_inferior, u.nli_entailment_threshold
            ),
            "nota": NOTA_DE_CALIBRACION,
        },
        "salidas_invalidas": medicion.salidas_invalidas,
    }


def _fila_del_informe(fila: FilaDeRedaccion) -> dict[str, Any]:
    return {
        "par": fila.par,
        "redaccion": fila.redaccion,
        "pregunta_id": fila.pregunta_id,
        "idioma": fila.idioma,
        "chunk_esperado": fila.chunk_esperado,
        "puesto_denso": fila.puesto_denso,
        "entro_en_pares": fila.entro_en_pares,
        "relevance_score": fila.relevance_score,
        "supero_umbral": fila.supero_umbral,
        "con_evidencia": fila.con_evidencia,
        "opciones_generadas": fila.opciones_generadas,
        "opciones_mostradas": fila.opciones_mostradas,
        "opciones_descartadas": fila.opciones_descartadas,
        "afirmaciones_aprobadas": fila.afirmaciones_aprobadas,
        "afirmaciones_descartadas": fila.afirmaciones_descartadas,
        "loops": fila.loops,
    }


def _celda(valor: object) -> str:
    return "—" if valor is None else str(valor)


def informe_legible(reporte: Mapping[str, Any]) -> str:
    """El mismo informe en Markdown: solo ids, puestos, puntajes y recuentos (RN-14). ``—`` es ``null`` (no observado)."""
    c = reporte["configuracion"]
    u = c["umbrales"]
    lineas = [
        f"# Diagnóstico por etapa de la consulta ({reporte['suite']})",
        "",
        f"Configuración `{c['nombre']}` (huella `{c['hashConfig']}`), dataset `{c['dataset']['nombre']}` "
        f"versión {c['dataset']['version']} sobre el corpus `{c['corpus']['nombre']}` "
        f"(release `{c['corpus']['release']}`, {c['corpus']['recuento_de_chunks']} chunks), proveedor `{c['proveedor']}`.",
        "",
        f"Umbrales: RETRIEVAL_TOP_K {u['retrievalTopK']}, RERANKER_MAX_PAIRS {_celda(u['rerankerMaxPairs'])}, "
        f"RELEVANCE_THRESHOLD {u['relevanceThreshold']}, NLI_ENTAILMENT_THRESHOLD {u['nliEntailmentThreshold']}.",
        f"Rótulo: `{reporte['validacion']['rotulo']}` (revisión provisional: rol "
        f"`{reporte['revision_provisional']['rol']}`, {reporte['revision_provisional']['fecha']}).",
        "",
        "## Regla de asignación de la etapa",
        "",
        "La pérdida se asigna a la primera etapa, en el orden del pipeline, que el fragmento esperado no supera:",
        "",
        *(
            f"{r['orden']}. `{r['etapa']}`: {r['condicion']}."
            for r in reporte["regla_de_asignacion"]
        ),
        "",
        "## Recuento por etapa",
        "",
        *(f"- `{etapa}`: {n}" for etapa, n in reporte["recuento_por_etapa"].items()),
        "",
        "## Por par",
        "",
        "| par | tipo | resultado | etapa | causa | redacción sin evidencia |",
        "|---|---|---|---|---|---|",
        *(
            f"| {p['par']} | {p['tipo']} | {p['resultado']} | {_celda(p['etapa'])} | {_celda(p['causa'])} "
            f"| {_celda(p['redaccion_perdida'])} |"
            for p in reporte["pares"]
        ),
        "",
        "## Por pregunta",
        "",
        "| pregunta | chunk esperado | puesto denso | en pares | relevance_score | supera umbral | con evidencia "
        "| opciones generadas | afirmaciones aprobadas | afirmaciones descartadas |",
        "|---|---|---|---|---|---|---|---|---|---|",
        *(
            f"| {f['pregunta_id']} | {_celda(f['chunk_esperado'])} | {_celda(f['puesto_denso'])} "
            f"| {_celda(f['entro_en_pares'])} | {_celda(f['relevance_score'])} | {_celda(f['supero_umbral'])} "
            f"| {f['con_evidencia']} | {_celda(f['opciones_generadas'])} | {_celda(f['afirmaciones_aprobadas'])} "
            f"| {_celda(f['afirmaciones_descartadas'])} |"
            for f in reporte["preguntas"]
        ),
        "",
        "## p_entailment de las afirmaciones descartadas por el NLI",
        "",
        f"Descartadas: {reporte['nli']['descartadas']}; entre {reporte['nli']['banda_inferior']} y "
        f"{reporte['nli']['umbral']}: {reporte['nli']['en_banda']}.",
        "",
        *(f"- [{t['desde']}, {t['hasta']}): {t['recuento']}" for t in reporte["nli"]["tramos"]),
        "",
        reporte["nli"]["nota"],
        "",
        "Muestra pequeña: el recuento por etapa orienta, no prueba.",
        "",
    ]
    return "\n".join(lineas)


def _resumen(reporte: Mapping[str, Any]) -> str:
    recuento = ", ".join(f"{etapa}={n}" for etapa, n in reporte["recuento_por_etapa"].items())
    return f"evaluate diagnostico: {len(reporte['pares'])} pares, {len(reporte['preguntas'])} preguntas; {recuento}"


def _ruta_del_resultado(config: ConfigDiagnostico, args: argparse.Namespace, reloj: Clock) -> Path:
    carpeta = args.salida or raiz_repo() / "apps" / "rag-orchestrator" / SALIDA_POR_DEFECTO
    nombre = args.nombre_archivo or (
        f"{reloj.ahora().date().isoformat()}-{config.suite.hash_config}-{SUITE_DIAGNOSTICO}"
    )
    return carpeta / (nombre if nombre.endswith(".json") else f"{nombre}.json")
