---
name: sync-contracts
description: Regenera y verifica los contratos de OncoLens después de cambiar un endpoint o schema — exporta los OpenAPI de clinical-api (Zod) y rag-orchestrator (Pydantic), regenera packages/api-contracts y falla si hay drift entre ellos o con los deltas de OpenSpec. Úsala en /opsx:apply cuando un change toca APIs o el contrato EvidenceAnalysis.
argument-hint: "[change]"
---

# Sincronizar contratos

Convención de scripts del monorepo (los crea la plataforma base, FEAT-PL1). Si alguno no existe
todavía, no lo inventes: informa "pendiente de FEAT-PL1" y verifica a mano el punto 4.

| Script (raíz) | Qué hace |
|---|---|
| `npm run contracts:export` | Escribe `packages/api-contracts/openapi/clinical-api.json` y `rag-orchestrator.json` desde el código |
| `npm run contracts:generate` | Regenera tipos y clientes TypeScript en `packages/api-contracts/src/` |
| `npm run contracts:check` | Compara los schemas compartidos (p. ej., `EvidenceAnalysis`) entre ambos OpenAPI y falla si difieren |

## Pasos

1. `npm run contracts:export && npm run contracts:generate`.
2. `npm run contracts:check`. Si falla, el error nombra el schema y el campo: corrige **la capa
   que se desvió del delta de OpenSpec**, no el delta.
3. `git diff --stat packages/api-contracts` y revisa que solo cambió lo que el change declara en
   `design.md ## Contratos`.
4. Verificación manual mínima si faltan scripts: los campos de `EvidenceAnalysis`
   (`synthesis`, `applicability`, `evidenceOptions`, `discardedOptions`, `limitations`,
   `agentSteps`, `omittedClaims`, `analysisBasis`, `meta`) existen con el mismo tipo y
   nulabilidad en Zod y Pydantic; `top_relevance_score` admite `null`; ningún
   `recommendations`.
5. `openspec validate <change> --strict`.

Devuelve: comandos ejecutados con su resultado, schemas cambiados y cualquier drift encontrado.
Nunca edites a mano los archivos generados de `packages/api-contracts/src/`.
