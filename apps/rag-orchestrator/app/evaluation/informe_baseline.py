"""Informe del baseline técnico (``eval/reports/S1-baseline.md`` y su JSON de agregados, US-073): solo cifras y
configuración, nunca textos de preguntas ni de salidas (RN-14). Determinista: sin fechas ni azar.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any, get_args

from app.evaluation.barrido import Eleccion, FilaBarrido
from app.evaluation.config_suite import PROVEEDORES
from app.evaluation.fuente_dataset import CLASES_ADMITIDAS
from app.evaluation.metas import Estado, Meta, MetricaMarcada, marcar_frente_a_meta, nota_adr42
from app.evaluation.desagregacion import ETIQUETA_DE_IDIOMA, IDIOMAS_DEL_BASELINE
from app.evaluation.reporte import (
    Anulable,
    Booleano,
    Enumerado,
    Huella,
    Identificador,
    Lista,
    Numero,
    Objeto,
)

NO_EJECUTABLE = "NO-EJECUTABLE aquí"
CLAVE_P95 = "p95_evidence_analyses_s"
ETIQUETAS_CANCER = {"mama": "mama", "prostata": "próstata"}

PROCEDIMIENTO_REAL = """\
Cifras reales (modelos de ADR-39 + Compose) en la máquina de referencia (MacBook Pro M5 de 32 GB):

