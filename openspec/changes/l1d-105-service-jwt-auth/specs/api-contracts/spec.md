## ADDED Requirements

### Requirement: Clientes HTTP generados con fetch inyectable
`contracts:generate` MUST generar con hey-api (plugins `@hey-api/client-fetch` + `@hey-api/sdk`, incluidos en `@hey-api/openapi-ts` con versión exacta fijada) un SDK por spec en `packages/api-contracts/src/client/clinical-api/` (para `web`) y `packages/api-contracts/src/client/rag-orchestrator/` (para `clinical-api`), con `baseUrl` y `fetch` inyectables; lo generado MUST NOT editarse a mano y `contracts:generate:check` SHALL detectarlo `[S1 resp. 13]`.

#### Scenario: Un SDK editado a mano o desactualizado rompe la verificación [US-054 AC-6] [S1 resp. 13]
- **WHEN** un parche edita un archivo de `packages/api-contracts/src/client/rag-orchestrator/` o el spec cambia sin regenerar
- **THEN** `npm run contracts:generate:check` termina con código distinto de 0 nombrando el archivo, y con el SDK regenerado termina con código 0

### Requirement: clinical-api llama a rag-orchestrator solo con el cliente generado sobre el transporte JWT
`clinical-api` MUST llamar a `rag-orchestrator` solo con `createRagOrchestratorClient()`, construido sobre `createRagOrchestratorFetch()`. `X-Request-Deadline` SHALL ser un parámetro tipado de la operación que pasa el servicio llamador; el transporte MUST NOT calcularlo ni añadirlo `[S1 resp. 13]`.

#### Scenario: El cliente de rag lleva el deadline del llamador y el JWT de servicio [US-054 AC-6] [S1 resp. 13]
- **GIVEN** `createRagOrchestratorClient()` con un par ES256 efímero, reloj congelado y MSW interceptando `POST /rag/query` en el borde HTTP
- **WHEN** el llamador invoca `ragQuery` con el cuerpo de `rag-query-request.json` y `X-Request-Deadline` = un instante sintético fijo, y en otra llamada sin ese parámetro
- **THEN** el request capturado lleva `X-Request-Deadline` igual al valor pasado y `Authorization: Bearer <jwt>` verificable con la clave pública, sin `Cookie`; sin el parámetro la cabecera `X-Request-Deadline` no aparece; y la respuesta se tipa como `RagQueryInternalResponse`
