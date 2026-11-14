## ADDED Requirements

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
