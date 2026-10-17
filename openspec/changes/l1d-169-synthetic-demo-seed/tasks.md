# Tasks — l1d-169-synthetic-demo-seed

> Sin cambios de API: no hay sección `## contratos`. Un solo bounded context: clinical-platform.
> Requiere `l1d-168-initial-schema-migration` (esquema y arnés de PostgreSQL de test, perfil test con
> `oncolens_test_admin`) ya en `main`, y los secretos y el reparto D3 de `l1d-165-secrets-setup-scripts`.
> `[S1 resp. 14b]`: contraseñas por `*_FILE` (respaldo directo solo local), seed como *one-shot*
> `clinical-seed` y guarda que rechaza también `REAL_*_ENABLED=true`.

## clinical-platform

### 1. Datos del catálogo (datos, no código)

- [x] 1.1 Crear en `packages/clinical-catalogs/` (directorio que monta L1D-164) el subconjunto mínimo con la estructura de US-041, como creador único de `manifest.json`: `manifest.json` (`version = "1.0.0"`, `standards: ["cie10","loinc","atc"]`), `mama/codigos.json` y `prostata/codigos.json` solo con los códigos que usa el seed; cada entrada con `terminoCanonico`, `estandar`, `codigo`, `nombreOficial` (literal de la fuente de DEC-04: MinSalud/SISPRO para CIE-10, LONG_COMMON_NAME o variante es-* para LOINC sin códigos con `EXTERNAL_COPYRIGHT_NOTICE`, nombre inglés literal sin DDD para ATC), `etiquetaEs` y `versionFuente`. Lo no verificable en la fuente oficial no entra · test después (lo cubre 2.4)
- [x] 1.2 Crear `NOTICE-cie10.txt`, `NOTICE-loinc.txt` y `NOTICE-atc.txt` con el texto literal de DEC-04 más la nota "uso académico no comercial" · test después (lo cubre 2.4)

### 2. Tests de aceptación (commit `test(L1D-169)`)

- [x] 2.1 Test de aceptación en rojo: "aborta con código ≠ 0 y ninguna tabla cambia de número de filas cuando APP_ENV=piloto [US-039 AC-5]" · integración (proceso `npx prisma db seed` contra el PostgreSQL de test, conteo de todas las tablas de los 5 schemas antes y después; incluye `APP_ENV` ausente, y "… cuando REAL_ANONYMIZED_ENABLED=true [US-039 AC-5]" `[S1 resp. 14b]`) · **TDD estricto** (RN-13); esqueleto `assertSeedPermitido()` con `throw new Error('no implementado')`
- [x] 2.2 Test de aceptación en rojo: "cada código sembrado es el de la entrada del catálogo de su término canónico y lo que no tiene entrada queda no_mapeado con código nulo [US-039 AC-4]" · integración · **TDD estricto** (RN-27); esqueleto `resolverCodigoDelCatalogo()`
- [x] 2.3 Tests de integración del contenido: "existen los pacientes (a)–(e) sintéticos con convenio, episodio abierto y datos seed verificados [US-039 AC-1]", "los usuarios de demo tienen hash Argon2id y ninguna contraseña en claro [US-039 AC-1]" (contraseñas por `SEED_*_PASSWORD_FILE` ficticios), "el archivo de contraseña tiene prioridad sobre la variable directa [US-039 AC-1]", "sin archivo la variable directa sirve de respaldo local [US-039 AC-1]", "sin archivo ni variable, o con archivo vacío, aborta nombrando SEED_DOCTOR_PASSWORD_FILE [US-039 AC-1]", "patient_identity queda vacía en el S1 [US-039 AC-1]", y uno por paciente "(a)…(e) tiene el contenido de OL-01 [US-039 AC-2]" (incluye `grade` canónico DEC-05 en (a) y (b)) · integración · test después (script de datos)
- [x] 2.4 Test de integración: "una segunda ejecución no cambia conteos ni identificadores [US-039 AC-3]" (conteos de `patient`, `patient_identity`, `diagnosis`, `biomarker`, `user`) y test de catálogo "cada estándar con códigos tiene su NOTICE y el seed no contiene literales con forma de código [US-039 AC-4]" · integración · test después

