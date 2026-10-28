# applicability Specification

## Purpose
Compara, criterio a criterio y sin ningún puntaje clínico, la población de cada fuente recuperada con los datos
del paciente, para que el oncólogo vea en qué coincide, en qué no y qué se desconoce (FR-25, RN-28).

## Requirements

### Requirement: Aplicabilidad por fuente recuperada con los criterios del catálogo
Con `status = con_evidencia`, `POST /rag/query` MUST devolver en `applicability` un `SourceApplicability` por cada documento con chunks sobre el umbral en esa consulta, con un `ApplicabilityCriterion` por cada criterio de aplicabilidad del catálogo clínico del tipo de cáncer, en el orden del catálogo. Si el catálogo no declara criterios para el tipo, `applicability` SHALL ser `[]`. Un documento con `metadata_source = pendiente` SHALL incluirse.

#### Scenario: Una fuente estructurada compatible trae sus criterios en coincide con los valores copiados [US-122 AC-1] [AC-08.1] [AC-08.9] [HU-22]
- **GIVEN** el catálogo de test `test-apl-1.0.0` (mama) montado, el paciente sintético A-M1 (HER2 "3+ (IHQ)" `verificado`, `TNM_8` "IIA" `verificado`, ECOG 1 con `performanceScale = ECOG`, un tratamiento previo con `lineNumber = 1`, sin `estado_menopausico`) y `doc-a1` con `metadata_source = fuente_estructurada` y `population_criteria` en la forma real de L1D-117: `biomarcadores = {"her2": "positivo"}`, `estadio = "I–III"`, `ecog = "0-1"` y `linea = "no_disponible"` (FX-08b-a), con adapters falsos
- **WHEN** `clinical-api` envía a `POST /rag/query` una consulta cuyo único documento sobre el umbral es `doc-a1`
- **THEN** responde `200` con `status = con_evidencia` y `applicability` con un elemento de `externalId` igual al de `doc-a1`
- **AND** su criterio `estado_her2` trae `patientValue = "3+ (IHQ)"`, `studyPopulationValue = "positivo"` (copiado literal), `status = coincide`, `isExclusionary = true` y `citedSources` con la fuente `doc-a1`
- **AND** `ecog` trae `patientValue = "1"`, `studyPopulationValue = "0-1"` y `status = coincide`
- **AND** `estadio`, rango sin escala ordenada en el catálogo, trae `patientValue = "IIA"`, `studyPopulationValue = "I–III"`, `status = desconocido`, `unknownReason = null` y `citedSources` con la fuente `doc-a1` (todo valor del estudio mostrado lleva cita, RN-25; alcance del S3 declarado)
- **AND** `linea_tratamiento`, que `doc-a1` no reporta, trae `patientValue = "1"`, `status = desconocido`, `unknownReason = no_reportado_por_fuente` y `studyPopulationValue = null`
- **AND** `estado_menopausico`, ausente en A-M1, trae `patientValue = null`, `status = desconocido` y `unknownReason = falta_en_paciente`
- **AND** la respuesta valida contra `RagQueryInternalResponse` del `openapi.yaml` del proveedor

#### Scenario: Un documento con metadata_source pendiente entra por el camino textual y calla desconocido [US-123 AC-4] [US-122 AC-5] [RN-25] (decidido, usuario, 2026-10-27)
- **GIVEN** FX-08b-a, A-M1, `doc-a1` estructurado y `doc-a6` con `metadata_source = pendiente` (todos sus criterios de población `no_disponible`), ambos con chunks sobre el umbral, y un LLM falso de aplicabilidad que no propone nada
- **WHEN** se procesa la consulta
- **THEN** `applicability` trae un elemento por cada uno, el de `doc-a6` con todos sus criterios `desconocido` y `studyPopulationValue = null`
- **AND** cada criterio de `doc-a6` con dato en el paciente trae `unknownReason = no_reportado_por_fuente` y `estado_menopausico` trae `falta_en_paciente`
- **AND** `omittedClaims` no cambia (el LLM no afirmó nada) y la respuesta valida contra `RagQueryInternalResponse`

#### Scenario: Un documento pendiente se incluye con criterios pendientes del camino textual [US-122 AC-5] [RN-25] (decidido, usuario, 2026-10-27: antes se omitía)
- **GIVEN** un documento con `metadata_source = pendiente` con chunks sobre el umbral
- **WHEN** se procesa la consulta
- **THEN** el documento se incluye en `applicability` con todos sus criterios pendientes del camino textual

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
`studyPopulationValue` MUST copiarse carácter a carácter de `population_criteria` del documento, bajo el `studyKey` del criterio (RN-25, AC-08.9), sin reformular, traducir, normalizar ni completar. Sin valor estructurado (ausente o `no_disponible`) SHALL ser `null` y el criterio `desconocido` con `no_reportado_por_fuente`, salvo dato faltante en el paciente (`falta_en_paciente`, `[S3 resp. 16]`). Si la lectura falla, MUST responder `503 RETRIEVAL_UNAVAILABLE`.

