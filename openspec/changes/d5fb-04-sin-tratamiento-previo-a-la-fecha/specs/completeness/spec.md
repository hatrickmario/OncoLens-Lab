## ADDED Requirements

### Requirement: Una declaración de ausencia del catálogo cumple el ítem sin inventar un registro
`clinical-api` MUST tratar como cumplido un ítem cuyo `satisfiedBy` del catálogo coincide con un registro vigente (RN-07), con estado, `origin` y `provenance` de esa declaración y `resolvedBy = declaracion_de_ausencia`; con registros suficientes en el destino, `resolvedBy = registro`. La regla SHALL salir del catálogo y no SHALL crear filas de `PriorTreatment`.

#### Scenario: «Tratamientos previos» declarado como ninguno deja de ser faltante [AC-04.1] [FR-23] [RN-29]
- **GIVEN** el catálogo con `satisfiedBy` en `tratamientos_previos` y el paciente (g) sin tratamientos, con `sin_tratamiento_previo = si` `verificado` de fecha de hoy
- **WHEN** se calcula el checklist
- **THEN** `tratamientos_previos` está en `presente_verificado` con `origin = manual` y `resolvedBy = declaracion_de_ausencia`
- **AND** no existe ninguna fila `PriorTreatment` del paciente

#### Scenario: Sin declaración ni tratamientos el ítem sigue faltante [AC-04.1] [RN-26]
- **GIVEN** el paciente (g) sin tratamientos ni declaración
- **WHEN** se calcula el checklist
- **THEN** `tratamientos_previos` está en `faltante` con `resolvedBy` ausente

#### Scenario: Una declaración reemplazada o rechazada no cuenta [RN-07]
- **GIVEN** una declaración `sin_tratamiento_previo` en `reemplazado`
- **WHEN** se calcula el checklist
- **THEN** `tratamientos_previos` está en `faltante`

#### Scenario: Con tratamientos registrados gana el registro [AC-04.1]
- **GIVEN** un paciente con un `PriorTreatment` vigente y sin declaración vigente
- **WHEN** se calcula el checklist
- **THEN** `tratamientos_previos` está presente con `resolvedBy = registro`

### Requirement: Declaración de ausencia y tratamientos registrados nunca coexisten como vigentes
`clinical-api` MUST, al registrar un `PriorTreatment` manual con una declaración `sin_tratamiento_previo` vigente, marcar la declaración `reemplazado` en la misma transacción, conservando su historia. MUST rechazar con `422` (`ErrorRegistroManualInvalido`, `field = attributeKey`) declarar la ausencia si hay algún `PriorTreatment` vigente, sin efectos laterales. Un tratamiento extraído posterior NO SHALL reemplazar en silencio la declaración (RN-08; Post-MVP).

#### Scenario: Registrar un tratamiento reemplaza la declaración [RN-07] [RN-08]
- **GIVEN** el paciente (g) con la declaración vigente
- **WHEN** el oncólogo registra un tratamiento previo válido
- **THEN** responde `201` y la declaración queda `reemplazado` con su fila conservada
- **AND** el checklist muestra `resolvedBy = registro`

#### Scenario: Declarar ausencia con tratamientos vigentes se rechaza [RN-08]
- **GIVEN** un paciente con un `PriorTreatment` vigente
- **WHEN** se envía `POST …/clinical-attributes` con `sin_tratamiento_previo = si`
- **THEN** responde `422` con `field = attributeKey` y no cambia ninguna fila

#### Scenario: Paciente egresado o rol sin permiso [RN-17]
- **GIVEN** un paciente egresado, o un usuario `admin`
- **WHEN** se intenta declarar la ausencia
- **THEN** responde `422` (egresado) o `403` (admin) sin escribir
