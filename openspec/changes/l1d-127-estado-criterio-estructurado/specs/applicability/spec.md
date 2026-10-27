# Spec Delta — applicability

## Purpose

Compara, criterio a criterio y sin ningún puntaje clínico, la población de cada fuente recuperada con los datos
del paciente, para que el oncólogo vea en qué coincide, en qué no y qué se desconoce (FR-25, RN-28).

## ADDED Requirements

### Requirement: Aplicabilidad por fuente recuperada con los criterios del catálogo
Con `status = con_evidencia`, `POST /rag/query` MUST devolver en `applicability` un `SourceApplicability` por cada documento con chunks sobre el umbral en esa consulta, con un `ApplicabilityCriterion` por cada criterio de aplicabilidad del catálogo clínico del tipo de cáncer, en el orden del catálogo. Un documento con `metadata_source = pendiente` SHALL omitirse. Si el catálogo no declara criterios para el tipo, `applicability` SHALL ser `[]`.

#### Scenario: Una fuente estructurada compatible trae sus criterios en coincide con los valores copiados [US-122 AC-1] [AC-08.1] [AC-08.9] [HU-22]
- **GIVEN** el catálogo de test `test-apl-1.0.0` (mama) montado, el paciente sintético A-M1 (HER2 "3+ (IHQ)" `verificado`, `TNM_8` "IIA" `verificado`, ECOG 1 con `performanceScale = ECOG`, un tratamiento previo con `lineNumber = 1`, sin `estado_menopausico`) y `doc-a1` con `metadata_source = fuente_estructurada` y `population_criteria` en la forma real de L1D-117: `biomarcadores = {"her2": "positivo"}`, `estadio = "I–III"`, `ecog = "0-1"` y `linea = "no_disponible"` (FX-08b-a), con adapters falsos
- **WHEN** `clinical-api` envía a `POST /rag/query` una consulta cuyo único documento sobre el umbral es `doc-a1`
- **THEN** responde `200` con `status = con_evidencia` y `applicability` con un elemento de `externalId` igual al de `doc-a1`
- **AND** su criterio `estado_her2` trae `patientValue = "3+ (IHQ)"`, `studyPopulationValue = "positivo"` (copiado literal), `status = coincide`, `isExclusionary = true` y `citedSources` con la fuente `doc-a1`
- **AND** `ecog` trae `patientValue = "1"`, `studyPopulationValue = "0-1"` y `status = coincide`
- **AND** `estadio`, rango sin escala ordenada en el catálogo, trae `patientValue = "IIA"`, `studyPopulationValue = "I–III"`, `status = desconocido` y `unknownReason = null` (alcance del S3 declarado)
- **AND** `linea_tratamiento`, que `doc-a1` no reporta, trae `patientValue = "1"`, `status = desconocido`, `unknownReason = no_reportado_por_fuente` y `studyPopulationValue = null`
- **AND** `estado_menopausico`, ausente en A-M1, trae `patientValue = null`, `status = desconocido` y `unknownReason = falta_en_paciente`
- **AND** la respuesta valida contra `RagQueryInternalResponse` del `openapi.yaml` del proveedor

#### Scenario: Un documento con metadata_source pendiente se omite de applicability [US-122 AC-5] [RN-25] (decidido, usuario, 2026-10-27)
- **GIVEN** FX-08b-a, A-M1, `doc-a1` estructurado y `doc-a6` con `metadata_source = pendiente` (todos sus criterios de población `no_disponible`), ambos con chunks sobre el umbral
- **WHEN** se procesa la consulta
- **THEN** `applicability` trae un único elemento, el de `doc-a1`, y ninguno con el `externalId` de `doc-a6`
- **AND** el lector de población y la respuesta admiten el valor `pendiente` y la respuesta valida contra `RagQueryInternalResponse`

### Requirement: Valor del paciente copiado literalmente del contexto clínico
`patientValue` de cada criterio MUST ser copia literal del valor del `clinicalContext` recibido, tomado del `destination` del criterio en el catálogo (ADR-34 b, design D3); ningún modelo SHALL producirlo ni corregirlo. Sin valor en ese destino, `patientValue = null` y el criterio es `desconocido` con `falta_en_paciente`, que prevalece sobre `no_reportado_por_fuente`.

#### Scenario: El valor del paciente no cambia aunque el LLM falso afirme otro [US-122 AC-2] [AC-08.9] [M-08.6] [ADR-34]
- **GIVEN** FX-08b-a, A-M1 con HER2 "3+ (IHQ)" en `clinicalContext.biomarkers` y el LLM falso `APL-VALOR-PACIENTE`, cuya salida atribuye al paciente el valor `"2+"` para `estado_her2`
- **WHEN** se procesa la consulta que recupera `doc-a1`
- **THEN** `estado_her2.patientValue = "3+ (IHQ)"`, igual al valor del `clinicalContext` enviado
- **AND** ninguna parte de `applicability` contiene "2+"

#### Scenario: Un criterio con lista copia los valores rotulados y una escala de ECOG distinta no se copia [US-122 AC-2] [ADR-34] (asumido)
- **GIVEN** un catálogo de test propio con el criterio `receptores_hormonales` (`match.name = ["RE", "RP"]`) y `ecog` con `match.performance_scale = ECOG`; un paciente con biomarcadores `RE` "Positivo (80%)" y `RP` "Negativo", y otro con solo `RE`; un tercero con `performanceScale = "Karnofsky"` y `performanceValue = 80`
- **WHEN** se evalúa cada paciente contra un documento estructurado
- **THEN** el primero trae `patientValue = "RE: Positivo (80%); RP: Negativo"` y `status = desconocido`
- **AND** el segundo trae `patientValue = null`, `status = desconocido` y `unknownReason = falta_en_paciente`
- **AND** el tercero trae en `ecog` `patientValue = null`, `status = desconocido` y `unknownReason = falta_en_paciente`

