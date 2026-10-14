# Design — l1d-164-compose-stack

## Context

El repositorio solo tiene los contratos de US-033 (`apps/*/openapi.yaml`, `contracts/`, lo
generado en `packages/api-contracts/` y `apps/rag-orchestrator/app/schemas/generated/`) y el
`package.json` raíz mínimo con los scripts `contracts:*`. No existe `infra/`, ni código de las
apps, ni `/health` en ningún spec. La topología está decidida en readme §2.4 (redes, puertos,
LLM fuera de Docker porque Docker en macOS no expone Metal) y los *health checks* en readme §2.7.
La máquina de referencia (S1-refinamiento §5) tiene Docker 29.8 + Compose v5.5, Node 26.7,
Python 3.13 + uv y Ollama 0.34.4.

## Goals / Non-Goals

**Goals:**
- Un único `docker compose -f infra/docker/docker-compose.yml up -d` levanta los ocho servicios
  `healthy` (AC-1), con solo `web` publicando puerto (AC-2), `rag-orchestrator` sin ruta a
  `clinical-minio` (AC-3), degradación aislada si el LLM cae (AC-4), LLM fuera de Compose (AC-5) y
  un modo `fake` determinista y fiel al contrato para la CI y los E2E (AC-6).
- Esqueletos mínimos de las apps con la estructura de readme §2.3, sobre los que construyen las
  demás historias del S1.

**Non-Goals:** ver proposal.md "Fuera de alcance".

## Decisions

### D1. Topología de Compose (readme §2.4)

| Servicio | Redes | Puerto al host | `depends_on` (condición) |
|---|---|---|---|
| `postgres` | `clinical-net`, `corpus-db-net` | — | — |
| `clinical-minio` | `clinical-net` | — | — |
| `milvus-etcd`, `milvus-minio` | `ai-net` | — | — |
| `milvus-standalone` | `ai-net` | — | `milvus-etcd`, `milvus-minio` (`service_healthy`) |
| `clinical-api` | `clinical-net`, `ai-net` | — | `postgres`, `clinical-minio` (`service_healthy`) |
| `rag-orchestrator` | `ai-net`, `corpus-db-net` | — | `postgres`, `milvus-standalone` (`service_healthy`) |
| `web` | `clinical-net` | `${WEB_BIND_ADDRESS:-127.0.0.1}:${WEB_PORT}:3000` | `clinical-api` (`service_healthy`) |

- **`clinical-api` no depende de `rag-orchestrator`**: con el LLM caído `rag-orchestrator` queda
  `unhealthy` (AC-4) y `clinical-api` debe seguir arrancando y respondiendo `200`.
- `rag-orchestrator` declara `extra_hosts: ["host.docker.internal:host-gateway"]` para que
  `LLM_BASE_URL` resuelva igual en macOS y en el runner Linux de la CI.
- `corpus-db-net` es `internal: true` (solo PostgreSQL ↔ `rag-orchestrator`). `clinical-net` no es
  interna porque `web` publica su puerto en ella, y `ai-net` tampoco porque `rag-orchestrator` sale
  por ella hacia `host.docker.internal`. La salida a Internet de `ai-net` queda cubierta en el S1
  por código (RN-12: `LLM_CLOUD_ENABLED=false`, sin adaptador de nube) y su cierre por red es parte
  del *hardening* del S5 (FEAT-T4d); se anota como riesgo.
