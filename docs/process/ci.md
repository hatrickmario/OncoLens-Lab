# CI de OncoLens

> US-036 (L1D-166, `openspec/changes/l1d-166-ci-build-contracts-scan`). El repositorio es público (RN-14): la CI no usa
> ningún secreto del repositorio, corre en `pull_request` (nunca `pull_request_target`) y sus escáneres **nunca imprimen
> el valor detectado**, porque el log de un repositorio público es público.

## Jobs de `.github/workflows/ci.yml`

Se ejecuta en cada `pull_request` y en cada `push` a `main`, con `permissions: contents: read` y todas las acciones
fijadas por SHA de commit (con el tag en un comentario). Node sale de `.nvmrc`, Python de `.python-version`, y gitleaks y
oasdiff de `ci/tools.lock` (versión exacta y SHA-256; `scripts/ci/install-tools.sh` se niega a instalar si la suma no
coincide).

| Job | Qué hace | Comandos |
|---|---|---|
| `build-test` | Build y tests de `web` y `clinical-api`, `vitest` raíz (scripts, `infra/`, fixtures de la CI; excluye `ci/tests/quality/`, que corre en `quality`), Pytest de `rag-orchestrator` (tras instalar `requirements.txt`, `requirements-dev.txt` y `requirements-eval.txt`, que importan `tests/evaluation/` y `test_settings_modelos`; con Node ya instalado: el *helper* de L1D-164 empaqueta el spec con `scripts/contracts/bundle-json.mjs`), `test:secrets`, y la **verificación del proveedor de `rag-orchestrator`** (US-214: el *hook* de respuesta del `TestClient` valida cada respuesta contra su `openapi.yaml`; `CONTRACT_VERIFY=strict` exige que se haya verificado alguna) | `npm run build --workspaces --if-present`, `npm run test:build --workspace apps/web` (US-060 AC-5: la URL interna no aparece en `.next/static`; `web` lo excluye de `npm test`), `npm test --workspaces --if-present`, `npx vitest run`, `python -m pytest`, `npm run contracts:verify-provider -- --proveedor rag-orchestrator` |
| `contracts` | Validación de los specs, código generado al día, cambios incompatibles contra la base del PR | `npm run contracts:check`, `npm run contracts:generate:check`, `scripts/ci/contracts-breaking.sh "$BASE_REF"` (local: `npm run contracts:breaking`, contra `origin/main`; imprime la excepción E-n aplicada). `contracts:check` rechaza además un `fetch` o cliente HTTP directo a un proveedor fuera de los clientes generados |
| `secret-scan` | gitleaks sobre el árbol y sobre los commits del PR (un secreto añadido y borrado en el mismo PR también falla), siempre con `--redact` | `scripts/ci/secret-scan.sh "$BASE_REF"` |
| `data-scan` | PII en **todo** `git ls-files` y clase de datos de los datasets de evaluación | `node scripts/ci/pii-scan.mjs`, `node scripts/ci/dataset-class-check.mjs` |
| `stack-smoke` | Levanta el Compose con `LLM_PROVIDER=fake` y secretos ficticios | `npm run smoke:compose` |
| `integration` | Integración de `clinical-api` contra el PostgreSQL de test del Compose (secretos ficticios; B-1 del S1). Última ejecución en `main` verificada en L1D-277 (AC-1): 199 tests en verde, job en `needs` de `ci-ok`. Corre con la **verificación del proveedor** activa (US-214): `clienteVerificado` de `apps/clinical-api/tests/support/` valida cada respuesta (código declarado, cabeceras obligatorias y cuerpo) contra `apps/clinical-api/openapi.yaml` y `CONTRACT_VERIFY=strict` falla si no se verificó ninguna | `scripts/ci/integracion-clinical-api.sh` (secretos ficticios de test, postgres del Compose y `npm run contracts:verify-provider -- --proveedor clinical-api`, que ejecuta los tests de `clinical-api` y `scripts/test-integration.sh`) |
| `integration-rag` | `pytest -m "servicios_reales and not models"` de `rag-orchestrator` (L1D-277, ARR-01) contra el PostgreSQL de test y el Milvus de test (etcd, MinIO de Milvus y standalone) del Compose. Pytest corre en el contenedor `rag-pruebas` (perfil `integracion-rag` de `infra/docker/docker-compose.test.yml`, target `pruebas` de la imagen) unido a `corpus-db-net` y `ai-net`: ningún servicio publica puerto al host y se usa el rol `rag_corpus` real. Solo recoge `tests/integration` (ahí viven todos los `servicios_reales`; un test lo comprueba) y solo este job los ejecuta: `addopts` los excluye de `build-test`. El contenedor monta únicamente los secretos `pg_test_admin_password`, `pg_rag_corpus_password` y `pg_rag_corpus_migrator_password` (los que exige el arnés `tests/support/pg.py`) y una copia de solo lectura de los archivos versionados que leen los tests: el script lo comprueba dentro del contenedor antes de correr Pytest (secretos montados, variables de entorno y árbol sin credenciales ni `.env`). Imprime el resumen por `@pytest.mark.ac` y falla si alguno de US-058 AC-1/3/4 y US-059 AC-1/3/4/5 no queda en verde. Si Milvus o PostgreSQL no quedan sanos en `INTEGRACION_RAG_ESPERA_SEGUNDOS` (420 s) el job falla nombrando el servicio. Sin reintentos; `timeout-minutes: 30`. Local (Docker + `npm ci`): `scripts/ci/integracion-rag-orchestrator.sh`; si otra pila usa las subredes `172.28.x`, fija `CLINICAL_NET_SUBNET` y `CORPUS_DB_NET_SUBNET` | `scripts/ci/integracion-rag-orchestrator.sh`, `node scripts/ci/verificar-acs-rag.mjs` (plugin `scripts/ci/pytest_plugins/resumen_por_ac.py`) |
| `quality` | Lint y formato del código (L1D-265): ESLint con `--max-warnings 0`, Prettier y `ruff format` en modo `--check`, y los tests de `ci/tests/quality/` (fixtures de AC-1…AC-5). Instala `ruff` de `apps/rag-orchestrator/requirements-dev.txt`; sin él `format:check` falla (nunca se omite). Local: `npm run lint`, `npm run format` y `npm run format:check` antes de cada commit | `npm run lint`, `npm run format:check`, `npm run test:quality` (config propia `vitest.quality.config.ts`) |
| `ci-ok` | Agregador: `needs` de todos los jobs, `if: always()`; falla si alguno no terminó en `success` (fallido, cancelado u omitido) y lo nombra | `node scripts/ci/verificar-needs.mjs` |

