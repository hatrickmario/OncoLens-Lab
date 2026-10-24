# Spec Delta — evidence-analysis

## MODIFIED Requirements

### Requirement: Campos de la cita copiados del corpus, nunca del texto generado
Cada `CitedSource` de una opción MUST construirse desde el catálogo del corpus y el chunk recuperado en esta consulta; el LLM SHALL aportar solo el `chunkId`. `title`, `sourceName`, `externalId`, `language`, `sourceType` y el resto de metadatos MUST copiarse del catálogo, y `chunkTextSnapshot` MUST ser el texto del chunk en el corpus (RN-04, AC-T1.3).

#### Scenario: La cita de una opción válida lleva los datos del corpus [US-063 AC-1] [AC-T1.3] [RN-04] [OL-02]
- **GIVEN** el corpus de prueba FX-06a-a, `Q-HER2` con contexto de mama y el generador falso `LLM-OK` (`FakeEvidenceGenerator`, FX-06a-b)
- **WHEN** `POST /rag/query` valida la respuesta del LLM
- **THEN** `evidenceOptions[0].citedSources[0]` tiene `title = "Breast Cancer Treatment (test)"`, `sourceName = "NCI PDQ"`, `externalId = "CDR-TEST-001"`, `language = en` y `sourceType = guideline`
- **AND** `chunkTextSnapshot` es igual al texto de `ch-m1-1` en el corpus
- **AND** la respuesta valida contra `RagQueryInternalResponse` del `openapi.yaml` del proveedor (helper de validación de L1D-164)

#### Scenario: Los metadatos factuales de la cita son las columnas del catálogo [US-127 AC-1] [AC-T1.3] [RN-25]
- **GIVEN** el schema `corpus` de test con `doc-a1` de FX-08b-a (ECA fase III, `metadata_source = fuente_estructurada`) con `study_design`, `trial_phase`, `primary_endpoint`, `sample_size`, `published_at`, `last_updated_at` y `guideline_version` sembrados con valores no nulos, y un generador falso cuya opción cita un chunk de `doc-a1`
- **WHEN** `POST /rag/query` valida la respuesta
- **THEN** el `CitedSource` de esa opción trae `studyDesign`, `trialPhase`, `primaryEndpoint`, `sampleSize`, `publishedAt`, `lastUpdatedAt` y `guidelineVersion` iguales, campo a campo, a las columnas de `corpus_document` de `doc-a1`
- **AND** la respuesta valida contra `RagQueryInternalResponse` del `openapi.yaml` del proveedor

### Requirement: Metadatos de fuente inventados por el LLM se ignoran
Cualquier metadato de fuente incluido por el LLM en una cita MUST descartarse y SHALL NOT aparecer en ningún campo de la respuesta, incluidas `discardedOptions` (RN-04).

#### Scenario: Un título y una fuente inventados se reemplazan por los del corpus [US-063 AC-4] [AC-T1.3] [RN-04]
- **GIVEN** FX-06a-a, `Q-HER2` y el generador falso `LLM-TITULO-FALSO`, que cita `ch-m1-1` con `title = "Guía NCCN 2026"` y `sourceName = "NCCN"`
- **WHEN** `POST /rag/query` valida la respuesta
- **THEN** la cita conserva `title = "Breast Cancer Treatment (test)"` y `sourceName = "NCI PDQ"` del corpus
- **AND** la cadena "Guía NCCN 2026" no aparece en ninguna parte de la respuesta serializada

#### Scenario: Un tamaño de muestra y una fase inventados se reemplazan por los del catálogo [US-127 AC-2] [RN-25] [RN-04]
- **GIVEN** `doc-a1` de FX-08b-a en el schema `corpus` de test y un generador falso que cita un chunk de `doc-a1` e incluye en la cita `sampleSize = 9999` y `trialPhase = "IV"`
- **WHEN** `POST /rag/query` valida la respuesta
- **THEN** la cita conserva `sampleSize` y `trialPhase` de las columnas `sample_size` y `trial_phase` de `doc-a1`
- **AND** ni `9999` ni `"IV"` aparecen en ningún campo de la cita, de `evidenceOptions` ni de `discardedOptions`

## ADDED Requirements

### Requirement: Metadato factual ausente del catálogo viaja como null
Si el catálogo no registra un metadato factual de la fuente (columna nula o texto vacío), el campo correspondiente de `CitedSource` MUST viajar `null`; SHALL NOT rellenarse con `""`, `0`, un valor por defecto, un centinela de texto ("No disponible" es solo texto de la UI) ni un valor de otra fuente o del texto generado (RN-25).

#### Scenario: Un documento sin endpoint ni tamaño de muestra devuelve esos campos en null [US-127 AC-3] [RN-25]
- **GIVEN** `doc-a3` de FX-08b-a en el schema `corpus` de test con `primary_endpoint` y `sample_size` nulos, y un generador falso cuya opción cita un chunk de `doc-a3`
- **WHEN** `POST /rag/query` responde
- **THEN** el `CitedSource` de esa opción trae `primaryEndpoint = null` y `sampleSize = null`
- **AND** la respuesta valida contra `RagQueryInternalResponse` del `openapi.yaml` del proveedor

#### Scenario: El gateway persiste y devuelve los metadatos nulos sin alterarlos [US-127 AC-3] [RN-25] [RN-06]
- **GIVEN** `rag-orchestrator` simulado (MSW, respuesta construida desde `contracts/examples/`) con una cita de `primaryEndpoint = null` y `sampleSize = null`
- **WHEN** `POST /platform/evidence-analyses` completa el análisis
- **THEN** la respuesta de `clinical-api` y el `AIAnalysisRecord` persistido traen `primaryEndpoint = null` y `sampleSize = null` en esa cita
- **AND** la respuesta valida contra el `openapi.yaml` de `clinical-api`
