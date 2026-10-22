# Proposal — l1d-273-bundle-redocly

## Trazabilidad

L1D-273 · US-223 · FEAT-PL1 (L1D-30) · Sprint 2 · Estimación **2** · — (técnica, deuda del Pre-S1) ·
NFR-13 · `[Pre-S1 resp. 35]` (D-6) · enmienda de D2 del change archivado
`2026-10-13-l1d-55-contract-schema-freeze` · `[US-033 AC-8]` · `[US-033 AC-16]` · US-223 AC-1…AC-3

> Fuente: `backlog/features/FEAT-PL1-plataforma-base.md` §US-223; DoR ✓ en
> `backlog/sprints/S2-refinamiento.md` §2. Sin `Pendiente de definir` en la historia.

## Why

`scripts/contracts/lib/bundle.mjs` (89 líneas) es un empaquetador propio que solo internaliza los
`$ref` a `contracts/schemas/evidence.yaml#/components/schemas/<Nombre>` y falla cerrado ante
cualquier otra `$ref` externa. Duplica lo que ya hace `bundleDocument` de `@redocly/openapi-core`
(devDependency fijada, 2.62.1) y obliga a mantener a mano sus casos límite (DPR-7).

## What Changes

- `scripts/contracts/lib/context.mjs` empaqueta con `bundleDocument` (en memoria, sin escribir en el
  repositorio) en lugar de `bundleOrFail`; los consumidores (`contracts:check`, `contracts:generate`,
  `bundledSpecs.mjs`, `bundle-json.mjs`, `scripts/ci/bundle-specs.mjs`, `responseValidator.mjs`)
  reciben el mismo spec empaquetado.
- **Falla cerrado (AC-2):** tras empaquetar, `$ref` externas sin resolver o un nombre de schema
  repetido (que Redocly renombraría con sufijo) hacen fallar el comando nombrando archivo y
  referencia, como hoy.
- **API síncrona conservada:** `bundleDocument` es asíncrono; `loadBundledSpecs()` y `matchesSpec()`
  se usan de forma síncrona en tests y CLIs. Se resuelve con un precálculo (design.md D1).
- **Sin código muerto (AC-3):** se eliminan `lib/bundle.mjs` y sus tests propios (commit con
  *trailer* `Test-Removal:`); sus casos pasan a `__tests__/empaquetado.test.mjs` contra la nueva
  implementación.

## Capabilities

### New Capabilities
- Ninguna.

### Modified Capabilities
- `api-contracts`: se añade el requisito del empaquetado con `bundleDocument` que falla cerrado
  (el comportamiento observable de `contracts:check` y `contracts:generate` no cambia).

## Bounded contexts

- **clinical-platform:** `scripts/contracts/**`, `scripts/ci/bundle-specs.mjs`.
- **ai-services / frontend:** ninguno (el *helper* de Pytest sigue llamando a `bundle-json.mjs`).

## Dependencias

- Ninguna bloqueante. ↪ Recomendado **antes** de `l1d-264-verificacion-proveedor`, que amplía
  `responseValidator.mjs` sobre el mismo empaquetado.

## Fuera de alcance

Cambios en los specs, en lo generado o en las reglas de `contracts:check`. Escribir specs
empaquetados en disco.

## Impact

`scripts/contracts/lib/{bundle,context,bundledSpecs}.mjs`, `scripts/contracts/__tests__/empaquetado.test.mjs`
y los tests de `bundle.mjs`. Sin dependencias nuevas.
