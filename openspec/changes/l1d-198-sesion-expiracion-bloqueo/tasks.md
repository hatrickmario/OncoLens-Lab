# Tasks — l1d-198-sesion-expiracion-bloqueo

## 1. contratos

- [x] 1.1 (exento: sin cambio de spec) Confirmar con `contracts:check` y `contracts:breaking` que `POST /platform/auth/logout` (`204`, `401`, `x-permission: session:logout`) ya existe y que el SDK generado expone `logout`; sin editar el spec ni `info.version`. Si faltara algo, detenerse y aplicar la skill `sync-contracts` (commit `contract(L1D-198)`).

## 2. clinical-platform

- [x] 2.1 (test después: configuración) `src/config/index.ts` (`readSesionConfig`) con `SESSION_IDLE_MINUTES`, `SESSION_TOUCH_SECONDS`, `LOGIN_MAX_FAILED_ATTEMPTS`, `LOGIN_LOCKOUT_MINUTES`, `TRUST_PROXY_HOPS` (1 sin proxy delante de `web`; 2 con el proxy HTTPS del S6, anotado en el PR) y validación al arrancar (`SESSION_TOUCH_SECONDS < SESSION_IDLE_MINUTES·60`; el error nombra la clave, nunca su valor); claves listadas en el PR para `infra/docker/.env.example` (RN-22).
- [x] 2.2 (TDD estricto) Test de aceptación en rojo: "revoca la sesión y la cookie responde 401 en GET /platform/patients cuando el doctor cierra sesión [US-044 AC-1]" y "responde 401 sin modificar sesiones cuando el logout llega sin sesión" · integración Supertest + PostgreSQL real, respuestas validadas contra el spec. Esqueleto del controlador. Commit `test(L1D-198)`.
- [x] 2.3 (TDD estricto) Implementar `POST /platform/auth/logout` (`revocarSesion()`, borrado de cookie). Commit `feat(L1D-198)`.
- [x] 2.4 (TDD estricto) Test de aceptación en rojo: "responde el 401 genérico sin crear sesión con la contraseña correcta durante el bloqueo y 204 al vencer el plazo [US-044 AC-2]" · integración con reloj falso. Commit `test(L1D-198)`.
- [x] 2.5 (TDD estricto) Implementar el bloqueo por cuenta; extraer `cuentaBloqueada()` y `registrarFallo()` con unitarios uno a uno; mismo señuelo de tiempo de US-211. Commit `feat(L1D-198)`.
- [x] 2.6 (TDD estricto) Test de aceptación en rojo: "responde el 401 genérico a una IP con cinco fallos aunque las credenciales de otra cuenta sean correctas [US-044 AC-3]" y "atribuye el intento al salto de confianza e ignora el X-Forwarded-For inyectado" · integración con reloj falso y lectura del log (sin IP ni correo). Commit `test(L1D-198)`.
- [x] 2.7 (TDD estricto) Implementar el puerto `RegistroDeIntentosPorIp` y su adaptador en memoria (`infrastructure/intentos-por-ip.memoria.ts`, reloj inyectado), `trust proxy` con `TRUST_PROXY_HOPS`. Commit `feat(L1D-198)`.
- [x] 2.8 (TDD estricto) Test de aceptación en rojo: "responde 401 con last_seen_at de hace 31 minutos o expires_at vencido y 200 actualizando last_seen_at con 29 minutos [US-044 AC-4]" · integración con reloj falso sobre una ruta protegida de `/platform/*` (la ficha de L1D-72 si ya está en `main`). Commit `test(L1D-198)`.
- [x] 2.9 (TDD estricto) Implementar en `resolverSesion()` la inactividad y el toque de `last_seen_at`; extraer `sesionVigente()`. Commit `feat(L1D-198)`.
- [x] 2.10 (TDD estricto) Test de aceptación en rojo en `web`: "responde 403 PERMISO_DENEGADO sin request a clinical-api y la sesión sigue activa cuando el Origin del logout es ajeno [US-044 AC-5]" y "retransmite el 204 y borra la cookie cuando clinical-api acepta el logout [US-044 AC-1]" · Vitest + MSW desde `contracts/examples/`. y "reenvía a clinical-api la IP del socket y descarta el X-Forwarded-For falsificado por el cliente [US-044 AC-3]". Esqueleto de `app/api/auth/logout/route.ts`. Commit `test(L1D-198)`.
- [x] 2.11 (TDD estricto) Implementar `app/api/auth/logout/route.ts` (`server-only`, `verificarOrigen()` de L1D-139, SDK generado) y la escritura de `X-Forwarded-For` en el cliente de `web` hacia `clinical-api` con la IP real del socket, descartando la cabecera recibida del cliente. Commit `feat(L1D-198)`.
- [x] 2.12 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-198)`.

## 3. frontend

- [x] 3.1 (Test del AC primero) Tests en rojo: "muestra Tu sesión expiró en role=status cuando /login llega con motivo=expirada y Cerraste sesión con motivo=cerrada; no muestra nada con otro valor [US-044 AC-4] [US-044 AC-1]", "redirige a /login?motivo=expirada sin renderizar datos cuando el BFF recibe 401 en una página [US-044 AC-4]" y "el botón Cerrar sesión de la cabecera envía POST /api/auth/logout y lleva a /login?motivo=cerrada [US-044 AC-1]" · Vitest + Testing Library + MSW. Commit `test(L1D-198)`.
- [x] 3.2 Implementar `BotonCerrarSesion` en `AppHeader`, `AvisoDeSesion` en `/login` y las claves `login.sesionExpirada`, `login.sesionCerrada`, `app.cerrarSesion` en `messages/es.json`. Commit `feat(L1D-198)`. DESVIACIÓN (D8): la cabecera de S2-00 va sin correo en el S2: el contrato no tiene GET de sesión/usuario y el login responde `204` sin cuerpo; propuesta: `GET /platform/auth/session` aditivo con su propio change contract-first, o diferir.
- [x] 3.3 (Test del AC primero) E2E Playwright "una sesión inactiva más de SESSION_IDLE_MINUTES lleva al login sin datos del paciente [US-044 AC-4]" contra Compose con seed sintético; corre cuando exista el job de E2E de ARR-02 resto (L1D-278); si no está en `main` al cerrar el change, la tarea se difiere a L1D-278 con su ID.
- [x] 3.4 Loop visual (visual-check): estados, consola sin errores ni violaciones de CSP, red solo /api/* sin PII en URLs, accesibilidad y teclado, rendimiento y capturas a 375 y 1280 px; cada fallo se convierte primero en un test en rojo.
- [x] 3.5 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-198)`.

## 4. cierre

- [x] 4.1 `openspec validate l1d-198-sesion-expiracion-bloqueo --strict`, tests de `clinical-api` y `web` en verde.
