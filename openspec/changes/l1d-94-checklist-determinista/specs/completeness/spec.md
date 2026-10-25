# Spec Delta — completeness

## Purpose

Clasifica, con una regla fija tomada del catálogo versionado y sin IA, cada dato crítico del paciente como
presente y verificado, presente sin verificar, faltante o no aplica, para que el oncólogo sepa qué le falta antes
de analizar el caso (FR-23, HU-18).

## ADDED Requirements

### Requirement: Checklist de los datos críticos del tipo de cáncer activo en cuatro estados
`clinical-api` MUST calcular para un paciente un checklist con un ítem por cada dato crítico del catálogo cuyo `cancerType` sea el del `Diagnosis` activo del paciente, en el orden del catálogo, cada uno con un estado de {`presente_verificado`, `presente_sin_verificar`, `faltante`, `no_aplica`}, y la `catalogVersion` usada. Nunca SHALL incluir ítems de otro tipo de cáncer.

#### Scenario: Caso completo de mama con los condicionales en no_aplica [US-002 AC-1] [AC-04.1] [FR-23]
- **GIVEN** el catálogo de test `test-1.0.0` montado (FX-04-a) y el paciente sintético F-M1 sembrado (FX-04-b)
- **WHEN** se calcula el checklist de F-M1
- **THEN** devuelve 12 ítems en el orden del catálogo
- **AND** `histologia`, `grado`, `tnm`, `ecog`, `re`, `rp`, `her2_ihq`, `ki67` y `estado_menopausico` están en `presente_verificado`
- **AND** `her2_ish`, `tratamientos_previos` y `brca_germinal` están en `no_aplica`
- **AND** `catalogVersion = "test-1.0.0"`

#### Scenario: Caso mixto de mama con cada estado exacto [US-002 AC-2] [AC-04.1] [FR-23]
- **GIVEN** `test-1.0.0` y F-M2 sembrado
- **WHEN** se calcula el checklist de F-M2
- **THEN** `presente_verificado` = {`histologia`, `tnm`, `ecog`, `her2_ihq`, `tratamientos_previos`}
- **AND** `presente_sin_verificar` = {`re`}
- **AND** `faltante` = {`grado`, `rp`, `her2_ish`, `ki67`, `estado_menopausico`, `brca_germinal`}
- **AND** ningún ítem está en `no_aplica`

#### Scenario: Paciente de próstata solo recibe ítems de próstata [US-002 AC-7] [FR-23]
- **GIVEN** `test-1.0.0` y F-P1 (próstata, ECOG 0, tres PSA `verificado` con fechas distintas)
- **WHEN** se calcula el checklist de F-P1
- **THEN** devuelve exactamente `psa_serie` y `ecog`, ambos en `presente_verificado`
- **AND** ninguna clave del catálogo de mama aparece en el resultado

### Requirement: Solo cuentan registros vigentes y en número suficiente
Un ítem MUST quedar `faltante` cuando su campo de destino tenga menos registros vigentes que el `minValues` del ítem. Un registro `rechazado` o `reemplazado` nunca SHALL contar (RN-07). En el S3 no existe marca de "ausencia confirmada": sin registros vigentes el ítem queda `faltante` `[S3 resp. 5]`.

#### Scenario: El único receptor de progesterona rechazado deja rp en faltante [US-002 AC-3] [RN-07] [AC-02.6]
- **GIVEN** `test-1.0.0` y F-M2, cuyo único registro de receptor de progesterona está `rechazado`
- **WHEN** se calcula el checklist de F-M2
- **THEN** `rp` está en `faltante` y no en `presente_verificado` ni en `presente_sin_verificar`

### Requirement: El registro más reciente decide si el dato está verificado
Con registros suficientes, el estado MUST ser `presente_verificado` si el registro que cuenta (el vigente más reciente por fecha de observación o de examen; en empate, el creado más tarde) tiene un `review_status` incluido en `verifiedReviewStatuses` del catálogo, y `presente_sin_verificar` en otro caso, incluido `requiere_revision` `[S3 resp. 5]`.

#### Scenario: Un receptor de estrógeno en requiere_revision queda presente sin verificar [US-002 AC-2] [FR-23]
- **GIVEN** `test-1.0.0` y F-M2, cuyo receptor de estrógeno (`ocr`, confianza `media`) está en `requiere_revision`
- **WHEN** se calcula el checklist de F-M2
- **THEN** `re` está en `presente_sin_verificar`

#### Scenario: Un verificado antiguo con uno más reciente sin verificar queda presente sin verificar [US-002 AC-2] [FR-23] (asumido; regla decidida en [S3 resp. 5])
- **GIVEN** `test-1.0.0` y una variante de F-M1 con un segundo receptor de estrógeno en `requiere_revision` en un examen posterior al del registro `verificado`
- **WHEN** se calcula el checklist
- **THEN** `re` está en `presente_sin_verificar`

### Requirement: Los ítems condicionales aplican solo lo que declara el catálogo
Para un ítem con `condition`, la condición MUST evaluarse de forma declarativa sobre el registro que cuenta del ítem o campo referenciado: si no se cumple, el ítem es `no_aplica`; si no puede evaluarse porque ese dato falta, el estado SHALL ser el `whenConditionUnknown` del ítem. El motor no tiene valores por defecto propios.

