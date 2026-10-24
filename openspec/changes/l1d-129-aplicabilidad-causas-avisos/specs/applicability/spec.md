# Spec Delta — applicability (l1d-129)

## Purpose

Compara al paciente con la población de cada fuente recuperada, criterio a criterio y sin puntaje clínico,
para que el oncólogo vea qué coincide, qué no, qué se desconoce y por qué (FR-25, RN-28).

## ADDED Requirements

### Requirement: Criterio desconocido por dato ausente en el paciente
Cuando el dato de destino de un criterio figura en `clinicalContext.missingCriticalData` o no está en el contexto, `rag-orchestrator` MUST devolver el criterio con `status = desconocido`, `unknownReason = falta_en_paciente`, `patientValue = null` y `patientDataWarning = faltante`, sin inferir ni generar el valor (FR-25, ADR-34). `falta_en_paciente` SHALL prevalecer sobre `no_reportado_por_fuente` cuando la fuente tampoco reporta el dato (`[S3 resp. 16]`).

#### Scenario: Estado menopáusico ausente en A-M1 [US-124 AC-1]
- **GIVEN** el paciente A-M1 de FX-08b-a, sin estado menopáusico (llega en `missingCriticalData`), el catálogo `test-apl-1.0.0` y `doc-a1` recuperado
- **WHEN** se evalúa la aplicabilidad de `doc-a1`
- **THEN** `estado_menopausico` trae `status = desconocido`, `unknownReason = falta_en_paciente`, `patientValue = null` y `patientDataWarning = faltante` [AC-08.2] [AC-04.3]

### Requirement: Aviso del dato del paciente según su procedencia
Para cada criterio comparado con un dato del paciente, `patientDataWarning` MUST derivarse de la `provenance` de ese dato: `en_conflicto` si `conflict = true` (con precedencia sobre `sin_verificar`), `sin_verificar` si `reviewStatus = requiere_revision`, y `null` en otro caso. El aviso MUST NOT cambiar el `status` calculado ni bloquear el análisis (RN-26, RN-07).

#### Scenario: ECOG sin verificar conserva su estado calculado [US-124 AC-2]
- **GIVEN** A-M1 con ECOG 1 en `requiere_revision` y `doc-a1` (ECOG 0–1)
- **WHEN** se evalúa la aplicabilidad de `doc-a1`
- **THEN** `ecog` trae `status = coincide` y `patientDataWarning = sin_verificar` [AC-08.4]

#### Scenario: HER2 en conflicto sembrado [US-124 AC-3]
- **GIVEN** una variante de A-M1 cuyo seed sintético siembra dos HER2 en conflicto (`requiere_revision`, `conflicts_with_id` cruzados), de modo que ambos llegan al contexto con `provenance.conflict = true`
- **WHEN** se evalúa la aplicabilidad de `doc-a1`
- **THEN** `estado_her2` trae `patientDataWarning = en_conflicto` [AC-08.4] [AC-03.2]
- **AND** la respuesta es `200` (el aviso no bloquea) [RN-26]

### Requirement: Población no comparable por un criterio excluyente
`SourceApplicability.populationNotComparable` MUST ser `true` si y solo si al menos un criterio con `isExclusionary = true` queda en `no_coincide`; un excluyente en `desconocido` o `parcial` no la activa (AC-08.6).

#### Scenario: doc-a2 con HER2 negativo citado [US-124 AC-4]
- **GIVEN** A-M1 (HER2 positivo), `doc-a2` sin `population_criteria`, el LLM falso `APL-OK` que afirma "HER2 negativo" citando `ch-a2-1` y el NLI falso en `entailment`
- **WHEN** se evalúa la aplicabilidad de `doc-a2`
- **THEN** `estado_her2` queda `no_coincide` con `isExclusionary = true`
- **AND** `applicability[doc-a2].populationNotComparable = true` [AC-08.6]

### Requirement: Resumen por fuente como conteo de estados, nunca puntaje
`SourceApplicability.summary` MUST ser el conteo de criterios por estado (`coincide`, `parcial`, `noCoincide`, `desconocido`), cuya suma es el número de criterios del catálogo del tipo de cáncer; la respuesta MUST NOT incluir ningún campo numérico de puntaje, peso o porcentaje de aplicabilidad (RN-28).

#### Scenario: Conteo de A-M1 con doc-a1 [US-124 AC-5]
- **GIVEN** A-M1, `doc-a1` y `test-apl-1.0.0`
- **WHEN** se evalúa la aplicabilidad
- **THEN** `summary = { coincide: 3, parcial: 0, noCoincide: 0, desconocido: 2 }` y `populationNotComparable = false` [AC-08.5]
- **AND** la respuesta valida contra `RagQueryInternalResponse` sin ningún campo numérico de puntaje o porcentaje de aplicabilidad [RN-28]

### Requirement: Sin evidencia no hay aplicabilidad
Cuando ningún chunk supera `RELEVANCE_THRESHOLD`, la respuesta MUST traer `applicability = []` sin invocar al LLM ni calcular aplicabilidad (RN-02).

#### Scenario: Q-SIN sin aplicabilidad [US-124 AC-6]
- **GIVEN** la consulta `Q-SIN`, sin chunks sobre `RELEVANCE_THRESHOLD`
- **WHEN** se procesa `POST /rag/query`
- **THEN** `status = sin_evidencia`, `applicability = []` y el LLM falso registra cero invocaciones [RN-02]
