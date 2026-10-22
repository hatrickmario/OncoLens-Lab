# Design — l1d-264-verificacion-proveedor

## Context

Hoy existen: `scripts/contracts/lib/responseValidator.mjs` (`matchesSpec`, `assertMatchesSpec`,
`[S1 resp. 17]`), llamado a mano en ~11 tests de integración de `clinical-api` y 4 de `apps/web`;
`apps/rag-orchestrator/tests/support/contract.py`, que empaqueta el spec con
`node scripts/contracts/bundle-json.mjs`; y en la CI `contracts:check`, `contracts:generate:check` y
`scripts/ci/contracts-breaking.sh` (L1D-166). Falta que **toda** respuesta se verifique sin depender
de que el test se acuerde, que los errores cuenten y que el Zod generado cubra las construcciones
que `@hey-api` no traduce.

## Goals / Non-Goals

**Goals:** verificación automática del proveedor en ambos backends; errores como contrato; alias
`contracts:breaking`; refinamientos generados del Zod; check de uso exclusivo de clientes generados.
**Non-Goals:** Pact, fuzzing, validación automática del BFF, nuevos endpoints.

## Decisions

### D1. Un solo validador (Ajv2020 de `scripts/contracts`) detrás de un *hook* del cliente de test
- **Recomendada:** `clinical-api/tests/support/verificarProveedor.ts` envuelve `supertest(app)` y,
  tras cada respuesta, resuelve `#/paths/<plantilla>/<método>/responses/<código>` (coincidencia de la
  ruta concreta con las plantillas del spec), comprueba que el código está declarado, que las
  cabeceras declaradas como `required` están, y valida el cuerpo con `matchesSpec`. En
  `rag-orchestrator`, un `event_hooks={"response": [...]}` del `TestClient` en `conftest.py` hace lo
  mismo con el spec empaquetado (vía `bundle-json.mjs`) y `jsonschema` Draft 2020-12.
- Error: `la respuesta no cumple <proveedor> <MÉTODO> <plantilla> <código>: <ruta JSON>: <mensaje>`.
- Descartadas: `express-openapi-validator` (segunda interpretación del spec, distinta de la de
  `contracts:check`; obliga a montar el middleware en la app) y `openapi-core`/`schemathesis`
  (dependencia nueva sin ganancia para validar respuestas).

### D2. Dónde corre en la CI
`contracts:verify-provider` = `CONTRACT_VERIFY=strict` + las suites de integración. Como la de
`clinical-api` necesita PostgreSQL de test, el paso va en el job `integration`
(`scripts/ci/integracion-clinical-api.sh`) y la de `rag-orchestrator` en `build-test`; ambos están en
`ci-ok`. El AC-1 dice «job `contracts`»: se cumple el fondo (cada PR, bloqueante) en los jobs que ya
tienen los servicios. **Decidido (usuario, 2026-10-22, `[S2 resp. 19]`)**: se adopta la opción ya implementada (ver Open Questions).

### D3. Refinamientos del Zod generados, no escritos a mano
`generate.mjs` recorre el spec empaquetado y, por cada `if/then`, `anyOf` de `required` y `allOf` con
`unevaluatedProperties: false`, emite `src/zod/<proveedor>/refinamientos.gen.ts` con un
`superRefine` por schema; el índice exporta los schemas refinados. Una construcción no reconocida
hace fallar `contracts:generate` (falla cerrado). Se prueba con los parches negativos de
`scripts/contracts/__fixtures__/parches/`. Descartada: validar con Ajv en el consumidor (dos
validadores en runtime en `web`).

### D4. `contracts:breaking` reutiliza la excepción declarativa de L1D-166
El AC-5 pide declarar el cambio incompatible aceptado «en `design.md` con la etiqueta». El mecanismo
vigente es `scripts/ci/contracts-breaking-excepciones.json` (excepción E-n de ADR-26, con motivo y
change). Se mantiene ese archivo como fuente y el `design.md` del change cita la E-n; no se parsea
Markdown en la CI. (asumido, ver Open Questions)

