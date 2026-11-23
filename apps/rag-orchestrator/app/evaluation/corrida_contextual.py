"""Corrida de la familia `contextual` de `evaluate` (US-271 AC-9, L1D-329): qué preguntas superan ``RELEVANCE_THRESHOLD`` con el
contexto de un caso y la expansión contextual activa, y por qué no lo hacen las tres preguntas de sinónimos.

Ejecuta las 60 preguntas sintéticas de la medición de ADR-52 por el ``RAGOrchestratorService`` real (adaptadores falsos o
locales de la configuración) sobre el corpus del dataset ``s5-corpus-ampliado`` en memoria, una vez por caso del fixture
compartido, con el indicador de la expansión leído de la configuración. Escribe ``<nombre>.json`` (esquema cerrado) y
``<nombre>.md`` (las mismas cifras) con ids, estados, puntajes y recuentos: nunca el texto de una pregunta, de un chunk ni de
un término del caso (RN-14).

Códigos: 0 correcto · 1 la suite no corre (dataset, proveedores o servicio) · 2 configuración o uso inválidos. La familia no
compara contra metas ni cambia umbral, sinónimos o valores por defecto: es el reporte del AC-9.
"""

from __future__ import annotations

import argparse
import asyncio
import copy
import time
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Any

from app.application.errores import LlmSalidaInvalidaError
from app.application.ports import Clock, EvidenceGenerator, Reranker
from app.domain.expansion_contextual import ParametrosDeExpansionContextual
from app.domain.lenguaje import normalizar_texto
from app.evaluation.base_contextual import ReporteBase, exigir_mismo_corpus, leer_reporte_base
from app.evaluation.composicion_suite import (
    ExpansionDeLaSuite,
    ServicioDeSuite,
    adaptadores_de_suite,
    componer_servicio,
)
from app.evaluation.config_contextual import (
    ConfigContextual,
    PreguntaDeSinonimos,
    cargar_config_contextual,
)
from app.evaluation.config_suite import ConfigInvalida, cargar_config_suite
from app.evaluation.corrida import MAX_OPCIONES, solicitud_base, solicitud_de
from app.evaluation.cronometro import Cronometro, RelojSimulado
from app.evaluation.dataset_contextual import (
    CasoSintetico,
    DatasetContextual,
    PreguntaContextual,
    cargar_casos,
    cargar_dataset_contextual,
)
from app.domain.retrieval_filter import coincide_etiqueta
from app.evaluation.dataset_loader import Pregunta
from app.evaluation.fuente_dataset import DatasetSuite
from app.evaluation.esquema_suite import ESQUEMA_CONTEXTUAL, VERSION_ESQUEMA
from app.evaluation.guardas import exigir_adapters_locales, exigir_proveedor_local
from app.evaluation.llamadas import RegistroDeLlamadas
from app.evaluation.metricas.contextual import (
    ESTADO_CON_EVIDENCIA,
    ESTADO_SALIDA_INVALIDA,
    REGLA_DE_LA_CAUSA,
    SEGUNDO_LOOP_CONTEXTUAL,
    SEGUNDO_LOOP_NINGUNO,
    AdversariasDeCaso,
    CambioFrenteALaBase,
    ChunkPuntuado,
    CoberturaDeCaso,
    FilaContextual,
    RecuentoDeClase,
    adversarias_por_caso,
    causa_de_sinonimo,
    comparar_con_base,
    genericas_con_evidencia_por_caso,
    recuentos_por_clase,
)
from app.evaluation.modelos_locales import OrigenLocal, PuertosLocales, cargar_puertos_locales
from app.evaluation.ranking_contextual import RegistroDelRanking, RerankerQueRegistra
from app.evaluation.reporte import escribir_reporte_cerrado
from app.evaluation.rotulo import rotular_validada
from app.evaluation.rutas import raiz_repo
from app.infrastructure.catalogo_clinico.manifiesto import cargar_catalogo_del_manifiesto
from app.infrastructure.catalogo_clinico.sinonimos import cargar_sinonimos
from app.infrastructure.catalogo_clinico.terminos_del_caso import (
    cargar_catalogo_de_terminos,
    cargar_marcos_de_pregunta,
)
from app.schemas.generated.models import RagMeta, RagQueryInternalRequest, RagQueryInternalResponse

