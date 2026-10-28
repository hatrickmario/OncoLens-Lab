# Spec Delta — evidence-analysis

## MODIFIED Requirements

### Requirement: Con evidencia sobre el umbral, respuesta con_evidencia en el contrato final
Cuando al menos un chunk supere `RELEVANCE_THRESHOLD`, `POST /rag/query` MUST invocar al LLM local vía `EvidenceGenerator`, validar las opciones antes de devolverlas (RN-01) y responder `200` con `status = con_evidencia` en la forma final de `RagQueryInternalResponse` (FR-25, ADR-26). En el S1, síntesis y `agentSteps` SHALL ir vacíos; `applicability` SHALL ir vacío solo si el catálogo clínico del tipo de cáncer no declara criterios de aplicabilidad; con el catálogo real (ya con 6 criterios por tipo desde L1D-126) trae la aplicabilidad por fuente de la capacidad `applicability` (L1D-127); `limitations` solo trae limitaciones de regla o verificadas: el LLM no las genera en el S1 (`[S1 resp. 11]`). Sin *fallback* a la nube (RN-12).

#### Scenario: Una pregunta con evidencia devuelve una opción citada en el contrato final [US-225 AC-1] [AC-10.1] [OL-02] [FR-25] [ADR-26]
- **GIVEN** el corpus de prueba FX-06a-a con `RELEVANCE_THRESHOLD = 0.30`, `CorpusRelease rel-test-1` con `cutoff_date = 2026-09-30`, el LLM falso `LLM-OK` y el NLI falso en `entailment` (FX-06a-b), un `clinicalContext` sintético de mama y un catálogo clínico de test sin criterios de aplicabilidad (`items: []` en `aplicabilidad.json` de mama; cambio de spec declarado de L1D-127, no una relajación del test)
- **WHEN** `clinical-api` envía `Q-HER2` a `POST /rag/query` con un JWT de servicio válido y `maxOptions = 1`
- **THEN** responde `200` con `status = con_evidencia` y exactamente 1 elemento en `evidenceOptions`, con `citedSources[0].chunkId = "ch-m1-1"` y `relevanceScore = 0.87`
- **AND** `topRelevanceScore = 0.87` (máximo de los chunks sobre el umbral)
- **AND** `synthesis.agreements = []`, `synthesis.discrepancies = []`, `applicability = []`, `agentSteps = []` y `meta.corpusCutoffDate = 2026-09-30`
- **AND** con la salida del *fixture* `LLM-OK`, `limitations = []` y `omittedClaims = 0`
- **AND** la respuesta valida contra `RagQueryInternalResponse` del `openapi.yaml` del proveedor (helper de validación de L1D-164)
