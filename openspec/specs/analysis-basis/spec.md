# analysis-basis Specification

## Purpose
TBD - created by archiving change l1d-186-base-analisis-builder. Update Purpose after archive.

## Requirements

### Requirement: Todo análisis trae la Base con los incisos del S1
Toda respuesta `con_evidencia` o `sin_evidencia` de `POST /platform/evidence-analyses` MUST traer `analysisBasis` completo, armado sin LLM por `AnalysisBasisBuilder` con los incisos (a), (d), (e), (f) y `omittedClaims` (FR-27). Los incisos (b), (g), (h), (i) SHALL ir con su forma final y sin contenido del builder. En `tipo_no_habilitado` la Base la arma US-043 con el inciso (a) vacío.

#### Scenario: Base completa del análisis con evidencia [US-066 AC-1] [AC-T2.1] [FR-27]
- **GIVEN** `doc1@test.local` autenticado, el paciente semilla (a) con solo datos `seed`, el corpus de prueba FX-06a-a con `CorpusRelease` `cutoff_date = 2026-09-30` y `excluded_sources = ["NCCN","ESMO"]`, y `rag-orchestrator` simulado con la respuesta `LLM-OK`
- **WHEN** el doctor ejecuta `Q-HER2` con `guias`, `ensayos` y `publicaciones` seleccionadas
- **THEN** `analysisBasis.patientDataUsed` trae una entrada por dato del contexto enviado, cada una con `label` (p. ej. "HER2 3+ (IHQ)"), `reviewStatus` y `conflict`
- **AND** `sourcesConsulted.selected = ["guias","ensayos","publicaciones"]`, `sourcesConsulted.filters` igual a los filtros del request y `retrieved` y `aboveThreshold` iguales a `retrievalStats`
- **AND** `sourcesNotIncluded = ["NCCN","ESMO"]` y `corpusCutoffDate = 2026-09-30`
- **AND** `missingCriticalData = []`, `limitations = []`, `agentSteps = []` y `priorAnalysesUsed = []`
- **AND** `assumptions` tiene exactamente un elemento, `{ text: "Los faltantes críticos aún no se calculan en esta versión", origin: "regla_catalogo" }` (asumido: adaptado en el Gate 1 del S2; el AC literal decía `assumptions = []`)
- **AND** la respuesta valida contra `EvidenceAnalysis` del spec del proveedor

#### Scenario: Sin evidencia también explica qué se buscó [US-066 AC-2] [AC-T2.3] [RN-02] [FR-27]
- **GIVEN** el paciente semilla (a) y `rag-orchestrator` simulado con la respuesta `sin_evidencia` de `Q-SIN`
- **WHEN** el doctor ejecuta `Q-SIN`
- **THEN** la respuesta `sin_evidencia` trae `analysisBasis` con `sourcesConsulted` (fuentes seleccionadas, filtros, `retrieved` y `aboveThreshold = 0`), `sourcesNotIncluded`, `corpusCutoffDate` y `patientDataUsed` no vacío
- **AND** `assumptions` contiene el supuesto declarado "Los faltantes críticos aún no se calculan en esta versión"
- **AND** la respuesta valida contra `EvidenceAnalysis` del spec del proveedor

#### Scenario: Las afirmaciones omitidas se cuentan sin su texto [US-066 AC-3] [FR-27] [FR-10]
- **GIVEN** `rag-orchestrator` simulado con `omittedClaims = 1` (escenario de US-064 AC-3)
- **WHEN** se arma la Base
- **THEN** `analysisBasis.omittedClaims = 1`
- **AND** ningún campo de `analysisBasis` contiene el texto de la afirmación omitida

### Requirement: Supuesto declarado mientras los faltantes no se calculan
Mientras el inciso (b) no se calcule (US-128, S3/S4), `assumptions` MUST empezar con el supuesto declarado `{ text: "Los faltantes críticos aún no se calculan en esta versión", origin: "regla_catalogo" }`, para que `missingCriticalData = []` no se lea como "no falta nada"; las verificadas de la respuesta interna SHALL ir después. US-128 lo retira.

#### Scenario: El supuesto declarado precede a los verificados [FR-27] (asumido: Gate 1 del S2)
- **GIVEN** `rag-orchestrator` simulado con una respuesta que trae un supuesto `llm_verificado`
- **WHEN** se arma la Base
- **THEN** `assumptions[0]` es `{ text: "Los faltantes críticos aún no se calculan en esta versión", origin: "regla_catalogo" }` y `assumptions[1]` es el supuesto verificado

### Requirement: Datos del paciente usados con etiqueta determinista y sin identidad
`patientDataUsed` MUST tener exactamente una entrada por dato del contexto clínico desidentificado que `clinical-api` envió a Backend 2, en el orden de sus `dataRef`, con una etiqueta verbalizada por una función pura (`verbalizarDatoDelContexto()`) y `reviewStatus` y `conflict` copiados de la `provenance` del dato. La etiqueta SHALL NOT contener identidad del paciente, fechas absolutas ni el `pseudoPatientId` (RN-10, RN-11). Un dato `rechazado` o `reemplazado` SHALL NOT aparecer (RN-07).

#### Scenario: Dato sin verificar, conflicto y rechazados en la Base [US-066 AC-6] [FR-27] [RN-07]
- **GIVEN** FX-T1a-a: el paciente semilla (a) más Ki-67 `20 %` con `review_status = requiere_revision`, receptor de progesterona `negativo` `rechazado`, receptor de progesterona `positivo` `reemplazado` y receptor de estrógeno `90 %` `requiere_revision` con `conflicts_with_id` hacia el del seed
- **WHEN** se arma la Base de un análisis sobre ese paciente
- **THEN** el Ki-67 aparece en `patientDataUsed` con `reviewStatus = requiere_revision`
- **AND** el receptor de estrógeno `90 %` aparece con `conflict = true`
- **AND** ninguna entrada corresponde a un receptor de progesterona

#### Scenario: Las etiquetas no llevan identidad (asumido) [RN-10]
- **GIVEN** el paciente semilla (a) con nombre y documento sintéticos conocidos
- **WHEN** se arma la Base de un análisis sobre ese paciente
- **THEN** ninguna `label` de `patientDataUsed` contiene el nombre, el número de documento, una fecha `AAAA-MM-DD` ni el `pseudoPatientId` de la consulta

### Requirement: La Base es determinista
`AnalysisBasisBuilder` MUST ser una función pura de la petición interna, la respuesta interna y `continueWithWarning`: sin reloj, sin generadores de identificadores y sin E/S. Dos ejecuciones con las mismas entradas SHALL producir salidas idénticas byte a byte (AC-T2.2).

#### Scenario: Mismas entradas, misma Base byte a byte [US-066 AC-4] [AC-T2.2] [FR-27]
- **GIVEN** el mismo `RagQueryInternalRequest` y la misma `RagQueryInternalResponse`
- **WHEN** `AnalysisBasisBuilder` se ejecuta dos veces
- **THEN** la serialización JSON de ambas salidas es idéntica byte a byte

### Requirement: La Base persistida es la Base respondida
El `analysis_basis` del `AIAnalysisRecord` MUST ser igual al `analysisBasis` de la respuesta, y se persiste antes de responder (RN-06).

#### Scenario: Base persistida e idéntica a la respuesta [US-066 AC-5] [AC-T2.4] [RN-06]
- **GIVEN** el análisis del escenario [US-066 AC-1]
- **WHEN** se lee `analysis_basis` del `AIAnalysisRecord` creado
- **THEN** es igual en profundidad al `analysisBasis` de la respuesta