SUITE_CONTEXTUAL = "contextual"
SALIDA_POR_DEFECTO = Path("eval") / "results"
PREFIJO_DE_SEUDONIMO = "psd_eval"


def seudonimo_de_la_suite(indice: int) -> str:
    """Un seudónimo por consulta, sin azar: la suite no usa ningún identificador real y el índice la hace reproducible."""
    return f"{PREFIJO_DE_SEUDONIMO}{indice:08d}"


@dataclass(frozen=True)
class PuertosDeContextual:
    """Bordes que un test puede sustituir; sin ellos la familia compone los adaptadores de la configuración."""

    reranker: Reranker | None = None
    """El *reranker*; por defecto, el de los adaptadores de la configuración."""
    generador: EvidenceGenerator | None = None
    """El generador; por defecto, el de los adaptadores de la configuración."""
    seudonimo: Callable[[int], str] = seudonimo_de_la_suite
    """Generador de ``pseudoPatientId`` por consulta; se inyecta para que un test lo congele."""


@dataclass(frozen=True)
class MedicionContextual:
    filas: tuple[FilaContextual, ...]
    salidas_invalidas: int
    reranker_max_pairs: int | None
    modelos_respondidos: Mapping[str, str]
    """Embeddings, reranker y NLI que respondieron (``meta`` de la respuesta); vacío si ninguna respondió."""


def ejecutar_contextual(
    args: argparse.Namespace,
    ajustes: Mapping[str, str],
    reloj: Clock,
    origen: OrigenLocal,
    puertos: PuertosDeContextual,
) -> int:
    """La familia completa; ``ConfigInvalida``, ``DatasetInvalido`` y ``SuiteAbortada`` los traduce ``evaluate.main``."""
    suite = cargar_config_suite(args.config, ajustes)
    config = cargar_config_contextual(args.config, suite)
    dataset = cargar_dataset_contextual(
        suite.dataset
    )  # antes de medir; rechaza lo que no es sintético
    casos = cargar_casos(config.casos_ruta, config.casos)
    formas = formas_de_las_preguntas_de_sinonimos(
        config, dataset
    )  # antes de medir; exige el término en el catálogo
    exigir_adapters_locales(dataset.corpus.clase, suite.urls)
    exigir_proveedor_local(suite)
    base = _reporte_base_de_la_corrida(
        config, dataset
    )  # antes de medir: un corpus distinto no se compara
    medicion = asyncio.run(medir_contextual(config, dataset, casos, origen, reloj, puertos))
    reporte = _reporte(config, dataset, casos, medicion, formas, base)
    ruta = _ruta_del_resultado(config, args, reloj)
    escribir_reporte_cerrado(ruta, reporte, ESQUEMA_CONTEXTUAL)
    ruta.with_suffix(".md").write_text(informe_legible(reporte), encoding="utf-8")
    print(_resumen(reporte))
    return 0


def _reporte_base_de_la_corrida(
    config: ConfigContextual, dataset: DatasetContextual
) -> ReporteBase | None:
    """El reporte base de la configuración, ya comprobado contra el corpus de esta corrida (``None`` = sin comparación)."""
    if config.reporte_base is None:
        return None
    base = leer_reporte_base(config.reporte_base)
    exigir_mismo_corpus(_identidad_del_corpus(dataset), base)
    return base


# --- las formas de cada término de sinónimos -----------------------------------------------------------------------------


def formas_del_termino(catalogos: Path, tipos: Sequence[str], termino: str) -> tuple[str, ...]:
    """El ÚNICO punto que da las formas de un término: su texto canónico y TODOS los textos de su ``sinonimos[]``, sea cual sea
    su relación con el canónico (design D4). Vacío si ``termino`` no es un ``terminoCanonico`` del catálogo."""
    canonico = normalizar_texto(termino)
    return tuple(
        texto for texto, de in cargar_sinonimos(catalogos, tipos).items() if de == canonico
    )


