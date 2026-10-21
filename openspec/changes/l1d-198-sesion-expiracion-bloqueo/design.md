# Design — l1d-198-sesion-expiracion-bloqueo

## Contexto

`apps/clinical-api/src/modules/auth/` (L1D-197) ya crea la sesión con `expires_at = ahora +
SESSION_TTL_HOURS` y `resolverSesion()` rechaza sesiones revocadas, caducadas o de cuentas no
activas. `auth.user` ya tiene `failed_login_count` y `locked_until`; `auth.session` ya tiene
`last_seen_at` y `revoked`. El contrato ya declara `POST /platform/auth/logout` (`204`, `401`,
`x-permission: session:logout`). No hace falta migración.

## Decisiones

- **D1 · Inactividad en el guard.** `resolverSesion()` rechaza si `ahora − last_seen_at ≥
  SESSION_IDLE_MINUTES` (límite excluyente, como `expires_at`) y, si acepta, actualiza
  `last_seen_at = ahora`. Se extrae `sesionVigente(sesion, ahora, config)` (regla pura, unitaria).
  La actualización se hace solo si `ahora − last_seen_at ≥ SESSION_TOUCH_SECONDS` (por defecto 60)
  para no escribir en cada request; `SESSION_TOUCH_SECONDS < SESSION_IDLE_MINUTES·60` se valida al
  arrancar. Reloj inyectado (`Clock`).
- **D2 · Logout.** `POST /platform/auth/logout` (detrás del guard, `authorize('session:logout')` de
  L1D-199 si ya está; si no, basta el guard, ambos roles lo tienen) marca `revoked = true` en la
  sesión del token presentado, responde `204` y borra la cookie (`Max-Age=0`). Idempotente: una
  sesión ya revocada no llega al controlador (el guard responde `401`).
- **D3 · Bloqueo por cuenta.** Cada fallo de contraseña incrementa `failed_login_count`; al llegar a
  `LOGIN_MAX_FAILED_ATTEMPTS` (5) fija `locked_until = ahora + LOGIN_LOCKOUT_MINUTES` (15). Con
  `locked_until > ahora` el login no verifica la contraseña de forma observable: ejecuta el mismo
  *hash* señuelo de US-211 (tiempo uniforme) y responde el `401` genérico. Un login correcto fuera
  del bloqueo pone el contador a 0 y `locked_until = null`. Se extrae
  `cuentaBloqueada(usuario, ahora)`.
- **D4 · Bloqueo por IP (asumido, AC-3).** Puerto `RegistroDeIntentosPorIp` con adaptador **en
  memoria** (ventana deslizante por IP, reloj inyectado), mismos umbral y plazo que por cuenta. Se
  descarta una tabla nueva: el esquema está congelado (OL-01) y `clinical-api` corre como una sola
  instancia en el MVP; un reinicio vacía el registro (riesgo aceptado, se anota en el PR).
- **D4b · IP del cliente (Gate 1).** `web` **descarta** cualquier `X-Forwarded-For` que traiga el
  cliente y escribe en su lugar la IP real del socket (`request` del Route Handler / cliente BFF);
  nunca concatena la cabecera recibida. `clinical-api` configura `trust proxy` con
  `TRUST_PROXY_HOPS`: **1** mientras no haya proxy delante de `web` (la red `clinical-net` solo la
  alcanza `web`); pasará a **2** cuando llegue el proxy HTTPS del S6 (entonces `web` confiará en el
  salto de ese proxy, decisión de ese change). Test en `web` con la cabecera falsificada. La IP no se
  registra en *logs* (NFR-11): el registro la guarda solo en memoria y nunca la escribe; los *logs*
  llevan `motivo=bloqueo_ip` sin la dirección.
- **D4c · Cómo escribe `web` la IP del socket (hallazgo de la implementación).** Next 16 completa
  `x-forwarded-for` con `??=` (`base-server.js`): si el cliente envía la cabecera, el Route Handler nunca ve la
  dirección del socket y no distingue una cabecera falsificada de la real. Decisión: `apps/web/instrumentation.ts`
  (`register()` solo bajo `NEXT_RUNTIME === 'nodejs'`) instala `fijarIpDelSocket()` (`lib/server/fijar-ip-del-socket.ts`),
  que envuelve el evento `request` de `http.Server` y sobrescribe `x-forwarded-for` con `socket.remoteAddress` antes de que
  Next lea la cabecera; es idempotente (marca con `Symbol.for`). `ipDelCliente()` (`lib/server/ip-del-cliente.ts`) toma el
  último valor, lo valida con `net.isIP` y lo reenvía como único `X-Forwarded-For` hacia `clinical-api`; si no es una IP no
  reenvía nada. Verificado con el servidor real (`next start` y el `server.js` standalone de la imagen, puertos efímeros;
  `tests/build/ip-del-socket.test.ts`) y con `next dev` (Turbopack). Alternativa descartada: confiar en el último salto
  del `X-Forwarded-For` recibido sin reescribirlo (sin proxy delante el último salto lo controla el cliente). Límite: con
  el proxy HTTPS del S6 delante, el socket será el del proxy; entonces `fijarIpDelSocket` deberá leer el salto que ese
  proxy escriba y `TRUST_PROXY_HOPS` (2) decide cuántos saltos valen en `clinical-api`: ambos cambios van juntos en ese change.
