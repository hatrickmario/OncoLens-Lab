# Tasks — l1d-315-conversacion-paciente

> Vocabulario vinculante: `backlog/sprints/S6-glosario-chat.md`.
> Empezó con el commit `contract(L1D-316)` de `l1d-316-chat-turn-langgraph` (`rag-orchestrator` 1.12.0, `/chat/turn` y
> `contracts/examples/chat-turn-*.json`) en `main`.

## 1. contratos

- [x] 1.1 `apps/clinical-api/openapi.yaml` 1.23.0 → 1.24.0 con `createConversation`, `getConversation` y `createConversationTurn` (`x-genera-ia: true`, `403 PermisoDenegadoOOptOut`, `409 ErrorCatalogVersionMismatch`, `422 ErrorCuerpoInvalido`, `500`, `502 ErrorServicioIa`, `503 GeneracionNoDisponible`, `504 DeadlineVencido`) y los schemas `Conversation`, `ConversationTurn`, `ChatBlock`, `ChatCitation` y `ConversationDataLink` (sin `citationIds`, `memoryUsed` ni `historyPath`); ejemplos `conversation-*.json`, `error-hilo-desconocido-502.json`, `error-conversation-turn-409.json` y `error-conversation-turn-503.json`; commit `contract(L1D-315)` (006e86e2) · evidencia: `contracts:check` (33 reglas, sin hallazgos), `contracts:breaking` (0 incompatibles), `contracts:generate:check` al día · test después

## 2. clinical-platform — modelo de datos

- [x] 2.1 `conversation` y `conversation_turn` en `docs/architecture/data-model.md` (§7.1) con la frase "sin pseudoPatientId ni identidad"; `assertDataModelDocument()` ampliada (tablas, columnas, sin identidad) y fixture `ac-05-conversacion.json` (columna `pseudo_patient_id` y `trace_id` ausente → falla) · evidencia: `npx vitest run scripts/contracts` 464 de 464 en verde · test después
- [x] 2.2 Modelos Prisma `Conversation` y `ConversationTurn` y migración `20261106120000_conversacion_chat` (aditiva; `UNIQUE (conversation_id, turn_number)`, `thread_id` único, FK opcional a `ai_analysis_record`, trigger de inmutabilidad) · evidencia: `tests/integration/schema` 118 de 118 (incluye `migrate diff` sin diferencias y las 31 tablas) · test después
- [x] 2.3 Seed `P-CHAT` (FX-12-b) en `apps/clinical-api/prisma/seed/pacientes/chat.ts` y `sembrar-chat.ts` (sintético; conflicto de estadio IIA/IIB, HER2 2+ corregido a 3+ con `supersedes_id`, RE sin revisar, documentos `D-HC-1`/`D-EX-1`, línea 1, cirugía y nota con PII sintética); aparte de `PACIENTES_SEMILLA` (suma `PACIENTES_ADICIONALES_DEL_SEED` en los tests que cuentan pacientes) · evidencia: `tests/integration/seed/paciente-chat.test.ts` y el seed completo en verde; `pii-scan` sin PII (el literal `SINT-CHAT-0001` no tiene forma de documento: sin entrada en `config/pii-allowlist.json`) · test después

## 3. clinical-platform — endpoints (TDD estricto, doble bucle)

- [x] 3.1 Test de aceptación AC-1 en rojo (`conversacion-apertura.test.ts`: 201 sin threadId, `thread_id` UUID v4 distinto de `patient_id` y de `id`, GET con `turns` vacío, dos conversaciones con `thread_id` distintos) · commit `test(L1D-315)` 73cf6b6d · rojo: `AssertionError: expected 500 to be 201`
- [x] 3.2 Tests de aceptación AC-2…AC-8 en rojo (`conversacion*.test.ts`: turno persistido con columnas derivadas, primer turno con rehidratación vacía y sin 404, AC-3 trigger, AC-4 FX-12-d, AC-5 seudónimo/traceId, AC-6 rehidratación con UUID y fechas sembrados y 502 al segundo `HILO_DESCONOCIDO`, AC-7 red/503/409/contrato inválido, AC-8 admin 403 y 404) · commit `test(L1D-315)` d5dbcf1b · rojo: 16 fallos por aserción (`expected 500 to be 201/502/503/409/404`)
- [x] 3.3 Submódulo `evidence-analysis/conversation` (controller → service → repository, puerto `ChatTurnPort` con `crearRagChatClient`), `authorize('clinical:read')`, `clasificacionDelPaciente()` como origen único, `catalogVersion`, `derivarEstadoDelTurno()`, `dataUsed`/`dataMissing`/`dataLinks` derivados, mapeo con `mapearFalloRagDeChat` sin persistir y persistencia antes de responder · commits `feat(L1D-315)` deb67cbc y 190182da · verde: 7 archivos y 24 tests de `conversacion*` (21 al cerrar AC-8, +3 de RN-12/aboutTurnId); unitarios de reglas, hechos y rag-failure en verde
- [x] 3.4 Pregunta enmascarada una sola vez en `desidentificarContexto()` (detector de ADR-40 e identidad exacta; la misma cadena viaja, se persiste y se devuelve); AC-4 en verde · commit `feat(L1D-315)` 190182da
- [x] 3.5 `construirRehidratacion()` (lista blanca `{question, intent, blocksText, factRefs}` + `structuredState`), `rehidratacionVacia()` en el primer turno, `CHAT_REHYDRATE_TURNS` en `Settings` (6 por defecto, máximo 50), `404 HILO_DESCONOCIDO` → un único reenvío y `hilo_desconocido` en `rag-failure.ts`; AC-6 en verde · commit `feat(L1D-315)` 190182da
- [x] 3.6 Refactor Extract Method en los archivos del change, tests en verde antes y después · commit `refactor(L1D-315)` (seed, config, controller, hechos-del-caso, módulo y rag-failure); `npm run lint` y `npm run quality` en 0 errores
- [x] 3.7 (traslado de L1D-204, tareas 3.5/3.6, RN-12) La clasificación del turno la decide Backend 1 desde `Patient.data_origin` (`clasificacionDelPaciente()` de `regla-proveedor.ts`, mismo contenido que en L1D-204) y el cuerpo público no admite clasificación (`422`); un paciente real no sale hacia Backend 2 (`502`, cero llamadas, ningún turno) y el `503` del LLM local caído no persiste (AC-7) · evidencia: `conversacion-fallos.test.ts` (RN-12 y RN-13)