def formas_de_las_preguntas_de_sinonimos(
    config: ConfigContextual, dataset: DatasetContextual
) -> dict[str, tuple[str, ...]]:
    """Las formas de cada término declarado. Un término fuera del catálogo o una pregunta que no está en el dataset impiden
    la corrida (RN-27): el mensaje nombra el id y el término, nunca un texto de pregunta."""
    ids = {p.id for p in dataset.preguntas}
    tipos = cargar_catalogo_del_manifiesto(config.suite.ruta_terminos).tipos_de_cancer()
    formas: dict[str, tuple[str, ...]] = {}
    for declarada in config.preguntas_de_sinonimos:
        if declarada.pregunta not in ids:
            raise ConfigInvalida(
                f"contextual.preguntas_de_sinonimos: la pregunta {declarada.pregunta} no está en el dataset"
            )
        encontradas = formas_del_termino(config.suite.ruta_terminos, tipos, declarada.termino)
        if not encontradas:
            raise ConfigInvalida(
                f"contextual.preguntas_de_sinonimos: el término {declarada.termino} de la pregunta "
                f"{declarada.pregunta} no es un terminoCanonico del catálogo"
            )
        formas[declarada.pregunta] = encontradas
    return formas


# --- la medición ---------------------------------------------------------------------------------------------------------


async def medir_contextual(
    config: ConfigContextual,
    dataset: DatasetContextual,
    casos: Sequence[CasoSintetico],
    origen: OrigenLocal,
    reloj: Clock,
    puertos: PuertosDeContextual,
) -> MedicionContextual:
    suite = config.suite
    locales = _puertos_locales(config, dataset, origen)
    ranking = RegistroDelRanking()
    servicio = _servicio(config, dataset, locales, puertos, reloj, ranking)
    base = solicitud_base()
    filas: list[FilaContextual] = []
    invalidas = 0
    modelos: dict[str, str] = {}
    for pregunta in dataset.preguntas:
        for caso in casos:
            solicitud = _solicitud(
                base, caso, pregunta, len(filas), suite.catalogo_version, puertos.seudonimo
            )
            ranking.reiniciar()
            generaciones = servicio.observaciones.generaciones
            try:
                respuesta: RagQueryInternalResponse | None = await servicio.servicio.consultar(
                    solicitud
                )
            except (
                LlmSalidaInvalidaError
            ):  # una salida inválida del LLM no es el fin de la suite: se cuenta
                respuesta = None
                invalidas += 1
            filas.append(
                fila_de(
                    pregunta,
                    caso.id,
                    respuesta,
                    ranking.ultimo,
                    servicio.observaciones.generaciones - generaciones,
                )
            )
            if respuesta is not None and not modelos:
                modelos = _modelos_de_recuperacion(respuesta.meta)
    return MedicionContextual(
        tuple(filas),
        invalidas,
        locales.reranker_max_pairs if locales else config.reranker_max_pairs,
        modelos,
    )


def _puertos_locales(
    config: ConfigContextual, dataset: DatasetContextual, origen: OrigenLocal
) -> PuertosLocales | None:
    if config.suite.proveedor != "local":
        return None
    return cargar_puertos_locales(config.suite, origen, RegistroDeLlamadas(), dataset.corpus.clase)


def _servicio(
    config: ConfigContextual,
    dataset: DatasetContextual,
    locales: PuertosLocales | None,
    puertos: PuertosDeContextual,
    reloj: Clock,
    ranking: RegistroDelRanking,
) -> ServicioDeSuite:
    """El servicio de la suite con la expansión contextual de la configuración (ADR-52): el indicador y los catálogos de
    solo lectura del catálogo montado, los mismos con los que arranca producción. El *reranker* anota el ranking final."""
    suite = config.suite
    adaptadores = adaptadores_de_suite(suite, dataset.corpus, locales)
    if puertos.reranker is not None:
        adaptadores = replace(adaptadores, reranker=puertos.reranker)
    if puertos.generador is not None:
        adaptadores = replace(adaptadores, generador=puertos.generador)
    adaptadores = replace(adaptadores, reranker=RerankerQueRegistra(adaptadores.reranker, ranking))
    tipos = cargar_catalogo_del_manifiesto(suite.ruta_terminos).tipos_de_cancer()
    cronometro = Cronometro(RelojSimulado() if suite.reloj == "simulado" else time.perf_counter)
    return componer_servicio(
        suite,
        dataset.corpus,
        cronometro,
        reloj,
        puertos_locales=locales,
        adaptadores=adaptadores,
        reranker_max_pairs=config.reranker_max_pairs,
        expansion=ExpansionDeLaSuite(
            _expansion_de_la_corrida(config),
            cargar_marcos_de_pregunta(suite.ruta_terminos),
            cargar_catalogo_de_terminos(suite.ruta_terminos, tipos),
        ),
    )


