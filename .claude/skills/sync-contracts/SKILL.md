---
name: sync-contracts
description: Flujo contract-first de OncoLens cuando un change toca una API — el openapi.yaml del proveedor se edita primero, se valida (OpenAPI 3.1, vocabulario, ejemplos, cambios incompatibles con oasdiff) y solo después se generan desde él los tipos, clientes y schemas Zod/Pydantic. Úsala como primera tarea de '## contratos' en /opsx:apply; nunca generes el spec desde el código.
argument-hint: "[change]"
---

# Contract-first: el spec manda, el código se genera

**Fuente única:** `apps/clinical-api/openapi.yaml` y `apps/rag-orchestrator/openapi.yaml`,
congelados en el Pre-S1 a partir de readme §4.1 y §4.2 (US-033, ADR-26). Cada backend es el
**proveedor** de su contrato; los consumidores (`web` → `clinical-api`, `clinical-api` →
`rag-orchestrator`) solo usan lo generado. **Prohibido** escribir el spec desde Zod o Pydantic:
si el código y el spec difieren, se corrige el código.

## Scripts (convención; los crean US-033, US-036 y US-214)

| Script (raíz) | Qué hace |
|---|---|
| `npm run contracts:check` | Valida ambos specs contra OpenAPI 3.1, el vocabulario prohibido (`recommendations`, `/platform/rag/query`) y los ejemplos de `contracts/examples/` |
| `npm run contracts:breaking` | `oasdiff breaking` del spec de la rama contra `origin/main`; falla ante un cambio incompatible no declarado |
| `npm run contracts:generate` | Genera desde los specs: `packages/api-contracts/src/` (tipos y clientes TS), `packages/api-contracts/src/zod/` (schemas Zod **compartidos** por `web` y `clinical-api`) y `apps/rag-orchestrator/app/schemas/generated/` (modelos Pydantic) |
| `npm run contracts:verify-provider` | Tests de verificación del proveedor: cada respuesta real de cada backend se valida contra su propio spec (US-214) |

Si un script todavía no existe, no lo inventes: dilo ("pendiente de US-033/US-036/US-214") y haz a
mano la comprobación equivalente del paso correspondiente.

## Pasos (en este orden, antes de cualquier test o código del endpoint)

1. **Editar el spec del proveedor** según el delta de OpenSpec y `design.md ## Contratos`: rutas,
   schemas, códigos de estado, errores y **ejemplos** en `contracts/examples/` (incluidos los
   bordes: `sin_evidencia` con `topRelevanceScore: null`, `403`, `409`, `422 TIPO_NO_HABILITADO`).
2. `npm run contracts:check`.
3. `npm run contracts:breaking`. Un cambio incompatible solo es válido si el change lo declara en
   `design.md` y respeta ADR-26 (los bloques no disponibles van vacíos, no ausentes); si no, se
   rediseña el cambio.
4. `npm run contracts:generate`. Los archivos generados no se editan a mano (un hook lo bloquea).
5. Commit `contract(L1D-<nn>): <qué cambió en el spec>` con el spec, los ejemplos y lo generado.
6. Ahora sí: tests en rojo contra el contrato (TDD) e implementación.
7. Al final: `npm run contracts:verify-provider` y `openspec validate <change> --strict`.

Devuelve: diff del spec (rutas y schemas), resultado de cada comando, archivos generados y
cualquier cambio incompatible declarado.
