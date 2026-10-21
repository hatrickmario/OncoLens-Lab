## ADDED Requirements

### Requirement: Alta de usuarios por CLI con contraseña por stdin
`oncolens users create --email <correo> --role <rol>` MUST ejecutarse solo dentro del contenedor de `clinical-api` (sin ruta HTTP de gestión de usuarios), SHALL leer la contraseña de `stdin` y crear un `User` `activo` con `password_hash` Argon2id. `oncolens users set-role` SHALL cambiar el rol de un usuario existente.

#### Scenario: Un usuario creado por la CLI inicia sesión [US-045 AC-1] [readme §2.5] [V-02]
- **GIVEN** el contenedor de `clinical-api` con la BD de test
- **WHEN** se ejecuta `oncolens users create --email doc3@test.local --role doctor` con la contraseña por `stdin`
- **THEN** existe un `User` `activo` con `password_hash` que empieza por `$argon2id$`
- **AND** `POST /platform/auth/login` con esas credenciales responde `204`

#### Scenario: La CLI rechaza un rol inexistente [US-045 AC-1] (asumido)
- **WHEN** se ejecuta `oncolens users create --email doc4@test.local --role superusuario`
- **THEN** termina con código distinto de 0, no crea el usuario y el mensaje nombra la opción `--role`

### Requirement: La baja de un usuario revoca sus sesiones
`oncolens users deactivate --email <correo>` MUST poner `account_status = desactivado` y revocar en la misma transacción todas las sesiones vivas del usuario.

#### Scenario: Un usuario dado de baja pierde su sesión y no vuelve a entrar [US-045 AC-2] [readme §2.5] (asumido: la baja revoca las sesiones abiertas)
- **GIVEN** `doc3@test.local` con una sesión abierta
- **WHEN** se ejecuta `oncolens users deactivate --email doc3@test.local`
- **THEN** su siguiente request a `/platform/*` responde `401 NO_AUTENTICADO`
- **AND** un login nuevo con su contraseña correcta responde el `401` genérico de US-211 AC-2

### Requirement: Cada operación exige el permiso de su x-permission
Cada ruta de `/platform/*` salvo el login MUST montar `authorize()` con exactamente los códigos del `x-permission` de su operación en `apps/clinical-api/openapi.yaml` y SHALL responder `403 PERMISO_DENEGADO` antes de cualquier efecto si la sesión no tiene ninguno. Las operaciones con `x-view-by-permission` SHALL elegir la forma de la respuesta por permiso, no por rol.

#### Scenario: Un rol sin ai_analysis:create no llega a rag-orchestrator [US-045 AC-3] [ADR-1] [SEG-02]
- **GIVEN** `lector@test.local` con un rol de prueba que solo tiene `patients:lookup` (FX-T4a-b)
- **WHEN** hace `POST /platform/evidence-analyses` sobre el paciente semilla (a)
- **THEN** responde `403 PERMISO_DENEGADO`, validado contra el spec
- **AND** el cliente de `rag-orchestrator` (MSW) registra cero llamadas y `clinical.ai_analysis_record` no gana filas

#### Scenario: Toda ruta montada declara el permiso de su contrato [US-045 AC-3] [SEG-02]
- **WHEN** el test de coherencia recorre las operaciones del spec y el registro de rutas montadas
- **THEN** cada ruta montada usa en `authorize()` exactamente los códigos de su `x-permission`, y una ruta montada sin `authorize()` hace fallar el test nombrando su `operationId`

### Requirement: Sin autorización por paciente en el MVP
Con solo RBAC (P-02), un usuario con `clinical:read` MUST poder leer la ficha de cualquier paciente; la pertenencia al equipo tratante queda en el sistema externo.

#### Scenario: El doctor lee la ficha de cualquier paciente semilla [US-045 AC-4] [P-02] [HU-02]
- **GIVEN** `doc1@test.local`
- **WHEN** consulta `GET /platform/patients/{id}` de cada paciente semilla
- **THEN** todas responden `200` con la vista `doctor`, sin consultar `clinical.care_team_member`

### Requirement: La CLI no expone la contraseña
La contraseña MUST NOT aparecer en los argumentos, la salida estándar, la salida de error ni los *logs* de `clinical-api`.

#### Scenario: Ni la salida de la CLI ni los logs contienen la contraseña [US-045 AC-5] [NFR-11] (asumido)
- **GIVEN** la ejecución del alta de `doc3@test.local` con una contraseña `SINT-` aleatoria por `stdin`
- **WHEN** se leen su `stdout`, su `stderr` y los *logs* de `clinical-api`
- **THEN** ninguno contiene la contraseña

### Requirement: El administrador no recibe datos clínicos ni análisis
La matriz del rol `admin` MUST NOT incluir `clinical:read`, `documents:read`, `ai_analysis:create`, `ai_analysis:read` ni `follow_ups:*`; toda operación con esos permisos SHALL responder `403` al `admin`, y las operaciones con `x-view-by-permission` SHALL darle la vista `default` (`PatientAdminSummary`), nunca la del doctor.

#### Scenario: El admin recibe 403 en el análisis y en toda operación clínica montada [US-045 AC-6] [Pre-S1 resp. 17] [Pre-S1 resp. 27]
- **GIVEN** `admin@test.local` con sesión
- **WHEN** pide `POST /platform/evidence-analyses` y cada operación montada cuyo `x-permission` solo contiene códigos que el `admin` no tiene (excluidas las que listan `patients:lookup`, como `getPatient`, que le dan la vista `default`)
- **THEN** todas responden `403 PERMISO_DENEGADO` y `rag-orchestrator` no recibe llamadas

#### Scenario: La matriz sembrada del admin excluye los permisos clínicos [US-045 AC-6] [E-04]
- **WHEN** se leen los permisos del rol `admin` en `auth.role_permission`
- **THEN** no contienen `clinical:read`, `documents:read`, `ai_analysis:create`, `ai_analysis:read`, `follow_ups:create` ni `follow_ups:read`

#### Scenario: La vista por permiso elige PatientAdminSummary sin clinical:read [US-045 AC-6] [Pre-S1 resp. 27]
- **GIVEN** una sesión sin `clinical:read`
- **WHEN** `vistaSegunPermiso()` elige el mapeo de una operación con `x-view-by-permission`
- **THEN** usa el de `default` y el *repository* de esa vista no lee tablas de `clinical` ni de `identity` en claro (la verificación sobre `GET /platform/patients/{id}`, donde el admin recibe `200 PatientAdminSummary` y no `403`, es `Regresión [US-045 AC-6]` en `l1d-72-ficha-minima-paciente`)