1. Verificar los modelos desde la fuente: `ollama list` (tags y tamaños) y `ollama ps` (residencia y memoria) con el LLM de ADR-39 fase B.
2. Levantar el stack: `docker compose -f infra/docker/docker-compose.yml up -d` y el LLM nativo (`ollama serve`).
3. Barrido real: `npm run evaluate -- --config apps/rag-orchestrator/eval/configs/<config-local>.yaml --sweep relevance_threshold --fijar --salida apps/rag-orchestrator/eval/reports` (la regla D1 usa solo desarrollo + validación de `ol06-particion-v1`; la prueba solo con `--prueba-final`).
4. p95 de punta a punta: 3 corridas de ≥ 30 consultas desde el host, por la BFF: `python -m app.scripts.adr39 e2e --bff --base-url https://localhost --origin https://localhost` (`ADR39_PASSWORD` en el entorno); nunca desde un contenedor de clinical-net/ai-net ni desde rag-orchestrator. La mediana de los p95 se pasa con `--p95-e2e-s <segundos>`.
5. Reporte de la suite con modelos reales: `npm run evaluate -- --suite all --report json --config <config-local> --salida apps/rag-orchestrator/eval/reports --nombre-archivo S1-reporte-real.json`. El baseline versionado de la CI (adapters falsos) es la referencia determinista y no se sobrescribe nunca con este reporte.
6. Aplicar el valor elegido en `RELEVANCE_THRESHOLD` de `.env.example` (lo hace el orquestador) y registrarlo para DEC-07 (US-017) y `regression.yaml` (US-074).
"""


@dataclass(frozen=True)
class DatosDelInforme:
    clase_dataset: str
    proveedor: str
    dataset: str
    hash_config: str
    umbral_de_referencia: float
    tolerancia_recall: float
    filas: Sequence[FilaBarrido]
    eleccion: Eleccion
    fijado: bool
    metricas_totales: Mapping[str, float | None]
    metricas_por_cancer: Mapping[str, Mapping[str, float | None]]
    metas: Mapping[str, Meta]
    p95_e2e_s: float | None
    # US-120 AC-6: una celda por tipo de cáncer e idioma; ``None`` = sin consultas («no medida»). Vacío si no se desagrega.
    metricas_por_tipo_e_idioma: Mapping[str, Mapping[str, Mapping[str, float | None] | None]] = (
        field(default_factory=dict)
    )
    # ``EVAL_P95_RUNS``: corridas de las que sale la mediana del p95; ``None`` = una sola medición (la que se pasó).
    p95_corridas: int | None = None
    # De dónde sale ``p95_e2e_s``: ``medicion_externa`` (``--p95-e2e-s``), ``corridas_en_proceso`` (etapa ``consulta`` de
    # ``EVAL_P95_RUNS`` corridas) o ``no_declarado``.
    p95_origen: str = "no_declarado"


def _numero(valor: float | None) -> str:
    return "n/a" if valor is None else f"{valor:.3f}"


def _valor(m: MetricaMarcada) -> str:
    if m.valor is None:
        return "sin medir"
    return f"{m.valor:g} s" if m.clave.endswith("_s") else _numero(m.valor)


def _meta(m: MetricaMarcada) -> str:
    return f"{m.meta} s" if m.clave.endswith("_s") else m.meta


def _fila_de_metrica(m: MetricaMarcada, prefijo: str = "") -> str:
    return f"| {prefijo}{m.etiqueta} | {_valor(m)} | {_meta(m)} | {m.estado} |"


def _tabla_del_barrido(filas: Sequence[FilaBarrido]) -> list[str]:
    return [
        "| Umbral | Exactitud de «sin evidencia» | recall@10 tras umbral |",
        "|---|---|---|",
        *(
            f"| {f.umbral:.2f} | {_numero(f.exactitud_sin_evidencia)} | {_numero(f.recall_at_10_tras_umbral)} |"
            for f in filas
        ),
    ]


def _seccion_barrido(d: DatosDelInforme) -> list[str]:
    destino = "fijado en la configuración" if d.fijado else "sin fijar: falta `--fijar`"
    aviso = (
        [
            (
                "> Calibración con adapters falsos (FX-T5a-a): demuestra el mecanismo y no se aplica. El valor real de "
                "`RELEVANCE_THRESHOLD` sale del barrido con los modelos de ADR-39 (sección 4)."
            ),
            "",
        ]
        if d.proveedor == "fake"
        else []
    )
    return [
        "## 1. Barrido de `relevance_threshold` (RN-02, TBD-03)",
        "",
        *aviso,
        (
            f"Grilla (`RELEVANCE_THRESHOLD_GRID`): {', '.join(f'{f.umbral:.2f}' for f in d.filas)} · "
            f"referencia {d.umbral_de_referencia:.2f} · tolerancia de recall (`THRESHOLD_RECALL_TOLERANCE`) {d.tolerancia_recall:g}."
        ),
        "",
        *_tabla_del_barrido(d.filas),
        "",
        f"Elegido: {d.eleccion.umbral:.2f} ({destino})",
        "",
        f"Justificación: {d.eleccion.justificacion}",
    ]


def _etiquetas_de_cancer(metricas: Mapping[str, Mapping[str, float | None]]) -> list[str]:
    return [ETIQUETAS_CANCER.get(c, c) for c in metricas]


def _seccion_baseline(d: DatosDelInforme) -> list[str]:
    totales = marcar_frente_a_meta({**d.metricas_totales, CLAVE_P95: d.p95_e2e_s}, d.metas)
    por_cancer = [
        _fila_de_metrica(m, f"{ETIQUETAS_CANCER.get(cancer, cancer)} · ")
        for cancer, valores in d.metricas_por_cancer.items()
        for m in marcar_frente_a_meta(valores, d.metas)
        if m.clave != CLAVE_P95
    ]
    referencia = d.proveedor == "fake"
    titulo = (
        "## 2. Referencia determinista (adapters falsos): valida el mecanismo, no cuantifica el sistema"
        if referencia
        else "## 2. Baseline técnico"
    )
    return [
        titulo,
        "",
        (
            f"Dataset {d.dataset} (clase {d.clase_dataset}) · proveedor `{d.proveedor}` · hashConfig `{d.hash_config}`. "
            "fidelidad (proxy) = porcentaje de opciones con cita y soporte NLI (el juez de fidelidad de ADR-41 solo corre con modelos reales)."
        ),
        "",
        (
            "Total y por tipo de cáncer: recall@10 y MRR son del ranking del reranker y no dependen del umbral; "
            "las demás métricas son de la fila elegida"
            + (" (sin significado con adapters falsos)." if d.proveedor == "fake" else ".")
        ),
        "",
        "### Total",
        "",
        "| Métrica | Valor | Meta inicial | Estado |",
        "|---|---|---|---|",
        *(_fila_de_metrica(m) for m in totales),
        "",
        f"### Por tipo de cáncer ({', '.join(_etiquetas_de_cancer(d.metricas_por_cancer))})",
        "",
        "| Métrica | Valor | Meta inicial | Estado |",
        "|---|---|---|---|",
        *por_cancer,
        *([""] + _seccion_por_tipo_e_idioma(d) if d.metricas_por_tipo_e_idioma else []),
    ]


def _filas_por_tipo_e_idioma(d: DatosDelInforme) -> list[str]:
    filas: list[str] = []
    for tipo, por_idioma in d.metricas_por_tipo_e_idioma.items():
        for idioma in IDIOMAS_DEL_BASELINE:
            celda = por_idioma.get(idioma)
            prefijo = f"{ETIQUETAS_CANCER.get(tipo, tipo)} · {ETIQUETA_DE_IDIOMA[idioma]}"
            if celda is None:
                filas.append(f"| {prefijo} | no medida | — | — |")
                continue
            filas.extend(
                _fila_de_metrica(m, f"{prefijo} · ")
                for m in marcar_frente_a_meta(celda, d.metas)
                if m.clave != CLAVE_P95
            )
    return filas


def _seccion_por_tipo_e_idioma(d: DatosDelInforme) -> list[str]:
    if not d.metricas_por_tipo_e_idioma:
        return []
    return [
        "### Por tipo de cáncer e idioma (es, en, es→en)",
        "",
        "Una celda sin consultas es «no medida» (no 0.0). es→en: consultas en español contra el corpus en inglés.",
        "",
        "| Métrica | Valor | Meta inicial | Estado |",
        "|---|---|---|---|",
        *_filas_por_tipo_e_idioma(d),
    ]


VALORACION_OUT_08 = """\
La fidelidad (proxy) quedó fuera de meta. Se valoran, **sin implementarlas** (`[S4 resp. 15]`, OUT-08, soluciones 3 y 4), dos
palancas para una decisión posterior: (3) dar contexto del fragmento al NLI (la afirmación se verifica contra el fragmento citado
y su entorno) y (4) un NLI más fuerte es↔en o un umbral por tipo de afirmación. Este baseline no cambia modelos, *chunking* ni
prompts; la decisión es de una historia aparte con su propia evaluación (OL-06)."""


def _seccion_out_08(d: DatosDelInforme) -> list[str]:
    marcas = marcar_frente_a_meta(d.metricas_totales, d.metas)
    fidelidad = next((m for m in marcas if m.clave == "fidelidad_proxy"), None)
    if fidelidad is None or fidelidad.estado != "fuera de meta":
        return []
    return ["## 5. Valoración de OUT-08 (fidelidad fuera de meta)", "", VALORACION_OUT_08]


def _seccion_p95(d: DatosDelInforme, meta_p95: Meta | None) -> list[str]:
    nota = nota_adr42(d.p95_e2e_s, meta_p95.maximo or 0.0) if meta_p95 else None
    medida = (
        f"p95 medido de punta a punta: {d.p95_e2e_s:g} s (mediana de {d.p95_corridas or 3} corridas)."
        if d.p95_e2e_s is not None
        else f"p95 de `/platform/evidence-analyses` de punta a punta: {NO_EJECUTABLE} (requiere Compose y los modelos de ADR-39)."
    )
    return ["## 3. Latencia de punta a punta (G-5)", "", medida, *([""] + [nota] if nota else [])]


def _seccion_real(d: DatosDelInforme) -> list[str]:
    if d.proveedor != "fake":
        return []
    celdas = [
        f"| {m} | {NO_EJECUTABLE} | {NO_EJECUTABLE} |"
        for m in (
            "recall@10",
            "MRR",
            "recall@10 es→en",
            "fidelidad (proxy)",
            "precisión de citas",
            "sin evidencia",
        )
    ]
    return [
        "## 4. Baseline real (AC-2): pendiente",
        "",
        "| Métrica | mama | próstata |",
        "|---|---|---|",
        *celdas,
        "",
        PROCEDIMIENTO_REAL.rstrip(),
    ]


def renderizar_informe(d: DatosDelInforme) -> str:
    secciones = [
        ["# Baseline técnico del S1 (US-073)", ""],
        _seccion_barrido(d),
        [""],
        _seccion_baseline(d),
        [""],
        _seccion_p95(d, d.metas.get(CLAVE_P95)),
        [""],
        _seccion_real(d),
        ([""] + _seccion_out_08(d)) if _seccion_out_08(d) else [],
    ]
    return "\n".join(linea for bloque in secciones for linea in bloque).rstrip() + "\n"


def agregados_del_informe(d: DatosDelInforme) -> dict[str, Any]:
    """El JSON de agregados: las mismas cifras del informe, sin textos."""
    marcas = marcar_frente_a_meta({**d.metricas_totales, CLAVE_P95: d.p95_e2e_s}, d.metas)
    return {
        "esquema": "oncolens.baseline.v1",
        "claseDataset": d.clase_dataset,
        "proveedor": d.proveedor,
        "dataset": d.dataset,
        "hashConfig": d.hash_config,
        "referenciaDeterminista": d.proveedor == "fake",
        "barrido": {
            "umbralDeReferencia": d.umbral_de_referencia,
            "toleranciaRecall": d.tolerancia_recall,
            "filas": [
                {
                    "umbral": f.umbral,
                    "exactitudSinEvidencia": f.exactitud_sin_evidencia,
                    "recallAt10TrasUmbral": f.recall_at_10_tras_umbral,
                }
                for f in d.filas
            ],
            "elegido": d.eleccion.umbral,
            "fijado": d.fijado,
        },
        "metricas": [
            {
                "metrica": m.clave,
                "valor": m.valor,
                "metaMinimo": d.metas[m.clave].minimo,
                "metaMaximo": d.metas[m.clave].maximo,
                "estado": m.estado,
            }
            for m in marcas
        ],
        "metricasPorCancer": {c: dict(v) for c, v in d.metricas_por_cancer.items()},
        "p95E2eS": d.p95_e2e_s,
        "p95Corridas": d.p95_corridas,
        "metricasPorTipoEIdioma": {
            tipo: {
                idioma: (None if celda is None else dict(celda)) for idioma, celda in por.items()
            }
            for tipo, por in d.metricas_por_tipo_e_idioma.items()
        },
    }


_METRICAS_DE_META = (
    "recall_at_10",
    "recall_at_10_es_a_en",
    "mrr",
    "fidelidad_proxy",
    "precision_citas",
    "sin_evidencia",
)
_POR_CANCER = Objeto({m: Numero() for m in _METRICAS_DE_META})
ESQUEMA_BASELINE = Objeto(
    {
        "esquema": Enumerado(frozenset({"oncolens.baseline.v1"})),
        "claseDataset": Enumerado(frozenset(CLASES_ADMITIDAS)),
        "proveedor": Enumerado(frozenset(PROVEEDORES)),
        "dataset": Identificador(),
        "hashConfig": Huella(),
        "referenciaDeterminista": Booleano(),
        "barrido": Objeto(
            {
                "umbralDeReferencia": Numero(),
                "toleranciaRecall": Numero(),
                "filas": Lista(
                    Objeto(
                        {
                            "umbral": Numero(),
                            "exactitudSinEvidencia": Numero(),
                            "recallAt10TrasUmbral": Numero(),
                        }
                    )
                ),
                "elegido": Numero(),
                "fijado": Booleano(),
            }
        ),
        "metricas": Lista(
            Objeto(
                {
                    "metrica": Enumerado(frozenset((*_METRICAS_DE_META, CLAVE_P95))),
                    "valor": Numero(),
                    "metaMinimo": Numero(),
                    "metaMaximo": Numero(),
                    "estado": Enumerado(frozenset(get_args(Estado))),
                }
            )
        ),
        # Una clave por tipo de cáncer habilitado: una clave ajena (texto del dataset) no entra al reporte.
        "metricasPorCancer": Objeto(
            {c: _POR_CANCER for c in ETIQUETAS_CANCER}, opcionales=frozenset(ETIQUETAS_CANCER)
        ),
        "p95E2eS": Numero(),
        "p95Corridas": Numero(),
        # Una clave por tipo habilitado y por idioma del baseline; una celda sin consultas es ``null`` (no medida).
        "metricasPorTipoEIdioma": Objeto(
            {
                c: Objeto({i: Anulable(_POR_CANCER) for i in IDIOMAS_DEL_BASELINE})
                for c in ETIQUETAS_CANCER
            },
            opcionales=frozenset(ETIQUETAS_CANCER),
        ),
    }
)