- **`rag-orchestrator` con sistema de archivos de solo lectura:** `read_only: true` y un `tmpfs`
  en `/tmp` (tamaño en variable, RN-22) con `TMPDIR=/tmp`; el OCR que fija ADR-39 escribe ficheros
  temporales y lo hace solo en memoria, de modo que ningún PDF ni texto extraído persiste en el
  contenedor (los documentos se procesan en memoria y no se persisten, CLAUDE.md "la regla de
  ownership"). La caché de modelos, si hace falta, es un volumen de solo lectura que define ADR-39.
- **Catálogo clínico montado de solo lectura:** `packages/clinical-catalogs` se monta con
  `read_only: true` en `clinical-api` y en `rag-orchestrator` (no en `web`), y ambos reciben
  `CLINICAL_CATALOG_PATH` con el destino del montaje (CLAUDE.md "`packages/clinical-catalogs/`").
  Este change solo monta el directorio; **el creador único de `manifest.json`** (campo `version`)
  y del subconjunto mínimo es L1D-169; lo consumen L1D-103 (`catalogVersion`) y L1D-180/L1D-193
  (`lenguaje/`). El `409` por versión distinta entre backends es de US-041 (S2). Si el directorio
  aún no existe en `main` cuando se mergea este change, se crea vacío con un `.gitkeep` (sin
  `manifest.json`).
- **Nota (sin cambiar el alcance del S1):** antes de G-Piloto (FEAT-T4d) la topología se endurece:
  red `edge-net` solo entre `web` y `clinical-api`, `clinical-net` pasa a `internal: true` y se
  cierra la salida de `ai-net` (solo `host.docker.internal`); las descargas de modelos se mueven a
  un perfil de Compose aparte y en runtime se fija `HF_HUB_OFFLINE=1`. Lo de este change no lo
  impide: no hay dependencias de Internet en runtime.
- Healthchecks con `/health` (`clinical-api`, `rag-orchestrator`), `/api/health` (`web`),
  `pg_isready`, `/minio/health/live` y `/healthz` de Milvus. Intervalos y reintentos en el Compose
  como variables con valor por defecto (RN-22).
- Imágenes de terceros (PostgreSQL, MinIO, etcd, Milvus *standalone*) con **tag exacto**, la
  estable vigente en la fecha del PR; nunca `latest`. Las de las apps, con base fijada y usuario no
  root.
- **Alternativas descartadas:** un LLM en contenedor (sin Metal en macOS, readme §1.4); publicar
  puertos de los backends "solo en desarrollo" (rompe SEG-09 y el test de AC-2); `depends_on` de
  `clinical-api` sobre `rag-orchestrator` (acopla la ficha al LLM, contradice AC-4).

### D2. `GET /health` de cada servicio

- **`clinical-api`:** `200 {"status":"ok"}` cuando el proceso está listo. No consulta a
  `rag-orchestrator` (AC-4). Las condiciones de listo que añaden otras historias (claves de US-035
  AC-5, catálogo de FEAT-PL3) extienden este *endpoint* de forma aditiva.
- **`rag-orchestrator`:** con `LLM_PROVIDER=local`, sonda `GET {LLM_BASE_URL}/models` (API
  compatible con OpenAI de Ollama/vLLM) con *timeout* `LLM_HEALTH_TIMEOUT_MS`; alcanzable →
  `200 {"status":"ok"}`; error de conexión, *timeout* o 5xx → `503` con el cuerpo
  `ErrorLlmLocalNoDisponible` (`error = "LOCAL_LLM_UNAVAILABLE"`, `message`, `traceId`). Con
  `LLM_PROVIDER=fake` no hay sonda: `200`. El `traceId` se toma de `X-Trace-Id` si llega o lo genera
  un `TraceIdGenerator` inyectado (la propagación completa es de US-037).
- **`web`:** Route Handler `app/api/health/route.ts`, `200 {"status":"ok"}`, sin llamar a
  `clinical-api` ni leer la sesión; solo lo usa el healthcheck de Compose.
- **Alternativa descartada:** que `clinical-api` agregue el estado de `rag-orchestrator` en su
  `/health` (lo volvería `≠ 200` con el LLM caído, contra AC-4).

### D2b. Errores de validación de `rag-orchestrator`

- `app/api/errors.py` registra en `app/main.py` un *handler* de `RequestValidationError` que
  responde `422` con `ErrorValidacion`: `error = "CUERPO_INVALIDO"`, `message` fijo, `traceId`
  (de `X-Trace-Id` o del `TraceIdGenerator` inyectado) y `detail[]` con solo `loc`, `msg` y
  `type`. El *handler* descarta `input` y `ctx` del error de Pydantic: **nunca se hace eco del
  cuerpo ni de los valores recibidos** (RN-10; el cuerpo lleva el contexto clínico
  desidentificado) y no registra el cuerpo en el log.
- El ejemplo congelado `rag-validacion-422.json` (target `/rag/query` `422`) es la forma
  esperada; el test valida la respuesta contra el spec con el *helper* de D5b.
- Con el JWT de servicio de L1D-105 la dependencia de autenticación se resuelve antes que el
  cuerpo (`401` antes que `422`); este *handler* no cambia ese orden.

### D3. Modo `LLM_PROVIDER=fake` (AC-6, `[S1 resp. 7]`)

- `LLM_PROVIDER ∈ {local, fake}` (configuración, por defecto `local`; la nube no existe en el S1 y
  se gobierna con `LLM_CLOUD_ENABLED`, RN-12).
- Al arrancar en modo `fake`, `FakeEvidenceQuery` lee `index.json` de `FAKE_RESPONSES_PATH`
  (`contracts/examples/` montado de solo lectura) y carga las entradas cuyo `target` es
  `#/components/schemas/RagQueryInternalResponse`, junto con su `request`. Cada respuesta se valida
  con el modelo Pydantic **generado** `RagQueryInternalResponse`; una inválida o ausente impide el
  arranque (el proceso termina con código ≠ 0 y nombra el archivo, nunca su contenido).
- **Selección determinista por la pregunta de *fixture*:** la `query` del request (sin espacios en
  los extremos) se compara de forma exacta con la `query` del ejemplo de request asociado a cada
  respuesta. `rag-query-request.json` → `rag-query-con-evidencia.json`; el nuevo
  `rag-query-request-sin-evidencia.json` → `rag-query-sin-evidencia.json`. **Pregunta sin
  coincidencia → la respuesta sin evidencia**: el modo falso nunca inventa evidencia para una
  pregunta que no es de *fixture*.
- La respuesta se devuelve literal (sin reescribir `meta`); los E2E reconocen así que corrieron
  contra respuestas fijas.
- **Guarda de RN-13:** la validación de `Settings` rechaza `LLM_PROVIDER=fake` con
  `REAL_ANONYMIZED_ENABLED=true` o `REAL_IDENTIFIED_ENABLED=true`; el proceso no arranca y el log
  nombra las variables en conflicto, nunca valores. Es defensa en profundidad del gate G-Piloto
  (US-143), no su implementación.
- **Alternativas descartadas:** fingir solo el adaptador del LLM y ejecutar la recuperación real
  (la CI necesitaría Milvus con corpus y modelos de *embeddings*, y las respuestas dejarían de ser
  fijas); seleccionar por una variable `FAKE_SCENARIO` (un E2E no podría ejercitar ambos casos en
  la misma corrida); un *mock server* externo (duplica el contrato fuera del proveedor).

### D4. Secretos y configuración (coordinación con L1D-165)

- El Compose declara `secrets:` de tipo `file` bajo `${ONCOLENS_SECRETS_DIR:-./secrets}` con los
  nombres que genera `scripts/setup-secrets.sh` de US-035: `jwt_service_private.pem`,
  `jwt_service_public.pem`, `identity_aes_key`, `blind_index_hmac_key`, `pg_clinical_api_password`,
  `pg_research_writer_password`, `pg_rag_corpus_password`, `pg_superuser_password`,
  `clinical_minio_root_password`, `milvus_minio_root_password`. Si L1D-165 fija otros nombres,
  manda L1D-165 y este Compose se ajusta en el mismo sprint.
- **Claves del JWT de servicio** (nombres de L1D-165 D3/D4): el Compose monta
  `jwt_service_private.pem` solo en `clinical-api` con
  `SERVICE_JWT_PRIVATE_KEY_FILE=/run/secrets/jwt_service_private.pem`, y `jwt_service_public.pem`
  solo en `rag-orchestrator` con `SERVICE_JWT_PUBLIC_KEY_FILE=/run/secrets/jwt_service_public.pem`.
  Su carga y validación al arranque son de L1D-105 (US-054); aquí solo se declaran.
- Los tests estáticos (AC-2, AC-5) crean secretos ficticios en un directorio temporal
  (`scripts/smoke/lib/fake-secrets.sh`) y lo pasan por `ONCOLENS_SECRETS_DIR`; nada se escribe en el
  repo. El script genera con `openssl` un **par EC P-256 real** para `jwt_service_private.pem` y
  `jwt_service_public.pem` (`openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256` y
  `openssl pkey -pubout`) y valores aleatorios para el resto, de modo que `rag-orchestrator`
  arranca en modo `fake` con la carga y verificación del JWT de L1D-105 aunque L1D-165 no esté
  todavía en `main`. Lo cubre `scripts/smoke/__tests__/fake-secrets.test.mjs` (curva, par
  correspondiente, firma y verificación ES256 de prueba, salida sin valores).
- `infra/docker/.env.example` (versionado, sin secretos): `APP_ENV=local` (lo leen el
  desidentificador provisional de L1D-103, `[S1 resp. 14d]`, y el seed), `WEB_PORT`, `WEB_BIND_ADDRESS`,
  `LLM_PROVIDER=local`, `LLM_BASE_URL=http://host.docker.internal:11434/v1`, `LLM_MODEL=` (vacío
  hasta ADR-39), `LLM_HEALTH_TIMEOUT_MS`, `LLM_CLOUD_ENABLED=false`,
  `REAL_ANONYMIZED_ENABLED=false`, `REAL_IDENTIFIED_ENABLED=false`, `FAKE_RESPONSES_PATH`,
  `CLINICAL_CATALOG_PATH` (destino del montaje de solo lectura del catálogo), `ONCOLENS_SECRETS_DIR`. `infra/docker/.env` en `.gitignore`.

### D5. Tests

| AC | Tipo | Dónde | Cómo |
|---|---|---|---|
| AC-1 | smoke (test después) | `scripts/smoke/compose-smoke.sh` | `up -d --wait`; `docker compose ps --format json` todos `healthy`; `/health` de `clinical-api` desde `web` y de `rag-orchestrator` desde `clinical-api` (red interna) |
| AC-2 | estático (test después) | `infra/docker/__tests__/compose-config.test.mjs` (Vitest) | `docker compose config --format json`: solo `web` con `ports`; `clinical-api` y `rag-orchestrator` sin `ports` ni `expose` al host |
| AC-3 | smoke | ídem AC-1 | TCP a `clinical-minio:9000` desde `rag-orchestrator` (Python `socket`) falla; desde `clinical-api` (Node `net`) conecta |
| AC-4 | smoke + integración (TDD estricto: endpoint) | smoke con `LLM_PROVIDER=local` y `LLM_BASE_URL` a un puerto sin escucha; Pytest + `TestClient` + `respx` | `503 LOCAL_LLM_UNAVAILABLE` validado contra el spec; `clinical-api` `200` |
| AC-5 | estático | ídem AC-2 | ningún servicio con imagen o nombre de LLM (`ollama`, `vllm`, `llama`); `LLM_BASE_URL` de `rag-orchestrator` con host `host.docker.internal` y valor tomado de la variable |
| AC-6 | integración (TDD estricto: endpoint y guarda RN-13) + smoke | Pytest + `TestClient`; smoke con `LLM_PROVIDER=fake` | `/health` `200`; `/rag/query` con cada pregunta de *fixture* devuelve su ejemplo, validado contra `RagQueryInternalResponse`; arranque con `REAL_*_ENABLED=true` falla |

El smoke corre en local y en la CI (el *workflow* es de L1D-166). Ningún test usa el LLM real; el
reloj y los generadores de `traceId` se inyectan. Además: el `422` del *handler* de D2b
(integración, TDD estricto) y `read_only`/`tmpfs` de `rag-orchestrator` (estático sobre
`docker compose config`, y en el smoke una escritura fuera de `/tmp` falla); el montaje de solo
lectura del catálogo con `CLINICAL_CATALOG_PATH` en ambos backends (estático) y el par EC P-256 de
`fake-secrets.sh` (`fake-secrets.test.mjs`), ambos en `npm run test:infra`.

### D5b. *Helper* de validación de respuestas contra el spec `[S1 resp. 17]`

Lo usan todos los changes del S1 que validan una respuesta "contra el spec" hasta que
`contracts:verify-provider` exista (US-214); no hay un segundo empaquetador ni copias del schema.

- **Vitest:** `scripts/contracts/lib/responseValidator.mjs` exporta
  `assertMatchesSpec(provider, pointer, body)` (y `matchesSpec()` que devuelve los errores), que
  compila con **Ajv2020** (misma configuración que `validator.mjs`) el subschema apuntado por
  `pointer` (`#/components/schemas/…` o `#/paths/…/responses/<código>`, resolviendo `$ref` a
  `responses` y el `content.application/json.schema`) sobre el spec empaquetado por
  `bundleSpec()` de `scripts/contracts/lib/bundle.mjs`. Caché por proveedor.
- **Pytest:** `apps/rag-orchestrator/tests/support/contract.py` exporta
  `assert_matches_spec(pointer, body)` con `jsonschema` (`Draft202012Validator` + `referencing`)
  sobre el mismo spec empaquetado, que un *fixture* de sesión de `conftest.py` obtiene ejecutando
  `node scripts/contracts/bundle-json.mjs rag-orchestrator` (salida JSON a `stdout`, sin escribir
  en el repo).
- Tests propios: un ejemplo válido de `contracts/examples/` pasa y uno con un campo requerido
  quitado falla nombrando el campo, en ambos lenguajes.

### D6. Router de `/rag/query` y puerto compartido

**Nombres canónicos `[S1 resp. 17]`** (los usan L1D-105, L1D-106, L1D-114, L1D-180, L1D-275 y el
resto de changes del S1 sobre `rag-orchestrator`): router `app/api/rag_query.py`, configuración
`app/config/settings.py` (`Settings`), raíz de composición `app/bootstrap.py` y puerto
`EvidenceQueryPort`. **Este change crea `app/application/ports.py`** (`LlmHealthPort`,
`EvidenceQueryPort`, `TraceIdGenerator`); los demás changes añaden sus puertos a ese archivo.

`app/api/rag_query.py` es un router delgado que valida el cuerpo con el modelo generado
`RagQueryInternalRequest` y delega en `EvidenceQueryPort` (`app/application/ports.py`). La
composición (`app/bootstrap.py`) enlaza `FakeEvidenceQuery` si `LLM_PROVIDER=fake`; con `local`, el
enlace real es de L1D-106 (US-055) y, hasta que exista, `/rag/query` no se registra. La dependencia
del JWT de servicio la añade L1D-105 (US-054) al router, para ambos enlaces. Si L1D-106 llega antes
y ya creó el router, este change solo añade el enlace `fake` (se acuerda en la oleada).

## Privacidad y ownership

- **Fronteras:** navegador → `web` (único puerto, `127.0.0.1` en el S1) → `clinical-api`
  (`clinical-net`) → `rag-orchestrator` (`ai-net`). `rag-orchestrator` **no comparte red con
  `clinical-minio`** (solo `clinical-net`) y llega a PostgreSQL solo por `corpus-db-net`; el rol
  `rag_corpus` y `pg_hba` son de US-035/US-040. AC-3 lo verifica.
- **Datos:** ningún dato clínico ni de paciente cruza en este change. El modo `fake` solo lee
  `contracts/examples/`, sintéticos por la regla `assertExamplesSynthetic()` de US-033 (RN-14); no
  persiste nada ni registra el cuerpo de las requests.
- **Desidentificación (RN-11):** sin cambios; el contexto clínico lo construye el gateway
  (US-052). El modo `fake` no lee el `clinicalContext` salvo para validar su forma.
- **Datos reales (RN-12, RN-13):** banderas `REAL_*` en `false` en `.env.example`; el modo `fake`
  no arranca con ellas en `true`.
- **Secretos (RN-14):** solo referencias a archivos fuera del repo (`ONCOLENS_SECRETS_DIR`); el
  reparto por servicio es de L1D-165. La clave privada del JWT, la AES y la HMAC nunca se montan en
  `rag-orchestrator`.
- **Logs:** el `/health` y el arranque registran nombres de variables y estados, nunca valores,
  URLs con credenciales ni contenidos.
- **Sesión ≠ credencial de servicio:** sin cambios; `web` no reenvía cookies a `/api/health`.

### Seguridad web

- Validación: `/api/health` no recibe entrada.
- Sin variables `NEXT_PUBLIC_` nuevas.
- El Route Handler es de servidor (`export const dynamic = 'force-dynamic'`), sin acceso a secretos.
- No se renderiza texto del LLM ni del corpus.
- CSP y cabeceras sin cambios (US-216).
- Dependencias nuevas: `next` 16.x, `react` y `react-dom` 19, `typescript`; `express` 5,
  `tsx`, `supertest`; `fastapi`, `uvicorn`, `pydantic-settings`, `httpx`, `respx`, `pytest`, todas
  con versión exacta. El resultado de `npm audit` y `pip-audit` va en el PR.

## Componentes y patrones

Sin componentes de UI ni patrones (YAGNI). `apps/web` solo tiene `next.config.ts` (sin `webpack()`,
`output: 'standalone'`), `app/api/health/route.ts` y la configuración mínima; sin `'use client'` ni
*providers*. Las pantallas llegan con US-211 y siguientes (`docs/ux/S1/`).

## Dependencias y colaboradores

| Módulo | Se crea | Depende de |
|---|---|---|
| `apps/clinical-api/src/app.ts`, `src/routes/health.ts` | sí | Express; sin servicios ni repositorios (no hay lógica de dominio) |
| `apps/rag-orchestrator/app/main.py`, `app/bootstrap.py` | sí | `Settings`; enlaza puertos con adaptadores (único lugar con clases concretas) |
| `app/config/settings.py` (`Settings`) | sí | `pydantic-settings`; regla con nombre `reject_fake_provider_with_real_data()` (RN-13) |
| `app/api/health.py` | sí | `LlmHealthPort` |
| `app/api/rag_query.py` | sí (ver D6) | `EvidenceQueryPort`, `RagQueryInternalRequest` generado |
| `app/application/ports.py` (`LlmHealthPort`, `EvidenceQueryPort`, `TraceIdGenerator`) | sí (lo crea este change) | — |
| `app/api/errors.py` (*handler* de `RequestValidationError`) | sí | `TraceIdGenerator`; `ErrorValidacion` generado |
| `scripts/contracts/lib/responseValidator.mjs`, `scripts/contracts/bundle-json.mjs`, `apps/rag-orchestrator/tests/support/contract.py` | sí | `bundleSpec()`, Ajv2020, `jsonschema` |
| `app/infrastructure/llm/openai_compatible_health.py` | sí | `httpx`; implementa `LlmHealthPort` |
| `app/infrastructure/fake/fake_evidence_query.py` | sí | `RagQueryInternalResponse` generado; implementa `EvidenceQueryPort`; método con nombre `select_fixture_response()` |
| `apps/web/app/api/health/route.ts` | sí | — |
| `infra/docker/docker-compose.yml`, `.env.example`, `Dockerfile` de cada app | sí | secretos de L1D-165 |
| `apps/*/openapi.yaml`, `contracts/examples/`, `scripts/contracts/rules/assertOperationsDeclarePermission.mjs` | se modifican | — |

## Contratos

Proveedores: `clinical-api` y `rag-orchestrator`. Consumidores de `/health`: los healthchecks de
Compose y el smoke test (no hay cliente generado que lo use). Cambio **aditivo** (ADR-26):
`oasdiff` no debe reportar incompatibilidades; `info.version` 1.0.0 → **1.1.0** en ambos.

**Política de versión** (requisito MODIFIED "Política de versión del contrato" de `api-contracts`):
minor para una operación, respuesta o código de error nuevo; patch para texto (descripciones,
`message`); un change que solo añade ejemplos no toca `info.version`; si dos changes suben la
versión del mismo spec en paralelo, **quien mergea segundo rebasa** sobre `main` y conserva su
número. El registro concreto de números por change del S1 vive en `backlog/sprints/S1-plan.md` §2
`[S1 resp. 17]`; a este change le corresponde **1.1.0** en ambos specs.

```diff
# apps/clinical-api/openapi.yaml
+  /health:
+    get:
+      operationId: getHealth
+      tags: [operacion]
+      summary: Estado del proceso para el healthcheck de Compose
+      description: >-
+        Solo en la red interna; web no lo reenvía. No consulta a rag-orchestrator: con el LLM
+        caído sigue respondiendo 200.
+      security: []
+      x-permission: publico
+      responses:
+        "200":
+          content: { application/json: { schema: { $ref: '#/components/schemas/HealthStatus' } } }
+components.schemas:
+    HealthStatus:
+      type: object
+      additionalProperties: false
+      required: [status]
+      properties:
+        status: { type: string, const: ok }
```

```diff
# apps/rag-orchestrator/openapi.yaml
+  /health:
+    get:
+      operationId: getHealth
+      tags: [operacion]
+      summary: Estado del proceso y del LLM nativo
+      description: >-
+        Con LLM_PROVIDER=local verifica el LLM nativo en LLM_BASE_URL y responde 503
+        LOCAL_LLM_UNAVAILABLE si no está; con LLM_PROVIDER=fake no lo consulta.
+      security: []
+      responses:
+        "200":
+          content: { application/json: { schema: { $ref: '#/components/schemas/HealthStatus' } } }
+        "503":
+          $ref: '#/components/responses/LlmLocalNoDisponible'
+components.schemas:
+    HealthStatus: (idéntico al de clinical-api)
```

- `HealthStatus` se define en cada spec y **no** en `contracts/schemas/evidence.yaml` (no es un
  schema del análisis de evidencia; la regla de los ocho compartidos no cambia).
- `assertOperationsDeclarePermission()`: `publico` pasa a admitirse en `POST /platform/auth/login`
  **y** `GET /health`; cualquier otra operación con `publico` sigue fallando.
- **Ejemplos nuevos** (`contracts/examples/` + `index.json`): `health-ok.json` (→ `HealthStatus` de
  ambos), `rag-health-llm-no-disponible.json` (→ `#/paths/~1health/get/responses/503`) y
  `rag-query-request-sin-evidencia.json` (→ `RagQueryInternalRequest`; igual a
  `rag-query-request.json` salvo la `query`, una pregunta sintética que el corpus semilla no
  cubre). **Ejemplo cambiado:** la entrada de `rag-query-sin-evidencia.json` en `index.json` pasa a
  `"request": "rag-query-request-sin-evidencia.json"` (D3).
- **Regla general de las preguntas de *fixture*:** en `index.json`, toda entrada con `target`
  `#/components/schemas/RagQueryInternalResponse` MUST declarar `request`, cada request de *fixture*
  se asocia a una sola respuesta y las `query` (sin espacios en los extremos) de todos esos
  requests son distintas entre sí. Así el modo `fake` elige sin ambigüedad aunque L1D-106, L1D-275
  o L1D-180 añadan pares nuevos. Se implementa como regla de `contracts:check`
  (`assertFixtureQueriesDistinct()`).
- Lo generado (tipos TS, Zod, Pydantic `HealthStatus`) sale de `contracts:generate`, nunca a mano.

## Evaluación

No aplica: no cambia modelo, prompt, umbral, catálogo ni corpus. El modo `fake` no se usa en la
suite `evaluate` (OL-06), que corre con el LLM real.

## Risks / Trade-offs

- **`ai-net` con salida a Internet** (necesaria para `host.docker.internal`): mitigado por código
  (RN-12) y cerrado por red en el S5 (FEAT-T4d), junto con `edge-net`, `clinical-net` interna y
  `HF_HUB_OFFLINE=1` (nota de D1).
- **`read_only` en `rag-orchestrator`**: una librería que escriba fuera de `/tmp` (cachés de
  modelos) falla al arrancar; se detecta en el smoke y se resuelve con un volumen de solo lectura
  o una variable de caché hacia `/tmp`, nunca quitando `read_only`.
- **Respuestas `fake` literales**: los E2E no verifican la orquestación real; es intencional (la
  cubren los Pytest de L1D-106/L1D-275 y la suite `evaluate`).
- **Solapamiento con L1D-165 y L1D-106** en el Compose y en el router de `/rag/query`: se mitiga
  con D4, D6 y el orden de la oleada.
- **Memoria del stack**: Milvus + modelos en CPU + LLM podrían superar 24 GB; lo mide ADR-39
  (L1D-274). El Compose no fija `mem_limit` hasta esa medición.
