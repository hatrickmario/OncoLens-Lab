## ADDED Requirements

### Requirement: Los secretos se generan con un script y nunca se versionan
`scripts/setup-secrets.sh` MUST generar, con solo `bash` y `openssl`, los secretos de design.md D1 (incluidas la contraseña de `rag_corpus_migrator` `[S1 resp. 14b]` y las del seed) en `${ONCOLENS_SECRETS_DIR}` (por defecto `infra/docker/secrets/`, ignorado por git). Claves privadas y contraseñas MUST quedar con `0600`. El script MUST NOT escribir fuera de ese directorio ni imprimir ningún valor, y ningún archivo versionado SHALL contener un secreto (RN-14).

#### Scenario: Un clon limpio genera todos los secretos sin ensuciar el árbol [US-035 AC-1] [RN-14]
- **GIVEN** un clon limpio del repositorio en un contenedor efímero, sin `infra/docker/secrets/`
- **WHEN** el test de shell ejecuta `scripts/setup-secrets.sh`
- **THEN** existen los dieciocho archivos de design.md D1 (incluidos `pg_rag_corpus_migrator_password`, `seed_doctor_password` y `seed_admin_password`) y ni `pg_test_admin_password` ni `pg_hba.test.conf`; `jwt_service_private.pem` es una clave EC P-256 cuya pública coincide con `jwt_service_public.pem`; `identity_aes_key` y `blind_index_hmac_key` decodifican a 32 bytes; `pg_server.crt` está firmado por `pg_ca.crt` y declara `DNS:postgres` en el SAN; `pg_hba.conf` contiene las reglas `hostssl` de `rag_corpus` y `rag_corpus_migrator` con la subred de `corpus-db-net`, ninguna regla `host`/`hostssl` que admita a `postgres` y ninguna con el prefijo de test; y `git status --porcelain` no muestra ningún archivo nuevo ni modificado

#### Scenario: La salida del script no contiene ningún valor generado [US-035 AC-1] [RN-14]
- **GIVEN** la salida estándar y de error capturadas de una ejecución sobre un clon limpio
- **WHEN** el test busca en ella el contenido de cada archivo generado
- **THEN** no aparece ninguno; la salida solo nombra archivos y estados (`generado`, `existe, sin cambios`)

### Requirement: El script es idempotente y solo rota bajo petición explícita
Con secretos ya generados, `scripts/setup-secrets.sh` sin `--rotate` MUST NOT sobrescribir ningún archivo y SHALL informar, por nombre, que cada uno ya existe. `--rotate <nombre>` SHALL regenerar solo ese archivo; para `identity_aes_key` y `blind_index_hmac_key` MUST negarse y remitir a `docs/operations/claves.md`, porque rotarlas sin re-cifrar pierde la identidad (OL-01).

#### Scenario: Una segunda ejecución sin --rotate no cambia ningún archivo [US-035 AC-3] (asumido) [S1 resp. 3]
- **GIVEN** un directorio de secretos generado y el `sha256sum` de cada archivo
- **WHEN** se ejecuta otra vez `scripts/setup-secrets.sh` sin `--rotate`
- **THEN** los hashes son idénticos, la salida dice "existe, sin cambios" para cada archivo y el código de salida es 0

#### Scenario: Rotar una clave de identidad se rechaza [US-035 AC-3] (asumido) [S1 resp. 3]
- **GIVEN** un directorio de secretos generado
- **WHEN** se ejecuta `scripts/setup-secrets.sh --rotate identity_aes_key`
- **THEN** el script termina con código distinto de 0, nombra `docs/operations/claves.md` y el hash de `identity_aes_key` no cambia

