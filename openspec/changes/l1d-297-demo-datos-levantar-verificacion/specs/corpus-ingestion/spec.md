## ADDED Requirements

### Requirement: El corpus de la demo trae metadatos de población extraidos y verificados
El corpus de la demo ingerido con la extracción de población (US-242) MUST tener al menos 3 documentos con valores de población con `metadata_source = extraido_verificado`, cada valor con un `chunkId` de su documento y `nliResult = entailment`, todos con licencia aceptada (RN-21, RN-25).

#### Scenario: Al menos 3 documentos de la demo con población verificada [US-247 AC-1] [OUT-07] [RN-21] [RN-25]
- **GIVEN** el corpus de la demo ingerido con US-242
- **WHEN** se consulta el catálogo del corpus
- **THEN** al menos 3 documentos tienen valores de población con `metadata_source = extraido_verificado`
- **AND** cada valor tiene un `chunkId` de su documento, `nliResult = entailment` y licencia aceptada
