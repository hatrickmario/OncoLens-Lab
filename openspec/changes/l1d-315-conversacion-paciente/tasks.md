# Tasks — l1d-315-conversacion-paciente

> Vocabulario vinculante: `backlog/sprints/S6-glosario-chat.md`.
> Empieza cuando el commit `contract(L1D-316)` de `l1d-316-chat-turn-langgraph` (`rag-orchestrator` 1.12.0, `/chat/turn`
> y `contracts/examples/chat-turn-*.json`) está en `main`.

## 1. contratos

- [ ] 1.1 Editar `apps/clinical-api/openapi.yaml` 1.23.0 → 1.24.0 (dueño, glosario §1) con `createConversation`, `getConversation`, `createConversationTurn` (`x-genera-ia: true`, `403 PermisoDenegadoOOptOut`, `409 ErrorCatalogVersionMismatch`, `422 ErrorValidacion`, `500`, `502 ErrorServicioIa`, `503 oneOf [ErrorLlmLocalNoDisponible, ErrorSalidaLlmInvalida]`) y los schemas `ConversationTurn`, `ChatBlock`, `ChatCitation` y `ConversationDataLink` de design.md §Contratos (sin `citationIds`, `memoryUsed` ni `historyPath`); ejemplos `conversation-*.json`, `error-hilo-desconocido-502.json`, `error-conversation-turn-409.json` y `error-conversation-turn-503.json` en `contracts/examples/`; `contracts:check` y `contracts:breaking` (0 incompatibles) en verde; `contracts:generate` regenera `packages/api-contracts/` y `src/zod/`; commit `contract(L1D-315)` · test después

## 2. clinical-platform — modelo de datos

- [ ] 2.1 Añadir `conversation` y `conversation_turn` a `docs/architecture/data-model.md` con la frase "sin pseudoPatientId ni identidad"; ampliar `assertDataModelDocument()` y su fixture de PR (columna `pseudo_patient_id` → falla) · test después
- [ ] 2.2 Modelos Prisma `Conversation` y `ConversationTurn` (`@@unique([conversationId, turnNumber])`, `threadId @unique`, FK opcional a `AiAnalysisRecord`) y migración; `prisma migrate dev` en la BD de test aplica sin errores · test después

- [ ] 2.3 Seed `P-CHAT` (FX-12-b) en `apps/clinical-api/prisma/seed/pacientes/chat.ts` (`data_origin = sintetico`, identidad sintética, mama), con su entrada en `config/pii-allowlist.json`; lo consumen L1D-317, L1D-320 y L1D-326; `npx prisma db seed` en la BD de test lo crea y el escaneo de PII pasa · test después

## 3. clinical-platform — endpoints (TDD estricto, doble bucle)

- [ ] 3.1 Test de aceptación en rojo: «responde 201 sin threadId y guarda un thread_id UUID v4 distinto cuando el doctor abre una conversación, el GET devuelve turns vacío, y dos conversaciones del mismo paciente tienen thread_id distintos (randomUUID, nunca derivado de patientId) [US-258 AC-1]» · integración (Supertest + PostgreSQL real + verificación del proveedor) · commit `test(L1D-315)`
- [ ] 3.2 Tests de aceptación en rojo de AC-2 (turno persistido con sus columnas), AC-3 (trigger que falla el INSERT → 500 sin respuesta), AC-4 (FX-12-d: sin PII en MSW, fila, respuesta y logs), AC-5 (mismo threadId, pseudónimo y traceId distintos, pseudónimo no persistido), AC-6 (rehidratación única con solo `{question, intent, blocksText, factRefs}` + `structuredState`, escenario que siembra UUID y fechas absolutas en un turno persistido y comprueba que no viajan, y 502 `ErrorServicioIa` al segundo `HILO_DESCONOCIDO`), AC-7 (red caída → 502 `ErrorServicioIa`; 503 `LOCAL_LLM_UNAVAILABLE`/`LLM_OUTPUT_INVALID` → 503 con el mismo error; 409 de catálogo; sin filas en ninguno), AC-2 ampliado (`dataClassification`, `catalogVersion`, campos derivados `status`/`topRelevanceScore`/`dataUsed`/`dataMissing`, citas por bloque) y AC-8 (admin 403 `PERMISO_DENEGADO` con cero llamadas; 404 inexistente) · integración con MSW desde `contracts/examples/chat-turn-*.json`, reloj e IDs congelados (FX-12-f) · commit `test(L1D-315)`
- [ ] 3.3 Implementar el submódulo `evidence-analysis/conversation` (controller → service → repository, puerto `ChatTurnPort` y su adapter sobre el cliente generado), `requireRole('doctor')`, marca `generaIA` en `POST …/turns`, `dataClassification` desde `clasificacionDelPaciente()` (origen único; extraer si está inline), `catalogVersion`, `analisisActivo()` → `activeAnalysisId` (cuando el cliente de `rag-orchestrator` 1.13.0 lo incluya), `derivarEstadoDelTurno()`, `dataUsed`/`dataMissing`/`dataLinks` derivados, mapeo de 409/502/503 con `rag-failure.ts` sin persistir, persistencia transaccional antes de responder; unitarios uno a uno de las reglas puras; AC-1, AC-2, AC-3, AC-5, AC-7 y AC-8 en verde · commit `feat(L1D-315)`
- [ ] 3.4 Reutilizar o extraer `enmascararPregunta()` (RN-11) para el turno y el seguimiento; AC-4 en verde · commit `feat(L1D-315)`
- [ ] 3.5 Extraer `construirRehidratacion()` (ADR-51 §4; lista blanca `{question, intent, blocksText, factRefs}` + `structuredState`) con `CHAT_REHYDRATE_TURNS` en `Settings` (`src/config/secciones.ts`, inicial 6), captura de `404 ErrorHiloDesconocido` en el adapter y la entrada `hilo_desconocido` en `rag-failure.ts`; AC-6 en verde · commit `feat(L1D-315)`
- [ ] 3.6 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-315)`

## 4. clinical-platform — BFF de web (test del AC primero)

- [ ] 4.1 Tests en rojo de los Route Handlers `app/api/patients/[patientId]/conversations/route.ts`, `app/api/conversations/[conversationId]/route.ts` y `…/turns/route.ts` (reenvío idéntico con solo `oncolens_session`, Origin ajeno → 403, id no UUID → 404, 502 y 503 retransmitidos) · Vitest + MSW · commit `test(L1D-315)`
- [ ] 4.2 Implementar los Route Handlers con `verificarOrigen()`, tope del cuerpo y SDK generado; tests de 4.1 en verde · commit `feat(L1D-315)`
- [ ] 4.3 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-315)`

## humano

- [ ] H-1 Añadir a `apps/clinical-api/.env.example` el bloque literal siguiente (RN-22) DIFERIDA -> H-1

```
# Turnos previos enmascarados que se reenvían a rag-orchestrator al rehidratar un hilo desconocido (ADR-51 §4, RN-22)
CHAT_REHYDRATE_TURNS=6
```

## 5. Verificación

- [ ] 5.1 `openspec validate l1d-315-conversacion-paciente --strict` en verde
- [ ] 5.2 Suite de `clinical-api` y de `web` en verde; `contracts:verify-provider` en verde para las tres operaciones (incluidos 403, 404, 409, 500, 502 y 503)
- [ ] 5.3 Sin `run-ai-eval`: el change no toca modelo, prompt, umbral, catálogo ni corpus (los prompts del chat son de `l1d-316`)
