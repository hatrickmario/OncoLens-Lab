# Proposal — l1d-300-reescritura-consulta-segundo-loop

## Trazabilidad

L1D-300 · US-238 · FEAT-06b (recuperación híbrida y filtros) · Sprint 4 · Estimación **5** · — (técnica, PRD §17; V-04) ·
FR-09 (recuperación), FR-27 (Base del análisis), IA-02, RN-02 (**enmendado**, PRD §0 E-14), RN-03, RN-06, RN-10, RN-11, RN-12, RN-22, RN-24, RN-27 · AC-06.1 ·
US-238 AC-1…AC-9 (excepción a la DoR aceptada por 9 AC > 8: una sola superficie `[S4 resp. 12]`) ·
Decisiones del usuario D-c (2026-10-30: `queryRewrite` obligatorio y sin `null`; el segundo loop solo en `/rag/query`; `queryRewrite` se emite en ambos, `no_aplica` en follow-up) y D-d (2026-10-30: el rescate se declara en la Base del análisis) ·
🔗 Regresión [RN-02] → US-055 · 🔗 Regresión [RN-03] → US-055 · 🔗 Regresión [RN-10, RN-11, RN-12] → US-049 ·
🔗 Medido en: US-133 · Recorrido principal: no · Fixture: FX-06b-a (extiende FX-06a-a y FX-06a-b) ·
Sprint: `backlog/sprints/S4-refinamiento.md`, fila 12.

## Dependencias

- ⛔ ADR-39 (LLM local): decidido y mergeado; el adapter `infrastructure/llm/openai_compatible.py` es la base del `QueryRewriter`.
- ⛔ `l1d-109-busqueda-hibrida-retrieval-mode` (US-112, mismo S4): **orden de merge 109 → 300** dentro de la cadena de contratos (rag-orchestrator 291 → 109 → 295 → 144 → 300; clinical-api 291 → 95 → 295 → 144 → 300): este change rebasa sobre `l1d-144` (que deja `rag-orchestrator` en 1.9.0 y `clinical-api` en 1.14.0) y sobre 109 (1.7.0, `fusion`/`fusionParam`) en `apps/rag-orchestrator/openapi.yaml` (este lo sube a 1.10.0), en los ejemplos `rag-query-*.json`/`rag-follow-up-*.json` y en `_recuperar()`/`_armar_meta_de_recuperacion`. Misma política de `retrievalParams` (D-c): claves obligatorias y sin `null`. El segundo loop reutiliza el modo de recuperación configurado por 109.
- ✅ Enmienda a RN-02 aplicada en `docs/PRD.md` (E-14) por la sesión principal `[S4 resp. 12]`; no hay que tocar el PRD.
- ↪ US-055 (`sin_evidencia` sin invocar al LLM; spec `evidence-analysis`, ya en main): este change la enmienda.
- ↪ US-066/US-067 (Base del análisis, specs `analysis-basis` y `evidence-panel` en main): este change añade un campo a `sourcesConsulted` y su texto en el panel (D-d).
- ↪ US-049 (desidentificación en `clinical-api`): el enmascaramiento de la pregunta es suyo; aquí se añade su regresión con PII sembrada.
- ↪ US-113 (expansión bilingüe, sin LLM): coexiste; este paso solo actúa cuando el primer loop ya falló.
- ↪ US-226 (runner de variantes de `evaluate`): el AC-9 usa su brazo "reescritura".
- ↪ `l1d-295-afirmaciones-atomicas-por-papel` y `l1d-296`: sin dependencia dura; tocan `RAGOrchestratorService` en otra rama (generación), conflicto textual posible. Las versiones de `clinical-api` de otros changes del S4 van antes (rebasa sobre `l1d-144`, 1.14.0); este fija **1.15.0**.

## Capacidades afectadas

- `evidence-analysis` (MODIFIED RN-02; ADDED reescritura, configuración, `queryRewrite` en `/rag/query` y `no_aplica` en `/rag/follow-up`).
- `api-contracts` (ADDED: `RagMeta.retrievalParams.queryRewrite` obligatorio y sin `null`; `AnalysisBasis.sourcesConsulted.queryRewritten`).
- `analysis-basis` (ADDED: la Base declara la reescritura que rescató evidencia, D-d).
- `evidence-panel` (ADDED: el texto bajo «Qué se buscó»).
- `ai-evaluation` (ADDED: medición del brazo de reescritura).

