# Proposal — l1d-232-adr41-framework-evaluacion

## Trazabilidad

L1D-232 · US-014 · ADR-41 · FEAT-T5a (L1D-46) · Sprint 2 (desde S1, `[Pre-S1 resp. 9]`) ·
Estimación **3** · Historia de ADR · FR-20, IA-10 · OL-06 · RN-12, RN-14, RN-22 · AC-T5.3,
AC-T5.4 · US-014 AC-1…AC-5 · Fuente: `backlog/features/FEAT-T5a-baseline-evaluacion.md` §US-014;
contexto: `backlog/sprints/S2-refinamiento.md` §3.2 (**P-3, pendiente de confirmación del
usuario**); nota ADR-45 del usuario (2026-10-20): metas de recuperación provisionales hasta US-229.

## Why

La suite `evaluate` (US-072) y su exigencia en la DoD (US-074) necesitan una decisión cara de
revertir: con qué framework y protocolo se calculan las métricas de OL-06, cuáles son
deterministas, qué juez mide la fidelidad y cómo se adjunta el reporte al PR. ADR-39 fase B está
aceptada (LLM G), lo que desbloquea el juez local.

## What Changes

- **Nuevo** `docs/architecture/adr/ADR-41-evaluacion-ia.md` (MADR) con el encuadre **propuesto**
  (P-3, pendiente de confirmación):
  - **Opción A elegida: framework propio con Pytest**, sobre la base existente en
    `apps/rag-orchestrator/app/evaluation/` (`retrieval_metrics.py`: recall@10, MRR con IC 95 %
    *bootstrap*; NLI; partición congelada `data/eval/ol06-particion-v1/` de ADR-45).
  - **Fidelidad:** NLI mDeBERTa (ADR-39 fase A) como **juez principal** (determinista); juez LLM
    local **G** (`gemma4:26b-a4b-it-q4_K_M` por Ollama `/v1`, `temperature=0`, `seed` en
    configuración) como **secundario**, con su sesgo de autoevaluación declarado (es el mismo modelo
    que genera).
  - **Descartadas:** ragas 0.4.3 (telemetría activa por defecto, juez OpenAI por defecto → riesgo
    RN-12 por olvido de configuración, langchain como dependencia, sin release desde 2026-01) y
    DeepEval 4.3.1 (telemetría PostHog/OTel y juez OpenAI por defecto, *churn* semanal); el híbrido
    hereda los mismos riesgos en la pieza de fidelidad.
  - **Tabla métrica → cálculo** para todas las familias de OL-06 (recuperación, generación, OCR, PII,
    eventos, mapeo, faltantes, discrepancias, aplicabilidad, agente, metadatos del corpus):
    determinista o con juez (AC-1).
  - **Reproducibilidad:** métricas deterministas idénticas entre corridas; semilla y temperatura del
    juez en configuración (AC-2).
  - **Juez local, nunca nube**, y **test de CI sin salida a red** que protege RN-12 (AC-3).
  - **Reporte:** agregados + configuración (modelos, prompt, umbrales, `corpusRelease`,
    `catalogVersion`), rótulo validada / no validada, nunca datos reales (AC-4).
  - **DoD:** cómo se adjunta el reporte al PR que cambia modelo, prompt, umbral, **catálogo** o
    corpus (job `eval-required` con configuración de CI sin modelos pesados; reporte con modelos
    reales adjuntado desde la máquina de referencia cuando la CI no puede correrlos) (AC-5).
- **Fila** de ADR-41 en `docs/architecture/adr/README.md` y marca en `backlog/02-adrs.md` **al
  implementarse**.
- Sin código de producto ni cambios de contrato: `skip_specs: true`.

## Capacidades afectadas

Ninguna spec se modifica (`skip_specs: true`). Relacionada, sin delta: `ai-evaluation` (la
especifican `l1d-235-suite-evaluate`, `l1d-236-calibracion-umbral-baseline` y
`l1d-237-eval-required-ci` conforme a este ADR).

## Bounded contexts

- **ai-services** (único): `docs/architecture/adr/ADR-41-evaluacion-ia.md`; lectura de
  `apps/rag-orchestrator/app/evaluation/`.

## Dependencias

- ↪ ADR-39 fase B aceptada (change archivado de L1D-274): juez local G.
- ↪ ADR-45 (partición congelada, metas de recuperación provisionales).
- 🔗 Bloquea: `l1d-235-suite-evaluate` (072b, fidelidad con juez; 072a puede empezar con la parte
  determinista), `l1d-236-calibracion-umbral-baseline`, `l1d-237-eval-required-ci` (AC-5 del ADR fija
  cómo se adjunta el reporte), FEAT-T5b.

## Fuera de alcance

Construir los datasets o el *runner* (US-072). Fijar metas (DEC-07, US-017). Scoring de evidencia
clínica (ADR-7). Cambiar las metas de recuperación antes de US-229 (nota ADR-45).
