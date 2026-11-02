## ADDED Requirements

### Requirement: La Base declara las opciones con soporte no mostradas y el tope aplicado
`AnalysisBasis` MUST traer `optionsNotShown` (entero >= 0, copiado de la respuesta interna sin transformarlo; opcional para análisis antiguos) y `maxOptions` (el `ANALYSIS_MAX_OPTIONS` aplicado), sin ningún contenido de las opciones recortadas; la Base persistida SHALL ser igual a la respondida (RN-06).

#### Scenario: optionsNotShown viaja a la Base y al registro sin contenido de la opción recortada [US-134 AC-3] [US-134 AC-1] [FR-09] [RN-06] [S4 resp. 7]
- **GIVEN** `doc1@test.local`, A-M1 y `rag-orchestrator` simulado (MSW desde `contracts/examples/`) con `LLM-CUATRO`, `optionsNotShown = 1` y `ANALYSIS_MAX_OPTIONS = 3`
- **WHEN** envía `Q-HER2` a `POST /platform/evidence-analyses`
- **THEN** `analysisBasis.maxOptions = 3` y `analysisBasis.optionsNotShown = 1`, iguales en el `analysis_basis` del `AIAnalysisRecord`
- **AND** ningún campo de la respuesta ni del registro contiene título, justificación ni citas de O-A
- **AND** con `LLM-TRES` `optionsNotShown = 0`
