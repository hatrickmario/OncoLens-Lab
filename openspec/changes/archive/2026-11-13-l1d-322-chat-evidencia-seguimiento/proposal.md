# Proposal — l1d-322-chat-evidencia-seguimiento

## Trazabilidad

L1D-322 · US-265 · FEAT-12 (L1D-312, bloque 12-B, capacidad C) · Sprint 6 · Estimación **5** · HU-03, HU-22 · FR-09,
FR-10, FR-25 · RN-01, RN-02 (regresión), RN-04, RN-06, RN-12, RN-19, RN-23, RN-24, RN-28 · AC-04.3, AC-06.1, AC-10.1,
AC-T1.4 · US-265 AC-1…AC-7 · ADR-26, ADR-51 §5 · `[S6 resp. 6]` · Fuente: `backlog/features/FEAT-12-chatbot-mvp.md`
§US-265 (fixtures FX-12-a, FX-12-e, FX-12-f; FX-06a-a, FX-06a-b); sprint: `backlog/sprints/S6-refinamiento.md`
(`[S6 resp. 6]`, DoR ✓ 7 AC, 5 pts, clinical-platform · ai-services); decisión:
`docs/architecture/adr/ADR-51-chat-langgraph-estado-efimero.md`. Medido en US-269 (suite `evaluate` del chat).

Decisiones que se respetan (no se reabren):

- **Decidido (usuario, 2026-11-06)** `[S6 resp. 6]`: cada turno de evidencia crea su `AIAnalysisRecord`; las preguntas
  sobre ese resultado son **seguimiento** en el mismo hilo, sin análisis nuevo.
- **ADR-51 §5:** cada turno científico vuelve a recuperar y cita **solo** lo recuperado en ese turno; la conversación
  previa es memoria no citable (RN-24, RN-04).
- **D-01:** análisis de evidencia, nunca recomendación; RN-23 y RN-19 en cada turno.

## Why

Hoy el oncólogo lanza un análisis aparte en el panel y, para profundizar, usa el seguimiento de 10 preguntas (US-218),
que el chat sustituye. Con este change pregunta en la conversación «¿qué evidencia existe para este paciente?», recibe el
`EvidenceAnalysis` completo (opciones citadas, aplicabilidad criterio a criterio y orden de RN-28) registrado como
`AIAnalysisRecord`, y sigue preguntando sobre ese resultado sin crear análisis nuevos ni citar lo dicho antes.

## What Changes

- **Backend 2 (`rag-orchestrator`)**: contenido del nodo `evidencia` del grafo de `l1d-316-chat-turn-langgraph`. Reutiliza
  el caso de uso de `/rag/query` de `RAGOrchestratorService` (recuperación, *reranker*, umbral y segundo loop, generación,
  citas, NLI, aplicabilidad y orden) y devuelve `evidenceAnalysis` en la respuesta de `/chat/turn`. Subintención
  `seguimiento_evidencia` (regla determinista + clasificación) cuando la petición trae `activeAnalysisId` y la pregunta se
  refiere a ese resultado: vuelve a recuperar, responde con bloques citados solo con chunks del turno, lleva la respuesta
  anterior en el bloque de memoria no citable de `PromptBuilder.memoria()` (L1D-108) y no devuelve `evidenceAnalysis`.
  Sin chunks sobre el umbral en el seguimiento → «sin evidencia» sin invocar al LLM (RN-02). Prompt nuevo
  `chat-seguimiento-evidencia@0.1.0`, armado con `PromptBuilder`.
- **Estado estructurado**: todo turno que recupera (análisis o seguimiento) rellena
  `structuredState.ultimaEvidencia = { query, chunkIds[], topRelevanceScore | null }` (glosario §2), **sin `analysisId`**:
  Backend 2 nunca guarda ni devuelve ids de Backend 1. `activeAnalysisId` solo decide el enrutado del turno.
- **Backend 1 (`clinical-api`)**: en `POST /platform/conversations/{conversationId}/turns`, si la respuesta trae
  `evidenceAnalysis`, persiste el `AIAnalysisRecord` (mismo contenido trazable que el gateway, AC-T1.4) y el
  `conversation_turn` con su `analysis_id` **en una sola transacción** antes de responder (RN-06). Si trae
  `subintent = seguimiento_evidencia`, el turno referencia el `analysis_id` activo de la conversación y no crea registro.
  Envía `activeAnalysisId` (el `analysis_id` del último turno de evidencia) en cada llamada. Backend 1 es el único dueño
  de `analysisId` y de `activeAnalysisId`.
- **Contratos (aditivos, ADR-26)**: `rag-orchestrator` 1.12.0 → **1.13.0** (`ChatTurnRequest.activeAnalysisId?`,
  `subintent?` ya viene en la 1.12.0 de `l1d-316` como `enum [seguimiento_evidencia]` y aquí solo se consume, igual que `evidenceAnalysis?`); `clinical-api` 1.25.0 →
  **1.29.0** (`ConversationTurn.evidenceAnalysis?`). Ejemplos `contracts/examples/chat-turn-evidencia*.json` y
  `conversation-turn-evidencia*.json`; el `503` del LLM caído reutiliza `chat-turn-llm-local-no-disponible.json` de
  `l1d-316` (glosario §3).

