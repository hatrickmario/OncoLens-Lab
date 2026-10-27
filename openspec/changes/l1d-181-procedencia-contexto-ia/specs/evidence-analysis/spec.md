## ADDED Requirements

### Requirement: El prompt etiqueta los datos del paciente sin verificar o en conflicto
El bloque de datos del paciente del prompt `rag-query@0.4.0` (`[S3 resp. 15]`) MUST etiquetar con "(sin verificar)" el dato `requiere_revision` y con "(en conflicto)", con precedencia (asumido), el dato con `provenance.conflict = true`; un dato verificado SHALL NOT llevar etiqueta y el texto embebido para la recuperación MUST NOT cambiar (RN-07).

#### Scenario: El Ki-67 sin verificar aparece etiquetado en el bloque de datos del paciente [US-065 AC-5] [RN-07] (asumido: texto de la etiqueta)
- **GIVEN** un `clinicalContext` con el Ki-67 `20 %` en `provenance.reviewStatus = requiere_revision` y el resto de los datos `verificado`
- **WHEN** `rag-orchestrator` arma el prompt de `/rag/query`
- **THEN** dentro del bloque de datos del paciente el Ki-67 `20 %` aparece acompañado de "(sin verificar)"
- **AND** ningún dato `verificado` del bloque lleva "(sin verificar)" ni "(en conflicto)"

#### Scenario: El dato en conflicto aparece etiquetado como en conflicto [US-065 AC-5] [RN-07] (asumido: etiqueta de conflicto y precedencia)
- **GIVEN** un `clinicalContext` con el receptor de estrógeno `90 %` en `requiere_revision` y `provenance.conflict = true`
- **WHEN** `rag-orchestrator` arma el prompt de `/rag/query`
- **THEN** el receptor de estrógeno `90 %` aparece acompañado de "(en conflicto)" y no de "(sin verificar)"

#### Scenario: El texto embebido para la recuperación no lleva etiquetas [US-065 AC-5] [RN-07]
- **GIVEN** el mismo `clinicalContext` con el Ki-67 en `requiere_revision`
- **WHEN** se calcula el resumen del contexto clínico que se embebe junto con la pregunta
- **THEN** el resumen es idéntico al de un contexto con el Ki-67 `verificado` y no contiene "(sin verificar)" ni "(en conflicto)"

### Requirement: En el S3 solo el diagnóstico y los biomarcadores se etiquetan en el prompt
Atributos, tratamientos previos y eventos MUST NOT etiquetarse en el bloque de datos del paciente del prompt en el S3 (Non-Goal explícito, decidido 2026-10-27); su `provenance` viaja en el payload.

#### Scenario: Los atributos, tratamientos y eventos no entran al bloque etiquetado [US-065 AC-5] [RN-07] (asumido: Non-Goal del S3)
- **GIVEN** un `clinicalContext` con un atributo, un tratamiento previo y un evento en `requiere_revision`
- **WHEN** `rag-orchestrator` arma el bloque de datos del paciente del prompt
- **THEN** el bloque no contiene ni el atributo, ni el tratamiento, ni el evento, ni la etiqueta "(sin verificar)" por ellos

### Requirement: Las etiquetas de procedencia del prompt no introducen lenguaje prescriptivo
El bloque de datos del paciente y sus etiquetas MUST NOT contener ningún `terminos` del nivel A ni `prefijos` del nivel B de `terminos-prohibidos.json` (RN-23), ni el `pseudoPatientId` ni identificadores de dato (`dataRef`) (RN-11).

#### Scenario: El prompt con datos etiquetados no contiene términos prohibidos ni identificadores [US-065 AC-5] [RN-23] [RN-11]
- **GIVEN** el prompt armado con el `clinicalContext` de FX-T1a-a (Ki-67 sin verificar y receptor de estrógeno en conflicto)
- **WHEN** se aplica `check_prohibited_terms()` con los niveles A (`terminos`) y B (`prefijos`) y se busca el `pseudoPatientId` y cada `dataRef` del contexto
- **THEN** devuelve cero coincidencias y no aparece ningún `pseudoPatientId` ni `dataRef`

### Requirement: La versión del prompt de generación queda registrada en meta
`meta.promptVersion` MUST comenzar por `rag-query@0.4.0`; cuando el camino textual de aplicabilidad de `l1d-128` invoca al LLM, MAY continuar con el sufijo `+aplicabilidad-texto@0.1.0` sin espacios. Las comprobaciones SHALL usar un prefijo tolerante a ese sufijo, para no acoplar este change al de aplicabilidad.

#### Scenario: La versión del prompt empieza por rag-query@0.4.0 con o sin sufijo de aplicabilidad [US-065 AC-5] [RN-07] (asumido: sufijo de l1d-128)
- **GIVEN** una consulta a `/rag/query` con el contexto de FX-T1a-a y el LLM falso
- **WHEN** se lee `meta.promptVersion` de la respuesta
- **THEN** el valor coincide con `^rag-query@0\.4\.0(\+aplicabilidad-texto@0\.1\.0)?$`
