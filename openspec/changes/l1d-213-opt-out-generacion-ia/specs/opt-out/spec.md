## Purpose

Bloqueo por opt-out de `analisis_ia` (RN-15): `clinical-api` nunca genera con IA sobre un paciente que se opuso o sobre
un paciente real sin convenio, sin llamar a `rag-orchestrator`, y todo lo demás sigue funcionando.

Regresión [RN-15] activa cuando exista FEAT-02c (US-148 AC-2, condicional): `POST /platform/patients/{id}/case-summary`
con P-OPT-IA → `403`, cero llamadas a `/case/summary` y ningún registro de resumen `[AC-02.5]`. Regresión [RN-15] activa
cuando existan la re-ejecución (US-177) y la búsqueda complementaria (US-186): se suman a la lista cerrada.

## ADDED Requirements

### Requirement: Toda generación con IA sobre un paciente con opt-out responde 403 sin llamar a la IA
Toda ruta marcada `generaIA` MUST aplicar el guardia de opt-out tras la sesión y el RBAC y antes de cualquier llamada a
`rag-orchestrator` o escritura de registros de IA. Si la última marca `analisis_ia` del paciente es `registrado`, MUST
responder `403` con `error = "OPT_OUT_ANALISIS_IA"`, sin referencia ni motivo de la marca en el cuerpo ni en los *logs*.

#### Scenario: El análisis sobre un paciente con opt-out responde 403 sin invocar a rag-orchestrator [US-148 AC-1] [AC-T4.6] [AC-06.1] [RN-15]
- **GIVEN** P-OPT-IA (FX-T4c-a), `doc1@test.local` con sesión y un cliente de `rag-orchestrator` que cuenta llamadas
- **WHEN** envía `POST /platform/evidence-analyses` sobre P-OPT-IA
- **THEN** responde `403` con `error = "OPT_OUT_ANALISIS_IA"` validado contra el spec
- **AND** el cliente registra cero llamadas a `/rag/query`
- **AND** `clinical.ai_analysis_record` no tiene filas nuevas
- **AND** ni el cuerpo ni los *logs* contienen `EXT-TEST-0001` ni `solicitud_paciente`

#### Scenario: El seguimiento sobre un paciente con opt-out responde 403 sin invocar a rag-orchestrator [US-148 AC-1] [DEC-22] [RN-15]
- **GIVEN** P-OPT-IA con el análisis previo `AN-PREV` y un cliente que cuenta llamadas
- **WHEN** el doctor envía `POST /platform/evidence-analyses/{AN-PREV}/follow-ups`
- **THEN** responde `403` con `error = "OPT_OUT_ANALISIS_IA"`, cero llamadas a `/rag/follow-up` y ninguna fila nueva en
  `clinical.analysis_follow_up`

#### Scenario: Un turno del chat sobre un paciente con opt-out responde 403 sin invocar a rag-orchestrator [US-148 AC-1] [S6 resp. 8] [RN-15]
- **GIVEN** una conversación abierta sobre P-OPT-IA y un cliente que cuenta llamadas
- **WHEN** el doctor envía `POST /platform/conversations/{conversationId}/turns`
- **THEN** responde `403` con `error = "OPT_OUT_ANALISIS_IA"`, cero llamadas a `/chat/turn` y ninguna fila nueva en
  `clinical.conversation_turn` ni en `clinical.ai_analysis_record`

#### Scenario: El administrador recibe PERMISO_DENEGADO antes de que se lea la marca [US-148 AC-1] [E-04]
- **GIVEN** `admin@test.local` y P-OPT-IA
- **WHEN** envía `POST /platform/evidence-analyses` sobre P-OPT-IA
- **THEN** responde `403` con `error = "PERMISO_DENEGADO"` y cero llamadas a `rag-orchestrator`

### Requirement: Un paciente real sin convenio no admite generación con IA
El guardia MUST tratar como sin consentimiento a todo paciente con `data_origin` `real_anonimizado` o
`real_identificado` y `agreement_reference` `NULL` (RN-15: sin convenio no se presume) y responder `403` con
`error = "OPT_OUT_ANALISIS_IA"` en toda ruta `generaIA`, sin llamar a `rag-orchestrator` ni crear registros de IA.

#### Scenario: Paciente real sin convenio recibe 403 en el análisis, el seguimiento y el turno [US-148 AC-9] [RN-15]
- **GIVEN** un paciente de test con `data_origin = real_anonimizado` (contenido sintético) y `agreement_reference` `NULL`,
  sin marcas, y un cliente que cuenta llamadas
- **WHEN** el doctor solicita el análisis, un seguimiento y un turno del chat sobre él
- **THEN** las tres respuestas son `403` con `error = "OPT_OUT_ANALISIS_IA"`
- **AND** el cliente registra cero llamadas y no hay filas nuevas en `ai_analysis_record`, `analysis_follow_up` ni
  `conversation_turn`

#### Scenario: Un paciente sintético de dataset sin convenio sí admite el análisis [US-148 AC-9] (asumido)
- **GIVEN** un paciente `sintetico` con `source_dataset` y `agreement_reference` `NULL`, sin marcas
- **WHEN** el doctor solicita el análisis
- **THEN** responde `200`

### Requirement: Solo la última marca de analisis_ia vigente bloquea
El guardia MUST decidir con la marca más reciente de tipo `analisis_ia` por `recorded_at`; si es `revocado`, o si el
paciente solo tiene marcas de otro tipo (`investigacion`), la generación MUST continuar con normalidad.

#### Scenario: Marca revocada permite el análisis [US-148 AC-4] [FR-16] [RN-15]
- **GIVEN** P-OPT-REV, cuya última marca `analisis_ia` es `revocado`
- **WHEN** el doctor solicita el análisis
- **THEN** responde `200` y se persiste su `AIAnalysisRecord`

