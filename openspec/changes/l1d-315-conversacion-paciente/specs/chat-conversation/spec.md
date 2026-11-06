## Purpose

Conversación del oncólogo sobre un paciente en `clinical-api`: apertura anclada al paciente, turnos enmascarados y
persistidos antes de responder, seudónimo por turno, rehidratación del hilo efímero de `rag-orchestrator` y fallos de
Backend 2, sin que la identidad salga de `clinical-api`.

## ADDED Requirements

### Requirement: Conversación anclada al paciente con un thread_id aleatorio que no sale al navegador
`clinical-api` MUST abrir una conversación con `POST /platform/patients/{patientId}/conversations` y responder `201
Conversation` sin `threadId`. La fila `clinical.conversation` SHALL tener un `thread_id` UUID v4 aleatorio (generador
inyectado), distinto de `patient_id` y de `id`. `GET /platform/conversations/{conversationId}` MUST responder `200` con
los turnos en orden de `turnNumber`.

#### Scenario: Crear y leer una conversación vacía [US-258 AC-1] [ADR-51] [S6 resp. 5]
- **GIVEN** el paciente semilla (a) y `doc1@test.local` con rol `doctor`
- **WHEN** envía `POST /platform/patients/{patientId}/conversations` y luego `GET /platform/conversations/{conversationId}`
- **THEN** el primero responde `201` con `conversationId` y sin `threadId`
- **AND** la fila `clinical.conversation` tiene un `thread_id` UUID v4 distinto de `patient_id` y de `id`
- **AND** el `GET` responde `200` con `turns = []`, y ambas respuestas validan contra el spec de `clinical-api`

### Requirement: Cada turno se persiste antes de responder
`POST …/turns` MUST llamar a `/chat/turn` con el cliente generado, persistir en `clinical.conversation_turn` la pregunta
enmascarada, la intención, los bloques, los enlaces a datos, modelos y `traceId`, y solo después responder `201 ConversationTurn` (RN-06,
AC-T1.4). Si el `INSERT` falla, MUST responder `500` sin la respuesta generada. `status`, `topRelevanceScore`,
`dataUsed[]` y `dataMissing[]` SHALL derivarse en Backend 1.

#### Scenario: El turno se persiste y se responde [US-258 AC-2] [RN-06] [AC-T1.4]
- **GIVEN** una conversación abierta y el cliente de `rag-orchestrator` simulado con MSW desde `contracts/examples/chat-turn-caso-ok.json`
- **WHEN** el doctor envía `POST /platform/conversations/{conversationId}/turns` con una pregunta
- **THEN** responde `201 ConversationTurn` con `turnNumber = 1`, `intent`, `blocks[]` y los avisos de RN-19 en `notices[]` tal como los devolvió Backend 2
- **AND** cada cita va dentro de su bloque (`blocks[].citations[]`) y la respuesta no contiene `citationIds` ni `memoryUsed`
- **AND** `topRelevanceScore` es `null` y `status = "respondido"` porque el turno no trae `evidenceAnalysis`
- **AND** `dataUsed[]` contiene las etiquetas de los `caseFacts` enviados y `dataMissing[]` las de los ítems de `completeness[]` enviados con `gapType` no nulo
- **AND** `clinical.conversation_turn` tiene la fila con la pregunta enmascarada, la intención, los bloques validados, los enlaces a datos, `omittedClaims`, modelos y versión del prompt

#### Scenario: Un fallo al persistir nunca muestra la respuesta [US-258 AC-3] [RN-06]
- **GIVEN** un trigger de test que hace fallar el `INSERT` en `clinical.conversation_turn`
- **WHEN** se envía un turno
- **THEN** responde `500` con el schema de error del spec y el cuerpo no contiene la respuesta generada

### Requirement: La pregunta se enmascara antes de enviarse y de persistirse
`clinical-api` MUST enmascarar la pregunta con el detector de PII de ADR-40 y la identidad exacta del paciente antes de
enviarla a `/chat/turn`, persistirla o responderla, y los logs MUST NOT contener la pregunta original ni la identidad
(RN-10, RN-11).

#### Scenario: La PII de la pregunta no llega a la IA, al registro, a la respuesta ni a los logs [US-258 AC-4] [RN-10] [RN-11] [ADR-40]
- **GIVEN** la pregunta FX-12-d sobre `P-CHAT`
- **WHEN** se envía el turno
- **THEN** el cuerpo enviado a `/chat/turn` (capturado por MSW), la fila persistida y la respuesta contienen la pregunta enmascarada, sin «Lucía Prueba Chat», el documento sintético de `P-CHAT` ni «1970-03-02»
- **AND** los logs del test no contienen ninguno de esos tres textos