def _solicitud(
    base: dict[str, Any],
    caso: CasoSintetico,
    pregunta: PreguntaContextual,
    indice: int,
    catalogo_version: str,
    seudonimo: Callable[[int], str],
) -> RagQueryInternalRequest:
    """La solicitud de ``contracts/examples`` con la pregunta y el contexto desidentificado del caso (RN-11). Reutiliza
    ``solicitud_de`` para el resto de campos: el tipo de cáncer de la pregunta es el del caso, así que no lo reescribe."""
    contexto = copy.deepcopy(base["clinicalContext"])
    contexto["pseudoPatientId"] = seudonimo(indice)
    contexto["diagnosis"].update(caso.contexto_clinico["diagnosis"])
    plantilla = contexto["biomarkers"][0]
    contexto["biomarkers"] = [
        {**plantilla, "dataRef": f"r{i}", "biomarkerName": b["biomarkerName"], "value": b["value"]}
        for i, b in enumerate(caso.contexto_clinico["biomarkers"], 2)
    ]
    contexto["missingCriticalData"] = []
    contexto["events"] = []
    de_la_pregunta = Pregunta(
        id=pregunta.id,
        idioma=pregunta.idioma,
        cancer=contexto["diagnosis"]["cancerType"],
        tipo="contextual",
        texto=pregunta.texto,
        modo_acierto="cualquiera",
        documentos=(),
        evidencia=(),
    )
    return solicitud_de(
        {**base, "clinicalContext": contexto},
        de_la_pregunta,
        "sintetico",
        indice,
        catalogo_version,
        MAX_OPCIONES,
    )


def fila_de(
    pregunta: PreguntaContextual,
    caso: str,
    respuesta: RagQueryInternalResponse | None,
    top3: tuple[ChunkPuntuado, ...] = (),
    llamadas_al_generador: int = 0,
) -> FilaContextual:
    """Lo observado de una consulta. Sin respuesta (salida inválida del generador) el generador solo corre cuando hay chunks
    sobre el umbral (RN-02), así que ``supero_umbral`` es verdadero; el puntaje y el segundo loop quedan en ``None``."""
    if respuesta is None:
        return FilaContextual(
            pregunta.id,
            pregunta.clase,
            caso,
            ESTADO_SALIDA_INVALIDA,
            True,
            None,
            None,
            top3,
            (),
            llamadas_al_generador,
        )
    expansion = respuesta.meta.retrievalParams.contextExpansion
    return FilaContextual(
        pregunta.id,
        pregunta.clase,
        caso,
        respuesta.status.value,
        respuesta.status.value == ESTADO_CON_EVIDENCIA,
        respuesta.topRelevanceScore,
        SEGUNDO_LOOP_CONTEXTUAL if expansion is not None else SEGUNDO_LOOP_NINGUNO,
        top3,
        tuple(campo.value for campo in expansion.fields) if expansion is not None else (),
        llamadas_al_generador,
    )


def _modelos_de_recuperacion(meta: RagMeta) -> dict[str, str]:
    """Embeddings, reranker y NLI tal como los declaró el servicio (``<modelo>@<revisión>#sha256:<hash>``)."""
    return {
        "embeddings": meta.embeddingModel,
        "reranker": meta.rerankerModel,
        "nli": meta.nliModel,
    }


# --- el informe ---------------------------------------------------------------------------------------------------------


