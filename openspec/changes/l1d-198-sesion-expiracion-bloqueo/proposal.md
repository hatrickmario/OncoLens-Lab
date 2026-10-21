# Proposal — l1d-198-sesion-expiracion-bloqueo

## Trazabilidad

L1D-198 · US-044 · FEAT-T4a (L1D-40) · Sprint 2 · Estimación **3** · HU-01 (escenarios 3 y 4) ·
FR-01 · SEG-01 · AC-T4.1 (FR-01) · RN-22 · readme §2.5 · PRD §10 (CSRF) · US-044 AC-1…AC-5 ·
diseño `docs/ux/S2/pantallas-s2.md` S2-00 y S2-01 · `backlog/sprints/S2-refinamiento.md`

## Por qué

US-211 (L1D-197, S1) dejó el login, la cookie opaca y el guard. Falta lo que impide que un equipo
desatendido o un ataque de contraseñas exponga datos clínicos: cerrar sesión, expiración por
inactividad además del TTL absoluto y bloqueo por intentos fallidos (por cuenta y por IP).

## Qué cambia

- `POST /platform/auth/logout` en `clinical-api` revoca la `Session` (`revoked = true`) y responde
  `204`; Route Handler `apps/web/app/api/auth/logout/route.ts` con `verificarOrigen()` (CSRF).
- El guard (`resolverSesion`) aplica, además de `expires_at`, la inactividad
  `SESSION_IDLE_MINUTES` y actualiza `last_seen_at` en cada request válida.
- Bloqueo por cuenta (`auth.user.failed_login_count` + `locked_until`) y por IP, ambos con
  `LOGIN_MAX_FAILED_ATTEMPTS` y `LOGIN_LOCKOUT_MINUTES` en configuración; la respuesta es siempre el
  `401` genérico de US-211 AC-2 (el bloqueo no se revela).
- `web`: botón "Cerrar sesión" en la cabecera autenticada (S2-00), redirección a
  `/login?motivo=expirada` cuando `clinical-api` responde `401`, y avisos `role="status"` de
  `?motivo=expirada|cerrada` en `/login` (S2-01).

## Capacidades

- `auth-session` (ADDED; la capacidad la introduce `l1d-197-sesion-login-guard`, aún sin archivar).

## Bounded contexts

clinical-platform (módulo `auth`, guard, Route Handler de logout) · frontend (cabecera, avisos del login).

## Dependencias

- ↪ `l1d-197-sesion-login-guard` (login, cookie, guard, `verificarOrigen()`, `messages/es.json`).
- ↪ `l1d-199-usuarios-cli-rbac`: la historia lo lista (US-045); solo comparte el módulo `auth`
  (la baja revoca sesiones con el mismo método `revocarSesiones()`). Si este change llega antes,
  crea el método y 199 lo reutiliza.
- E2E del AC-4: Playwright contra Compose depende de ARR-02 resto (`l1d-278-e2e-ci-login-tailwind`, job de E2E) y de la ficha
  (`GET /platform/patients/{id}`, `l1d-72-ficha-minima-paciente` · US-051). Mientras no estén, el AC-4 se cubre en
  integración sobre cualquier ruta protegida de `/platform/*` y en `web` con MSW.

## Fuera de alcance

- Login, cookie y guard básicos (US-211). Pantalla de administración de usuarios (US-045, CLI).
- Migración de `/login` a Tailwind v4 + shadcn/ui (ARR-02 AC-3, L1D-278).
- Cabeceras de seguridad y CSP de `web` (US-216, S6).
- Rate limiting general por endpoint (RN-30): el bloqueo por intentos es específico del login.
