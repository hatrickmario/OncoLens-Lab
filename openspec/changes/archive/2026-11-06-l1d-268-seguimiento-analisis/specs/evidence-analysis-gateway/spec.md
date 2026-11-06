## ADDED Requirements

### Requirement: Pregunta de seguimiento anclada, validada y persistida antes de responder
`clinical-api` MUST atender `POST /platform/evidence-analyses/{analysisId}/follow-ups` enviando a `/rag/follow-up` el contexto anclado al análisis, recibir la respuesta completa, persistir el turno en `clinical.analysis_follow_up` **antes** de responder y devolver `201 FollowUpTurn` válido contra su spec (FR-31, RN-01, RN-04, RN-06). Un fallo al persistir SHALL responder `500` sin contenido generado.

#### Scenario: Primera pregunta de seguimiento sobre la opción 2 de un análisis con evidencia [US-218 AC-1] [RN-01] [RN-06] [RN-04]
- **GIVEN** `doc1@test.local` con sesión válida, un análisis `con_evidencia` del paciente semilla (b) con al menos dos opciones, y `rag-orchestrator` simulado (MSW desde `rag-follow-up-response.json`) que registra el cuerpo recibido
- **WHEN** envía `POST /platform/evidence-analyses/{id}/follow-ups` con una pregunta sobre la opción 2
- **THEN** responde `201` con un `FollowUpTurn` válido contra el spec de `clinical-api`, `turnNumber = 1` y cada afirmación de `answer` con ≥ 1 cita a un chunk de `citedSources` o un `patientDataRef` resuelto en `patientDataLinks`
- **AND** `rag-orchestrator` recibió exactamente una llamada y existe una fila en `analysis_follow_up` con el mismo `id`, `turn_number = 1`, `question_text` y `cited_sources` que la respuesta (el orden «persistir antes de responder» lo prueba el escenario de fallo de persistencia)
- **AND** los campos de cada cita son los de la respuesta de `rag-orchestrator`, copiados sin cambios

#### Scenario: Un fallo al persistir el turno nunca muestra la respuesta [US-218 AC-1] [RN-06]
- **GIVEN** el mismo contexto y la inserción en `analysis_follow_up` forzada a fallar (rol de test sin `INSERT` sobre la tabla)
- **WHEN** envía la pregunta
- **THEN** responde `500 ERROR_INTERNO` válido contra el spec, sin `answer` ni texto generado en el cuerpo

#### Scenario: Una respuesta sin evidencia también se persiste como turno [US-218 AC-3] [RN-02]
- **GIVEN** `rag-orchestrator` simulado con `rag-follow-up-sin-evidencia.json`
- **WHEN** envía la pregunta
- **THEN** responde `201` con `status = sin_evidencia`, `answer` y `citedSources` vacíos, válido contra el spec, y el turno queda persistido con ese estado

### Requirement: Marca de fuente nueva calculada por clinical-api
`clinical-api` MUST calcular `isNewSource` de cada cita del turno: `true` si su `chunkId` no está entre las citas persistidas del análisis de origen (opciones y síntesis), `false` si está. `rag-orchestrator` SHALL NOT conocer esa marca `[Pre-S1 resp. 19]`.

#### Scenario: Una fuente ya citada por el análisis y otra nueva [US-218 AC-1] [Pre-S1 resp. 19]
- **GIVEN** un análisis que citó `ch-a1-1` y una respuesta de seguimiento simulada que cita `ch-a1-1` y `ch-a5-1`
- **WHEN** se crea el turno
- **THEN** `citedSources` marca `ch-a1-1` con `isNewSource = false` y `ch-a5-1` con `isNewSource = true`, y así queda en `cited_sources` persistido

### Requirement: Contexto del seguimiento desde el snapshot del análisis, desidentificado y con seudónimo nuevo por turno
`clinical-api` MUST armar `RagFollowUpRequest` desde el `clinicalContextSnapshot` del análisis con un `pseudoPatientId` y un `traceId` nuevos por turno (generadores inyectados), la pregunta enmascarada y `analysisMemory` con el análisis de origen rotulado `citable = false`. El seudónimo MUST NOT persistirse (RN-10, RN-11); el `trace_id` propio del turno SHALL persistirse en `analysis_follow_up` (`[S5 resp. 12]`).

