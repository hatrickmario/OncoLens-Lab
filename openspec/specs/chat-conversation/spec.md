# chat-conversation Specification

## Purpose
Conversación del oncólogo sobre un paciente en `clinical-api`: apertura anclada al paciente, turnos enmascarados y
persistidos antes de responder, seudónimo por turno, rehidratación del hilo efímero de `rag-orchestrator` y fallos de
Backend 2, sin que la identidad salga de `clinical-api`.

## Requirements

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

### Requirement: El primer turno lleva la rehidratación vacía
El primer turno de una conversación (sin turnos persistidos) MUST llevar desde el primer envío `rehydration = { turns: [], structuredState: vacío }`, porque `rag-orchestrator` responde `404` a un `threadId` que no conoce y no distingue uno nuevo de uno perdido; `construirRehidratacion([])` devuelve ese valor (glosario S6 §2).

#### Scenario: El primer turno lleva la rehidratación vacía [US-258 AC-2] [ADR-51]
- **GIVEN** una conversación recién creada, sin turnos persistidos, y MSW que registra las llamadas a `/chat/turn`
- **WHEN** se envía el primer turno
- **THEN** la primera y única llamada lleva `rehydration` con `turns = []` y el `structuredState` vacío del ejemplo `chat-turn-request.json`
- **AND** MSW no registra ningún `404` ni reenvío

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
- **THEN** responde `503` con `error = "LOCAL_LLM_UNAVAILABLE"` y `error = "LLM_OUTPUT_INVALID"` respectivamente, validados contra el `503 GeneracionNoDisponible` del spec (`oneOf` que incluye `ErrorLlmLocalNoDisponible` y `ErrorSalidaLlmInvalida`)
- **AND** `clinical.conversation_turn` no tiene filas nuevas y no se llama a ningún otro proveedor

### Requirement: Solo el rol doctor conversa y la conversación debe existir
Las tres operaciones MUST exigir sesión y el rol `doctor`; `admin` recibe `403` sin llamar a `rag-orchestrator` (E-04).
Un `conversationId` o `patientId` inexistente MUST responder `404`. La operación de turnos SHALL declararse con
`x-genera-ia: true` y `403 PermisoDenegadoOOptOut`; la marca en código y el guardia de opt-out (`403 OPT_OUT_ANALISIS_IA`
sin llamar a `/chat/turn`, RN-15) son de L1D-213.

#### Scenario: El administrador no conversa ni lee conversaciones [US-258 AC-8] [E-04]
- **GIVEN** `admin@test.local` con rol `admin` y un cliente de `rag-orchestrator` que cuenta llamadas
- **WHEN** envía `POST …/conversations`, `POST …/turns` o `GET /platform/conversations/{id}`
- **THEN** cada uno responde `403` con `error = "PERMISO_DENEGADO"` validado contra el spec (en `POST …/turns`, contra `PermisoDenegadoOOptOut`) y el cliente registra cero llamadas

#### Scenario: Una conversación inexistente responde 404 [US-258 AC-8]
- **GIVEN** `doc1@test.local` y un `conversationId` UUID que no existe
- **WHEN** envía `POST …/turns` o `GET /platform/conversations/{id}`
- **THEN** responde `404` validado contra el spec y el cliente de `rag-orchestrator` registra cero llamadas

### Requirement: El turno de la conversación toma la clasificación del paciente y verifica el proveedor
`POST /platform/conversations/{conversationId}/turns` MUST enviar a `/chat/turn` la `dataClassification` tomada de `Patient.data_origin` con la misma función que el gateway del análisis; una respuesta con `llmProvider = nube` para un paciente real MUST responder `502` sin persistir el turno, y un `503` de Backend 2 MUST responder `503` sin persistirlo ni recurrir a otro proveedor (RN-12, `[S6 resp. 8]`).

#### Scenario: El request del turno lleva la clasificación del paciente [US-050 AC-4] [RN-12] [S6 resp. 8]
- **GIVEN** una conversación de un paciente de test con `data_origin = real_identificado` y MSW que captura el cuerpo enviado a `/chat/turn`
- **WHEN** `doc1@test.local` envía un turno
- **THEN** el cuerpo capturado lleva `dataClassification = real_identificado`

#### Scenario: Backend 2 con el LLM local caído y dato real responde 503 sin turno [US-050 AC-5] [RN-06] [RN-12] [S6 resp. 8]
- **GIVEN** la misma conversación y MSW que responde en `/chat/turn` el `503` de `contracts/examples/chat-turn-llm-local-no-disponible.json` (de `l1d-316`)
- **WHEN** se envía un turno
- **THEN** la respuesta es `503` válida contra el spec de `clinical-api`, sin detalles internos de `rag-orchestrator`, MSW registra una sola llamada
- **AND** `clinical.conversation_turn` y `clinical.ai_analysis_record` no tienen filas nuevas

