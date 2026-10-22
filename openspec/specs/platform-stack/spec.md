# platform-stack Specification

## Purpose
Define el stack local reproducible en Docker Compose: servicios, redes y puertos (solo `web` publicado), secretos y certificados generados fuera del repositorio, perfil de test y los controles de humo que impiden regresiones de aislamiento entre `clinical-api`, `rag-orchestrator` y sus bases.

## Requirements

### Requirement: El stack completo levanta con un único comando de Compose
`infra/docker/docker-compose.yml` MUST definir `postgres`, `clinical-minio`, `milvus-standalone`, `milvus-etcd`, `milvus-minio`, `clinical-api`, `rag-orchestrator` y `web` con healthcheck, y `up -d` con los secretos de US-035 SHALL dejarlos `healthy`. Intervalos y reintentos vienen de variables (RN-22); las imágenes de terceros usan tag exacto.

#### Scenario: Todos los servicios quedan healthy y los backends responden desde la red interna [US-034 AC-1]
- **GIVEN** `infra/docker/docker-compose.yml`, los secretos generados por `scripts/setup-secrets.sh` (US-035) y `LLM_PROVIDER=fake`
- **WHEN** el smoke test ejecuta `docker compose -f infra/docker/docker-compose.yml up -d --wait`
- **THEN** los ocho servicios figuran `healthy` en `docker compose ps`, `GET /health` de `clinical-api` responde `200` desde el contenedor `web` y `GET /health` de `rag-orchestrator` responde `200` desde el contenedor `clinical-api`

#### Scenario: Sin secretos generados el stack no queda healthy [US-034 AC-1] (asumido)
- **GIVEN** un `ONCOLENS_SECRETS_DIR` vacío
- **WHEN** se ejecuta `docker compose -f infra/docker/docker-compose.yml up -d --wait`
- **THEN** el comando termina con código distinto de 0 y nombra el secreto ausente, sin imprimir ningún valor

### Requirement: Solo web publica un puerto al host
En el Compose resuelto, `web` MUST ser el único servicio con `ports`, enlazado a `${WEB_BIND_ADDRESS}` (por defecto `127.0.0.1`) y `${WEB_PORT}` tomados de configuración; `clinical-api` y `rag-orchestrator` MUST NOT publicar ningún puerto (SEG-09).

#### Scenario: Solo web aparece con puertos publicados [US-034 AC-2]
- **GIVEN** el Compose resuelto con `docker compose config --format json` y secretos ficticios en un directorio temporal
- **WHEN** el test estático lista los `ports` de cada servicio
- **THEN** solo `web` publica un puerto, y `clinical-api` y `rag-orchestrator` no publican ninguno

#### Scenario: Un backend con puerto publicado rompe el test [US-034 AC-2]
- **GIVEN** un *override* temporal que añade `ports: ["8080:8080"]` a `clinical-api`
- **WHEN** el test estático resuelve el Compose con ese *override*
- **THEN** el test falla nombrando `clinical-api`

### Requirement: rag-orchestrator no tiene ruta de red hacia clinical-minio
Las redes MUST seguir readme §2.4: `clinical-net` (`web`, `clinical-api`, `postgres`, `clinical-minio`), `ai-net` (`clinical-api`, `rag-orchestrator`, Milvus y sus dependencias) y `corpus-db-net` (`rag-orchestrator`, `postgres`), esta última `internal: true`. `rag-orchestrator` MUST NOT compartir red con `clinical-minio` (SEG-06, CLAUDE.md "la regla de ownership").

#### Scenario: La conexión a clinical-minio falla desde rag-orchestrator y funciona desde clinical-api [US-034 AC-3]
- **GIVEN** el stack levantado
- **WHEN** desde el contenedor `rag-orchestrator` se abre una conexión TCP a `clinical-minio:9000`, y desde `clinical-api` la misma conexión
- **THEN** desde `rag-orchestrator` falla por resolución o por conexión, y desde `clinical-api` se establece

### Requirement: rag-orchestrator corre con sistema de archivos de solo lectura
En el Compose resuelto, `rag-orchestrator` MUST declarar `read_only: true` y un `tmpfs` en `/tmp` con `TMPDIR=/tmp`, para que los temporales del OCR (ADR-39) y del procesamiento en memoria de los PDFs no persistan en el contenedor (CLAUDE.md "la regla de ownership"). MUST NOT montar volúmenes escribibles salvo ese `tmpfs`.

