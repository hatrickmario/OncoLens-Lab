## ADDED Requirements

### Requirement: La CI compila y prueba las tres apps y los contratos en cada PR
`.github/workflows/ci.yml` MUST ejecutarse en cada `pull_request` y en cada `push` a `main`, con `permissions: contents: read` y sin secretos del repositorio. MUST ejecutar build y tests de `web`, `clinical-api` y `rag-orchestrator`, el `vitest` raíz, `test:infra`, `test:secrets`, `contracts:check`, `contracts:generate:check` y el smoke del stack con `LLM_PROVIDER=fake`.

#### Scenario: Un PR sin cambios de contrato ni secretos termina en verde [US-036 AC-1]
- **GIVEN** el fixture `ac1-limpio`: un clon temporal de `main` con un cambio de documentación sin contrato, secretos ni PII
- **WHEN** se ejecutan los comandos de los jobs `build-test`, `contracts`, `secret-scan`, `data-scan` y `stack-smoke`
- **THEN** cada uno termina con código 0, `contracts:check` y `contracts:generate:check` pasan y `ci-ok` queda en `success`

### Requirement: El job de Pytest tiene Node disponible
El job de `ci.yml` que ejecuta `pytest` de `rag-orchestrator` MUST ejecutar `actions/setup-node` y `npm ci` antes de `pytest`, porque el *helper* de validación de respuestas contra el spec (L1D-164) empaqueta el spec con `node scripts/contracts/bundle-json.mjs`.

#### Scenario: El test estático de ci.yml exige Node en el job de Pytest [US-036 AC-1]
- **GIVEN** `ci.yml` parseado por `ci/tests/workflow.test.mjs`
- **WHEN** se busca el job que contiene el paso `pytest`
- **THEN** ese job tiene `actions/setup-node` y `npm ci` en pasos anteriores a `pytest`; si falta alguno, el test falla nombrando el job

### Requirement: El agregador ci-ok solo queda en verde si todos los jobs pasan
El job `ci-ok` MUST depender de todos los jobs de `ci.yml` y MUST terminar en `failure` si alguno no terminó en `success`, incluidos los omitidos y cancelados. Ningún paso SHALL usar `continue-on-error`.

#### Scenario: Un job fallido deja en rojo el agregador [US-036 AC-1]
- **GIVEN** un PR en el que cualquier job de `ci.yml` termina en `failure`, `cancelled` o `skipped`
- **WHEN** se evalúa `ci-ok`
- **THEN** `ci-ok` termina en `failure` y nombra el job que no terminó en `success`

### Requirement: Un cambio incompatible de contrato rompe la CI
El job `contracts` MUST comparar cada `openapi.yaml` del PR con el de la base del PR, ambos empaquetados con sus `$ref` a `contracts/`, con `oasdiff breaking --fail-on ERR`, y MUST fallar ante cualquier cambio de nivel `ERR`, nombrando el proveedor y el cambio. El build de `clinical-api` MUST compilar contra los tipos regenerados desde el spec de `rag-orchestrator`, de modo que un campo eliminado que el código consume rompa la compilación (readme §2.6, ADR-26).

#### Scenario: Eliminar citedSources rompe el build y el check de incompatibilidades [US-036 AC-2]
- **GIVEN** el fixture `ac2-cited-sources`: un clon temporal donde se elimina `evidenceOptions[].citedSources` (`EvidenceOption.citedSources`) del spec de `rag-orchestrator` y se regenera `packages/api-contracts`
- **WHEN** se ejecutan `scripts/ci/contracts-breaking.sh` contra la base y el build de `clinical-api`
- **THEN** `contracts-breaking.sh` termina con código distinto de 0 nombrando `rag-orchestrator` y `citedSources`, y `tsc` de `clinical-api` falla al compilar contra el tipo regenerado

### Requirement: Los avisos de oasdiff no rompen la CI
Los avisos de nivel `WARN` de `oasdiff`, incluido `response-body-wrapped-in-one-of-original-preserved` de un `oneOf` aditivo que conserva la variante original, MUST imprimirse y MUST NOT hacer fallar el job `contracts` (ADR-26).

