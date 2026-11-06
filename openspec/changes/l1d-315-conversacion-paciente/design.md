# Design — l1d-315-conversacion-paciente

## Context

Ver proposal.md (Why). Estado en `main` (40e669a4):

- `clinical-api` ya tiene el seguimiento (`follow-up.{controller,service,repository,request,schema}.ts`) colgado de un
  análisis, con `clinical.analysis_follow_up`, el detector de PII de ADR-40 (`deidentification/pii-detector.opcion-a.ts`),
  `context-deidentifier.ts`, `clinical-context.builder.ts` y la tabla única de fallos de Backend 2 (`rag-failure.ts`, con
  `mapearFalloRag` y `mapearFalloRagDeSeguimiento`). La configuración vive en `src/config/secciones.ts` (`Settings`).
- `rag-orchestrator` 1.11.0 no tiene `/chat/turn`; lo publica `l1d-316-chat-turn-langgraph` (1.12.0) con
  `contracts/examples/chat-turn-*.json` y el `404 ErrorHiloDesconocido`. Este change depende de ese contrato y nunca lo
  edita.
- Vocabulario vinculante: `backlog/sprints/S6-glosario-chat.md` (§1 versiones, §2 esquemas, §3 reglas, §4 errores).
- No hay conversaciones en el modelo.

## Goals / Non-Goals

**Goals:** registro durable de cada turno antes de responder; identidad confinada a `clinical-api`; rehidratación única y
transparente; contrato aditivo que US-260…US-267 extienden sin romper.

**Non-Goals:** enrutado, nodos y validación del turno (Backend 2); historial visible; UI; guardia de opt-out (US-148).

## Decisions

### D1 · Submódulo `conversation` dentro de `evidence-analysis`
`src/modules/evidence-analysis/conversation/conversation.{controller,service,repository,schema}.ts` más
`conversation.request.ts` (arma el `ChatTurnRequest`) y `conversation.reglas.ts` (reglas puras). CLAUDE.md fija que
`evidence-analysis` es **un solo módulo**; un módulo `chat` aparte duplicaría la desidentificación y el mapeo de fallos.
Descartado: extender `AnalysisFollowUp` (ADR-51 opción 2, excluida).

### D2 · Orden del turno (RN-06)
`validar (Zod generado) → cargar conversación (404) → [guardia de opt-out, L1D-213] → enmascarar pregunta → armar
ChatTurnRequest desidentificado (pseudónimo y traceId nuevos, dataClassification, catalogVersion, activeAnalysisId?) →
/chat/turn → [404 ErrorHiloDesconocido → reenviar una vez con rehydration] → derivar status, topRelevanceScore, dataUsed,
dataMissing y dataLinks → persistir en transacción (turn_number = max+1) → responder`. Un `409`, `502` o `503` corta la
cadena antes de persistir: ningún turno se guarda. Si la transacción falla, el error se propaga como `500` y la respuesta generada se
descarta (nunca se serializa). `turn_number` se calcula dentro de la transacción con `@@unique([conversationId,
turnNumber])`; un conflicto por concurrencia se reintenta 0 veces y responde `500` (raro en el MVP de un solo doctor).

### D3 · Enmascarado único de la pregunta
Se reutiliza el detector de ADR-40 y la identidad exacta del paciente (`patient-identity.reader.ts`), igual que en el
seguimiento. La pregunta enmascarada es **la misma cadena** que viaja a `/chat/turn`, se persiste en `question_masked` y
vuelve en `ConversationTurn.question`. Se extrae `enmascararPregunta()` (RN-11) si el seguimiento aún lo tiene inline;
si ya existe con nombre, se reutiliza (una regla, un dueño).

