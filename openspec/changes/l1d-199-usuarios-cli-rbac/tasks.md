# Tasks — l1d-199-usuarios-cli-rbac

## 1. contratos

- [x] 1.1 (exento: sin cambio de spec) Confirmar con `contracts:check` que todas las operaciones declaran `x-permission` de la matriz y que existe `error-permiso-denegado.json`; sin editar el spec ni `info.version`.

## 2. clinical-platform

- [x] 2.1 (TDD estricto) Test de aceptación en rojo: "crea un usuario activo con hash Argon2id que inicia sesión con 204 cuando se ejecuta users create con la contraseña por stdin [US-045 AC-1]", "rechaza un rol inexistente con código distinto de 0" y "ni stdout, ni stderr, ni los logs contienen la contraseña [US-045 AC-5]" · integración Vitest que ejecuta el binario contra PostgreSQL real, **tiempo máximo explícito de 30 s** (proceso real). Esqueleto de `src/cli/oncolens.ts`. Commit `test(L1D-199)`.
- [x] 2.2 (TDD estricto) Implementar `users.{service,repository,schema}.ts` y `src/cli/oncolens.ts` (`node:util.parseArgs`, contraseña por `stdin`, `create` y `set-role`). Commit `feat(L1D-199)`.
- [x] 2.3 (TDD estricto) Test de aceptación en rojo: "la siguiente request responde 401 y un login nuevo el 401 genérico cuando se da de baja un usuario con sesión abierta [US-045 AC-2]" · integración (CLI + Supertest), tiempo máximo explícito de 30 s. Commit `test(L1D-199)`.
- [x] 2.4 (TDD estricto) Implementar `deactivate` con `revocarSesiones(userId)` en la misma transacción (reutilizarlo si `l1d-198` ya lo creó). Commit `feat(L1D-199)`.
- [x] 2.5 (TDD estricto) Test de aceptación en rojo: "responde 403 y rag-orchestrator registra cero llamadas cuando un rol sin ai_analysis:create pide un análisis [US-045 AC-3]", "toda ruta montada usa en authorize() exactamente el x-permission de su operación [US-045 AC-3]" y "el admin recibe 403 en el análisis y en toda operación clínica montada; su matriz sembrada excluye los permisos clínicos [US-045 AC-6]" · Supertest + PostgreSQL real + MSW hacia `rag-orchestrator`, respuestas validadas contra el spec; rol `lectura` creado por `tests/support/roles.ts`. Commit `test(L1D-199)`.
- [x] 2.6 (TDD estricto) Implementar `src/middleware/authorize.ts`, permisos en la sesión del guard (`permisosDelRol`), registro de rutas con `{ operationId, permisos }` y sustitución de `soloDoctor` por `authorize('ai_analysis:create')` sin cambiar los tests de L1D-103. Commit `feat(L1D-199)`.
- [x] 2.7 (TDD estricto) Test unitario y de integración en rojo: "vistaSegunPermiso elige default sin clinical:read [US-045 AC-6]" y "el doctor lee la ficha de cualquier paciente semilla con 200 sin consultar care_team_member [US-045 AC-4]" (este último sobre `GET /platform/patients/{id}` si `l1d-72-ficha-minima-paciente` ya está en `main`; si no, se difiere a ese change, tarea 2.2b, como `Regresión [US-045 AC-4]` y `Regresión [US-045 AC-6]` —admin → `200 PatientAdminSummary`— con el ID L1D-72). Commit `test(L1D-199)`.
  - **Diferido (L1D-72):** el test de integración de `GET /platform/patients/{id}` (`Regresión [US-045 AC-4]` y la parte de ficha de `Regresión [US-045 AC-6]`, admin → `200 PatientAdminSummary`) queda en `l1d-72-ficha-minima-paciente`, tarea 2.2b, porque ese endpoint aún no está en `main`. Aquí quedó hecho el unitario de `vistaSegunPermiso` (AC-6).
- [x] 2.8 (TDD estricto) Implementar `vistaSegunPermiso()`. Commit `feat(L1D-199)`.
- [x] 2.9 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-199)`.

## 3. cierre

- [ ] 3.1 `openspec validate l1d-199-usuarios-cli-rbac --strict` y tests de `clinical-api` en verde.