#### Scenario: Un oneOf aditivo que conserva la respuesta original no rompe la CI [US-036 AC-2] [ADR-26]
- **GIVEN** el fixture `ac2-oneof-aditivo`: un clon temporal donde una respuesta `503` del spec de `rag-orchestrator` pasa a ser un `oneOf` que conserva el schema original y añade una variante con un código nuevo
- **WHEN** se ejecuta `scripts/ci/contracts-breaking.sh` contra la base
- **THEN** termina con código 0 e imprime el aviso `response-body-wrapped-in-one-of-original-preserved` con el proveedor

### Requirement: Lo generado desde los specs está al día en cada PR
El job `contracts` MUST instalar `scripts/contracts/requirements-codegen.txt` en un entorno virtual de Python y ejecutar `npm run contracts:generate:check`, que MUST fallar si los tipos TS, los schemas Zod o los modelos Pydantic generados difieren de lo que producen los specs o hay un archivo generado sin versionar `[US-033 AC-16]`. El `vitest` raíz MUST excluir `.claude/**` y `**/node_modules/**`.

#### Scenario: Un archivo generado editado a mano hace fallar la CI [US-036 AC-7] [US-033 AC-16]
- **GIVEN** el fixture `ac7-generado-desactualizado`: un clon temporal que cambia un `openapi.yaml` sin regenerar, o edita a mano `packages/api-contracts/src/types/rag-orchestrator/types.gen.ts`
- **WHEN** el job `contracts` crea el venv con `requirements-codegen.txt` y ejecuta `npm run contracts:generate:check`
- **THEN** termina con código distinto de 0 y nombra la ruta generada que no está al día

#### Scenario: El vitest raíz no recoge copias de los worktrees [US-036 AC-7]
- **GIVEN** un archivo de test bajo `.claude/worktrees/<x>/` y otro bajo un `node_modules/`
- **WHEN** se ejecuta `npx vitest run --reporter=json` en la raíz
- **THEN** ninguno de los dos aparece entre los archivos de test ejecutados

### Requirement: La CI bloquea secretos en el repositorio
El job `secret-scan` MUST escanear con gitleaks, en versión fija, el árbol del PR y los commits del PR, con las reglas por defecto más las de `.gitleaks.toml`. MUST fallar ante una clave privada PEM o una cadena con forma de token, nombrando archivo, línea y regla, y MUST NOT imprimir el valor detectado (`--redact`), porque el log de la CI es público (RN-14, SEG-12). La allowlist de `.gitleaks.toml` MUST ser solo por ruta.

#### Scenario: Una clave privada PEM hace fallar el escaneo y nombra el archivo [US-036 AC-3] [RN-14]
- **GIVEN** el fixture `ac3-pem`: un clon temporal al que se añade un archivo con una clave privada PEM generada en tiempo de ejecución
- **WHEN** se ejecuta el comando del job `secret-scan`
- **THEN** termina con código distinto de 0, el informe nombra la ruta del archivo y la regla `private-key`, y la salida no contiene ninguna línea de la clave

#### Scenario: Una cadena con forma de token hace fallar el escaneo [US-036 AC-3] [RN-14]
- **GIVEN** el fixture `ac3-token`: un clon temporal con un archivo que contiene un token con forma de JWT o de clave de API generado en tiempo de ejecución, añadido y borrado en dos commits del PR
- **WHEN** se ejecuta el comando del job `secret-scan` sobre los commits del PR
- **THEN** termina con código distinto de 0, nombra el archivo y el commit, y la salida muestra el valor redactado

### Requirement: La CI bloquea PII en los archivos versionados con formatos configurables
El job `data-scan` MUST escanear todos los archivos de texto que lista `git ls-files` (incluidos `data/`, `contracts/examples/`, los fixtures de `apps/*/test*`, `eval/`, `reports/` y `docs/`), salvo las exclusiones de `config/pii-scan.json`. MUST aplicar los formatos de `config/pii-formats.json` (documento de identidad, teléfono y correo, sin asumir país; RN-22) y MUST fallar ante cada coincidencia, nombrando `ruta:línea` y el id del formato, sin imprimir el valor (RN-14).

