# Design — l1d-199-usuarios-cli-rbac

## Contexto

`auth.role`, `auth.permission` y `auth.role_permission` existen desde la migración inicial y el seed
(`prisma/seed/roles.ts`, `MATRIZ_DE_PERMISOS`) siembra `doctor` y `admin`. El guard de L1D-197
adjunta `userId` y `rol`; L1D-103 bloquea el análisis con `soloDoctor` (`rol !== 'doctor'` → `403`).
El contrato declara `x-permission` en cada operación (lista = basta uno) y `x-view-by-permission`.

## Decisiones

- **D1 · Permisos, no roles.** El guard resuelve los permisos del rol en la misma consulta de la
  sesión y adjunta `request.sesion.permisos: ReadonlySet<string>`. `authorize(...codigos)` responde
  `403 PERMISO_DENEGADO` si la sesión no tiene **ninguno** (semántica de lista del contrato) y se
  monta en cada ruta con el código literal de su `x-permission`. Una función no comprueba dos veces
  el mismo permiso: el controlador del análisis deja de mirar el rol.
- **D2 · Coherencia ruta ↔ contrato.** Un test recorre las operaciones del spec y comprueba que cada
  ruta montada declara en `authorize()` exactamente su `x-permission` (registro de rutas con
  metadatos `{ operationId, permisos }`). Sirve al AC-3 y al AC-6 y cubre por construcción las rutas
  que lleguen después (vista de caso S3, documentos, seguimiento S5).
- **D3 · Vista por permiso.** `vistaSegunPermiso(sesion, { 'clinical:read': fnDoctor, default:
  fnAdmin })` elige el mapeo; el *repository* del admin no consulta tablas clínicas (mínimo
  privilegio por construcción, no solo por filtrado).
- **D4 · CLI.** `src/cli/oncolens.ts` (bin `oncolens` del contenedor, con
  `node:util.parseArgs`, sin dependencia nueva). Reutiliza el *service* de usuarios
  (`users.service.ts`, *factory* con repository y `createPasswordHasher()` de L1D-197) — sin ruta
  HTTP. Contraseña por `stdin` (sin eco si es TTY); nunca en argumentos (quedarían en `ps` y en el
  historial). Salida: solo `id`, correo y rol. Código de salida ≠ 0 con mensaje sin valores sensibles.
- **D5 · Baja.** `deactivate` cambia `account_status` y revoca en la misma transacción todas las
  sesiones del usuario (`revocarSesiones(userId)`, asumido en el AC-2, coherente con
  `data-model` "desactivado revoca las sesiones vivas").
- **D6 · Rol de prueba `lectura`.** Lo crea un *fixture* de tests (`tests/support/roles.ts`) con solo
  `patients:lookup`; no entra en el seed ni en la matriz. FX-T4a-b dice `patients:read`, código que
  no existe en la matriz: se usa `patients:lookup` (ver Pendiente).

Alternativas: ruta HTTP de administración (descartada: V-02, superficie de ataque); `vi.mock` del
guard en tests (prohibido: mocks solo en bordes).

## Privacidad y ownership

- **Fronteras:** la CLI corre dentro del contenedor de `clinical-api` contra su PostgreSQL; nada
  cruza a `web` ni a `rag-orchestrator`. En el AC-3 el `403` ocurre antes del cliente de L1D-105:
  `rag-orchestrator` no recibe ninguna llamada ni datos clínicos.
- **Admin sin datos clínicos (E-04):** la matriz ya lo fija; D2 lo verifica contra el contrato.
- **Secretos (NFR-11):** la contraseña no aparece en la salida ni en los *logs*; contraseñas de test
  desde variables de entorno (`TEST_*_PASSWORD`), nunca en el repo (RN-14).
- `rag-orchestrator` no toca datos clínicos ni `clinical-minio` (sin cambios).

## Contratos

- **Sin diff del spec:** los `x-permission` ya existen y la gestión de usuarios no tiene API
  (V-02). `contracts:check` en verde; `info.version` sin cambios. El `403` usa
  `error-permiso-denegado.json`.

## Dependencias y colaboradores

- `src/middleware/authorize.ts` (nuevo), `src/middleware/auth.ts` (adjunta permisos),
  `src/modules/auth/auth.repository.ts` (`permisosDelRol`, `revocarSesiones`),
  `src/modules/users/users.{service,repository,schema}.ts` (nuevo), `src/cli/oncolens.ts` (nuevo),
  `src/modules/evidence-analysis/*.controller.ts` (sustituye `soloDoctor`).
- El *service* de usuarios depende de puertos (`UsersRepository`, `PasswordHasher`, `Clock`,
  `GeneradorDeIds`), nunca de Prisma directo.

## Tests

Vitest de integración de la CLI contra PostgreSQL real (AC-1, AC-2, AC-5) ejecutando el binario
con tiempo máximo explícito; Supertest (AC-2, AC-3, AC-4, AC-6) con MSW hacia `rag-orchestrator`
contando llamadas.

## Pendiente de definir

