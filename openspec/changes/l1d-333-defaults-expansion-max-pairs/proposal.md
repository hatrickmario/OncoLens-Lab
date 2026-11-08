# Proposal — l1d-333-defaults-expansion-max-pairs

## Trazabilidad

L1D-333 · US-275 · FEAT-12 (L1D-312) · Sprint 6 · Estimación **2** · HU-03 · FR-09 · RN-02, RN-22 · ADR-39 (enmienda), ADR-52 ·
US-275 AC-1…AC-7 · `[S6 resp. 24]` · Fuente: `backlog/features/FEAT-12-chatbot-mvp.md` §US-275; deuda D6-42, D6-44, D6-45.
Medido en US-269 (corrida final única, D6-50). Depende de US-271 (L1D-329) y US-273 (L1D-331), ambas en `main`.

## Why

El segundo loop contextual (US-271) nace apagado y el tope de pares del *reranker* quedó en 12 (ADR-39). La medición de
D6-44 dio, de 12 a 20 pares, +3,1 puntos de recall y un falso «sin evidencia» menos por +0,66 s de p95 de recuperación; el
p95 de consulta completa estimado es ~15,4 s frente a 14,7 s de la línea densa (D6-45, con la máquina cargada). El usuario
decidió (2026-11-07) activar ambos valores por defecto, con regla de parada si la medición limpia supera 15 s.

## What Changes

- **Configuración (RN-22):** `EXPANSION_HABILITADA_INICIAL` pasa de `False` a `True`, de modo que `Settings` trae
  `QUERY_CONTEXT_EXPANSION_ENABLED=true`; `false` en el entorno restituye el comportamiento previo a US-271 (AC-6).
  `RETRIEVAL_MODE=dense` y `RERANK_TOP_N=10` no cambian.
- **`RERANKER_MAX_PAIRS` 12 -> 20:** el valor inicial no vive en `Settings` (el submodelo `modelos` lo exige del entorno,
  ADR-39) sino en `.env.example` y en el bloque `adr39:decision`; ver `design.md` §3 y la sección `## humano`.
- **ADR-39:** enmienda registrada en prosa con la medición de D6-44 como evidencia (AC-5).
- Sin cambio de contrato OpenAPI, de umbral, de catálogo ni de corpus.

## Capabilities

### Modified Capabilities

- `evidence-analysis`: valor por defecto del indicador de expansión contextual y su invariante de apagado.

## Dependencias

↪ `l1d-329-segundo-loop-contextual`, `l1d-331-composicion-terminos-prostata` (mergeados). **PR separado (AC-7):** su merge
se pide solo tras la corrida final (D6-50); sin corrida, se cierra sin merge y la decisión queda en D6-44.

## Fuera de alcance

Cambiar `RETRIEVAL_MODE` o `RERANK_TOP_N`; activar `QUERY_REWRITE_ENABLED`; D6-46, D6-47, D6-48; medir con modelos reales
(corrida final única, D6-50); editar `.env.example`, Compose o `reports/eval/` (protegidos, tareas `## humano`).

## Impact

`apps/rag-orchestrator/app/domain/expansion_contextual.py`, tests de configuración y de integración que dependían del
default apagado, `docs/architecture/adr/ADR-39-modelos-locales.md`. Cambia un umbral/recuperación: la suite `evaluate` se
mide en la corrida final (D6-50).
