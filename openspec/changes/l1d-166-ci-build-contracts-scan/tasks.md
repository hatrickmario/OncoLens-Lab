# Tasks — l1d-166-ci-build-contracts-scan

> Matriz TDD (CLAUDE.md): CI, configuración y scripts → **test después** (el test o el fixture de
> PR en el mismo PR). Los escáneres (`pii-scan.mjs`, `dataset-class-check.mjs`) llevan además
> unitarios de su lógica pura. Sin contratos: no se edita ningún `openapi.yaml` ni
> `contracts/examples/`.
>
> **Secuencia de commits:** `chore(L1D-166)` configuración y escáneres → `test(L1D-166)` unitarios
> y fixtures → `ci(L1D-166)` *workflows* → `docs(L1D-166)` → `refactor(L1D-166)`.
> Solo valores sintéticos (`SINT-`) y claves/tokens generados en tiempo de ejecución; ningún dato
> real ni secreto versionado (RN-13, RN-14). Los escáneres nunca imprimen el valor detectado.
>
> Prerrequisitos (↪): `l1d-164-compose-stack` (workspaces, `test:infra`, `smoke:compose`, modo
> `fake`), `l1d-165-secrets-setup-scripts` (`test:secrets`, `fake-secrets.sh`) y, para el fixture
> de AC-2, el consumidor de `citedSources` de `l1d-103`/`l1d-104`. Lo que falte se condiciona con
> `omitido:` explícito (design.md D1) y se retira en 5.2.
> Punto de extensión: `l1d-193-terminos-prohibidos-rn23` (`lint-lenguaje`) y L1D-265 (`lint`)
> añaden su job y lo suman al `needs:` de `ci-ok`.

## 1. clinical-platform — configuración y herramientas