#### Scenario: Un turno servido por la nube para un paciente real se descarta [US-050 AC-5] [RN-12] (asumido: defensa en profundidad, igual que el gateway)
- **GIVEN** la misma conversación y MSW que responde `200` en `/chat/turn` con `llmProvider = nube`
- **WHEN** se envía un turno
- **THEN** la respuesta es `502` con el schema de error del spec y no se persiste ningún `conversation_turn`

### Requirement: Un 409 de catálogo tras el salto a 1.6.0 no persiste el turno

Con el catálogo 1.6.0, si `rag-orchestrator` responde `409 CATALOG_VERSION_MISMATCH` a un turno, `clinical-api` SHALL responder `409 ErrorCatalogVersionMismatch` (mapeo de l1d-315) y MUST NOT persistir el turno.

#### Scenario: Versiones de catálogo distintas entre backends

- **GIVEN** `clinical-api` con el catálogo `1.6.0` y `rag-orchestrator` (simulado con MSW desde `contracts/examples/rag-catalog-version-mismatch.json`) respondiendo `409`
- **WHEN** `doc1@test.local` envía un turno a una conversación abierta de `P-CHAT`
- **THEN** la respuesta es `409` con `error = CATALOG_VERSION_MISMATCH`, válida contra `apps/clinical-api/openapi.yaml`
- **AND** no existe fila nueva en `clinical.conversation_turn` [US-263 AC-7] [RN-22]

### Requirement: El turno de evidencia persiste su análisis con el turno antes de responder
Si `/chat/turn` devuelve `evidenceAnalysis`, `clinical-api` MUST persistir el `AIAnalysisRecord` con el contenido trazable
del gateway (AC-T1.4) y el `conversation_turn` con ese `analysis_id` en una sola transacción, y SHALL responder `201` con
`analysisId` y `evidenceAnalysis` construidos desde lo persistido solo tras el `COMMIT` (RN-06, `[S6 resp. 6]`).

#### Scenario: Turno de evidencia registrado como análisis [US-265 AC-1] [FR-09] [RN-06] [AC-10.1] [AC-T1.4]
- **GIVEN** `doc1@test.local`, una conversación sobre el paciente semilla (a) y MSW que responde `/chat/turn` desde `contracts/examples/chat-turn-evidencia.json`
- **WHEN** envía «¿Qué evidencia existe para pacientes con las características de este paciente?»
- **THEN** responde `201 ConversationTurn` con `intent = "evidencia"`, `analysisId` y `evidenceAnalysis` válidos contra el spec de `clinical-api`
- **AND** existe el `ai_analysis_record` de ese `analysisId` con `analysis_type = analisis_evidencia`, `trace_id` del turno, `corpus_release`, `catalog_version`, modelos, `prompt_version` y `retrieval_params`, y `evidence_options` igual a la respuesta
- **AND** el `conversation_turn` tiene `analysis_id` igual a ese `analysisId`

#### Scenario: Aplicabilidad persistida igual a la respondida [US-265 AC-2] [AC-04.3] [RN-28]
- **GIVEN** una conversación sobre el paciente semilla (e) y MSW con un `evidenceAnalysis` cuyo criterio de menopausia es «Desconocido: falta en el paciente»
- **WHEN** se envía la pregunta de evidencia
- **THEN** el cuerpo enviado a `/chat/turn` no trae estado menopáusico en `clinicalContext`
- **AND** la aplicabilidad y el orden de opciones de la respuesta son idénticos a los persistidos en el registro

#### Scenario: Un fallo al persistir el análisis no deja turno [US-265 AC-1] [RN-06]
- **GIVEN** un trigger de test que hace fallar el `INSERT` en `clinical.ai_analysis_record`
- **WHEN** se envía la pregunta de evidencia
- **THEN** responde `500` sin `evidenceAnalysis` y no hay filas nuevas en `ai_analysis_record` ni en `conversation_turn`

### Requirement: El seguimiento referencia el análisis activo sin crear otro
`clinical-api` SHALL enviar en cada turno `activeAnalysisId` (último `analysis_id` de la conversación). Si la respuesta trae
`subintent = "seguimiento_evidencia"`, el turno MUST guardar ese `analysis_id` y MUST NOT crear un `AIAnalysisRecord`; si
lo trae sin que se enviara `activeAnalysisId`, MUST tratarlo como respuesta incoherente de Backend 2 y responder `502
ErrorServicioIa` con la tabla única de fallos, sin persistir. `clinical-api` es el único dueño de `analysisId` y de
`activeAnalysisId`.

#### Scenario: Seguimiento enlazado al mismo análisis [US-265 AC-3] [S6 resp. 6]
- **GIVEN** la conversación de AC-1 con su turno de evidencia y MSW que responde desde `contracts/examples/chat-turn-seguimiento-evidencia.json`
- **WHEN** el doctor envía «¿En qué se diferencia la población del estudio de mi paciente?»
- **THEN** el cuerpo capturado hacia `/chat/turn` lleva `activeAnalysisId` igual al `analysisId` de AC-1
- **AND** responde `201` con el mismo `analysisId`, sin `evidenceAnalysis`, y el número de filas de `ai_analysis_record` no cambia

