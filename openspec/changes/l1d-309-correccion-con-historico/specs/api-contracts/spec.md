## ADDED Requirements

### Requirement: Operaciones de corrección, histórico y notas clínicas en el spec de clinical-api
El spec de `clinical-api` MUST declarar `correctBiomarker`, `correctClinicalNote`, `listClinicalNotes` (`ClinicalNoteList`, sin paginación), `getBiomarkerHistory` y `getClinicalNoteHistory` con `x-permission`, schemas cerrados con nombre y un ejemplo sintético en cada `200`/`201`. El cambio SHALL ser aditivo (ADR-26) con `info.version` 1.19.0.

#### Scenario: Las operaciones de corrección están declaradas con sus errores [US-253 AC-1] [US-253 AC-2] [ADR-26]
- **WHEN** `contracts:check` revisa `apps/clinical-api/openapi.yaml`
- **THEN** existen las cinco operaciones (`201`/`200`, `401`, `403`, `404` y, en las correcciones, `409` y `422`) con `clinical:write` o `clinical:read`, `ErrorCorreccionInvalida` (`CUERPO_INVALIDO`, `PACIENTE_EGRESADO`, `VALOR_FUERA_DE_CATALOGO`; `field` opcional, `type: string`, sin enum, con la misma descripción que los demás 422 de registro, `[S5 resp. 10]` (3)) y `ErrorDatoNoVigente` (`DATO_NO_VIGENTE`), `getClinicalNoteHistory` enlaza `correction-history-clinical-note.json`, `listClinicalNotes` enlaza `clinical-notes-list.json`, y cada ejemplo nuevo de `contracts/examples/` valida contra su schema

#### Scenario: El cambio no rompe a los consumidores [US-253 AC-1] [ADR-26]
- **WHEN** `contracts:breaking` compara el spec con `main`
- **THEN** reporta 0 cambios incompatibles: `Biomarker.supersedesId` es opcional y `Provenance.reviewStatus` no amplía su enum (el histórico usa `CorrectionHistory` con `reviewStatus = reemplazado`), y `info.version` es 1.19.0

#### Scenario: Las respuestas reales cumplen el spec, incluidos los errores [US-253 AC-3] [US-253 AC-4]
- **GIVEN** los tests de integración de las cinco operaciones
- **WHEN** corre la verificación del proveedor
- **THEN** cada `201`, `200`, `403`, `404`, `409` y `422` emitido valida contra el spec de `clinical-api`
