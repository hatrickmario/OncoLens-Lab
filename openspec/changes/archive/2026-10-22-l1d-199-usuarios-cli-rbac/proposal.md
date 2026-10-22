# Proposal — l1d-199-usuarios-cli-rbac

## Trazabilidad

L1D-199 · US-045 · FEAT-T4a (L1D-40) · Sprint 2 · Estimación **3** · FR-01 · SEG-02 (RBAC) ·
AC-T4.1 (PRD §11 #2, parte RBAC) · V-02 (usuarios por CLI) · ADR-1 · P-02 (sin autorización por
paciente en el MVP) · NFR-11 · `[Pre-S1 resp. 17]` · `[Pre-S1 resp. 27]` · E-04 (admin sin datos
clínicos) · US-045 AC-1…AC-6 · `backlog/sprints/S2-refinamiento.md`

## Por qué

En el S1 los usuarios los crea el seed y el único control de rol es `soloDoctor` en el análisis
(L1D-103). Hace falta dar de alta y de baja usuarios sin pantalla de administración (V-02) y que
cada ruta exija un **permiso** de la matriz de `docs/architecture/data-model.md` §8, no un rol
literal, con el `admin` sin acceso a datos clínicos ni a análisis.

## Qué cambia

- CLI `oncolens users create | deactivate | set-role` en `apps/clinical-api/src/cli/`, ejecutable
  solo dentro del contenedor; la contraseña entra por `stdin`, nunca por argumento.
- `deactivate` pone `account_status = desactivado` y revoca todas las sesiones vivas del usuario.
- Middleware `authorize(permiso)` que lee el `x-permission` de cada operación; el guard adjunta los
  permisos del rol a la sesión. `soloDoctor` de L1D-103 se reemplaza por
  `authorize('ai_analysis:create')` sin cambio de comportamiento para `doctor`/`admin`.
- Utilidad `vistaSegunPermiso()` para las operaciones con `x-view-by-permission` (la usan
  `GET /platform/patients/{id}` de L1D-72 y el listado de L1D-202).
- Test de matriz guiado por el contrato: toda operación montada cuyo `x-permission` no tiene el
  `admin` le responde `403`.

## Capacidades

- `auth-session` (ADDED).

## Bounded contexts

clinical-platform.

## Dependencias

- ↪ `l1d-197-sesion-login-guard` (guard, `createPasswordHasher()`, logger con redacción).
- Comparte `revocarSesiones(userId)` con `l1d-198-sesion-expiracion-bloqueo`: lo crea el primero que
  se mergee.
- 🔗 Consumida por `l1d-202-listado-busqueda-pacientes` y por el change `l1d-72-ficha-minima-paciente` (US-051):
  `authorize()` y `vistaSegunPermiso()`. La parte del AC-6 que exige `GET /platform/patients/{id}`
  (el admin recibe `200 PatientAdminSummary`, vista `default`, no `403`) y la del AC-4 (el doctor lee
  cualquier paciente semilla) se verifican en `l1d-72-ficha-minima-paciente` como `Regresión [US-045
  AC-6]` y `Regresión [US-045 AC-4]` (escenarios y tareas ya escritos allí).

## Fuera de alcance

- Pantalla de administración de usuarios; ruta HTTP de gestión de usuarios.
- Equipo tratante y autorización por paciente (FR-15, US-204, Post-MVP; P-02).
- Opt-out y descifrado auditado de la identidad por CLI (S6, US-148 / US-222).