### Requirement: El turno envía la clasificación del paciente y la versión del catálogo
Cada `ChatTurnRequest` MUST llevar `dataClassification`, calculada por una única función (`clasificacionDelPaciente()`),
y `catalogVersion` del catálogo montado; si la conversación tiene un análisis activo (el `analysisId` del turno más
reciente que lo tenga), SHALL llevar también `activeAnalysisId` (campo de `rag-orchestrator` 1.13.0, l1d-322). Si
`/chat/turn` responde `409 CATALOG_VERSION_MISMATCH`, `clinical-api` MUST responder `409 ErrorCatalogVersionMismatch` y
MUST NOT guardar el turno.

#### Scenario: El cuerpo hacia /chat/turn lleva la clasificación y la versión del catálogo [US-258 AC-2] [RN-12] [RN-29]
- **GIVEN** una conversación abierta sobre `P-CHAT` (`data_origin = sintetico`) y MSW que captura el cuerpo hacia `/chat/turn`
- **WHEN** el doctor envía un turno
- **THEN** el cuerpo lleva `dataClassification` igual a la que devuelve `clasificacionDelPaciente()` para `P-CHAT` y `catalogVersion` igual a la versión del catálogo montado
- **AND** no lleva `activeAnalysisId` porque ningún turno previo tiene `analysisId`

#### Scenario: Una versión de catálogo distinta no guarda el turno [US-258 AC-7] [RN-29]
- **GIVEN** MSW que responde `409` en `/chat/turn` desde `contracts/examples/rag-catalog-version-mismatch.json` (`error = "CATALOG_VERSION_MISMATCH"`)
- **WHEN** se envía un turno
- **THEN** responde `409` validado contra `ErrorCatalogVersionMismatch`
- **AND** `clinical.conversation_turn` no tiene filas nuevas

### Requirement: Seudónimo y traceId nuevos en cada turno y nunca persistidos
Cada llamada a `/chat/turn` MUST llevar el `threadId` de la conversación y un `pseudoPatientId` y un `traceId` nuevos
(generadores inyectados). El `pseudoPatientId` MUST NOT persistirse; el `traceId` SHALL guardarse en el turno (RN-11).

#### Scenario: Dos turnos comparten hilo y no seudónimo [US-258 AC-5] [RN-11]
- **GIVEN** una conversación y los generadores congelados de FX-12-f
- **WHEN** se envían dos turnos
- **THEN** los dos cuerpos hacia `/chat/turn` llevan el mismo `threadId` y `pseudoPatientId` y `traceId` distintos
- **AND** ninguna columna de `clinical.conversation` ni de `clinical.conversation_turn` contiene alguno de los dos `pseudoPatientId`

### Requirement: Rehidratación única ante un hilo desconocido
Ante `404 ErrorHiloDesconocido`, `clinical-api` MUST reenviar el turno una sola vez con `rehydration` de
`construirRehidratacion()`: los últimos `CHAT_REHYDRATE_TURNS` turnos (RN-22), cada uno solo con `question`
enmascarada, `intent`, `blocksText[]` y `factRefs[]`, más el `structuredState`, sin UUID ni fechas absolutas (RN-11).
Un segundo `HILO_DESCONOCIDO` MUST responder `502 ErrorServicioIa` sin reintentar ni persistir.

#### Scenario: La rehidratación es transparente para el oncólogo [US-258 AC-6] [S6 resp. 9] [RN-22]
- **GIVEN** una conversación con 3 turnos persistidos y MSW que responde la primera vez `404` con `error = "HILO_DESCONOCIDO"` y después el ejemplo de turno
- **WHEN** se envía el 4.º turno
- **THEN** MSW registra exactamente dos llamadas a `/chat/turn`, la segunda con `rehydration` que contiene como máximo `CHAT_REHYDRATE_TURNS` turnos enmascarados y el estado estructurado del registro
- **AND** cada turno de `rehydration.turns[]` tiene exactamente las claves `question`, `intent`, `blocksText` y `factRefs`
- **AND** responde `201` con `turnNumber = 4`

