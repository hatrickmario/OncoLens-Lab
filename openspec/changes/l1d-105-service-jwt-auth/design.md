# Design — l1d-105-service-jwt-auth

## Contexto

Readme §2.5 y §6.1 #7 ya decidieron la credencial: JWT de servicio con firma asimétrica
(ES256/RS256) y algoritmo fijado en el validador; descartados HS256 compartido, mTLS y API key
estática. Readme §1.4 fija el par **ES256** que genera `scripts/` (US-035). El contrato congelado
(US-033, nota del Gate 1 del 2026-10-11) ya declara `security: serviceJwt` (bearer JWT) y el `401`
`TOKEN_SERVICIO_INVALIDO` en `/rag/query`. Esta historia lo implementa en ambos lados.

## Decisiones

### D1. Algoritmo y claims

- **Algoritmo:** `ES256`, constante en código en ambos lados (no configurable: abrir el algoritmo a
  configuración reintroduciría la confusión de algoritmos que §6.1 #7 descarta). No es un valor "a
  calibrar" (RN-22 no aplica).
- **Cabecera:** `{ "alg": "ES256", "typ": "JWT" }`. Sin `kid` ni `jku`/`x5u` (una sola clave; las
  cabeceras que apuntan a claves externas se ignoran y no se resuelven).
- **Claims obligatorios:** `iss = "clinical-api"`, `aud = "rag-orchestrator"`, `iat`, `exp`.
  **Prohibidos:** cualquier identificador del doctor, de la sesión o del paciente (`sub` no se
  emite). La identidad nunca sale de `clinical-api` (RN-10) y la sesión no llega a Backend 2.
- **Vida:** el firmador emite `exp = iat + SERVICE_JWT_TTL_SECONDS`. El validador rechaza si
  `exp ≤ ahora − skew` (expirado), `iat > ahora + skew` (emitido en el futuro) o
  `exp − iat > SERVICE_JWT_TTL_SECONDS` (vida mayor que el máximo, AC-5). `skew =
  SERVICE_JWT_CLOCK_SKEW_SECONDS`. Un token nuevo por request; sin caché de tokens.

### D2. Validador en `rag-orchestrator`

- `app/infrastructure/security/service_jwt_verifier.py` — `ServiceJwtVerifier(public_key, clock,
  ttl_seconds, skew_seconds)`. Usa **PyJWT[crypto]** con `algorithms=["ES256"]` y
  `options={"require": ["iss", "aud", "iat", "exp"], "verify_exp": False}`; la vigencia la
  comprueba el método extraído `vigencia_dentro_del_maximo(claims, ahora)` con el `Clock`
  inyectado (determinismo, sin `time.time()` directo). Devuelve un resultado o lanza
  `TokenServicioInvalido(motivo)` con motivo cerrado: `ausente`, `malformado`, `algoritmo`,
  `firma`, `emisor`, `audiencia`, `expirado`, `vida_maxima`.
- `app/api/dependencies/service_jwt.py` — dependencia FastAPI `require_service_jwt` que lee solo
  `Authorization: Bearer`; **no lee cookies**. Se monta con `dependencies=[Depends(...)]` en el
  `APIRouter` interno (endpoints de L1D-164/L1D-106 y los futuros `/documents/extract`,
  `/case/summary`, `/rag/follow-up`), nunca en `GET /health`.
- Las dependencias del router se resuelven antes que la validación del cuerpo: un request sin
  token y con cuerpo inválido recibe `401`, no `422` (no se revela el esquema a quien no está
  autenticado), y la comprobación del catálogo (`409`) tampoco corre.
- **Respuesta:** `401` con `ErrorTokenServicioInvalido` (`error`, `message` fijo "El token de
  servicio falta o no es válido.", `traceId`) y `WWW-Authenticate: Bearer`. El mismo cuerpo para
  todos los motivos (sin oráculo); el motivo solo va al log.
- **Arranque:** sin `SERVICE_JWT_PUBLIC_KEY_FILE` legible, o con una clave que no sea EC P-256
  pública, el proceso no arranca (fallo cerrado). Aplica también con `LLM_PROVIDER=fake`.

### D3. Firmador y transporte en `clinical-api`

- `src/infrastructure/service-jwt.ts` — `createServiceTokenSigner({ privateKey, clock, ttlSeconds })`
  → `{ sign(): Promise<string> }`, con la librería **`jose`** (`SignJWT`, `importPKCS8`). La clave se
  carga una vez al arrancar desde `SERVICE_JWT_PRIVATE_KEY_FILE`; sin ella, `clinical-api` no arranca.
- `src/infrastructure/rag-orchestrator.http.ts` — `createRagOrchestratorFetch({ baseUrl, signer })`
  devuelve un `fetch` que construye cabeceras **desde cero** (`Authorization`, `Content-Type`,
  `X-Trace-Id` y las que el SDK puso para la operación, como `X-Request-Deadline`) y no acepta las del request entrante; además elimina
  `cookie` si un llamador la pasara. El cliente generado de `packages/api-contracts` (L1D-103) se
  instancia con este `fetch`; ningún módulo llama a `rag-orchestrator` con otro.
- La clave privada nunca se registra ni se expone en errores; `rag-orchestrator` no la recibe.
- `X-Request-Deadline` **no lo calcula el transporte**: lo pasa el servicio llamador como
  parámetro tipado de la operación del SDK (D4); el transporte conserva las cabeceras que el SDK
  puso para esa operación (`X-Request-Deadline`, `Content-Type`) y añade `Authorization` y
  `X-Trace-Id`.

### D4. Clientes HTTP generados con `fetch` inyectable (US-054 AC-6, `[S1 resp. 13]`)

- **Generación:** `scripts/contracts/generate.mjs` añade a hey-api los plugins
  `@hey-api/client-fetch` y `@hey-api/sdk` y escribe un SDK por spec en
  `packages/api-contracts/src/client/clinical-api/` y `packages/api-contracts/src/client/rag-orchestrator/`
  (cabecera "generado, no editar"). `generated.mjs` ya vigila `packages/api-contracts/src`, así que
  `contracts:generate:check` detecta una edición a mano o un SDK desactualizado; se añade una
  prueba de ello. `@hey-api/client-fetch` y `@hey-api/sdk` son **plugins incluidos** en
  `@hey-api/openapi-ts` (se declaran en `plugins` de su configuración, no son paquetes con versión
  propia): lo que se fija es la **versión exacta de `@hey-api/openapi-ts`** (sin `^`/`~`, en el
  lockfile), y la auditoría de dependencias cubre ese paquete.
- **Commit `contract(L1D-105)` sin cambio de spec (excepción a la regla 2 del Gate 2):** el commit
  `contract(L1D-105): clientes HTTP generados` cambia archivos generados en
  `packages/api-contracts/src/client/` **sin** cambiar ningún `openapi.yaml`, porque lo que cambia es
  la **configuración del generador** (`scripts/contracts/generate.mjs`: plugins del SDK y rutas de
  salida), que va en ese mismo commit. Es la única excepción a "lo generado solo cambia cuando
  cambia el spec"; la aprueba el humano en el plan del sprint y el Gate 2 la comprueba: el diff del
  commit solo toca `generate.mjs` y lo generado, y regenerar desde los specs de `main` reproduce lo
  commiteado.
- **`fetch` inyectable:** cada SDK expone `createClient({ baseUrl, fetch })` (ningún cliente global
  por defecto en producción); las operaciones reciben `{ client, body, headers }` tipados.
- **`clinical-api → rag-orchestrator`:**
  `src/infrastructure/rag-orchestrator.client.ts` — `createRagOrchestratorClient({ baseUrl, signer })`
  instancia el SDK de rag con `fetch: createRagOrchestratorFetch({ baseUrl, signer })`. Es la
  **única** forma de llamar a `rag-orchestrator` (L1D-103, L1D-104).
- **`X-Request-Deadline`:** parámetro de cabecera tipado de `ragQuery`/`answerFollowUp`
  (`#/components/parameters/RequestDeadline`, `date-time`); lo calcula el servicio del gateway
  (L1D-103) desde su configuración, nunca el transporte.
- **`web → clinical-api`:** se genera el SDK; su `fetch` (reenvío de la cookie de sesión y
  `Origin`) lo inyectan los Route Handlers de L1D-139 y la sesión de L1D-197. Este change no crea
  ese `fetch`.
- **Alternativas descartadas:** clientes escritos a mano (divergen del contrato); `openapi-fetch`
  (segunda herramienta junto a hey-api, que ya genera tipos y Zod); calcular el deadline en el
  transporte (oculta una regla del gateway en infraestructura).

### Alternativas

Decisión ya tomada (readme §6.1 #7); no se reabre. Librerías: `jose` (Node, sin dependencias
nativas, soporta ES256 y fija algoritmos) y PyJWT (estándar, `algorithms` obligatorio);
descartadas `jsonwebtoken` (API más permisiva con algoritmos y claves) y `python-jose`
(mantenimiento irregular).

## Privacidad y ownership

- **Fronteras:** navegador → `web` (cookie `oncolens_session`) → `clinical-api` (valida la sesión) →
  `rag-orchestrator` (solo `Authorization: Bearer <jwt de servicio>`). La cookie termina en
  `clinical-api`; el transporte saliente no puede reenviarla (D3) y el validador no la lee (D2).
- **Contenido del JWT:** solo `iss`, `aud`, `iat`, `exp`. Sin identidad del doctor, del paciente ni
  de la sesión (RN-10). El cuerpo del request (contexto desidentificado, RN-11) no cambia aquí.
- **Claves:** privada solo montada en `clinical-api`, pública solo en `rag-orchestrator` (reparto de
  L1D-165, SEG-07). Nunca en el repo (RN-14); los tests generan un par efímero en memoria.
- **Logs:** nunca `Authorization`, `Cookie`, el token ni la clave. En un `401` se registra
  `{event: "token_servicio_invalido", motivo, traceId}`. Test de AC-3 sobre los logs capturados.
- `rag-orchestrator` sigue sin acceso a datos clínicos ni a `clinical-minio`; este change no añade
  red, credenciales ni rutas.

## Contratos

- **Proveedor:** `rag-orchestrator` (`apps/rag-orchestrator/openapi.yaml`). **Consumidor:**
  `clinical-api` vía el cliente generado.
- **Diff propuesto en los specs: ninguno** (el SDK de D4 sale del spec actual; sin bump, registro `[S1 resp. 17]`). Ya existen `security: [serviceJwt]` global, `securitySchemes.serviceJwt`
  (http bearer JWT), `responses.TokenServicioInvalido`, `schemas.ErrorTokenServicioInvalido` y el
  ejemplo `contracts/examples/rag-token-servicio-invalido.json` (target `/rag/query` `401`).
  `GET /health` con `security: []` lo añade L1D-164.
- **Versión:** `info.version` no se toca → **sin choque** con el 1.0.0 → 1.1.0 de L1D-164. Sin
  cambio incompatible (oasdiff vacío); compatible con ADR-26.
- **Posible ajuste no incluido:** documentar `ES256`, `iss` y `aud` en la `description` de
  `serviceJwt` sería un cambio de texto (compatible) que obligaría a otro bump de versión; se deja
  en este design.md y en la spec `service-auth` para no colisionar con L1D-164.
- Verificación del proveedor (US-214): los tests de `401` validan el cuerpo contra
  `#/components/responses/TokenServicioInvalido`.

## Dependencias y colaboradores

| Módulo | Estado | Depende de |
|---|---|---|
| `rag-orchestrator/app/infrastructure/security/service_jwt_verifier.py` | nuevo | PyJWT, puerto `Clock` (`app/application/ports.py`, archivo creado por L1D-164; si `Clock` aún no está, lo añade este change), clave pública |
| `rag-orchestrator/app/api/dependencies/service_jwt.py` | nuevo | `ServiceJwtVerifier` (inyectado en `bootstrap.py`) |
| `rag-orchestrator/app/api/rag_query.py` (router de L1D-164, nombre canónico `[S1 resp. 17]`) | modificado | añade `dependencies=[Depends(require_service_jwt)]` |
| `rag-orchestrator/app/bootstrap.py` | modificado | carga la clave pública y crea el verificador; fallo cerrado |
| `rag-orchestrator/app/config/settings.py` (`Settings`, nombre canónico `[S1 resp. 17]`) | modificado | `SERVICE_JWT_TTL_SECONDS`, `SERVICE_JWT_CLOCK_SKEW_SECONDS`, `SERVICE_JWT_PUBLIC_KEY_FILE` |
| `rag-orchestrator/tests/support/service_jwt.py` | nuevo | *builder* de tokens de test (válido y cada variante inválida), par efímero |
| `clinical-api/src/infrastructure/service-jwt.ts` | nuevo | `jose`, `Clock` inyectado, clave privada |
| `clinical-api/src/infrastructure/rag-orchestrator.http.ts` | nuevo | `ServiceTokenSigner` (interfaz) |
| `clinical-api/src/infrastructure/rag-orchestrator.client.ts` | nuevo | SDK generado de rag, `createRagOrchestratorFetch()` |
| `scripts/contracts/generate.mjs` | modificado | plugins `@hey-api/client-fetch` y `@hey-api/sdk` (incluidos en `@hey-api/openapi-ts`, versión exacta fijada) |
| `packages/api-contracts/src/client/{clinical-api,rag-orchestrator}/` | generado | specs de ambos proveedores; nunca a mano |
| tests de `/rag/query` del modo `fake` de L1D-164 y `scripts/smoke/compose-smoke.sh` (paso AC-6) | modificado | `tests/support/service_jwt.py`; clave de L1D-165 en el smoke |
| `clinical-api/src/config.ts` | modificado | `SERVICE_JWT_TTL_SECONDS`, `SERVICE_JWT_PRIVATE_KEY_FILE` |
| `infra/docker/.env.example` | modificado | claves nuevas, sin valores secretos |

Reglas extraídas con nombre propio: `vigencia_dentro_del_maximo()` (AC-5) y
`construirCabecerasSalientes()` (AC-4, sin cabeceras entrantes).

## Tests

| AC | Disciplina | Nivel | Cómo |
|---|---|---|---|
| AC-1 | TDD estricto (autorización) | integración, Pytest + `TestClient` | token válido del *builder*; `200` con `LLM_PROVIDER=fake` o puerto falso |
| AC-2 | TDD estricto | integración | 6 variantes parametrizadas; `401` validado contra el spec; contador del LLM falso = 0 |
| AC-3 | TDD estricto | integración | cookie `oncolens_session` sintética sin JWT → `401`; `caplog` sin el valor de la cookie |
| AC-4 | TDD estricto | integración, Vitest + MSW | MSW captura el request hacia `http://rag-orchestrator:8000/rag/query`: `Authorization: Bearer` verificable con la pública efímera, sin `Cookie` aunque el llamador la pase |
| AC-5 | TDD estricto | integración | `exp = iat + 3600` firmado correctamente → `401` motivo `vida_maxima` |
| AC-6 | TDD estricto (llamada saliente) + test después (generación) | integración, Vitest + MSW; `contracts:generate:check` | `createRagOrchestratorClient()` llama a `ragQuery` con el `X-Request-Deadline` del llamador: MSW ve ese valor exacto y `Authorization: Bearer`; sin el parámetro la cabecera no aparece; un SDK editado a mano hace fallar `contracts:generate:check` |

Reloj congelado (`freezegun` / `vi.useFakeTimers` + `Clock` inyectado). Sin datos de paciente.