#### Scenario: Seguimiento sin análisis activo es respuesta incoherente de Backend 2 [US-265 AC-3] [RN-06]
- **GIVEN** una conversación sin turnos de evidencia y MSW que responde con `subintent = "seguimiento_evidencia"`
- **WHEN** se envía un turno
- **THEN** el cuerpo capturado hacia `/chat/turn` no lleva `activeAnalysisId`
- **AND** responde `502 ErrorServicioIa` validado contra el spec (no `422`: la petición del oncólogo era válida) y no se
  persiste ningún `conversation_turn`

### Requirement: LLM caído en el turno de evidencia sin registro ni turno
Si `/chat/turn` responde `503` en un turno de evidencia, `clinical-api` MUST responder `503` con la tabla única de fallos
y MUST NOT persistir `AIAnalysisRecord` ni `conversation_turn` (RN-06, RN-12).

#### Scenario: LLM caído no deja análisis ni turno [US-265 AC-6] [RN-12] [AC-06.1]
- **GIVEN** MSW que responde `/chat/turn` desde `contracts/examples/chat-turn-llm-local-no-disponible.json` (`l1d-316`,
  código `LOCAL_LLM_UNAVAILABLE`)
- **WHEN** el doctor envía la pregunta de evidencia
- **THEN** responde `503 ErrorLlmLocalNoDisponible` validado contra el spec de `clinical-api`
- **AND** no hay filas nuevas en `clinical.ai_analysis_record` ni en `clinical.conversation_turn`

Regresión [RN-15] activa desde S6 con US-148 (L1D-213): opt-out de `analisis_ia` → `403` sin llamar a `/chat/turn`.

### Requirement: Los hechos del caso informan el día relativo de fin de los tratamientos con intervalo
`clinical-api` MUST calcular `relativeEndDay` solo para tratamientos previos, con el ancla y la función de `relativeDay`:
entero si hay `endedAt` (gana la fecha); `null` explícito si `ongoing = true` sin `endedAt`; ausente en cualquier otro
caso. La fecha absoluta de fin MUST NOT salir de Backend 1 (RN-10, RN-11).

#### Scenario: Una quimioterapia con fin documentado viaja con su día relativo de fin [US-272 AC-1] [AC-02.1] [RN-11]
- **GIVEN** `P-CHAT` con una quimioterapia con `startedAt` 160 días antes del diagnóstico y `endedAt` 60 días antes, y MSW sobre `/chat/turn`
- **WHEN** el oncólogo pregunta «¿Qué ocurrió en los últimos 100 días?»
- **THEN** el cuerpo enviado a `/chat/turn` trae esa quimioterapia con `relativeDay = -160` y `relativeEndDay = -60`
- **AND** ninguna cadena del cuerpo, del estado del hilo ni de los *logs* contiene una fecha `AAAA-MM-DD` y `endedAt` no sale de `clinical-api`

#### Scenario: Un tratamiento en curso viaja con relativeEndDay null explícito [US-272 AC-2] [AC-02.1] (asumido: null = en curso solo con tratamiento activo)
- **GIVEN** un tratamiento previo con `ongoing = true` y sin `endedAt`, y MSW que captura el cuerpo enviado a `/chat/turn`
- **WHEN** se envía una pregunta cualquiera del chat
- **THEN** el JSON serializado del hecho contiene `"relativeEndDay":null` y no omite la propiedad

#### Scenario: Con endedAt gana la fecha aunque el tratamiento figure en curso o la fecha sea incierta [US-272 AC-2] [AC-02.1] [RN-11]
- **GIVEN** un tratamiento previo con `ongoing = true` y `endedAt` presente (incoherente o con fecha incierta)
- **WHEN** se construyen los `caseFacts`
- **THEN** `relativeEndDay` es el entero de `endedAt` (no `null`) y el hecho conserva su `reviewStatus`

#### Scenario: Un tratamiento con fin desconocido (ongoing = false sin endedAt) no informa relativeEndDay [US-272 AC-2] [AC-02.1]
- **GIVEN** un tratamiento previo con `ongoing = false` y sin `endedAt` (fin desconocido), y un diagnóstico, una cirugía y un biomarcador
- **WHEN** se construyen los `caseFacts`
- **THEN** el hecho del tratamiento no tiene la propiedad `relativeEndDay` y los demás hechos tampoco la tienen

#### Scenario: Los campos nuevos del enlace no se persisten ni viajan [US-272 AC-3] [RN-11]
- **GIVEN** un turno con un tratamiento con `endedAt` y la tabla de enlaces `patient_data_links`
- **WHEN** se arma y se persiste el turno
- **THEN** ni `patient_data_links` ni el `ConversationDataLink` hacia el navegador contienen la fecha de fin ni `relativeEndDay`
