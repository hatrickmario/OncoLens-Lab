# Proposal — l1d-333-reporte-h3

## Trazabilidad

L1D-333 · US-275 · FEAT-12 (chatbot MVP) · Sprint 7 · **residual de la historia: el reporte H-3 versionado en
`reports/eval/`** (evidencia de AC-2 y AC-4) · deuda **D6-60** (`backlog/sprints/S6-deuda.md`; tarea H-3 del change
archivado) · hallazgo A1 de `backlog/sprints/S6-trazabilidad.md` · FR-09, FR-20 · RN-02, RN-22 · OL-06 · ADR-39
(enmienda ya registrada, sin reabrir), ADR-52 · `[S7 resp. 2]` (corrida base) · regla del S7 «ninguna cifra sin reporte
versionado en `reports/eval/` producido por `run-ai-eval`; un script del scratchpad no cuenta»
(`backlog/sprints/S7-refinamiento.md` §4) · orden del §5: el reporte sale de la corrida base.

El change original, `l1d-333-defaults-expansion-max-pairs`, está archivado
(`openspec/changes/archive/2026-11-13-l1d-333-defaults-expansion-max-pairs/`, PR #393). Sus requisitos viven en
`openspec/specs/evidence-analysis/` y **no se reescriben**. AC-1, AC-3, AC-5, AC-6 y AC-7 están cerrados; los valores
por defecto (`RERANKER_MAX_PAIRS=20`, `QUERY_CONTEXT_EXPANSION_ENABLED=true`) ya están en `main` y no se tocan.

## Por qué

L1D-333 volvió a In Review en el cierre del S6: el AC-2 pide el p95 de consulta completa «en el reporte H-3 de
`reports/eval/`» y el AC-4, recall@10, MRR, adversarias y controles frente a la línea base en ese mismo reporte. Las
cifras de la corrida final del 2026-11-07 salieron de scripts del scratchpad (`medir_final.py`, `ctx_final.py`), sin
A/B del mismo día y sin que el `evaluate` oficial midiera la expansión (D6-60). No son reproducibles desde el repo y la
regla del S7 no deja citarlas. Falta un reporte producido por `run-ai-eval`.

## Qué cambia

- **Reporte versionado** `reports/eval/l1d-333-reporte-h3.md` con sus JSON, de la **corrida base** del S7. Lo escribe
  `ai-eval-runner`; lanzar la corrida es tarea humana. Contenido:
  - AC-2: p95 de consulta completa (`latencia_p95_ms.consulta` del runner) con `RERANKER_MAX_PAIRS=20`, la muestra y las
    condiciones de la máquina (sin otras cargas, sin swap, un solo `ollama serve`).
  - AC-4, recuperación: recall@10, MRR y «sin evidencia» de `--suite all` sobre `s5-corpus-ampliado`, con el brazo de 20
    pares y el **brazo de 12 pares en la misma corrida** como línea base (cierra la limitación «sin A/B del mismo día»).
  - AC-4, expansión: adversarias con evidencia (falsos positivos) y controles con evidencia, con la expansión activa y
    apagada, de la familia `contextual` de `l1d-329-segundo-loop-ac9-reporte`.
  - Lectura de la regla de parada (AC-3) con el p95 medido: si supera el tope vigente, el change se detiene y pregunta;
    no cambia valores por defecto.
- **Sin código ni tests nuevos**: se usan `eval/configs/s5-calibracion.yaml`, el tope de pares por el entorno de ADR-39
  y `eval/configs/contextual-local.yaml` (de `l1d-329-segundo-loop-ac9-reporte`).
- Las cifras del S6 (17,05 s, 18,3 s, 0,906, 0,887, línea base densa de 14,7 s) quedan como antecedente **sin reporte**:
  el reporte nuevo no las usa como línea base ni las repite como evidencia.

## Capabilities

### New Capabilities

- Ninguna.

### Modified Capabilities

- Ninguna. No cambia ningún requisito ni escenario: solo falta la evidencia versionada de una medición ya especificada.
  Por eso el change va con `skip_specs: true` (mismo mecanismo que `l1d-316-langgraph-upgrade`).

## Bounded contexts

- **ai-services**: solo evaluación (`apps/rag-orchestrator/eval/configs/` en lectura; `reports/eval/` lo escribe
  `ai-eval-runner`). Sin cambios en `app/`.
- **clinical-platform** y **frontend**: no se tocan. Sin `## contratos`.

## Dependencias

- ↪ `l1d-329-segundo-loop-ac9-reporte` (US-271): la familia `contextual` y `contextual-local.yaml` deben estar en `main`
  antes de la corrida base; de ahí salen adversarias y controles con la expansión.
- 🔗 `l1d-119-corpus-ampliado-calibracion` (US-120): su línea base (tarea 8.4) usa la misma configuración
  `s5-calibracion.yaml`. Se corren en la misma ventana, **una corrida real a la vez**; si el brazo de 20 pares de este
  reporte es la misma ejecución que la línea base de `l1d-119`, se enlaza su JSON en vez de repetirla.
- **Umbrales (`[S7 resp. 11]`):** la corrida base y la final corren con los umbrales actuales
  (`NLI_ENTAILMENT_THRESHOLD`, `RETRIEVAL_TOP_K`, `RELEVANCE_THRESHOLD`) y ningún valor por defecto cambia entre
  ambas; los calibrados de `l1d-119` solo son un brazo de la final. Este reporte se mide con los actuales y los
  declara; no depende del orden respecto de los barridos.
- **Corpus (`[S7 resp. 10]`):** uno fijo, registrado en el reporte. Las tres mediciones usan el dataset
  `s5-corpus-ampliado` en memoria: A y B por `s5-calibracion.yaml` y C por la familia `contextual`
  (`l1d-329`). Este reporte no usa la ingesta de `l1d-119`.
- Sin `⛔`. En `main`: L1D-298 (`proveedor: local`), L1D-333 original (valores por defecto).

## Fuera de alcance

- Cambiar `RERANKER_MAX_PAIRS`, `QUERY_CONTEXT_EXPANSION_ENABLED`, `RETRIEVAL_MODE`, `RERANK_TOP_N` o el tope de p95.
  La decisión 20 frente a 30 pares (D6-61) es de `l1d-335` (US-277 AC-6), sobre la corrida final.
- Fidelidad NLI (D6-46, D6-58), próstata (D6-57, L1D-331) y `chat-local` (D6-59, L1D-326).
- Recuperar o versionar los scripts del scratchpad del S6.
- Mover L1D-333 en Linear y actualizar `backlog/`: lo hace `/sprint-close`.
