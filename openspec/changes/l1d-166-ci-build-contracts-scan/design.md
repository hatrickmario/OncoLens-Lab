# Design — l1d-166-ci-build-contracts-scan

## Context

- Hoy solo hay `.github/pull_request_template.md`; no existe ningún *workflow*. El `package.json`
  raíz tiene `contracts:check`, `contracts:generate` y `contracts:generate:check` (US-033) y Vitest
  sin `vitest.config.ts` raíz; `.mcp.json` usa `@playwright/mcp@latest` y `chrome-devtools-mcp@latest`.
- US-033 dejó a US-214 (S2) `contracts:breaking` y `contracts:verify-provider` (spec
  `api-contracts`, "Generación reproducible desde los specs"). AC-2 de esta historia sí exige en el
  S1 que el check de incompatibilidades falle, así que la CI lo ejecuta con un *wrapper* propio
  (D3) sin crear el script npm de US-214.
- `l1d-164-compose-stack` crea los workspaces (`apps/web`, `apps/clinical-api`, `packages/*`), los
  scripts `test:infra` y `smoke:compose` y el modo `LLM_PROVIDER=fake` "para la CI". 
  `l1d-165-secrets-setup-scripts` crea `npm run test:secrets` y pide que corra en la CI.
  `l1d-193-terminos-prohibidos-rn23` y L1D-265 añadirán sus jobs a este *workflow*.
- Datasets: los changes del S1 crean `data/eval/adr39-mini/` y `data/eval/ocr-mini/` con
  manifiesto `clase: sintetico` (L1D-102, L1D-274); readme §6 OL-06 y AC-5 hablan de
  `data/evaluation/`. El corpus público vive en `data/raw/seed/` (L1D-115).
- Supuestos de AC-5 y AC-6 aceptados `[S1 resp. 3]`. Máquina de referencia y runner: Node 22 LTS
  (engines `>=22.18.0`), Python 3.13 (`S1-refinamiento.md` §5).

## Goals / Non-Goals

**Goals:** un *workflow* que en cada PR compila y prueba las tres apps y los scripts de contratos
(AC-1, AC-7), rompe ante un cambio incompatible de contrato (AC-2), ante secretos (AC-3), PII en
`data/` (AC-4) y datasets de evaluación sin clase `sintetico` (AC-5), con un único check requerido
por la protección de `main` (AC-6); cada AC verificable con un fixture reproducible.

**Non-Goals:** ver proposal.md "Fuera de alcance".

## Decisions

### D1. Un *workflow* con jobs independientes y un agregador `ci-ok`

```
ci.yml (pull_request, push: main; concurrency por ref; permissions: contents: read)
├─ build-test    npm ci → build + test de web, clinical-api; pytest de rag-orchestrator;
│                vitest raíz (scripts/contracts, ci/tests unitarios); test:infra; test:secrets
├─ contracts     contracts:check → venv + requirements-codegen.txt → contracts:generate:check
│                → scripts/ci/contracts-breaking.sh (base del PR vs HEAD)
├─ secret-scan   gitleaks (versión fija) sobre el árbol y sobre los commits del PR
├─ data-scan     pii-scan.mjs + dataset-class-check.mjs
├─ stack-smoke   npm run smoke:compose (LLM_PROVIDER=fake, secretos ficticios)
└─ ci-ok         needs: [todos]; falla si alguno no terminó en success
```

- **Agregador:** la protección de rama exige solo `ci-ok` (nombre estable). Añadir un job no obliga
  a tocar la configuración de GitHub: basta añadirlo al `needs:` de `ci-ok`. `ci-ok` usa
  `if: always()` y comprueba `needs.*.result == 'success'`, para que un job saltado o cancelado no
  cuente como verde.
- **Punto de extensión** (L1D-193, L1D-265, US-213/214/217): cada historia añade su job en `ci.yml`
  con su nombre (`lint`, `lint-lenguaje`, …) y lo suma al `needs:` de `ci-ok`; `docs/process/ci.md`
  lo describe. Quien llegue segundo integra el `needs:` sin borrar el del otro.
