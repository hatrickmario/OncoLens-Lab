# code-quality Specification

## Purpose
Define las reglas deterministas de calidad del código: dependencias entre capas, umbrales de tamaño y complejidad en un solo archivo, tamaño de componentes de web, lint y formato, y su reporte para la revisión de diseño (NFR-13).

## Requirements

### Requirement: Lint y formato únicos en la raíz del monorepo y en la CI

El monorepo SHALL ofrecer en la raíz `npm run lint` (ESLint con `--max-warnings 0`) y
`npm run format:check` (Prettier y `ruff format --check`, ambos con ancho de línea 100), y el job
`quality` de la CI MUST ejecutar los mismos comandos en cada PR y formar parte del agregador `ci-ok`.

#### Scenario: El código del S1 pasa lint y formato en local y en la CI [US-215 AC-1]

- **GIVEN** el monorepo con el código del S1 en la rama del PR
- **WHEN** se ejecutan `npm run lint` y `npm run format:check` en la raíz, y el job `quality` de la CI corre en el PR
- **THEN** ESLint corre en `web` y `clinical-api` con `typescript-eslint`, y en `web` además con `react-hooks`, `jsx-a11y` y el plugin de Next.js
- **AND** Prettier verifica `web`, `clinical-api` y `packages/`, y `ruff format --check` verifica `rag-orchestrator`
- **AND** ambos comandos terminan con código 0 y el job `quality` termina en `success` y figura en el `needs:` de `ci-ok` `[NFR-13]`

#### Scenario: Falta la herramienta de formato de Python [US-215 AC-1]

- **GIVEN** un entorno sin `ruff` en el `PATH`
- **WHEN** se ejecuta `npm run format:check`
- **THEN** el comando falla con código distinto de 0 e indica cómo instalar `ruff` desde `apps/rag-orchestrator/requirements-dev.txt`, sin omitir la verificación de Python en silencio

### Requirement: El código generado y los contratos quedan fuera de lint y formato

ESLint, Prettier y Ruff MUST excluir `packages/api-contracts/src/`,
`apps/rag-orchestrator/app/schemas/generated/` y los `openapi.yaml`, para que lo generado siga
idéntico a la salida de `contracts:generate`.

#### Scenario: Lo generado no se reformatea [US-215 AC-1]

- **GIVEN** `packages/api-contracts/src/`, `apps/rag-orchestrator/app/schemas/generated/` y los `openapi.yaml` de ambos backends
- **WHEN** se ejecuta `npm run format`
- **THEN** ninguno de esos archivos cambia y `npm run contracts:generate:check` sigue sin diferencias

### Requirement: El lint de web detecta errores de reglas de hooks

ESLint MUST tratar `react-hooks/rules-of-hooks` y `react-hooks/exhaustive-deps` como errores en
`apps/web`, y su salida MUST nombrar el archivo, la línea y la regla.

#### Scenario: Hook llamado dentro de un condicional [US-215 AC-2]

- **GIVEN** un componente de `web` que llama a un hook dentro de un `if`
- **WHEN** corre `npm run lint` (o el test de fixtures de `ci/tests/quality/`)
- **THEN** falla con `react-hooks/rules-of-hooks` y nombra el archivo y la línea `[NFR-13]`

#### Scenario: `useEffect` con una dependencia omitida [US-215 AC-2]

- **GIVEN** un componente de `web` cuyo `useEffect` usa una variable que no está en su lista de dependencias
- **WHEN** corre `npm run lint`
- **THEN** falla con `react-hooks/exhaustive-deps` como error (no como advertencia aceptada) y nombra el archivo y la línea `[NFR-13]`

### Requirement: El lint de web detecta problemas de accesibilidad

ESLint MUST aplicar el preset recomendado de `eslint-plugin-jsx-a11y` como errores en `apps/web`.

#### Scenario: Imagen sin texto alternativo [US-215 AC-3]

- **GIVEN** un componente de `web` con un `<img>` sin `alt`
- **WHEN** corre `npm run lint`
- **THEN** falla con `jsx-a11y/alt-text` y nombra el archivo y la línea `[NFR-12]` `[PRD §7]`

#### Scenario: Elemento interactivo sin rol ni manejador de teclado [US-215 AC-3]

