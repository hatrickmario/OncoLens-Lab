# Spec Delta — applicability (l1d-128-aplicabilidad-textual-citada)

## Purpose

Compara al paciente con la población de cada fuente recuperada, criterio a criterio del catálogo
versionado, sin puntaje clínico, y solo con valores del estudio copiados o verificados contra el texto.

## ADDED Requirements

### Requirement: Valor textual de la población aceptado solo con cita y soporte NLI
Para un criterio sin valor estructurado en `population_criteria`, el valor del estudio propuesto por el LLM MUST aceptarse solo si cita un chunk recuperado de esa fuente en esta consulta y el NLI da `entailment` ≥ `NLI_ENTAILMENT_THRESHOLD` con ese chunk como premisa (RN-01, ADR-34). El estado SHALL asignarlo la regla del catálogo sobre el valor aceptado; la cita MUST copiarse del corpus (RN-04).

#### Scenario: Un valor textual citado y soportado se acepta y la regla del catálogo da no_coincide [US-123 AC-1] [AC-08.3] [FR-25] [ADR-34]
- **GIVEN** el paciente A-M1, el catálogo `test-apl-1.0.0`, la fuente `doc-a2` sin `population_criteria` y recuperada sobre el umbral, el LLM falso `APL-OK` (afirma "HER2 negativo" citando `ch-a2-1`) y el NLI falso en `entailment` para "HER2 negativo" contra `ch-a2-1` (FX-08b-a)
- **WHEN** `POST /rag/query` evalúa la aplicabilidad de `doc-a2`
- **THEN** el criterio `estado_her2` de `applicability[doc-a2]` trae `studyPopulationValue = "HER2 negativo"`, `citedSources` con `ch-a2-1` y `status = no_coincide`
- **AND** el adapter NLI se invocó con el texto de `ch-a2-1` como premisa y "HER2 negativo" como hipótesis
- **AND** `patientValue` de `estado_her2` es "3+ (IHQ)", copiado del `clinicalContext`
- **AND** la respuesta valida contra `RagQueryInternalResponse` del `openapi.yaml` del proveedor

### Requirement: Valor textual sin soporte queda desconocido y se cuenta como omitido
Si el NLI no da `entailment` sobre el umbral para el valor propuesto, el criterio MUST quedar `desconocido` con `unknownReason = no_reportado_por_fuente`, `studyPopulationValue = null` y `citedSources = []`; el texto propuesto SHALL NOT aparecer en ningún campo de la respuesta y `omittedClaims` MUST sumar 1 (RN-01, FR-10, AC-T1.2).

#### Scenario: Una afirmación de población sin soporte se omite y suma a omittedClaims [US-123 AC-2] [AC-08.3] [HU-22] [RN-01]
- **GIVEN** A-M1, `test-apl-1.0.0`, `doc-a2`, el LLM falso `APL-SIN-SOPORTE` (afirma "estadio I–III" citando `ch-a2-1`) y el NLI falso en `neutral` para esa afirmación
- **WHEN** `POST /rag/query` evalúa el criterio `estadio` de `doc-a2`
- **THEN** `estadio` queda `status = desconocido` con `unknownReason = no_reportado_por_fuente` y `studyPopulationValue = null`
- **AND** el texto "estadio I–III" no aparece en ningún campo de la respuesta serializada
- **AND** `omittedClaims` es 1 mayor que en la misma consulta con un LLM falso que no propone nada para `estadio`

### Requirement: Valor textual con una cita fuera de la consulta queda desconocido
Una propuesta cuyo `chunkId` no es un chunk recuperado de esa fuente en esta consulta MUST rechazarse sin invocar al NLI: el criterio SHALL quedar `desconocido` con `unknownReason = no_reportado_por_fuente` y sin `citedSources` (RN-01, RN-04, AC-T1.2).

#### Scenario: Una propuesta que cita un chunk ajeno deja el criterio desconocido [US-123 AC-3] [RN-01] [AC-T1.2]
- **GIVEN** A-M1, `test-apl-1.0.0`, `doc-a2` y el LLM falso `APL-CITA-AJENA` (cita `ch-x-999`, no recuperado en esta consulta)
- **WHEN** `POST /rag/query` evalúa la aplicabilidad de `doc-a2`
- **THEN** el criterio propuesto queda `status = desconocido` con `unknownReason = no_reportado_por_fuente`, `studyPopulationValue = null` y `citedSources = []`
- **AND** `ch-x-999` no aparece en ningún campo de la respuesta
- **AND** el NLI no se invocó para esa propuesta
- **AND** `omittedClaims` suma 1 (asumido: la propuesta rechazada es una afirmación generada omitida, como en RN-01)

