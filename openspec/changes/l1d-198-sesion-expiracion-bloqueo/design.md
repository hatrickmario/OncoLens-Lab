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
- **D5 · Respuesta única.** Cuenta bloqueada, IP bloqueada, contraseña errónea y cuenta no activa
  producen el mismo `401 ErrorCredencialesInvalidas` y el mismo tiempo aproximado (US-211 AC-2,
  `[Pre-S1 resp. 29]`). El motivo solo aparece en el log como `motivo` cerrado
  (`credenciales | bloqueo_cuenta | bloqueo_ip`), sin correo.
- **D6 · `web`.** `app/api/auth/logout/route.ts` (`server-only`) aplica `verificarOrigen()` de
  L1D-139 antes de contactar a `clinical-api` (`403 PERMISO_DENEGADO` y la sesión sigue activa,
  AC-5), llama a `logout` del SDK generado y retransmite el borrado de la cookie. Cuando cualquier
  llamada del BFF recibe `401` en una **página**, se redirige a `/login?motivo=expirada` sin renderizar
  datos; `motivo` solo admite `expirada | cerrada` (US-211 AC-4, S2-01).

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
- `infrastructure/intentos-por-ip.memoria.ts`: adaptador en memoria.
- `config.ts`: `SESSION_IDLE_MINUTES`, `SESSION_TOUCH_SECONDS`, `LOGIN_MAX_FAILED_ATTEMPTS`,
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