- **Dependencias aún sin mergear:** los pasos de un workspace o script que todavía no existe
  (L1D-164, L1D-165) se condicionan a su existencia con un paso explícito que imprime
  `omitido: <motivo>`; el condicional se elimina en la tarea de cierre cuando los tres changes están
  en `main`. Nunca se usa `continue-on-error`.
- **Versiones fijas:** acciones de GitHub por SHA de commit (comentario con el tag), Node desde
  `.nvmrc` (versión exacta 22.x), Python desde `.python-version` (3.13.x), gitleaks y oasdiff con
  versión exacta y suma SHA-256 en `ci/tools.lock`. Las versiones se comprueban en la fuente al
  implementar (no se copian de memoria).
- **Caché:** `actions/setup-node` con `cache: npm` y `actions/setup-python` con `cache: pip`;
  ninguna caché guarda artefactos con datos.
- **Alternativas descartadas en una línea:** un *workflow* por job (la protección tendría que
  listarlos todos y cada historia tocaría la configuración); `pull_request_target` (expone
  permisos de escritura a código de forks); un servicio de CI externo (más superficie, sin ganancia).

### D2. AC-1 y AC-7: build, tests y código generado

- `build-test` corre `npm run build --workspaces --if-present` y `npm test --workspaces
  --if-present`, `npx vitest run` en la raíz y, en `apps/rag-orchestrator`, `pip install -r
  requirements.txt` + `pytest`. **Node en el job de Pytest:** el *helper* de validación de
  respuestas de L1D-164 (D5b de ese change, `[S1 resp. 17]`) obtiene el spec empaquetado con
  `node scripts/contracts/bundle-json.mjs rag-orchestrator`; por eso Pytest corre en un job que ya
  hizo `actions/setup-node` (versión de `.nvmrc`) y `npm ci` antes de `pytest`. Si Pytest se separa
  a su propio job (`test-rag`), ese job MUST repetir `setup-node` + `npm ci`; el test estático de
  `ci.yml` (tarea 2.4) lo comprueba. Los tests de integración que necesitan PostgreSQL (US-038) usan el
  servicio que su historia declare; este change no lo crea.
- `contracts` crea un venv (`python -m venv .venv-codegen`), instala
  `scripts/contracts/requirements-codegen.txt` y ejecuta `npm run contracts:generate:check` (falla
  si lo generado TS, Zod o Pydantic no está al día) `[US-033 AC-16]`. Corre en todo PR, no solo
  cuando cambia un `openapi.yaml` (es barato y cubre una edición a mano de lo generado).
- **`vitest.config.ts` raíz** con `test.exclude: ['.claude/**', '**/node_modules/**', …defaults]`
  para no recoger copias de los worktrees `[Pre-S1-cierre P-8]`.
- **`.mcp.json`:** `@playwright/mcp@<x.y.z>` y `chrome-devtools-mcp@<x.y.z>` exactos `[P-6]`.
- **Test de reglas (P-8):** `scripts/contracts/__tests__/reglasSinListasLiterales.test.mjs`
  analiza con el AST (`acorn`, ya transitivo, o `typescript`, ya en devDependencies) cada archivo
  de `scripts/contracts/rules/` y falla si declara un array literal de cadenas que coincida con
  nombres de identidad o rutas de `lib/identity.mjs` / `lib/paths.mjs` en lugar de importarlos.

### D3. AC-2: cambio incompatible

- `scripts/ci/contracts-breaking.sh <base-ref>`: extrae los dos `openapi.yaml` de la base del PR
  (`git archive <base> ':(glob)apps/*/openapi.yaml' contracts`) en un directorio temporal, empaqueta
  base y HEAD con `scripts/ci/bundle-specs.mjs` (que usa `scripts/contracts/lib/bundle.mjs`; los specs referencian
  `contracts/schemas/`) y ejecuta `oasdiff breaking --fail-on ERR` por proveedor. Los proveedores salen de `PROVIDERS`
  (`scripts/contracts/lib/specs.mjs`) a través de `bundle-specs.mjs`: el script no los repite, e imprime
  `<proveedor>: comparado`. Salida: el proveedor y el cambio
  (p. ej., `rag-orchestrator: removed required property 'citedSources'`).