#### Scenario: Los UUID y las fechas absolutas del turno persistido no viajan en la rehidratación [US-258 AC-6] [RN-11] [ADR-51]
- **GIVEN** un turno persistido sembrado con `analysisId`, `dataLinks[]` con `resourceId` UUID y `recordedDate = "2025-01-15"`, y `createdAt` absoluto, y MSW que responde la primera vez `404 HILO_DESCONOCIDO` y después el ejemplo de turno
- **WHEN** se envía el turno siguiente
- **THEN** el cuerpo de la segunda llamada a `/chat/turn` no contiene ninguna cadena con forma de UUID salvo `threadId`, `pseudoPatientId` y `traceId`, ni ninguna fecha con formato `AAAA-MM-DD`
- **AND** no contiene `analysisId`, `dataLinks`, `resourceId` ni `recordedDate`

#### Scenario: Un segundo hilo desconocido falla sin más reintentos [US-258 AC-6] [S6 resp. 9]
- **GIVEN** MSW que responde siempre `404 HILO_DESCONOCIDO`
- **WHEN** se envía un turno
- **THEN** responde `502` validado contra `ErrorServicioIa`, MSW registra exactamente dos llamadas y no se persiste ningún `conversation_turn`

### Requirement: Backend 2 caído no persiste ni inventa el turno
Mediante la tabla única de mapeo de fallos (`rag-failure.ts`), si `rag-orchestrator` no es alcanzable (fallo de red),
`clinical-api` MUST responder `502 ErrorServicioIa`; si `/chat/turn` responde `503` con `LOCAL_LLM_UNAVAILABLE` o
`LLM_OUTPUT_INVALID`, MUST responder `503` con `ErrorLlmLocalNoDisponible` o `ErrorSalidaLlmInvalida` respectivamente. En
ningún caso MUST persistir un `conversation_turn` ni recurrir a otro proveedor (RN-06, RN-12).

#### Scenario: rag-orchestrator inalcanzable [US-258 AC-7] [RN-06] [RN-12]
- **GIVEN** MSW que simula un error de red en `/chat/turn`
- **WHEN** se envía un turno
- **THEN** responde `502` con `error = "ERROR_SERVICIO_IA"` validado contra `ErrorServicioIa`
- **AND** `clinical.conversation_turn` no tiene filas nuevas

#### Scenario: LLM local no disponible o salida inválida [US-258 AC-7] [RN-06] [RN-12]
- **GIVEN** MSW que responde `503` en `/chat/turn` desde `contracts/examples/chat-turn-llm-local-no-disponible.json` y, en otro caso, desde `contracts/examples/rag-salida-llm-invalida.json` (`error = "LLM_OUTPUT_INVALID"`)
- **WHEN** se envía un turno
- **THEN** responde `503` con `error = "LOCAL_LLM_UNAVAILABLE"` y `error = "LLM_OUTPUT_INVALID"` respectivamente, validados contra el `oneOf [ErrorLlmLocalNoDisponible, ErrorSalidaLlmInvalida]` del spec
- **AND** `clinical.conversation_turn` no tiene filas nuevas y no se llama a ningún otro proveedor

### Requirement: Solo el rol doctor conversa y la conversación debe existir
Las tres operaciones MUST exigir sesión y el rol `doctor`; `admin` recibe `403` sin ninguna llamada a `rag-orchestrator`
(mínimo privilegio, E-04). Un `conversationId` o `patientId` inexistente MUST responder `404`. La ruta de turnos SHALL
registrarse con la marca `generaIA` y declararse en el spec con `x-genera-ia: true` y `403 PermisoDenegadoOOptOut`.

Regresión [RN-15] activa desde S6 con US-148 (L1D-213): `POST …/turns` con opt-out → `403 OPT_OUT_ANALISIS_IA` sin llamar
a `/chat/turn`.

#### Scenario: El administrador no conversa ni lee conversaciones [US-258 AC-8] [E-04]
- **GIVEN** `admin@test.local` con rol `admin` y un cliente de `rag-orchestrator` que cuenta llamadas
- **WHEN** envía `POST …/conversations`, `POST …/turns` o `GET /platform/conversations/{id}`
- **THEN** cada uno responde `403` con `error = "PERMISO_DENEGADO"` validado contra el spec (en `POST …/turns`, contra `PermisoDenegadoOOptOut`) y el cliente registra cero llamadas

#### Scenario: Una conversación inexistente responde 404 [US-258 AC-8]
- **GIVEN** `doc1@test.local` y un `conversationId` UUID que no existe
- **WHEN** envía `POST …/turns` o `GET /platform/conversations/{id}`
- **THEN** responde `404` validado contra el spec y el cliente de `rag-orchestrator` registra cero llamadas