### Requirement: Cada servicio recibe solo los secretos que necesita
En el Compose resuelto, la clave privada del JWT (`jwt_service_private.pem`), `identity_aes_key` y `blind_index_hmac_key` MUST montarse solo en `clinical-api`; `rag-orchestrator` MUST recibir exactamente `jwt_service_public.pem` y `pg_rag_corpus_password`; `web` MUST NOT recibir ningún secreto (SEG-07, ADR-6, CLAUDE.md "la regla de ownership"). Los secretos se entregan como archivos (`secrets:` de Compose), nunca como valores en variables de entorno.

#### Scenario: El reparto de secretos sigue la regla de ownership [US-035 AC-2] [SEG-07]
- **GIVEN** el Compose resuelto con `docker compose config --format json` y secretos ficticios en un directorio temporal pasado por `ONCOLENS_SECRETS_DIR`
- **WHEN** el test estático lista los secretos montados por servicio
- **THEN** `jwt_service_private.pem`, `identity_aes_key` y `blind_index_hmac_key` aparecen solo en `clinical-api`, `rag-orchestrator` tiene exactamente `jwt_service_public.pem` y `pg_rag_corpus_password`, `pg_rag_corpus_migrator_password` no aparece en `rag-orchestrator`, `clinical-api` ni `web` (y, si existe `corpus-migrate`, es su único secreto), las contraseñas del seed no aparecen en `clinical-api` (y, si existe `clinical-seed`, están solo ahí), y `web` no tiene ninguno

#### Scenario: Montar una clave de identidad en rag-orchestrator rompe el test [US-035 AC-2] [RN-10]
- **GIVEN** un *override* temporal que añade `identity_aes_key` a los `secrets` de `rag-orchestrator`
- **WHEN** el test estático resuelve el Compose con ese *override*
- **THEN** el test falla nombrando `rag-orchestrator` e `identity_aes_key`

### Requirement: PostgreSQL solo acepta conexiones con TLS
`postgres` MUST arrancar con `ssl=on` y el `pg_hba.conf` generado, que MUST rechazar toda conexión de red sin TLS antes de cualquier regla de aceptación y admitir cada rol solo por `hostssl` con `scram-sha-256` desde su red: `clinical_api` y `research_writer` desde `clinical-net`, `rag_corpus` y `rag_corpus_migrator` solo desde `corpus-db-net` (data-model §9). Las subredes vienen de configuración (`CLINICAL_NET_SUBNET`, `CORPUS_DB_NET_SUBNET`, RN-22).

#### Scenario: Sin TLS la conexión se rechaza y con sslmode=require funciona [US-035 AC-4] [SEG-08] [OL-01]
- **GIVEN** el stack levantado con los secretos de `scripts/setup-secrets.sh` y un cliente `psql` efímero en `clinical-net` con la contraseña de `clinical_api`
- **WHEN** el smoke test conecta con `sslmode=disable` y después con `sslmode=require`
- **THEN** la primera conexión falla con un rechazo de `pg_hba.conf` (sin cifrado) y la segunda ejecuta `SELECT 1` y `SHOW ssl` devuelve `on`

### Requirement: Las credenciales de los procesos one-shot no quedan en los servicios de runtime
`pg_rag_corpus_migrator_password` MUST montarse solo en el servicio *one-shot* `corpus-migrate` (Alembic del corpus) y `seed_doctor_password`/`seed_admin_password` solo en el *one-shot* `clinical-seed`; ninguno de los tres SHALL montarse en `rag-orchestrator`, `clinical-api` ni `web` (`[S1 resp. 14b]`).

#### Scenario: Montar la contraseña del migrator en el runtime rompe el test [US-035 AC-2] [S1 resp. 14b]
- **GIVEN** un *override* temporal que añade `pg_rag_corpus_migrator_password` a los `secrets` de `rag-orchestrator`
- **WHEN** el test estático resuelve el Compose con ese *override*
- **THEN** el test falla nombrando `rag-orchestrator` y `pg_rag_corpus_migrator_password`