- **GIVEN** un componente de `web` con un `<div onClick>` sin `role` ni `onKeyDown`
- **WHEN** corre `npm run lint`
- **THEN** falla con `jsx-a11y/click-events-have-key-events` o `jsx-a11y/no-static-element-interactions` `[NFR-12]` `[PRD §7]`

### Requirement: El lint de web prohíbe dangerouslySetInnerHTML

ESLint MUST aplicar `react/no-danger` como error en `apps/web`.

#### Scenario: Componente con dangerouslySetInnerHTML [US-215 AC-3] [SEG]

- **GIVEN** el fixture `ci/tests/quality/fixtures/web/dangerously-set.tsx` con `dangerouslySetInnerHTML`
- **WHEN** se lintea con el bloque `web` de `eslint.config.js`
- **THEN** falla con `react/no-danger` como error y nombra el archivo y la línea

### Requirement: Un módulo 'use client' no importa código del servidor

ESLint MUST impedir, como error, que un archivo de `apps/web` con la directiva `'use client'` importe `**/lib/server/**`, `@/lib/server/**` o `server-only`, aplicando `no-restricted-imports` solo a esos archivos; un archivo sin la directiva MUST NOT recibir ese error.

#### Scenario: Componente cliente que importa lib/server [US-215 AC-3] [SEG]

- **GIVEN** el fixture `cliente-importa-server.tsx`, que empieza con `'use client'` e importa `@/lib/server/clinical-api`
- **WHEN** se lintea con el bloque `web` de `eslint.config.js`
- **THEN** falla con `oncolens/no-restricted-imports-en-cliente` como error, nombra el archivo y la línea del import y el mensaje menciona `lib/server`

#### Scenario: Módulo de servidor que importa lib/server [US-215 AC-3]

- **GIVEN** el fixture `servidor-importa-server.tsx`, sin la directiva `'use client'`, con el mismo import
- **WHEN** se lintea con el bloque `web` de `eslint.config.js`
- **THEN** no hay mensajes de `oncolens/no-restricted-imports-en-cliente`

### Requirement: El formato se verifica y se corrige automáticamente sin cambiar el comportamiento

`npm run format:check` MUST fallar nombrando cada archivo `.ts`, `.tsx` o `.py` sin formatear, y
`npm run format` MUST corregirlo sin cambiar su comportamiento.

#### Scenario: Archivo sin formatear en el PR [US-215 AC-4]

- **GIVEN** un archivo `.ts`, `.tsx` o `.py` sin formatear
- **WHEN** corre el job `quality`
- **THEN** `format:check` falla nombrando el archivo `[NFR-13]`

#### Scenario: El formateo automático conserva el comportamiento [US-215 AC-4]

- **GIVEN** los mismos archivos sin formatear
- **WHEN** se ejecuta `npm run format`
- **THEN** `format:check` pasa sobre ellos
- **AND** su comportamiento no cambia: los tests siguen en verde (la función del fixture `.ts` devuelve lo mismo y el AST del fixture `.py` es idéntico)

### Requirement: ESLint y Prettier no entran en conflicto

`eslint-config-prettier` MUST ser la última entrada de `eslint.config.js`, de modo que ninguna regla
de estilo de ESLint marque un archivo formateado por Prettier. (asumido; aceptado `[S1 resp. 3]`)

#### Scenario: Archivo formateado por Prettier pasa ESLint sin errores de estilo [US-215 AC-5]

- **GIVEN** un archivo `.ts` o `.tsx` formateado por Prettier con la configuración raíz
- **WHEN** corre ESLint con `eslint.config.js`
- **THEN** ninguna regla de estilo lo marca
- **AND** la comprobación de `eslint-config-prettier` sobre la configuración no reporta reglas en conflicto (asumido)

### Requirement: Un comando de calidad con reporte determinista
`npm run quality` MUST ejecutar ESLint en `web` y `clinical-api`, `dependency-cruiser` sobre `apps/` y `packages/`, y Ruff e `import-linter` en `rag-orchestrator`, y `npm run quality:report` MUST escribir `reports/quality/latest.json` con `{tool, rule, file, line, symbol, measured, threshold}` por hallazgo. El job `quality` de la CI MUST ejecutar lo mismo en cada PR.

#### Scenario: El monorepo actual pasa la calidad y deja el reporte [US-213 AC-1]
- **GIVEN** el monorepo de `main` con las correcciones o excepciones de D5
- **WHEN** se ejecutan `npm run quality` y `npm run quality:report`
- **THEN** termina con código 0 y `reports/quality/latest.json` existe con los hallazgos por herramienta, regla, archivo y línea

