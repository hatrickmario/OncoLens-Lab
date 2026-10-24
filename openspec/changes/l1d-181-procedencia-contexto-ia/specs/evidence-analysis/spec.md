## ADDED Requirements

### Requirement: El prompt etiqueta los datos del paciente sin verificar o en conflicto
El bloque de datos del paciente del prompt `rag-query@0.4.0` (sobre el prompt con alias de `l1d-287`, `[S3 resp. 15]`) MUST acompañar cada dato con `provenance.reviewStatus = requiere_revision` con la etiqueta "(sin verificar)" y cada dato con `provenance.conflict = true` con "(en conflicto)", que tiene precedencia (asumido). Un dato verificado, corregido o auto-aceptado SHALL NOT llevar etiqueta. El texto embebido para la recuperación MUST NOT cambiar (RN-07).

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

### Requirement: Las etiquetas de procedencia del prompt no introducen lenguaje prescriptivo
El bloque de datos del paciente y sus etiquetas MUST NOT contener ningún término de nivel A ni la raíz de nivel B de `terminos-prohibidos.json` (RN-23), ni el `pseudoPatientId` ni identificadores de dato (`dataRef`) (RN-11).

#### Scenario: El prompt con datos etiquetados no contiene términos prohibidos ni identificadores [US-065 AC-5] [RN-23] [RN-11]
- **GIVEN** el prompt armado con el `clinicalContext` de FX-T1a-a (Ki-67 sin verificar y receptor de estrógeno en conflicto)
- **WHEN** se aplica `check_prohibited_terms()` con los niveles A y B y se busca el `pseudoPatientId` y cada `dataRef` del contexto
- **THEN** devuelve cero coincidencias y no aparece ningún `pseudoPatientId` ni `dataRef`