#### Scenario: rag-orchestrator es de solo lectura con TMPDIR en tmpfs [US-034 AC-3] (Gate 1, privacidad)
- **GIVEN** el Compose resuelto con `docker compose config --format json` y secretos ficticios
- **WHEN** el test estático inspecciona `rag-orchestrator`, y en el smoke se intenta escribir un archivo en `/app` y otro en `$TMPDIR` desde el contenedor
- **THEN** declara `read_only: true`, un `tmpfs` en `/tmp` y `TMPDIR=/tmp`, sin volúmenes escribibles; la escritura en `/app` falla y la de `$TMPDIR` funciona; un *override* que quita `read_only` hace fallar el test nombrando `rag-orchestrator`

### Requirement: Claves del JWT de servicio y entorno declarados por servicio
El Compose MUST definir `SERVICE_JWT_PRIVATE_KEY_FILE` (secreto `jwt_service_private.pem`) solo en `clinical-api` y `SERVICE_JWT_PUBLIC_KEY_FILE` (secreto `jwt_service_public.pem`) solo en `rag-orchestrator`, con los nombres de L1D-165; `infra/docker/.env.example` MUST declarar `APP_ENV` (por defecto `local`) sin secretos. La carga de las claves es de L1D-105 (US-054).

#### Scenario: Cada backend recibe solo su clave del JWT [US-034 AC-3] (Gate 1, privacidad)
- **GIVEN** el Compose resuelto con secretos ficticios
- **WHEN** el test estático inspecciona `secrets` y `environment` de `clinical-api` y `rag-orchestrator`, y lee `infra/docker/.env.example`
- **THEN** `clinical-api` tiene `SERVICE_JWT_PRIVATE_KEY_FILE` y no la pública, `rag-orchestrator` tiene `SERVICE_JWT_PUBLIC_KEY_FILE` y ni la privada ni las claves AES/HMAC, y `.env.example` declara `APP_ENV`

### Requirement: Catálogo clínico montado de solo lectura en ambos backends
El Compose MUST montar `packages/clinical-catalogs` de solo lectura (`read_only: true`) en `clinical-api` y en `rag-orchestrator`, y SHALL pasar a ambos `CLINICAL_CATALOG_PATH` con el destino del montaje; `web` MUST NOT montarlo. `infra/docker/.env.example` MUST declarar `CLINICAL_CATALOG_PATH`. Este change solo monta el directorio: `manifest.json` (campo `version`) y su contenido los crea L1D-169, y el `409` por versión distinta entre backends es de US-041 (S2).

#### Scenario: Ambos backends montan el catálogo de solo lectura [US-034 AC-3]
- **GIVEN** el Compose resuelto con `docker compose config --format json` y secretos ficticios
- **WHEN** el test estático inspecciona `volumes` y `environment` de `clinical-api`, `rag-orchestrator` y `web`, y lee `infra/docker/.env.example`
- **THEN** `clinical-api` y `rag-orchestrator` montan `packages/clinical-catalogs` con `read_only: true` en el destino que indica su `CLINICAL_CATALOG_PATH`, `web` no lo monta, `.env.example` declara `CLINICAL_CATALOG_PATH`, y un *override* que quita `read_only` del montaje hace fallar el test nombrando el servicio

### Requirement: Secretos ficticios con un par EC P-256 real
`scripts/smoke/lib/fake-secrets.sh` MUST generar en un directorio temporal todos los secretos que declara el Compose, con `jwt_service_private.pem` y `jwt_service_public.pem` como un par EC P-256 real generado con `openssl`, para que `rag-orchestrator` arranque en modo `fake` con la verificación del JWT de servicio de L1D-105 aunque `scripts/setup-secrets.sh` (L1D-165) aún no esté en `main`. MUST NOT escribir en el repositorio ni imprimir ningún valor.

#### Scenario: El par ficticio del JWT es una clave EC P-256 válida [US-034 AC-1]
- **GIVEN** un directorio temporal vacío
- **WHEN** el test ejecuta `scripts/smoke/lib/fake-secrets.sh` sobre él
- **THEN** existen todos los secretos del Compose, `jwt_service_private.pem` es una clave EC de curva `prime256v1`, `jwt_service_public.pem` es su clave pública, un token ES256 firmado con la privada verifica con la pública, la salida del script no contiene el contenido de ningún secreto y el repositorio no tiene archivos nuevos

### Requirement: Errores de validación de rag-orchestrator con la forma del contrato y sin eco
Ante un cuerpo que no cumple el modelo generado, `rag-orchestrator` MUST responder `422` `ErrorValidacion` (`error = "CUERPO_INVALIDO"`, `message` fijo, `traceId`, `detail[]` solo con `loc`, `msg` y `type`) mediante un *handler* de `RequestValidationError`. La respuesta y el log MUST NOT contener el cuerpo recibido ni ningún valor de él (RN-10).

