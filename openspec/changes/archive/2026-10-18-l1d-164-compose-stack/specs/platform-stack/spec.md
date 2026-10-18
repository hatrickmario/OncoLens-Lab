## ADDED Requirements

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