- **D5 · Respuesta única.** Cuenta bloqueada, IP bloqueada, contraseña errónea y cuenta no activa
  producen el mismo `401 ErrorCredencialesInvalidas` y el mismo tiempo aproximado (US-211 AC-2,
  `[Pre-S1 resp. 29]`). El motivo solo aparece en el log como `motivo` cerrado
  (`credenciales | bloqueo_cuenta | bloqueo_ip`), sin correo.
- **D7 · Baja o bloqueo concurrentes con el login.** `crearSesion` inserta solo si la cuenta sigue `activo`
  (`INSERT … SELECT … WHERE EXISTS (… FOR SHARE)`): una baja (L1D-199, que revoca las sesiones en su transacción) que
  llegue entre la verificación de la contraseña y la inserción espera al `FOR SHARE` y, si gana, el login responde el
  mismo `401`; si gana el login, la baja revoca la sesión recién creada. El guard rechaza además toda cuenta no activa. El
  bloqueo por intentos (cuenta o IP) no revoca sesiones ya abiertas: solo impide iniciar nuevas.
- **D6 · `web`.** `app/api/auth/logout/route.ts` (`server-only`) aplica `verificarOrigen()` de
  L1D-139 antes de contactar a `clinical-api` (`403 PERMISO_DENEGADO` y la sesión sigue activa,
  AC-5), llama a `logout` del SDK generado y retransmite el borrado de la cookie. Cuando cualquier
  llamada del BFF recibe `401` en una **página**, se redirige a `/login?motivo=expirada` sin renderizar
  datos; `motivo` solo admite `expirada | cerrada` (US-211 AC-4, S2-01).

- **D8 · Desviación de S2-00: cabecera sin correo.** El diseño muestra el correo del usuario junto a «Cerrar sesión», pero el
  contrato no tiene un GET de sesión/usuario y el login responde `204` sin cuerpo: `web` no tiene de dónde leerlo sin un
  endpoint nuevo. La cabecera del S2 lleva solo el botón. Propuesta: `GET /platform/auth/session` aditivo con su propio change
  contract-first, o diferir; entonces `AppHeader` recibe el correo como prop opcional. Adiciones de este change fuera de D6:
  clave `app.errorCerrarSesion` (aviso `role="alert"` si el logout falla por red o 5xx; el médico sigue en la página) y la
  redirección del panel de análisis ante `401` a `/login?motivo=expirada` (antes `/login`). E2E: Compose pasa
  `SESSION_IDLE_MINUTES` y `SESSION_TOUCH_SECONDS` a `clinical-api` y `scripts/e2e/ejecutar.sh` los fija en 1 minuto y 10 s.

- **D9 · IP del socket firmada (Gate 2, privacy Mayor 2) y decisión pendiente del logout.** D4c dejaba un hueco: Next
  escucha y encola peticiones antes de que `instrumentation.register()` envuelva `Server.prototype.emit`, y esas
  primeras peticiones llegaban con el `X-Forwarded-For` falsificado (6 de 6 arranques). Corrección que falla cerrado y no
  depende del arranque: el wrapper escribe la IP del socket en `x-oncolens-ip-del-socket` firmada con un secreto
  aleatorio de proceso (`lib/server/cabecera-ip-del-socket.ts`, compartido por `globalThis`) y `ipDelCliente()` solo
  acepta ese valor y nunca lee `X-Forwarded-For`. Sin firma (cola de arranque, cliente directo) el login responde `502`
  propio con `motivo=sin_ip_del_cliente` y no llama a `clinical-api`; el logout no necesita la IP y no la reenvía.
  Sustituye la parte de D4c que decía que `ipDelCliente` tomaba el último valor del `X-Forwarded-For`. Con el proxy del
  S6 habrá que firmar el salto que ese proxy escriba, no el del socket.
  **Pendiente (no implementado):** que el BFF de logout emita también la cookie de borrado cuando `clinical-api` responde
  `401` (sesión ya expirada). Hoy el `401` se retransmite sin `Set-Cookie` y un test existente lo afirma
  (`reexpone el 401 … sin cookies`, US-044 AC-1); cambiarlo es decisión del usuario, sin impacto de contrato.

Alternativas baratas: guardar la inactividad en un JWT (descartado: la cookie es opaca por ADR-1);
bloqueo por IP en PostgreSQL (descartado: esquema congelado y una sola instancia).

## Privacidad y ownership

- **Fronteras:** navegador → `web` (cookie) → `clinical-api`. Nada cruza a `rag-orchestrator`; la
  sesión del doctor sigue sin llegar a Backend 2 (sin cambios en el cliente de L1D-105).
