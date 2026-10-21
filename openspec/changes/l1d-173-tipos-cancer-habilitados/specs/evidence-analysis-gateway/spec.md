## ADDED Requirements

### Requirement: Un tipo de cáncer no habilitado no se analiza
Si el tipo del `Diagnosis` activo del paciente no está en `ENABLED_CANCER_TYPES`, `POST /platform/evidence-analyses` MUST responder `200` con `status = tipo_no_habilitado`, `evidenceOptions = []`, `discardedOptions = []`, `topRelevanceScore = null` y la Base del análisis, sin construir el contexto clínico ni llamar a `rag-orchestrator`, y MUST persistir antes de responder un `AIAnalysisRecord` con ese estado (RN-06). La UI SHALL mostrar el aviso informativo de alcance, no un error.

#### Scenario: Con solo mama habilitada el análisis del paciente (b) responde tipo_no_habilitado sin llamar a la IA [US-043 AC-2] [RN-20] [FR-09] [AC-06.1]
- **GIVEN** `ENABLED_CANCER_TYPES=mama`, `doc1@test.local` autenticado, el paciente semilla (b) (próstata) y `rag-orchestrator` simulado con contador de llamadas
- **WHEN** solicita un análisis
- **THEN** la respuesta es `200`, válida contra `EvidenceAnalysis`, con `status = "tipo_no_habilitado"`, `evidenceOptions = []` y `topRelevanceScore = null`
- **AND** el cliente de `rag-orchestrator` registra cero llamadas
- **AND** existe un `AIAnalysisRecord` con ese `trace_id`, `status = tipo_no_habilitado` y `top_relevance_score` nulo

#### Scenario: La Base de tipo_no_habilitado dice que no se consultó el corpus [US-043 AC-2] [FR-27] (asumido: Propuesto en el Gate 1 del S2, pendiente de confirmación del usuario, para corpusCutoffDate)
- **GIVEN** el contexto del escenario anterior, `CORPUS_EXCLUDED_SOURCES=NCCN,ESMO`, `CORPUS_CUTOFF_DATE=2026-09-30` y un request con `guias` y `publicaciones` seleccionadas
- **WHEN** solicita un análisis
- **THEN** `analysisBasis.patientDataUsed = []`, `sourcesConsulted.selected = ["guias","publicaciones"]`, `filters` igual al request, `retrieved = 0` y `aboveThreshold = 0`
- **AND** `sourcesNotIncluded = ["NCCN","ESMO"]` y `corpusCutoffDate = 2026-09-30`, la respuesta valida contra `EvidenceAnalysis` y el `analysis_basis` persistido es igual

#### Scenario: El panel muestra el aviso de alcance ante tipo_no_habilitado [US-043 AC-2] [RN-26] (asumido: literal unificado propuesto en el refinamiento del S2, P-4)
- **GIVEN** el panel de análisis con MSW respondiendo desde `contracts/examples/tipo-no-habilitado.json`
- **WHEN** se muestra el resultado
- **THEN** el panel muestra el aviso informativo "Tipo de cáncer fuera del alcance del piloto: sin análisis con IA" y la Base del análisis, sin ninguna opción y sin estilo de error
