# Spec Delta — clinical-catalogs

## ADDED Requirements

### Requirement: Un catálogo válido se acepta con su versión
`catalog:validate` MUST validar el directorio de catálogo indicado contra los esquemas de `packages/clinical-catalogs/schemas/` y las reglas de RN-29 y, si todo pasa, SHALL terminar con código 0 informando la `catalogVersion` del `manifest.json`; solo una versión aceptada puede montarse en CI y en los backends.

#### Scenario: El catálogo de fixture con todos los destinos pasa la validación [US-001 AC-1] [AC-04.5] [RN-29]
- **GIVEN** el catálogo de fixture `test-1.0.0` (FX-04-a), en el que todos los ítems tienen `destination`
- **WHEN** se ejecuta `catalog:validate` sobre ese directorio
- **THEN** termina con código 0
- **AND** informa `catalogVersion = "test-1.0.0"`

### Requirement: Todo ítem del catálogo con destino lo declara
`catalog:validate` MUST terminar con código distinto de 0 y nombrar el ítem cuando un dato crítico, un criterio de aplicabilidad o una regla de supuestos no declara `destination` (RN-29); esa versión no SHALL aceptarse. El mensaje nombra el ítem y no contiene la ruta ni otros valores del catálogo.

#### Scenario: Un dato crítico sin destino invalida el catálogo [US-001 AC-2] [AC-04.5] [RN-29]
- **GIVEN** una copia de `test-1.0.0` en la que el ítem `ki67` no tiene `destination`
- **WHEN** se ejecuta `catalog:validate` sobre esa copia
- **THEN** termina con código distinto de 0
- **AND** el mensaje nombra `ki67`
- **AND** la versión no se acepta

#### Scenario: Un criterio de aplicabilidad sin destino invalida el catálogo [US-001 AC-3] [AC-04.5] [RN-29]
- **GIVEN** una copia de `test-1.0.0` cuyo `mama/aplicabilidad.json` contiene el criterio `estado_menopausico` sin `destination`
- **WHEN** se ejecuta `catalog:validate` sobre esa copia
- **THEN** termina con código distinto de 0 y el mensaje nombra `estado_menopausico`

### Requirement: El destino de cada ítem existe en el modelo
`catalog:validate` MUST rechazar con `destino_inexistente`, código distinto de 0 y nombrando el ítem, un `destination` cuya entidad, campo o clave de `match` no está en la allowlist derivada del modelo, que solo admite las entidades clínicas `Diagnosis`, `Exam`, `Biomarker`, `PriorTreatment`, `ClinicalAttribute` y `ClinicalEvent` (RN-29, FR-23, RN-10). También MUST rechazar un `ClinicalAttribute.attribute_key` no declarado en el catálogo.

#### Scenario: Un destino a un campo inexistente invalida el catálogo [US-001 AC-4] [RN-29] [FR-23]
- **GIVEN** una copia de `test-1.0.0` en la que el ítem `estado_menopausico` apunta a `Diagnosis.menopause`
- **WHEN** se ejecuta `catalog:validate`
- **THEN** termina con código distinto de 0 y el mensaje nombra `estado_menopausico`

#### Scenario: Un destino en la identidad del paciente invalida el catálogo [US-001 AC-4] [RN-29] [RN-10] `[S3 resp. 16]`
- **GIVEN** una copia de `test-1.0.0` en la que el ítem `estado_menopausico` apunta a `PatientIdentity.id_type`, campo que existe en el modelo
- **WHEN** se ejecuta `catalog:validate`
- **THEN** termina con código distinto de 0 con el código `destino_inexistente` y el mensaje nombra `estado_menopausico`
- **AND** el mensaje no contiene la ruta ni otros valores del catálogo

#### Scenario: Un destino a una clave de ClinicalAttribute no declarada invalida el catálogo [US-001 AC-4] [RN-29]
- **GIVEN** una copia de `test-1.0.0` en la que un ítem apunta a `ClinicalAttribute` con `attribute_key = "menopausia_x"`, que no está declarada en el catálogo
- **WHEN** se ejecuta `catalog:validate`
- **THEN** termina con código distinto de 0 y el mensaje nombra el ítem