- **Nivel de fallo fijado en `ERR` (ADR-26):** solo rompen la CI los cambios que `oasdiff`
  clasifica como `ERR` (incompatibles). Los `WARN` se imprimen en el log y no rompen. En concreto,
  `response-body-wrapped-in-one-of-original-preserved` —que aparece cuando una respuesta pasa a
  `oneOf` conservando la variante original— es el patrón de los `oneOf` **aditivos** del S1
  (L1D-106 `RETRIEVAL_UNAVAILABLE`, L1D-180 `NLI_UNAVAILABLE`, L1D-203; `[S1 resp. 12]`): el
  consumidor que conoce la forma original la sigue recibiendo, así que es compatible según
  ADR-26 y se declara aquí como aceptado. Subir el umbral a `--fail-on WARN` o añadir excepciones
  es una decisión de US-214, no de este change. Fixture `ac2-oneof-aditivo` (D7).
- Un cambio incompatible **declarado** (ADR-26) no se resuelve aquí: la CI falla y el PR documenta
  la excepción; US-214 decidirá el mecanismo de excepción de `contracts:breaking`. Hasta entonces
  no hay *bypass*.
- La mitad de "el build de `clinical-api` falla" la da `tsc` al compilar contra
  `packages/api-contracts/src/types/rag-orchestrator/types.gen.ts` regenerado: requiere que el
  gateway (L1D-103/L1D-104) use `citedSources`. El fixture lo comprueba; si al implementar aún no
  hay consumidor, el fixture queda en rojo y el change no se cierra (no se fabrica un consumidor
  de prueba).
- Alternativa descartada: `oasdiff` directamente sobre los archivos sin empaquetar (no resuelve
  igual las `$ref` relativas a `contracts/`).

### D4. AC-3: secretos con gitleaks

- `gitleaks dir .` sobre el árbol y `gitleaks git --log-opts="<base>..HEAD"` sobre los commits del
  PR (un secreto añadido y borrado en el mismo PR también falla). `--redact` siempre: el informe
  nombra archivo, línea y regla, nunca el valor.
- `.gitleaks.toml`: `[extend] useDefault = true` (incluye `private-key` para PEM y las reglas de
  tokens) + regla propia para JWT (`eyJ…\.eyJ…\.…`). Allowlist solo por ruta y vacía al inicio;
  cada entrada nueva exige justificación en el PR (Gate 2, privacy-guardian).
- Los fixtures **no versionan** claves ni tokens: el caso los genera en tiempo de ejecución
  (`openssl genpkey` y una cadena aleatoria con prefijo de token) dentro del clon temporal.
- Alternativa descartada: `trufflehog` (equivalente; gitleaks ya está previsto en el refinamiento,
  `S1-refinamiento.md` §5) y el *secret scanning* de GitHub (complementario, no falla el PR).

### D5. AC-4 y AC-5: PII y clase de datos

- **Formatos (RN-22, sin asumir país):** `config/pii-formats.json`, versionado, con
  `{ version, formatos: [{ id, tipo, patron, palabrasClave?, descripcion }] }`; `tipo` ∈
  `documento_identidad`, `telefono`, `correo`. Valores iniciales: documento de 6–12 dígitos (con
  separadores opcionales) **precedido** de una palabra clave configurable (`documento`, `cédula`,
  `CC`, `DNI`, `pasaporte`, `ID`…), teléfono en E.164 (`+` y 8–15 dígitos) o 7–12 dígitos con
  separadores tras `tel`/`teléfono`/`celular`, y correo.
