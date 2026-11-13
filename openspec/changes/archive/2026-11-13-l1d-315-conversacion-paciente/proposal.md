# Proposal — l1d-315-conversacion-paciente

## Trazabilidad

L1D-315 · US-258 · FEAT-12 (L1D-312, bloque 12-A «Plataforma del chat») · Sprint 6 · Estimación **5** · FR-21, FR-10 ·
RN-06, RN-10, RN-11, RN-15 (regresión), RN-12 (regresión), RN-18, RN-19, RN-22 · ADR-26, ADR-40, ADR-51 §3–§4 · AC-T1.4 ·
US-258 AC-1…AC-8 · `[S6 resp. 5]` `[S6 resp. 6]` `[S6 resp. 9]` · Fuente: `backlog/features/FEAT-12-chatbot-mvp.md`
§US-258; sprint: `backlog/sprints/S6-refinamiento.md` §4 (DoR ✓, 8 AC, 5 pts; «el contrato de B2 se mergea primero») y §6
(campos nuevos de la variante B); decisión: `docs/architecture/adr/ADR-51-chat-langgraph-estado-efimero.md`; diseño UI de
referencia (la UI es de US-267): `docs/ux/S6/pantallas-s6.md` §5.

Decisiones que se respetan (no se reabren):

- **Decidido (usuario, 2026-11-06)** `[S6 resp. 6]`: la conversación se ancla al **paciente**; cada turno de evidencia crea
  su `AIAnalysisRecord`.
- **Decidido (usuario, 2026-11-06)** `[S6 resp. 5]`: Backend 1 guarda el registro completo (memoria a largo plazo) aunque
  **no se use ni se muestre** en el MVP; `rag-orchestrator` guarda solo estado efímero por `thread_id` aleatorio.
- **Decidido (usuario, 2026-11-06)** `[S6 resp. 9]`: ante «hilo desconocido» Backend 1 rehidrata de forma transparente,
  una sola vez.
- **ADR-51 §7:** sin `langgraph-api` ni `@assistant-ui/react-langgraph`; el navegador solo habla con `web`.
- **`[S6 resp. 8]` / DEC-22:** `POST …/turns` declara desde este change `x-genera-ia: true` y la respuesta
  `403 PermisoDenegadoOOptOut` (glosario §1); el guardia de opt-out y su test de cobertura los implementa US-148 (L1D-213).
- **Glosario canónico del chat** (`backlog/sprints/S6-glosario-chat.md`, vinculante): `ConversationTurn`,
  `ConversationDataLink`, `ChatBlock`, `ChatCitation`, `Rehydration` y la tabla de errores §4 se toman de allí.

## Why

El chat del S6 sustituye a la ficha de análisis y al seguimiento de 10 preguntas: el oncólogo conversa sobre su paciente
en un solo hilo. Sin un registro en Backend 1 no hay trazabilidad (RN-06, AC-T1.4) ni forma de rehidratar el estado
efímero de `rag-orchestrator` (ADR-51 §4), y sin enmascarar la pregunta la identidad podría llegar a la IA (RN-10, RN-11).

## What Changes

- **Contrato `clinical-api` (aditivo, ADR-26) 1.23.0 → 1.24.0** (dueño de esa versión, glosario §1):
  `POST /platform/patients/{patientId}/conversations` (`201 Conversation`, sin `threadId`),
  `POST /platform/conversations/{conversationId}/turns` (`201 ConversationTurn`, `x-genera-ia: true`) y
  `GET /platform/conversations/{conversationId}` (`200 Conversation` con `turns[]`); schemas `Conversation`,
  `ConversationCreate`, `ConversationTurnCreate`, `ConversationTurn`, `ChatBlock`, `ChatCitation` y `ConversationDataLink`
  según el glosario §2 (sin `citationIds` ni `memoryUsed`; sin `historyPath`); errores del turno según el glosario §4:
  `403 PermisoDenegadoOOptOut`, `404`, `409 ErrorCatalogVersionMismatch` (no se guarda el turno), `422 ErrorCuerpoInvalido`,
  `500`, `502 ErrorServicioIa` (fallo de red con `rag-orchestrator`), `503 GeneracionNoDisponible` (`oneOf` del LLM local caído,
  la desidentificación no disponible y la salida inválida; sin persistir) y `504 DeadlineVencido`; ejemplos `conversation-*.json` en `contracts/examples/`. No hay endpoint que
  liste conversaciones de un paciente.
- **Modelo de datos:** `clinical.conversation` y `clinical.conversation_turn` en `docs/architecture/data-model.md` (fuente
  única) y migración Prisma; pregunta enmascarada, sin `pseudo_patient_id` ni identidad; `analysis_id` opcional a
  `ai_analysis_record`; retención como el registro del análisis (RN-18).