### Requirement: Reglas de capas en Node y en Python
Las dependencias entre capas MUST verificarse con `dependency-cruiser` (`controller-sin-acceso-a-datos`, `web-solo-por-bff`, `componentes-sin-datos`, `sin-ciclos`, `api-contracts-generado`) y con `import-linter` (`dominio-independiente`, `capas-hexagonales`), y una violación MUST hacer fallar el job nombrando la regla y el archivo o import.

#### Scenario: Un controller que importa Prisma hace fallar la calidad [US-213 AC-2]
- **GIVEN** el fixture `apps/clinical-api/src/modules/**/x.controller.ts` que importa `@prisma/client`
- **WHEN** corre `npm run quality`
- **THEN** falla y el mensaje nombra `controller-sin-acceso-a-datos` y el archivo

#### Scenario: web que importa clinical-api hace fallar la calidad [US-213 AC-2]
- **GIVEN** el fixture de `apps/web/**` que importa `apps/clinical-api/**`
- **WHEN** corre `npm run quality`
- **THEN** falla y el mensaje nombra `web-solo-por-bff` y el archivo

#### Scenario: El dominio de Python que importa infraestructura hace fallar la calidad [US-213 AC-3]
- **GIVEN** el fixture de `app/domain/` que importa `app/infrastructure/`
- **WHEN** corre `npm run quality`
- **THEN** `import-linter` falla con el contrato `dominio-independiente` y nombra el import

#### Scenario: application que importa api hace fallar la calidad [US-213 AC-3]
- **GIVEN** el fixture de `app/application/` que importa `app/api/`
- **WHEN** corre `npm run quality`
- **THEN** falla con el contrato `capas-hexagonales`

### Requirement: Umbrales de tamaño y complejidad en un solo archivo
Los umbrales MUST vivir solo en `quality-thresholds.json` (RN-22); ESLint y Ruff MUST aplicarlos sin otra edición, y un umbral ausente o no numérico MUST hacer fallar el job con el nombre de la clave.

#### Scenario: Una función de clinical-api por encima del umbral hace fallar la calidad [US-213 AC-4]
- **GIVEN** el fixture con una función de 41 líneas y `maxLinesPerFunction = 40`
- **WHEN** corre `npm run quality`
- **THEN** falla nombrando `max-lines-per-function`, la función, 41 y 40

#### Scenario: Una función de rag-orchestrator por encima del umbral hace fallar la calidad [US-213 AC-5]
- **GIVEN** el fixture con complejidad 11 y `C901` = 10
- **WHEN** corre `npm run quality`
- **THEN** falla nombrando `C901`, la función y el umbral

#### Scenario: Cambiar un umbral solo en el archivo de umbrales cambia el resultado [US-213 AC-6] (asumido)
- **GIVEN** el fixture de 41 líneas que falla con 40
- **WHEN** se cambia `maxLinesPerFunction` a 45 solo en `quality-thresholds.json` y se sincroniza Ruff
- **THEN** `npm run quality` pasa sin editar ningún otro archivo de configuración

#### Scenario: Un umbral ausente hace fallar con el nombre de la clave [US-213 AC-6] (asumido)
- **GIVEN** `quality-thresholds.json` sin `complexity`
- **WHEN** corre `npm run quality`
- **THEN** falla nombrando la clave `complexity`

### Requirement: Tamaño de componentes de web en dos niveles
Los `.tsx` de `apps/web/components/**` y `apps/web/app/**`, contados sin blancos ni comentarios, MUST emitir una alerta por encima de `web.componentLinesWarn` (100) y hacer fallar el job por encima de `web.componentLinesError` (150); `components/ui/**`, tests, stories y código generado MUST quedar excluidos.

#### Scenario: Un componente de 120 líneas alerta sin fallar [US-213 AC-7]
- **GIVEN** el fixture `.tsx` de 120 líneas
- **WHEN** corre `npm run quality`
- **THEN** el job no falla y `latest.json` trae la alerta con el archivo, 120 y 100

#### Scenario: Un componente de 151 líneas hace fallar la calidad [US-213 AC-7]
- **GIVEN** el fixture `.tsx` de 151 líneas
- **WHEN** corre `npm run quality`
- **THEN** falla nombrando el archivo, 151 y 150