`ci-ok` es el **único** *required status check* de la protección de `main`: añadir un job no obliga a tocar la
configuración de GitHub.

### Verificación del proveedor y cambios incompatibles (US-214, `l1d-264`)

- `npm run contracts:verify-provider [-- --proveedor clinical-api|rag-orchestrator]...` ejecuta las suites de cada proveedor con
  `CONTRACT_VERIFY=strict`, muestra cuántas respuestas verificó por proveedor y falla si alguno verificó cero. Tope por suite:
  `VERIFY_PROVIDER_SEGUNDOS` (1200). Local: `clinical-api` necesita el PostgreSQL de test (`scripts/test-integration.sh`) y
  `rag-orchestrator` el intérprete de `VERIFY_PROVIDER_PYTHON` (`python`) con `requirements*.txt`.
- La verificación es automática, no opt-in. Los mensajes nombran proveedor, método, plantilla, código y ruta JSON, **nunca el
  valor** (un cuerpo puede llevar datos). Las rutas de mentira de un test (guard, manejador de errores) se declaran una a una en
  `clienteVerificado(app, { respuestasAjenasAlContrato })`; cualquier otra operación que el spec no resuelva falla cerrado.
- `npm run contracts:breaking` compara los specs con los de `origin/main`; un cambio incompatible solo pasa si está declarado en
  `scripts/ci/contracts-breaking-excepciones.json` (E-n de ADR-26) y el `design.md` del change lo cita.
- `contracts:generate` emite `packages/api-contracts/src/zod/<proveedor>/refinamientos.gen.ts` (`z<Nombre>Refinado`) con los
  `if/then`, `anyOf` de restricciones y `unevaluatedProperties` que el Zod de hey-api no traduce; una construcción que no sabe
  traducir hace fallar la generación. Decisión: ADR-46 (provider-driven sin Pact).

### Cómo añadir un job (punto de extensión)

L1D-193 (`lint-lenguaje`), L1D-265 (`lint`), US-213/214/217 y US-068 cuelgan sus jobs aquí:

