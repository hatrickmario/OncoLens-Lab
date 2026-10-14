## ADDED Requirements

### Requirement: Con evidencia sobre el umbral, respuesta con_evidencia en el contrato final
Cuando al menos un chunk supere `RELEVANCE_THRESHOLD`, `POST /rag/query` MUST invocar al LLM local vía `EvidenceGenerator`, validar las opciones antes de devolverlas (RN-01) y responder `200` con `status = con_evidencia` en la forma final de `RagQueryInternalResponse` (FR-25, ADR-26). En el S1, síntesis, `applicability` y `agentSteps` SHALL ir vacíos; `limitations` solo trae limitaciones de regla o verificadas: el LLM no las genera en el S1 (`[S1 resp. 11]`). Sin *fallback* a la nube (RN-12).

#### Scenario: Una pregunta con evidencia devuelve una opción citada en el contrato final [US-225 AC-1] [AC-10.1] [OL-02] [FR-25] [ADR-26]
- **GIVEN** el corpus de prueba FX-06a-a con `RELEVANCE_THRESHOLD = 0.30`, `CorpusRelease rel-test-1` con `cutoff_date = 2026-09-30`, el LLM falso `LLM-OK` y el NLI falso en `entailment` (FX-06a-b), y un `clinicalContext` sintético de mama
- **WHEN** `clinical-api` envía `Q-HER2` a `POST /rag/query` con un JWT de servicio válido y `maxOptions = 1`
- **THEN** responde `200` con `status = con_evidencia` y exactamente 1 elemento en `evidenceOptions`, con `citedSources[0].chunkId = "ch-m1-1"` y `relevanceScore = 0.87`
- **AND** `topRelevanceScore = 0.87` (máximo de los chunks sobre el umbral)
- **AND** `synthesis.agreements = []`, `synthesis.discrepancies = []`, `applicability = []`, `agentSteps = []` y `meta.corpusCutoffDate = 2026-09-30`
- **AND** con la salida del *fixture* `LLM-OK`, `limitations = []` y `omittedClaims = 0`
- **AND** la respuesta valida contra `RagQueryInternalResponse` del `openapi.yaml` del proveedor (helper de validación de L1D-164)

### Requirement: relevanceScore de opción y topRelevanceScore con evidencia
`topRelevanceScore` MUST ser el máximo de los chunks sobre el umbral, calculado por `top_relevance_score()` (`[S1 resp. 18]`). El `relevanceScore` de cada opción SHALL ser el del *reranker* para su cita válida más relevante (la cita principal): un metadato de esa cita, no una medida de la opción ni de su solidez clínica (RN-03).

#### Scenario: La opción hereda el puntaje de su cita más relevante [RN-03] [S1 resp. 18]
- **GIVEN** FX-06a-a, `Q-HER2` con contexto de mama, el NLI falso en `entailment` y un LLM falso cuya única opción cita `ch-inj-1` (0,40) y `ch-m1-1` (0,87)
- **WHEN** se procesa la consulta
- **THEN** `evidenceOptions[0].relevanceScore = 0.87`
- **AND** `topRelevanceScore = 0.87`

### Requirement: Pregunta no terapéutica con evidencia responde con_evidencia sin opciones
Cuando hay chunks sobre el umbral pero el LLM no propone ninguna opción, `POST /rag/query` MUST responder `status = con_evidencia` con `evidenceOptions = []` y `topRelevanceScore` numérico; SHALL NOT responder `sin_evidencia`, porque hubo evidencia relevante y el LLM se invocó (AC-05.3).

#### Scenario: Una pregunta de toxicidad sin opciones terapéuticas responde con_evidencia vacío tras una invocación del LLM [US-225 AC-2] [AC-05.3]
- **GIVEN** FX-06a-a, `RELEVANCE_THRESHOLD = 0.30` y el LLM falso `LLM-SIN-OPCIONES` con contador de invocaciones
- **WHEN** se procesa `Q-TOX` ("¿Qué toxicidad cardiaca describe la evidencia con terapia anti-HER2?") con contexto de mama
- **THEN** responde `200` con `status = con_evidencia` y `evidenceOptions = []`
- **AND** el adapter del LLM registra exactamente una invocación
- **AND** la respuesta valida contra `RagQueryInternalResponse`