## Privacidad y ownership

Solo tests y scripts: no cruza datos entre servicios. Los mensajes de error nombran ruta, código y
ruta JSON, **nunca el valor** del campo (los cuerpos pueden llevar texto clínico sintético de
fixtures). `rag-orchestrator` sigue sin acceso a datos clínicos; el *hook* de Pytest no abre
conexiones nuevas.

## Contratos

Sin cambios en `apps/*/openapi.yaml` ni en `contracts/examples/`. Proveedores: `clinical-api` y
`rag-orchestrator`; consumidores: `web` y `clinical-api`. Lo generado nuevo
(`refinamientos.gen.ts`) sale del spec y no se edita a mano; `contracts:generate:check` lo cubre.
Compatible con ADR-26.

## Dependencias y colaboradores

- `scripts/contracts/lib/responseValidator.mjs` (se amplía: `verificarRespuesta(proveedor, método,
  ruta, status, cabeceras, cuerpo)`), `lib/operations.mjs` (resolver plantilla), `generate.mjs`.
- `apps/clinical-api/tests/support/verificarProveedor.ts` depende solo del validador; los tests
  pasan de `request(app)` a `clienteVerificado(app)`.
- Regla extraída: `resolverOperacion()` (ruta concreta → plantilla del spec) con nombre propio.

## Risks / Trade-offs

- Tests que hoy devuelven códigos no declarados fallarán: es el objetivo; se corrige el spec (con
  contract-first) o el código, nunca se desactiva la verificación.
- Coste de tiempo: el validador se compila una vez por proceso.

## Open Questions

- **Decidido (usuario, 2026-10-22, `[S2 resp. 19]`), afecta AC-1:** ¿basta con que `verify-provider` corra en `integration` y
  `build-test` (ambos en `ci-ok`) en lugar del job `contracts`? Decisión: sí (opción adoptada por el código).
- **Decidido (usuario, 2026-10-22, `[S2 resp. 19]`), afecta AC-5:** confirmado que la «etiqueta en `design.md`» se materializa como
  la excepción E-n de `contracts-breaking-excepciones.json` citada desde el `design.md`.

## Deuda anotada (cierre del Gate 2)

- Los Zod refinados (`z<Nombre>Refinado`) los consume ya `clinical-api` en `validarRespuestaInterna` (respuesta de
  `rag-orchestrator`, RN-02). Falta que `web` valide con ellos las respuestas del BFF (p. ej. `apps/web/lib/evidence/solicitar-analisis.ts`):
  este change no toca `web`; queda para su historia. Los refinamientos se importan como `./zod.gen.js` (NodeNext); `web`
  (Turbopack) necesitará una variante sin extensión, como `client-web`.
- `ci.yml` ejecuta el Pytest de `rag-orchestrator` dos veces en `build-test` (el paso existente y `contracts:verify-provider`):
  `ci/tests/workflow.test.mjs` exige un paso con `pytest` y `working-directory`. Redundancia aceptada y documentada en
  `docs/process/ci.md`; se elimina cuando ese test se ajuste.
- `respuestasAjenasAlContrato` sin `status` exime los códigos de una ruta de mentira (no existente en el contrato); una ruta
  que sí existe debe acotarse con `status` (el cliente lo exige).
- La detección de `assertConsumersUseGeneratedClients` es léxica (no ve alias de `fetch`) y recorre las rutas de
  `PATHS.consumerSources`; un directorio de código nuevo hay que añadirlo allí.
- Vectores dorados de verificación compartidos en `contracts/` (Ajv y jsonschema): hoy cada proveedor prueba su propio
  validador con sus tests; historia por crear en /sprint-close.
- Un empaquetado por job: cada job de la CI vuelve a empaquetar los specs; compartirlo es una historia por crear en
  /sprint-close.
- Nombres de claves de mapas abiertos (`extractedData`) y marca `sin_verificacion_de_proveedor` con motivo: historia por crear
  en /sprint-close.