#### Scenario: Un documento de identidad en data/ hace fallar el escaneo con archivo y línea [US-036 AC-4] [RN-14]
- **GIVEN** el fixture `ac4-documento`: un clon temporal con `data/notas.json` que en la línea 7 contiene un número sintético con la forma del formato `documento_identidad` precedido de su palabra clave
- **WHEN** se ejecuta `scripts/ci/pii-scan.mjs`
- **THEN** termina con código distinto de 0 e imprime `data/notas.json:7: documento_identidad`, sin el número

#### Scenario: PII fuera de data/ también hace fallar el escaneo [US-036 AC-4] [RN-14]
- **GIVEN** el fixture `ac4-fuera-de-data`: un clon temporal con un documento sintético precedido de su palabra clave en `contracts/examples/evidence-analysis-request.json` y otro en `apps/clinical-api/test/fixtures/paciente.json`, sin entrada en la allowlist
- **WHEN** se ejecuta `scripts/ci/pii-scan.mjs` con la raíz por defecto (`git ls-files`)
- **THEN** termina con código distinto de 0 y nombra las dos rutas con su línea y `documento_identidad`, sin el valor

#### Scenario: Un teléfono en data/ hace fallar el escaneo [US-036 AC-4] [RN-14]
- **GIVEN** el fixture `ac4-telefono`: un clon temporal con un archivo en `data/` que contiene un teléfono sintético en formato E.164
- **WHEN** se ejecuta `scripts/ci/pii-scan.mjs`
- **THEN** termina con código distinto de 0 y nombra el archivo, la línea y el formato `telefono`

#### Scenario: Un correo de un dominio reservado no es hallazgo [US-036 AC-4] [RN-14]
- **GIVEN** el fixture `ac4-correo-reservado`: un clon temporal con correos en `@example.com`, `@demo.test`, `@host.local`, `@x.invalid` y `@app.localhost` y uno en otro dominio, sin entrada en la allowlist
- **WHEN** se ejecuta `scripts/ci/pii-scan.mjs`
- **THEN** solo se informa el correo del dominio no reservado, con `ruta:línea: correo` y sin el valor

### Requirement: Los formatos de PII tienen una única fuente
`config/pii-formats.json` MUST ser la única definición de formatos de PII del repositorio, incluida la lista `dominiosExentos` del formato `correo` (`*.test`, `*.local`, `*.invalid`, `*.localhost`, `example.com`, `example.org`, `example.net`; RFC 2606 / RFC 6761), exenta globalmente en el escaneo. Otros consumidores (L1D-203 para enmascarar en ejecución) SHALL reutilizar ese archivo y añadir solo sus reglas de reemplazo, sin redefinir patrones.

#### Scenario: El escáner y el enmascarado leen los mismos formatos [US-036 AC-4] [RN-22]
- **GIVEN** `config/pii-formats.json` con su `version`
- **WHEN** se ejecuta `scripts/ci/pii-scan.mjs`
- **THEN** usa solo los formatos de ese archivo y ningún otro archivo del repositorio define patrones de documento de identidad, teléfono o correo

### Requirement: Las exclusiones del escaneo de PII solo salen de una lista cerrada
Cada exclusión de `config/pii-scan.json` MUST declarar un patrón y un motivo, y su patrón MUST ser idéntico a uno de la lista cerrada `EXCLUSIONES_PERMITIDAS` definida en `scripts/ci/pii-scan.mjs` (lockfiles y binarios por extensión); cualquier otra exclusión MUST hacer fallar el job `data-scan`. Todo lo demás solo se omite por la allowlist, por fixture y valor.

#### Scenario: Una exclusión fuera de la lista cerrada se rechaza [US-036 AC-4] [RN-14]
- **GIVEN** un `config/pii-scan.json` con una exclusión `docs/**` (o cualquier patrón que no sea un lockfile ni un binario de la lista cerrada)
- **WHEN** se ejecuta `scripts/ci/pii-scan.mjs`
- **THEN** termina con código distinto de 0 nombrando la exclusión no permitida

