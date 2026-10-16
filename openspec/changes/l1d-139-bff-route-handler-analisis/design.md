# Design — l1d-139-bff-route-handler-analisis

## Contexto

US-060 crea el único camino del navegador hacia el análisis de evidencia: un Route Handler de `web`
(readme §2.1, "Route Handler, no Server Action"; CLAUDE.md) que hace de proxy fino hacia
`POST /platform/evidence-analyses` de `clinical-api`. El contrato está congelado (US-033) y sus
códigos los fijan L1D-103 (`401`, `404`, `422`, `502` provisional) y L1D-104 (`500 ERROR_INTERNO`,
`502`, `504`); `429` con `Retry-After` llega con US-056 (S4) pero el proxy ya debe retransmitirlo
(AC-4). La sesión es la cookie opaca de L1D-197. Decisiones del Gate 1 aplicadas
(`backlog/sprints/S1-plan.md` §2): `[S1 resp. 13]` (SDK generado), `[S1 resp. 14a]` (`verificarOrigen()`
compartido con el login), `[S1 resp. 17]` (*helper* de validación) y `[S1 resp. 18]` (dueño del
ejemplo del request y respuestas propias del BFF).

```
navegador ──POST /api/evidence-analyses (Origin, Cookie: oncolens_session)──▶ web Route Handler
   │                                    ¿Origin == WEB_ALLOWED_ORIGIN? no/ausente → 403 PERMISO_DENEGADO (0 requests salientes)
   │                                    sí ──SDK createEvidenceAnalysis (fetch inyectable)──▶ clinical-api
   │                                             (cuerpo tal cual, solo Cookie oncolens_session,     (guard → gateway;
   │                                              sin X-Trace-Id del navegador)                       genera su traceId)
   ◀── mismo status + mismo JSON + Retry-After / X-Trace-Id de clinical-api ──────────────────────────┘
   ◀── 502 ERROR_SERVICIO_IA propio del BFF si clinical-api es inalcanzable
clinical-api ──Authorization: Bearer <jwt servicio> (sin Cookie, L1D-105)──▶ rag-orchestrator
```

## Decisiones

**D1 · Proxy transparente, sin reinterpretar.** El Route Handler no valida el cuerpo con Zod ni
traduce errores: lee el cuerpo como texto y lo reenvía con `Content-Type: application/json`; devuelve
el `status` y el cuerpo de `clinical-api` byte a byte (AC-1, AC-4). Con el SDK (D7) se consigue con
opciones por llamada: `bodySerializer` identidad sobre el texto leído, `parseAs: 'text'` y
`throwOnError: false`, y el `status` se toma de `response.status`. La validación del borde es de
`clinical-api` (`422 CUERPO_INVALIDO`, L1D-103) y la del formulario es del panel con el schema Zod
generado de `EvidenceAnalysisRequest` (L1D-140). Así existe una sola fuente de `422` y el panel
recibe siempre una forma del contrato. Descartado: validar también en el Route Handler (dos `422`
con riesgo de divergir del proveedor y de romper "mismo status") y mapear códigos en `web` (lo
prohíbe AC-4).

