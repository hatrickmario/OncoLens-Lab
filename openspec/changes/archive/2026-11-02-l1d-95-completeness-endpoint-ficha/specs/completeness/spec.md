# Spec Delta — completeness

## ADDED Requirements

### Requirement: Endpoint del checklist con catálogo y procedencia por ítem
`clinical-api` MUST exponer `GET /platform/patients/{patientId}/completeness` para sesiones con `clinical:read`, con `200` y `CompletenessView` (`catalogVersion`, `cancerTypeEnabled`, `items`), donde `items` es el resultado del servicio de completitud. La respuesta SHALL ser válida contra `apps/clinical-api/openapi.yaml`.

#### Scenario: El doctor recibe el checklist de F-M2 [US-003 AC-1] [AC-04.1]
- **GIVEN** un doctor con sesión válida, el paciente F-M2 y el catálogo `test-1.0.0` cargado
- **WHEN** llama a `GET /platform/patients/{id}/completeness`
- **THEN** recibe `200` con `items` igual al resultado de [US-002 AC-2] y `catalogVersion = "test-1.0.0"`
- **AND** `cancerTypeEnabled = true`

### Requirement: Origen y procedencia de cada ítem
Todo ítem `presente_*` MUST traer `origin` (`documento`, `manual`, `correccion` o, solo en datos sintéticos, `seed`) y `provenance` (`entryMethod`, `reviewStatus`, `sourceDocumentId` y `page` si viene de un documento) del registro que lo hizo presente. Todo ítem `faltante` MUST traer `destination` (`entity` y campo), `origin = regla` y `provenance = null`. Todo ítem `no_aplica` MUST traer `origin = regla` y en `condition` la condición del catálogo que no se cumplió.

#### Scenario: Cada estado trae su origen [US-003 AC-3] [AC-T1.1] [FR-23]
- **GIVEN** la respuesta de [US-003 AC-1] para F-M2 (ítem de documento `re`, manual `tratamientos_previos`, de corrección `her2_ihq`, de seed `histologia` y seis `faltante`) y la de F-M1 (con `no_aplica`)
- **WHEN** se inspecciona cada ítem
- **THEN** los `presente_*` traen `origin` (`documento`, `manual`, `correccion` o `seed` según su `entryMethod`) y `provenance` completos, con `page` solo si vienen de un documento
- **AND** cada `faltante` trae `destination.entity`, `destination.field`, `origin = regla` y `provenance = null`
- **AND** cada `no_aplica` trae `origin = regla` y `condition` con la regla del catálogo no cumplida

### Requirement: El endpoint exige sesión y permiso clínico
Sin cookie de sesión válida, `/completeness` MUST responder `401` sin invocar al servicio de completitud. Una sesión sin `clinical:read` (rol `admin`) MUST recibir `403` con `error = PERMISO_DENEGADO` sin invocar al servicio de completitud (mínimo privilegio).

#### Scenario: Sin sesión [US-003 AC-4] [FR-01]
- **GIVEN** una petición sin cookie de sesión
- **WHEN** se llama a `/completeness`
- **THEN** la respuesta es `401`
- **AND** `CompletenessService` no se invoca

#### Scenario: El administrador no lee el checklist [US-003 AC-4] [PRD v1.4 §11]
- **GIVEN** una sesión válida de un usuario `admin` (sin `clinical:read`)
- **WHEN** se llama a `/completeness` de un paciente existente
- **THEN** la respuesta es `403` con `error = PERMISO_DENEGADO`
- **AND** `CompletenessService` no se invoca

### Requirement: El endpoint exige un paciente existente
Con un `patientId` que no corresponde a ningún paciente, `/completeness` MUST responder `404` con la forma `{ error, message }`. Un `patientId` mal formado SHALL tratarse como inexistente (`404`) sin registrar errores de la base de datos. Un `faltante` SHALL NOT producir ningún `4xx` (RN-26).

#### Scenario: Paciente inexistente [US-003 AC-5] [FR-04]
- **GIVEN** un UUID que no corresponde a ningún paciente
- **WHEN** se llama a `/completeness`
- **THEN** la respuesta es `404` con la forma `{ error, message }`

### Requirement: Tipo de cáncer no habilitado
Cuando el `Diagnosis` activo es de un tipo que no está en `ENABLED_CANCER_TYPES`, o el paciente no tiene `Diagnosis` activo, `/completeness` MUST responder `200` con `items = []` y `cancerTypeEnabled = false`, nunca un error.

#### Scenario: Tipo fuera de ENABLED_CANCER_TYPES [US-003 AC-6]
- **GIVEN** un paciente sintético con `Diagnosis` activo de un tipo fuera de `ENABLED_CANCER_TYPES`
- **WHEN** se llama a `/completeness`
- **THEN** la respuesta es `200` con `items = []` y `cancerTypeEnabled = false`

#### Scenario: Sin diagnóstico activo [US-003 AC-6] (decidido por defecto, Gate 1)
- **GIVEN** un paciente sintético sin `Diagnosis` activo
- **WHEN** se llama a `/completeness`
- **THEN** la respuesta es `200` con `items = []` y `cancerTypeEnabled = false`