#### Scenario: Un cuerpo inválido recibe 422 CUERPO_INVALIDO sin eco [US-034 AC-6] [RN-10]
- **GIVEN** `LLM_PROVIDER=fake` y el cuerpo de `rag-query-request.json` con `maxOptions` fuera de rango y un texto sintético centinela en la `query`
- **WHEN** el test (`TestClient`) envía ese cuerpo a `POST /rag/query`
- **THEN** la respuesta es `422` con `error = "CUERPO_INVALIDO"` y `traceId`, válida contra la respuesta `422` de `/rag/query` del spec (la forma de `rag-validacion-422.json`), sin `input` ni `ctx` en `detail`, y ni la respuesta ni el log capturado contienen el centinela

### Requirement: El LLM nativo vive fuera de Compose
El Compose MUST NOT definir ningún servicio de LLM. `rag-orchestrator` SHALL alcanzarlo por `LLM_BASE_URL` tomado de configuración, con host `host.docker.internal`, y MUST declarar `extra_hosts: host.docker.internal:host-gateway` para que resuelva igual en macOS y en Linux.

#### Scenario: No hay servicio de LLM y la URL viene de configuración [US-034 AC-5]
- **GIVEN** el Compose resuelto con `LLM_BASE_URL=http://host.docker.internal:11434/v1`
- **WHEN** el test estático inspecciona la definición de servicios
- **THEN** ningún servicio usa una imagen o un nombre de LLM (`ollama`, `vllm`, `llama`), y `rag-orchestrator` recibe `LLM_BASE_URL` con host `host.docker.internal` y el valor de la variable, no un literal del archivo

#### Scenario: Un servicio de LLM en Compose rompe el test [US-034 AC-5]
- **GIVEN** un *override* temporal que añade un servicio con imagen `ollama/ollama`
- **WHEN** el test estático resuelve el Compose con ese *override*
- **THEN** el test falla nombrando el servicio

### Requirement: Modo LLM_PROVIDER=fake con respuestas fijas del contrato
Con `LLM_PROVIDER=fake`, `rag-orchestrator` MUST arrancar sin el LLM nativo y `POST /rag/query` SHALL devolver las respuestas fijas de `contracts/examples/` (`FAKE_RESPONSES_PATH`) validadas al arranque contra `RagQueryInternalResponse`, elegidas por la `query` exacta del request de *fixture* asociado; sin coincidencia MUST devolver la de sin evidencia `[S1 resp. 7]`.

#### Scenario: La pregunta de fixture con evidencia devuelve su ejemplo [US-034 AC-6] [S1 resp. 7]
- **GIVEN** `LLM_PROVIDER=fake` y el LLM nativo detenido
- **WHEN** `clinical-api` (o el test con `TestClient`) envía a `POST /rag/query` el cuerpo de `rag-query-request.json`
- **THEN** la respuesta es `200`, igual a `rag-query-con-evidencia.json` y válida contra `RagQueryInternalResponse` del spec de `rag-orchestrator`

#### Scenario: La pregunta de fixture sin evidencia devuelve su ejemplo [US-034 AC-6] [S1 resp. 7]
- **GIVEN** `LLM_PROVIDER=fake`
- **WHEN** se envía el cuerpo de `rag-query-request-sin-evidencia.json`
- **THEN** la respuesta es `200`, igual a `rag-query-sin-evidencia.json` (`status = "sin_evidencia"`, `topRelevanceScore = null`) y válida contra `RagQueryInternalResponse`

#### Scenario: Una pregunta fuera de los fixtures recibe la respuesta sin evidencia [US-034 AC-6] (asumido)
- **GIVEN** `LLM_PROVIDER=fake`
- **WHEN** se envía `rag-query-request.json` con otra `query` sintética
- **THEN** la respuesta es la de `rag-query-sin-evidencia.json`; nunca la de con evidencia

#### Scenario: Un ejemplo inválido impide el arranque [US-034 AC-6] (asumido)
- **GIVEN** `LLM_PROVIDER=fake` y un `FAKE_RESPONSES_PATH` temporal donde `rag-query-con-evidencia.json` no cumple `RagQueryInternalResponse` (un campo requerido eliminado) o falta
- **WHEN** arranca `rag-orchestrator`
- **THEN** el proceso termina con código distinto de 0 y el log nombra el archivo, sin su contenido

### Requirement: El modo fake no arranca con datos reales habilitados
Con `REAL_ANONYMIZED_ENABLED=true` o `REAL_IDENTIFIED_ENABLED=true`, el arranque de `rag-orchestrator` con `LLM_PROVIDER=fake` MUST fallar, nombrando las variables en conflicto y nunca sus valores (RN-12, RN-13) `[S1 resp. 7]`.