- **Dominios de correo reservados exentos (Gate 1, 2ª vuelta):** el formato `correo` declara en
  `config/pii-formats.json` `dominiosExentos: ["*.test", "*.local", "*.invalid", "*.localhost",
  "example.com", "example.org", "example.net"]` (RFC 2606 / RFC 6761; `example.*` incluye sus
  subdominios). Un correo cuyo dominio casa con uno de ellos **no es hallazgo en ningún archivo**:
  la exención es global y vive en el formato, no en la allowlist, porque esos dominios no pueden
  pertenecer a una persona. Cualquier otro dominio sigue siendo hallazgo.
- **Fuente única de formatos de PII (interfaz con L1D-203):** `config/pii-formats.json` es la
  **única** definición de formatos de PII del repositorio (`id`, `tipo`, `patron`,
  `palabrasClave`, `dominiosExentos`, `version`). L1D-203 (desidentificación del contexto de IA) la
  **reutiliza** para enmascarar en ejecución y solo añade, en su propio módulo, sus **reglas de
  reemplazo** (con qué token se sustituye cada `tipo`); no redefine patrones. Contrato de la
  interfaz: el archivo es JSON versionado, de solo lectura para sus consumidores, y un cambio de
  forma (no de valores) sube `version` y obliga a revisar a ambos consumidores en el mismo PR. La
  exención de dominios reservados es semántica del escaneo; el enmascarado de L1D-203 puede
  ignorarla (enmascarar de más no fuga). El detector de documentos de ADR-40/US-049 SHALL
  reutilizarlo igualmente o justificar en su ADR por qué no.
- **Raíz del escaneo (Gate 1, 2026-10-14):** `scripts/ci/pii-scan.mjs` recorre **todo lo que
  lista `git ls-files`**, no solo `data/`: la PII puede filtrarse en `contracts/examples/`, en los
  fixtures de `apps/*/test*`, en `eval/`, en `reports/` o en `docs/` (y en `backlog/`). Las
  exclusiones son **explícitas** en `config/pii-scan.json`:
  `{ version, raiz: "git-ls-files", excluir: [{ patron, motivo }] }`. **Protección invertida (Gate 1,
  2ª vuelta):** en lugar de prohibir rutas concretas, `pii-scan.mjs` define en código (no en
  configuración, para que la configuración no pueda ampliarse a sí misma) la **lista cerrada**
  `EXCLUSIONES_PERMITIDAS`: lockfiles (`**/package-lock.json`, `**/*.lock`, `ci/tools.lock`) y
  binarios por extensión (`**/*.{png,jpg,jpeg,gif,ico,webp,pdf,woff,woff2,ttf,zip,gz}`). Toda
  entrada de `excluir` debe ser **idéntica** a un patrón de esa lista; cualquier otra exclusión
  hace fallar el job nombrándola. Lo demás solo puede omitirse por la allowlist, por fixture y
  valor.
- **Qué se escanea:** todo archivo versionado de texto (detección por ausencia de bytes NUL en los
  primeros 8 KB, sin lista de extensiones, para cubrir `.ts`, `.py`, `.sql`, `.md`, `.json`…). Por
  cada hallazgo imprime `ruta:línea: <id del formato>` **sin el valor** (RN-14: el log de la CI es
  público). PDF y binarios: se listan como "no escaneado" sin fallar (el gate de PII de documentos
  es de ADR-40/US-049); un binario en `data/eval/` debe estar cubierto por un manifiesto
  `sintetico` (D5, clase de datos).