def _reporte(
    config: ConfigContextual,
    dataset: DatasetContextual,
    casos: Sequence[CasoSintetico],
    medicion: MedicionContextual,
    formas: Mapping[str, tuple[str, ...]],
    base: ReporteBase | None = None,
) -> dict[str, Any]:
    sin_validar = len(medicion.filas)
    recuentos = recuentos_por_clase(medicion.filas)
    return {
        "esquema": VERSION_ESQUEMA,
        "suite": SUITE_CONTEXTUAL,
        "configuracion": _configuracion_del_informe(config, dataset, medicion),
        "validacion": {
            "preguntas_validadas": 0,
            "preguntas_no_validadas": sin_validar,
            "rotulo": rotular_validada(0, sin_validar).rotulo,
        },
        "regla_de_la_causa": [
            {"orden": orden, "condicion": condicion, "causa": causa}
            for orden, condicion, causa in REGLA_DE_LA_CAUSA
        ],
        "preguntas": [_fila_del_informe(f) for f in medicion.filas],
        "recuentos": [_recuento_del_informe(r) for r in recuentos],
        "cobertura": [
            _cobertura_del_informe(c)
            for c in genericas_con_evidencia_por_caso(
                medicion.filas, config.genericas_con_evidencia_minimo
            )
        ],
        "adversarias": [_adversarias_del_informe(a) for a in adversarias_por_caso(medicion.filas)],
        "comparacion": None if base is None else _comparacion_del_informe(recuentos, base),
        "sinonimos": _sinonimos_del_informe(config, dataset, casos, medicion, formas),
        "salidas_invalidas": medicion.salidas_invalidas,
    }


def _configuracion_del_informe(
    config: ConfigContextual, dataset: DatasetContextual, medicion: MedicionContextual
) -> dict[str, Any]:
    """Lo que identifica la medición: configuración, dataset, corpus, catálogo, modelos y umbrales con los que se corrió."""
    suite = config.suite
    u = suite.umbrales
    corpus = dataset.corpus
    expansion = _expansion_de_la_corrida(config)
    return {
        "nombre": suite.nombre,
        "hashConfig": suite.hash_config,
        "fixture": suite.fixture,
        "claseDataset": corpus.clase,
        **_identidad_del_corpus(dataset),
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
        "expansion_habilitada": config.expansion_habilitada,
        "expansion": {"campos": list(expansion.campos), "formato": expansion.formato},
        "casos": list(config.casos),
    }


def _identidad_del_corpus(dataset: DatasetContextual) -> dict[str, Any]:
    """Lo que dice con qué dataset y corpus corrió la medición: dos reportes solo se comparan si es idéntico (S7 resp. 10)."""
    corpus = dataset.corpus
    return {
        "dataset": {"nombre": dataset.nombre, "version": dataset.version, "ruta": dataset.ruta},
        "corpus": {
            "nombre": corpus.nombre,
            "version": corpus.version,
            "release": corpus.release,
            "recuento_de_chunks": len(corpus.chunks),
        },
    }


def _expansion_de_la_corrida(config: ConfigContextual) -> ParametrosDeExpansionContextual:
    """Los parámetros de la expansión con los que corre el servicio (``_servicio``): el informe los registra tal cual."""
    return ParametrosDeExpansionContextual(habilitada=config.expansion_habilitada)


def _fila_del_informe(fila: FilaContextual) -> dict[str, Any]:
    return {
        "pregunta_id": fila.pregunta_id,
        "clase": fila.clase,
        "caso": fila.caso,
        "estado": fila.estado,
        "supero_umbral": fila.supero_umbral,
        "top_relevance_score": fila.top_relevance_score,
        "segundo_loop": fila.segundo_loop,
        "top3": [{"chunk_id": c.chunk_id, "relevance_score": c.relevance_score} for c in fila.top3],
        "campos_usados": list(fila.campos_usados),
        "llamadas_al_generador": fila.llamadas_al_generador,
    }


def _cobertura_del_informe(cobertura: CoberturaDeCaso) -> dict[str, Any]:
    return {
        "caso": cobertura.caso,
        "genericas_con_evidencia": cobertura.genericas_con_evidencia,
        "genericas_total": cobertura.genericas_total,
        "minimo": cobertura.minimo,
        "cumple": cobertura.cumple,
        "campos_usados": list(cobertura.campos_usados),
    }


def _adversarias_del_informe(adversarias: AdversariasDeCaso) -> dict[str, Any]:
    return {
        "caso": adversarias.caso,
        "total": adversarias.total,
        "sin_evidencia": adversarias.sin_evidencia,
        "falsos_positivos": adversarias.falsos_positivos,
        "con_puntaje_nulo": adversarias.con_puntaje_nulo,
        "llamadas_al_generador": adversarias.llamadas_al_generador,
    }


