# FEAT-PL1 — Plataforma base: monorepo, Compose, secretos, CI y configuración

> Linear: [L1D-30](https://linear.app/l1der-lab-mjbc/issue/L1D-30)

**Talla:** L · **Sprint:** 1 (US-034…US-036, US-213…US-217) · 2 (US-037) · **Capacidad:** — (plataforma) · T-4 (SEG-09, SEG-12) · T-5 (DoD de la CI) · **Recorrido principal:** sí
**Requisitos:** RN-14 (dueña), RN-22 (dueña), RN-13 (guarda del S1; dueña del gate: US-143), NFR-05, NFR-10 (parte S1), NFR-13, SEG-07 (claves), SEG-08 (TLS hacia PostgreSQL), SEG-09, SEG-12
**Evidencia:** [→ PRD §6 RN-13, RN-14, RN-22], [→ PRD §7 NFR (hardware, observabilidad, mantenibilidad)], [→ PRD §11 #7, #8, #9, #12], [→ readme §1.4 Pasos 2–5], [→ readme §2.3], [→ readme §2.4], [→ readme §2.6 Contract testing], [→ readme §2.1 patrón y capas], [→ readme §2.3 estructura], [→ readme §2.7], [→ readme §6.0 Definition of Done], [→ CLAUDE.md "Comandos", "Datos y repositorio público"]
**Dependencias:** ↪ US-033 (specs que la CI valida) · 🔗 Bloquea: todas las Features del S1 (entorno común) · ⛔ ADR-39 solo para los valores de runtime (`LLM_BASE_URL`, `LLM_MODEL`) y el presupuesto de memoria, que se configuran, no se codifican
**Valor:** sin un entorno reproducible no hay walking skeleton demostrable al oncólogo. Esta Feature fija desde el día uno las reglas que no se pueden arreglar después en un repositorio público: ningún secreto ni dato real versionado, solo `web` expuesto, la IA aislada de los datos clínicos por red, y todo valor "a calibrar" en configuración, para que el oncólogo pueda ajustar umbrales sin desplegar código.
**Stories:** US-034, US-035, US-036, US-213…US-217 (28 puntos, S1) · US-037 (3 puntos, S2)

---

## US-034 — El stack levanta con Compose y solo `web` publica un puerto

> Linear: [L1D-164](https://linear.app/l1der-lab-mjbc/issue/L1D-164)

`FEAT-PL1` · Sprint 1 · Estimación **5** · — (técnica, PRD §17) · SEG-09, NFR-05, NFR-10 · ↪ US-035

## Story
Como equipo de desarrollo, quiero levantar todo el stack con un único comando de
Docker Compose y con el LLM nativo fuera de Docker, para que cualquier demo o test E2E
corra igual en la MacBook de referencia y los backends nunca queden expuestos al host.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado `infra/docker/docker-compose.yml` y los secretos
  generados por US-035, cuando se ejecuta `docker compose -f infra/docker/docker-compose.yml up -d`,
  entonces `postgres`, `clinical-minio`, `milvus-standalone` (con `milvus-etcd` y
  `milvus-minio`), `clinical-api`, `rag-orchestrator` y `web` quedan `healthy` y
  `GET /health` de `clinical-api` y de `rag-orchestrator` responde `200` desde la red
  interna. `[readme §2.4]` `[readme §2.7]`
- **AC-2 (borde · puertos)** · Dado el Compose resuelto (`docker compose config`), cuando
  un test lista los `ports` publicados, entonces solo `web` publica un puerto, y
  `clinical-api` y `rag-orchestrator` no publican ninguno. `[SEG-09]` `[CLAUDE.md]`
- **AC-3 (borde · redes)** · Dado el stack levantado, cuando desde el contenedor
  `rag-orchestrator` se intenta abrir una conexión TCP a `clinical-minio:9000`, entonces
  falla por resolución o conexión, y desde `clinical-api` la misma conexión funciona.
  `[readme §2.4]` `[SEG-06]`
- **AC-4 (borde · LLM caído)** · Dado el LLM nativo detenido, cuando se consulta
  `GET /health` de `rag-orchestrator`, entonces responde `503` con
  `error = "LOCAL_LLM_UNAVAILABLE"`, y `clinical-api` sigue respondiendo `200` en su
  `/health`. `[readme §2.7]`
- **AC-5 (borde · LLM fuera de Docker)** · Dado el Compose resuelto, cuando se inspecciona
  la definición de servicios, entonces no existe ningún servicio de LLM, y
  `rag-orchestrator` lo alcanza por `LLM_BASE_URL=http://host.docker.internal:<puerto>`
  tomado de configuración. `[readme §1.4]` `[CLAUDE.md]`

## Contexto técnico
Redes según readme §2.4: `clinical-net` (web, clinical-api, postgres, clinical-minio),
`ai-net` (clinical-api, rag-orchestrator, milvus) y `corpus-db-net` (rag-orchestrator y
postgres). Healthchecks de Compose usan `/health`. AC-2 y AC-5 son tests sobre la salida
de `docker compose config` (CI, sin levantar el stack); AC-1, AC-3 y AC-4 son un smoke
test de Compose (script en `scripts/smoke/`) que corre en local y en la CI con un LLM
falso compatible con OpenAI. El presupuesto de memoria (≤ 24 GB) lo mide ADR-39.

## Non-goals
HTTPS con CA interna y acceso por VPN (S5, FEAT-T4d). Prometheus, Grafana y OTel
(ADR-44, Post-MVP).

## INVEST
**Small** ✓ un Compose, healthchecks y un smoke test.
**Testable** ✓ dos tests estáticos sobre `docker compose config` y un smoke test con tres aserciones.

---

## US-035 — Los secretos y certificados se generan con scripts y nunca se versionan

> Linear: [L1D-165](https://linear.app/l1der-lab-mjbc/issue/L1D-165)

`FEAT-PL1` · Sprint 1 · Estimación **3** · — (técnica, PRD §17) · SEG-07, SEG-08, RN-14 · 🔗 Consumida por: US-034, US-040, US-046, US-054

## Story
Como equipo de desarrollo, quiero generar con scripts las claves del JWT de servicio,
las de cifrado e índice ciego, los roles de PostgreSQL, los certificados TLS y las
credenciales de los dos MinIO, para que cada entorno tenga sus propios secretos y
ninguno llegue al repositorio público.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado un clon limpio, cuando se ejecuta `scripts/setup-secrets.sh`,
  entonces genera en `infra/docker/secrets/` (ignorado por git) el par ES256 del JWT de
  servicio, la clave AES-256 de identidad, la clave HMAC del índice ciego, las
  contraseñas de los roles `clinical_api`, `research_writer` y `rag_corpus`, el
  `pg_hba.conf`, los certificados TLS de PostgreSQL y las credenciales de
  `clinical-minio` y `milvus-minio`; y `git status --porcelain` no muestra ningún
  archivo nuevo. `[readme §1.4]` `[RN-14]`
- **AC-2 (borde · reparto de secretos)** · Dado el Compose resuelto, cuando se listan los
  secretos montados por servicio, entonces la clave privada del JWT, la clave AES y la
  HMAC solo están montadas en `clinical-api`, y `rag-orchestrator` solo recibe la clave
  pública del JWT y la contraseña de `rag_corpus`. `[SEG-07]` `[ADR-6]` `[CLAUDE.md]`
- **AC-3 (borde · idempotencia)** · Dados secretos ya generados, cuando se vuelve a
  ejecutar el script sin `--rotate`, entonces no sobrescribe ninguno (mismos hashes de
  archivo) y lo informa. (asumido)
- **AC-4 (borde · TLS obligatorio)** · Dado el stack levantado, cuando `clinical-api`
  intenta conectar a PostgreSQL con `sslmode=disable`, entonces la conexión es
  rechazada por `pg_hba.conf`, y con `sslmode=require` funciona. `[SEG-08]` `[OL-01]`
- **AC-5 (borde · clave ausente)** · Dado `clinical-api` sin la clave AES o sin la HMAC
  montadas, cuando arranca, entonces no queda listo (`/health` ≠ `200`) y el log registra
  el nombre de la variable ausente, nunca un valor. `[RN-10]` (asumido)

## Contexto técnico
Scripts en `scripts/` (bash o Node, sin dependencias de nube). La regla de `pg_hba.conf`
que restringe `rag_corpus` a `corpus-db-net` se genera aquí; los `GRANT`/`REVOKE` y su
test de *permission denied* son de US-040. La gestión de respaldo de claves de identidad
queda documentada en `docs/operations/claves.md`: si se pierde la clave, se pierde la
identidad (riesgo de OL-01). AC-1 a AC-3 se verifican con un test de shell en la CI
(contenedor efímero); AC-4 y AC-5, con el smoke test de US-034.

## INVEST
**Small** ✓ un script, plantillas de `pg_hba.conf` y montajes de Compose.
**Testable** ✓ cinco aserciones sobre archivos generados, montajes y conexiones.

---

## US-036 — La CI valida build, contratos y bloquea secretos y PII en el repositorio

> Linear: [L1D-166](https://linear.app/l1der-lab-mjbc/issue/L1D-166)

`FEAT-PL1` · Sprint 1 · Estimación **5** · — (técnica, PRD §17) · RN-14 (dueña), NFR-13, SEG-12 · ↪ US-033 · 🔗 Relacionada: US-042 (estándares no permitidos), US-074 (suite en DoD)

## Story
Como equipo de desarrollo, quiero que cada PR pase por una CI que compile, ejecute los
tests, valide los contratos OpenAPI y escanee secretos y datos personales, para que un
cambio incompatible o un dato sensible nunca lleguen a `main` en un repositorio público.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado un PR sin cambios de contrato ni secretos, cuando corre
  `.github/workflows/ci.yml`, entonces ejecuta build y tests de `web`, `clinical-api` y
  `rag-orchestrator`, `contracts:check` (US-033) y la regeneración de
  `packages/api-contracts`, y termina en verde. `[readme §6.0 DoD]` `[NFR-13]`
- **AC-2 (borde · cambio incompatible)** · Dado un PR que elimina el campo
  `evidenceOptions[].citedSources` del spec de `rag-orchestrator`, cuando corre la CI,
  entonces el build de `clinical-api` falla al compilar contra el cliente regenerado y
  el check de cambios incompatibles del spec también falla. `[readme §2.6]` `[NFR-13]`
- **AC-3 (borde · secreto)** · Dado un PR que agrega un archivo con una clave privada
  PEM o una cadena con forma de token, cuando corre la CI, entonces el job de escaneo de
  secretos falla y nombra el archivo. `[RN-14]` `[SEG-12]`
- **AC-4 (borde · PII en datos)** · Dado un PR que agrega en `data/` un archivo con un
  patrón de documento de identidad o de teléfono de la lista de formatos de PII
  configurada, cuando corre la CI, entonces el job de escaneo de PII falla y nombra el
  archivo y la línea, salvo que el archivo esté en la allowlist de fixtures sintéticos
  marcados `sintetico: true`. `[RN-14]` `[OL-06]`
- **AC-5 (borde · datos reales)** · Dado un PR que agrega un archivo en
  `data/evaluation/` sin la marca de dataset sintético en su cabecera o manifiesto,
  cuando corre la CI, entonces falla con el mensaje "dataset sin clase de datos
  `sintetico`". `[RN-13]` `[OL-06]` (asumido)
- **AC-6 (borde · rama protegida)** · Dado un PR con la CI en rojo, cuando se intenta
  mergear a `main`, entonces la protección de rama lo impide. (asumido)

## Contexto técnico
GitHub Actions. Escaneo de secretos con una herramienta estándar (p. ej., gitleaks) y
escaneo de PII con los mismos formatos configurables que usa el detector de Backend 1
(ADR-40), sin asumir país `[RN-22]`. El check de cambios incompatibles compara el spec
del PR con el de `main` (p. ej., oasdiff). Los AC se verifican con PRs de prueba en una
rama de la CI (fixtures de PR en `ci/tests/`), no en `main`.

## Non-goals
La ejecución de la suite de evaluación en PRs de modelo, prompt, umbral, catálogo o
corpus es de US-074. *Mutation testing* (S6).

## INVEST
**Small** ✓ un workflow con cuatro jobs reutilizando herramientas estándar.
**Testable** ✓ cada AC es un PR de prueba con resultado esperado verde o rojo.

---

## US-213 — La CI aplica umbrales de tamaño y complejidad, reglas de dependencias entre capas y la higiene de tests (TDD) en los dos backends y en `web`

> Linear: [L1D-263](https://linear.app/l1der-lab-mjbc/issue/L1D-263)

`FEAT-PL1` · Sprint 1 · Estimación **5** *(a re-estimar en el planning del S1 tras añadir AC-8…AC-11 el 2026-10-09; propuesta: 8)* · — (técnica, PRD §17) · NFR-13, RN-22 · ↪ US-036 (workflow de CI), US-033 (`contracts/examples/` para los handlers de MSW) · 🔗 Relacionada: US-038 (PostgreSQL de test para la integración) · 🔗 Consumida por: `design-principles-reviewer` y `gate-review` (Gate 2), el paso de refactor de los implementadores y la Política TDD de `CLAUDE.md` (`.claude/`)

## Story
Como equipo de desarrollo (personas y agentes de IA), quiero que la CI y un comando local
detecten de forma determinista las funciones demasiado largas o complejas y las
dependencias que cruzan capas prohibidas, y que la suite de tests no pueda debilitarse en
silencio ni mockear lo que no es un borde, para que la revisión de SOLID y CUPID y la Política
TDD se apoyen en evidencia reproducible y no solo en el criterio de un modelo, y para que ningún
agente copie un acoplamiento indebido ni un test que no prueba nada.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado el monorepo con el código del S1, cuando se ejecuta
  `npm run quality` en la raíz, entonces corre ESLint en `web` y `clinical-api`,
  `dependency-cruiser` sobre `apps/` y `packages/`, Ruff y `import-linter` en
  `rag-orchestrator`; termina con código 0, y `npm run quality:report` escribe
  `reports/quality/latest.json` con los hallazgos por herramienta, regla, archivo y línea.
  El job `quality` de `.github/workflows/ci.yml` ejecuta lo mismo en cada PR. `[NFR-13]`
  `[readme §2.6]`
- **AC-2 (borde · capa saltada en Node)** · Dado un PR en el que un archivo
  `apps/clinical-api/src/modules/**/*.controller.ts` importa `@prisma/client` o un
  `*.repository.ts`, cuando corre el job `quality`, entonces falla y el mensaje nombra la
  regla `controller-sin-acceso-a-datos` y el archivo. Lo mismo para
  `apps/web/**` → `apps/clinical-api/**` (`web-solo-por-bff`) y para
  `apps/web/components/**` → `@prisma/client` o clientes HTTP directos. `[readme §2.1]`
  `[readme §2.3]`
- **AC-3 (borde · dominio contaminado en Python)** · Dado un PR en el que un módulo de
  `apps/rag-orchestrator/app/domain/` importa algo de `app/infrastructure/` o de
  `app/api/`, cuando corre el job `quality`, entonces `import-linter` falla con el
  contrato `dominio-independiente` y nombra el import. Igual para `app/application/`
  → `app/api/` (`capas-hexagonales`). `[readme §2.3]`
- **AC-4 (borde · umbral de ESLint)** · Dada una función de `clinical-api` que supera el
  umbral configurado de `max-lines-per-function` o de `complexity`, cuando corre el job
  `quality`, entonces falla nombrando la regla, la función, el valor medido y el umbral.
  `[NFR-13]`
  > Pendiente de definir en refinamiento (dueño: Ingeniería · afecta: AC-4, AC-5, `quality-thresholds.json`): ¿qué umbrales se adoptan para `max-lines-per-function`, `complexity` (ESLint), `C901` max-complexity y `PLR0915` max-statements (Ruff), y si los tests tienen un umbral distinto? Hasta decidirlo, la propuesta a calibrar es 40 líneas por función, complejidad 10, max-complexity 10 y 50 sentencias, con tests excluidos de `max-lines-per-function`; se revisa en la retro del S1 con los hallazgos reales de `design-principles-reviewer`. **Decidido para `apps/web` (usuario, 2026-10-09):** componentes `.tsx` medidos por archivo, sin líneas en blanco ni comentarios: **100 líneas = alerta** (`warn`, no bloquea; la revisa `design-principles-reviewer`) y **150 líneas = límite duro** (`error`, la CI falla). Ver AC-7. Los umbrales de backends y hooks siguen pendientes.
- **AC-5 (borde · umbral de Ruff)** · Dada una función de `rag-orchestrator` que supera el
  umbral configurado de `C901` o `PLR0915`, cuando corre el job `quality`, entonces falla
  nombrando la regla, la función y el umbral. `[NFR-13]`
- **AC-6 (borde · umbrales en un solo lugar)** · Dado un cambio de umbral solo en
  `quality-thresholds.json` (raíz), cuando se vuelve a ejecutar `npm run quality`,
  entonces ESLint y Ruff aplican el valor nuevo sin tocar ningún otro archivo de
  configuración, y un umbral ausente o no numérico hace fallar el job con el nombre de la
  clave. `[RN-22]` (asumido)
- **AC-7 (borde · tamaño de componentes en `web`)** · Dado un archivo `.tsx` de
  `apps/web/components/**` o `apps/web/app/**` con más de **100** líneas (sin blancos ni
  comentarios), cuando corre el job `quality`, entonces ESLint emite una **alerta** que aparece
  en `reports/quality/latest.json` y el job no falla; y con más de **150** líneas, el job
  **falla** nombrando el archivo, el valor medido y el umbral. `apps/web/components/ui/**`
  (primitivas de shadcn), tests, stories y código generado quedan excluidos, y los componentes
  no se miden con `max-lines-per-function`. `[NFR-13]` `[RN-22]`
- **AC-8 (borde · tests desactivados o enfocados)** · Dado un PR que añade `it.skip`, `it.only`,
  `describe.skip`, `xit`, `fit`, `it.todo`, `@pytest.mark.skip`, `@pytest.mark.skipif`,
  `@pytest.mark.xfail`, `pytest.skip(` o `pytest.xfail(` en un archivo de test, cuando corre el job
  `quality`, entonces falla nombrando el archivo, la línea y la regla (`vitest/no-focused-tests`,
  `vitest/no-disabled-tests` o el chequeo `tests-sin-desactivar` de Python). `[NFR-13]`
  `[CLAUDE.md Política TDD]`
- **AC-9 (borde · AC sin test de aceptación)** · Dado un change activo en `openspec/changes/`
  cuya historia tiene AC-1…AC-n, cuando corre el job `quality`, entonces
  `scripts/quality/check-ac-coverage` emite una **alerta** en `reports/quality/latest.json` por
  cada AC sin al menos un test cuyo título termina en `[US-xxx AC-n]` (Vitest, Playwright) o con
  `@pytest.mark.ac("US-xxx", n)`; los tests sin tag (unitarios del bucle interno) no alertan.
  `[NFR-13]` `[CLAUDE.md Política TDD]` (asumido: alerta y no error; el Gate 2 lo trata como Mayor)
- **AC-10 (borde · mocks fuera del borde)** · Dado un test de `web` o `clinical-api` que llama
  `vi.mock` sobre una ruta relativa (`./`, `../`), un alias propio (`@/`, `@oncolens/`) o
  `@prisma/client`, cuando corre el job `quality`, entonces falla con la regla
  `mock-solo-en-bordes` y el módulo; `vi.mock` de paquetes de terceros que son borde (clientes
  HTTP, SDK de MinIO) se permite. Y dado el arnés de tests, cuando un test de integración de
  `web` o de `clinical-api` necesita el HTTP saliente, entonces usa los handlers de MSW
  construidos desde `contracts/examples/` (`packages/test-support/msw/`), y en `rag-orchestrator`
  los de `respx` (`tests/support/http.py`), de modo que un handler con un campo que no existe en
  el ejemplo hace fallar su propio test. `[NFR-13]` `[ADR-26]`
- **AC-11 (borde · cobertura de líneas cambiadas)** · Dado un PR, cuando corre el job `quality`,
  entonces `reports/quality/latest.json` incluye, por archivo cambiado, el porcentaje de líneas
  cambiadas cubiertas por tests (`vitest --coverage` con v8, `pytest-cov` y `diff-cover`), y una
  **alerta** si queda por debajo de `coverage.changedLinesWarn` (`quality-thresholds.json`,
  propuesta 80) en `apps/rag-orchestrator/app/domain/**`, `apps/clinical-api/src/modules/**/*.service.ts`
  y `apps/web/lib/**`; el job **nunca falla** por cobertura y no hay umbral global. `[NFR-13]`
  `[RN-22]` (asumido)

## Contexto técnico
- **Umbrales:** `quality-thresholds.json` en la raíz es la única fuente; `eslint.config.js`
  lo lee y un script (`scripts/quality/sync-ruff-thresholds`) genera la sección
  `[tool.ruff.lint.mccabe]` / `[tool.ruff.lint.pylint]` de `apps/rag-orchestrator/pyproject.toml`,
  y la CI comprueba que está sincronizada. Son valores "a calibrar" (RN-22): nunca literales
  repartidos por la configuración.
- **Tamaño de componentes (`web`):** ESLint `max-lines` con `skipBlankLines` y `skipComments`, en
  dos niveles leídos de `quality-thresholds.json` (`web.componentLinesWarn = 100`,
  `web.componentLinesError = 150`); el conteo supone el `printWidth: 100` de Prettier que fija
  US-215.
- **Reglas de dependencias (Node):** `.dependency-cruiser.cjs` con, al menos,
  `controller-sin-acceso-a-datos`, `web-solo-por-bff`, `componentes-sin-datos`,
  `sin-ciclos` y `api-contracts-generado` (nadie importa tipos de `clinical-api` saltándose
  `packages/api-contracts`).
- **Reglas de dependencias (Python):** `apps/rag-orchestrator/.importlinter` con los
  contratos `dominio-independiente` (domain no importa application, infrastructure ni api) y
  `capas-hexagonales` (api → application → domain; infrastructure solo implementa puertos).
- **Salida para agentes:** `reports/quality/latest.json` (ignorado por git) es la entrada
  determinista que `design-principles-reviewer` lee antes de opinar; formato
  `{tool, rule, file, line, symbol, measured, threshold}`.
- **Higiene de tests (Node):** `@vitest/eslint-plugin` con `no-focused-tests`,
  `no-disabled-tests` (incluye `it.todo`) y `valid-title` (títulos no vacíos ni duplicados);
  `no-restricted-syntax` para `mock-solo-en-bordes` sobre `vi.mock` con rutas propias o
  `@prisma/client`.
- **Higiene de tests (Python):** Ruff con `PT` (`flake8-pytest-style`) y
  `scripts/quality/check-pytest-hygiene.py` (marcadores `skip`, `skipif`, `xfail` y llamadas
  `pytest.skip`/`pytest.xfail`) que escribe en `reports/quality/latest.json`; el marcador `ac` se
  registra en `pyproject.toml` (`--strict-markers`).
- **AC con test de aceptación:** `scripts/quality/check-ac-coverage` lee los AC de las historias con
  change activo (enlazadas en su `proposal.md`) y busca los tags en los tests; misma salida.
- **Cobertura de líneas cambiadas:** `diff-cover` sobre los reportes LCOV/Cobertura de Vitest y
  `pytest-cov` contra `origin/main`; solo alerta (AC-11). Sin umbral global: el porcentaje no
  sustituye a revisar qué se prueba.
- **Arnés de mocks en los bordes:** `msw` en `web` y `clinical-api` con handlers generados o
  construidos desde `contracts/examples/` (`packages/test-support/msw/`); `respx` en
  `rag-orchestrator`. El PostgreSQL de test de la integración es el de US-038 (Testcontainers
  o servicio de la CI); esta historia no lo duplica.
- El *hook* local `pre-commit-gate.sh` (`.claude/`) aplica AC-8 antes del commit; la CI es la
  garantía para quien no usa Claude Code.
- AC-2 a AC-5 y AC-8 a AC-11 se verifican con fixtures de PR en `ci/tests/quality/` (un archivo
  que viola cada regla), en una rama de la CI, no en `main`, igual que US-036.

## Non-goals
Mutation testing (US-185, `si-hay-capacidad`; no se adelanta sin decisión de planning). El
PostgreSQL de test (US-038). El piloto de TDD Guard (configuración de `.claude/`, no de la CI).
Revisión de diseño no determinista (es del agente `design-principles-reviewer`). ESLint base,
Prettier y `ruff format` (US-215).

## INVEST
**Small** ⚠ tres archivos de reglas, un archivo de umbrales, el arnés de MSW/`respx`, un job de CI
y fixtures de prueba; si en el planning pasa de 8, dividir AC-8…AC-11 en una historia hermana.
**Testable** ✓ cada AC es una ejecución de `npm run quality` o un PR de prueba con resultado verde o rojo y un mensaje esperado.

---

## US-214 — Cada backend verifica sus respuestas contra su propio contrato OpenAPI y los consumidores solo usan clientes generados

> Linear: [L1D-264](https://linear.app/l1der-lab-mjbc/issue/L1D-264)

`FEAT-PL1` · Sprint 1 · Estimación **3** · — (técnica, PRD §17) · NFR-13 · ↪ US-033 (specs congelados), US-036 (workflow de CI) · 🔗 Relacionada: US-213 (regla `api-contracts-generado`) · 🔗 Consumida por: `contract-keeper` (Gate 2) y la skill `sync-contracts` (`.claude/`)

## Story
Como equipo de desarrollo (personas y agentes de IA), quiero que `clinical-api` y
`rag-orchestrator` comprueben en sus tests que cada respuesta cumple su propio
`openapi.yaml`, que lo generado desde el spec no pueda divergir de él y que los cambios
incompatibles se detecten contra `main`, para que el contrato sea la fuente única
(contract-first, provider-driven) y ningún consumidor descubra una ruptura en producción.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dados los specs congelados de US-033, cuando se ejecuta
  `npm run contracts:verify-provider`, entonces los tests de integración de `clinical-api`
  (Supertest) y de `rag-orchestrator` (`TestClient`) validan **cada** respuesta contra el
  `openapi.yaml` de su servicio (status, cabeceras declaradas y cuerpo) y terminan en verde; el
  job `contracts` de la CI lo ejecuta en cada PR. `[readme §2.6]` `[NFR-13]`
- **AC-2 (borde · respuesta fuera de contrato)** · Dado un endpoint de `rag-orchestrator` que
  devuelve `topRelevanceScore: 0.0` en un caso `sin_evidencia` (el spec exige `null`), o un
  campo no declarado en `EvidenceAnalysis`, cuando corren los tests del proveedor, entonces
  fallan nombrando la ruta, el código de estado y la ruta JSON del campo. `[RN-02]` `[ADR-26]`
- **AC-3 (borde · errores también son contrato)** · Dadas respuestas `401`, `403`, `409` y
  `422` (`TIPO_NO_HABILITADO`) de los endpoints existentes, cuando se validan, entonces su
  cuerpo cumple el schema de error declarado en el spec; un error no declarado hace fallar el
  test. `[readme §4.1]` `[readme §4.2]` `[B-10]`
- **AC-4 (borde · generado desactualizado)** · Dado un PR que cambia `openapi.yaml` sin
  regenerar, o que edita a mano `packages/api-contracts/src/` (incluidos los schemas Zod
  compartidos de `src/zod/`) o `apps/rag-orchestrator/app/schemas/generated/`, cuando corre la CI, entonces
  `npm run contracts:generate && git diff --exit-code` falla nombrando los archivos. `[NFR-13]`
- **AC-5 (borde · cambio incompatible)** · Dado un PR que elimina o vuelve obligatorio un campo
  de un spec, cuando corre `npm run contracts:breaking` (oasdiff contra `origin/main`), entonces
  falla salvo que el PR declare el cambio en `design.md` con la etiqueta de cambio incompatible
  aceptado. `[ADR-26]` (asumido)

## Contexto técnico
- **Provider-driven, no consumer-driven:** cada backend es proveedor de su contrato y lo
  verifica; `web` y `clinical-api` consumen solo los clientes generados en
  `packages/api-contracts`. No se usa Pact: un solo equipo, dos consumidores conocidos y contrato
  congelado en Pre-S1; la verificación del proveedor más la generación de clientes da la misma
  garantía sin broker. La decisión queda registrada en `docs/architecture/adr/` como parte de
  esta historia.
- **Herramientas (propuesta):** validación de respuestas con `express-openapi-validator`
  (`validateResponses: true` solo en el entorno de test) en `clinical-api`, y un validador de
  respuestas contra el spec (p. ej., `openapi-core`) o `schemathesis` en `rag-orchestrator`;
  generación con `openapi-typescript`/`openapi-zod-client` (o `orval`) y
  `datamodel-code-generator`; cambios incompatibles con `oasdiff`.
- **Scripts:** `contracts:check` (US-033), `contracts:generate`, `contracts:breaking` y
  `contracts:verify-provider` (esta historia), todos en la raíz.
- Ejemplos de `contracts/examples/` reutilizados como datos de prueba de consumidores.
- AC-2 a AC-5 se verifican con fixtures de PR en `ci/tests/contracts/`, igual que US-036.

## Non-goals
Pact o contratos dirigidos por el consumidor. Pruebas de carga o fuzzing completo de los
endpoints (más allá de la validación de respuestas). Versionado de la API por URL.

## INVEST
**Small** ✓ un validador por backend en los tests, tres scripts y un job de CI.
**Testable** ✓ cada AC es una ejecución de script o un PR de prueba con resultado verde o rojo y un mensaje esperado.

---

## US-215 — Lint base y formato automático: ESLint con reglas de TypeScript, React, Next.js y accesibilidad, Prettier y `ruff format`

> Linear: [L1D-265](https://linear.app/l1der-lab-mjbc/issue/L1D-265)

`FEAT-PL1` · Sprint 1 · Estimación **2** · — (técnica, PRD §17) · NFR-13, NFR-12 (accesibilidad) · ↪ US-036 (workflow de CI) · 🔗 Relacionada: US-213 (umbrales y conteo de líneas que dependen del `printWidth` fijado aquí) · 🔗 Consumida por: `frontend-dev`, `clinical-platform-dev`, `ai-services-dev` y `design-principles-reviewer` (`.claude/`)

## Story
Como equipo de desarrollo (personas y agentes de IA), quiero una configuración base de ESLint
y un formato automático único en los tres servicios, para que los errores reales de React,
TypeScript, Next.js y accesibilidad se detecten antes del PR, para que el estilo no se discuta
en las revisiones y para que el conteo de líneas de US-213 sea estable.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado el monorepo con el código del S1, cuando se ejecuta
  `npm run lint` y `npm run format:check` en la raíz, entonces ESLint corre en `web` y
  `clinical-api` con `typescript-eslint`, y en `web` además con `eslint-plugin-react-hooks`,
  `eslint-plugin-jsx-a11y` y `@next/eslint-plugin-next`; Prettier verifica `web`,
  `clinical-api` y `packages/`, y `ruff format --check` verifica `rag-orchestrator`; todo
  termina con código 0 y el job `quality` de la CI ejecuta lo mismo en cada PR. `[NFR-13]`
- **AC-2 (borde · reglas de hooks)** · Dado un componente de `web` que llama a un hook dentro
  de un condicional o que omite una dependencia de `useEffect`, cuando corre `npm run lint`,
  entonces falla con `react-hooks/rules-of-hooks` o `react-hooks/exhaustive-deps` y nombra el
  archivo y la línea. `[NFR-13]`
- **AC-3 (borde · accesibilidad)** · Dado un componente de `web` con una imagen sin `alt` o un
  elemento interactivo sin rol ni manejador de teclado, cuando corre `npm run lint`, entonces
  falla con la regla de `jsx-a11y` correspondiente. `[NFR-12]` `[PRD §7]`
- **AC-4 (borde · formato)** · Dado un archivo `.ts`, `.tsx` o `.py` sin formatear, cuando corre
  el job `quality`, entonces `format:check` falla nombrando el archivo, y `npm run format` lo
  corrige sin cambiar su comportamiento (los tests siguen en verde). `[NFR-13]`
- **AC-5 (borde · sin conflictos entre herramientas)** · Dado un archivo formateado por
  Prettier, cuando corre ESLint, entonces ninguna regla de estilo de ESLint lo marca
  (`eslint-config-prettier` desactiva las reglas que chocan). (asumido)

## Contexto técnico
- **Prettier:** `.prettierrc` en la raíz con `printWidth: 100` (el conteo de líneas de US-213 lo
  supone), `singleQuote`, `trailingComma: "all"` y `prettier-plugin-tailwindcss` para ordenar
  las clases de Tailwind. `.prettierignore` excluye lo generado (`packages/api-contracts/src/`,
  incluidos los schemas Zod de `src/zod/`), `components/ui/**` de shadcn solo si se decide no
  reformatearlo, y `reports/`.
- **ESLint:** `eslint.config.js` (flat config) en la raíz, compartido, con los plugins de AC-1 y
  `eslint-config-prettier` al final. Los umbrales de tamaño y complejidad y las reglas de
  dependencias son de US-213; esta historia solo fija la base.
- **Python:** `ruff format` con `line-length = 100` en `apps/rag-orchestrator/pyproject.toml`
  (el lint de complejidad es de US-213).
- **Scripts (raíz):** `lint`, `format` y `format:check`; `npm run quality` (US-213) los incluye.
- **Editor:** `.editorconfig` coherente (indentación, fin de línea) para personas; los agentes
  dependen de los scripts.
- AC-2 a AC-4 se verifican con fixtures en `ci/tests/quality/`, igual que US-213.

## Non-goals
Umbrales de tamaño y complejidad y reglas de dependencias entre capas (US-213). Reglas de
lenguaje prescriptivo (`lint:lenguaje`, FEAT-T3). Hooks de pre-commit de Git (husky): la CI y
los hooks de Claude Code ya cubren el control.

## INVEST
**Small** ✓ dos archivos de configuración, tres scripts y su inclusión en el job existente.
**Testable** ✓ cada AC es una ejecución de script o un fixture con resultado verde o rojo y una regla esperada.

---

## US-216 — `web` envía cabeceras de seguridad, impide el clickjacking y no expone secretos ni HTML sin sanitizar

> Linear: [L1D-266](https://linear.app/l1der-lab-mjbc/issue/L1D-266)

`FEAT-PL1` · Sprint 1 · Estimación **3** · — (técnica, PRD §17) · RN-14, NFR-11, SEG-01 (CSRF ya cubierto), SEG-12 · ↪ US-034 (`web` levantado), US-215 (ESLint base) · 🔗 Relacionada: US-144 (HSTS con HTTPS en el piloto), US-061 (panel que muestra texto del LLM) · 🔗 Consumida por: `frontend-dev` y `privacy-guardian` (`.claude/`)

## Story
Como equipo de desarrollo, quiero que `web` aplique desde el primer sprint las defensas del
navegador (CSP, anti-clickjacking, cabeceras), que ningún secreto llegue al bundle y que el
texto generado por el LLM o copiado del corpus nunca se interprete como HTML, para que una
fuente maliciosa o un error de configuración no comprometa la sesión del oncólogo ni los
datos del paciente.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dada cualquier página o Route Handler de `web`, cuando se inspecciona
  la respuesta, entonces incluye `Content-Security-Policy` con `default-src 'self'`,
  `script-src` con nonce por request y sin `unsafe-inline` ni `unsafe-eval`,
  `frame-ancestors 'none'` y `object-src 'none'`; además `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: no-referrer` y `Permissions-Policy` sin cámara, micrófono ni geolocalización.
  `[RN-14]` `[NFR-11]` (asumido en la lista exacta de cabeceras)
- **AC-2 (borde · clickjacking)** · Dada una página externa que intenta cargar `web` en un
  `<iframe>`, cuando el navegador la renderiza, entonces el frame se bloquea (test E2E con
  Playwright sobre una página de prueba). (asumido)
- **AC-3 (borde · XSS en texto generado)** · Dado un fixture de `EvidenceAnalysis` cuya síntesis
  y cuya cita contienen `<img src=x onerror=alert(1)>` y `<script>`, cuando el panel lo
  muestra, entonces el texto aparece escapado, no se ejecuta ningún script ni se crea ningún
  elemento `img`, y ESLint falla ante cualquier `dangerouslySetInnerHTML` (`react/no-danger`).
  `[RN-01]` `[RN-04]` (asumido en el vector de ataque)
- **AC-4 (borde · secretos en el bundle)** · Dado un `.env` con una variable `NEXT_PUBLIC_*`
  fuera de `config/public-env.allowlist.json`, o un componente `'use client'` que importa un
  módulo marcado `import 'server-only'`, cuando corre el job `quality`, entonces falla
  nombrando la variable o el import; y tras `next build`, un escaneo de `.next/static/` con los
  patrones de secretos de US-036 no encuentra ninguno. `[RN-14]` `[PRD §11 #12]`
- **AC-5 (borde · enlaces de citas)** · Dada una cita cuyo `url` usa el esquema `javascript:` o
  `data:`, cuando se renderiza, entonces no se crea el enlace y se muestra la fuente como texto;
  los enlaces válidos (`https:`) llevan `rel="noopener noreferrer"`. `[RN-04]` (asumido)

## Contexto técnico
- **CSP con nonce** generada en `middleware.ts` de Next.js 16 (Turbopack) y propagada a los
  scripts del framework; el resto de cabeceras en `next.config` (`headers()`). Valores en
  configuración (`RN-22`), con la CSP en modo `report-only` solo en desarrollo local.
- **HSTS** queda en US-144: necesita HTTPS con la CA interna del piloto (S6).
- **Lista permitida** de variables públicas: `config/public-env.allowlist.json` (vacía por
  defecto; cada entrada justifica por qué no es sensible). Paquete `server-only` en los módulos
  de sesión, configuración secreta y cliente de `clinical-api`.
- **Render de texto:** el texto del LLM y del corpus se muestra como texto; si se habilita
  Markdown, con `react-markdown` + `rehype-sanitize` y sin `rehype-raw`.
- AC-1 y AC-4 en la CI (tests sobre la respuesta y sobre el build); AC-2, AC-3 y AC-5 con
  Playwright y Testing Library usando fixtures sintéticos.

## Non-goals
HSTS y TLS (US-144). Rate limiting (RN-30, S4). Auditoría de dependencias (US-217). WAF o
protección DDoS (fuera de alcance: acceso solo por VPN).

## INVEST
**Small** ✓ un middleware, la configuración de cabeceras, una lista permitida y un escaneo del build.
**Testable** ✓ cada AC es una aserción sobre cabeceras, un E2E o un check de la CI con resultado esperado.

---

## US-217 — Las dependencias se auditan en cada PR y se actualizan con Dependabot

> Linear: [L1D-267](https://linear.app/l1der-lab-mjbc/issue/L1D-267)

`FEAT-PL1` · Sprint 1 · Estimación **2** · — (técnica, PRD §17) · RN-14, SEG-12 · ↪ US-036 (workflow de CI) · 🔗 Relacionada: US-147 (revisión de seguridad del piloto; su AC-5 pasa a regresión de esta historia), US-216

## Story
Como equipo de desarrollo, quiero que cada PR audite las dependencias de los tres servicios y
que las actualizaciones de seguridad lleguen solas como PRs, para no descubrir una
vulnerabilidad crítica recién en la revisión del piloto (S6).

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado un PR sin dependencias vulnerables, cuando corre el job
  `dependencies` de la CI, entonces ejecuta `npm audit --audit-level=high` en el workspace y
  `pip-audit` en `rag-orchestrator`, y termina en verde. `[RN-14]` (asumido en el umbral)
- **AC-2 (borde · vulnerabilidad alta o crítica)** · Dado un PR que añade una dependencia con
  una vulnerabilidad conocida de severidad alta o crítica, cuando corre el job, entonces falla
  nombrando el paquete, la versión y el identificador del aviso. (asumido)
- **AC-3 (borde · excepción registrada)** · Dada una vulnerabilidad sin parche disponible,
  cuando se registra en `security/audit-exceptions.json` con identificador, motivo, mitigación
  y fecha de revisión, entonces el job pasa; y una excepción vencida lo hace fallar. (asumido)
- **AC-4 (borde · Dependabot)** · Dado `.github/dependabot.yml`, cuando se inspecciona, entonces
  configura actualizaciones de seguridad y de versión para `npm` (raíz y workspaces), `pip`
  (`rag-orchestrator`), `github-actions` y `docker` (`infra/docker`), con agrupación por
  ecosistema y frecuencia semanal; sus PRs pasan por la misma CI. (asumido)

## Contexto técnico
- Herramientas gratuitas para un repositorio público: `npm audit`, `pip-audit` y Dependabot.
  **Sin Snyk** por ahora (exige cuenta externa; YAGNI); si se necesitara, se decide con un ADR.
- Los PRs de Dependabot no se mergean solos: el merge sigue siendo humano.
- La revisión de seguridad del piloto (US-147 AC-5) reutiliza este job como regresión.

## Non-goals
Escaneo de imágenes de contenedor (Trivy) y SBOM: se reevalúan antes del piloto. Snyk.

## INVEST
**Small** ✓ un job de CI, un archivo de Dependabot y un archivo de excepciones.
**Testable** ✓ cada AC es un PR de prueba o una inspección de configuración con resultado esperado.

---

## US-037 — Toda configuración calibrable vive en variables validadas al arranque y los logs salen en JSON con `traceId`

> Linear: [L1D-167](https://linear.app/l1der-lab-mjbc/issue/L1D-167)

`FEAT-PL1` · Sprint 2 · Estimación **3** · — (técnica, PRD §17) · RN-22 (dueña), RN-13 (guarda del S1), NFR-10, NFR-11 · 🔗 Regresión [RN-13] → US-143 (dueña del gate y del `preflight`, activa desde S6) · 🔗 Regresión [RN-10] → US-046 (no-fuga de identidad en logs)

## Story
Como equipo de desarrollo, quiero que todo umbral, límite o plazo "a calibrar" se lea de
configuración validada al arrancar y que los logs salgan en JSON con un `traceId`
propagado, para poder ajustar valores sin desplegar código y diagnosticar un análisis de
punta a punta sin registrar datos clínicos.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado `.env` con los valores de readme §1.4 (`ENABLED_CANCER_TYPES`,
  umbral de relevancia, TTL de sesión, *rate limits*, plazos de retención,
  `CLINICAL_CATALOG_VERSION`, `ANALYSIS_MEMORY_MAX`, `EVIDENCE_STALE_YEARS`,
  `AGENT_MAX_ITERATIONS`, `AGENT_MAX_SUBQUERIES`), cuando arrancan `clinical-api` y
  `rag-orchestrator`, entonces cada servicio carga su configuración a través de un único
  módulo tipado (Zod en Node, Pydantic Settings en Python) y la expone en su `/health`
  solo como nombres y versión, sin valores secretos. `[RN-22]` `[readme §1.4]`
- **AC-2 (borde · valor inválido)** · Dado `RELEVANCE_THRESHOLD=1.7` (fuera de [0,1]) o
  `SESSION_IDLE_MINUTES=abc`, cuando arranca el servicio, entonces no queda listo y el
  log nombra la variable y la regla incumplida. `[RN-22]` (asumido)
- **AC-3 (borde · datos reales antes del gate)** · Dado `REAL_ANONYMIZED_ENABLED=true` o
  `REAL_IDENTIFIED_ENABLED=true` en cualquier entorno, cuando arranca `clinical-api` sin
  el `preflight` del S5, entonces no queda listo y el log registra
  `REAL_DATA_GATE_NOT_PASSED`. `[RN-13]` `[readme §1.4 paso 9]`
- **AC-4 (borde · `traceId`)** · Dada una request a `clinical-api` con
  `X-Trace-Id: t-123` que provoca una llamada a `rag-orchestrator`, cuando se leen los
  logs de ambos servicios, entonces todas las líneas de esa request son JSON válido con
  `traceId = "t-123"`; y sin la cabecera, `clinical-api` genera uno y lo propaga.
  `[NFR-10]` `[readme §2.7]`
- **AC-5 (borde · logs sin PHI)** · Dada una request de registro de paciente con
  documento `52123456` y nombre "Lucía Fernanda Rondón Peña" (FX-T4a-a) que falla con
  `422`, cuando se leen los logs de `clinical-api`, entonces no contienen el documento,
  el nombre ni el cuerpo de la request, y el paciente aparece solo por UUID cuando
  existe. `[NFR-11]` `[CLAUDE.md]`
- **AC-6 (borde · nube deshabilitada por defecto)** · Dado un `.env` sin
  `LLM_CLOUD_ENABLED`, cuando arranca `rag-orchestrator`, entonces el valor efectivo es
  `false`. `[RN-12]` `[readme §1.4]`

## Contexto técnico
Convención de DoD (readme §6.0): un valor "propuesta, a calibrar" en el código es un
defecto de revisión. Los valores por defecto de propuesta viven en `.env.example` con un
comentario que cita su RN o TBD. Logger JSON (pino en Node, structlog o equivalente en
Python) con un serializador que descarta cuerpos de request y campos de identidad. AC-1,
AC-2, AC-3 y AC-6 son tests de arranque (Vitest y Pytest); AC-4 y AC-5 son tests de
integración (Supertest con `rag-orchestrator` simulado que captura cabeceras, y lectura
del stream de logs).

## Non-goals
`/metrics` completo y paneles (S6, ADR-44). El `preflight real-data` (US-143, S5).

## INVEST
**Small** ✓ un módulo de configuración por servicio y un logger.
**Testable** ✓ seis tests de arranque o integración con aserciones sobre el estado de salud y los logs.

---

## Conflictos de fuentes

| # | Fuente A | Fuente B | Se siguió |
|---|---|---|---|
| C-22 | PRD §7 NFR-06 y readme §2.4: *backups* con prueba de restauración "por sprint" | readme §5.0 S5 y PRD §14 S5: *backups* en el S5 | Decisión Q-06 (c): *backups* en el S5 (FEAT-T4d). Esta Feature no los incluye |
| S-01 | PRD §14 / readme §5.0: slicing original | Slicing "por hipótesis" (01-requisitos §15) | Sin cambio de sprint para esta Feature (S1 en ambos) |
| Slicing v2 | readme §5.0 S1 y OL-01/OL-02: configuración validada al arranque y logs JSON con `traceId` en el S1 | Slicing v2 aprobado por el usuario (`01-requisitos.md` §15, 2026-10-07): US-037 en el S2 | En el S1 la configuración se lee sin validación de arranque; no hay datos reales ni bandera `REAL_*` que guardar (RN-13) hasta el S6 |