1. Añade el job a `ci.yml` con un nombre estable; el paso llama a un script de `scripts/` o a un `npm run`, nunca a
   lógica escrita en el YAML (así el fixture de PR prueba lo mismo que la CI).
2. Súmalo al `needs:` de `ci-ok`. Quien llegue segundo integra el `needs:` sin borrar el del otro.
3. Si la historia tiene un caso de PR, créalo en `ci/tests/cases/<caso>/` (siguiente sección).
4. `ci/tests/workflow.test.mjs` falla si el job no está en `needs`, si usa `continue-on-error` o `secrets.*`, si una acción
   no está fijada por SHA o si el job que corre `pytest` no tiene `setup-node` y `npm ci` antes.

Nunca se usa `continue-on-error`. Un paso que depende de un change aún no mergeado se condiciona a su existencia e imprime
`omitido: <motivo>`; el test del workflow falla si queda un `omitido:` cuando lo que esperaba ya existe.

## E2E de Playwright: `.github/workflows/e2e.yml` (L1D-278, ARR-02)

Workflow **aparte** de `ci.yml`, así que **no forma parte de `ci-ok`** (que depende de todos los jobs de `ci.yml`) y no
bloquea el merge mientras sea informativo. Mismas reglas que `ci.yml`: `pull_request` y `push` a `main`, nunca
`pull_request_target`, sin secretos del repositorio, acciones por SHA (las mismas versiones), `permissions: contents: read`
y `timeout-minutes: 30`.

| Paso | Qué hace |
|---|---|
| `npm ci` | Dependencias del monorepo |
| `node scripts/ci/verificar-e2e-activos.mjs` | Falla nombrando archivo y línea si un E2E de `apps/web/e2e/` usa `test.skip`, `test.only` o `test.fixme` (también en `describe`) |
| `npx playwright install --with-deps chromium` | Chromium y sus dependencias del sistema en el *runner* |
| `npm run test:e2e` con `CI=true` | `scripts/e2e/ejecutar.sh`: Compose fingido (`LLM_PROVIDER=fake`, `MODEL_PROVIDER=fake`, seed sintético), `playwright test` y `down -v` |
| `npx vitest run --config scripts/e2e/vitest.integracion.config.mjs` | Prueba con Playwright real de que el informe no conserva la contraseña (ver abajo) |
| `actions/upload-artifact` (`if: always()`) | `apps/web/playwright-report` y `apps/web/test-results`, **`retention-days: 3`**, `include-hidden-files: false` (repositorio público: el artefacto es descargable) |

- **Modo CI de `ejecutar.sh`** (`CI` no vacía): rechaza `--mantener`; usa SIEMPRE su proyecto de Compose (`oncolens-e2e`)
  y una carpeta de secretos temporal propia, nunca `COMPOSE_PROJECT_NAME` ni `ONCOLENS_SECRETS_DIR` del entorno (su `trap`
  hace `down -v` y `rm -rf`); espera al web como máximo `E2E_ESPERA_STACK_SEGUNDOS` (180) y, si falla, imprime `compose ps`;
  si el build de `@oncolens/clinical-language` falla, imprime su cola. Si otra pila local ocupa las subredes `172.28.x`, fija
  `CLINICAL_NET_SUBNET` y `CORPUS_DB_NET_SUBNET`.
- **`playwright.config.ts`:** `retries: 1` y `trace: 'on-first-retry'` solo con `CI` (sin `CI`: `retries: 0`, sin traza);
  reporters `github` + `list` + `html`.