def _comparacion_del_informe(
    recuentos: Sequence[RecuentoDeClase], base: ReporteBase
) -> dict[str, Any]:
    cambios = comparar_con_base(recuentos, base.recuentos)
    return {
        "base": {"nombre": base.nombre, "hashConfig": base.hash_config},
        "cambios": [_cambio_del_informe(c) for c in cambios],
        "empeoran": sum(c.empeora for c in cambios),
    }


def _cambio_del_informe(cambio: CambioFrenteALaBase) -> dict[str, Any]:
    return {
        "ambito": cambio.ambito,
        "metrica": cambio.metrica,
        "base": cambio.base,
        "actual": cambio.actual,
        "empeora": cambio.empeora,
    }


def _recuento_del_informe(recuento: RecuentoDeClase) -> dict[str, Any]:
    return {
        "ambito": recuento.ambito,
        "clase": recuento.clase,
        "con_evidencia": recuento.con_evidencia,
        "total": recuento.total,
    }


def _textos_recuperables(corpus: DatasetSuite, tipo_de_cancer: str) -> list[str]:
    """Los chunks que la recuperación puede ver para un caso: los de documentos del tipo de cáncer del caso (la búsqueda
    filtra por él con ``coincide_etiqueta``, la regla única del filtro)."""
    cancer = {d.id: d.cancer for d in corpus.documentos}
    return [
        c.texto for c in corpus.chunks if coincide_etiqueta(cancer[c.documento], tipo_de_cancer)
    ]


def _sinonimos_del_informe(
    config: ConfigContextual,
    dataset: DatasetContextual,
    casos: Sequence[CasoSintetico],
    medicion: MedicionContextual,
    formas: Mapping[str, tuple[str, ...]],
) -> list[dict[str, Any]]:
    """Por pregunta de sinónimos y caso: si superó el umbral o, si no, su causa (regla D4 sobre los chunks del corpus que
    la recuperación ve para el tipo de cáncer de ese caso)."""
    textos = {c.id: _textos_recuperables(dataset.corpus, c.tipo_de_cancer) for c in casos}
    declaradas: dict[str, PreguntaDeSinonimos] = {
        d.pregunta: d for d in config.preguntas_de_sinonimos
    }
    return [
        {
            "pregunta_id": f.pregunta_id,
            "caso": f.caso,
            "termino": declaradas[f.pregunta_id].termino,
            "supero_umbral": f.supero_umbral,
            "causa": causa_de_sinonimo(f.supero_umbral, formas[f.pregunta_id], textos[f.caso]),
        }
        for f in medicion.filas
        if f.pregunta_id in declaradas
    ]


def _celda(valor: object) -> str:
    return "—" if valor is None else str(valor)