#### Scenario: El modo fake no arranca con datos reales habilitados [US-034 AC-6] [RN-13] [RN-12]
- **GIVEN** `LLM_PROVIDER=fake` y `REAL_ANONYMIZED_ENABLED=true` (y, en otro caso, `REAL_IDENTIFIED_ENABLED=true`)
- **WHEN** arranca `rag-orchestrator`
- **THEN** el proceso termina con código distinto de 0 y el log nombra `LLM_PROVIDER` y la bandera en conflicto, sin valores

Regresión [RN-13] activa desde S6: el gate G-Piloto completo (`oncolens preflight real-data`, US-143) se suma a esta guarda.

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

### Requirement: Configuración tipada y validada al arranque
`clinical-api` y `rag-orchestrator` MUST leer toda configuración calibrable (RN-22) a través de un único módulo tipado por servicio (Zod en Node, Pydantic Settings en Python), cargado una vez antes de escuchar; ningún otro módulo SHALL leer el entorno directamente. Un valor ausente obligatorio o inválido MUST dejar el servicio sin quedar listo, con una línea de log JSON que nombra la variable y la regla incumplida y nunca su valor.

#### Scenario: Con el .env de referencia ambos servicios cargan su configuración [US-037 AC-1] [RN-22] [readme §1.4]
- **GIVEN** un entorno con los valores de readme §1.4 (`ENABLED_CANCER_TYPES`, `RELEVANCE_THRESHOLD`, TTL de sesión, *rate limits*, plazos de retención, `CLINICAL_CATALOG_VERSION`, `ANALYSIS_MEMORY_MAX`, `EVIDENCE_STALE_YEARS`, `AGENT_MAX_ITERATIONS`, `AGENT_MAX_SUBQUERIES`) y secretos ficticios
- **WHEN** arrancan `clinical-api` y `rag-orchestrator`
- **THEN** cada uno queda listo con su configuración cargada por su módulo tipado
- **AND** un test estático confirma que fuera de ese módulo no hay lecturas de `process.env` (Node) ni de `os.environ` (Python) en `src/` y `app/`, salvo la raíz de composición que lo invoca

#### Scenario: Un umbral fuera de rango impide arrancar [US-037 AC-2] [RN-22] (asumido)
- **GIVEN** `RELEVANCE_THRESHOLD=1.7`
- **WHEN** arranca `rag-orchestrator`
- **THEN** no queda listo, termina con código distinto de 0 y su log contiene una línea JSON con `variable = RELEVANCE_THRESHOLD` y la regla de rango, sin el valor `1.7`

#### Scenario: Un TTL no numérico impide arrancar [US-037 AC-2] [RN-22] (asumido)
- **GIVEN** `SESSION_IDLE_MINUTES=abc`
- **WHEN** arranca `clinical-api`
- **THEN** no escucha, termina con código 1 y el log registra `event = configuracion_invalida` con `variable = SESSION_IDLE_MINUTES`, la regla y `motivo = valor_invalido`, sin el valor `abc` y sin campo `valorInvalido`

### Requirement: Un único evento de configuración inválida con motivo cerrado
Todo fallo de configuración al arrancar, en ambos servicios, MUST registrarse con `event = configuracion_invalida`, `variable`, `regla` y `motivo` (enum cerrado: `valor_invalido`, `variable_ausente` y los que añadan otros changes, p. ej. `catalogo_no_disponible`). El valor MUST NOT registrarse, salvo en el campo cerrado `valorInvalido` para claves enum no sensibles (design D2).

#### Scenario: Un valor inválido de un enum no sensible se registra en el campo cerrado [US-037 AC-2] [RN-22] (asumido: excepción del Gate 1 del S2)
- **GIVEN** una clave de prueba declarada como enum no sensible con valores `mama | prostata` y el valor `leucemia`, y en otro caso el valor `Lucía Rondón`
- **WHEN** arranca `clinical-api`
- **THEN** no escucha y el log registra `event = configuracion_invalida`, `motivo = valor_invalido` y `valorInvalido = leucemia`
- **AND** con `Lucía Rondón` (no cumple el patrón) la línea no tiene `valorInvalido` ni contiene `Lucía`

### Requirement: La nube está deshabilitada por defecto
Sin `LLM_CLOUD_ENABLED` en el entorno, el valor efectivo en `rag-orchestrator` MUST ser `false` (RN-12).

#### Scenario: Sin la variable el proveedor en la nube queda deshabilitado [US-037 AC-6] [RN-12]
- **GIVEN** un entorno sin `LLM_CLOUD_ENABLED`
- **WHEN** arranca `rag-orchestrator` y el test lee la configuración efectiva
- **THEN** `llm_cloud_enabled` es `false`
