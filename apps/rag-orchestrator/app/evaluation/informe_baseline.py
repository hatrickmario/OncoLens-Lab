"""Informe del baseline técnico (``eval/reports/S1-baseline.md`` y su JSON de agregados, US-073): solo cifras y
configuración, nunca textos de preguntas ni de salidas (RN-14). Determinista: sin fechas ni azar.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from app.evaluation.barrido import Eleccion, FilaBarrido
from app.evaluation.metas import Meta, MetricaMarcada, marcar_frente_a_meta, nota_adr42

NO_EJECUTABLE = "NO-EJECUTABLE aquí"
CLAVE_P95 = "p95_evidence_analyses_s"
ETIQUETAS_CANCER = {"mama": "mama", "prostata": "próstata"}

PROCEDIMIENTO_REAL = """\
Cifras reales (modelos de ADR-39 + Compose) en la máquina de referencia (MacBook Pro M5 de 32 GB):

1. Verificar los modelos desde la fuente: `ollama list` (tags y tamaños) y `ollama ps` (residencia y memoria) con el LLM de ADR-39 fase B.
2. Levantar el stack: `docker compose -f infra/docker/docker-compose.yml up -d` y el LLM nativo (`ollama serve`).
3. Barrido real: `npm run evaluate -- --config apps/rag-orchestrator/eval/configs/<config-local>.yaml --sweep relevance_threshold --fijar --salida apps/rag-orchestrator/eval/reports` (la regla D1 usa solo desarrollo + validación de `ol06-particion-v1`; la prueba solo con `--prueba-final`).
4. p95 de punta a punta: 3 corridas de ≥ 30 consultas contra `clinical-api` en la red interna (subcomando `e2e` de `app/scripts/adr39/`); la mediana de los p95 se pasa con `--p95-e2e-s <segundos>`.
5. Regenerar el baseline: `npm run evaluate -- --suite all --report json --config <config-local> --salida data/evaluation --nombre-archivo baseline.json`.
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
            f"| {f.umbral:.2f} | {_numero(f.exactitud_sin_evidencia)} | {_numero(f.recall_at_10)} |"
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
            "fidelidad = porcentaje de opciones con cita y soporte NLI (el juez de fidelidad de ADR-41 solo corre con modelos reales)."
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
    ]


def _seccion_p95(d: DatosDelInforme, meta_p95: Meta | None) -> list[str]:
    nota = nota_adr42(d.p95_e2e_s, meta_p95.maximo or 0.0) if meta_p95 else None
    medida = (
        f"p95 medido de punta a punta: {d.p95_e2e_s:g} s (mediana de 3 corridas)."
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
            "fidelidad",
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
    ]
    return "\n".join(linea for bloque in secciones for linea in bloque).rstrip() + "\n"


def agregados_del_informe(d: DatosDelInforme) -> dict[str, Any]:
    """El JSON de agregados: las mismas cifras del informe, sin textos."""
    marcas = marcar_frente_a_meta({**d.metricas_totales, CLAVE_P95: d.p95_e2e_s}, d.metas)
    return {
        "esquema": "oncolens.baseline.v1",
        "claseDataset": d.clase_dataset,
        "proveedor": d.proveedor,
        "hashConfig": d.hash_config,
        "referenciaDeterminista": d.proveedor == "fake",
        "barrido": {
            "umbralDeReferencia": d.umbral_de_referencia,
            "toleranciaRecall": d.tolerancia_recall,
            "filas": [
                {
                    "umbral": f.umbral,
                    "exactitudSinEvidencia": f.exactitud_sin_evidencia,
                    "recallAt10": f.recall_at_10,
                }
                for f in d.filas
            ],
            "elegido": d.eleccion.umbral,
            "fijado": d.fijado,
        },
        "metricas": [
            {"metrica": m.clave, "valor": m.valor, "meta": m.meta, "estado": m.estado}
            for m in marcas
        ],
        "metricasPorCancer": {c: dict(v) for c, v in d.metricas_por_cancer.items()},
        "p95E2eS": d.p95_e2e_s,
    }
