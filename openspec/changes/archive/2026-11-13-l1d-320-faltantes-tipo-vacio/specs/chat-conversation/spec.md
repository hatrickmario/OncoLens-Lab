## ADDED Requirements

### Requirement: Un 409 de catálogo tras el salto a 1.6.0 no persiste el turno

Con el catálogo 1.6.0, si `rag-orchestrator` responde `409 CATALOG_VERSION_MISMATCH` a un turno, `clinical-api` SHALL responder `409 ErrorCatalogVersionMismatch` (mapeo de l1d-315) y MUST NOT persistir el turno.

#### Scenario: Versiones de catálogo distintas entre backends

- **GIVEN** `clinical-api` con el catálogo `1.6.0` y `rag-orchestrator` (simulado con MSW desde `contracts/examples/rag-catalog-version-mismatch.json`) respondiendo `409`
- **WHEN** `doc1@test.local` envía un turno a una conversación abierta de `P-CHAT`
- **THEN** la respuesta es `409` con `error = CATALOG_VERSION_MISMATCH`, válida contra `apps/clinical-api/openapi.yaml`
- **AND** no existe fila nueva en `clinical.conversation_turn` [US-263 AC-7] [RN-22]
