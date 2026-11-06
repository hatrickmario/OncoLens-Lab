## ADDED Requirements

### Requirement: El contrato de clinical-api declara la corrección y el histórico de tratamientos y atributos
`apps/clinical-api/openapi.yaml` MUST declarar, de forma aditiva (ADR-26) y antes del código, cuatro operaciones (`correctPriorTreatment`, `getPriorTreatmentHistory`, `correctClinicalAttribute`, `getClinicalAttributeHistory`), el schema `ClinicalAttributeCorrection` y `id`/`supersedesId` en las respuestas de tratamiento, atributo y `CaseView`, con ejemplos y `info.version` *minor*.

#### Scenario: Cambio aditivo sin incompatibilidades [ADR-26]
- **WHEN** corren `contracts:check`, `contracts:generate:check` y `contracts:breaking`
- **THEN** los tres pasan con 0 cambios incompatibles y la verificación del proveedor cubre los endpoints nuevos

#### Scenario: Cada respuesta tiene ejemplo y errores declarados
- **THEN** cada operación nueva enlaza un ejemplo en `200`/`201` y declara `401`, `403`, `404`; las correcciones declaran además `409` y `422`, con `x-permission` `clinical:write` o `clinical:read`

#### Scenario: Los cuerpos reutilizan los schemas de alta
- **THEN** el cuerpo de `correctPriorTreatment` es `PriorTreatmentManualCreate`, de modo que cualquier campo añadido a ese schema (p. ej. por `d5fb-04`) lo hereda