### D4 · Rehidratación (ADR-51 §4, `[S6 resp. 9]`, glosario §2)
`construirRehidratacion(turnos, limite)` en `conversation.reglas.ts` (pura): toma los últimos `CHAT_REHYDRATE_TURNS`
turnos persistidos en orden y emite **solo** `{ turns: [{ question (enmascarada), intent, blocksText[], factRefs[] }],
structuredState }` (el `structured_state` del último turno). Es una lista blanca: nunca `resourceId`, UUID, fechas
absolutas, `analysisId`, `dataLinks`, `createdAt` ni `id` (RN-11). `blocksText` son los `text` de los bloques, que ya
llevan días relativos. **El primer turno** de la conversación (sin turnos persistidos) ya lleva `rehydration = { turns: [],
structuredState: vacío }` (`construirRehidratacion([])`): `rag-orchestrator` responde `404` a un hilo que no conoce y no distingue
uno nuevo de uno perdido. El reenvío tras `404` queda para el hilo vivo que rag perdió (reinicio, TTL o desalojo). El
`threadId` se genera con `randomUUID()` (test en L1D-315: dos conversaciones distintas tienen `threadId` distintos y con forma
UUID v4, nunca derivado de `patientId`). El `404 ErrorHiloDesconocido` (`{error: HILO_DESCONOCIDO, message, traceId}`) se atrapa en el
adapter de `ChatTurnPort` y dispara un único reenvío; el segundo `HILO_DESCONOCIDO` → `502 ErrorServicioIa`
(`servicioIa('hilo_desconocido')` añadido a la tabla de `rag-failure.ts`, sin tabla paralela). `structured_state` se
guarda tal como lo devuelve `/chat/turn` (JSON desidentificado, ver Privacidad).

### D5 · `thread_id` y generadores
`thread_id` UUID v4 del generador de IDs inyectado (FX-12-f), distinto del `id` de la conversación; nunca sale en la API
pública (solo hacia `/chat/turn`). `pseudoPatientId` y `traceId` nuevos por turno con los mismos generadores que el
gateway; el `pseudoPatientId` no se persiste.

### D6 · Autorización
`requireRole('doctor')` en las tres rutas (mínimo privilegio, E-04); la ruta de turnos se declara con la marca `generaIA`
y, en el spec, con `x-genera-ia: true` y `403 PermisoDenegadoOOptOut` desde este change (glosario §1), para que la
guardia de US-148 (L1D-213) la cubra sin tocar esta operación del contrato. El `admin` no lee conversaciones porque contienen respuestas clínicas.

### D7 · Persistencia del turno de evidencia y campos derivados
Si `/chat/turn` devuelve `evidenceAnalysis`, el turno guarda su `analysis_id` opcional. La creación del
`AIAnalysisRecord` del turno de evidencia (`[S6 resp. 6]`) la implementa US-265; aquí solo existe la FK opcional y el
campo `analysisId?` del contrato.

Backend 1 deriva con reglas puras (glosario §2), nunca los recibe de Backend 2:
- `derivarEstadoDelTurno(intent, evidenceAnalysis?)` → `status` y `topRelevanceScore`: con `evidenceAnalysis`, los suyos
  (`null` ≠ `0.0`, RN-02); sin él, `no_clasificada` si `intent = no_clasificada` y `respondido` en otro caso, con
  `topRelevanceScore = null`.
- `dataUsed[]` = etiquetas de los `caseFacts` enviados; `dataMissing[]` = etiquetas de los ítems de `completeness[]`
  enviados con `gapType` no nulo.
- `dataLinks[]` (`ConversationDataLink`) = un enlace por `factRef` de los bloques, resuelto con el mapa `factRef →
  recurso` que solo vive en Backend 1 durante el turno (`resourceType`, `resourceId`, `origin`, `relativeDay`,
  `recordedDate`). Sin `historyPath`: la ruta la deriva L1D-325 con `rutaDeHistorico()`.
- `analisisActivo(turnos)` → `activeAnalysisId` = `analysisId` del turno más reciente que lo tenga (campo de
  `rag-orchestrator` 1.13.0, l1d-322).

### D8 · Clasificación y versión del catálogo
`dataClassification` sale de una única función, `clasificacionDelPaciente(paciente)` (la misma del gateway; si está
inline, se extrae), y `catalogVersion` de la versión del catálogo montado. Un `409 ErrorCatalogVersionMismatch` de
Backend 2 se traduce a `409 ErrorCatalogVersionMismatch` sin guardar el turno.

Alternativas para el esquema (caro de revertir):
1. **Tablas propias `conversation` + `conversation_turn` (elegida):** encaja con ADR-51 §3 y con el anclaje al paciente.
2. Reutilizar `analysis_follow_up` con `analysis_id` nulo: rompe su unicidad y su semántica (seguimiento de un análisis).
3. Guardar la conversación como un JSON en una sola fila: impide `turn_number` único, consultas y retención por turno.

## Contratos