#### Scenario: Dos turnos llevan seudónimos y traceId distintos, se persiste el trace_id del turno y nunca el seudónimo [US-218 AC-8] [RN-11] [Pre-S1 resp. 23] [Pre-S1 resp. 29] [S5 resp. 12]
- **GIVEN** un análisis `con_evidencia` y `rag-orchestrator` simulado que registra los cuerpos y la cabecera `X-Trace-Id`
- **WHEN** se envían dos preguntas de seguimiento seguidas
- **THEN** los dos cuerpos tienen `clinicalContext.pseudoPatientId` distintos entre sí y distintos del usado por el análisis, y `traceId` distintos entre sí y del análisis
- **AND** ninguna columna de `analysis_follow_up` contiene ninguno de los dos `pseudoPatientId`, y el `trace_id` de cada fila es el de su propio turno (`data-model` §7; Decidido, usuario, 2026-11-03, [S5 resp. 12])

#### Scenario: La memoria del análisis viaja rotulada y no citable [US-218 AC-2] [RN-24]
- **GIVEN** el mismo contexto
- **WHEN** se envía una pregunta de seguimiento
- **THEN** el cuerpo trae exactamente un elemento en `analysisMemory` con `source = analisis_previo_ia`, `citable = false`, la pregunta del análisis enmascarada y los títulos de sus opciones, y `clinicalContext` sin `pseudoPatientId` del análisis ni UUID

### Requirement: Pregunta y evolución enmascaradas hacia la IA, en el turno y fuera de los logs
`clinical-api` MUST normalizar la pregunta con la regla única de US-250 y enmascararla con el desidentificador de ADR-40 antes de persistirla y enviarla, y enmascarar el texto de `analysisMemory` y de `outcomesSince`. `FollowUpTurn.question` y `question_text` SHALL ser la versión enmascarada. Ningún log MUST contener la pregunta (RN-11).

#### Scenario: PII sembrada en la pregunta y en la evolución no sale hacia la IA ni a los logs [US-218 AC-6] [RN-11] [Pre-S1 resp. 23]
- **GIVEN** un análisis `con_evidencia`, un evento clínico registrado después del análisis con un documento de identidad sintético en su descripción, y logs capturados
- **WHEN** envía una pregunta de seguimiento que contiene el nombre sintético del paciente y un teléfono
- **THEN** el cuerpo recibido por `rag-orchestrator` no contiene el nombre, el teléfono ni el documento en `question`, `analysisMemory[*].outcomesSince` ni en ningún otro campo
- **AND** `FollowUpTurn.question` y `question_text` persistido contienen la versión enmascarada
- **AND** ninguna línea de log contiene la pregunta, el nombre, el teléfono ni el documento

#### Scenario: La pregunta de seguimiento en NFD se normaliza igual que la del análisis [US-218 AC-1] [US-250 AC-1] [OUT-05]
- **GIVEN** el mismo contexto
- **WHEN** envía la pregunta de la Demo 4 en NFD con espacios repetidos en los extremos
- **THEN** la `question` que recibe `rag-orchestrator` y `question_text` están en NFC, sin espacios en los extremos ni repetidos, idénticos byte a byte a los de la misma pregunta enviada en NFC
- **AND** una pregunta formada solo por espacios responde `422 CUERPO_INVALIDO` sin llamar a `rag-orchestrator` ni persistir turno

### Requirement: Límite de preguntas de seguimiento por análisis en configuración
`clinical-api` MUST rechazar con `409 LIMITE_SEGUIMIENTO` (mensaje sin imperativos ni claves de configuración) toda pregunta sobre un análisis que ya tiene `ANALYSIS_FOLLOWUP_MAX` turnos, sin llamar a `rag-orchestrator`. El límite SHALL leerse de configuración (RN-22) y comprobarse también al insertar, bajo bloqueo, para que dos peticiones simultáneas no lo superen.

#### Scenario: La pregunta 11 de un análisis con 10 turnos se rechaza [US-218 AC-4] [RN-22]
- **GIVEN** `ANALYSIS_FOLLOWUP_MAX = 10` y un análisis con 10 turnos persistidos
- **WHEN** envía la pregunta 11
- **THEN** responde `409` con `error = LIMITE_SEGUIMIENTO`, el `message` de `error-limite-seguimiento.json` y `traceId`, válido contra el spec, y `rag-orchestrator` registra cero llamadas

