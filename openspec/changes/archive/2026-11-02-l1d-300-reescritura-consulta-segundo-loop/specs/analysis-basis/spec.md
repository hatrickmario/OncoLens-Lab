## ADDED Requirements

### Requirement: La Base declara la reescritura que rescató evidencia
`AnalysisBasisBuilder` MUST fijar, sin LLM, `sourcesConsulted.queryRewritten = true` solo con `queryRewrite.applied = true` y `status = con_evidencia`, y `false` en otro caso (FR-27, D-d); `clinical-api` SHALL persistir `queryRewrite` en `retrieval_params`, y la consulta reformulada MUST NOT aparecer en la Base, el registro ni los logs.

#### Scenario: Un rescate por reescritura se declara en la Base y se persiste [US-238 AC-7] [FR-27] [AC-T1.4]
- **GIVEN** `doc1@test.local` autenticado, el paciente semilla (a) y `rag-orchestrator` simulado con MSW con `contracts/examples/rag-query-reescritura-aplicada.json`
- **WHEN** el doctor ejecuta el análisis
- **THEN** la respuesta trae `analysisBasis.sourcesConsulted.queryRewritten = true`
- **AND** `retrieval_params` del `AIAnalysisRecord` guarda `queryRewrite = { applied: true, reason: "disparado" }` y `query_text` es la pregunta original

#### Scenario: Sin rescate la Base no declara reescritura [US-238 AC-3] [FR-27]
- **GIVEN** `rag-orchestrator` simulado con `rag-query-con-evidencia.json` (`no_disparado`) y, en otra ejecución, con `rag-query-sin-evidencia.json` (`disparado` sin rescate)
- **WHEN** el doctor ejecuta el análisis
- **THEN** en ambos casos `analysisBasis.sourcesConsulted.queryRewritten = false`
- **AND** `retrieval_params` guarda el `queryRewrite` recibido tal cual