- [x] 1.1 `.nvmrc` (Node 22 LTS exacto, ≥ 22.18.0) y `.python-version` (3.13.x exacto); `ci/tools.lock` con versión exacta y SHA-256 de gitleaks y oasdiff comprobados en la fuente; commit `chore(L1D-166)` · test después [US-036 AC-1]
- [x] 1.2 `vitest.config.ts` raíz con `test.exclude` = defaults + `.claude/**` + `**/node_modules/**`; test "el vitest raíz no recoge tests bajo .claude/worktrees ni node_modules [US-036 AC-7]" (directorio temporal con un test en cada ruta, salida JSON) · test después [US-036 AC-7] [Pre-S1-cierre P-8]
- [x] 1.3 `.mcp.json`: `@playwright/mcp@<x.y.z>` y `chrome-devtools-mcp@<x.y.z>` exactos, comprobados en npm · test después [Pre-S1-cierre P-6]
- [x] 1.4 `scripts/contracts/__tests__/reglasSinListasLiterales.test.mjs`: "falla nombrando la regla cuando una regla de scripts/contracts/rules declara una lista literal de nombres de identidad o rutas en lugar de importar lib/identity.mjs o lib/paths.mjs" (AST con `typescript` de devDependencies; un caso en rojo sobre una regla de fixture y verde sobre las reglas actuales) · test después [Pre-S1-cierre P-8]
- [x] 1.5 `.gitleaks.toml` (`useDefault = true`, regla JWT propia, allowlist solo por ruta y vacía) · test después [US-036 AC-3]
- [x] 1.6 `config/pii-formats.json` (design.md D5: `documento_identidad` con palabra clave, `telefono` E.164 y local con palabra clave, `correo` con `dominiosExentos` RFC 2606/6761; versión; fuente única que reutiliza L1D-203), `config/pii-scan.json` (`raiz: git-ls-files` + `excluir` con `motivo`, solo patrones de `EXCLUSIONES_PERMITIDAS`: lockfiles), `config/pii-allowlist.json` (entradas `{ fixture, clase: sintetico, rutas: [globs], valores: [{ formato, sha256 }], motivo }` con los seis globs iniciales de design.md D5 y los hashes obtenidos ejecutando el escáner sobre `main`, sin valores en claro) y `config/dataset-roots.json` (`["data/eval/", "data/evaluation/"]`) · test después [US-036 AC-4, AC-5] [RN-22]
- [x] 1.7 `scripts/ci/lib/claseDatos.mjs`: Extraer `manifiestoMasCercano()` y `declaraClaseSintetico()` (una sola definición de "marcado `sintetico`", acepta `clase: sintetico` en manifiesto o cabecera); E/S por funciones inyectadas · test después [US-036 AC-4, AC-5] [RN-13]
- [x] 1.8 `scripts/ci/pii-scan.mjs`: raíz `git ls-files` menos las exclusiones de `config/pii-scan.json` (rechaza toda exclusión que no sea idéntica a un patrón de la lista cerrada `EXCLUSIONES_PERMITIDAS` del código: lockfiles y binarios); texto por ausencia de NUL; dominios de correo de `dominiosExentos` no son hallazgo; Extraer `detectarPii(texto, formatos)`, `normalizarValor(formato, valor)`, `estaEnAllowlistSintetica(ruta, formato, sha256, allowlist)` (ruta casa con un glob **y** hash en `valores` de la misma entrada), `validarAllowlist(allowlist)` y `validarExclusiones(excluir)`; salida `ruta:línea: <id>` sin valor (con `--hash`, el sha256 del valor normalizado para poblar la allowlist); binarios listados como "no escaneado"; código ≠ 0 ante hallazgo, exclusión fuera de la lista cerrada o entrada de allowlist inválida · test después [US-036 AC-4] [RN-14]
- [x] 1.9 `scripts/ci/dataset-class-check.mjs`: mensaje literal "dataset sin clase de datos \`sintetico\`" con la ruta · test después [US-036 AC-5] [RN-13]
- [x] 1.10 Unitarios en `scripts/ci/__tests__/` (Vitest, directorios temporales, sin `vi.mock` de módulos propios): "devuelve documento_identidad en la línea 7 sin el valor cuando el número va precedido de su palabra clave [US-036 AC-4]", "no informa un número de 8 dígitos sin palabra clave [US-036 AC-4]", "detecta un teléfono E.164 [US-036 AC-4]", "informa PII en contracts/examples y en apps/*/test* con la raíz git ls-files [US-036 AC-4]", "rechaza una exclusión que cubre docs/ [US-036 AC-4]", "rechaza una exclusión que no está en la lista cerrada de lockfiles y binarios [US-036 AC-4]", "no informa correos de dominios reservados example.com, .test, .local, .invalid y .localhost [US-036 AC-4]", "omite un valor cuya ruta casa con un glob y cuyo hash está en la entrada de FX-T4a-a [US-036 AC-4]", "sigue informando un valor sin hash en la entrada aunque la ruta case [US-036 AC-4]", "sigue informando un valor con hash listado en una ruta fuera de los globs [US-036 AC-4]", "falla nombrando la entrada de la allowlist sin clase sintetico [US-036 AC-4]", "falla nombrando la entrada de la allowlist sin valores [US-036 AC-4]", "falla nombrando la entrada con un glob más amplio que un directorio de fixture como backlog/** o apps/clinical-api/test/** [US-036 AC-4]", "acepta los seis globs iniciales de la allowlist [US-036 AC-4]", "falla con dataset sin clase de datos sintetico cuando no hay manifiesto [US-036 AC-5]", "pasa cuando el manifiesto más cercano declara clase sintetico [US-036 AC-5]"; commit `test(L1D-166)` · test después
- [x] 1.11 `scripts/ci/contracts-breaking.sh <base-ref>` (design.md D3): base extraída con `git show` a un directorio temporal, empaquetado con `scripts/contracts/lib/bundle.mjs`, `oasdiff breaking --fail-on ERR` por proveedor (los `WARN`, incluido `response-body-wrapped-in-one-of-original-preserved`, se imprimen y no rompen; ADR-26), salida con proveedor y cambio · test después [US-036 AC-2] [NFR-13]
- [x] 1.12 `scripts/ci/check-branch-protection.sh` (solo lectura con `gh api`; acepta `--from-file` para el fixture) y su test con una respuesta de fixture sin `ci-ok` requerido · test después [US-036 AC-6]
- [x] 1.13 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-166)`

## 2. clinical-platform — workflows

- [x] 2.1 `.github/workflows/ci.yml` (design.md D1): `pull_request` y `push: main`, `concurrency` por ref, `permissions: contents: read`, acciones por SHA, Node desde `.nvmrc`, Python desde `.python-version`; jobs `build-test` (build y test de los workspaces con `--if-present`, `npx vitest run` raíz, `pip install -r apps/rag-orchestrator/requirements.txt` + `pytest` en el mismo job que ya hizo `setup-node` + `npm ci` (lo necesita el *helper* de validación de respuestas de L1D-164), `npm run test:infra`, `npm run test:secrets`), `contracts` (`contracts:check`, venv + `requirements-codegen.txt` + `contracts:generate:check`, `contracts-breaking.sh` contra la base del PR), `secret-scan` (gitleaks `dir` + `git --log-opts=<base>..HEAD`, `--redact`), `data-scan` (los dos escáneres), `stack-smoke` (`npm run smoke:compose`, `LLM_PROVIDER=fake`, secretos ficticios), `ci-ok` (`if: always()`, falla si algún `needs` no es `success` y lo nombra); sin `continue-on-error` ni `secrets.*`; pasos de dependencias aún ausentes con `omitido: <motivo>`; commit `ci(L1D-166)` · test después [US-036 AC-1…AC-5, AC-7]
- [x] 2.2 Fixtures de PR `ci/tests/cases/` (design.md D7): `ac1-limpio`, `ac2-cited-sources`, `ac2-oneof-aditivo`, `ac3-pem`, `ac3-token` (clave y token generados en tiempo de ejecución, añadido y borrado en dos commits), `ac4-documento`, `ac4-telefono`, `ac4-fuera-de-data`, `ac4-allowlist`, `ac4-correo-reservado`, `ac5-sin-clase`, `ac7-generado-desactualizado`; `ci/tests/run-cases.sh` con `git clone --local` a `mktemp -d`, mismo comando que el job, comparación de código, mensaje y archivo, limpieza al final; salida en rojo y en verde guardada para el reporte; commit `test(L1D-166)` · test después [US-036 AC-1…AC-5, AC-7]
- [x] 2.3 `.github/workflows/ci-selftest.yml`: corre `run-cases.sh` en PRs que tocan `.github/workflows/**`, `ci/**`, `scripts/ci/**`, `config/**` o `.gitleaks.toml`, y por `workflow_dispatch` · test después
- [x] 2.4 Test estático de `ci.yml` (`ci/tests/workflow.test.mjs`, parseo con `yaml`): "todos los jobs están en el needs de ci-ok", "ningún paso usa continue-on-error ni secrets", "toda acción está fijada por SHA", "no hay disparador pull_request_target", "el job que corre pytest tiene setup-node y npm ci antes" · test después [US-036 AC-1, AC-6]
- [x] 2.5 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-166)`

## 3. ai-services

- [x] 3.1 Sin código: confirmar que `build-test` instala `apps/rag-orchestrator/requirements.txt` y ejecuta `pytest` con adapters falsos y con `node` disponible para `scripts/contracts/bundle-json.mjs`, sin acceso a red salvo al registro de paquetes · test después [US-036 AC-1]

## 4. Protección de rama y PR de prueba (humano)

- [ ] 4.1 **Humano administrador:** tras el primer verde en `main`, activar en GitHub la protección de `main` (PR obligatorio, *status check* requerido `ci-ok`, sin *bypass*, rama al día); ningún agente cambia la configuración del repositorio [US-036 AC-6] (asumido) [S1 resp. 3]
- [ ] 4.2 PR de prueba desde `ci/selftest-ac6` con un fallo deliberado: captura del merge bloqueado y salida de `check-branch-protection.sh` adjuntas al PR de este change; el PR de prueba se cierra sin mergear [US-036 AC-6]

## 5. docs y cierre

- [x] 5.1 `docs/process/ci.md` (jobs, cómo añadir uno y sumarlo a `ci-ok`, cómo correr `ci/tests/run-cases.sh`, allowlist de PII y su revisión, por qué los escáneres no imprimen valores) y una línea en `docs/process/definition-of-done.md` que remite a la CI; commit `docs(L1D-166)` · test después
- [ ] 5.2 Con L1D-164, L1D-165 y L1D-103/L1D-104 en `main`: retirar los pasos `omitido:` de `ci.yml` y comprobar que `ac2-cited-sources` falla en el build de `clinical-api` (si no hay consumidor de `citedSources`, el change no se cierra) · test después [US-036 AC-2]
- [x] 5.3 `openspec validate l1d-166-ci-build-contracts-scan --strict` en verde
- [x] 5.4 `npx vitest run` raíz, `ci/tests/run-cases.sh` y la CI del propio PR en verde; `contracts:check` y `contracts:generate:check` en verde; `contracts:verify-provider` no aplica (sin cambios de API, US-214); `run-ai-eval` no aplica (no cambia modelo, prompt, umbral, catálogo ni corpus)
