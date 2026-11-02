# Spec Delta — api-contracts

## ADDED Requirements

### Requirement: /completeness y CompletenessView en el spec de clinical-api
El spec de `clinical-api` MUST declarar `GET /platform/patients/{patientId}/completeness` con `x-permission: clinical:read`, respuestas `200`, `401`, `403`, `404` y `500`, y los schemas cerrados `CompletenessView`, `CompletenessItem` y `CompletenessProvenance` (subconjunto propio, sin modificar `Provenance`). El cambio MUST ser aditivo (sin ERR de oasdiff) y subir `info.version` a `1.12.0`.

#### Scenario: La operación está declarada y es aditiva [US-003 AC-1] [US-003 AC-3]
- **WHEN** `contracts:check` y `contracts:breaking` revisan el spec
- **THEN** la operación, `CompletenessView`, `CompletenessItem` y `CompletenessProvenance` existen con `x-permission: clinical:read` y `oasdiff` no reporta cambios incompatibles
- **AND** la respuesta real de `/completeness` valida contra el spec en `contracts:verify-provider`

### Requirement: La ficha declara si el checklist está disponible
`PatientSummary` SHALL ganar la propiedad opcional `completenessAvailable` (booleano; ausente equivale a `true`), sin volver nulable `missingCriticalCount`. `PatientListItem` SHALL NOT cambiar en el S4 (decisión Q2, usuario, 2026-10-30).

#### Scenario: La propiedad nueva es opcional [US-003 AC-2] [RN-26]
- **WHEN** `contracts:breaking` compara el spec con `main`
- **THEN** `completenessAvailable` aparece como propiedad opcional de `PatientSummary` y `missingCriticalCount` sigue siendo un entero requerido
- **AND** `PatientListItem` no tiene cambios respecto de `main`
- **AND** `patient-summary-checklist-no-disponible.json` (con `completenessAvailable = false`) valida contra `PatientSummary` y está registrado en `index.json`

### Requirement: Ejemplos de /completeness para los consumidores
`contracts/examples/` MUST incluir respuestas `200` de F-M2 (6 faltantes), de F-M1 (0 faltantes) y de tipo no habilitado (`items = []`), y los errores `401`, `403`, `404` y `500` de la operación, todos registrados en `index.json`.

#### Scenario: Los siete ejemplos validan contra su target [US-003 AC-1] [US-005 AC-1]
- **WHEN** `contracts:check` valida `contracts/examples/index.json`
- **THEN** los tres ejemplos `200` y los cuatro de error de `/completeness` validan contra su respuesta en el spec