### Requirement: Recorte de opciones validadas a maxOptions
Tras la validación, el pipeline MUST conservar como máximo `maxOptions` opciones (FR-09). Sin aplicabilidad calculada (S1–S2) SHALL conservar las de mayor `relevanceScore` (desempate de RN-28), a igualdad la de menor `chunkId` de su cita principal, y omitir el excedente sin listarlo en `discardedOptions` (asumido, aceptado `[S1 resp. 3]`). Regresión [RN-28] selección por aplicabilidad activa desde S5 (US-125 AC-5).

#### Scenario: Con maxOptions 1 y dos opciones válidas queda la más relevante y la otra no es descartada [US-225 AC-3] [FR-09] [RN-28]
- **GIVEN** FX-06a-a, `maxOptions = 1`, el LLM falso `LLM-DOS` (opción que cita `ch-m1-1`, 0,87, y opción "Terapia anti-HER2 sola" que cita `ch-inj-1`, 0,40), el NLI falso en `entailment` y un pipeline sin aplicabilidad calculada (`applicability = []`)
- **WHEN** se procesa `Q-HER2` con contexto de mama
- **THEN** `evidenceOptions` tiene 1 elemento: la opción con `relevanceScore = 0.87`
- **AND** "Terapia anti-HER2 sola" no aparece en `evidenceOptions` ni en `discardedOptions`
- **AND** la respuesta valida contra `RagQueryInternalResponse`

#### Scenario: A igual relevanceScore el desempate es el chunkId de la cita principal [FR-09] [RN-28]
- **GIVEN** `recortar_a_max_opciones()` con `max_options = 1`, `applicability = []` y dos opciones validadas con `relevanceScore = 0.60`, cuyas citas principales son `ch-b` y `ch-a`, en ese orden de aparición
- **WHEN** se aplica el recorte
- **THEN** se conserva la opción cuya cita principal es `ch-a`, cualquiera que sea el orden de aparición

### Requirement: Salida del LLM inválida responde 503 LOCAL_LLM_UNAVAILABLE
Si el LLM no responde o devuelve un JSON no parseable o que no valida contra el esquema interno de generación, `POST /rag/query` MUST responder `503` con `error = "LOCAL_LLM_UNAVAILABLE"` (alternativa `ErrorLlmLocalNoDisponible` del `oneOf` del `503`), sin reintento silencioso, sin respuesta parcial y sin eco del texto generado (`[S1 resp. 12]`, RN-12).

#### Scenario: Un JSON fuera de esquema del LLM responde 503 sin opciones [S1 resp. 12]
- **GIVEN** FX-06a-a, `Q-HER2` con contexto de mama y un LLM falso que devuelve un JSON sin el campo `options`
- **WHEN** se procesa la consulta
- **THEN** responde `503` con `error = "LOCAL_LLM_UNAVAILABLE"`, `message` y `traceId`
- **AND** el cuerpo no contiene `evidenceOptions` ni texto generado
- **AND** la respuesta valida contra el `503` de `/rag/query` del `openapi.yaml` del proveedor

### Requirement: Plantilla del prompt sin lenguaje prescriptivo
La plantilla del prompt `rag-query@0.1.0` MUST redactar sus instrucciones en positivo (describir lo que reporta la evidencia citada) y SHALL NOT contener ningún término de nivel A ni la raíz de nivel B (`recomend*`/`recommend*`) de `terminos-prohibidos.json` 1.1.0 (RN-23, `[S1 resp. 15]`).

#### Scenario: La plantilla del prompt no contiene términos prohibidos de nivel A ni B [RN-23] [S1 resp. 15]
- **GIVEN** la plantilla de `rag-query@0.1.0` sin datos y la lista `terminos-prohibidos.json` 1.1.0 de L1D-193
- **WHEN** se aplica `check_prohibited_terms()` con los niveles A y B
- **THEN** devuelve cero coincidencias