- **Allowlist (AC-4), por fixture y valor (Gate 1, 2ª vuelta):** `config/pii-allowlist.json` =
  `[{ fixture, clase: "sintetico", rutas: [globs], valores: [{ formato, sha256 }], motivo }]`.
  `sha256` es el hash hexadecimal del **valor normalizado** (`normalizarValor(formato, valor)`:
  documento → letras en mayúscula y dígitos sin separadores; teléfono → `+` inicial y dígitos;
  correo → minúsculas sin espacios), de modo que la allowlist **no contiene PII en claro** (ni
  siquiera sintética) y no amplía lo que se omite a valores nuevos. Un hallazgo se omite **solo
  si** su ruta casa con un glob de `rutas` **y** el par `(formato, sha256(valor normalizado))` está
  en `valores` de **esa misma** entrada; cualquier otro valor en la misma ruta sigue fallando.
  Globs iniciales (una entrada por fixture, FX-T4a-a y el caso del selftest):
  `backlog/features/FEAT-T4a-*.md`, `apps/clinical-api/prisma/seed/**`,
  `apps/clinical-api/test/**/deidentification/**`, `openspec/changes/*-desidentificacion-*/**`,
  `openspec/specs/deidentification/**` y `ci/tests/cases/ac4-allowlist/**`; los `valores` se
  obtienen ejecutando el escáner sobre `main` al implementar (imprime el hash, nunca el valor).
  **Validación de la allowlist** (falla el job nombrando la entrada): `clase` distinta de
  `sintetico`, `valores` vacío o ausente, `rutas` vacío, o un glob **más amplio que un directorio
  de fixture**: `**` o `*` en el primer segmento, o un glob sin ningún segmento con un literal
  propio del fixture (fuera de `DIRECTORIOS_GENERICOS`: `apps`, `clinical-api`, `rag-orchestrator`,
  `web`, `test`, `tests`, `prisma`, `openspec`, `changes`, `specs`, `backlog`, `features`, `data`,
  `docs`, `ci`, `cases`, `contracts`, `examples`, `eval`, `reports`). Así `backlog/**`,
  `apps/clinical-api/test/**` u `openspec/changes/**` se rechazan y los seis globs iniciales pasan.
  Se interpreta "marcados `sintetico: true`" de AC-4 como
  `clase: sintetico`, el mismo vocabulario que `data_origin` y los manifiestos de L1D-102 y
  L1D-274, para no tener dos marcas (ver Open Questions). Una entrada sin esa marca hace fallar el
  job. La lista inicial se obtiene ejecutando el escáner sobre `main` al implementar; cada entrada
  nueva se justifica en el PR (Gate 2, privacy-guardian).
- **`scripts/ci/dataset-class-check.mjs` (AC-5):** para cada archivo bajo las raíces de
  `config/dataset-roots.json` (por defecto `["data/eval/", "data/evaluation/"]`, porque los changes
  del S1 usan `data/eval/` y readme OL-06 `data/evaluation/`) busca el manifiesto más cercano
  (`manifest.json` / `manifest.yaml`) o la cabecera del archivo; si no declara `clase: sintetico`,
  falla con `ruta: dataset sin clase de datos \`sintetico\``.
- Ambos escáneres son Node ESM sin dependencias nuevas (usan `yaml`, ya en devDependencies), con
  tests unitarios en `scripts/ci/__tests__/` y entrada por parámetro (raíz, config) para probarlos
  sobre directorios temporales.
- Alternativa descartada: reutilizar el adapter `pii/` de `rag-orchestrator` (no existe aún y
  acoplaría la CI a Backend 2); Presidio en la CI (pesado, sin ganancia para patrones regulares).

### D5b. Exenciones declaradas de los escáneres (Gate 2, vuelta 1)

Cada exención es un campo declarativo de `config/pii-formats.json` o una constante cerrada del código, con su motivo y su
test de que la regla sigue detectando el caso original. El `patron` de cada formato es **neutro** (describe la PII); las
exenciones las aplica solo `scripts/lib/formatosPii.mjs`, que comparten el escáner y `assertExamplesSynthetic`.

