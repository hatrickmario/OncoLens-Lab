# Proposal — l1d-236-calibracion-umbral-baseline

## Trazabilidad

L1D-236 · US-073 · FEAT-T5a (L1D-46) · Sprint 2 · Estimación **3** (re-estimada desde `?`, **P-1
pendiente**) · FR-20 · TBD-02, TBD-03, TBD-08 · OL-06 · M-06.1, M-06.2, M-07.2 · G-4, G-5 · RN-02,
RN-22 · US-073 AC-1…AC-4 · Fuente: `backlog/features/FEAT-T5a-baseline-evaluacion.md` §US-073;
contexto: `backlog/sprints/S2-refinamiento.md` §2 (re-estimación: reusa `retrieval_metrics.py` y el
modo `sin_evidencia` de ADR-39; se solapa con ARR-03 AC-5).

## Why

"Sin evidencia" (RN-02) depende de `RELEVANCE_THRESHOLD`, hoy fijado sin calibrar (TBD-03). DEC-07
(US-017, cierre del S2) necesita cifras reales del baseline técnico para fijar metas, y ADR-42 el
p95 extremo a extremo.

## What Changes

- **Barrido** `evaluate --sweep relevance_threshold` sobre `RELEVANCE_THRESHOLD_GRID`
  (configuración): por valor, exactitud de "sin evidencia" y recall@10; el valor elegido queda en
  la configuración (`RELEVANCE_THRESHOLD`) con su justificación (AC-1).
- **Baseline técnico** en `eval/reports/S1-baseline.md` (+ JSON de agregados): recall@10, MRR,
  es→en, fidelidad, precisión de citas y "sin evidencia" por tipo de cáncer (mama, próstata), y p95
  de `/platform/evidence-analyses` de punta a punta (3 corridas, mediana) con los modelos de ADR-39 y
  el Compose (AC-2); p95 > 15 s anotado como insumo de ADR-42 sin cambiar la meta (AC-3); cada
  métrica "en meta" / "fuera de meta" frente a las metas iniciales del PRD §2.1, sin modificarlas
  (AC-4).
- `data/evaluation/baseline.json` actualizado con el baseline real (insumo del umbral de regresión
  de US-074 tras DEC-07).
- El valor de `RELEVANCE_THRESHOLD` en `.env.example` **no** lo edita este change: el orquestador
  aplica la excepción (regla del sprint); aquí se fija en la configuración versionada de la suite y
  del servicio.

## Capacidades afectadas

- `ai-evaluation` (ADDED): barrido del umbral, baseline técnico con comparación frente a metas.

## Bounded contexts

- **ai-services:** `app/evaluation/` (barrido y reporte), `eval/configs/`, `eval/reports/`,
  `data/evaluation/baseline.json`, configuración de `rag-orchestrator`.
- La medición del p95 llama al Compose como cliente HTTP; no modifica `clinical-platform`.

## Dependencias

- ⛔ `l1d-235-suite-evaluate` (072a para el barrido y las métricas deterministas; 072b para la
  fidelidad del AC-2).
- ⛔ `l1d-232-adr41-framework-evaluacion` (juez de fidelidad).
- ↪ ADR-39 fase B aceptada (modelos), ADR-45 (partición; metas de recuperación provisionales hasta
  US-229).
- 🔗 Produce para: US-017 · DEC-07 (L1D-234), ADR-42, `l1d-237-eval-required-ci` (umbrales reales
  vía `regression.yaml` tras DEC-07). Solapamiento con ARR-03 AC-5 (L1D-279): coordinar para no
  medir dos veces.

## Fuera de alcance

Fijar metas definitivas (DEC-07). Streaming (ADR-42). Cambiar las metas de recuperación antes de
US-229.
