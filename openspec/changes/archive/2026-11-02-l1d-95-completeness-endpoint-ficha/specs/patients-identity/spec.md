# Spec Delta — patients-identity

## ADDED Requirements

### Requirement: El contador de faltantes de la ficha sale del servicio de completitud
`PatientSummary.missingCriticalCount` MUST ser el número de ítems `faltante` que calcula el mismo servicio de completitud que `/completeness`, y SHALL NOT ser un valor fijo. Un faltante SHALL NOT bloquear la ficha (RN-26). Si el tipo no está habilitado o no hay `Diagnosis` activo, `missingCriticalCount` MUST ser `0`. Si el cálculo del checklist falla, la ficha MUST responder `200` con `missingCriticalCount = 0` y `completenessAvailable = false`, nunca `5xx`.

#### Scenario: F-M2 tiene seis faltantes en la ficha [US-003 AC-2] [AC-04.1]
- **GIVEN** el paciente F-M2 y el catálogo `test-1.0.0`
- **WHEN** se llama a `GET /platform/patients/{id}` con una sesión `clinical:read`
- **THEN** `PatientSummary.missingCriticalCount = 6`
- **AND** es igual al número de ítems `faltante` de `/completeness` para F-M2

#### Scenario: La ficha no cae si falla el checklist [US-003 AC-2] [RN-26] (decidido por defecto, Gate 1)
- **GIVEN** el paciente F-M2 y un fallo al calcular su checklist (servicio de la ficha armado por su *factory* con un puerto de catálogo que lanza)
- **WHEN** se llama a `GET /platform/patients/{id}` con una sesión `clinical:read`
- **THEN** la respuesta es `200` con `missingCriticalCount = 0` y `completenessAvailable = false`
- **AND** el log no contiene valores clínicos ni la identidad del paciente

### Requirement: El listado y la búsqueda no calculan el checklist en el S4
El listado y la búsqueda de pacientes MUST NOT invocar el servicio de completitud por fila en el S4: `PatientListItem` conserva su forma y su `missingCriticalCount` el valor actual, con cualquier sesión (decisión Q2, usuario, 2026-10-30; RN-26).

#### Scenario: El listado no invoca el servicio de completitud [US-003 AC-2] [RN-26] (decisión Q2, 2026-10-30)
- **GIVEN** un doctor con sesión `clinical:read` y el servicio de completitud armado por su *factory* con un fake que cuenta invocaciones
- **WHEN** llama al listado y a la búsqueda de pacientes
- **THEN** el fake no se invoca
- **AND** cada `PatientListItem` es igual al de `main` (sin `completenessAvailable`)