### Requirement: Estado por criterio calculado con la regla declarativa del catálogo
Con valor del paciente y valor estructurado del estudio, `status` MUST ser el que resulta de aplicar la `rule` del criterio en el catálogo (igualdad, pertenencia a una lista o rango, con su condición de "Parcial"): `coincide`, `parcial` o `no_coincide`. La regla SHALL ser dato del catálogo, no código, y no producir ningún puntaje ni ponderación (RN-28).

#### Scenario: Un estudio con HER2 negativo deja estado_her2 en no_coincide [US-122 AC-3] [FR-25]
- **GIVEN** FX-08b-a, A-M1 (HER2 "3+ (IHQ)", categoría `positivo` por prefijo exacto sobre `rule.equivalences`) y `doc-a4`, estructurado con `biomarcadores = {"her2": "negativo"}`
- **WHEN** se evalúa `doc-a4`
- **THEN** su criterio `estado_her2` trae `status = no_coincide`, `studyPopulationValue = "negativo"` (copiado de `population_criteria` de `doc-a4`) y `isExclusionary = true`

#### Scenario: ECOG reportado solo para un subgrupo deja ecog en parcial [US-122 AC-4] [FR-25] [DEC-11]
- **GIVEN** FX-08b-a, A-M1 (ECOG 1) y `doc-a5`, estructurado con `ecog = {"valor": "0-1", "alcance": "subgrupo"}` (forma de Q2, solo en el fixture: la ingesta de L1D-117 no la produce hasta US-118)
- **WHEN** se evalúa `ecog` de `doc-a5`
- **THEN** trae `status = parcial`, `studyPopulationValue = "0-1"`, según la condición `solo_subgrupo` del criterio en `test-apl-1.0.0`
- **AND** `rango_solapado` no produce `parcial` en el S3 (el paciente aporta un valor puntual): un unitario lo fija

### Requirement: Valor del estudio copiado de la fuente o desconocido sin inferencia
`studyPopulationValue` MUST copiarse carácter a carácter de `population_criteria`, bajo el `studyKey` del criterio (RN-25, design D4), sin reformular ni normalizar. Sin valor estructurado SHALL ser `null` y el criterio `desconocido` con `no_reportado_por_fuente` (salvo `falta_en_paciente`). Si la lectura falla, MUST responder `503 RETRIEVAL_UNAVAILABLE`.

#### Scenario: Un documento sin información de población deja todos los criterios desconocidos [US-122 AC-5] [AC-08.3] [RN-25]
- **GIVEN** FX-08b-a, A-M1 y `doc-a3`, con `metadata_source = fuente_estructurada` y sus seis claves de población en `no_disponible` (y `biomarcadores` como cadena `no_disponible`, forma de la semilla)
- **WHEN** se evalúa `doc-a3`
- **THEN** cada uno de sus criterios trae `status = desconocido` y `studyPopulationValue = null`
- **AND** cada criterio con dato en el paciente (`estado_her2`, `estadio`, `ecog`, `linea_tratamiento`) trae `unknownReason = no_reportado_por_fuente`, salvo dato faltante (US-124): `estado_menopausico`, ausente en A-M1, trae `unknownReason = falta_en_paciente` [S3 resp. 16]
- **AND** ninguno trae un valor del estudio distinto de `null`

### Requirement: Cálculo estructurado determinista y sin LLM
Para los criterios con valor estructurado, el cálculo MUST ser una función pura de la versión del catálogo, el `clinicalContext` y `population_criteria`: la misma entrada SHALL dar exactamente la misma `applicability`, y el LLM no se invoca para ningún criterio estructurado (ADR-34).

#### Scenario: Calcular dos veces da el mismo resultado y el LLM solo se invoca para la generación [US-122 AC-6] [AC-08.9] [ADR-34]
- **GIVEN** FX-08b-a, A-M1, `doc-a1` y el LLM falso con contador de invocaciones
- **WHEN** se procesa dos veces la misma consulta
- **THEN** las dos `applicability` son idénticas campo a campo
- **AND** el LLM falso registra exactamente una invocación por consulta, la de la generación de opciones, igual que con un catálogo sin criterios de aplicabilidad

<!-- Regresiones anotadas (no son escenarios de este change):
- Regresión [RN-28] conteos sin puntaje y `populationNotComparable` activa desde S3 en US-124 (AC-4, AC-5).
- Regresión [RN-26] `patientDataWarning` (sin_verificar, en_conflicto, faltante) activa desde S3 en US-124 (AC-1…AC-3).
- Regresión [RN-01] valor del estudio textual con cita y NLI activa desde S3 en US-123.
- Regresión [RN-02] `applicability = []` sin evidencia activa desde S3 en US-124 AC-6.
- Regresión [RN-25] valor del estudio copiado activa desde S3 en US-127.
- Alcance del S3 declarado (no son escenarios): `estado_castracion` e `isup` siempre `desconocido` (la ingesta no los extrae y `poblacion.json` no se lee aquí hasta US-122/US-118); `populationNotComparable` nunca sale en próstata; `applicability[]` ordenado por relevancia, sin significado clínico (rótulo de US-126).
-->