- **Informe y trazas sin credenciales (RN-14):** la contraseña de un E2E queda en el título del paso (`Fill "<contraseña>"`,
  que el informe HTML incrusta en base64 dentro de `index.html`), en el `fill` del `trace.trace`, en el valor de los `input`
  de los snapshots y en `error-context.md`; no solo en el `postData`. Tres reporters, en este orden en
  `playwright.config.ts`: `apps/web/e2e/depurador-de-adjuntos.ts` (primero; sustituye el secreto en los títulos de paso
  y depura en el sitio cada `trace.zip` y cada adjunto de texto, en disco o en memoria; quita `postData`, las respuestas de
  `POST /api/*` y las cabeceras `Cookie`/`Set-Cookie`/`Authorization`; borra los adjuntos de tipo desconocido), `html`, y
  `apps/web/e2e/verificador-de-informe.ts` (último; el informe se escribe en `onExit`, así que reescanea
  `playwright-report/` y `test-results/` como lo haría quien descarga el artefacto —zips anidados y el zip incrustado en el
  informe, base64 incluido—; si queda un secreto, borra ambas carpetas y la corrida termina con error). **Falla cerrado.**
  Qué variable es un secreto lo decide una sola convención (`esVariableSecretaDeE2e`: `E2E_*` con `CONTRASENA`,
  `PASSWORD`, `CLAVE`, `SECRET` o `TOKEN`), con un test que obliga a clasificar toda variable `E2E_*` nueva. En CI,
  `ejecutar.sh` enmascara la contraseña con `::add-mask::`. La prueba con Playwright y Chromium reales
  (`scripts/e2e/integracion/informe.integracion.mjs`, sonda de control incluida) no la recoge `build-test`: la corre el
  job `e2e` con `npx vitest run --config scripts/e2e/vitest.integracion.config.mjs`. Los usuarios de los E2E son
  sintéticos y su contraseña la genera `setup-secrets.sh` dentro de `ejecutar.sh`: no se versiona.
- **Criterio de estabilidad para hacerlo requerido (design.md D2):** 10 ejecuciones consecutivas en verde en `main` sin
  depender del reintento. Pasarlo a `ci.yml` y `ci-ok` (o marcar su check como requerido en la protección de `main`) es una
  acción humana posterior, diferida a ARR-06 (**L1D-282**). Un E2E inestable es un bug del sprint: se arregla o se quita con
  `Test-Removal:`, nunca se pone en cuarentena.
- **Pendiente de verificar en el primer PR:** que el job corra en el *runner* real con los 17 E2E en verde (en local pasa
  con `CI=true npm run test:e2e`).

## Fixtures de PR (`ci/tests/`)

Cada AC de US-036 es un caso `ci/tests/cases/<caso>/case.json` que clona el repositorio con `git clone --local` a un
directorio temporal, aplica un cambio sintético y ejecuta **el mismo comando** que el job. Claves y tokens se generan en
tiempo de ejecución (nunca se versionan) y la PII de los casos se compone al ejecutarse.

```bash
scripts/ci/install-tools.sh "$PWD/.ci-tools"      # gitleaks y oasdiff; el runner añade .ci-tools al PATH
python3 -m venv .venv-codegen && .venv-codegen/bin/pip install -r scripts/contracts/requirements-codegen.txt
ci/tests/run-cases.sh                              # todos los casos
ci/tests/run-cases.sh ac3-pem ac5-sin-clase        # algunos
ci/tests/run-cases.sh --lista                      # nombres
ci/tests/run-cases.sh --estricto                   # un caso PENDIENTE cuenta como fallo (cierre del change, tarea 5.2)
```

El clon lleva encima el árbol de trabajo actual (también lo no commiteado), de modo que los casos prueban lo que hay en
disco. `.github/workflows/ci-selftest.yml` los corre en los PRs que tocan `.github/workflows/**`, `ci/**`,
`scripts/ci/**`, `config/**` o `.gitleaks.toml`, y por `workflow_dispatch`.

`case.json`: `ac`, `descripcion`, `esperado` (`pasa` | `falla`), `comando` (texto o lista; recibe `BASE_REF`), `aplicar`
(script que modifica el clon), `mensajes` (deben salir), `ausentes` (no deben salir), `sinValor` (ningún línea de ese archivo
puede repetirse en la salida) y `pendiente` (`{ motivo, hastaQueSeArchive: [changes] }`: el caso depende de changes sin mergear; cuando alguno se archiva, el
caso cuenta como FALLA aunque no se use `--estricto`, así que no puede quedar pendiente para siempre).

## PII: formatos, exclusiones y allowlist