### Requirement: El superusuario de PostgreSQL solo se administra por local peer
El `pg_hba.conf` MUST NOT contener ninguna regla `host`/`hostssl` que admita al superusuario `postgres`; su único acceso SHALL ser `local peer` dentro del contenedor (`docker compose exec -u postgres postgres psql`, `[S1 resp. 14b]`).

#### Scenario: El superusuario no entra por red [US-035 AC-4] [S1 resp. 14b]
- **GIVEN** el stack levantado (perfil normal y perfil test) y un cliente `psql` efímero en `clinical-net` con la contraseña de `postgres` y `sslmode=require`
- **WHEN** el smoke test intenta conectar como `postgres`
- **THEN** la conexión falla con un rechazo de `pg_hba.conf`, y `docker compose exec -u postgres postgres psql -U postgres -c 'SELECT 1'` funciona por `local peer`

### Requirement: El prefijo de las bases de test se valida y solo existe en el perfil test
`scripts/setup-secrets.sh` MUST validar `PG_TEST_DB_PREFIX` contra `^[a-z][a-z0-9_]{2,}$` antes de escribir nada y abortar con código ≠ 0 si no cumple. Las reglas con ese prefijo y el rol del arnés `oncolens_test_admin` (solo `CREATEDB`) SHALL generarse únicamente con `--profile test`, en `pg_hba.test.conf` y `pg_test_admin_password`, que solo monta el perfil test/CI (`[S1 resp. 14b]`).

#### Scenario: El perfil test añade el rol del arnés y las reglas con prefijo [US-035 AC-1] [S1 resp. 14b]
- **GIVEN** un clon limpio con `PG_TEST_DB_PREFIX=oltest_`
- **WHEN** el test de shell ejecuta `scripts/setup-secrets.sh --profile test`
- **THEN** existen además `pg_test_admin_password` y `pg_hba.test.conf`; este último admite `oncolens_test_admin` solo en las bases `postgres` y `/^oltest_`, y `rag_corpus`/`rag_corpus_migrator` en `/^oltest_` solo desde `corpus-db-net`; `pg_hba.conf` sigue sin ninguna regla con el prefijo

#### Scenario: Un PG_TEST_DB_PREFIX inválido aborta sin escribir [US-035 AC-1] [S1 resp. 14b]
- **GIVEN** un clon limpio sin directorio de secretos
- **WHEN** el test de shell ejecuta `scripts/setup-secrets.sh` con `PG_TEST_DB_PREFIX` igual a `.*`, a `Ab` y a `1abc` (una ejecución por valor)
- **THEN** cada ejecución termina con código distinto de 0, el mensaje nombra `PG_TEST_DB_PREFIX` y el patrón `^[a-z][a-z0-9_]{2,}$`, y no se crea ningún archivo de secretos

### Requirement: El prefijo de las bases de test no casa con bases que no son de test
`scripts/setup-secrets.sh` MUST rechazar, antes de escribir nada y con código ≠ 0, un `PG_TEST_DB_PREFIX` tal que `^PG_TEST_DB_PREFIX` case con `POSTGRES_DB`, `postgres`, `template0` o `template1`. Los arneses de base por ejecución de L1D-168 y L1D-114 SHALL revalidar el prefijo con la misma regex y la misma regla antes de crear su base.

#### Scenario: Un PG_TEST_DB_PREFIX que casa con una base no de test aborta sin escribir [US-035 AC-1] [S1 resp. 14b]
- **GIVEN** un clon limpio sin directorio de secretos y `POSTGRES_DB=oncolens`
- **WHEN** el test de shell ejecuta `scripts/setup-secrets.sh --profile test` con `PG_TEST_DB_PREFIX` igual a `oncolens`, a `pos` y a `template_` (una ejecución por valor)
- **THEN** cada ejecución termina con código distinto de 0, el mensaje nombra `PG_TEST_DB_PREFIX` y la base con la que casa (`oncolens`, `postgres` o `template*`), y no se crea ningún archivo de secretos
