# ADR-46 — Los contratos son provider-driven: el proveedor verifica sus respuestas y los consumidores usan clientes generados, sin Pact

> Linear: [L1D-264](https://linear.app/l1der-lab-mjbc/issue/L1D-264) · Historia: US-214 · Feature: FEAT-PL1 · Change: `l1d-264-verificacion-proveedor`
> Plantilla: MADR 4 (variante mínima, en español). Numeración: ADR-46 es el siguiente libre tras ADR-45 (ningún otro documento ni rama del repositorio lo usa a 2026-10-21).

- **Estado:** propuesto (lo acepta el humano al fusionar el PR)
- **Fecha:** 2026-10-21
- **Decisores:** usuario (propietario del producto); `contract-keeper` y `design-principles-reviewer` en el Gate 2
- **Consultados / informados:** `clinical-platform-dev`, `ai-services-dev`
- **Requisitos:** NFR-13, RN-02, ADR-26, B-10, readme §2.6 y §4

## Contexto y problema

Los dos `openapi.yaml` son la fuente única y están congelados desde el Pre-S1 (ADR-26). Faltaba que **toda** respuesta de un proveedor se verificara contra su spec sin depender de que cada test lo pidiera (el *helper* `assertMatchesSpec` era opt-in), y decidir si el acuerdo entre proveedor y consumidores se gestiona con contratos dirigidos por el consumidor (Pact y un *broker*) o dirigidos por el proveedor.

Hechos: un solo equipo; dos proveedores (`clinical-api`, `rag-orchestrator`) y consumidores conocidos y generados (`web` y `clinical-api` usan los clientes de `packages/api-contracts`); el contrato lo edita primero el proveedor (contract-first) y la CI ya detecta lo generado desactualizado (`contracts:generate:check`) y los cambios incompatibles (`oasdiff`, ADR-26).

## Factores de decisión

- Sin infraestructura nueva (un *broker* es un servicio más que operar con 32 GB y un equipo).
- Un solo validador, el mismo que ya usa `contracts:check` (Ajv2020), para que "el ejemplo cumple" y "la respuesta cumple" signifiquen lo mismo.
- Los errores también son contrato (US-214 AC-3) y no se imprime nunca el valor de un campo (RN-10, RN-14).
- La verificación debe ser automática y fallar cerrada (spec ilegible, operación no resuelta o código no declarado son error).

## Opciones consideradas

1. **Provider-driven: verificación automática de cada respuesta + clientes generados + `oasdiff`.**
2. Pact (contratos dirigidos por el consumidor) con *broker*.
3. `express-openapi-validator` en `clinical-api` y `openapi-core`/`schemathesis` en `rag-orchestrator`.

## Decisión

Opción elegida: **1**. Cada proveedor verifica sus propias respuestas en sus tests de integración:

- `clinical-api`: `clienteVerificado(app)` (`apps/clinical-api/tests/support/verificarProveedor.ts`) envuelve `supertest` y valida cada respuesta con `verificarRespuesta()` de `scripts/contracts` (código declarado, cabeceras `required` y cuerpo). Las rutas de mentira de un test se declaran una a una.
- `rag-orchestrator`: un *hook* de respuesta del `TestClient` (`tests/conftest.py`) con el mismo criterio sobre el spec empaquetado.
- `npm run contracts:verify-provider` ejecuta ambas suites con `CONTRACT_VERIFY=strict` (falla si un proveedor no verificó ninguna respuesta); corre en los jobs `integration` (necesita PostgreSQL) y `build-test`, ambos en `ci-ok`.
- Los consumidores usan solo los clientes generados; `contracts:check` rechaza un `fetch` o cliente HTTP directo fuera de los transportes declarados.
- Los cambios incompatibles los detecta `contracts:breaking` (`oasdiff`); solo pasan si están declarados como excepción E-n (ADR-26).
- El Zod generado se completa con refinamientos generados (`refinamientos.gen.ts`) de lo que `@hey-api` no traduce (`if/then`, `anyOf`, `allOf` con `unevaluatedProperties: false`), y falla cerrado ante una construcción desconocida.

### Consecuencias

- **Positivas:** cero infraestructura nueva; un solo intérprete del spec; un campo no declarado, un `topRelevanceScore: 0.0` en `sin_evidencia` o un `code` de error fuera del enum rompen el test del proveedor, no al consumidor.
- **Negativas:** el proveedor no sabe qué usa cada consumidor (no hay contratos por consumidor); un cambio compatible pero no usado nunca se detecta como innecesario. Aceptable con dos consumidores conocidos. La verificación de las respuestas del BFF (`apps/web/app/api`) sigue con el *helper* en sus tests (fuera de alcance).
- **Configuración (RN-22):** `VERIFY_PROVIDER_SEGUNDOS` (tope por suite) y `VERIFY_PROVIDER_PYTHON` (intérprete); `CONTRACT_VERIFY=strict` lo fija el script.

### Confirmación

`scripts/contracts/__tests__/verificarRespuesta.test.mjs`, `verifyProvider.test.mjs`, `refinamientos.test.mjs`, `rules/assertConsumersUseGeneratedClients.test.mjs`, `scripts/ci/__tests__/contractsBreakingCasos.test.mjs` y `verificacionProveedorEnCi.test.mjs`; los tests de aceptación `[US-214 AC-2]` y `[US-214 AC-3]` de `apps/clinical-api/tests/integration/verificacion-proveedor/`; y la revisión de `contract-keeper` en el Gate 2.

## Pros y contras de las opciones

### 1. Provider-driven con verificación automática

- A favor: sin *broker*; misma semántica que `contracts:check`; el spec manda.
- En contra: sin contratos por consumidor.

### 2. Pact

- A favor: documenta qué usa cada consumidor.
- En contra: *broker* y *pipeline* adicionales sin ganancia con dos consumidores conocidos y un contrato congelado; duplica la fuente de verdad (spec y pactos).

### 3. `express-openapi-validator` y `openapi-core`

- A favor: ecosistema conocido.
- En contra: una segunda interpretación del spec distinta de la de `contracts:check`; obliga a montar un *middleware* en la app o a una dependencia nueva sin ganancia para validar respuestas.

## Más información

`openspec/changes/l1d-264-verificacion-proveedor/design.md` (D1–D4), `docs/process/ci.md`. Revisión prevista: si aparecen consumidores externos al monorepo.