#### Scenario: Solo opt-out de investigación permite el análisis [US-148 AC-5] [FR-16]
- **GIVEN** P-OPT-INV, con solo una marca `investigacion` `registrado`
- **WHEN** el doctor solicita el análisis
- **THEN** responde `200`

### Requirement: La marca se evalúa al entrar la petición
El guardia MUST leer la marca una sola vez al entrar la petición: una generación que ya superó el guardia SHALL terminar
y persistirse aunque se registre un opt-out mientras está en curso; la siguiente petición MUST responder `403`.

#### Scenario: Un opt-out registrado durante un análisis en curso solo afecta al siguiente [US-148 AC-6] [FR-16]
- **GIVEN** un análisis de P-OPT-REV en curso con `rag-orchestrator` fingido lento (MSW con retardo, reloj inyectado)
- **WHEN** se registra una marca `analisis_ia` `registrado` sobre P-OPT-REV antes de que termine
- **THEN** ese análisis responde `200` y su `AIAnalysisRecord` queda persistido
- **AND** el siguiente `POST /platform/evidence-analyses` sobre P-OPT-REV responde `403` con `error = "OPT_OUT_ANALISIS_IA"`

### Requirement: Lista cerrada de rutas generaIA verificada por la CI
Las operaciones con `x-genera-ia: true` en `apps/clinical-api/openapi.yaml`, la lista `RUTAS_GENERA_IA` y las rutas
Express que montan el guardia MUST coincidir; en el MVP son `createEvidenceAnalysis`, `createFollowUp` y
`createConversationTurn` (DEC-22; la marca de esta última la declara l1d-315). Una ruta `generaIA` sin guardia MUST
hacer fallar la CI.

#### Scenario: El test de cobertura de rutas pasa con la lista de DEC-22 [US-148 AC-3] [G-9] [DEC-22]
- **GIVEN** el registro de rutas de `clinical-api` y su `openapi.yaml`
- **WHEN** corre el test de cobertura
- **THEN** los tres conjuntos son exactamente `createEvidenceAnalysis`, `createFollowUp` y `createConversationTurn`

#### Scenario: Una ruta generaIA sin guardia hace fallar el test [US-148 AC-3] [RN-15]
- **GIVEN** un router de prueba con una operación marcada `x-genera-ia` montada sin `optOutGuard`
- **WHEN** corre la comprobación de cobertura sobre él
- **THEN** falla nombrando el `operationId` sin guardia

### Requirement: Lo que no es generación sigue funcionando con opt-out
Con opt-out de `analisis_ia`, `clinical-api` MUST seguir sirviendo las lecturas, la carga de documentos y la apertura y
lectura de conversaciones, porque no generan con IA (FR-16, RN-26).

Regresión [FR-16] activa cuando existan el feedback (US-137: `POST …/feedback` → `201`) y la extracción de documentos
(Post-MVP, PRD E-17: el documento llega a `procesado`) (US-148 AC-7, escenario más probable de DEC-16).

#### Scenario: Ficha, caso, faltantes, carga y conversación responden con normalidad [US-148 AC-7] [FR-16] [RN-26]
- **GIVEN** P-OPT-IA y `doc1@test.local`
- **WHEN** consulta `GET /platform/patients/{id}`, `GET …/case` y `GET …/completeness`, sube un PDF sintético con
  `POST …/documents`, abre una conversación con `POST /platform/patients/{id}/conversations` y la lee con
  `GET /platform/conversations/{conversationId}`
- **THEN** responden `200`, `200`, `200`, `202`, `201` y `200`, validados contra el spec
- **AND** el documento queda en la cola con `ocr_status = pendiente`

### Requirement: La ficha expone la disponibilidad de la IA sin detalle de la marca
La vista del doctor de `GET /platform/patients/{patientId}` MUST incluir `aiAnalysisAvailable`, calculado con la misma
regla del guardia: `false` con opt-out vigente o sin convenio, `true` en otro caso. La respuesta MUST NOT incluir la
referencia externa, el motivo ni la causa.

#### Scenario: La ficha de un paciente con opt-out marca la IA como no disponible [US-148 AC-8] [RN-15] [RN-10]
- **GIVEN** P-OPT-IA y P-OPT-REV
- **WHEN** el doctor consulta la ficha de cada uno
- **THEN** P-OPT-IA trae `aiAnalysisAvailable = false` y P-OPT-REV `true`
- **AND** ninguna respuesta contiene `EXT-TEST-0001`, `solicitud_paciente` ni `opt_out_type`

### Requirement: La UI comunica el bloqueo sin mostrar la marca ni ocultar el caso
Con `aiAnalysisAvailable = false`, `web` MUST mostrar «El análisis con IA no está disponible para este paciente» en el
panel conversacional, deshabilitar el campo de pregunta y el envío, y MUST NOT
mostrar referencia ni motivo; la ficha y la vista de caso se muestran completas (RN-26).

#### Scenario: El doctor ve el aviso y los controles deshabilitados [US-148 AC-8] [RN-15] [RN-10]
- **GIVEN** el paciente semilla (d) con opt-out (equivalente a P-OPT-IA) en Playwright contra Compose con LLM fingido
- **WHEN** el doctor abre su ficha y el panel de análisis
- **THEN** ve «El análisis con IA no está disponible para este paciente», el envío del panel conversacional está deshabilitado y el
  campo de pregunta del panel conversacional también
- **AND** la página no contiene la referencia externa ni el motivo de la marca
- **AND** la ficha y la vista de caso muestran todas sus secciones
- **AND** la red no registra ninguna petición a `/api/evidence-analyses` ni a `…/turns`
