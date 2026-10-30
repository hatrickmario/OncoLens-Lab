# Proposal — l1d-109-busqueda-hibrida-retrieval-mode

## Trazabilidad

L1D-109 · US-112 · FEAT-06b (recuperación híbrida y filtros) · Sprint 4 (desde `si-hay-capacidad`, `[S4 resp. 17]` `[S4 resp. 18]`) · Estimación **5** · — (técnica, PRD §17; V-04) ·
FR-09 (S3: *sparse*), IA-03, RN-03, RN-05, RN-22, RN-02 (regresión) · AC-06.1 (híbrida) · AC-T1.4 ·
US-112 AC-1…AC-6 (AC-5 corregido y AC-6 nuevo el 2026-10-30) ·
ADR-39 (modelo *sparse*, decidido) · ADR-45 (brazos A2 RRF k = 60 y A2b ponderada 0,3) · ADR-26 (cambio aditivo) ·
Decisión del usuario D-c (2026-10-30: `fusion` y `fusionParam` obligatorios y sin `null`) ·
🔗 Regresión [RN-02] → US-055 · 🔗 Regresión [RN-05] → US-055 · 🔗 Medido en: US-133 (FEAT-T5b) · Recorrido principal: no · Fixture: FX-06a-a y FX-06a-b extendidos con recuperadores dense/sparse falsos (`Q-KEYWORD`, `ch-m2-1`, `ch-m1v0-1`, `ch-p1-1`, `Q-HER2`, `Q-SIN`) ·
Sprint: `backlog/sprints/S4-refinamiento.md`, filas 17 y 18.

## Dependencias

- ⛔ ADR-39 (modelo *sparse* BGE-M3): decidido y mergeado.
- ⛔ US-117b (`reindex-sparse`, *sparse* poblado en el corpus; mergeado): la rama *sparse* lee ese campo con el mismo `SPARSE_VECTOR_SOURCE`.
- ↪ US-055 (recuperación *dense*, `sin_evidencia`, solo vigentes; spec `evidence-analysis` en main): este change extiende `_recuperar()`; `dense` queda idéntico por defecto.
- ↪ `l1d-300-reescritura-consulta-segundo-loop` (US-238, mismo S4): comparte `_recuperar()` y `meta.retrievalParams`. **Orden de merge: 109 → 300** (300 rebasa sobre este change, a través de `l1d-144`). En la cadena rag-orchestrator 291 → 109 → 295 → 144 → 300, este change rebasa sobre `l1d-291` (1.6.0) y fija 1.7.0. Política común de `retrievalParams` (D-c): todas las claves obligatorias y sin `null`; este change añade `fusion` y `fusionParam`, 300 añade `queryRewrite`. El segundo loop de 300 llama a la misma `_recuperar()` ya híbrida.
- ↪ `l1d-245-hibrida-vs-dense-misma-corrida` (US-133, FEAT-T5b): mide `dense` vs `hibrida` con las claves `RETRIEVAL_MODE`, `RETRIEVAL_FUSION`, `RRF_K`, `HYBRID_SPARSE_WEIGHT` y lee `fusion`/`fusionParam`; su resultado decide el modo de la demo, no el valor por defecto del código.
- 🔗 US-113 (expansión bilingüe, `si-hay-capacidad`): no cambia.

## Capacidades afectadas

`evidence-analysis` (ADDED: recuperación híbrida, parámetros trazados, valor por defecto) y `api-contracts` (ADDED: `fusion` y `fusionParam` obligatorios y sin `null` en `RagMeta.retrievalParams`, capacidad dueña de `RagMeta`). Sin delta sobre `ai-evaluation` (la medición es de US-133).
Bounded contexts: **ai-services** (principal), **contratos** (`apps/rag-orchestrator/openapi.yaml` 1.7.0, aditivo) y **clinical-platform** solo para una verificación de persistencia sin cambio de código esperado (tarea 3.1). Sin `frontend`.

## Why

La búsqueda semántica sola pierde estudios que mencionan literalmente el fármaco o el gen preguntado. Añadir la rama *sparse* (BGE-M3, ya indexada) y fusionar con RRF o suma ponderada recupera esos candidatos antes del *reranker*, detrás de un flag que deja el comportamiento actual por defecto.

## What Changes

- **Modo configurable:** `RETRIEVAL_MODE = dense | hibrida` (por defecto `dense`), `RETRIEVAL_FUSION = rrf | ponderada` (por defecto `rrf`), `RRF_K = 60`, `HYBRID_SPARSE_WEIGHT = 0,3` en `settings.py` y `.env.example` (RN-22).
- **Regla pura de `domain/`** `fusionar_candidatos()` con RRF y suma ponderada, determinista (desempate por `chunk_id`); la fusión solo elige candidatos, nunca es `relevance_score` (RN-03).
- **Puerto de búsqueda *sparse*:** `MilvusRepository.hybrid_search()` / método *sparse* con el mismo filtro escalar (`is_current`, `cancer_type_tags`, `population`, `source_type`) en ambas ramas (RN-05); el vector *sparse* de la consulta sale del mismo BGE-M3 y `SPARSE_VECTOR_SOURCE` que el del corpus (decisión del 2026-10-27).
- **`_recuperar()` bifurca por modo** dentro de `RAGOrchestratorService` (no en el CLI ni en el agente); en `dense` la rama *sparse* no se invoca.
- **Contrato (aditivo, compatible; `rag-orchestrator` 1.7.0):** `meta.retrievalParams.fusion` (`ninguna | rrf | ponderada`, obligatorio, sin `null`; `ninguna` en `dense`) y `meta.retrievalParams.fusionParam` (número obligatorio, sin `null`: `0` con `ninguna`, `k` con `rrf`, peso *sparse* con `ponderada`), con reglas `if/then` que atan modo, fusión y parámetro. Se emiten en `/rag/query` y en `/rag/follow-up` (mismo `RagMeta`) y se persisten en `retrieval_params`.
- **Test de consistencia** índice/consulta del *sparse* con la misma configuración (si cabe).

## Fuera de alcance

- Medir `dense` vs `hibrida` y decidir el modo de la demo (US-133); cerrar ADR-45 como mejora definitiva.
- Expansión bilingüe (US-113), filtros reales en la UI (US-114/115), barrido de hiperparámetros (ADR-45 P1).
- Reescritura de consulta (US-238) y cambios de código en `clinical-api` (salvo regenerar su schema si fuera cerrado) o `web`.
- Implementar `/rag/follow-up` (solo se fija su contrato y ejemplos; su historia emitirá el bloque con el mismo `_armar_meta_de_recuperacion`).
- Cambiar `relevance_score` u orden de opciones (RN-03, RN-28).


## Decidido (usuario, 2026-10-30)

Desviación de D7: el contrato 1.7.0 fija solo el vínculo modo/fusión con un `if/then/else` (`dense` ⇒ `ninguna` y `fusionParam = 0`; `hibrida` ⇒ `rrf` o `ponderada`). El rango de `fusionParam` (k entero ≥ 1 con `rrf`; peso en (0, 1) con `ponderada`) lo valida únicamente `Settings` al arrancar. Motivo: un `anyOf` por combinación rompe `contracts:breaking` (`response-property-any-of-added`) y habría exigido excepciones ADR-26 E-6/E-7 y ampliar `scripts/contracts/lib/refinamientos.mjs`; se descartaron ambas.