| Exención | Dónde | Motivo | Test de que lo original se sigue detectando |
|---|---|---|---|
| `prefijosExentos: ["SINT-"]` en `documento_identidad` (el centinela sale de ahí: `PREFIJO_SINTETICO`) | formato | los ejemplos de `contracts/examples/` exigen el prefijo `SINT-` (assertExamplesSynthetic) | el mismo número sin prefijo, en la misma línea, se informa |
| `contextosExentos: ["url"]` | formato | `documentos/CDR…` de una URL del corpus no es un documento | el mismo texto con barra fuera de una URL y `Documento/ID: …` se informan |
| `dominiosExentos` (RFC 2606 / 6761) | formato `correo` | no pueden pertenecer a una persona | `notexample.com` y otros dominios se informan |
| `correosExentos: [{local: icd, dominio: who.int}]` | formato `correo` | buzón institucional público de consultas de la CIE de la OMS (DEC-04, FEAT-00) | otro buzón del mismo dominio se informa |
| `EXCLUSIONES_PERMITIDAS` (lockfiles y binarios) | código | sin texto libre | cualquier otra exclusión hace fallar el job |
| Siglas de documento (`CC`, `C.C.`, `TI`, `T.I.`, `CE`, `C.E.`, `NUIP`, `ID`, `HC`, `tarjeta de identidad`, `historia clínica`) | formato | cubren cómo se escribe un documento en español; las de hasta cuatro caracteres exigen límite de palabra y no casan tras `_` (`nct_id`) | un test por sigla |
| Allowlist por fixture y valor | `config/pii-allowlist.json` | PII sintética conocida (FX-T4a-a/c, búsqueda parcial, L1D-203, parches negativos de AC-17, `CC` sembrados de FEAT-01a/01b/02b/11b/11c/AP1) | un segundo valor sin hash en la misma ruta y el mismo hash en otra ruta se informan |
| `.gitleaks.toml`: UUID de `Idempotency-Key` | ruta exacta + regla `generic-api-key` + forma del valor (`condition = "AND"`) | ejemplo sintético de L1D-139, no es una credencial | cualquier otra ruta o forma sigue sujeta a la regla |

**Clase de datos:** sin exención por extensión. El manifiesto más cercano (la subida se corta en la raíz configurada) manda: si
declara otra clase, la cabecera del archivo no la corrige. `data/eval/ol06-particion-v1/manifest.yaml` cubre ese directorio.
La marca `sintetico` tiene una sola definición (`esMarcaSintetica`: `clase: sintetico` o `sintetico: true`), usada por los
manifiestos y por la allowlist.

**`--hash`** imprime el sha256 del valor normalizado para poblar la allowlist: el hash de un número corto se invierte por
fuerza bruta, así que no protege el valor, solo lo identifica; se usa únicamente con valores sintéticos.

### D6. AC-6: protección de rama

- La configuración de GitHub no es código: la aplica el humano administrador (Settings → Branches
  o *ruleset*): PR obligatorio, *status check* requerido `ci-ok`, sin *bypass* para administradores
  y rama actualizada antes de mergear. Ningún agente cambia la configuración del repositorio.
- `scripts/ci/check-branch-protection.sh` (solo lectura, `gh api repos/{owner}/{repo}/rules/branches/main`
  o `…/branches/main/protection`) imprime y verifica esas condiciones; su salida se adjunta al PR.
  El fixture de AC-6 es un PR de prueba real en la rama `ci/selftest-ac6` con la CI en rojo,
  cuyo botón de merge queda bloqueado (captura en el PR; el PR se cierra sin mergear).

### D7. Fixtures de PR (`ci/tests/`)

- `ci/tests/cases/<caso>/case.json`: `{ ac, descripcion, job, aplicar, esperado: "pasa" | "falla",
  mensaje, archivo }`; `aplicar` es un script del caso que modifica un clon temporal.
- `ci/tests/run-cases.sh`: `git clone --local` del repo a `$(mktemp -d)`, aplica el caso, ejecuta
  el mismo comando del job (los jobs llaman a scripts de `scripts/ci/`, nunca a lógica en línea en
  el YAML, para que el fixture pruebe lo mismo que la CI) y compara código de salida, mensaje y
  archivo nombrado. Borra el directorio al final.
