## ADDED Requirements

### Requirement: Cada dato crítico declara sus tipos de documento fuente
Cada ítem de `<tipo>/datos-criticos.json` MUST declarar `sourceDocumentTypes`, un array no vacío con valores del enum `document_type` (`historia_clinica`, `examen`), y `catalog:validate` SHALL terminar con código distinto de 0 si un ítem no lo tiene o usa otro valor. La versión del catálogo que introduce el campo SHALL ser 1.6.0, montada en ambos backends (RN-29). El mapeo de los ítems reales SHALL quedar con `estado = "propuesta"` hasta DEC-01.

#### Scenario: El catálogo 1.6.0 valida con sourceDocumentTypes en todos los ítems
- **GIVEN** `packages/clinical-catalogs/` con `mama/datos-criticos.json` y `prostata/datos-criticos.json`
- **WHEN** corre `catalog:validate`
- **THEN** termina con código 0 y cada ítem tiene `sourceDocumentTypes` no vacío con valores de {`historia_clinica`, `examen`}
- **AND** la versión del manifest es `1.6.0` y es la que reportan `clinical-api` y `rag-orchestrator`
- **AND** el mapeo de `sourceDocumentTypes` de `datos-criticos` declara `estado = "propuesta"` [US-263 AC-1] [RN-29] [AC-04.5] [S6 resp. 10]

#### Scenario: Un ítem sin sourceDocumentTypes invalida el catálogo
- **GIVEN** una copia del catálogo 1.6.0 en la que `ki67` no tiene `sourceDocumentTypes`
- **WHEN** corre `catalog:validate`
- **THEN** termina con código distinto de 0 y el mensaje nombra `ki67` [US-263 AC-1] [RN-29]
