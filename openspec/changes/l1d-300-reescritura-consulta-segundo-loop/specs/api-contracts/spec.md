## ADDED Requirements

### Requirement: RagMeta.retrievalParams declara la reescritura sin nulos
`RagMeta.retrievalParams` de `rag-orchestrator` 1.10.0 MUST declarar en `required` `queryRewrite` (`{applied: boolean, reason: disparado | no_disparado | no_disponible | no_aplica}`, cerrado, sin `null`, `applied = true` ⇔ `disparado`); todos los ejemplos de respuesta de `/rag/query` y `/rag/follow-up` con `meta.retrievalParams` SHALL traerlo, los de seguimiento con `no_aplica` (decisión D-c; ADR-26, aditivo).

#### Scenario: Los ejemplos de query y follow-up traen queryRewrite [US-238 AC-1] [US-033 AC-13]
- **WHEN** `contracts:check` valida `contracts/examples/rag-query-*.json` y `rag-follow-up-*.json`
- **THEN** todos traen `meta.retrievalParams.queryRewrite` sin `null`, los de seguimiento con `reason = no_aplica`
- **AND** `rag-query-reescritura-aplicada.json` trae `{applied: true, reason: "disparado"}` y tiene su propio request `rag-query-request-reescritura-aplicada.json` con una `query` distinta de las demás

#### Scenario: Un queryRewrite nulo o incoherente rompe la verificación [US-238] [US-033 AC-13]
- **WHEN** un parche deja `reason` en `null`, quita `queryRewrite` de `required`, o un ejemplo trae `applied = true` con `reason = no_disparado`
- **THEN** `contracts:check` termina con código distinto de 0 y nombra el campo

#### Scenario: El proveedor emite queryRewrite en cada camino [US-238 AC-1] [US-238 AC-2] [US-238 AC-5]
- **WHEN** `contracts:verify-provider` valida las respuestas reales de `/rag/query` en rescate, primer loop con evidencia y LLM caído
- **THEN** validan contra `RagQueryInternalResponse` con `reason` `disparado`, `no_disparado` y `no_disponible` respectivamente

### Requirement: AnalysisBasis declara si la búsqueda se repitió con reformulación
`AnalysisBasis.sourcesConsulted` del `openapi.yaml` de `clinical-api` (versión 1.15.0) MUST declarar en `required` `queryRewritten` (`boolean`, sin `null`), descrito como verdadero solo cuando el segundo loop de reescritura rescató evidencia; ningún campo de `AnalysisBasis` SHALL contener la consulta reformulada (decisión D-d, 2026-10-30).

#### Scenario: Los ejemplos de la Base traen queryRewritten [US-238 AC-7] [FR-27]
- **WHEN** `contracts:check` valida los ejemplos con `analysisBasis`
- **THEN** todos traen `sourcesConsulted.queryRewritten`, `false` salvo `con-evidencia-reescritura.json`, que trae `true`
- **AND** un parche que lo quita de `required` o lo vuelve nullable hace terminar el comando con código distinto de 0