## Capabilities

### New Capabilities

- Ninguna. Se añaden requisitos a las capacidades nuevas del sprint:
  - `patient-chat` (la crea `l1d-316-chat-turn-langgraph`): nodo `evidencia`, seguimiento con re-recuperación, memoria no
    citable en el seguimiento, «sin evidencia» y afirmación sin soporte NLI en el seguimiento, `ultimaEvidencia`,
    lenguaje no prescriptivo y descarte de opciones sin soporte en el turno.
  - `chat-conversation` (la crea `l1d-315-conversacion-paciente`): persistencia del `AIAnalysisRecord` con el turno, enlace
    del seguimiento al análisis activo y fallo del LLM sin registro.

### Modified Capabilities

- Ninguna. Se reutilizan sin cambiar: `evidence-analysis` (citas, NLI, RN-02, RN-23, hasta 3 opciones),
  `applicability` (estados y orden RN-28), `evidence-analysis-gateway` (contenido trazable del registro, tabla única de
  fallos de `rag-failure.ts`).

## Bounded contexts

- **contratos**: `apps/rag-orchestrator/openapi.yaml`, `apps/clinical-api/openapi.yaml`, `contracts/examples/`,
  `packages/api-contracts/` (generado).
- **ai-services**: nodo `evidencia` y subintención de seguimiento en `apps/rag-orchestrator/app/application/chat/`.
- **clinical-platform**: submódulo `conversation` de `evidence-analysis` en `apps/clinical-api`.
- frontend: no se toca (la presentación del análisis en el panel es de US-267).

## Dependencias

- ↪ `l1d-108-prompt-instrucciones-datos` (US-057): `PromptBuilder` y `PromptBuilder.memoria()`; los rótulos
  `INICIO_DE_LA_MEMORIA` / `FIN_DE_LA_MEMORIA` no se usan (glosario §1).
- ↪ `l1d-316-chat-turn-langgraph` (US-259): grafo, `/chat/turn` 1.12.0 (con `evidenceAnalysis?`,
  `StructuredState.ultimaEvidencia?` y el ejemplo `503` `chat-turn-llm-local-no-disponible.json`), memoria no citable y
  `omittedClaims`.
- ↪ `l1d-315-conversacion-paciente` (US-258): `conversation_turn.analysis_id`, persistencia del turno, tabla de fallos.
- ↪ `l1d-320-faltantes-tipo-vacio`: publica `clinical-api` 1.25.0; este change toma la 1.29.0.
- ↪ Lo consume `l1d-323-chat-fuentes-limitaciones` (lee `ultimaEvidencia`).
- 🔗 Consume: US-055/US-225 (pipeline), US-125/US-134 (aplicabilidad y orden), US-245 (afirmaciones atómicas).
- 🔗 Regresión [RN-15] activa desde S6 con US-148 (L1D-213): opt-out → `403` sin llamar a `/chat/turn`.
- 🔗 Regresión [RN-12] activa desde S6 con US-050 (L1D-204). 🔗 Medido en: US-269.
- Cadena de versiones (glosario §1): `rag-orchestrator` 1.13.0 y `clinical-api` 1.29.0; si una versión colisiona, se
  renumera el segundo en mergear y se regenera `packages/api-contracts`.

## Fuera de alcance

- Fuentes y limitaciones de la recuperación en el chat, y el bloque `limitacion` del turno de análisis `sin_evidencia`:
  US-266 (L1D-323). Aquí solo el «sin evidencia» del seguimiento (RN-02) y la propagación del `sin_evidencia` de
  `/rag/query` en el turno de análisis.
- Mostrar el análisis y su tabla de aplicabilidad en el panel conversacional: US-267.
- Retirar `POST /platform/evidence-analyses` o `…/follow-ups` (siguen vivos; la UI deja de usar el seguimiento en US-267).
- Agente acotado (FR-30) dentro del grafo (Post-MVP). Streaming de contenido (TBD-08).

## Impact

- `apps/rag-orchestrator/app/application/chat/nodo_evidencia.py` (nuevo), `app/domain/chat/enrutado.py` (subintención),
  `app/prompts/chat_seguimiento_evidencia.py` (nuevo, sobre `PromptBuilder`), `app/domain/chat/ultima_evidencia.py`
  (nuevo), `app/application/rag_orchestrator_service.py` (solo exponer el caso
  de uso reutilizable, sin cambio de comportamiento).
- `apps/clinical-api/src/modules/evidence-analysis/conversation/*` y `analysis-record.ts` (reutilizado).
- APIs internas y públicas: cambios aditivos (oasdiff sin incompatibles).