#### Scenario: Las primitivas de shadcn no se miden [US-213 AC-7]
- **GIVEN** un archivo de 200 líneas en `apps/web/components/ui/`
- **WHEN** corre `npm run quality`
- **THEN** no hay hallazgo de tamaño para ese archivo

### Requirement: Tests desactivados o enfocados hacen fallar la calidad
El job `quality` MUST fallar cuando un archivo de test de `web`, `clinical-api` o `rag-orchestrator` desactiva o enfoca un test (formas de Vitest y de Pytest listadas en los escenarios), nombrando archivo, línea y regla, y MUST dejar cada hallazgo en `reports/quality/latest.json`. Las excepciones de `quality-thresholds.json` SHALL NOT eximir estas reglas.

#### Scenario: Un it.only en un test de clinical-api hace fallar la calidad [US-213 AC-8]
- **GIVEN** el fixture de PR `ci/tests/quality/` con un `it.only` en un test de `apps/clinical-api`
- **WHEN** corre `npm run quality`
- **THEN** termina con código distinto de 0 nombrando el archivo, la línea y `vitest/no-focused-tests`

#### Scenario: Un it.skip, xit o it.todo en web hace fallar la calidad [US-213 AC-8]
- **GIVEN** fixtures con `it.skip`, `xit` y `it.todo` en tests de `apps/web`
- **WHEN** corre `npm run quality`
- **THEN** cada uno falla nombrando el archivo, la línea y `vitest/no-disabled-tests` o `vitest/no-focused-tests`

#### Scenario: Un marcador skip, skipif o xfail en Pytest hace fallar la calidad [US-213 AC-8]
- **GIVEN** fixtures con `@pytest.mark.skip`, `@pytest.mark.skipif`, `@pytest.mark.xfail`, `pytest.skip(` y `pytest.xfail(` en tests de `apps/rag-orchestrator`
- **WHEN** corre `npm run quality`
- **THEN** cada uno falla nombrando el archivo, la línea y `tests-sin-desactivar`, y el hallazgo aparece en `latest.json`

#### Scenario: Las mismas palabras fuera de un archivo de test no alertan [US-213 AC-8] (asumido)
- **GIVEN** un módulo de producción o un comentario de documentación que contiene el texto `pytest.skip(` sin ser un archivo de test
- **WHEN** corre `npm run quality`
- **THEN** no hay hallazgo de `tests-sin-desactivar` para ese archivo

### Requirement: Cada AC de un change activo tiene un test de aceptación tagueado
`scripts/quality/check-ac-coverage` MUST leer los AC de las historias enlazadas en el `proposal.md` de cada change activo de `openspec/changes/` (excluido `archive/`) y MUST emitir en `reports/quality/latest.json` una **alerta** por cada AC sin al menos un test cuyo título termine en `[US-xxx AC-n]` (Vitest, Playwright) o marcado con `@pytest.mark.ac("US-xxx", n)`. El chequeo SHALL NOT hacer fallar el job y SHALL NOT alertar por tests sin tag.

#### Scenario: Un AC sin test tagueado produce una alerta sin fallar [US-213 AC-9] (asumido)
- **GIVEN** un change activo de fixture cuya historia tiene AC-1 y AC-2 y solo existe un test terminado en `[US-900 AC-1]`
- **WHEN** corre `npm run quality`
- **THEN** el job termina con código 0 y `latest.json` contiene una alerta `check-ac-coverage` que nombra `US-900 AC-2` y el change

#### Scenario: El marcador ac de Pytest cuenta como test de aceptación [US-213 AC-9]
- **GIVEN** un change activo de fixture con AC-1 cubierto solo por un test de Pytest con `@pytest.mark.ac("US-900", 1)`
- **WHEN** corre `npm run quality`
- **THEN** no hay alerta para `US-900 AC-1`

#### Scenario: Los unitarios sin tag no alertan [US-213 AC-9]
- **GIVEN** tests unitarios sin tag `[US-xxx AC-n]` en el repositorio
- **WHEN** corre `check-ac-coverage`
- **THEN** no genera alertas por esos tests

#### Scenario: Un marcador ac sin registrar hace fallar Pytest [US-213 AC-9] (asumido)
- **GIVEN** `pyproject.toml` con `--strict-markers` y el marcador `ac` registrado
- **WHEN** un test usa un marcador mal escrito (`@pytest.mark.acc`)
- **THEN** Pytest falla en la recolección nombrando el marcador

