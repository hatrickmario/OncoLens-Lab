## ADDED Requirements

### Requirement: RagMeta.retrievalParams declara la fusión sin nulos
`RagMeta.retrievalParams` de `rag-orchestrator` 1.7.0 MUST declarar en `required` `fusion` (`ninguna | rrf | ponderada`) y `fusionParam` (número ≥ 0), sin `null` y atados al modo por `if/then` (design.md D7); todos los ejemplos de `/rag/query` y `/rag/follow-up` SHALL traerlos (decisión D-c; ADR-26, aditivo).

#### Scenario: Los ejemplos de query y follow-up traen fusion y fusionParam [US-112 AC-5] [US-033 AC-13]
- **WHEN** `contracts:check` valida `contracts/examples/rag-query-*.json` y `rag-follow-up-*.json` contra `RagQueryInternalResponse` y `RagFollowUpResponse`
- **THEN** todos traen `meta.retrievalParams.fusion` y `fusionParam` sin `null`, los de modo `dense` con `fusion = ninguna` y `fusionParam = 0`
- **AND** `rag-query-hibrida.json` trae `retrievalMode = hibrida`, `fusion = rrf` y `fusionParam = 60` y tiene su propio request con una `query` distinta de las demás

#### Scenario: Un fusion nulo o incoherente con el modo rompe la verificación [US-112 AC-5] [US-033 AC-13]
- **WHEN** un parche deja `fusion` o `fusionParam` en `null`, los quita de `required`, o un ejemplo trae `retrievalMode = dense` con `fusion = rrf`
- **THEN** `contracts:check` termina con código distinto de 0 y nombra el campo
- **AND** también falla con `retrievalMode = hibrida` y `fusion = ninguna`, con `rrf` y `fusionParam` no entero o < 1, o con `ponderada` y `fusionParam` fuera de (0, 1)

#### Scenario: El proveedor emite la fusión en el modo dense [US-112 AC-6]
- **WHEN** `contracts:verify-provider` valida la respuesta real de `/rag/query` con `RETRIEVAL_MODE` sin definir
- **THEN** la respuesta valida contra `RagQueryInternalResponse` con `fusion = ninguna` y `fusionParam = 0`