- Casos: `ac1-limpio` (todo pasa), `ac2-cited-sources` (elimina `citedSources` de
  `EvidenceOption` en el spec de `rag-orchestrator`: `contracts-breaking.sh` y el build de
  `clinical-api` fallan), `ac2-oneof-aditivo` (envuelve una respuesta en un `oneOf` que conserva la
  variante original: pasa e imprime el `WARN`), `ac3-pem` y `ac3-token` (generados en tiempo de ejecución), `ac4-documento`
  y `ac4-telefono` (valores sintéticos `SINT-` en `data/`), `ac4-fuera-de-data` (el mismo valor en
  `contracts/examples/` y en `apps/clinical-api/test/fixtures/`), `ac4-allowlist` (un archivo en
  `ci/tests/cases/ac4-allowlist/` con la PII sintética de FX-T4a-a cuyos hashes están en la entrada
  pasa; un segundo valor sin hash en la misma ruta falla, y la entrada sin marca, sin `valores` o
  con el glob `ci/tests/**` falla), `ac4-correo-reservado` (correos `@example.com` y `@demo.test`
  pasan sin allowlist; uno de otro dominio falla), `ac5-sin-clase`,
  `ac7-generado-desactualizado` (edita a mano un `types.gen.ts`). AC-6: D6.
- `ci-selftest.yml` corre `run-cases.sh` en PRs que tocan `.github/workflows/**`, `ci/**`,
  `scripts/ci/**`, `config/**` o `.gitleaks.toml`, y por `workflow_dispatch`. Los fixtures viven
  fuera de `data/` y no contienen PII con forma real: solo números `SINT-` con la forma del patrón.

**Casos pendientes (Gate 2, vuelta 1):** `pendiente` es `{ motivo, hastaQueSeArchive: [changes] }`. El runner lo lista
como PENDIENTE (y falla con `--estricto`), y cuando alguno de esos changes aparece en `openspec/changes/archive/` el caso cuenta
como FALLA aunque no se use `--estricto`: no puede quedar pendiente para siempre. Con L1D-103/L1D-104 archivados, el caso
`ac2-cited-sources-build` debe pasar a verde en el cierre.

## Privacidad y ownership

- **Fronteras:** este change no hace cruzar datos entre `web`, `clinical-api` y `rag-orchestrator`:
  la CI solo compila y prueba. `rag-orchestrator` no recibe ningún dato clínico ni ruta hacia
  `clinical-minio`; el smoke usa el Compose de L1D-164 tal cual, con secretos ficticios.
- **Datos reales y secretos (RN-13, RN-14):** el propósito del change es impedirlos. La CI no usa
  ningún secreto del repositorio (`permissions: contents: read`, sin `secrets.*`), corre en
  `pull_request` (nunca `pull_request_target`) y no publica artefactos con contenido de `data/`.
  Los escáneres nunca imprimen el valor detectado (gitleaks `--redact`, `pii-scan` solo con id del
  formato): el log de la CI de un repo público es público.
- **Fixtures:** claves y tokens se generan en tiempo de ejecución; la PII de los fixtures es
  sintética (`SINT-`) y vive fuera de `data/`.
- **Desidentificación (RN-11) y RN-12:** no aplican; ningún prompt ni LLM real corre en la CI
  (`LLM_PROVIDER=fake`).

## Contratos

Sin cambios en `apps/clinical-api/openapi.yaml`, `apps/rag-orchestrator/openapi.yaml` ni
`contracts/examples/`. El change **consume** los contratos: valida (`contracts:check`), comprueba lo
generado (`contracts:generate:check`) y compara contra la base con `oasdiff` (D3). El fixture de AC-2
modifica el spec solo en un clon temporal. No hay proveedor ni consumidor nuevos; ADR-26 (contrato
estable entre sprints) es justo lo que el check de incompatibilidades hace cumplir.

## Dependencias y colaboradores

