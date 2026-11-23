# Proposal — l1d-331-cobertura-prostata-segundo-loop

## Trazabilidad

L1D-331 · US-273 · FEAT-12 (L1D-312) · Sprint 7 (arrastre del S6, **alcance residual**) · Estimación 2 (nominal) ·
HU-03 · FR-09, FR-20 · RN-02, RN-11, RN-12, RN-22, RN-27 · ADR-52 · OL-06 · US-273 **AC-2** (medición) y **AC-3** (su
test) · deuda **D6-57** (cobertura de próstata), D6-60 y D6-33 (cifras sin reporte versionado) · `[S7 resp. 2]`
(corrida base y corrida final) · `[S7 resp. 10]` (corpus fijo de la familia `contextual`) · `[S7 resp. 11]` (umbrales
actuales) · regla del S7 «ninguna cifra sin reporte versionado en `reports/eval/`».
Fuente: `backlog/features/FEAT-12-chatbot-mvp.md` §US-273; `backlog/sprints/S7-refinamiento.md` §1, §4 y §5;
`backlog/sprints/S6-cierre.md` §Linear; `backlog/sprints/S6-deuda.md` D6-57.
Change original, archivado: `openspec/changes/archive/2026-11-13-l1d-331-composicion-terminos-prostata/` (AC-1, AC-4 y
AC-5 entregados; sus requisitos ya están en `openspec/specs/` y **no se reescriben aquí**).

## Why

El S6 dejó de anclar la consulta contextual de próstata en el PSA, y el top-3 dejó de ser cribado. Pero la cobertura
quedó bajo la meta: 9/22 genéricas con evidencia en el caso con grado y 13/22 en el caso con HRR, frente a ≥ 18/22
(US-273 AC-2; D6-57). Esas cifras salieron de scripts del scratchpad, no de un reporte versionado (D6-60). Además, el
AC-3 (solo términos del catálogo) no tiene un test propio con el caso de próstata: se apoya en el de US-271 AC-6, que
usa mama.

## What Changes

- **Test del AC-3** (ai-services): test de aceptación `[US-273 AC-3]` con el caso de próstata y datos sembrados. El
  requisito ya existe en `evidence-analysis`; falta el test.
- **Medición versionada del AC-2** (ai-services, evaluación): la familia `contextual` de `evaluate` corre las
  22 genéricas con los dos casos sintéticos de próstata y reporta la cobertura por caso, el top-3 por pregunta y la
  no regresión de las 60 preguntas. La meta vive en la configuración de la suite. Este código entra **antes de la
  corrida base**, para que el reporte base ya traiga el caso `prostata-con-psa-y-hrr`, el top-3 y la meta. Corpus: el
  del dataset `s5-corpus-ampliado` en memoria, el mismo en la base y en la final (`[S7 resp. 10]`).
- **Composición de términos:** no se cambia a ciegas. Primero se mide en la corrida base y se diagnostica la etapa que
  pierde las genéricas. Solo si la pérdida es de composición se aplica la opción que elija el humano entre las del
  `design.md`, con términos solo del catálogo (RN-27) y la pregunta original primero.
- **Criterio de cobertura de próstata (D6-57):** lo decide el usuario sobre el reporte de la corrida final.
- Sin cambio de contrato OpenAPI, umbral, modelo, prompt, `RETRIEVAL_MODE` ni `RERANKER_MAX_PAIRS`. Sin nube (RN-12).

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `ai-evaluation`: ADDED, cobertura de genéricas por caso de próstata en la medición del loop contextual.
- `evidence-analysis`: **sin delta**. El requisito «La composición de términos del segundo loop contextual no ancla en
  biomarcadores no anclables» y su escenario `[US-273 AC-3]` ya están en `openspec/specs/`; este change añade su test.

**Bounded contexts:** ai-services (`apps/rag-orchestrator`: tests y `app/evaluation/`). clinical-platform y frontend:
no se tocan. `packages/clinical-catalogs` solo si el humano elige una opción de composición que lo requiera.

## Dependencias

- ⛔ `l1d-329-segundo-loop-ac9-reporte` (residual de L1D-329, D6-33): crea la familia `contextual` de `evaluate`
  (`contextual-fake.yaml`, `contextual-local.yaml`, `contextual.casos`). Este change la **amplía** (segundo caso de
  próstata, top-3 por pregunta, meta y comparación con el reporte base); no crea otra. Tocan los mismos archivos de
  `app/evaluation/`: este va después.
- **Orden de los archivos de la suite** (propuesta de planificación, se aprueba con el plan): `l1d-334` → `l1d-329` →
  **este change (parte de código)** → `l1d-336` → `l1d-335` → `l1d-337`. La parte de código se mergea **antes de la
  corrida base**; el cambio condicional de composición, después de ella.
- ↪ `l1d-334-diagnostico-etapas-recuperacion` (US-276): atribución de la pérdida por etapa en la corrida base.
- ↪ `l1d-336-reranker-ventanas-chunk` (US-278), `l1d-337-contexto-documento-chunk` (US-279) y
  `l1d-119-corpus-ampliado-calibracion`: cambian la recuperación, pero sus brazos se miden sobre la ingesta de
  `l1d-119`, en sus propios reportes. La familia `contextual` no cambia de corpus (`[S7 resp. 10]`): la medición final
  de AC-2 corre con el código y el catálogo de `main` en ese momento y con los umbrales actuales (`[S7 resp. 11]`).
- ↪ `l1d-335-sinonimos-procedimientos-relacion` y `l1d-126-criterios-aplicabilidad-catalogo`: suben
  `manifest.version`. La medición final corre con el catálogo ya mergeado. Este change solo toca
  `lenguaje/marcos-de-pregunta.json` si el usuario elige su opción C; en ese caso va **el último** de la cadena de
  versiones: `l1d-126` parte A → `l1d-335` (1.10.0) → `l1d-126` parte B (1.11.0) → este.
- 🔗 Corrida base y corrida final del S7 (`[S7 resp. 2]`): no hay corrida propia de este change.

## Fuera de alcance

- Reescribir los requisitos de AC-1, AC-4 y AC-5 (archivados).
- Cambiar `RELEVANCE_THRESHOLD`, el gate G1, `RETRIEVAL_MODE`, `RERANKER_MAX_PAIRS` o los modelos.
- Sinónimos de próstata (L1D-335) y criterios de aplicabilidad C-1…C-5 (L1D-126).
- Campos nuevos del caso en `contextExpansion.fields` (cambio de contrato): exigiría historia nueva.
- E2E de próstata del chat (D6-49, Post-MVP) y la calibración del NLI (D6-58).

## Impact

`apps/rag-orchestrator/tests/integration/test_rag_query_contextual.py`, `apps/rag-orchestrator/app/evaluation/` (familia
`contextual`), `apps/rag-orchestrator/eval/configs/`, `apps/rag-orchestrator/tests/evaluation/` y, por el
humano, `reports/eval/`. La suite `evaluate` con modelos locales corre en la corrida final.
