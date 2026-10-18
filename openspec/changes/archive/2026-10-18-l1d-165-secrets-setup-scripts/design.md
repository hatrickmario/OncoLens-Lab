# Design — l1d-165-secrets-setup-scripts

## Context

- Repositorio público (RN-14): nada de secretos, claves ni certificados versionados. readme §1.4
  paso 2 enumera lo que hay que generar; data-model §9 fija los atributos del rol `rag_corpus` y la
  forma del `pg_hba.conf`.
- `l1d-164-compose-stack` (US-034) crea el Compose y fija en su D4 los nombres de los secretos y
  `ONCOLENS_SECRETS_DIR` (`${ONCOLENS_SECRETS_DIR:-./secrets}` relativo a `infra/docker/`, es decir
  `infra/docker/secrets/`). Este change los usa **tal cual** y solo añade los de TLS y
  `pg_hba.conf`, que AC-1 exige y D4 no lista. D4 deja a este change el reparto por servicio.
- `l1d-168-initial-schema-migration` (US-038) y `l1d-114-corpus-catalog-milvus` (US-058) esperan de
  aquí los roles, el TLS y el `pg_hba.conf`. L1D-114 abrió la pregunta del privilegio DDL de
  `rag_corpus`, resuelta en el Gate 1 con un rol de migraciones separado (D5, `[S1 resp. 14b]`).
- Los `GRANT`/`REVOKE` sobre los schemas clínicos y sus tests son de US-040 (S2); el uso de las
  claves, de US-054 (JWT) y US-046 (cifrado). Supuestos de AC-3 y AC-5 aceptados `[S1 resp. 3]`.

## Goals / Non-Goals

**Goals:** un comando reproducible que genera todos los secretos fuera del árbol versionado (AC-1),
idempotente (AC-3); reparto mínimo por servicio (AC-2); TLS obligatorio hacia PostgreSQL (AC-4);
`clinical-api` que no arranca sin sus claves de identidad (AC-5).

**Non-Goals:** ver proposal.md "Fuera de alcance".

## Decisions

### D1. `scripts/setup-secrets.sh`: bash + openssl, idempotente

- `set -euo pipefail`, `umask 077`, sin `set -x`. Comprueba `openssl` (OpenSSL 3 o LibreSSL ≥ 3.3,
  el de macOS) y sale con un mensaje claro si falta. Destino: `${ONCOLENS_SECRETS_DIR}` o, por
  defecto, `infra/docker/secrets/` resuelto desde la raíz del repo; se niega si el destino está
  versionado por git (`git ls-files --error-unmatch`) o fuera de una ruta ignorada.
- Generación (una función con nombre por tipo):