#### Scenario: Un documento sin información de población deja todos los criterios desconocidos [US-122 AC-5] [AC-08.3] [RN-25]
- **GIVEN** FX-08b-a, A-M1 y `doc-a3`, sin información de población
- **WHEN** se evalúa `doc-a3`
- **THEN** cada uno de sus criterios trae `status = desconocido` y `studyPopulationValue = null`
- **AND** cada criterio con dato en el paciente trae `unknownReason = no_reportado_por_fuente`, salvo dato faltante (US-124): `estado_menopausico`, ausente en A-M1, trae `unknownReason = falta_en_paciente` [S3 resp. 16]
- **AND** ninguno trae un valor del estudio distinto de `null`

#### Scenario: El valor del estudio es el texto del catálogo sin reformular [US-127 AC-4] [AC-08.9] [RN-25]
- **GIVEN** FX-08b-a: catálogo clínico `test-apl-1.0.0`, paciente A-M1 y `doc-a1` con `population_criteria` estructurado sembrado en el schema `corpus` de test, y un generador falso cuya opción cita un chunk de `doc-a1`
- **WHEN** `POST /rag/query` arma la aplicabilidad
- **THEN** en `applicability` de `doc-a1`, el `studyPopulationValue` de cada criterio con valor estructurado es idéntico (misma cadena, mismas mayúsculas, tildes y signos, por ejemplo "I–III" con su raya) al texto de `population_criteria` de `doc-a1` para ese criterio
- **AND** ningún `studyPopulationValue` contiene texto del generador falso ni el `patientValue` del criterio
- **AND** la respuesta valida contra `RagQueryInternalResponse` del `openapi.yaml` del proveedor

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

### Requirement: Criterio desconocido por dato ausente en el paciente
Cuando la clave de un criterio figura en `clinicalContext.missingCriticalData` o su dato de destino no está en el contexto, `rag-orchestrator` MUST devolver el criterio con `status = desconocido`, `unknownReason = falta_en_paciente`, `patientValue = null` y `patientDataWarning = faltante`, sin inferir ni generar el valor (FR-25, ADR-34). `falta_en_paciente` SHALL prevalecer sobre `no_reportado_por_fuente` cuando la fuente tampoco reporta el dato (`[S3 resp. 16]`).

#### Scenario: Estado menopáusico ausente en A-M1 [US-124 AC-1]
- **GIVEN** el paciente A-M1 de FX-08b-a, sin estado menopáusico (llega en `missingCriticalData`), el catálogo `test-apl-1.0.0` y `doc-a1` recuperado
- **WHEN** se evalúa la aplicabilidad de `doc-a1`
- **THEN** `estado_menopausico` trae `status = desconocido`, `unknownReason = falta_en_paciente`, `patientValue = null` y `patientDataWarning = faltante` [AC-08.2] [AC-04.3]

### Requirement: Desconocido sin causa cuando el dato no falta
Un criterio `desconocido` cuyo motivo no es la ausencia del dato en el paciente ni en la fuente (valor no comparable, estadio sin escala ordenada) MUST llevar `unknownReason = null`: la causa solo toma los dos valores del contrato.

#### Scenario: Estadio de A-M1 sin escala ordenada
- **GIVEN** A-M1 con estadio «IIA» y `doc-a1` con estadio «I–III»
- **WHEN** se evalúa la aplicabilidad de `doc-a1`
- **THEN** `estadio` trae `status = desconocido` y `unknownReason = null`

### Requirement: Aviso del dato del paciente según su procedencia
Para cada criterio comparado con un dato del paciente, `patientDataWarning` MUST derivarse de la `provenance` del dato cuyo valor se copia en `patientValue`: `en_conflicto` si `conflict = true` (con precedencia sobre `sin_verificar`), `sin_verificar` si `reviewStatus = requiere_revision`, y `null` en otro caso; en un destino compuesto (RE/RP) rige la misma precedencia sobre sus componentes. El aviso MUST NOT cambiar el `status` calculado ni bloquear el análisis (RN-26, RN-07).

