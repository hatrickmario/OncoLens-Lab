## ADDED Requirements

### Requirement: Opciones de registro manual y campo del error en el spec de clinical-api
`apps/clinical-api/openapi.yaml` MUST declarar `getManualEntryOptions` (`GET /platform/patients/{patientId}/manual-entry-options`, `200 ManualEntryOptions`, `401`, `403`, `404`, `500`), con ejemplos en `contracts/examples/` e `info.version` 1.20.0; el cambio SHALL ser aditivo (ADR-26). La propiedad opcional `field` de `ErrorRegistroManualInvalido` y `ErrorDiagnosticoInvalido` (string sin enum, introducida por `l1d-80`, `[S5 resp. 10]`) SHALL usarse sin redefinirla.

#### Scenario: El cambio de contrato es aditivo [US-111 AC-1] [US-111 AC-4] [ADR-26] [S5 resp. 13]
- **WHEN** se corre `contracts:breaking` contra `main` tras editar el spec
- **THEN** reporta 0 cambios incompatibles, y `contracts:check` valida los ejemplos `manual-entry-options-mama.json`, `manual-entry-options-prostata.json`, `manual-entry-options-sin-diagnostico.json`, `error-valor-fuera-de-catalogo-campo.json` y `error-gradacion-incoherente-campo.json`

#### Scenario: Los ejemplos previos del registro manual siguen válidos [US-111 AC-4] [ADR-26] [S5 resp. 13]
- **WHEN** se validan `error-valor-fuera-de-catalogo.json` y `error-gradacion-incoherente.json` (sin `field`) contra el spec nuevo
- **THEN** siguen siendo válidos
