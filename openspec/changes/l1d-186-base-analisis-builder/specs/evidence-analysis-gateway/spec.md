## MODIFIED Requirements

### Requirement: Contenido trazable del registro del análisis
El `AIAnalysisRecord` MUST incluir `trace_id`, `analysis_type = analisis_evidencia`, `requested_by`, `query_text` y `clinical_context_snapshot` desidentificados, `context_fingerprint`, `sources_selected`, `filters_applied`, `corpus_release`, `catalog_version`, los modelos y `llm_provider`, `prompt_version`, `retrieval_params`, `status` y `top_relevance_score` (IA-09, AC-T1.4); el `disclaimer` de la respuesta SHALL salir de la clave de configuración `AI_DISCLAIMER_TEXT`.

#### Scenario: Los filtros recibidos quedan persistidos con el análisis [US-052 AC-5] [AC-05.1] [OL-03]
- **GIVEN** el request del AC-1 de US-052 con `filtersApplied.ultimosSeisMeses = true` y `rag-orchestrator` simulado respondiendo con evidencia
- **WHEN** se envía
- **THEN** responde `200` y el `ai_analysis_record` de ese `id` tiene `filters_applied.ultimosSeisMeses = true`

#### Scenario: El trace_id persistido es el generado por clinical-api y no el X-Trace-Id entrante [US-053 AC-1] [RN-10] (asumido: corrección del Gate 1, 2026-10-14)
- **GIVEN** el análisis del AC-1 enviado con la cabecera `X-Trace-Id: req_Entrante01` y el generador de `traceId` inyectado con `req_TestGen0001`
- **WHEN** se lee el `ai_analysis_record` del `id` respondido
- **THEN** `trace_id = req_TestGen0001` y ninguna columna del registro contiene `req_Entrante01`

#### Scenario: La Base del análisis del S1 declara los datos usados y que los faltantes críticos aún no se calculan [US-053 AC-1] [FR-27] (asumido: corrección del Gate 1, 2026-10-14)
- **GIVEN** el análisis del AC-1, y en otro caso el de `Q-SIN` sin evidencia, sobre el paciente semilla (a)
- **WHEN** se completa el análisis
- **THEN** en ambos `analysisBasis.patientDataUsed` tiene una entrada por dato del contexto enviado, `analysisBasis.missingCriticalData = []` y `analysisBasis.assumptions` contiene `{ text: "Los faltantes críticos aún no se calculan en esta versión", origin: regla_catalogo }`, igual en la respuesta y en `analysis_basis` persistido
- **AND** el texto del supuesto es un literal del builder, no una clave de configuración

#### Scenario: El snapshot persistido no lleva el seudónimo de la consulta [US-053 AC-1] [RN-11] (asumido: nota de data-model.md §4.3 "sin pseudoPatientId")
- **GIVEN** el análisis del AC-1
- **WHEN** se lee `clinical_context_snapshot` del registro persistido
- **THEN** no contiene la clave `pseudoPatientId` ni el valor enviado como seudónimo en el request capturado
