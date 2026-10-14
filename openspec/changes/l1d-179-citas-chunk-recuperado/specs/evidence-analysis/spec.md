## ADDED Requirements

### Requirement: Campos de la cita copiados del corpus, nunca del texto generado
Cada `CitedSource` de una opción MUST construirse desde el catálogo del corpus y el chunk recuperado en esta consulta; el LLM SHALL aportar solo el `chunkId`. `title`, `sourceName`, `externalId`, `language`, `sourceType` y el resto de metadatos MUST copiarse del catálogo, y `chunkTextSnapshot` MUST ser el texto del chunk en el corpus (RN-04, AC-T1.3).

#### Scenario: La cita de una opción válida lleva los datos del corpus [US-063 AC-1] [AC-T1.3] [RN-04] [OL-02]
- **GIVEN** el corpus de prueba FX-06a-a, `Q-HER2` con contexto de mama y el generador falso `LLM-OK` (`FakeEvidenceGenerator`, FX-06a-b)
- **WHEN** `POST /rag/query` valida la respuesta del LLM
- **THEN** `evidenceOptions[0].citedSources[0]` tiene `title = "Breast Cancer Treatment (test)"`, `sourceName = "NCI PDQ"`, `externalId = "CDR-TEST-001"`, `language = en` y `sourceType = guideline`
- **AND** `chunkTextSnapshot` es igual al texto de `ch-m1-1` en el corpus
- **AND** la respuesta valida contra `RagQueryInternalResponse` del `openapi.yaml` del proveedor (helper de validación de L1D-164)

### Requirement: Metadatos de fuente inventados por el LLM se ignoran
Cualquier metadato de fuente incluido por el LLM en una cita MUST descartarse y SHALL NOT aparecer en ningún campo de la respuesta, incluidas `discardedOptions` (RN-04).

#### Scenario: Un título y una fuente inventados se reemplazan por los del corpus [US-063 AC-4] [AC-T1.3] [RN-04]
- **GIVEN** FX-06a-a, `Q-HER2` y el generador falso `LLM-TITULO-FALSO`, que cita `ch-m1-1` con `title = "Guía NCCN 2026"` y `sourceName = "NCCN"`
- **WHEN** `POST /rag/query` valida la respuesta
- **THEN** la cita conserva `title = "Breast Cancer Treatment (test)"` y `sourceName = "NCI PDQ"` del corpus
- **AND** la cadena "Guía NCCN 2026" no aparece en ninguna parte de la respuesta serializada

### Requirement: Texto de la cita en su idioma original
`chunkTextSnapshot` y `language` MUST conservar el texto y el idioma del corpus, sin traducción, cualquiera que sea el idioma de la pregunta (RN-04; traducción fuera del MVP, `[S1 resp. 8]`).

#### Scenario: Una pregunta en español conserva la cita en inglés [US-063 AC-6] [RN-04]
- **GIVEN** FX-06a-a, `Q-HER2` formulada en español y el generador falso `LLM-OK`
- **WHEN** `POST /rag/query` valida la respuesta
- **THEN** `chunkTextSnapshot` es el texto en inglés de `ch-m1-1`, sin traducir, y `language = en`

### Requirement: Solo son citables los chunks recuperados en esta consulta
Una cita MUST apuntar a un `chunkId` del conjunto de chunks recuperados en esta consulta (sobre el umbral y entregados a la generación); toda cita fuera de ese conjunto SHALL quitarse de la opción. Una opción sin ninguna cita válida MUST ir a `discardedOptions` con `discardReason = cita_invalida` y no aparecer en `evidenceOptions` (RN-01, AC-T1.2). Regresión [RN-24] activa desde S4: un análisis previo nunca está en ese conjunto.

#### Scenario: Una opción que cita un chunk no recuperado se descarta [US-063 AC-2] [AC-T1.2] [RN-01] [OL-02]
- **GIVEN** FX-06a-a, `Q-HER2` y el generador falso `LLM-CITA-AJENA`, cuya única opción cita `ch-x-999` (no recuperado)
- **WHEN** `POST /rag/query` valida la respuesta
- **THEN** la opción no está en `evidenceOptions`
- **AND** aparece en `discardedOptions` con `discardReason = cita_invalida`

#### Scenario: Una cita mixta conserva la opción con solo la cita válida [US-063 AC-5] [RN-01] [OL-02]
- **GIVEN** FX-06a-a, `Q-HER2` y un generador falso cuya opción cita `ch-m1-1` y `ch-x-999`
- **WHEN** `POST /rag/query` valida la respuesta
- **THEN** la opción queda en `evidenceOptions` con una sola cita, de `chunkId` `ch-m1-1`

### Requirement: Una opción sin citas se descarta
Una opción devuelta por el LLM con `citedSources` vacío MUST ir a `discardedOptions` con `discardReason = sin_citas` y SHALL NOT aparecer en `evidenceOptions` (RN-01, AC-10.4).

#### Scenario: Una opción con citedSources vacío va a descartadas [US-063 AC-3] [AC-10.4] [RN-01]
- **GIVEN** FX-06a-a, `Q-HER2` y un generador falso que devuelve una opción con `citedSources = []`
- **WHEN** `POST /rag/query` valida la respuesta
- **THEN** la opción está en `discardedOptions` con `discardReason = sin_citas` y no en `evidenceOptions`
