## ADDED Requirements

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
