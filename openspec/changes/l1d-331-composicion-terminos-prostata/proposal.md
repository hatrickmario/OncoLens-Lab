# Proposal — l1d-331-composicion-terminos-prostata

## Trazabilidad

L1D-331 · US-273 · FEAT-12 (L1D-312) · Sprint 6 · Estimación **2** · HU-03 · FR-09 · RN-02, RN-22, RN-27, RN-29, RN-11 ·
ADR-52 · US-273 AC-1…AC-5 · `[S6 resp. 24]` · Fuente: `backlog/features/FEAT-12-chatbot-mvp.md` §US-273; deuda D6-42, D6-43;
medición de partida: Gate 2 de L1D-329 (54 de 66 top-3 de las 22 preguntas genéricas son de cribado con el caso de
próstata). Medido en US-269 (corrida final única, D6-50).

## Why

`terminos_del_caso` toma como biomarcador principal el primero de `datos-criticos` que el caso trae; en próstata es
«Antígeno prostático específico (PSA)», y una consulta anclada en PSA recupera casi solo cribado. Estadio y grado (ISUP)
sí describen el tratamiento.

## What Changes

- **Catálogo (declarativo):** `lenguaje/marcos-de-pregunta.json` gana la sección opcional
  `expansion.biomarcadoresNoAnclables` (tipo -> nombres normalizados de biomarcador de `datos-criticos` que **no** anclan la
  consulta contextual); en próstata `["psa"]`. Mama no declara nada: sin cambio.
- **Dominio:** `terminos_del_caso` salta, al elegir el biomarcador principal, los de esa lista; sin código clínico en el
  dominio. El siguiente biomarcador del catálogo presente en el caso (p. ej. HRR) toma su lugar; si no hay, el campo
  `biomarcador_principal` no aporta.
- **Versiones:** `manifest.json` 1.8.0 -> 1.9.0 y `marcos-de-pregunta.json` 1.7.0 -> 1.8.0, con el barrido coherente.
- Sin cambio de contrato OpenAPI, de umbral, de `RERANKER_MAX_PAIRS`, de `RETRIEVAL_MODE` ni de
  `QUERY_CONTEXT_EXPANSION_ENABLED` (sigue apagado).

## Capabilities

### Modified Capabilities

- `clinical-catalogs`: sección `expansion` del léxico, su esquema y validador.
- `evidence-analysis`: composición de términos del segundo loop contextual.

## Dependencias

↪ `l1d-329-segundo-loop-contextual` (US-271, mergeado). Medido en la corrida final combinada (D6-50).

## Fuera de alcance

Activar la expansión; medir con modelos reales (corrida final única, D6-50); cambiar umbral o recuperación.

## Impact

`packages/clinical-catalogs/` (léxico, esquema, validador, fixture `temas-del-caso.json`, manifest), `scripts/catalog/`,
`apps/rag-orchestrator/app/{domain,infrastructure}/` y tests, y el barrido de la versión 1.8.0 en ejemplos y tests de
`clinical-api` y `rag-orchestrator`. Cambia catálogo: la suite `evaluate` se mide en la corrida final (D6-50).