#### Scenario: Una exclusión de lockfile de la lista cerrada se acepta [US-036 AC-4]
- **GIVEN** un `config/pii-scan.json` cuya única exclusión es `**/package-lock.json` con su motivo
- **WHEN** se ejecuta `scripts/ci/pii-scan.mjs` sobre un clon sin PII
- **THEN** termina con código 0

### Requirement: La allowlist de PII es por fixture y por valor, sin PII en claro
Cada entrada de `config/pii-allowlist.json` MUST tener la forma `{ fixture, clase: sintetico, rutas: [globs], valores: [{ formato, sha256 }], motivo }`, donde `sha256` es el hash del valor normalizado, de modo que la allowlist no contiene PII en claro. Un hallazgo SHALL omitirse solo si su ruta casa con un glob de `rutas` **y** el par (formato, sha256 del valor normalizado) está en `valores` de esa misma entrada.

#### Scenario: Solo se omiten los valores sintéticos listados de un fixture [US-036 AC-4] [OL-06]
- **GIVEN** el fixture `ac4-allowlist`: un archivo en `ci/tests/cases/ac4-allowlist/` con el documento y el teléfono sintéticos de FX-T4a-a, cuyos hashes están en la entrada `fixture: FX-T4a-a` con `clase: sintetico`, y un tercer valor sintético sin hash en la entrada
- **WHEN** se ejecuta `scripts/ci/pii-scan.mjs`
- **THEN** los dos valores con hash no se informan y el tercero se informa con `ruta:línea: <formato>`, sin el valor, y el código es distinto de 0

#### Scenario: Un valor listado fuera de los globs de su entrada se informa [US-036 AC-4] [RN-14]
- **GIVEN** el mismo valor sintético de FX-T4a-a, con su hash en la allowlist, copiado en `docs/notas.md`
- **WHEN** se ejecuta `scripts/ci/pii-scan.mjs`
- **THEN** termina con código distinto de 0 y nombra `docs/notas.md` con su línea y formato

### Requirement: Las entradas de la allowlist de PII se validan
Una entrada de `config/pii-allowlist.json` sin `clase: sintetico`, con `valores` o `rutas` vacíos, o con un glob más amplio que un directorio de fixture MUST hacer fallar el job `data-scan`, nombrando la entrada. Los globs iniciales son `backlog/features/FEAT-T4a-*.md`, `apps/clinical-api/prisma/seed/**`, `apps/clinical-api/test/**/deidentification/**`, `openspec/changes/*-desidentificacion-*/**`, `openspec/specs/deidentification/**` y `ci/tests/cases/ac4-allowlist/**`.

#### Scenario: Los globs iniciales de la allowlist se aceptan [US-036 AC-4]
- **GIVEN** `config/pii-allowlist.json` con los seis globs iniciales, cada uno en una entrada con `clase: sintetico` y al menos un valor
- **WHEN** se ejecuta `scripts/ci/pii-scan.mjs` sobre un clon sin otra PII
- **THEN** termina con código 0

#### Scenario: Una entrada de allowlist inválida hace fallar el escaneo [US-036 AC-4] [RN-14]
- **GIVEN** una entrada de `config/pii-allowlist.json` sin `clase: sintetico`, otra sin `valores` y otra con el glob `backlog/**` (o `apps/clinical-api/test/**`)
- **WHEN** se ejecuta `scripts/ci/pii-scan.mjs` con cada una
- **THEN** termina con código distinto de 0 nombrando la entrada y el motivo (sin marca, sin valores, glob más amplio que un directorio de fixture)

### Requirement: Los datasets de evaluación declaran la clase de datos sintetico
El job `data-scan` MUST verificar que todo archivo bajo las raíces de `config/dataset-roots.json` (por defecto `data/eval/` y `data/evaluation/`) esté cubierto por el manifiesto más cercano (`manifest.json` o `manifest.yaml`) o por su propia cabecera con `clase: sintetico`; si no, MUST fallar con el mensaje "dataset sin clase de datos `sintetico`" y la ruta (RN-13).

