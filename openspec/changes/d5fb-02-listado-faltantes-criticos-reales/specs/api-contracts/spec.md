# Spec Delta — api-contracts

## MODIFIED Requirements

### Requirement: La ficha declara si el checklist está disponible
`PatientSummary` y `PatientListItem` SHALL tener la propiedad opcional `completenessAvailable` (booleano; ausente equivale a `true`), sin volver nulable `missingCriticalCount` en ninguno. El cambio MUST ser aditivo (sin ERR de oasdiff), subir `info.version` de `clinical-api` al siguiente menor libre (tentativo `1.21.0`) y traer un ejemplo registrado en `contracts/examples/index.json` con una fila de `PatientPage` en `completenessAvailable = false`.

#### Scenario: La propiedad nueva es opcional [US-003 AC-2] [RN-26]
Ahora en la ficha y en el listado (feedback de la Demo 5, 2026-11-05).
- **WHEN** `contracts:breaking` compara el spec con `main`
- **THEN** `completenessAvailable` aparece como propiedad opcional de `PatientSummary` y de `PatientListItem` y `missingCriticalCount` sigue siendo un entero requerido en ambos
- **AND** `patient-summary-checklist-no-disponible.json` y `patient-list-checklist-no-disponible.json` validan contra su schema y están registrados en `index.json`
- **AND** `PatientAdminSummary` no tiene cambios respecto de `main`