- **Formatos** (`config/pii-formats.json`): única definición de formatos de PII del repositorio (RN-22, sin asumir país):
  `documento_identidad` (6–12 dígitos precedidos de una palabra clave, también en camelCase), `telefono_e164`,
  `telefono_local` (con palabra clave) y `correo`. L1D-203 la reutiliza para enmascarar en ejecución y solo añade sus
  reglas de reemplazo; un cambio de forma sube `version` y se revisa con ambos consumidores. Un falso positivo se
  resuelve **afinando el formato en un PR revisado**, nunca con la allowlist.
  - Dominios de correo reservados (RFC 2606 / RFC 6761: `*.test`, `*.local`, `*.invalid`, `*.localhost`, `example.com`,
    `example.org`, `example.net`) no son hallazgo en ningún archivo.
  - El `patron` de cada formato es neutro; las exenciones son campos que solo aplica `scripts/lib/formatosPii.mjs`:
    `prefijosExentos` (`SINT-`, el centinela que exigen los ejemplos de `contracts/examples/`), `contextosExentos` (`url`:
    palabra clave y valor dentro de la **ruta** de una misma URL, antes de `?`, `#` y `;`; la consulta y el fragmento se escanean
    siempre), `prefijosDeRegistroExentos` (`NCT` en mayúsculas y exactamente ocho dígitos: el identificador de
    ClinicalTrials.gov, con cualquier palabra clave; en `telefono_local` acotado por `rutasDeRegistroExentas` a
    `data/raw/seed/docs/**`, fuera de esa ruta es hallazgo), `dominiosExentos` y `correosExentos` (buzones
    institucionales públicos concretos; hoy, el de consultas de la CIE de la OMS).
  - Siglas de documento: `CC`, `C.C.`, `TI`, `T.I.`, `CE`, `C.E.`, `NUIP`, `ID`, `HC`, `tarjeta de identidad`,
    `historia clínica`; las de hasta cuatro caracteres exigen límite de palabra.
  - La tabla completa de exenciones con su motivo está en `design.md` D5b del change.
- **Exclusiones** (`config/pii-scan.json`): solo patrones de la lista cerrada `EXCLUSIONES_PERMITIDAS` de
  `scripts/ci/pii-scan.mjs` (lockfiles y binarios por extensión). Está en código y no en configuración para que la
  configuración no pueda ampliarse a sí misma; cualquier otra exclusión hace fallar el job nombrándola.
- **Allowlist** (`config/pii-allowlist.json`): una entrada por fixture con `clase: sintetico`, globs de ruta acotados y los
  `sha256` del **valor normalizado** (la allowlist no contiene PII en claro). Un hallazgo se omite solo si su ruta casa
  con un glob **y** el par (formato, hash) está en los `valores` de **esa misma** entrada. Se rechazan entradas sin
  `clase: sintetico`, sin `valores`, sin `rutas` o con un glob más amplio que un directorio de fixture (`backlog/**`,
  `apps/clinical-api/test/**`, `ci/tests/**`…).
  - Para añadir una entrada: `node scripts/ci/pii-scan.mjs --hash` imprime `ruta:línea: formato sha256=…` (nunca el valor)
    de cada hallazgo; copia solo los hashes de valores **sintéticos** de un fixture y justifica la entrada en el PR
    (Gate 2, `privacy-guardian`). **El hash no protege el valor, solo lo identifica**: el de un número corto se invierte por
    fuerza bruta, por eso solo valores sintéticos (el escáner lo recuerda al usar `--hash`).
- **Clase de datos** (`config/dataset-roots.json`, por defecto `data/eval/` y `data/evaluation/`): todo archivo de datos
  bajo esas raíces (incluidos README y código) declara `clase: sintetico` en su manifiesto más cercano (`manifest.json` o
  `manifest.yaml`; la búsqueda no sube más arriba de la raíz) o, si no hay manifiesto, en su propia cabecera. Si el
  manifiesto más cercano declara otra clase, la cabecera no la corrige. Se acepta también la marca literal `sintetico: true`
  de AC-4; la definición de la marca es `esMarcaSintetica`, la misma de la allowlist.

## Secretos

`.gitleaks.toml` extiende las reglas por defecto (incluye `private-key` para PEM) y añade una regla de JWT. Su allowlist
es **solo por ruta** y cada entrada lleva su justificación (hoy, un UUID sintético de ejemplo de `Idempotency-Key` en un
escenario de L1D-139). Los fixtures de AC-3 generan la clave y el token en tiempo de ejecución, dentro del clon temporal.

## Contratos