#### Scenario: Un cambio del modelo que elimina un campo de destino rompe la validación [US-001 AC-4] [RN-29] (asumido)
- **GIVEN** la allowlist regenerada desde un esquema del modelo de test sin el campo `performance_value` de `Diagnosis`
- **WHEN** se ejecuta `catalog:validate` sobre `test-1.0.0`, cuyo ítem `ecog` apunta a ese campo
- **THEN** termina con código distinto de 0 y el mensaje nombra `ecog`

### Requirement: Las reglas condicionales son declarativas y completas
Un ítem condicional MUST declarar `whenConditionUnknown` (`faltante` o `no_aplica`) y su `condition` SHALL referenciar una clave de ítem existente del mismo tipo de cáncer, con un operador declarativo (igualdad, pertenencia o prefijo); `catalog:validate` MUST terminar con código distinto de 0 si no se cumple. El catálogo no admite código ejecutable (AC-04.4).

#### Scenario: Una condición que referencia una clave inexistente invalida el catálogo [US-001 AC-5] (asumido)
- **GIVEN** una copia de `test-1.0.0` en la que `her2_ish.condition.item = "her2_ihc_x"`
- **WHEN** se ejecuta `catalog:validate`
- **THEN** termina con código distinto de 0 y el mensaje nombra `her2_ish`

#### Scenario: Un ítem condicional sin whenConditionUnknown invalida el catálogo [US-001 AC-5] (asumido)
- **GIVEN** una copia de `test-1.0.0` en la que `her2_ish` tiene `condition` y no declara `whenConditionUnknown`
- **WHEN** se ejecuta `catalog:validate`
- **THEN** termina con código distinto de 0 y el mensaje nombra `her2_ish`

### Requirement: Contenido de datos críticos del catálogo del S3
La versión de catálogo del S3 MUST traer en `<tipo>/datos-criticos.json` exactamente los ítems de mama y próstata de FR-23, cada uno con `destination` y `estado = "propuesta"` hasta que DEC-01 los revise; `gleason_isup` SHALL apuntar a `Diagnosis.grade` (DEC-05), `tnm` a `Diagnosis.stage_value`, y HER2 IHQ e ISH se distinguen por `Exam.exam_type` en el `match`.

#### Scenario: El catálogo del S3 lista exactamente las claves de datos críticos [US-001 AC-7] [FR-23] [TBD-12] [DEC-05]
- **GIVEN** `packages/clinical-catalogs` en la versión de catálogo del S3
- **WHEN** el test lista las claves de `mama/datos-criticos.json` y `prostata/datos-criticos.json`
- **THEN** mama es exactamente {`histologia`, `grado`, `tnm`, `re`, `rp`, `her2_ihq`, `her2_ish`, `ki67`, `estado_menopausico`, `ecog`, `tratamientos_previos`, `brca_germinal`}
- **AND** próstata es exactamente {`psa_serie`, `gleason_isup`, `tnm`, `sitios_metastasicos`, `estado_castracion`, `tratamientos_previos`, `ecog`, `hrr_brca`}
- **AND** cada ítem tiene `destination` y `estado = "propuesta"`
- **AND** `gleason_isup` apunta a `Diagnosis.grade` y `tnm` a `Diagnosis.stage_value`

#### Scenario: HER2 IHQ e ISH se distinguen por el tipo de examen [US-001 AC-7] `[S3 resp. 5]`
- **GIVEN** la versión de catálogo del S3
- **WHEN** el test lee el `destination` de `her2_ihq` y de `her2_ish`
- **THEN** ambos apuntan a `Biomarker` con el mismo nombre de biomarcador y `match` con valores distintos de `Exam.exam_type`
- **AND** `catalog:validate` termina con código 0 sobre la versión del S3