| Archivo | Cómo | Permisos |
|---|---|---|
| `jwt_service_private.pem` / `jwt_service_public.pem` | `openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256` (PKCS#8) + `openssl pkey -pubout` | `0600` / `0644` |
| `identity_aes_key`, `blind_index_hmac_key` | `openssl rand -base64 32` (32 bytes) | `0600` |
| `pg_*_password` (`superuser`, `clinical_api`, `research_writer`, `rag_corpus`, `rag_corpus_migrator`), `*_minio_root_password` | `openssl rand` 32 bytes en base64url sin `=` (seguro en URLs de conexión) | `0600` |
| `seed_doctor_password`, `seed_admin_password` | ídem; contraseñas de las cuentas sintéticas del seed (`l1d-169-synthetic-demo-seed`, que las lee por `SEED_DOCTOR_PASSWORD_FILE` y `SEED_ADMIN_PASSWORD_FILE`) | `0600` |
| `pg_ca.key` / `pg_ca.crt` | CA autofirmada EC P-256, validez `PG_CA_VALID_DAYS` | `0600` / `0644` |
| `pg_server.key` / `pg_server.crt` | CSR firmado por la CA, SAN `DNS:postgres`, validez `PG_CERT_VALID_DAYS` | `0600` / `0644` |
| `pg_hba.conf` | `envsubst` restringido a las variables de D4 sobre `infra/docker/postgres/pg_hba.conf.template` | `0644` |
| `pg_test_admin_password`, `pg_hba.test.conf` (**solo `--profile test`**) | contraseña como las `pg_*`; `envsubst` sobre `pg_hba.test.conf.template` | `0600` / `0644` |

  Sin `--profile` se generan **dieciocho** archivos (los diecisiete anteriores más
  `pg_rag_corpus_migrator_password`, `[S1 resp. 14b]`); con `--profile test`, veinte.

- Las subredes y validez se leen de `infra/docker/.env` si existe y si no de los valores por
  defecto de `infra/docker/.env.example` (RN-22): `CLINICAL_NET_SUBNET`, `CORPUS_DB_NET_SUBNET`,
  `POSTGRES_DB`, `PG_TEST_DB_PREFIX`, `PG_CA_VALID_DAYS`, `PG_CERT_VALID_DAYS`.
- **Validación de `PG_TEST_DB_PREFIX`** (`[S1 resp. 14b]`): antes de generar nada, el script
  comprueba `^[a-z][a-z0-9_]{2,}$` (minúscula inicial, al menos tres caracteres, sin metacaracteres
  de expresión regular ni de `pg_hba`); si no cumple, sale con código ≠ 0 nombrando la variable y el
  patrón esperado, y **no escribe ningún archivo**. El prefijo solo se usa en `pg_hba.test.conf`, nunca en `pg_hba.conf`.
  Además (Gate 1, 2ª vuelta) rechaza un prefijo que **case con una base que no es de test**: como
  `pg_hba.test.conf` usa `/^${PG_TEST_DB_PREFIX}`, el script aborta igual (código ≠ 0, sin escribir,
  nombrando la variable y la base afectada) si `^${PG_TEST_DB_PREFIX}` casa con el valor de
  `POSTGRES_DB`, con `postgres` o con `template0`/`template1`, o si el prefijo empieza por
  `postgres` o `template` (p. ej. `pos`, `tem`, `template_`, `oncolens` con `POSTGRES_DB=oncolens`).
  La comprobación vive en una función con nombre, `validar_prefijo_test_db()`, en
  `scripts/lib/pg-test-prefix.sh`.
- **Interfaz con L1D-168 y L1D-114 (arneses de test):** los arneses de base por ejecución de
  L1D-168 (Vitest) y L1D-114 (Pytest) **revalidan** `PG_TEST_DB_PREFIX` antes de crear su base, con
  la **misma** regex `^[a-z][a-z0-9_]{2,}$` y la misma regla de nombres reservados (`POSTGRES_DB`,
  `postgres`, `template*`); si no cumple, el arnés aborta sin conectar. La regla canónica es la de
  este change (`scripts/lib/pg-test-prefix.sh` y el requisito "El prefijo de las bases de test se
  valida…"); un cambio aquí obliga a actualizar ambos arneses en el mismo PR.
- **Idempotencia (AC-3):** si el archivo existe, no se toca y se informa `existe, sin cambios:
  <nombre>`. `--rotate <nombre>` regenera solo ese archivo (y su pareja: par JWT, par TLS);
  `identity_aes_key` y `blind_index_hmac_key` no se rotan (sale ≠ 0 y remite a
  `docs/operations/claves.md`). `pg_ca.key` se queda en el directorio y **no se monta** en ningún
  servicio (solo sirve para reemitir `pg_server.crt`).
- **Salida:** solo nombres y estados; nunca valores (test de AC-1).
- **Alternativas descartadas:** script en Node (añade dependencia de `npm install` antes del primer
  paso, sin ganancia; readme §1.4 lo permite pero bash + openssl ya están en macOS y en el runner);
  `docker secret`/Swarm (no aplica a Compose local); gestor externo (Vault/KMS, fuera del MVP).

### D2. PostgreSQL: TLS, `pg_hba.conf` y roles

- **Plantilla** `infra/docker/postgres/pg_hba.conf.template` (la primera regla que casa manda;
  **sin ninguna regla de red para `postgres`**, `[S1 resp. 14b]`):

```conf
local     all   postgres                                  peer           # init scripts y administración: docker compose exec -u postgres postgres psql
local     all   all                                       reject
hostnossl all   all          all                          reject         # AC-4: sin TLS, nunca
hostssl   ${POSTGRES_DB}  rag_corpus           ${CORPUS_DB_NET_SUBNET}  scram-sha-256
hostssl   ${POSTGRES_DB}  rag_corpus_migrator  ${CORPUS_DB_NET_SUBNET}  scram-sha-256   # solo el one-shot corpus-migrate
host      all   rag_corpus,rag_corpus_migrator   all      reject         # data-model §9
hostssl   all   clinical_api      ${CLINICAL_NET_SUBNET}  scram-sha-256
hostssl   all   research_writer   ${CLINICAL_NET_SUBNET}  scram-sha-256
host      all   all          all                          reject         # incluye postgres por red
```

- **Plantilla del perfil test/CI** `infra/docker/postgres/pg_hba.test.conf.template`: las mismas
  reglas y, **antes** de la línea `host all rag_corpus,rag_corpus_migrator all reject`, las del
  arnés con el prefijo validado:

```conf
hostssl   /^${PG_TEST_DB_PREFIX}  rag_corpus,rag_corpus_migrator  ${CORPUS_DB_NET_SUBNET}  scram-sha-256
hostssl   postgres,/^${PG_TEST_DB_PREFIX}  oncolens_test_admin  ${CLINICAL_NET_SUBNET}  scram-sha-256
hostssl   postgres,/^${PG_TEST_DB_PREFIX}  oncolens_test_admin  ${CORPUS_DB_NET_SUBNET}  scram-sha-256
```

  `oncolens_test_admin` (`LOGIN NOSUPERUSER CREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`) solo
  entra a la base de mantenimiento `postgres` (para `CREATE/DROP DATABASE`) y a las bases con el
  prefijo; nunca a `${POSTGRES_DB}`. Solo existe en el perfil test (lo crea `10-roles.sh` cuando
  `ONCOLENS_PG_PROFILE=test` y el secreto está montado). La expresión regular en la columna de base
  de datos exige PostgreSQL ≥ 16 (la imagen de L1D-164 usa la estable vigente).
- **Arnés de test** (contrato con L1D-168 y L1D-114): el arnés conecta como `oncolens_test_admin`,
  crea `${PG_TEST_DB_PREFIX}<id>` (queda como dueño), aplica `prisma migrate deploy` (L1D-168, crea el
  schema `corpus` vacío), aplica `infra/docker/postgres/sql/corpus-schema-grants.sql` como dueño de la
  base y, para el corpus, ejecuta Alembic como `rag_corpus_migrator` y los tests de runtime como
  `rag_corpus` (L1D-114). Nunca usa el superusuario.
- **Arranque:** `command: postgres -c ssl=on -c ssl_cert_file=… -c ssl_key_file=… -c hba_file=…
  -c password_encryption=scram-sha-256`. PostgreSQL rechaza una clave privada que no sea del
  usuario `postgres` con `0600`, y los `secrets` de Compose de tipo `file` conservan el uid del
  host: un *entrypoint* versionado `infra/docker/postgres/entrypoint-tls.sh` copia `pg_server.key`
  a un directorio del contenedor con `chown postgres` y `0600` y hace `exec docker-entrypoint.sh`.
- **Roles** (`infra/docker/postgres/initdb/10-roles.sh`, versionado, sin secretos: lee
  `/run/secrets/pg_*_password`; corre solo en la primera inicialización del volumen):
  `clinical_api` (LOGIN, dueño de `${POSTGRES_DB}`, aplica `prisma migrate` de L1D-168),
  `research_writer` (LOGIN, sin privilegios hasta US-040), `rag_corpus` (LOGIN `NOSUPERUSER
  NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT ${PG_RAG_CORPUS_CONNECTION_LIMIT}`,
  data-model §9) y `rag_corpus_migrator` (los mismos atributos, `CONNECTION LIMIT
  ${PG_RAG_CORPUS_MIGRATOR_CONNECTION_LIMIT}`, `[S1 resp. 14b]`); en el perfil test, además,
  `oncolens_test_admin` (`CREATEDB` y nada más). Contraseñas con `scram-sha-256`; el valor se pasa por variable de `psql`
  (`\set` + `:'pwd'`), nunca en la línea de comandos ni en el log.
- **Schema `corpus`** (D5): el mismo script crea `CREATE SCHEMA IF NOT EXISTS corpus AUTHORIZATION
  clinical_api` y aplica `infra/docker/postgres/sql/corpus-schema-grants.sql`, idempotente:
  `GRANT USAGE, CREATE ON SCHEMA corpus TO rag_corpus_migrator; GRANT USAGE ON SCHEMA corpus TO
  rag_corpus;` — **ningún `GRANT … CREATE` nombra a `rag_corpus`** `[S1 resp. 14b]`. El DML de
  `rag_corpus` sobre las tablas que cree el *migrator* lo emite la propia migración Alembic de
  L1D-114 (`ALTER DEFAULT PRIVILEGES IN SCHEMA corpus GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES
  TO rag_corpus` y su equivalente de secuencias, ejecutado por el *migrator* sobre sus propios
  objetos), porque los privilegios por defecto son por base de datos y el rol del arnés no puede
  emitirlos `FOR ROLE` otro. La migración de Prisma de L1D-168 emite `CREATE SCHEMA IF NOT EXISTS`,
  así que no choca. El SQL vive en un archivo aparte para que el arnés lo aplique tras
  `prisma migrate deploy` en cada base de test.
- **Alternativas descartadas:** `pg_hba` con `all` en la columna de base de datos para `rag_corpus`
  (más laxo que data-model §9); regla `hostssl all postgres <CLINICAL_NET_SUBNET>` para administración
  y arnés (retirada en el Gate 1, `[S1 resp. 14b]`: un superusuario alcanzable por red sobra si la
  administración va por `local peer` y el arnés tiene su rol `CREATEDB`); reglas con prefijo de test
  en el `pg_hba.conf` de uso normal (solo en el perfil test); certificados con `sslmode=verify-full` ya en el S1 (exige
  distribuir la CA a los clientes; queda como endurecimiento del S5/S6 junto a FEAT-T4d; el cliente
  usa `require`, como fija OL-01).

### D3. Reparto de secretos en Compose (AC-2)

| Servicio | `secrets:` | Variables `*_FILE` |
|---|---|---|
| `postgres` | `pg_superuser_password`, `pg_clinical_api_password`, `pg_research_writer_password`, `pg_rag_corpus_password`, `pg_rag_corpus_migrator_password`, `pg_server.crt`, `pg_server.key`, `pg_hba.conf` (perfil test: `pg_hba.test.conf` y `pg_test_admin_password`) | `POSTGRES_PASSWORD_FILE` |
| `clinical-api` | `jwt_service_private.pem`, `identity_aes_key`, `blind_index_hmac_key`, `pg_clinical_api_password`, `pg_research_writer_password`, `clinical_minio_root_password` | `SERVICE_JWT_PRIVATE_KEY_FILE`, `IDENTITY_AES_KEY_FILE`, `BLIND_INDEX_HMAC_KEY_FILE`, `PG_CLINICAL_API_PASSWORD_FILE`, `PG_RESEARCH_WRITER_PASSWORD_FILE`, `CLINICAL_MINIO_PASSWORD_FILE` |
| `clinical-seed` (*one-shot*, lo define L1D-169) | `pg_clinical_api_password`, `seed_doctor_password`, `seed_admin_password` | `PG_CLINICAL_API_PASSWORD_FILE`, `SEED_DOCTOR_PASSWORD_FILE`, `SEED_ADMIN_PASSWORD_FILE` |
| `rag-orchestrator` | `jwt_service_public.pem`, `pg_rag_corpus_password` (**exactamente**) | `SERVICE_JWT_PUBLIC_KEY_FILE`, `PG_RAG_CORPUS_PASSWORD_FILE` |
| `corpus-migrate` (*one-shot*, lo define L1D-114) | `pg_rag_corpus_migrator_password` (**exactamente**) | `PG_RAG_CORPUS_MIGRATOR_PASSWORD_FILE` |
| `clinical-minio` | `clinical_minio_root_password` | `MINIO_ROOT_PASSWORD_FILE` |
| `milvus-minio`, `milvus-standalone` | `milvus_minio_root_password` | según la imagen (MinIO admite `_FILE`; Milvus, por *entrypoint* que exporta desde el archivo) |
| `milvus-etcd`, `web` | — | — |

- Los usuarios raíz de MinIO no son secretos: `CLINICAL_MINIO_ROOT_USER`, `MILVUS_MINIO_ROOT_USER`
  en `.env.example`. Ningún valor secreto viaja en `environment:`.
- Redes: `clinical-net` y `corpus-db-net` con `ipam.config[].subnet` desde `CLINICAL_NET_SUBNET` y
  `CORPUS_DB_NET_SUBNET` (las mismas que renderiza `pg_hba.conf`). `corpus-db-net` sigue
  `internal: true` (L1D-164 D1).
- **Seed (coordinación con `l1d-169-synthetic-demo-seed`):** el seed corre en el servicio
  *one-shot* `clinical-seed` (misma imagen de `clinical-api`, `restart: "no"`, en `clinical-net`), no
  en el proceso de `clinical-api`: las contraseñas del seed **no quedan montadas en runtime**. El seed
  lee `SEED_*_PASSWORD_FILE` como fuente prioritaria; la variable directa `SEED_*_PASSWORD` es solo
  respaldo local fuera de Compose. Ningún valor viaja en `environment:`.
- **Alembic del corpus** (`[S1 resp. 14b]`): corre en el *one-shot* `corpus-migrate` (imagen de
  `rag-orchestrator`, solo en `corpus-db-net`); `rag-orchestrator` depende de él con
  `service_completed_successfully`. La contraseña del *migrator* no se monta en `rag-orchestrator`.
- **Perfil test/CI:** `infra/docker/docker-compose.test.yml` añade al servicio `postgres`
  `pg_hba.test.conf` (como `hba_file`), `pg_test_admin_password` y `ONCOLENS_PG_PROFILE=test`.
- El test estático de AC-2 tolera que `corpus-migrate` y `clinical-seed` aún no existan (los crean
  L1D-114 y L1D-169) y, cuando existen, exige exactamente sus secretos de la tabla.
- Los nombres de las variables `*_FILE` son la interfaz con L1D-105 (JWT) y L1D-114 (conexión
  `rag_corpus`); si esos changes fijan otros, se ajusta en la oleada.

### D4. Carga de secretos en `clinical-api` (AC-5)

- `apps/clinical-api/src/config/secrets.ts`: `loadRequiredSecrets(env, readFile)` recibe el entorno
  y el lector de archivos por parámetro (sin E/S directa; determinista en test). Regla con nombre:
  `assertSecretPresent(variable)` — variable no definida, archivo inexistente o vacío →
  `SecretoAusenteError(variable)`.
- La raíz de composición (`src/server.ts`) la invoca **antes** de `listen`; ante el error registra
  un evento `{"level":"error","event":"secreto_ausente","variable":"<NOMBRE>"}` y termina con código
  1. El healthcheck de Compose ve el contenedor sin escuchar → no `healthy` (`/health` ≠ `200`).
  `GET /health` de L1D-164 no cambia: si el proceso escucha, las claves estaban.
- En el S1 se exigen `IDENTITY_AES_KEY_FILE` y `BLIND_INDEX_HMAC_KEY_FILE` (AC-5); la lista es un
  arreglo de configuración al que US-054 añade `SERVICE_JWT_PRIVATE_KEY_FILE`.
- **Alternativa descartada:** quedar arriba con `/health` `503` (más código, un proceso "a medias"
  que podría servir rutas que no necesitan claves; *fail-fast* es más simple y cumple el AC).

### D5. Privilegio DDL del corpus: rol `rag_corpus_migrator` (pregunta de L1D-114)

**Decidido `[S1 resp. 14b]` (usuario, 2026-10-14, Gate 1):** rol nuevo `rag_corpus_migrator` con
`USAGE, CREATE` **solo** sobre `corpus`, sin `USAGE` ni privilegios en `auth`, `identity`,
`clinical`, `audit` ni `research`, que entra solo por `hostssl` desde `corpus-db-net` a
`${POSTGRES_DB}` y lo usa únicamente el servicio *one-shot* `corpus-migrate` (Alembic de L1D-114).
El runtime `rag_corpus` queda con `USAGE` + DML sobre `corpus`, como ya dice data-model §9: el
requisito "Aislamiento del rol rag_corpus" no cambia y el delta de `data-model` pasa a ser `ADDED`
de un requisito nuevo. `data-model.md` §9 añade el rol y su `GRANT`. Descartada:
`GRANT USAGE, CREATE ON SCHEMA corpus TO rag_corpus` (supuesto anterior; un runtime con DDL amplía
lo que un compromiso de `rag-orchestrator` puede hacer). Coste aceptado: un secreto, dos reglas de
`pg_hba` y un servicio *one-shot*.

### D6. Tests

| AC | Tipo (matriz TDD) | Dónde | Cómo |
|---|---|---|---|
| AC-1, AC-3 | shell, test después (script) | `scripts/tests/setup-secrets.test.sh` (`npm run test:secrets`) | `docker run --rm` de una imagen con tag exacto (bash, git, openssl 3): `git clone` local a `/tmp`, ejecuta el script, comprueba los 18 archivos (20 con `--profile test`), tipos de clave, CA/SAN, `pg_hba.conf` sin regla de red para `postgres` ni prefijo de test, salida sin valores y `git status --porcelain` vacío; segunda ejecución con mismos `sha256sum`; `--rotate identity_aes_key` rechazado; `PG_TEST_DB_PREFIX` inválido o que casa con `POSTGRES_DB`, `postgres` o `template*` → aborta sin escribir |
| AC-2 | estático, test después (Compose) | `infra/docker/__tests__/compose-secrets.test.mjs` (Vitest, junto a los de L1D-164) | `docker compose config --format json` con secretos ficticios (`scripts/smoke/lib/fake-secrets.sh` de L1D-164, ampliado con los 6 nombres nuevos y los 2 del perfil test); casos negativos con *override* (clave de identidad en `rag-orchestrator`, contraseña del *migrator* o del seed en un servicio de runtime) |
| AC-4 | smoke, test después | `scripts/smoke/compose-smoke.sh` (de L1D-164), paso nuevo | `psql` efímero en `clinical-net` con `sslmode=disable` (rechazo) y `require` (`SELECT 1`, `SHOW ssl`); `postgres` por red con `sslmode=require` → rechazo de `pg_hba`; `rag_corpus_migrator` desde `corpus-db-net`: `CREATE TABLE corpus.t` funciona y `CREATE TABLE clinical.t` → *permission denied* |
| AC-5 | integración, **TDD estricto** (arranque y secretos de identidad) | `apps/clinical-api/test/integration/startup/secrets.test.ts` + smoke | *factory* con directorio temporal y lector real; log capturado; smoke con *override* de `IDENTITY_AES_KEY_FILE` |

Ningún test usa secretos reales: los ficticios se generan en un directorio temporal y se borran.

## Privacidad y ownership

- **Fronteras:** ningún dato clínico ni de paciente cruza en este change. Las claves de identidad
  (AES, HMAC) y la privada del JWT existen **solo** en `clinical-api` (RN-10, SEG-07);
  `rag-orchestrator` recibe solo la pública del JWT y la contraseña de `rag_corpus`, sin ninguna
  credencial de `clinical-minio` ni de los roles clínicos (CLAUDE.md "la regla de ownership"; lo
  prueba AC-2 y lo re-prueba US-040 AC-5).
- **`rag-orchestrator` y datos clínicos:** solo puede entrar a PostgreSQL como `rag_corpus`, por
  TLS, desde `corpus-db-net`, con `USAGE` + DML sobre `corpus` y **sin `CREATE`** (D5,
  `[S1 resp. 14b]`); el DDL lo hace `rag_corpus_migrator`, cuya contraseña solo tiene el *one-shot*
  `corpus-migrate`, también limitado a `corpus`. Sin ruta ni credenciales hacia `clinical-minio`
  (L1D-164 AC-3). El superusuario no es alcanzable por red (solo `local peer`). Los `REVOKE` sobre los schemas
  clínicos llegan con US-040 (S2): riesgo aceptado en el *slicing* v2, solo datos sintéticos en el S1.
- **Desidentificación (RN-11):** sin cambios.
- **Secretos (RN-14):** `infra/docker/secrets/` en `.gitignore`; el script se niega a escribir en
  una ruta versionada; los escáneres de secretos de US-036 (L1D-166) cubren el resto.
- **Datos reales (RN-12, RN-13):** sin efecto; las banderas `REAL_*` siguen en `false`.
- **Logs:** el script, el *init* de roles y `clinical-api` registran nombres de archivos y
  variables, nunca valores; las contraseñas no aparecen en `ps` ni en el historial de `psql`.
- **Sesión ≠ credencial de servicio:** el par ES256 es solo para el JWT de servicio; `web` no
  recibe ningún secreto.

## Contratos

Sin cambios en `apps/clinical-api/openapi.yaml`, `apps/rag-orchestrator/openapi.yaml` ni
`contracts/`. El fallo de arranque de AC-5 no es una respuesta HTTP. Proveedor/consumidor: n/a.
ADR-26: sin efecto.

## Dependencias y colaboradores

| Módulo | Acción | Depende de |
|---|---|---|
| `scripts/setup-secrets.sh` | crea | `bash`, `openssl`, plantilla de `pg_hba`, `.env`/`.env.example` |
| `scripts/tests/setup-secrets.test.sh` | crea | imagen efímera con tag exacto |
| `infra/docker/postgres/pg_hba.conf.template`, `pg_hba.test.conf.template`, `entrypoint-tls.sh`, `initdb/10-roles.sh`, `sql/corpus-schema-grants.sql` | crea | `/run/secrets` |
| `infra/docker/docker-compose.yml`, `.env.example` | modifica (de L1D-164) | nombres de D4 de L1D-164 |
| `infra/docker/docker-compose.test.yml` | crea | perfil test/CI |
| `infra/docker/__tests__/compose-secrets.test.mjs`, `scripts/smoke/compose-smoke.sh`, `scripts/smoke/lib/fake-secrets.sh` | crea / modifica | Compose resuelto |
| `apps/clinical-api/src/config/secrets.ts` | crea | entorno y lector de archivos inyectados; regla `assertSecretPresent()` |
| `apps/clinical-api/src/server.ts` | modifica (de L1D-164) | `loadRequiredSecrets()` antes de `listen` |
| `.gitignore`, `docs/operations/claves.md`, readme §1.4, `data-model.md` §9 (rol `rag_corpus_migrator`) | modifica / crea | — |

Sin services de dominio; la única regla extraída con nombre es `assertSecretPresent()`.

## Risks / Trade-offs

- **Solapamiento con L1D-164** en el Compose y el smoke: este change edita archivos que L1D-164
  crea; se implementa en la misma oleada o justo después, y si L1D-164 cambia nombres, se ajusta
  aquí (D4 de L1D-164 dice que manda L1D-165 en los nombres; aquí no se renombra ninguno).
- **Permisos de los `secrets` de Compose** (uid del host) en Linux: PostgreSQL se resuelve con el
  *entrypoint*; si una imagen de app corre con un uid sin lectura sobre `0600`, el smoke lo detecta
  y se ajusta el `user:` del servicio, nunca relajando los permisos de las claves privadas.
- **El *init* de roles solo corre con el volumen vacío:** cambiar contraseñas exige `down -v` o
  `ALTER ROLE` manual; se documenta en `docs/operations/claves.md`.
- **Pérdida de la clave de identidad = pérdida de la identidad** (OL-01): `docs/operations/claves.md`
  documenta el respaldo cifrado fuera del repo; el script nunca la rota.
- **Arneses de test con base por ejecución** (L1D-168, L1D-114): usan `oncolens_test_admin`, el
  prefijo validado `PG_TEST_DB_PREFIX` y `corpus-schema-grants.sql` (contrato en D2), solo con el
  perfil test; revalidan el prefijo con la misma regex y nombres reservados (interfaz en D1).
- **Sin superusuario por red:** cualquier tarea administrativa (incluida la migración de permisos de
  US-040, S2) va por `docker compose exec -u postgres postgres psql` o por un rol dedicado en su propio change.
- **LibreSSL en macOS** frente a OpenSSL 3 en la CI: el test de shell corre en contenedor con
  OpenSSL 3; en local, el script comprueba la versión.