Bounded contexts: **ai-services** (principal), **contratos** (`apps/rag-orchestrator/openapi.yaml` 1.10.0 y `apps/clinical-api/openapi.yaml` 1.15.0, aditivos), **clinical-platform** (persistencia de `queryRewrite` en `retrieval_params` y armado de `queryRewritten` en la Base) y **frontend** (una línea de texto en la Base del análisis).

## Why

Una pregunta con ortografía degradada, una sigla o un fármaco fuera del vocabulario de la pregunta da cero chunks sobre el umbral y
termina en «sin evidencia» aunque el corpus sí tenga la respuesta. Un único segundo loop con el LLM local, que reescribe la consulta
solo para recuperar, recupera esos casos sin comprometer RN-02 (si tampoco supera el umbral, sigue sin invocar al LLM de generación).
Cuando la reescritura rescata evidencia, el oncólogo debe saberlo: la Base del análisis lo declara.

## What Changes

- **`QueryRewriteStep`** en `RAGOrchestratorService`, entre el umbral del primer loop y `_responder_sin_evidencia`: solo en `/rag/query`, solo con cero chunks sobre el umbral y `QUERY_REWRITE_ENABLED = true` (AC-1, AC-2). En `/rag/follow-up` no corre nunca (su *prompt* nunca recibe la memoria rotulada, RN-24).
- **Puerto `QueryRewriter`** con un Adapter sobre el LLM local en `infrastructure/llm/` y un fake con contador de llamadas (`LLM_PROVIDER=fake`). Prompt nuevo versionado (AC-8).
- **Regla pura de `domain/`** `filtrarTerminosDelCatalogo()` (RN-27): solo términos presentes en el catálogo versionado se usan (AC-6); `debeReescribir()` (disparo) y límite `QUERY_REWRITE_MAX_ITERATIONS` (AC-4).
- **La pregunta original manda** (AC-7): el reranker puntúa los chunks del segundo loop contra la pregunta original; la reescritura solo cambia el vector enviado a Milvus; el `AIAnalysisRecord` guarda la original.
- **Fallo cerrado a `sin_evidencia`** si el LLM está caído o vence `QUERY_REWRITE_DEADLINE_MS` (AC-5), sin nube ni `5xx`.
- **Contrato `rag-orchestrator` 1.10.0 (aditivo):** `meta.retrievalParams.queryRewrite = {applied: boolean, reason: disparado | no_disparado | no_disponible | no_aplica}`, obligatorio y sin `null`, emitido en `/rag/query` y en `/rag/follow-up` (allí siempre `{applied: false, reason: "no_aplica"}`); persistido por `clinical-api` en `retrieval_params`.
- **Base del análisis (D-d), contrato `clinical-api` 1.15.0 (aditivo):** `AnalysisBasis.sourcesConsulted.queryRewritten` (boolean obligatorio), `true` solo si el segundo loop rescató evidencia; el panel muestra bajo «Qué se buscó»: «La búsqueda se repitió con una reformulación de la pregunta con términos del catálogo; la relevancia se calculó contra la pregunta original».
- **Medición (AC-9):** brazo "reescritura" en `evaluate` con latencia añadida, recall@10/MRR y «sin evidencia» ≥ 0,90; si no cumple, `QUERY_REWRITE_ENABLED = false` por defecto.
- **MODIFIED** requisito de `evidence-analysis` «Sin evidencia sobre el umbral…» (RN-02 enmendado).

## Fuera de alcance

- Agente acotado de FR-30 (Post-MVP): este bucle es de una iteración y es independiente.
- Expansión bilingüe (US-113) y búsqueda híbrida (US-112, `l1d-109`): no cambian.
- Reescribir cuando el primer loop ya tiene al menos un chunk sobre el umbral (el caso del demo del 2026-10-23 es US-236, no este).
- Reescritura en `/rag/follow-up` e implementar ese endpoint (solo se fijan su contrato y ejemplos).
- Streaming del texto de la reescritura; mostrar la consulta reformulada (nunca sale de `rag-orchestrator`).
- Aplicar la enmienda al PRD o sincronizar Linear (ya resuelto por la sesión principal).