Proveedor: `clinical-api` (`apps/clinical-api/openapi.yaml`, 1.23.0 → **1.24.0**, o la siguiente libre si US-263 entra
antes). Consumidores: `web` (Route Handlers, SDK generado) y, en US-267, la UI. Consumo: el cliente TS de
`rag-orchestrator` 1.12.0 generado por `l1d-316`. Aditivo (ADR-26), sin cambios incompatibles en `oasdiff`.

```yaml
paths:
  /platform/patients/{patientId}/conversations:
    post: { operationId: createConversation, x-permission: clinical:read,
            requestBody: ConversationCreate (objeto vacío, additionalProperties: false, opcional),
            responses: { 201: Conversation, 401, 403: PermisoDenegado, 404: ErrorNoEncontrado } }
  /platform/conversations/{conversationId}:
    get:  { operationId: getConversation, x-permission: clinical:read,
            responses: { 200: Conversation, 401, 403: PermisoDenegado, 404 } }
  /platform/conversations/{conversationId}/turns:
    post: { operationId: createConversationTurn, x-permission: clinical:read, x-genera-ia: true,
            requestBody: ConversationTurnCreate,
            responses: { 201: ConversationTurn, 401,
                         403: PermisoDenegadoOOptOut,                # PERMISO_DENEGADO u OPT_OUT_ANALISIS_IA
                         404: ErrorNoEncontrado,
                         409: ErrorCatalogVersionMismatch,           # no se guarda el turno
                         422: ErrorValidacion,
                         500: ErrorInterno,
                         502: ErrorServicioIa,                       # fallo de red con rag o 2.º HILO_DESCONOCIDO
                         503: oneOf [ErrorLlmLocalNoDisponible, ErrorSalidaLlmInvalida] } }   # sin persistir
components/schemas:
  Conversation: { conversationId: uuid, patientId: uuid, createdAt: date-time, turns: ConversationTurn[] }   # sin threadId
  ConversationTurnCreate: { question: string (1..QUESTION_MAX, NFC), aboutTurnId?: uuid }
  ConversationTurn:
    id: uuid
    turnNumber: integer ≥ 1
    createdAt: date-time
    question: string                     # enmascarada
    intent: enum [caso, faltantes, evidencia, fuentes_limitaciones, no_clasificada, fuera_de_alcance]
    aboutTurnId?: uuid
    status: enum [respondido, sin_evidencia, no_clasificada]   # derivado en B1 de evidenceAnalysis
    topRelevanceScore: number | null     # derivado en B1; null ≠ 0.0 (RN-02)
    blocks: ChatBlock[]                  # las citas van solo dentro de cada bloque
    dataLinks: ConversationDataLink[]
    omittedClaims: integer ≥ 0
    analysisId?: uuid
    notices: string[]                    # los rellena Backend 2 (RN-19)
    dataUsed: string[]                   # derivado en B1: etiquetas de los caseFacts enviados
    dataMissing: string[]                # derivado en B1: faltantes de completeness
  ChatBlock: { kind: enum [documentado, interpretacion, catalogo, evidencia, conflicto, faltante, limitacion, fuente],
               text: string, factRefs?: string[] (^f[0-9]+$), citations?: ChatCitation[] }
  ChatCitation: { chunkId, documentId, sourceTitle, chunkOrdinal, chunkCount, chunkTextSnapshot }
  ConversationDataLink: { factRef, resourceType, resourceId: uuid, origin, relativeDay: integer | null,
                          recordedDate: date | null }   # sin historyPath; solo hacia el navegador
```

Sin `citationIds` ni `memoryUsed` (retirado, glosario §2). `ChatBlock` y `ChatCitation` replican los de
`rag-orchestrator` 1.12.0 (mismo enum cerrado de 8 `kind`); ningún otro change redefine `kind`. El `dataRef` /
`PatientDataLink` congelado del análisis no se toca.

Ejemplos nuevos (uno por caso): `conversation-create-response.json`, `conversation-get.json`,
`conversation-turn-create.json`, `conversation-turn.json`, `error-hilo-desconocido-502.json`,
`error-conversation-turn-409.json` y `error-conversation-turn-503.json`. Los handlers MSW hacia `/chat/turn` se
construyen desde los `chat-turn-*.json` de `l1d-316` (incluidos `chat-turn-hilo-desconocido.json` y
`chat-turn-llm-local-no-disponible.json`). Zod (`src/zod/`) y `packages/api-contracts/` se **generan** del spec.