- **`clinical-api`, módulo `evidence-analysis`, submódulo `conversation`** (controller → service → repository): crea la
  conversación con `thread_id` UUID v4 aleatorio; en cada turno enmascara la pregunta (detector de ADR-40), desidentifica el
  contexto (`context-deidentifier.ts`) con `pseudoPatientId` y `traceId` nuevos, envía `dataClassification` (origen único
  `clasificacionDelPaciente()`), `catalogVersion` y, si hay un análisis activo, `activeAnalysisId`; llama a `/chat/turn`
  con el cliente generado; ante `404 ErrorHiloDesconocido` rehidrata una vez con `construirRehidratacion()`
  (`CHAT_REHYDRATE_TURNS`), que emite solo `{question, intent, blocksText, factRefs}` por turno y el `structuredState`;
  **persiste el turno antes de responder**, deriva `status`, `topRelevanceScore`, `dataUsed` y `dataMissing`, y mapea los
  fallos con la tabla única de `rag-failure.ts`. Solo el rol `doctor`; la ruta de turnos se declara `x-genera-ia: true` (el registro en código de la marca `generaIA` y el guardia son de L1D-213).
- **Seed `P-CHAT` (FX-12-b):** lo crea este change (`prisma/seed/pacientes/chat.ts`, solo sintético, con su entrada en
  `config/pii-allowlist.json`); lo consumen L1D-317, L1D-320 y L1D-326 (glosario §3).
- **BFF `web`:** Route Handlers `app/api/patients/[patientId]/conversations`, `app/api/conversations/[conversationId]` y
  `…/turns` que reenvían solo la cookie de sesión (los consume US-267).
- **Configuración (RN-22):** `CHAT_REHYDRATE_TURNS` (inicial 6) en `Settings` y en `.env.example` (tarea humana H-1).

## Capabilities

### New Capabilities
- `chat-conversation`: conversación del oncólogo sobre un paciente en `clinical-api` — apertura, turnos persistidos antes de
  responder, enmascarado de la pregunta, seudónimo por turno, rehidratación del hilo efímero y fallos de Backend 2. Se
  justifica como capacidad nueva porque no cuelga de un análisis (a diferencia del seguimiento de `evidence-analysis`) y
  la extenderán US-260…US-266.

### Modified Capabilities
- `data-model`: requisito nuevo de persistencia de `conversation` y `conversation_turn` sin seudónimo ni identidad.
- `api-contracts`: requisito nuevo de las operaciones de conversación en el spec de `clinical-api` 1.24.0.
- `web-bff`: requisito nuevo de los Route Handlers de conversación.

## Dependencias

- ↪ US-256 (L1D-313, ADR-51): registro de la decisión; ya escrito, sin change de código.
- ⛔ `l1d-316-chat-turn-langgraph` (US-259 AC-1): contrato `POST /chat/turn` de `rag-orchestrator` 1.12.0 y sus ejemplos
  `contracts/examples/chat-turn-*.json`; su commit de contrato se mergea primero (primera oleada). El cliente TS generado de
  `packages/api-contracts/` es la única vía de llamada.
- 🔗 Lo consumen: `l1d-317-chat-caso-situacion`, `l1d-318-chat-examen-tratamiento-periodo` y los demás de US-260…US-268.
- 🔗 Regresión [RN-15] activa desde S6 con el change de L1D-213 (US-148): `403 OPT_OUT_ANALISIS_IA` y cero llamadas a
  `/chat/turn` en `POST …/turns`. Regresión [RN-12] activa desde S6 con US-050 (L1D-204).
- Cadena de versiones (glosario §1): este change es dueño de `clinical-api` 1.24.0; L1D-320 toma 1.25.0, L1D-322 1.26.0 y
  L1D-213 1.27.0. Si una versión colisiona, renumera el segundo en mergear.
- `activeAnalysisId` existe en `ChatTurnRequest` desde `rag-orchestrator` 1.13.0 (`l1d-322`); si este change entra antes,
  la regla `analisisActivo()` se implementa aquí y el campo se envía al regenerar el cliente con 1.13.0.

## Fuera de alcance

- Listar, mostrar o reutilizar conversaciones anteriores (Post-MVP, L1D-311); cerrar o borrar conversaciones.
- Retirar los endpoints `…/follow-ups` (deuda aparte; la UI deja de usarlos en US-267).
- El grafo, el enrutado y la validación del turno (US-259 y US-260…US-266); las historias de cada capacidad
  rellenan campos ya definidos en el glosario (L1D-317, 318, 319, 321 y 323 no suben versión); `evidenceAnalysis?` lo
  añade L1D-322 (1.26.0) y `gapType` en `/completeness` L1D-320 (1.25.0).
- La UI del panel conversacional (US-267) y la guardia de opt-out con su test de cobertura (US-148); aquí solo se
  declaran `x-genera-ia` y el `403 PermisoDenegadoOOptOut` del turno.

## Impact

- `apps/clinical-api/openapi.yaml`, `contracts/examples/`, `packages/api-contracts/` (generado), `apps/clinical-api/src/zod/`
  (generado).
- `docs/architecture/data-model.md`, `apps/clinical-api/prisma/schema.prisma` y una migración nueva.
- `apps/clinical-api/src/modules/evidence-analysis/conversation/*`, `rag-failure.ts` (reutilizado), configuración,
  `apps/clinical-api/prisma/seed/pacientes/chat.ts` (`P-CHAT`) y `config/pii-allowlist.json`.
- `apps/web/app/api/patients/[patientId]/conversations/`, `apps/web/app/api/conversations/`.
- Bounded contexts: **contratos**, **clinical-platform**. Sin cambios en `rag-orchestrator` ni en la UI.