#### Scenario: ECOG sin verificar conserva su estado calculado [US-124 AC-2]
- **GIVEN** A-M1 con ECOG 1 en `requiere_revision` y `doc-a1` (ECOG 0–1)
- **WHEN** se evalúa la aplicabilidad de `doc-a1`
- **THEN** `ecog` trae `status = coincide` y `patientDataWarning = sin_verificar` [AC-08.4]

#### Scenario: Paridad con la etiqueta de procedencia del prompt [RN-07]
- **GIVEN** cada combinación de `reviewStatus` y `conflict` de una `provenance`
- **WHEN** se calcula `patientDataWarning` y, del lado del prompt, `etiqueta_de_procedencia`
- **THEN** `en_conflicto` corresponde a «(en conflicto)», `sin_verificar` a «(sin verificar)» y `null` a ninguna etiqueta, en las mismas combinaciones

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
- **THEN** `summary = { coincide: 2, parcial: 0, noCoincide: 0, desconocido: 3 }` y `populationNotComparable = false` [AC-08.5]
- **AND** la suma del `summary` es 5, el número de criterios de `test-apl-1.0.0`
- **AND** la respuesta valida contra `RagQueryInternalResponse` sin ningún campo numérico de puntaje o porcentaje de aplicabilidad [RN-28]

### Requirement: Sin evidencia no hay aplicabilidad
Cuando ningún chunk supera `RELEVANCE_THRESHOLD`, la respuesta MUST traer `applicability = []` sin invocar al LLM ni calcular aplicabilidad (RN-02).

#### Scenario: Q-SIN sin aplicabilidad [US-124 AC-6]
- **GIVEN** la consulta `Q-SIN`, sin chunks sobre `RELEVANCE_THRESHOLD`
- **WHEN** se procesa `POST /rag/query`
- **THEN** `status = sin_evidencia`, `applicability = []` y el LLM falso registra cero invocaciones [RN-02]

### Requirement: Una opción hereda la aplicabilidad de su fuente más aplicable
Con aplicabilidad calculada, cada opción validada MUST llevar en `applicabilitySummary` el `summary` de su
fuente citada más aplicable (comparador de RN-28) y en `perSource` una entrada por cada fuente citada, con su
propio `summary` y `populationNotComparable` (ADR-31). La relevancia de una fuente SHALL ser el mayor
`relevanceScore` de sus chunks citados por la opción (asumido). Ningún campo es un puntaje (RN-28).

#### Scenario: La opción con una fuente comparable y otra no comparable toma el resumen de la comparable [US-125 AC-1] [AC-08.8]
- **GIVEN** A-M1, el catálogo `test-apl-1.0.0` y una opción validada que cita `doc-a1` (0 excluyentes en No coincide, `{ coincide: 2, parcial: 0, noCoincide: 0, desconocido: 3 }`) y `doc-a2` (1 excluyente en No coincide)
- **WHEN** se agrega la aplicabilidad de la opción
- **THEN** `applicabilitySummary` es igual al `summary` de `doc-a1`
- **AND** `perSource` trae exactamente `doc-a1` y `doc-a2`, cada una con su propio `summary` y su `populationNotComparable` (`false` y `true`)
- **AND** la opción tiene `populationNotComparable = false` y `warnings` no incluye `poblacion_no_comparable`

#### Scenario: A igualdad de conteos la fuente más aplicable es la de mayor relevancia [US-125 AC-3] [RN-28] [RN-03]
- **GIVEN** una opción que cita dos fuentes con el mismo número de excluyentes en No coincide y el mismo número en Coincide, con relevancias 0,70 y 0,60
- **WHEN** se agrega la aplicabilidad de la opción
- **THEN** `applicabilitySummary` es el de la fuente con relevancia 0,70
- **AND** `perSource` conserva ambas fuentes

### Requirement: Una opción es de población no comparable solo si todas sus fuentes lo son
Una opción MUST tener `populationNotComparable = true` si y solo si todas las fuentes que cita tienen
`populationNotComparable = true` (un criterio excluyente en `no_coincide`), y en ese caso `warnings` MUST
incluir `poblacion_no_comparable` una sola vez (readme §4.1, ADR-31). El aviso no bloquea: la opción se
devuelve igual (RN-26).

#### Scenario: Todas las fuentes no comparables marcan la opción y su aviso [US-125 AC-2] [AC-08.8]
- **GIVEN** una opción validada cuyas dos fuentes citadas tienen un criterio excluyente en `no_coincide`
- **WHEN** se agrega la aplicabilidad de la opción
- **THEN** la opción tiene `populationNotComparable = true`
- **AND** `warnings` incluye `poblacion_no_comparable` exactamente una vez
- **AND** la opción sigue en `evidenceOptions` si el recorte la conserva (el aviso no la descarta)