- FX-T4a-b nombra `patients:read` para `lector@test.local`; la matriz usa `patients:lookup`. Se
  propone corregir el fixture en el backlog (dueño: sesión principal; afecta: AC-3 y FX-T4a-b).
- AC-4 y la parte de ficha del AC-6 dependen de `GET /platform/patients/{id}`: con L1D-72 sin
  mergear, quedan como `Regresión [US-045 AC-4]` y `Regresión [US-045 AC-6]` en
  `l1d-72-ficha-minima-paciente`, que ya los tiene como escenarios y tareas (admin → `200
  PatientAdminSummary`, nunca `403`, porque `getPatient` lleva `x-permission: [clinical:read,
  patients:lookup]`).

## Adiciones aceptadas en la implementación

Aceptadas por el orquestador del sprint (no cambian el alcance):

- **`full_name` provisional = correo.** `auth.user.full_name` es NOT NULL y la CLI no recibe nombre. Un `--name`
  opcional queda para cuando haya pantalla de administración (Post-MVP).
- **`revocarSesiones(db, userId)`** se exporta como función desde `src/modules/auth/auth.repository.ts` (firma exacta:
  `(db: Consultador, userId: string) => Promise<void>`). `l1d-198` la reutiliza sin redefinirla; recibe el consultador
  para participar en la transacción de quien la llama (la baja la ejecuta en la misma transacción que `account_status`).
- **Sesión con permisos.** `SesionAutenticada` gana `permisos: ReadonlySet<string>` y `rol` pasa a `string`; el guard los
  resuelve en la misma consulta de la sesión (`array_agg` sobre `role_permission`). El 403 lo emite el manejador final
  de errores (`PermisoDenegadoError`); `exigirRolDoctor` y `soloDoctor` desaparecen (D1).
- **Registro de rutas = stack de Express.** En vez de un registro paralelo, `authorize()` deja los códigos asociados al
  manejador (`permisosExigidos()`) y el test de coherencia recorre los routers montados y casa método + ruta con el
  spec. Los routers protegidos deben ser planos (rutas directas), no anidados.
- **Preload `tests/support/resolver-postgres.mjs`** (solo tests): los procesos reales de la CLI conectan con TLS
  verificado contra la CA; el certificado solo tiene SAN `postgres`, así que el preload resuelve ese nombre a loopback.
  La verificación TLS no se relaja.
- **Soporte de tests y configuración:** glob `tests/integration/usuarios/**` en `vitest.integration.config.ts` (y su
  exclusión en `vitest.config.ts`), `bin`/scripts `oncolens` en `apps/clinical-api/package.json` (+ 3 líneas del
  `package-lock.json`), y `normalizarCorreo` exportada de `auth.service.ts` para no duplicar la regla en `users`.
- **Comando extra:** `oncolens users deactivate` es idempotente (repite la revocación si ya estaba desactivado).

## Gate 2: correcciones y deuda registrada

Aplicadas: el verificador de rutas (`tests/support/rutas-y-contrato.ts`) ya no omite en silencio routers anidados ni
`use('/ruta', fn)` y exige `authorize()` antes de cualquier parser de cuerpo; `createUsersRepository` solo acepta una
conexión única (`Client` o `PoolClient`, no `Pool`) y `revocarSesiones` documenta que no abre transacción; la lista de
rutas protegidas sale de una sola función (`componerRutasProtegidas`, usada por `server.ts` y por los tests);
`normalizarCorreo` vive en `auth/correo.ts` y `UsersService.crear` normaliza; la matriz sembrada se compara de forma
exacta con `data-model.md` §8 para `doctor` y `admin`.

Deuda y preguntas abiertas (no bloquean esta historia):

- **Política de longitud/complejidad de contraseña** (privacy P1): hoy solo se rechaza la vacía. Pregunta para el S6
  (US-044, bloqueo y política de credenciales).
- **Carrera login/baja** (privacy #2): un login concurrente a la baja puede crear una sesión tras la revocación; la
  cuenta `desactivado` la invalida en el siguiente `resolverSesion` (solo `activo` mantiene sesión), así que el riesgo
  queda acotado a esa ventana. Pendiente de cerrar con un bloqueo de fila si US-044 lo pide.
- **`traceId` en la CLI** (privacy #4): las líneas de log de la CLI no llevan `traceId`; se añade cuando haya auditoría
  de la CLI (S6, US-148 / US-222).
- **Permisos de ejecución del bin** (P2): el `bin` `oncolens` se invoca con `npm run oncolens`/`node`; fijar `chmod +x`
  en la imagen queda para la historia de la imagen del contenedor.
- **Pregunta de planning (P3-1):** el CI de `clinical-api` no ejecuta `tsc --noEmit`; el test de tipos del `Pool` solo lo
  verifica `npm run typecheck`. Propuesta: añadir `tsc --noEmit` al job `build-test` (no se toca `ci.yml` en esta historia).
- **Límite conocido del verificador de rutas:** un parser de cuerpo envuelto en una lambda propia no se reconoce por nombre.