### Requirement: Sin propuesta del LLM el criterio textual nunca se infiere
Un criterio sin valor estructurado sobre el que el LLM no propone nada MUST quedar `desconocido` con `unknownReason = no_reportado_por_fuente` (salvo `falta_en_paciente`, precedencia de l1d-127 D5) y `studyPopulationValue = null`; el sistema SHALL NOT inferir un valor por defecto, por otra fuente ni por el valor del paciente (FR-25, AC-08.3, RN-25).

#### Scenario: Un criterio sobre el que el LLM calla queda desconocido [US-123 AC-4] [AC-08.3] [FR-25]
- **GIVEN** A-M1, `test-apl-1.0.0`, `doc-a2` y un LLM falso de aplicabilidad que no propone nada para `linea_tratamiento`
- **WHEN** `POST /rag/query` evalúa la aplicabilidad de `doc-a2`
- **THEN** `linea_tratamiento` queda `status = desconocido` con `unknownReason = no_reportado_por_fuente`, `studyPopulationValue = null` y `citedSources = []`
- **AND** `omittedClaims` no cambia por ese criterio

### Requirement: `studyPopulationValue` es un campo generado para RN-23
`studyPopulationValue` MUST figurar en `camposGenerados` de `@oncolens/clinical-language` (`origen-de-campos.json`) y en `CAMPOS_GENERADOS` de `rag-orchestrator`, y ambas listas SHALL coincidir; el filtro de términos prohibidos del camino textual MUST revisarlo como campo generado (RN-23, `[S3 resp. 16]`).

#### Scenario: La lista de campos generados incluye studyPopulationValue en ambos backends [RN-23] [S3 resp. 16]
- **GIVEN** `packages/clinical-language/origen-de-campos.json` y `CAMPOS_GENERADOS` de `app/domain/support.py`
- **WHEN** corre el test de coherencia de L1D-180
- **THEN** ambas listas contienen `studyPopulationValue` y son iguales

### Requirement: La versión del prompt de aplicabilidad queda registrada con la del generador
Cuando el camino textual invoca al LLM de aplicabilidad, `meta.promptVersion` MUST llevar la versión del generador y la del prompt de aplicabilidad en un solo token (`<generador>+aplicabilidad-texto@<versión>`), y el log del análisis SHALL registrar la de aplicabilidad; sin cambio de contrato (`[S3 resp. 16]`). Si no se invoca, `meta.promptVersion` MUST ser solo la del generador.

#### Scenario: Un análisis con camino textual reporta ambas versiones del prompt [FR-25] [S3 resp. 16]
- **GIVEN** A-M1, `test-apl-1.0.0`, `doc-a2`, `APL-OK` y el NLI falso en `entailment` (FX-08b-a)
- **WHEN** `POST /rag/query` evalúa la aplicabilidad de `doc-a2`
- **THEN** `meta.promptVersion` es la versión del generador seguida de `+aplicabilidad-texto@0.1.0`, sin espacios
- **AND** el log del análisis registra `applicabilityPromptVersion = aplicabilidad-texto@0.1.0` sin el valor propuesto ni el texto del chunk
- **AND** la respuesta valida contra `RagQueryInternalResponse` del `openapi.yaml` del proveedor

#### Scenario: Sin camino textual la versión es solo la del generador [S3 resp. 16]
- **GIVEN** A-M1, `test-apl-1.0.0` y solo `doc-a1`, con todos sus criterios estructurados
- **WHEN** `POST /rag/query` procesa el análisis
- **THEN** `meta.promptVersion` es la del generador, sin sufijo de aplicabilidad

### Requirement: NLI no disponible durante la aplicabilidad falla cerrado
Si el adapter NLI lanza un error o no responde al validar una propuesta de aplicabilidad, `POST /rag/query` MUST responder `503` con `error = "NLI_UNAVAILABLE"` (schema `ErrorNliNoDisponible`) y SHALL NOT devolver ninguna aplicabilidad, opción ni respuesta parcial sin validar (RN-01, RN-12: sin *fallback*).

#### Scenario: Un fallo del NLI en la aplicabilidad responde 503 sin aplicabilidad [US-123 AC-5] [RN-01] (asumido: falla cerrada, igual que US-064 AC-6)
- **GIVEN** A-M1, `test-apl-1.0.0`, `doc-a2`, `APL-OK` y el adapter NLI falso configurado para lanzar un error al validar la propuesta de aplicabilidad
- **WHEN** `POST /rag/query` procesa el análisis
- **THEN** la respuesta es `503` con `error = "NLI_UNAVAILABLE"`, `message` y `traceId`
- **AND** el cuerpo no contiene `applicability`, `evidenceOptions` ni el texto "HER2 negativo"
- **AND** la respuesta valida contra el `503` de `/rag/query` del `openapi.yaml` del proveedor