`scripts/ci/contracts-breaking.sh <base-ref>` empaqueta (con `scripts/ci/bundle-specs.mjs`, que usa `bundleDocument` de Redocly vía `scripts/contracts/lib/context.mjs` para internalizar los
`$ref` a `contracts/schemas/`) los proveedores de `PROVIDERS` (`scripts/contracts/lib/specs.mjs`) el `openapi.yaml` de cada proveedor en la base y en `HEAD` y ejecuta
`oasdiff breaking --fail-on ERR`. Solo rompen los cambios de nivel `ERR`; los `WARN`, incluido
`response-body-wrapped-in-one-of-original-preserved` de los `oneOf` aditivos del S1, se imprimen y no rompen (ADR-26).
Un cambio incompatible **declarado** solo se perdona si coincide EXACTO (proveedor, regla, operación, ruta y texto) con una
entrada de `scripts/ci/contracts-breaking-excepciones.json`, registrada en un ADR (hoy E-1 en
[ADR-26](../architecture/adr/ADR-26-contrato-congelado-y-excepciones-declaradas.md): el `422 TIPO_CANCER_NO_REGISTRADO` de
`POST /rag/query`). El filtro (`scripts/ci/lib/excepcionesDeContrato.mjs`) falla cerrado: el script solo perdona si imprime
la decisión explícita (al menos un ERR coincide y ninguno queda sin declarar). Hasta que US-214 defina el mecanismo
definitivo de `contracts:breaking`, no hay otro *bypass*.

## Protección de rama de `main` (lo hace una persona administradora)

Ningún agente cambia la configuración del repositorio. Tras el **primer verde de `ci-ok` en `main`**:

1. GitHub → *Settings* → *Branches* (o *Rules* → *Rulesets*) → regla para `main`:
   - exigir PR antes de mergear;
   - exigir el *status check* **`ci-ok`** (y solo ese);
   - exigir la rama actualizada antes de mergear (*require branches to be up to date*);
   - sin *bypass* para administradores (*do not allow bypassing the above settings* / ruleset sin actores con bypass).
2. Verificar en solo lectura (requiere `gh auth login` con permiso de lectura de administración del repositorio):

   ```bash
   scripts/ci/check-branch-protection.sh                 # usa gh api sobre el repositorio actual
   scripts/ci/check-branch-protection.sh --repo hatrickmario/OncoLens-Lab
   ```

   Imprime `OK`/`FALTA` por condición y sale con 1 si falta alguna; adjunta la salida al PR de L1D-166.
3. **PR de prueba (US-036 AC-6)**: crear la rama `ci/selftest-ac6` desde `main` con un fallo deliberado (por ejemplo, un
   archivo con un número sintético tras la palabra clave `documento` en `data/`), abrir el PR, comprobar que `ci-ok` queda
   en rojo y que el botón de merge está bloqueado, adjuntar la captura al PR de este change y **cerrar el PR de prueba sin
   mergear**.

## Excepciones de `npm audit` (L1D-265)

El job `quality` no ejecuta `npm audit`; la auditoría de dependencias llega con US-217. Hasta entonces rige esta
excepción, que US-217 debe heredar:

| Paquete | Hallazgo | Alcance | Revisión |
|---|---|---|---|
| `@next/eslint-plugin-next` 16.4.2 (devDependency) → `fast-glob` → `micromatch` → `braces` | GHSA-vfj7-8cjw-p6xm (alta, DoS por patrones anidados); sin versión parcheada de `braces` | Solo lint en la CI y en local sobre el código del repo; no entra en runtime, imagen ni bundle | Retirar cuando `braces` publique parche o el plugin cambie de dependencia. **Fecha de revisión: 2026-11-20** (US-217 la hereda y la revisa en esa fecha o al activar su audit, lo que ocurra antes) |

El audit que bloqueará (con US-217) es `npm audit --omit=dev` (producción), que hoy sale con 0; hasta entonces ningún
job lo ejecuta, se verifica a mano y se adjunta al PR. `npm audit` completo muestra estas 4
altas por esa única cadena; no se relaja nada más.

## Seguimiento: duración de `build-test` (PR #41)

Decidido (usuario, 2026-10-20): tras el merge del PR #41 se **mide la duración del job `build-test`** (se compara con la de `main` antes del merge y se anota en el PR). Si la instalación de `torch` domina el tiempo, se pasa a la rueda CPU solo con `--index-url` en esa instalación (versión exacta y sin cambiar el resto de dependencias). Sin umbral nuevo ni cambio de la CI hasta tener la medición.

## Fuera de alcance de este change

Suite `evaluate` en PRs de modelo, prompt, umbral, catálogo o corpus (US-074); umbrales de tamaño, reglas de capas e
higiene TDD (US-213); `contracts:breaking` como script npm y `contracts:verify-provider` (US-214); auditoría de
dependencias y Dependabot (US-217); lint y formato (US-215 / L1D-265); *mutation testing* (S6); E2E Playwright.
