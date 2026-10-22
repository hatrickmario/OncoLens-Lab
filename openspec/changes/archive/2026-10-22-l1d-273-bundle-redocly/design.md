# Design — l1d-273-bundle-redocly

## Context

`context.mjs#bundleSpecs()` llama a `bundleOrFail(raw, evidenceRaw)` de forma síncrona;
`bundledSpecs.mjs#loadBundledSpecs()` (cacheada) la consumen `responseValidator.mjs` (tests de
integración de `clinical-api` y `web`), `bundle-json.mjs` (Pytest) y `scripts/ci/bundle-specs.mjs`
(oasdiff). Un test ya verifica que los `components.schemas` coinciden con los de Redocly.

## Decisions

### D1. Precalcular el empaquetado asíncrono y conservar la API síncrona
- **Recomendada:** `bundleSpecs()` pasa a `async` y lo esperan los CLIs (`check.mjs`, `generate.mjs`,
  `bundle-json.mjs`, `bundle-specs.mjs`, que ya son módulos ES con *top-level await*).
  `loadBundledSpecs()` conserva su firma síncrona leyendo un empaquetado precalculado en memoria por
  un `globalSetup` de Vitest (raíz, `clinical-api`, `web`) que llama a `prepararSpecsEmpaquetados()`;
  si no se precalculó, lanza un error explícito que lo dice (falla cerrado, sin empaquetar a medias).
- Descartadas: `deasync`/`execFileSync` de un subproceso (dependencia o latencia por llamada);
  volver asíncronos los ~15 tests que usan `assertMatchesSpec` (cambio de tests sin valor, y
  `l1d-264` los va a tocar).

### D2. Falla cerrado después de Redocly
`bundleDocument` resuelve lo que puede y anota problemas; tras empaquetar se recorre el resultado con
`walk.mjs`: cualquier `$ref` que no empiece por `#/` o un nombre de schema con sufijo de colisión
respecto a los nombres de origen (`evidence.yaml` + spec) produce el error
`<archivo>: <puntero>: $ref externa sin resolver <ref>` o `<archivo>: schema repetido <Nombre>`.

## Privacidad y ownership

Solo herramientas de build: no hay datos clínicos ni frontera de servicios. Nada se escribe en el
repositorio.

## Contratos

Sin cambios en `apps/*/openapi.yaml`, `contracts/` ni en lo generado; el AC-1 lo comprueba con
`contracts:generate:check` sin diferencias. Compatible con ADR-26.

## Dependencias y colaboradores

- `context.mjs` depende de `@redocly/openapi-core` (`bundleDocument`, `BaseResolver`, `Config` con
  `redocly.yaml`) y de `walk.mjs` para la comprobación de D2 (`verificarEmpaquetadoCerrado()`, método
  con nombre propio).
- Se borran `lib/bundle.mjs` y sus tests.

## Risks / Trade-offs

- Redocly puede reordenar claves: el AC-1 exige que lo generado y el extracto del readme no cambien;
  si cambian solo por orden, se normaliza el orden antes de generar (nunca se acepta un diff).
- El `globalSetup` añade ~1 s por suite.
- En modo `watch` el empaquetado no se recalcula: reinicia vitest tras editar un `openapi.yaml`.

## Open Questions

Ninguna.
