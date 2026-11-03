## ADDED Requirements

### Requirement: La Base declara el tope de preguntas de seguimiento
`AnalysisBasis` de todo análisis nuevo MUST traer `maxFollowUps` con el valor de `ANALYSIS_FOLLOWUP_MAX` leído de Settings de `clinical-api` al crear el análisis (RN-22); MUST NOT existir un literal del tope en `clinical-api` ni en `web`. La Base persistida SHALL ser igual a la respondida (RN-06). El valor es informativo para la UI: la autoridad del límite es el `409 LIMITE_SEGUIMIENTO`, calculado con la configuración vigente en cada pregunta `[S5 resp. 10]`.

#### Scenario: maxFollowUps viaja a la Base y al registro con el valor de configuración [US-219 AC-1] [RN-22] [RN-06] [S5 resp. 10]
- **GIVEN** `clinical-api` con `ANALYSIS_FOLLOWUP_MAX = 4` inyectado en la prueba y `rag-orchestrator` simulado con MSW desde `contracts/examples/rag-query-tres-opciones.json`
- **WHEN** `doc1@test.local` envía `Q-HER2` a `POST /platform/evidence-analyses`
- **THEN** la respuesta, validada contra `EvidenceAnalysis`, trae `analysisBasis.maxFollowUps = 4`
- **AND** el `analysis_basis` del `AIAnalysisRecord` persistido trae el mismo valor

#### Scenario: El 409 manda aunque la Base guarde otro tope [US-218 AC-4] [RN-22] [S5 resp. 10]
- **GIVEN** un análisis creado con `analysisBasis.maxFollowUps = 4` y 2 turnos, y `ANALYSIS_FOLLOWUP_MAX = 2` vigente
- **WHEN** `doc1@test.local` envía la pregunta 3
- **THEN** responde `409 LIMITE_SEGUIMIENTO` válido contra el spec y `rag-orchestrator` registra cero llamadas