#### Scenario: Un dataset de evaluación sin marca hace fallar la CI [US-036 AC-5] [RN-13] (asumido) [S1 resp. 3]
- **GIVEN** el fixture `ac5-sin-clase`: un clon temporal con `data/evaluation/preguntas.jsonl` sin manifiesto ni cabecera con `clase: sintetico`
- **WHEN** se ejecuta `scripts/ci/dataset-class-check.mjs`
- **THEN** termina con código distinto de 0 e imprime `data/evaluation/preguntas.jsonl: dataset sin clase de datos \`sintetico\``

#### Scenario: Un dataset con manifiesto sintetico pasa [US-036 AC-5] [RN-13] (asumido) [S1 resp. 3]
- **GIVEN** un clon temporal con `data/eval/mini/manifest.json` que declara `clase: sintetico` y sus archivos en la misma carpeta
- **WHEN** se ejecuta `scripts/ci/dataset-class-check.mjs`
- **THEN** termina con código 0

### Requirement: main no admite merges con la CI en rojo
La rama `main` MUST exigir PR y el *status check* `ci-ok` en verde antes de mergear, sin *bypass* para administradores. `scripts/ci/check-branch-protection.sh` MUST verificar, en solo lectura, esas condiciones y fallar nombrando la que falte. Ningún agente SHALL cambiar la configuración del repositorio; la aplica el humano administrador.

#### Scenario: Un PR con la CI en rojo no se puede mergear [US-036 AC-6] (asumido) [S1 resp. 3]
- **GIVEN** un PR de prueba desde la rama `ci/selftest-ac6` con `ci-ok` en `failure`
- **WHEN** se intenta mergear a `main`
- **THEN** GitHub lo impide por el *status check* requerido `ci-ok`, y `check-branch-protection.sh` termina con código 0 informando PR obligatorio, `ci-ok` requerido y sin *bypass*

#### Scenario: La verificación falla si falta el check requerido [US-036 AC-6] (asumido) [S1 resp. 3]
- **GIVEN** una respuesta de la API de GitHub, servida desde un archivo de fixture, en la que `main` no exige `ci-ok`
- **WHEN** se ejecuta `check-branch-protection.sh` con esa respuesta
- **THEN** termina con código distinto de 0 y nombra `ci-ok` como check requerido ausente

### Requirement: Las exenciones de los escáneres son declarativas, tienen motivo y no ocultan el caso original
Los formatos de `config/pii-formats.json` MUST tener un `patron` neutro; sus exenciones (`prefijosExentos`, `contextosExentos`, `dominiosExentos`, `correosExentos`) MUST aplicarse solo en `scripts/lib/formatosPii.mjs`, que comparten el escáner de PII y `assertExamplesSynthetic`. Cada exención MUST tener un test de que el caso original se sigue detectando. El `.gitleaks.toml` MUST acotar cada entrada de su allowlist por ruta exacta, regla y forma del valor.

#### Scenario: Un número con el prefijo centinela no es hallazgo pero el mismo número sin prefijo sí [US-036 AC-4] [RN-14]
- **GIVEN** una línea con `"nationalId": "SINT-<dígitos>"` y otra con el mismo número sin prefijo tras `documento`
- **WHEN** se ejecuta `scripts/ci/pii-scan.mjs`
- **THEN** solo se informa la segunda con `ruta:línea: documento_identidad`

#### Scenario: Una coincidencia dentro de una URL no es hallazgo pero fuera de una URL sí [US-036 AC-4] [RN-14]
- **GIVEN** `https://corpus.oncolens.test/documentos/CDR<dígitos>` y, en otra línea, `documentos/CDR<dígitos>` fuera de una URL
- **WHEN** se ejecuta `scripts/ci/pii-scan.mjs`
- **THEN** solo se informa la segunda