### Requirement: vi.mock solo sobre bordes arquitectónicos
El job `quality` MUST fallar con la regla `mock-solo-en-bordes`, nombrando el módulo, cuando un test de `web` o `clinical-api` llama `vi.mock` sobre una ruta relativa (`./`, `../`), un alias propio (`@/`, `@oncolens/`) o `@prisma/client`; `vi.mock` de paquetes de terceros que son borde (clientes HTTP, SDK de MinIO) MUST permitirse.

#### Scenario: vi.mock de un módulo propio hace fallar la calidad [US-213 AC-10]
- **GIVEN** fixtures con `vi.mock('./patients.repository')`, `vi.mock('@/lib/server/patients')` y `vi.mock('@prisma/client')`
- **WHEN** corre `npm run quality`
- **THEN** cada uno falla con `mock-solo-en-bordes` nombrando el módulo, el archivo y la línea

#### Scenario: vi.mock de un cliente de terceros que es borde se permite [US-213 AC-10]
- **GIVEN** un test con `vi.mock` del SDK de MinIO
- **WHEN** corre `npm run quality`
- **THEN** no hay hallazgo de `mock-solo-en-bordes`

### Requirement: Handlers de HTTP saliente construidos desde los ejemplos del contrato
Los tests de integración que necesitan HTTP saliente MUST usar los handlers de MSW de `packages/test-support/msw/` en `web` y `clinical-api`, y los de `respx` de `apps/rag-orchestrator/tests/support/http.py` en `rag-orchestrator`, construidos desde `contracts/examples/` (ADR-26); un handler con un campo que no existe en su ejemplo MUST hacer fallar su propio test.

#### Scenario: Un handler de MSW con un campo ajeno al ejemplo hace fallar su test [US-213 AC-10] [ADR-26]
- **GIVEN** un handler de `packages/test-support/msw/` construido desde `contracts/examples/rag-query-con-evidencia.json` al que se añade un campo que no existe en el ejemplo
- **WHEN** corre el test que lo usa
- **THEN** el test falla nombrando el campo y el ejemplo de origen

#### Scenario: Un handler de respx con un campo ajeno al ejemplo hace fallar su test [US-213 AC-10] [ADR-26]
- **GIVEN** un handler de `tests/support/http.py` construido desde un ejemplo de `contracts/examples/` con un campo añadido
- **WHEN** corre el test de Pytest que lo usa
- **THEN** el test falla nombrando el campo y el ejemplo de origen

### Requirement: Cobertura de líneas cambiadas como alerta
El job `quality` MUST escribir en `reports/quality/latest.json` el porcentaje de líneas cambiadas cubiertas por archivo cambiado frente a `origin/main`, y MUST emitir una **alerta** bajo `coverage.changedLinesWarn` (RN-22) en las rutas de `coverage.alertPaths` (`app/domain/**` de `rag-orchestrator`, `*.service.ts` de `clinical-api`, `apps/web/lib/**`). El job SHALL NOT fallar por cobertura ni aplicar un umbral global; una clave ausente o no numérica MUST hacerlo fallar con su nombre.

#### Scenario: Un service con líneas cambiadas sin cubrir alerta sin fallar [US-213 AC-11] (asumido)
- **GIVEN** un PR de fixture que cambia 10 líneas de un `*.service.ts` de `clinical-api` y los tests cubren 5, con `coverage.changedLinesWarn` en `quality-thresholds.json`
- **WHEN** corre el job `quality`
- **THEN** termina con código 0 y `latest.json` contiene el archivo, el porcentaje 50 y una alerta con el umbral leído de la configuración

#### Scenario: Un archivo fuera de las rutas acotadas no alerta por cobertura [US-213 AC-11] (asumido)
- **GIVEN** un PR que cambia sin cubrir un archivo de `scripts/`
- **WHEN** corre el job `quality`
- **THEN** `latest.json` puede registrar su porcentaje, pero no emite alerta de cobertura y el job no falla

#### Scenario: La clave de cobertura ausente hace fallar con su nombre [US-213 AC-11] [RN-22] (asumido)
- **GIVEN** `quality-thresholds.json` sin `coverage.changedLinesWarn`
- **WHEN** corre `npm run quality`
- **THEN** falla nombrando la clave `coverage.changedLinesWarn`