### Requirement: Integridad de una versión revisada del catálogo
Si un archivo declara el bloque `validation` (`scope` como array con valores `datos_criticos`, `matriz_item_campo` o `aplicabilidad`, `status`, `reviewerRole`, `date`, `catalogHash`), `catalog:validate` MUST recalcular el hash canónico del contenido cubierto por `scope` y terminar con código distinto de 0 si difiere; también MUST rechazar un ítem con `estado` fuera de `propuesta | pendiente | revisado` (AC-04.4, P-03).

#### Scenario: Modificar un ítem de una versión revisada sin versión nueva invalida el catálogo [US-001 AC-8] [AC-04.4] [P-03] (asumido)
- **GIVEN** `test-1.1.0` con `validation.status = "propuesta_revisada"`, `scope = ["datos_criticos", "matriz_item_campo"]` y su `catalogHash`
- **WHEN** se cambia `minValues` de `psa_serie` sin cambiar la versión y se ejecuta `catalog:validate`
- **THEN** termina con código distinto de 0 por `catalogHash` distinto

#### Scenario: Modificar un criterio de aplicabilidad de una versión revisada invalida el catálogo [US-001 AC-8] [AC-04.4] `[S3 resp. 16]` (asumido)
- **GIVEN** `test-1.1.0` cuyo `mama/aplicabilidad.json` declara `validation.scope = ["aplicabilidad"]` y su `catalogHash`
- **WHEN** se cambia el `destination.field` del criterio `estado_menopausico` sin cambiar la versión y se ejecuta `catalog:validate`
- **THEN** termina con código distinto de 0 con el código `hash_distinto`

#### Scenario: Un estado de ítem desconocido invalida el catálogo [US-001 AC-8] (asumido)
- **GIVEN** una copia de `test-1.0.0` en la que `ki67.estado = "aprobado"`
- **WHEN** se ejecuta `catalog:validate`
- **THEN** termina con código distinto de 0 y el mensaje nombra `ki67`

## MODIFIED Requirements

### Requirement: Sin catálogo los backends no quedan listos
Si `CLINICAL_CATALOG_PATH` no contiene un `manifest.json` legible, `clinical-api` y `rag-orchestrator` MUST NOT quedar listos y SHALL registrar el evento único `configuracion_invalida` (US-037) con `variable = CLINICAL_CATALOG_PATH` y `motivo = catalogo_no_disponible`, sin la ruta ni el contenido del catálogo. Si el catálogo es legible pero no pasa `catalog:validate`, `clinical-api` MUST NOT quedar listo y SHALL registrar `configuracion_invalida` con `motivo = catalogo_invalido` y el código de la regla incumplida, sin la ruta ni el contenido del catálogo.

#### Scenario: Un directorio inexistente impide arrancar a ambos backends [US-041 AC-5] (asumido)
- **GIVEN** `CLINICAL_CATALOG_PATH` apuntando a un directorio inexistente
- **WHEN** arrancan `clinical-api` y `rag-orchestrator`
- **THEN** ninguno queda listo (`/health` ≠ `200` o el proceso termina con código distinto de 0)
- **AND** el log de cada uno contiene una línea con `event = configuracion_invalida`, `variable = CLINICAL_CATALOG_PATH` y `motivo = catalogo_no_disponible`, y no contiene la ruta ni contenido del catálogo

#### Scenario: Un catálogo que no pasa la validación deja no listo a clinical-api [US-001 AC-6] `[S3 resp. 5]` (asumido)
- **GIVEN** `CLINICAL_CATALOG_PATH` apuntando a la copia de `test-1.0.0` en la que `ki67` no tiene `destination`
- **WHEN** arranca `clinical-api`
- **THEN** no queda listo (`/health` ≠ `200` o el proceso termina con código distinto de 0)
- **AND** el log contiene `event = configuracion_invalida`, `variable = CLINICAL_CATALOG_PATH`, `motivo = catalogo_invalido` y el código de la regla, y no contiene la ruta ni contenido del catálogo