#### Scenario: El buzón institucional exento no exime a otros buzones de su dominio [US-036 AC-4] [RN-14]
- **GIVEN** `correosExentos` con el buzón de consultas de la CIE de la OMS y un correo de otra persona en el mismo dominio
- **WHEN** se ejecuta `scripts/ci/pii-scan.mjs`
- **THEN** solo se informa el segundo

### Requirement: Las siglas de documento de identidad se detectan con límite de palabra
`config/pii-formats.json` MUST incluir como palabras clave de `documento_identidad` las siglas `CC`, `C.C.`, `TI`, `T.I.`, `CE`, `C.E.`, `NUIP`, `ID` y `HC` y las expresiones `tarjeta de identidad` e `historia clínica`. Las de hasta cuatro caracteres MUST exigir límite de palabra y no casar tras `_`.

#### Scenario: Cada sigla precede a un documento detectado [US-036 AC-4] [RN-14]
- **GIVEN** líneas como `CC <dígitos>`, `C.C. <dígitos con puntos>`, `ID: <dígitos>`, `TI <dígitos>` y `tarjeta de identidad <dígitos>`
- **WHEN** se ejecuta `scripts/ci/pii-scan.mjs`
- **THEN** cada línea se informa como `documento_identidad`, y `nct_id: NCT<dígitos>` no

### Requirement: La clase de datos no admite exenciones por extensión
`scripts/ci/dataset-class-check.mjs` MUST exigir la clase `sintetico` a todo archivo bajo las raíces de evaluación, sea cual sea su extensión. La búsqueda del manifiesto MUST detenerse en la raíz configurada y, si el manifiesto más cercano declara otra clase, MUST fallar sin consultar la cabecera del archivo.

#### Scenario: Un archivo de documentación sin manifiesto falla [US-036 AC-5] [RN-13]
- **GIVEN** `data/eval/p/README.md` sin manifiesto en su directorio ni en sus ancestros hasta la raíz
- **WHEN** se ejecuta `scripts/ci/dataset-class-check.mjs`
- **THEN** termina con código distinto de 0 nombrando la ruta

### Requirement: Un caso de PR pendiente no puede quedar pendiente tras archivar su dependencia
En `ci/tests/cases/<caso>/case.json`, `pendiente` MUST ser `{ motivo, hastaQueSeArchive: [changes] }`; `ci/tests/run-cases.sh` MUST contar como FALLA un caso pendiente cuando alguno de esos changes esté en `openspec/changes/archive/`, y con `--estricto` MUST fallar mientras exista algún caso pendiente.

#### Scenario: Con la dependencia archivada el caso pendiente falla [US-036 AC-2]
- **GIVEN** un caso con `pendiente.hastaQueSeArchive: ["l1d-999-consumidor"]` y `openspec/changes/archive/<fecha>-l1d-999-consumidor/`
- **WHEN** se ejecuta `ci/tests/run-cases.sh`
- **THEN** el caso se informa como FALLA y el código de salida es 1

### Requirement: contracts-breaking compara todos los proveedores sin repetir su lista
`scripts/ci/contracts-breaking.sh` MUST obtener los proveedores de `PROVIDERS` (`scripts/contracts/lib/specs.mjs`) y MUST imprimir `<proveedor>: comparado` por cada uno.

#### Scenario: Cada proveedor aparece como comparado [US-036 AC-2]
- **GIVEN** la base `HEAD`
- **WHEN** se ejecuta `scripts/ci/contracts-breaking.sh HEAD`
- **THEN** la salida contiene `<proveedor>: comparado` para cada elemento de `PROVIDERS`

### Requirement: Los checkouts de la CI no persisten credenciales
Todo paso `actions/checkout` de los workflows MUST declarar `persist-credentials: false`.

#### Scenario: El test estático detecta un checkout sin persist-credentials [US-036 AC-1]
- **GIVEN** `ci.yml` y `ci-selftest.yml` parseados por `ci/tests/workflow.test.mjs`
- **WHEN** se revisan los pasos `actions/checkout`
- **THEN** cada uno tiene `with.persist-credentials: false`; si falta, el test falla
