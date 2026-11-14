## ADDED Requirements

### Requirement: Operaciones de conversación en el spec de clinical-api
El spec de `clinical-api` MUST declarar `createConversation`, `createConversationTurn` y `getConversation` con
`x-permission`, los schemas cerrados del glosario del chat §2 y un ejemplo sintético por `200`/`201`. `Conversation` MUST
NOT exponer `threadId`; `ConversationTurn` MUST NOT declarar `citationIds` ni `memoryUsed`. El turno MUST declarar
`x-genera-ia: true`. El cambio SHALL ser aditivo (ADR-26), versión 1.24.0.

#### Scenario: Las operaciones de conversación están declaradas con sus errores [US-258 AC-1] [US-258 AC-2] [ADR-26] [DEC-22]
- **WHEN** `contracts:check` revisa `apps/clinical-api/openapi.yaml`
- **THEN** existen las tres operaciones con `401`, `403` y `404`
- **AND** `createConversationTurn` declara `x-genera-ia: true`, `403 PermisoDenegadoOOptOut`, `409 ErrorCatalogVersionMismatch`, `422 ErrorCuerpoInvalido`, `500 ErrorInterno`, `502 ErrorServicioIa`, `503 GeneracionNoDisponible` (`oneOf [ErrorLlmLocalNoDisponible, ErrorDesidentificacionNoDisponible, ErrorSalidaLlmInvalida]`, la misma respuesta reutilizable del análisis) y `504 DeadlineVencido`
- **AND** `ConversationTurn` declara `id`, `turnNumber`, `createdAt`, `question`, `intent` (`caso | faltantes | evidencia | fuentes_limitaciones | no_clasificada | fuera_de_alcance`), `status`, `topRelevanceScore` (número o `null`), `blocks[]` de `ChatBlock` con `kind` (`documentado | interpretacion | catalogo | evidencia | conflicto | faltante | limitacion | fuente`) y `citations[]` de `ChatCitation` por bloque, `dataLinks[]` de `ConversationDataLink`, `omittedClaims`, `analysisId` opcional, `notices[]`, `dataUsed[]` y `dataMissing[]`, sin `citationIds` ni `memoryUsed`
- **AND** `ConversationDataLink` declara `factRef`, `resourceType`, `resourceId`, `origin`, `relativeDay` y `recordedDate` (nullables los dos últimos), sin `historyPath`
- **AND** cada ejemplo `contracts/examples/conversation-*.json` valida contra su schema

#### Scenario: El cambio no rompe a los consumidores [US-258 AC-1] [ADR-26]
- **WHEN** `contracts:breaking` compara el spec con `main`
- **THEN** reporta 0 cambios incompatibles

#### Scenario: Las respuestas reales cumplen el spec, incluidos los errores [US-258 AC-1] [US-258 AC-8]
- **GIVEN** los tests de integración de las tres operaciones
- **WHEN** corre la verificación del proveedor
- **THEN** cada `201`, `200`, `403`, `404`, `409`, `500`, `502` y `503` emitido valida contra el spec de `clinical-api`
