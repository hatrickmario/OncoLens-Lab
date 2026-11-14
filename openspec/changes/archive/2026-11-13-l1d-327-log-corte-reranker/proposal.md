# Proposal — l1d-327-log-corte-reranker

## Trazabilidad

L1D-327 · US-270 · FEAT-06a · Sprint 6 · Estimación **1** · HU-03 · RN-10, RN-14, RN-22 · ADR-39 (`RERANKER_MAX_PAIRS`) ·
US-270 AC-1…AC-4 · `[S6 resp. 4]` · Origen: `backlog/sprints/S5-cierre.md` §9, ítem 3, recomendación **R4** · Fuente:
`backlog/features/FEAT-06a-analisis-walking-skeleton.md` §US-270.

Decisiones que se respetan o cambian:

- **Decidido (usuario, 2026-11-06)** `[S6 resp. 4]`: del bloque de recuperación del S6 solo entran la corrida nocturna de
  L1D-119 y R4; R1, R2 y R3 pasan a Post-MVP.
- **Cambia la decisión 82** (S1, US-231b AC-9) solo en su cláusula de log: el evento `rag_query_corte` deja de registrar
  «solo recuentos, nunca ids» y pasa a registrar los ids de chunk cortados y su puesto denso. Los ids de chunk son del
  corpus público, no datos del paciente. **Nunca texto** (chunk, pregunta, contexto) sigue vigente (RN-10, RN-14).
  El recorte en sí (los `RERANKER_MAX_PAIRS` mejores por puntaje de recuperación, desempate por `chunk_id`) no cambia.

## Why

En la Demo 5 los dos fragmentos que el *reranker* ponía primero (`nci-mama-hp-en[93]` y `[92]`) quedaron en los puestos
13–15 por similitud densa y nunca se puntuaron por el corte `RERANKER_MAX_PAIRS = 12`; el análisis salió con 0 opciones y
el log solo tenía recuentos, así que el fallo no era observable sin reproducirlo a mano.

## What Changes

- `RAGOrchestratorService._cortar_a_pares_del_reranker` (`apps/rag-orchestrator/app/application/rag_orchestrator_service.py`)
  añade al evento `event=rag_query_corte` el campo `cortados=<chunkId>:<puesto>,…` (puesto denso 1-based, en orden denso)
  y, si se supera el tope, `cortados_omitidos=<n>`. Se actualiza el *docstring* («nunca ids» → «ids y puesto, nunca texto»).
- La lista de cortados con su puesto se calcula con una regla pura con nombre en `app/domain/pares_del_reranker.py`,
  junto a `recortar_a_pares_del_reranker`, sobre el mismo orden.
- Tope de ids en la línea: clave de configuración `RERANKER_CUT_LOG_MAX_IDS` (por defecto 50, `(asumido)` en el AC-4).
- Sin cambios de API, contrato, prompt, modelo, umbral, catálogo ni corpus.

## Capabilities

### New Capabilities

- Ninguna.

### Modified Capabilities

- `evidence-analysis`: requisito ADDED «El log del corte previo al reranker identifica los fragmentos cortados sin su
  texto». El escenario vigente del corte («…registra solo recuentos», en `us-231b-adapter-nli-smoke-semilla`, aún sin
  archivar) queda superado en su línea «sin ids»: ver Dependencias.

## Bounded contexts

`ai-services` únicamente.

## Dependencias

- ↪ ya en `main`: corte previo a pares (US-231a/US-231b AC-9, decisión 82), `recortar_a_pares_del_reranker`, test
  `apps/rag-orchestrator/tests/integration/test_corte_previo_a_pares_del_reranker.py`.
- Archivo: `us-231b-adapter-nli-smoke-semilla` sigue en `openspec/changes/`. Al archivar (bulk-archive del S6) su
  escenario «La etapa de corte envía como máximo 12 pares al reranker y registra solo recuentos» debe reconciliarse con
  este change (conservar el recorte; la línea «sin ids ni texto» pasa a «sin texto», citando `l1d-327`).
- 🔗 Lo usa: la corrida nocturna de L1D-119 (`l1d-119-corpus-ampliado-calibracion`; métrica sugerida «recall previo al
  *reranker*»), sin dependencia de bloqueo.

## Fuera de alcance

- R1, R2 y R3 de `S5-cierre.md` §9 (Post-MVP `[S6 resp. 4]`): cambiar `RERANKER_MAX_PAIRS`, el orden del corte o la
  recuperación.
- La métrica «recall previo al reranker» en OL-06 (L1D-119).
- Exponer los cortados en la respuesta de `/rag/query` o en `meta`.

## Impact

- `apps/rag-orchestrator/app/application/rag_orchestrator_service.py`, `app/domain/pares_del_reranker.py`,
  `app/config/modelos.py` (o el módulo de Settings donde vive `RERANKER_MAX_PAIRS`), `app/bootstrap.py`.
- `apps/rag-orchestrator/tests/integration/test_corte_previo_a_pares_del_reranker.py` y unitarios del dominio.
- `.env.example` (humano, H-1).