#### Scenario: El límite sale de la configuración [US-218 AC-4] [RN-22]
- **GIVEN** `ANALYSIS_FOLLOWUP_MAX = 2` inyectado en la configuración de test y un análisis con 2 turnos
- **WHEN** envía la pregunta 3
- **THEN** responde `409 LIMITE_SEGUIMIENTO`

#### Scenario: Dos preguntas simultáneas sobre el último turno libre no superan el límite [US-218 AC-4] (Decidido, usuario, 2026-11-03, [S5 resp. 13])
- **GIVEN** `ANALYSIS_FOLLOWUP_MAX = 10` y un análisis con 9 turnos
- **WHEN** llegan dos preguntas a la vez
- **THEN** una responde `201` con `turnNumber = 10` y la otra `409 LIMITE_SEGUIMIENTO`, y la tabla tiene exactamente 10 turnos

### Requirement: Bordes del seguimiento sin invocar a la IA
`clinical-api` MUST responder sin llamar a `rag-orchestrator` ni persistir turno: `401` sin sesión, `403` sin `follow_ups:create`, `404` si el análisis no existe y `422 ANALISIS_SIN_EVIDENCIA` si el análisis es `sin_evidencia`; y ante un fallo de `rag-orchestrator` SHALL aplicar la tabla única de fallos sin consumir turno. Regresión [RN-15] activa desde S6 (DEC-22). Regresión [RN-17 paciente egresado → 422] Post-MVP (US-198).

#### Scenario: El administrador no puede preguntar ni leer seguimientos [US-218 AC-6] (403 por RBAC)
- **GIVEN** `admin@test.local` con sesión válida y un análisis `con_evidencia`
- **WHEN** envía `POST …/follow-ups` o `GET …/follow-ups`
- **THEN** responde `403` válido contra el spec y `rag-orchestrator` registra cero llamadas

#### Scenario: Seguimiento sobre un análisis sin evidencia o inexistente [US-218] (non-goal de la historia y contrato congelado; Decidido, usuario, 2026-11-03, [S5 resp. 13])
- **GIVEN** un análisis `sin_evidencia` y un UUID que no corresponde a ningún análisis
- **WHEN** envía una pregunta sobre cada uno
- **THEN** el primero responde `422` con `error = ANALISIS_SIN_EVIDENCIA` y el segundo `404`, ambos válidos contra el spec y sin llamadas a `rag-orchestrator`

#### Scenario: rag-orchestrator caído no consume turno [US-218 AC-1] [RN-06]
- **GIVEN** `rag-orchestrator` simulado con `503 LOCAL_LLM_UNAVAILABLE` y, en otra petición, sin respuesta antes del *deadline*
- **WHEN** envía la pregunta
- **THEN** responde `503` y `504` respectivamente, según la tabla única de fallos, válidos contra el spec, y no se persiste ningún turno

#### Scenario: NLI no disponible en Backend 2 se expone como 502, igual que en el análisis [US-218 AC-1] [RN-01]
- **GIVEN** `rag-orchestrator` simulado con `503` y `rag-nli-no-disponible.json`
- **WHEN** envía la pregunta
- **THEN** responde `502` válido contra el spec, sin texto generado, y no se persiste ningún turno

#### Scenario: Desidentificación no disponible falla cerrada sin llamar a la IA [US-218 AC-6] [RN-11]
- **GIVEN** el detector de PII de ADR-40 forzado a fallar en el arranque de la petición
- **WHEN** envía la pregunta
- **THEN** responde `503` con el cuerpo de `error-desidentificacion-no-disponible.json`, válido contra el spec, `rag-orchestrator` registra cero llamadas y no se persiste ningún turno

### Requirement: Lectura del hilo de seguimiento
`clinical-api` MUST atender `GET /platform/evidence-analyses/{analysisId}/follow-ups` con los turnos del análisis en orden de creación, válidos contra el spec, con `403` sin `follow_ups:read` y `404` si el análisis no existe.

#### Scenario: El hilo se devuelve en orden [US-218 AC-1]
- **GIVEN** un análisis con 2 turnos persistidos
- **WHEN** `doc1@test.local` envía `GET …/follow-ups`
- **THEN** responde `200` con un arreglo de 2 `FollowUpTurn` válidos contra el spec, con `turnNumber` 1 y 2 en ese orden y la pregunta enmascarada