**D2 · Cabeceras en lista blanca, en ambos sentidos.** Hacia `clinical-api`: `Content-Type`,
`Cookie` reconstruida **solo** con `oncolens_session` (las demás cookies del navegador no salen de
`web`). Nunca `Host`, `Origin`, `Authorization`, `X-Forwarded-*`, el `X-Trace-Id` del navegador ni, en el
S1, `Idempotency-Key` (Gate 1, 2ª vuelta): `clinical-api` no lo implementa en el S1 (FEAT-06a: "no se
implementa en el S1") y reenviar un valor arbitrario del cliente a un servicio que aún no lo valida solo
abre una entrada sin dueño; cuando llegue la historia que lo implemente, se añadirá a la lista blanca
**solo si es un UUID** (por regresión de este requisito). Sobre el `X-Trace-Id`: `clinical-api` genera su propio `traceId` (L1D-103) y un valor elegido por
el cliente no debe entrar en sus logs ni en su auditoría. Hacia el navegador: `Content-Type`,
`Retry-After` (AC-4) y el `X-Trace-Id` **de la respuesta de `clinical-api`**; nunca `Set-Cookie`,
`Server` ni cabeceras internas. Extraído como `cabecerasHaciaClinicalApi(request)` (la usa el `fetch`
inyectado de D7, que construye las cabeceras desde cero) y `cabecerasHaciaNavegador(respuesta)`. La
lectura de la cookie es propia de este change (`cabeceraCookieDeSesion()` en
`lib/server/clinical-api.ts`); el `tieneCookieDeSesion()` de `proxy.ts` (L1D-197) es otro uso y no se
fusiona.

**D3 · Verificación de `Origin` dentro del Route Handler, extraída.** `verificarOrigen(request,
config)` compara el `Origin` con `WEB_ALLOWED_ORIGIN` (comparación exacta de esquema, host y puerto,
sin comodines) **antes** de leer el cuerpo o la cookie; si no coincide, responde `403` y no hay
`fetch` saliente (AC-2). Un `POST` sin cabecera `Origin` también se rechaza (aprobado, `[S1 resp. 18]`: los
navegadores la envían siempre en `fetch` `POST`). El `403` es una **respuesta propia del BFF**
declarada en la spec `web-bff` `[S1 resp. 18]`: cuerpo `ErrorPermisoDenegado` del contrato
(`{ error: "PERMISO_DENEGADO", message, traceId }`, ya dentro del enum del `403` de
`createEvidenceAnalysis`), con `traceId` del generador inyectado, para que el panel lo trate con el
tipo generado; se registra una línea con `event`, `status = 403` y `motivo=origen` (sin el `Origin`
recibido). `verificarOrigen(request, config)` se **exporta** desde `lib/server/origen.ts` y lo
reutiliza el Route Handler de login de L1D-197 `[S1 resp. 14a]`; un `middleware/origin-check` común
(readme §2.3) se introduce con el tercer consumidor (YAGNI). Descartado: hacerlo en `proxy.ts` (su
`matcher` es de páginas y mezclaría guard de sesión con CSRF).

**D4 · URL interna solo en el servidor.** `CLINICAL_API_URL` se lee en `lib/server/clinical-api.ts`,
que importa `server-only`; nunca con prefijo `NEXT_PUBLIC_` ni en `next.config` `env`. AC-5 se
verifica con un test de build: `next build` con un valor centinela sintético
(`http://clinical-api-centinela-l1d139.internal:3999`) y búsqueda del literal en
`apps/web/.next/static/**`; debe dar cero coincidencias. El mismo test falla si el módulo se importa
desde un componente cliente (error de `server-only` en build).

**D5 · Errores de transporte.** Si `clinical-api` no responde (conexión rechazada o *timeout*
`WEB_UPSTREAM_TIMEOUT_MS`, que debe ser mayor que el *deadline* de `clinical-api` hacia
`rag-orchestrator` para que el `504` de L1D-104 llegue antes), el Route Handler responde `502` con el
cuerpo `ErrorServicioIa` genérico del contrato (`error = ERROR_SERVICIO_IA`) y `traceId` generado, sin
mensaje del error de red ni la URL interna. Es la otra **respuesta propia del BFF** declarada en la
spec `web-bff` `[S1 resp. 18]` (aceptado aunque el caído sea `clinical-api` y no la IA: es el único
`502` del contrato de la operación). Se registra `event`, `status = 502` y
`motivo=clinical_api_inalcanzable`. Nunca devuelve un cuerpo parcial.

**D6 · Sin estado ni logs de contenido.** El Route Handler no guarda nada ni registra el cuerpo, la
pregunta, la cookie ni la respuesta; solo `event`, `status`, `traceId` y duración. Usa
`runtime = 'nodejs'` y `dynamic = 'force-dynamic'` (sin caché de Next.js).

**D7 · SDK generado de `clinical-api` con `fetch` inyectable `[S1 resp. 13]`.** No hay cliente
propio: `lib/server/clinical-api.ts` exporta `crearSdkClinicalApi(config, { request, fetch })`, que
devuelve `createClient({ baseUrl: CLINICAL_API_URL, fetch: crearFetchHaciaClinicalApi(...) })` del SDK
de `packages/api-contracts/src/client-web/clinical-api/` (L1D-105, design D4). `crearFetchHaciaClinicalApi`
recibe el `fetch` real (inyectable; MSW lo intercepta en los tests), aplica el *timeout*
`WEB_UPSTREAM_TIMEOUT_MS` con `AbortSignal` y construye las cabeceras salientes desde cero con
`cabecerasHaciaClinicalApi()` (D2), descartando cualquier otra que el llamador pasara. El Route
Handler llama a `createEvidenceAnalysis({ client, body, headers })` con las opciones de D1. El login
de L1D-197 reutiliza `crearFetchHaciaClinicalApi()` sin cookie entrante. Descartado: el
`crearClienteClinicalApi(config, fetch)` escrito a mano de la versión anterior (diverge del
contrato).

**D7b · Salida del SDK para web (decidido por el humano, 2026-10-20).** Turbopack (Next 16) no resuelve las
importaciones `.js` hacia `.ts` del SDK de L1D-105; `generate.mjs` emite una segunda salida del mismo spec en
`packages/api-contracts/src/client-web/clinical-api/` (sin extensión) y `web` importa **solo** de ahí
(`.../client-web/clinical-api` y `.../client-web/clinical-api/client`). Para L1D-140 y L1D-197: mismo import.
El SDK `src/client/clinical-api/` (con `.js`) queda sin consumidores en `web` (deuda propuesta: retirarlo si
tampoco lo usa `clinical-api`).

**D8 · `401` retransmitido; la redirección es del cliente.** Un `401 NO_AUTENTICADO` de
`clinical-api` se devuelve con el mismo status y cuerpo (AC-1/AC-4, "mismo status"): un Route Handler
de `fetch` JSON no redirige. El cliente del panel (L1D-140) navega a `/login` al recibirlo. Es la
lectura que fija la spec `auth-session` de L1D-197 ("Guard de páginas en web"), corregida en el
Gate 1 para decir lo mismo.

## Privacidad y ownership

- **Fronteras:** navegador → `web` (cuerpo `EvidenceAnalysisRequest`: `patientId` UUID, `query`
  libre, filtros; cookie `oncolens_session`) → `clinical-api` por `clinical-net`, mismo cuerpo y solo
  esa cookie. `web` no toca PostgreSQL, MinIO ni `rag-orchestrator`, y no tiene ruta de red hacia
  `ai-net` (L1D-164).
- **Desidentificación (RN-11):** no ocurre aquí; la hace `clinical-api` antes de llamar a
  `rag-orchestrator` (L1D-203). `web` no añade ni quita datos del cuerpo. La identidad del paciente no
  viaja en este request (solo el UUID en el cuerpo, nunca en la URL).
- **Sesión ≠ credencial de servicio:** la cookie termina en `clinical-api`; hacia
  `rag-orchestrator` solo viaja el JWT de servicio (L1D-105). Este change no toca `rag-orchestrator`,
  que sigue sin acceso a datos clínicos ni a `clinical-minio`.
- **Logs:** sin cuerpo, pregunta, cookie ni respuesta (D6); la redacción de `cookie` del logger de
  `web` es de L1D-197.
- **Datos:** solo sintéticos (seed de L1D-169, ejemplos `SINT-` de `contracts/examples/`) (RN-13,
  RN-14).

### Seguridad web

- **Validación:** el Route Handler no valida el cuerpo (D1); el panel valida con el schema Zod
  generado de `EvidenceAnalysisRequest` (L1D-140) y `clinical-api` con el mismo schema en su borde.
- **CSRF:** `SameSite=Strict` (L1D-197) + verificación de `Origin` (D3), SEG-01.
- **`NEXT_PUBLIC_`:** ninguna nueva. `WEB_ALLOWED_ORIGIN`, `WEB_UPSTREAM_TIMEOUT_MS` y
  `CLINICAL_API_URL` son de servidor.
- **Módulos `server-only`:** `route.ts`, `lib/server/clinical-api.ts`, `lib/server/origen.ts`.
- **Render:** no renderiza nada; el texto del LLM/corpus lo pinta el panel (L1D-140) como texto.
- **CSP y cabeceras:** sin cambios (US-216); el Route Handler es de mismo origen (`connect-src 'self'`).
- **Dependencias nuevas:** ninguna (`fetch` nativo de Node).

## Contratos

- **Proveedor:** `clinical-api` (`apps/clinical-api/openapi.yaml`, `createEvidenceAnalysis`).
  **Consumidor:** `web` (este Route Handler) y, a través de él, el panel (L1D-140), con los tipos
  generados de `packages/api-contracts`.
- **Diff propuesto del `openapi.yaml`:** ninguno. `POST /platform/evidence-analyses` ya declara
  `200 EvidenceAnalysis`, `401`, `403`, `404`, `422`, `429` (`LimiteGeneracion` con cabecera
  `Retry-After`), `502`, `503`, `504` (y `500 ErrorInterno` lo añade L1D-104). `info.version` no se
  toca.
- **Ejemplos:** MSW se construye desde `contracts/examples/`: `con-evidencia-s1.json` (`200`),
  `error-no-autenticado.json` (`401`, retransmitido, D8),
  `error-cola-inferencia-llena.json` (`429`, con `Retry-After: 30` añadido en el handler),
  `error-deadline-vencido.json` (`504`), `error-permiso-denegado.json` (forma del `403` propio) y
  `error-servicio-ia.json` (`502` propio). **Nuevo** (no normativo, sintético; **dueño único**
  `[S1 resp. 18]`, L1D-140 y los demás lo consumen sin crearlo): `evidence-analysis-request.json` con
  `patientId` del paciente semilla (a), `query` sintética y `sourcesSelected` con las tres fuentes en
  `true`, mapeado en `index.json` a `#/paths/~1platform~1evidence-analyses/post/requestBody`.
- **Compatibilidad:** sin cambio incompatible (oasdiff vacío); ADR-26 respetado.
- **Verificación del proveedor:** no aplica a `web` (no es proveedor); los tests validan que lo que
  devuelve el Route Handler es idéntico a la respuesta simulada desde los ejemplos del contrato, y
  los cuerpos propios (`403`, `502`) con `assertMatchesSpec('clinical-api', <puntero>, body)` del
  *helper* de L1D-164 (D5b, `[S1 resp. 17]`) contra `ErrorPermisoDenegado` y `ErrorServicioIa`.
- El Route Handler no tiene spec OpenAPI propio: reexpone la forma del contrato de `clinical-api`;
  sus dos respuestas propias se declaran como requisitos de la spec `web-bff` `[S1 resp. 18]`.

## Componentes y patrones

- No hay componentes de UI. `route.ts` (handler `POST`), `lib/server/clinical-api.ts` (SDK generado +
  `fetch` inyectado), `lib/server/origen.ts` (`verificarOrigen`, exportado para L1D-197). Sin hooks, providers ni patrones nuevos (un solo
  consumidor). Referencia de pantalla: `docs/ux/S1/pantallas-s1.md` S1-08/09 (el botón "Analizar
  evidencia" llama a `POST /api/evidence-analyses`); sin desviación.

## Dependencias y colaboradores

| Módulo | Crea/mod. | Depende de | Reglas extraídas |
|---|---|---|---|
| `apps/web/app/api/evidence-analyses/route.ts` | crea | `verificarOrigen`, `crearSdkClinicalApi`, `createEvidenceAnalysis` del SDK generado (L1D-105) | — |
| `apps/web/lib/server/origen.ts` | crea | config (`WEB_ALLOWED_ORIGIN`), logger | `verificarOrigen()` (SEG-01), exportado; lo reutiliza L1D-197 |
| `apps/web/lib/server/clinical-api.ts` | crea | SDK de `packages/api-contracts/src/client-web/clinical-api/`, `fetch` inyectable, config (`CLINICAL_API_URL`, `WEB_UPSTREAM_TIMEOUT_MS`), generador de `traceId` | `crearFetchHaciaClinicalApi()`, `cabeceraCookieDeSesion()`, `cabecerasHaciaClinicalApi()`, `cabecerasHaciaNavegador()`, `respuestaDeFalloDeTransporte()` |
| `apps/web/lib/server/config.ts` | mod. | entorno | claves nuevas |
| `apps/web/tests/build/url-interna.test.ts` | crea | `next build` | — |
| `e2e/analisis-red.spec.ts` | crea | Compose, panel de L1D-140 | — |

El handler recibe sus colaboradores por *factory*; `fetch` se intercepta con MSW en los tests (borde
HTTP saliente), nunca con `vi.mock` de módulos propios.

## Tests

- **Integración de `web`** (Vitest + MSW con `onUnhandledRequest: 'error'`, handlers desde
  `contracts/examples/`): AC-1 (cuerpo y cookie reenviados, `X-Trace-Id` del navegador no
  reenviado, mismo status y JSON), AC-2 (`403` por `Origin` distinto y ausente, contador de requests a
  `clinical-api` = 0, log `motivo=origen`, cuerpo validado con `assertMatchesSpec()`), AC-4 (`429` con
  `Retry-After: 30`, `504` y `401` idénticos) y el `502` propio (validado con `assertMatchesSpec()`).
  `traceId` y reloj inyectados.
- **Build** (test después: configuración): AC-5.
- **E2E** (Playwright contra Compose, perfil de test, `LLM_PROVIDER=fake` `[S1 resp. 7]`): AC-3,
  login de `doc1@test.local`, `/pacientes/<id semilla (a)>/analisis` `[S1 resp. 4]`, envío del
  formulario del panel (L1D-140) y `page.on('request')` registrando todas las URLs.

## Riesgos

- **Orden de la oleada:** el E2E de AC-3 necesita el panel (L1D-140) y el gateway real (L1D-103,
  L1D-104). Mitigación: AC-1, AC-2, AC-4 y AC-5 no dependen de ellos; el E2E se escribe aquí y queda en
  rojo en la rama hasta que estén en `main` en la misma oleada, nunca con `.skip` (si no caben, se
  mueve a L1D-140 con `Test-Removal:`).
- **`WEB_ALLOWED_ORIGIN` mal configurado** bloquea todo análisis con `403`: el humo de Compose
  (L1D-164) y el E2E lo detectan; el valor por defecto de `.env.example` es el de `WEB_BIND_ADDRESS` +
  `WEB_PORT`.
- **Duplicación con el Route Handler de login** (L1D-197): mitigada porque el login reutiliza
  `verificarOrigen()` y `crearFetchHaciaClinicalApi()` de este change `[S1 resp. 14a]`, `[S1 resp. 13]`.
- **Orden con L1D-197:** su Route Handler de login importa `lib/server/origen.ts` y
  `lib/server/clinical-api.ts`; este change debe estar en `main` antes de esas tareas (las de
  `clinical-api` de L1D-197 no esperan). El E2E de AC-3 de este change necesita el login de L1D-197:
  se cierra en la misma oleada.

## Pendiente de definir

Ninguno. Los cuatro pendientes de la versión anterior se resolvieron en el Gate 1 (usuario,
2026-10-14, `backlog/sprints/S1-plan.md` §2):

1. `POST` sin `Origin` → `403` (aprobado, `[S1 resp. 18]`; D3).
2. Cuerpo del `403` por origen: `PERMISO_DENEGADO` del contrato, sin código propio ni cambio del
   `openapi.yaml`, declarado como respuesta propia del BFF en `web-bff` con log `motivo=origen`
   (`[S1 resp. 18]`; D3).
3. Fallo de transporte: `502 ERROR_SERVICIO_IA` genérico, declarado en `web-bff` (`[S1 resp. 18]`; D5).
4. `401`: se retransmite y el cliente del panel (L1D-140) redirige; la spec `auth-session` de
   L1D-197 quedó alineada (D8).
5. `Idempotency-Key` (Gate 1, 2ª vuelta): **no se reenvía en el S1** (D2); se añadirá, validado como
   UUID, con la historia que lo implemente en `clinical-api`.