Campos de la variante B (`docs/ux/S6/pantallas-s6.md` §5) que se incluyen ya, por ser del turno: `id`, `createdAt`,
`aboutTurnId`, `status`, `topRelevanceScore`, `dataUsed`, `dataMissing`. Se usa `turnNumber` (AC-1/AC-2 de la historia)
en lugar de `index` del documento de UX. Las capacidades (US-260…US-266) rellenan bloques ya definidos; solo
`evidenceAnalysis?` (L1D-322, 1.26.0) amplía el schema.

## Privacidad y ownership

- **web → clinical-api:** cookie opaca `oncolens_session` y la pregunta en claro (puede traer PII escrita por el oncólogo).
- **clinical-api → rag-orchestrator:** JWT de servicio; `threadId` aleatorio, `pseudoPatientId` y `traceId` nuevos por
  turno, pregunta enmascarada (ADR-40 + identidad exacta), contexto desidentificado con fechas relativas y texto libre
  enmascarado (`context-deidentifier.ts`, RN-11), `dataClassification` (`clasificacionDelPaciente()`), `catalogVersion`,
  `activeAnalysisId?` y `rehydration` con la lista blanca `{question, intent, blocksText, factRefs}` + `structuredState`
  (sin UUID, `resourceId`, `analysisId`, `dataLinks` ni fechas absolutas; un escenario lo verifica). Nunca nombre,
  documento, fecha de nacimiento ni `patientId`.
- **clinical-api → web:** `dataLinks` (con `resourceId` y `recordedDate`) solo viajan al navegador; el mapa
  `factRef → recurso` nunca sale hacia Backend 2.
- **Persistencia:** solo en `clinical`; ni `pseudo_patient_id` ni identidad. Retención como `AIAnalysisRecord` (RN-18).
- **Logs:** solo `conversationId`, `turnNumber`, `traceId` y códigos; nunca la pregunta, la respuesta ni el contexto.
- **rag-orchestrator** no toca datos clínicos ni `clinical-minio`; este change no le da acceso nuevo.
- **RN-12:** sin *fallback* a otro proveedor cuando Backend 2 falla.
- **Seguridad web:** los Route Handlers validan ids con el schema Zod generado; sin variables `NEXT_PUBLIC_` nuevas;
  módulos `server-only`; no renderizan texto (la UI es de US-267); sin cambios de CSP ni cabeceras; sin dependencias nuevas.

## Dependencias y colaboradores

- `ConversationService` recibe por *factory*: `ConversationRepository`, un puerto `ChatTurnPort` (implementado por un
  adapter sobre el cliente generado de `rag-orchestrator`), el lector de identidad, el detector de PII, el constructor de
  contexto y los generadores de IDs y reloj. Nunca un cliente HTTP concreto.
- Reglas con nombre propio: `enmascararPregunta()` (RN-11, reutilizada), `construirRehidratacion()` (ADR-51 §4),
  `clasificacionDelPaciente()` (origen único), `derivarEstadoDelTurno()`, `analisisActivo()`,
  `siguienteNumeroDeTurno()`, y la entrada `hilo_desconocido` en `rag-failure.ts`.
- Fakes: solo MSW en el HTTP saliente hacia `/chat/turn`, desde `contracts/examples/chat-turn-*.json`; BD real.
- Configuración: `CHAT_REHYDRATE_TURNS` (inicial 6) en `Settings` (`src/config/secciones.ts`), leída de ahí.

## Risks / Trade-offs

- [El contrato de `/chat/turn` cambia en `l1d-316` tras empezar este change] → este change empieza después del commit
  `contract(L1D-316)` en `main`; se regenera el cliente y se ajustan los handlers MSW.
- [Choque de versión] → este change es dueño de 1.24.0 (glosario §1); si colisiona, renumera el segundo en mergear.
- [`activeAnalysisId` llega en `rag-orchestrator` 1.13.0 (l1d-322)] → `analisisActivo()` se implementa aquí; el campo se
  envía en cuanto el cliente regenerado lo incluye.
- [`structured_state` crece sin límite] → se guarda tal como llega; el tope de memoria lo aplica Backend 2
  (`CHAT_MEMORY_MAX_TOKENS`).
- [Rehidratación con turnos de memoria citables] → Backend 2 los rotula como memoria no citable (US-259 AC-7, RN-24).

## Migration Plan

Migración Prisma aditiva (dos tablas nuevas). Rollback: revertir la migración; ninguna tabla existente cambia.