def informe_legible(reporte: Mapping[str, Any]) -> str:
    """El mismo informe en Markdown: solo ids, estados, puntajes y recuentos (RN-14). ``—`` es ``null``."""
    c = reporte["configuracion"]
    u = c["umbrales"]
    lineas = [
        f"# Segundo loop contextual ({reporte['suite']})",
        "",
        f"Configuración `{c['nombre']}` (huella `{c['hashConfig']}`), dataset `{c['dataset']['nombre']}` "
        f"versión {c['dataset']['version']} (`{c['dataset']['ruta']}`) sobre el corpus `{c['corpus']['nombre']}` "
        f"(release `{c['corpus']['release']}`, {c['corpus']['recuento_de_chunks']} chunks), proveedor `{c['proveedor']}`, "
        f"catálogo `{c['catalogVersion']}`.",
        "",
        f"Expansión contextual: {'activa' if c['expansion_habilitada'] else 'apagada'} (campos {', '.join(c['expansion']['campos'])}; formato {c['expansion']['formato']}); casos: {', '.join(c['casos'])}.",
        f"Umbrales: RETRIEVAL_TOP_K {u['retrievalTopK']}, RERANKER_MAX_PAIRS {_celda(u['rerankerMaxPairs'])}, "
        f"RELEVANCE_THRESHOLD {u['relevanceThreshold']}, NLI_ENTAILMENT_THRESHOLD {u['nliEntailmentThreshold']}.",
        f"Rótulo: `{reporte['validacion']['rotulo']}`.",
        "",
        "## Preguntas de sinónimos",
        "",
        "La causa de una pregunta que no supera el umbral (la primera condición que se cumple manda):",
        "",
        *(
            f"{r['orden']}. {r['condicion']}: {_celda(r['causa'])}."
            for r in reporte["regla_de_la_causa"]
        ),
        "",
        "| pregunta | término | caso | supera umbral | causa |",
        "|---|---|---|---|---|",
        *(
            f"| {s['pregunta_id']} | {s['termino']} | {s['caso']} | {s['supero_umbral']} | {_celda(s['causa'])} |"
            for s in reporte["sinonimos"]
        ),
        "",
        "## Recuentos por clase",
        "",
        "| ámbito | clase | con evidencia | total |",
        "|---|---|---|---|",
        *(
            f"| {r['ambito']} | {r['clase']} | {r['con_evidencia']} | {r['total']} |"
            for r in reporte["recuentos"]
        ),
        "",
        "## Cobertura de genéricas por caso",
        "",
        "| caso | genéricas con evidencia | genéricas | meta | cumple | campos usados |",
        "|---|---|---|---|---|---|",
        *(
            f"| {c['caso']} | {c['genericas_con_evidencia']} | {c['genericas_total']} | {c['minimo']} "
            f"| {c['cumple']} | {', '.join(c['campos_usados']) or '—'} |"
            for c in reporte["cobertura"]
        ),
        "",
        "## Adversarias (tema fuera del corpus)",
        "",
        "| caso | total | sin evidencia | falsos positivos | puntaje null | llamadas al generador |",
        "|---|---|---|---|---|---|",
        *(
            f"| {a['caso']} | {a['total']} | {a['sin_evidencia']} | {a['falsos_positivos']} "
            f"| {a['con_puntaje_nulo']} | {a['llamadas_al_generador']} |"
            for a in reporte["adversarias"]
        ),
        "",
        *_comparacion_legible(reporte["comparacion"]),
        "## Por pregunta",
        "",
        "| pregunta | clase | caso | estado | supera umbral | top_relevance_score | segundo loop | top-3 (chunk:puntaje) | llamadas al generador |",
        "|---|---|---|---|---|---|---|---|---|",
        *(
            f"| {f['pregunta_id']} | {f['clase']} | {f['caso']} | {f['estado']} | {f['supero_umbral']} "
            f"| {_celda(f['top_relevance_score'])} | {_celda(f['segundo_loop'])} "
            f"| {_top3_legible(f['top3'])} | {f['llamadas_al_generador']} |"
            for f in reporte["preguntas"]
        ),
        "",
        f"Salidas inválidas del generador: {reporte['salidas_invalidas']}. Muestra pequeña: orienta, no prueba.",
        "",
    ]
    return "\n".join(lineas)


def _top3_legible(top3: Sequence[Mapping[str, Any]]) -> str:
    return ", ".join(f"{c['chunk_id']}:{c['relevance_score']}" for c in top3) or "—"


def _comparacion_legible(comparacion: Mapping[str, Any] | None) -> list[str]:
    if comparacion is None:
        return []
    return [
        "## Frente al reporte base",
        "",
        f"Base `{comparacion['base']['nombre']}` (huella `{comparacion['base']['hashConfig']}`); "
        f"métricas que empeoran: {comparacion['empeoran']}.",
        "",
        "| ámbito | métrica | base | actual | empeora |",
        "|---|---|---|---|---|",
        *(
            f"| {c['ambito']} | {c['metrica']} | {c['base']} | {c['actual']} | {c['empeora']} |"
            for c in comparacion["cambios"]
        ),
        "",
    ]


def _resumen(reporte: Mapping[str, Any]) -> str:
    resueltas = sum(1 for s in reporte["sinonimos"] if s["supero_umbral"] or s["causa"] is not None)
    return (
        f"evaluate contextual: {len(reporte['preguntas'])} consultas; "
        f"sinónimos con umbral o causa: {resueltas}/{len(reporte['sinonimos'])}"
    )


def _ruta_del_resultado(config: ConfigContextual, args: argparse.Namespace, reloj: Clock) -> Path:
    carpeta = args.salida or raiz_repo() / "apps" / "rag-orchestrator" / SALIDA_POR_DEFECTO
    nombre = args.nombre_archivo or (
        f"{reloj.ahora().date().isoformat()}-{config.suite.hash_config}-{SUITE_CONTEXTUAL}"
    )
    return carpeta / (nombre if nombre.endswith(".json") else f"{nombre}.json")