- **Datos:** solo usuarios sintéticos de FX-T4a-b. No se toca identidad de pacientes (RN-10/RN-11
  no aplican). `rag-orchestrator` no toca datos clínicos ni `clinical-minio` (sin cambios).
- **Logs:** nunca correo, contraseña, token, cookie ni IP; solo `event`, `resultado`, `motivo`,
  `traceId`.

### Seguridad web

- Validación: el logout no tiene cuerpo; `verificarOrigen()` y `Content-Type` no aplican al cuerpo,
  sí el `Origin`.
- `NEXT_PUBLIC_`: ninguna nueva. Módulos `server-only`: el Route Handler y el lector de sesión.
- Render: solo textos fijos de `messages/es.json` (`login.sesionExpirada`, `login.sesionCerrada`,
  `app.cerrarSesion`); el valor de `motivo` nunca se pinta, se mapea a una clave cerrada.
- CSP y cabeceras: sin cambios (US-216, S6). Dependencias nuevas: ninguna.

## Contratos

- **Proveedor:** `clinical-api`; **consumidor:** `web` (SDK generado de `packages/api-contracts`).
- **Sin diff del spec:** `POST /platform/auth/logout` (`204`, `401`) ya existe. Ejemplos: ninguno
  nuevo (el `204` no tiene cuerpo; el `401` usa `error-no-autenticado.json`). `contracts:check` y
  `contracts:breaking` en verde sin cambios; `info.version` no se toca. Compatible con ADR-26.
- Las respuestas propias del Route Handler de `web` (`403` por `Origin`) se validan contra
  `ErrorPermisoDenegado` con `assertMatchesSpec()`.
- `X-Forwarded-For` de `web` a `clinical-api` es transporte fijado desde el socket (D4c), consumido solo por
  `trust proxy` / `TRUST_PROXY_HOPS`; no es parámetro del contrato (ADR-26 no aplica). El hook entrante que lo escribe
  (`fijar-ip-del-socket.ts`, `import … from 'node:http'`) no es un cliente saliente y figura en `TRANSPORTES_DECLARADOS`
  de `assertConsumersUseGeneratedClients`.

## Componentes y patrones

- `molecules/BotonCerrarSesion` (`'use client'`, formulario que hace `POST /api/auth/logout`) dentro
  de la cabecera autenticada `AppHeader` (L1D-194), que sigue siendo RSC; el correo del usuario lo
  lee el BFF en el servidor (sin endpoint nuevo, S2-00).
- `molecules/AvisoDeSesion` (RSC) en `/login`: mapea `motivo` a `role="status"`.
- Sin patrones nuevos (sin hooks ni providers): un solo consumidor cada uno.

## Dependencias y colaboradores

- `auth.service.ts`: recibe `RegistroDeIntentosPorIp` (puerto) y `Clock` por la *factory*; reglas
  extraídas `sesionVigente()`, `cuentaBloqueada()`, `registrarFallo()`.
- `auth.repository.ts`: `revocarSesion(tokenHash)`, `tocarSesion(id, ahora)`,
  `registrarFalloDeLogin(userId, ahora, config)`, `reiniciarFallos(userId)`.
- `infrastructure/intentos-por-ip.memoria.ts`: adaptador en memoria (ventana deslizante de los últimos `LOGIN_MAX_FAILED_ATTEMPTS` fallos por IP, barrido de IP vencidas, forma IPv4 y IPv4 mapeada tratadas como la misma).
- Log del login: `motivo` (`bloqueo_cuenta` | `bloqueo_ip`) solo acompaña a los rechazos por bloqueo; el rechazo por credenciales conserva `event`, `resultado`, `traceId` (US-211 AC-6).
- `src/config/index.ts` (`SesionConfig`, `readSesionConfig`): `SESSION_IDLE_MINUTES`, `SESSION_TOUCH_SECONDS`, `LOGIN_MAX_FAILED_ATTEMPTS`,
  `LOGIN_LOCKOUT_MINUTES`, `TRUST_PROXY_HOPS` (RN-22). Las claves nuevas se documentan en el PR para
  `infra/docker/.env.example` (no se editan en este change de planificación).
- `web`: `lib/server/auth-logout.ts`, `app/api/auth/logout/route.ts`, redirección en el lector de
  respuestas del BFF.

## Tests

Supertest + PostgreSQL real con reloj falso (AC-1…AC-4), Vitest + MSW en `web` (AC-4 redirección,
AC-5), Playwright (AC-4, cuando exista el job de E2E). Respuestas validadas contra el spec.

## Riesgos

- Registro por IP en memoria: se pierde al reiniciar y no escala a varias réplicas (anotado).
- `trust proxy` mal configurado permitiría falsificar la IP con `X-Forwarded-For`: `web` reescribe
  la cabecera con la IP del socket (test con cabecera falsificada) y `clinical-api` confía solo en
  `TRUST_PROXY_HOPS` saltos (test). Al llegar el proxy HTTPS del S6 hay que subir a 2.