### Requirement: Comparador de aplicabilidad determinista y sin puntaje combinado
La aplicabilidad relativa de fuentes u opciones MUST decidirse con un orden lexicográfico fijo y total
(RN-28, ADR-27): menos excluyentes en `no_coincide` → más `coincide` → mayor `relevanceScore` (RN-03) →
menor identificador estable (`externalId` o `chunkId` de la cita principal; asumido). SHALL ser
independiente del orden de entrada y nunca un puntaje combinado; `parcial` y `desconocido` no ordenan (asumido).

#### Scenario: La tabla de casos del comparador devuelve el orden esperado [US-125 AC-4] [RN-28] [ADR-27]
- **GIVEN** la tabla de casos del comparador: (a) 0 frente a 1 excluyente en No coincide con relevancia 0,50 frente a 0,95; (b) igual excluyentes y 3 frente a 2 en Coincide con relevancia 0,40 frente a 0,90; (c) igual excluyentes e igual Coincide con relevancia 0,70 frente a 0,60; (d) todo igual con identificadores `b` y `a`
- **WHEN** se evalúa la función pura con cada caso en ambos órdenes de entrada
- **THEN** gana, en cada caso, (a) la de 0 excluyentes, (b) la de 3 en Coincide, (c) la de 0,70 y (d) la de identificador `a`
- **AND** el resultado es el mismo para cualquier orden de entrada

#### Scenario: El comparador no admite un puntaje combinado [US-125 AC-4] [RN-28]
- **GIVEN** dos entradas en las que una suma ponderada de conteos y relevancia invertiría el orden (0 excluyentes, 0 Coincide, relevancia 0,10 frente a 1 excluyente, 5 Coincide, relevancia 0,99)
- **WHEN** se evalúa la función pura
- **THEN** gana la de 0 excluyentes
- **AND** la clave de orden expuesta por el comparador es una tupla de los conteos y la relevancia, sin ningún valor derivado de combinarlos

#### Scenario: Una opción sin ninguna fuente evaluada se agrega en cero y no falla [RN-28] [RN-26]
- **GIVEN** una opción validada cuyas fuentes citadas no tienen entrada en `applicability` (documento sin población o con origen no declarado)
- **WHEN** se agrega la aplicabilidad de la opción
- **THEN** `applicabilitySummary` es `{ coincide: 0, parcial: 0, noCoincide: 0, desconocido: 0 }`, `perSource` es `[]` y `populationNotComparable` es `false`
- **AND** `warnings` no incluye `poblacion_no_comparable`

### Requirement: Valor textual de la población aceptado solo con cita y soporte NLI
Para un criterio sin valor estructurado en `population_criteria`, el valor del estudio propuesto por el LLM MUST aceptarse solo si cita un chunk recuperado de esa fuente en esta consulta y el NLI da `entailment` ≥ `NLI_ENTAILMENT_THRESHOLD` con ese chunk como premisa (RN-01, ADR-34). El estado SHALL asignarlo la regla del catálogo sobre el valor aceptado; la cita MUST copiarse del corpus (RN-04).

#### Scenario: Un valor textual citado y soportado se acepta y la regla del catálogo da no_coincide [US-123 AC-1] [AC-08.3] [FR-25] [ADR-34]
- **GIVEN** el paciente A-M1, el catálogo `test-apl-1.0.0`, la fuente `doc-a2` (guía con `metadata_source = pendiente`, sin población extraída, con el chunk `ch-a2-1`: "This guidance applies to patients with HER2-negative disease") recuperada sobre el umbral, el LLM falso `APL-OK` (afirma "HER2 negativo" citando `ch-a2-1`) y el NLI falso en `entailment` para "HER2 negativo" contra `ch-a2-1` (FX-08b-a)
- **WHEN** `POST /rag/query` evalúa la aplicabilidad de `doc-a2`
- **THEN** el criterio `estado_her2` de `applicability[doc-a2]` trae `studyPopulationValue = "HER2 negativo"`, `citedSources` con `ch-a2-1` y `status = no_coincide`
- **AND** el adapter NLI se invocó con el texto de `ch-a2-1` como premisa y "Estado de HER2: HER2 negativo" (etiqueta del criterio y valor) como hipótesis
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
- **GIVEN** A-M1, `test-apl-1.0.0` y una única fuente recuperada con los cinco criterios de población estructurados (fixture propia; `doc-a1` no reporta `linea` y la llamaría)
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