### 3. Implementación (commit `feat(L1D-169)`)

- [x] 3.1 Extraer `assertSeedPermitido()` (RN-13): función pura sobre la configuración leída (`APP_ENV`, `SEED_ALLOWED_ENVS`); `piloto` siempre rechazado, `APP_ENV` ausente rechazado, `REAL_ANONYMIZED_ENABLED=true` o `REAL_IDENTIFIED_ENABLED=true` rechazado sea cual sea `APP_ENV` `[S1 resp. 14b]`; unitarios uno a la vez (local → permitido, piloto → rechazado, piloto en la lista permitida → rechazado, ausente → rechazado, local con `REAL_ANONYMIZED_ENABLED=true` → rechazado, test con `REAL_IDENTIFIED_ENABLED=true` → rechazado, `REAL_*` en `false` → permitido) · **TDD estricto**
- [x] 3.2 Extraer `resolverCodigoDelCatalogo()` (RN-27) y el lector de solo lectura del catálogo (`CLINICAL_CATALOG_PATH`); unitarios (término con entrada → mapeado con nombre oficial intacto; sin entrada → `{ codigo: null, mappingStatus: no_mapeado }`) · **TDD estricto**
- [x] 3.3 Extraer `derivarTextoGrade()` (DEC-05): `"Gleason 4+3=7 · ISUP 3"` y `"Nottingham grado 2"` desde la gradación de referencia; unitarios por sistema · **TDD estricto**
- [x] 3.4 `idSembrado(claveNatural)` (UUID v5 con *namespace* fijo) y reloj inyectado (`SEED_REFERENCE_DATE`); sin `Date.now()`, `Math.random()` ni `uuid()` directos · TDD estricto (unitario de determinismo)
- [x] 3.5 `prisma/seed/config.ts`: lectura y validación Zod de `APP_ENV`, `SEED_ALLOWED_ENVS`, `REAL_ANONYMIZED_ENABLED`, `REAL_IDENTIFIED_ENABLED`, `SEED_REFERENCE_DATE`, `CLINICAL_CATALOG_PATH` y las contraseñas con `leerSecreto(env, nombre, readFile)` (`SEED_*_PASSWORD_FILE` prioritaria; `SEED_*_PASSWORD` solo como respaldo local; lector de archivos inyectado; design.md decisión 10); el error nombra la variable, nunca su valor · TDD estricto para `leerSecreto()` (unitarios: archivo → su contenido; archivo y variable → archivo; solo variable → variable; archivo vacío → error con `_FILE`; nada → error), resto test después (cubierto por 2.1 y 2.3). **Contraseñas de respaldo (decisión 66 del plan):** el código de `prisma/seed/` no define ningún valor por defecto; un respaldo `SINT-…` solo puede existir bajo `apps/clinical-api/tests/` (fixtures de los tests de 2.3) y, si ni el archivo ni la variable existen fuera de `tests/`, el seed falla nombrando la variable (nunca su valor)
- [x] 3.6 `prisma/seed/pacientes/{a,b,c,d,e}.ts`: datos con términos canónicos (sin códigos), alineados con `contracts/examples/` (diseño §Contexto) · test después (cubierto por 2.3)
- [x] 3.7 `sembrar(prisma, catalogo, reloj, hasher)`: *upsert* de roles, usuarios (`doc1@test.local`, `admin@test.local`; hash solo si el usuario no existe), pacientes, episodio abierto, diagnósticos con gradación de referencia, exámenes y biomarcadores, tratamientos previos, eventos, atributos y opt-out de (d), en una sola `$transaction`; sin filas en `identity` · test después (cubierto por 2.3 y 2.4) **Decidido (usuario, 2026-10-20):** adopta el *hasher* `createPasswordHasher()` de L1D-197 y el usuario `doc1@test.local` que 197 ya crea como *fixture* local de tests (sin duplicar la dependencia `argon2`).
- [x] 3.8 `prisma/seed.ts` como punto de entrada (config → `assertSeedPermitido()` → `PrismaClient` → `sembrar()`), registro en `apps/clinical-api/package.json` (`prisma.seed`) y dependencia `argon2` con versión exacta si no la añadió US-211 · test después (cubierto por 2.1)
- [x] 3.9 Logs del seed: solo conteos por tabla y UUID; test que verifica que la salida no contiene correos ni valores de contraseña · test después
- [x] 3.9b Servicio *one-shot* `clinical-seed` en `infra/docker/docker-compose.yml` (imagen de `clinical-api`, `restart: "no"`, `clinical-net`, `depends_on: postgres: service_healthy`, secretos `pg_clinical_api_password`, `seed_doctor_password`, `seed_admin_password` con sus `*_FILE` según L1D-165 D3, `command: npx prisma db seed`); `clinical-api` no monta las contraseñas del seed; test estático "las contraseñas del seed solo están en clinical-seed y ningún servicio las declara en environment [US-039 AC-1]" junto a `infra/docker/__tests__/compose-secrets.test.mjs` de L1D-165 `[S1 resp. 14b]` · test después
- [x] 3.9c (test después: composición; decisión 62 del plan) Conexión del seed a PostgreSQL: el `PrismaClient` del *one-shot* `clinical-seed` se construye con `CLINICAL_DATABASE_URL` **sin credenciales** + la contraseña leída de `PG_CLINICAL_API_PASSWORD_FILE` (en memoria, nunca en el repo ni en el entorno del servicio) y TLS verificando la CA del servidor (`rejectUnauthorized: true`); ningún servicio de Compose declara `DATABASE_URL` con contraseña. Verificación: test estático/de humo de que `clinical-seed` no declara `DATABASE_URL` con contraseña y falla nombrando la variable si falta `PG_CLINICAL_API_PASSWORD_FILE`.
- [x] 3.9d (test después: configuración; decisión 64 del plan) `APP_ENV` obligatorio en el servicio `clinical-seed` de Compose: `APP_ENV: ${APP_ENV:?APP_ENV obligatorio}`, de modo que Compose no lo levanta sin `APP_ENV` (la guarda `assertSeedPermitido()` sigue rechazando ausente y `piloto`). Verificación: `docker compose config` sin `APP_ENV` falla con `APP_ENV obligatorio` (test estático junto a `infra/docker/__tests__/compose-secrets.test.mjs`).
- [x] 3.10 Documentar en `apps/clinical-api/README.md` (sección existente o nueva de desarrollo local) las variables del seed (`*_FILE` prioritarias, respaldo directo solo local), `docker compose run --rm clinical-seed` y que no corre en `piloto` ni con `REAL_*_ENABLED=true` · exento
- [x] 3.11 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-169)`

## evaluación

- [ ] 4.1 Registrar en el PR "evaluate no aplica en S1": el catálogo lo monta L1D-164 pero sus códigos no alimentan análisis hasta US-041 (S2), donde corre `run-ai-eval` (métrica de mapeo terminológico)

## Cierre

- [x] 5.1 `openspec validate l1d-169-synthetic-demo-seed --strict`
- [x] 5.2 Suite de `clinical-api` en verde (unitarios + integración contra PostgreSQL de test)
- [x] 5.3 Escaneo de secretos y PII de la CI en verde sobre el diff (ningún dato real, ninguna contraseña)

## Decidido por defecto (orquestador, 2026-10-20), a revisar

Ver `design.md` § "Decidido por defecto". Resumen: (1) catálogo solo con CIE-10 de los diagnósticos y biomarcadores y
tratamientos `no_mapeado` (ATC L02AE02 verificado queda anotado para DEC-04, fuera del catálogo); (2) escritura con
`pg` reutilizando `readDatabaseConfig`/`crearPool`; (3) `reason_code = 'opt_out_sintetico'`; (4) `clinical-seed`
ejecuta el seed compilado; (5) `pg_ca.crt` entra en la lista de secretos de `clinical-seed`; (6) `sembrar(db, entradas)`.
Tarea 3.8: Prisma 7 registra el seed en `prisma.config.ts`; `argon2` ya lo añadió L1D-197.