#### Scenario: Condiciones no evaluables siguen el whenConditionUnknown de cada ítem [US-002 AC-4] (asumido)
- **GIVEN** `test-1.0.0` y F-M3 (igual que F-M1, sin TNM y sin ningún biomarcador HER2)
- **WHEN** se calcula el checklist de F-M3
- **THEN** `her2_ish` y `brca_germinal` están en `no_aplica` (su `whenConditionUnknown` es `no_aplica`)
- **AND** `tratamientos_previos` está en `faltante` (su `whenConditionUnknown` es `faltante`)
- **AND** `tnm` y `her2_ihq` están en `faltante`

#### Scenario: El operador prefijo es startsWith exacto, sensible a mayúsculas y espacios [US-002 AC-2] (asumido)
- **GIVEN** un ítem con `condition.operator = "prefijo"` y `values = ["2+"]` sobre `her2_ihq`, y F-M2 con HER2 `"2+ (IHQ)"`
- **WHEN** se calcula el checklist de F-M2
- **THEN** la condición se cumple (`her2_ish` sigue su estado propio: `faltante`)
- **AND** un valor `" 2+ (IHQ)"` (espacio inicial) o `"iv"` frente al prefijo `"IV"` NO cumple la condición: no se normaliza ni se recorta

### Requirement: Cálculo determinista sin IA
Para los mismos datos y la misma versión del catálogo, el checklist MUST ser idéntico en cada cálculo (misma serialización y misma `catalogVersion`). El cálculo SHALL ejecutarse íntegramente en `clinical-api`, sin invocar a `rag-orchestrator`, a ningún LLM ni a fuente de aleatoriedad.

#### Scenario: Dos cálculos seguidos son idénticos y no llaman a la IA [US-002 AC-5] [AC-04.4] [FR-23]
- **GIVEN** `test-1.0.0`, F-M2 y el HTTP saliente hacia `rag-orchestrator` interceptado con un contador
- **WHEN** el checklist de F-M2 se calcula dos veces seguidas
- **THEN** las dos serializaciones JSON son idénticas, con la misma `catalogVersion`
- **AND** el contador de llamadas a `rag-orchestrator` es cero

### Requirement: Las reglas del checklist vienen del catálogo montado, no del código
Los ítems, sus destinos, condiciones, `minValues` y `verifiedReviewStatuses` MUST leerse del catálogo de datos críticos montado en `CLINICAL_CATALOG_PATH` (RN-22). Cambiar de versión del catálogo SHALL cambiar el resultado sin recompilar ni redesplegar `clinical-api`.

#### Scenario: La misma build con test-1.1.0 deja de pedir Ki-67 [US-002 AC-6] [AC-04.4] [RN-22]
- **GIVEN** F-M2 sembrado y la misma build de `clinical-api` arrancada con `CLINICAL_CATALOG_PATH` apuntando a `test-1.1.0` (igual a `test-1.0.0`, sin `ki67`)
- **WHEN** se calcula el checklist de F-M2
- **THEN** devuelve 11 ítems y `ki67` no aparece
- **AND** hay 5 ítems en `faltante`
- **AND** `catalogVersion = "test-1.1.0"`

### Requirement: Un dato no mapeado cuenta como cualquier dato vigente con su mismo nombre
Decidido (usuario, 2026-10-24): un registro `no_mapeado` MUST contarse como cualquier dato vigente cuyo `name` coincida con el del destino; su estado sale de `review_status`, no de `mapping_status`. El emparejamiento SHALL ser solo por `name`, nunca por `original_name` ni por similitud (RN-27); sin coincidencia, el ítem sigue `faltante`.

#### Scenario: Un Ki-67 no mapeado en requiere_revision con name del catálogo deja ki67 en presente sin verificar [US-002 AC-8] [RN-27]
- **GIVEN** `test-1.0.0` y F-M2 con un biomarcador `name = "Ki-67"`, `original_name = "Ki67 índice"`, `no_mapeado` y `requiere_revision`
- **WHEN** se calcula el checklist de F-M2
- **THEN** `ki67` está en `presente_sin_verificar`

#### Scenario: Un no mapeado ya verificado con name del catálogo da presente verificado [US-002 AC-8] [RN-27]
- **GIVEN** un `Biomarker` `no_mapeado` con `name` del catálogo y `review_status = verificado`
- **WHEN** se calcula el checklist
- **THEN** el ítem está en `presente_verificado`: el estado sale de `review_status`

#### Scenario: Un Ki-67 no mapeado cuyo name no coincide deja ki67 en faltante [US-002 AC-8] [RN-27]
- **GIVEN** `test-1.0.0` y F-M2 con un biomarcador `name = "Ki67 índice"` en `no_mapeado`
- **WHEN** se calcula el checklist de F-M2
- **THEN** `ki67` está en `faltante`, aunque su `original_name` sea `"Ki-67"`

#### Scenario: Un PriorTreatment no mapeado cuenta como dato presente [US-002 AC-2] [RN-27]
- **GIVEN** `test-1.0.0` y F-M2, cuyo tratamiento previo (`letrozol`) está `no_mapeado` y `verificado`
- **WHEN** se calcula el checklist de F-M2
- **THEN** `tratamientos_previos` está en `presente_verificado`

#### Scenario: Un HER2 por IHQ no mapeado con "2+" activa her2_ish [US-002 AC-4] [RN-27]
- **GIVEN** un `Biomarker` `her2_ihq` `no_mapeado` con `name` del catálogo y valor `"2+ (IHQ)"`
- **WHEN** se calcula el checklist
- **THEN** la condición de `her2_ish` se cumple (el registro que cuenta es el `no_mapeado`)
