## ADDED Requirements

### Requirement: Cambio aditivo del contrato para la declaración de ausencia
`apps/clinical-api/openapi.yaml` MUST añadir `resolvedBy` opcional (`registro` | `declaracion_de_ausencia`) a `CompletenessItem` y el `422` de incoherencia a `createManualClinicalAttribute`, con ejemplos en `contracts/examples/`, `info.version` con un minor más y sin tocar `PriorTreatmentManualCreate`. Los tipos y schemas Zod de `packages/api-contracts` SHALL regenerarse desde el spec y no editarse a mano (ADR-26).

#### Scenario: El cambio es aditivo [ADR-26]
- **WHEN** corren `contracts:breaking` contra `main` y `contracts:check`
- **THEN** reportan 0 cambios incompatibles y los ejemplos nuevos validan, y los ejemplos previos de `completeness` siguen válidos

#### Scenario: El cuerpo del tratamiento no se relaja [US-094]
- **WHEN** se valida `{}` contra `PriorTreatmentManualCreate`
- **THEN** sigue siendo inválido por `setting`, `regimenName` y `ongoing`