| Módulo | Nuevo / modificado | Depende de |
|---|---|---|
| `.github/workflows/ci.yml`, `ci-selftest.yml` | nuevo | scripts de `scripts/ci/`, scripts npm de L1D-164/L1D-165 |
| `scripts/ci/pii-scan.mjs` | nuevo | `config/pii-formats.json`, `config/pii-allowlist.json`, `config/pii-scan.json`; extrae `detectarPii(texto, formatos)`, `normalizarValor(formato, valor)`, `estaEnAllowlistSintetica(ruta, formato, sha256, allowlist)`, `validarAllowlist(allowlist)` y `validarExclusiones(excluir)` (puros) |
| `scripts/ci/dataset-class-check.mjs` | nuevo | `config/dataset-roots.json`; extrae `manifiestoMasCercano(ruta)` y `declaraClaseSintetico(manifiesto)` (puros) |
| `scripts/ci/lib/claseDatos.mjs` | nuevo | compartido por los dos escáneres: una sola definición de "marcado `sintetico`" |
| `scripts/ci/contracts-breaking.sh` | nuevo | `scripts/ci/bundle-specs.mjs` (sobre `scripts/contracts/lib/bundle.mjs`), `oasdiff` |
| `scripts/ci/check-branch-protection.sh` | nuevo | `gh` |
| `config/pii-formats.json` (interfaz) | nuevo | consumido también por L1D-203 en ejecución (solo añade reglas de reemplazo); fuente única de formatos de PII |
| `ci/tests/` | nuevo | `scripts/ci/*`, `git`, `openssl` |
| `vitest.config.ts`, `.mcp.json`, `.nvmrc`, `.python-version`, `.gitleaks.toml`, `ci/tools.lock` | nuevo / modificado | — |
| `scripts/contracts/__tests__/reglasSinListasLiterales.test.mjs` | nuevo | `lib/identity.mjs`, `lib/paths.mjs` |

Los escáneres leen archivos por una función inyectada (`leerArchivo`, `listarArchivos`) para
probarlos con directorios temporales sin *mocks* de módulos propios.

## Risks / Trade-offs

- **Falsos positivos de PII** en el corpus público (`data/raw/seed/`: teléfonos de editoriales,
  identificadores de ensayos) y, al escanear todo `git ls-files`, en `docs/` y `backlog/` → los formatos exigen palabra clave para documentos; un falso
  positivo se resuelve afinando el formato en `config/pii-formats.json` en un PR revisado, nunca con
  la allowlist (que solo admite valores `sintetico` concretos, por hash, de un fixture).
- **Tiempo de CI:** `stack-smoke` levanta ocho contenedores; se ejecuta en paralelo y con caché de
  capas; si supera ~10 min se moverá a `push` a `main` + PRs que toquen `infra/` (decisión del
  humano, no de este change).
- **Dependencias sin mergear** (L1D-164/165/103/104): pasos condicionados con `omitido:` explícito
  y retirados al cierre; el riesgo es olvidarlos → tarea de cierre y test que falla si `ci.yml`
  contiene `omitido:` cuando los workspaces existen.
- **Brecha hasta US-214:** el *wrapper* `contracts-breaking.sh` no admite excepciones declaradas.

## Migration Plan

Primer PR: `ci.yml` con todos los jobs; tras el primer verde en `main`, el humano activa la
protección de rama con `ci-ok` y se ejecuta `check-branch-protection.sh`. Rollback: borrar el
*workflow* (no hay estado).

## Open Questions

- **Marca de AC-4:** el AC dice "marcados `sintetico: true`" y AC-5 "clase de datos `sintetico`";
  este diseño unifica en `clase: sintetico` (D5). Si el humano prefiere la marca literal de AC-4,
  `claseDatos.mjs` acepta ambas sin cambiar el resto.
- **Escaneo de `backlog/_piloto-v1/`:** queda dentro de `git ls-files`; si tiene PII sintética, va a
  la allowlist como cualquier otro fixture, por valor (no se excluye la carpeta).
- **Raíz de evaluación:** `data/eval/` (changes del S1) frente a `data/evaluation/` (readme OL-06,
  AC-5). Se cubren las dos por configuración; conviene fijar una sola en US-072.
- **Valores iniciales de `config/pii-formats.json`** propuestos aquí; ADR-40 (S2) puede ajustarlos.