Nota (sin checkbox): la comprobación `proveedorPermitido()` de `regla-proveedor.ts` sobre `llmProvider` de la respuesta no se aplica en este change porque, hasta el gate G-piloto (US-143), `exigirEntornoSintetico()` impide que un paciente real llegue a `/chat/turn` y el único caso alcanzable es sintético, para el que la nube está permitida; el cableado de la regla cuando se levante ese bloqueo es de US-143.

Nota (sin checkbox): `activeAnalysisId` no se envía todavía porque el cliente de `rag-orchestrator` 1.12.0 no lo declara (su esquema cerrado lo rechazaría); `analisisActivo()` queda implementada y probada, y la envía `l1d-322` al regenerar el cliente con 1.13.0.

- [x] 3.8 Gate 2 vuelta 1: `esHiloDesconocido()` único en `rag-failure.ts` (reenvío y mapeo); `hechos-del-caso.ts` reutiliza `estaAusente`/`unirLoPresente` y lee la fecha confiable de `dataRefs` (`EnlaceDeDato.fecha`, registrada por el builder); `ClaseDeHecho` tipada; `construirRehidratacion` con límite ≤ 0; reintento condicionado por «había turnos previos»; clasificación calculada una vez; `no-store` también en la apertura; el GET pasa el estado explícito (test que fija el contrato) · evidencia: unitarios 1296+, integración 822 de 822 (504, 401 en las tres operaciones, GET con estado)
- [x] 3.9 E2E del listado: `TOTAL_PACIENTES_DEL_LISTADO` (= semilla + `P-CHAT`) en `apps/web/e2e/soporte.ts` y `pacientes-listado.spec.ts`; ningún otro e2e cuenta pacientes

Nota (sin checkbox): el job de retención (RN-18, post-MVP, L1D-311) debe incluir `conversation` y `conversation_turn`.

## 4. clinical-platform — BFF de web (test del AC primero)

- [x] 4.1 Tests en rojo de los Route Handlers (`apps/web/tests/api/conversaciones.test.ts`: reenvío idéntico con solo `oncolens_session`, Origin ajeno → 403, id no UUID → 404, 502/503/409 retransmitidos, GET con `no-store`) · commit `test(L1D-315)` · rojo: `Error: no implementado`
- [x] 4.2 Route Handlers `app/api/patients/[id]/conversations`, `app/api/conversations/[conversationId]` y `…/turns` con `verificarOrigen()`, tope del cuerpo y SDK generado; `lib/server/conversaciones.ts` · commit `feat(L1D-315)` · verde: `apps/web` 925 de 925
- [x] 4.3 Refactor: sin cambios en el BFF (cada manejador ya es una sola función corta; `crearProxyDeLectura` se reutiliza con `mensajeNoEncontrado`)

## humano

- [ ] H-1 Añadir a `apps/clinical-api/.env.example` el bloque literal siguiente (RN-22) DIFERIDA -> H-1

```
# Turnos previos enmascarados que se reenvían a rag-orchestrator al rehidratar un hilo desconocido (ADR-51 §4, RN-22)
CHAT_REHYDRATE_TURNS=6
```

## 5. Verificación

- [x] 5.1 `openspec validate l1d-315-conversacion-paciente --strict` en verde
- [x] 5.2 Suites en verde: `clinical-api` unitaria 1286 de 1286, integración con PostgreSQL de test 819 de 819, `web` 925 de 925; `contracts:verify-provider` 953 respuestas verificadas contra el spec (incluidos 403, 404, 409, 500, 502 y 503); `tsc --noEmit`, `lint`, `quality` y `pii-scan` sin errores
- [x] 5.3 Sin `run-ai-eval`: el change no toca modelo, prompt, umbral, catálogo ni corpus (los prompts del chat son de `l1d-316`)
