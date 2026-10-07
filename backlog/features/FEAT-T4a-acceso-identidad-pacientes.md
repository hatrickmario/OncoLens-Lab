# FEAT-T4a — Acceso, identidad cifrada, registro de pacientes y desidentificación

> Linear: [L1D-40](https://linear.app/l1der-lab-mjbc/issue/L1D-40)

**Talla:** XL · **Sprint:** 1 (US-049, US-211) · 2 (US-044, US-045, US-046, US-048, US-013 · ADR-40) · 4 (US-047) · 6 (US-050) · **Capacidad:** T-4 (AC-T4.1 parte S1, AC-T4.2/AC-T4.3 parte S1, AC-T4.5 parte S1) · **Recorrido principal:** sí
**Requisitos:** FR-01 (HU-01), FR-02 (HU-06), FR-03 manual (HU-07), FR-17 y RN-18 (campos, dueña), RN-10 (dueña), RN-11 (dueña), RN-12 (dueña), RN-16 (dueña), SEG-01, SEG-02 (RBAC), SEG-03, SEG-04 (parte S1), SEG-05, V-02 (usuarios por CLI)
**Evidencia:** [→ PRD §5 FR-01, FR-02, FR-03, FR-17], [→ PRD §6 RN-10, RN-11, RN-12, RN-13, RN-16, RN-18], [→ PRD §11 #1–#5], [→ PRD §18.4 AC-T4.1–AC-T4.5], [→ readme §5 HU-01], [→ readme §5.6 HU-06, HU-07], [→ readme §2.5], [→ readme §3.3 #1, #6, #14], [→ readme §6 OL-01, OL-02 (regla de proveedores), OL-03 (desidentificación, no-fuga)], [→ readme §6.1 #6], [→ backlog/01-requisitos.md §10 V-02, V-06; §15 P-02], [→ backlog/02-adrs.md ADR-40], [→ docs/AS-IS.md P12]
**Dependencias:** ↪ US-034, US-035, US-037 (plataforma) · ↪ US-038 (esquema) · ⛔ ADR-40 · escenario más probable (US-049 AC-1; ADR-40 cierra en el S2) · 🔗 Consumida por: US-039 (cifrado en el seed), US-051, US-052, FEAT-02b/02c/04/11c (regresión de RN-11) · 🔗 Regresión [FR-15] → US-204 (Post-MVP) · 🔗 Regresión [RN-15] → US-148 (activa desde S6)
**Valor:** el oncólogo solo confiará en una herramienta de IA sobre sus pacientes si la identidad de esos pacientes nunca sale del servicio clínico (P12: confianza = trazabilidad + control). Esta Feature entrega el acceso seguro, el registro y la búsqueda de pacientes con identidad cifrada, y garantiza desde el primer análisis que lo que viaja a la IA está desidentificado y que un dato real nunca toca la nube.
**Stories:** US-049, US-211 (8 puntos, S1) · US-044, US-045, US-046, US-048, US-013 · ADR-40 (21 puntos, S2) · US-047 (5 puntos, S4) · US-050 (3 puntos, S6) — total 37 puntos

> **Propuesta de división (talla XL).** Si DEC-03 confirma que el S1 no cabe, publicar como tres Features hermanas sin cambiar los IDs de las Stories: **T4a-1 Acceso** (US-211, US-044, US-045) · **T4a-2 Pacientes e identidad** (US-046, US-047, US-048) · **T4a-3 Desidentificación y proveedores** (US-013, US-049, US-050). T4a-3 y US-211 (sesión mínima del S1) son las únicas que bloquean el análisis (FEAT-06a, FEAT-10a); T4a-2 puede replegarse parcialmente al S2 usando el seed para la demo.

## Fixtures

- **FX-T4a-a · Paciente sintético con PII conocida.** `data_origin = sintetico`, `id_type = cedula_ciudadania`, `national_id = "52123456"`, `full_name = "Lucía Fernanda Rondón Peña"`, `birth_year = 1971`, `sex = F`, `agreement_reference = "CONV-TEST-01"`. `Diagnosis` activo: `cancer_type = mama`, `icd10_code = C50.9`, `TNM_8` `IIA`, `ECOG 1`, `diagnosed_at = hoy − 14 meses`. `Biomarker` HER2 `3+ (IHQ)`, `performed_at = hoy − 13 meses`, `review_status = verificado`. `ClinicalNote` (`nota_evolucion`, `hoy − 2 meses`): "Paciente Lucía Rondón (CC 52123456), tel. 3001234567, refiere dolor leve." `PriorTreatment` línea 1 "AC-T", inicio `hoy − 12 meses`, fin `hoy − 8 meses`, `end_reason = completado`. Fechas relativas a un reloj de test fijo.
- **FX-T4a-b · Usuarios.** `doc1@test.local` (rol `doctor`, activo), `admin@test.local` (rol `admin`, activo), `doc2@test.local` (rol `doctor`, `is_active = false`), `lector@test.local` (rol de prueba `lectura` con solo `patients:read`). Contraseñas desde variables de entorno de test.
- **FX-T4a-c · Paciente menor.** `data_origin = sintetico`, `id_type = tarjeta_identidad`, `national_id = "1098765432"`, `birth_year = año actual − 15`, `full_name = "Tomás Rondón"`; representante legal `madre`, `cedula_ciudadania` `"52123456"`, "Lucía Fernanda Rondón Peña".

---

## US-211 — Sesión mínima del S1: login con cookie opaca y guard en `web` y `clinical-api`

> Linear: [L1D-197](https://linear.app/l1der-lab-mjbc/issue/L1D-197)

`FEAT-T4a` · Sprint 1 · Estimación **3** · HU-01 (escenarios 1 y 2) · FR-01 (parte S1), SEG-01 · AC-T4.1 (FR-01, parte S1) · ↪ US-038 (tablas `auth.user` y `auth.session`), US-039 (usuarios de demo del seed) · 🔗 Relacionada: US-054 (JWT de servicio; AC-3 y AC-4 prueban el lado de `rag-orchestrator`) · 🔗 Consumida por: US-052, US-060, US-061 · 🔗 Ampliada por: US-044 (S2: expiración, cierre de sesión, bloqueo y CSRF del logout) · 🔗 Regresión [RN-23] → US-068 (textos de la página de login)

> **División de US-044 (usuario, 2026-10-07, `01-requisitos.md` §15 "Ajustes al slicing v2"):** esta historia adelanta al S1 el login, la cookie opaca y el guard para que el walking skeleton corra con una sesión real; la expiración, el cierre de sesión y el bloqueo por intentos quedan en US-044 (S2).

## Story
Como oncólogo, quiero iniciar sesión con mi correo y mi contraseña antes de pedir un
análisis, para que desde el primer sprint nadie sin sesión pueda ver datos de un
paciente ni invocar a la IA.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado `doc1@test.local` activo (FX-T4a-b, creado por el seed de
  US-039 con hash Argon2id) y un navegador con una cookie `oncolens_session` previa
  cualquiera, cuando envía credenciales correctas desde la página de login, entonces
  `web` llama a `POST /platform/auth/login` por su Route Handler, se crea una fila en
  `auth.session` con `token_hash` (el token en claro no aparece en ninguna columna), la
  respuesta es `200` con una cookie `oncolens_session` `HttpOnly`, `Secure`,
  `SameSite=Strict` de valor distinto a la previa, y el navegador queda en la ruta de
  inicio configurada. `[HU-01]` `[FR-01]` `[readme §2.5]`
- **AC-2 (borde · credenciales inválidas o usuario inactivo)** · Dados un correo
  registrado con contraseña incorrecta, un correo inexistente y `doc2@test.local`
  (`is_active = false`) con su contraseña correcta, cuando se envía cada login, entonces
  los tres responden `401` con el mismo cuerpo `{ error, message }` y `auth.session` no
  gana ninguna fila. `[HU-01]` `[FR-01]`
- **AC-3 (borde · guard en `clinical-api`)** · Dado un `POST /platform/evidence-analyses`
  sobre el paciente semilla (a) sin cookie, y otro con una cookie `oncolens_session` de
  valor aleatorio que no está en `auth.session`, cuando llegan a `clinical-api`,
  entonces ambos responden `401` antes del controlador y el cliente de
  `rag-orchestrator` registra cero llamadas. `[readme §2.5]` `[FR-01]` `[OL-03]`
- **AC-4 (borde · guard en `web`)** · Dado un navegador sin cookie de sesión, cuando abre
  `/patients/{id}/evidence` del paciente semilla (a), entonces `web` redirige a la página
  de login y el HTML servido no contiene ningún dato del paciente. `[FR-01]` `[readme §2.5]`
- **AC-5 (invariante · la sesión nunca llega a Backend 2)** · Dado un análisis
  solicitado con la cookie obtenida en el AC-1, cuando se capturan el request hacia
  `rag-orchestrator` y los logs de `rag-orchestrator`, entonces el valor del token de
  `oncolens_session` no aparece en ninguna cabecera, cuerpo ni línea de log, y el request
  lleva `Authorization: Bearer <jwt>` y ninguna cabecera `Cookie`. `[readme §2.5]`
  `[CLAUDE.md]` `[FR-01]`
- **AC-6 (borde · secretos fuera de los logs)** · Dados los logins de los AC-1 y AC-2,
  cuando se leen los logs de `web` y `clinical-api`, entonces no contienen la contraseña
  enviada ni el valor del token de sesión. `[NFR-11]` `[readme §2.5]`

## Contexto técnico
Route Handler `web/app/api/auth/login/route.ts` (nunca login directo a `clinical-api`,
HU-01) y página `web/app/login`; middleware de `web` que redirige a `/login` toda ruta
del dashboard sin cookie. En `clinical-api`, módulo `auth`
(`auth.controller|service|repository|schema.ts`): token opaco aleatorio de 256 bits, en
BD solo su hash; verificación Argon2id contra `password_hash` del seed. Guard
`middleware/auth` en todas las rutas `/platform/*` salvo el login: busca el hash del
token en `auth.session` (no revocada) y adjunta el usuario a la request. `expires_at`
se rellena con el TTL de configuración (US-037 `[RN-22]`), pero su aplicación en el
guard, la inactividad, el logout y el bloqueo son de US-044 (S2). La cookie no es un
JWT y nunca se reenvía más allá de `clinical-api` (el JWT de servicio es de US-054).
Tests: Supertest (AC-1 a AC-3, AC-6) con el seed de test; Playwright contra Compose en
perfil de test (AC-1 redirección y cookie, AC-4); integración con `rag-orchestrator`
simulado que captura el request y lectura de sus logs (AC-5).

## Non-goals
Expiración por TTL e inactividad, cierre de sesión, bloqueo por cuenta y por IP y
verificación de `Origin` del logout (US-044, S2). Gestión de usuarios por CLI (US-045,
S2): en el S1 los usuarios salen del seed. Listado de pacientes como destino del login
(US-048, S2).

## INVEST
**Small** ✓ un endpoint de login, un guard en cada backend y una página.
**Testable** ✓ seis escenarios automatizados con el seed de test, dos de ellos copiados de HU-01.

---

## US-044 — Expiración, cierre de sesión y bloqueo por intentos fallidos

> Linear: [L1D-198](https://linear.app/l1der-lab-mjbc/issue/L1D-198)

`FEAT-T4a` · Sprint 2 · Estimación **3** · HU-01 (escenarios 3 y 4) · FR-01, SEG-01 · AC-T4.1 (FR-01) · ↪ US-211 (login, cookie y guard), US-038, US-045

> **División (usuario, 2026-10-07):** el login, la cookie opaca, el guard y la invariante de que la sesión no llega a Backend 2 pasaron a US-211 (S1). Esta historia amplía esa sesión con lo restante de HU-01 y readme §2.5.

## Story
Como doctor, quiero que mi sesión expire por tiempo e inactividad, poder cerrarla y que
mi cuenta se bloquee ante intentos repetidos, para que un equipo desatendido o un
ataque de contraseñas no exponga datos clínicos.

## AC (Given/When/Then)
- **AC-1 (happy path · cierre de sesión)** · Dada una sesión activa de `doc1@test.local`
  (FX-T4a-b), cuando presiona "Cerrar sesión", entonces `POST /platform/auth/logout`
  deja la `Session` en `revoked = true` y una request posterior con esa cookie a
  `GET /platform/patients` responde `401`. `[HU-01]`
- **AC-2 (borde · bloqueo por cuenta)** · Dada una cuenta con 5 intentos fallidos
  consecutivos, cuando se intenta un login con la contraseña correcta antes de que
  pasen `LOGIN_LOCKOUT_MINUTES` (15) en el reloj de test, entonces responde el mismo
  `401` genérico de US-211 AC-2 y no se crea `Session`; y pasado el plazo, el mismo
  login responde `200`. `[HU-01]` `[FR-01]`
- **AC-3 (borde · bloqueo por IP)** · Dados 5 intentos fallidos desde la misma IP sobre
  cuentas distintas, cuando esa IP intenta un sexto login con credenciales correctas de
  otra cuenta dentro del plazo, entonces responde el mismo `401` genérico.
  `[readme §2.5]` (asumido: mismo umbral y plazo configurables que por cuenta)
- **AC-4 (borde · expiración configurable)** · Dados `SESSION_IDLE_MINUTES = 30` y
  `SESSION_TTL_HOURS = 8` en la configuración de test, y una sesión con `last_seen_at`
  hace 31 minutos o con `expires_at` vencido, cuando el navegador abre la ficha de un
  paciente, entonces `clinical-api` responde `401` y `web` redirige al login sin mostrar
  datos del paciente; y con `last_seen_at` hace 29 minutos, la ficha responde `200` y
  `last_seen_at` se actualiza. `[FR-01]` `[readme §2.5]` `[RN-22]`
- **AC-5 (borde · CSRF)** · Dado un `POST /api/auth/logout` a `web` con cabecera
  `Origin` distinta del origen configurado, cuando llega, entonces responde `403` y la
  sesión sigue activa. `[SEG-01]` `[PRD §10]`

## Contexto técnico
Amplía el módulo `auth` y el guard de US-211: el guard aplica `expires_at` e
inactividad y actualiza `last_seen_at`; `POST /platform/auth/logout` por el Route
Handler `web/app/api/auth/logout/route.ts`. Middleware `origin-check` en todos los Route
Handlers que mutan. TTL, inactividad, intentos y plazo de bloqueo en configuración
(US-037) `[RN-22]`. Tests: Supertest (AC-1 a AC-3) con reloj falso; Playwright contra
Compose (AC-4); test de Route Handler (AC-5).

## INVEST
**Small** ✓ un endpoint de logout, dos contadores de bloqueo y la expiración en un guard ya existente.
**Testable** ✓ cinco escenarios automatizados, dos de ellos copiados de HU-01.

---

## US-045 — Los usuarios se gestionan por CLI y cada acción exige el permiso de su rol

> Linear: [L1D-199](https://linear.app/l1der-lab-mjbc/issue/L1D-199)

`FEAT-T4a` · Sprint 2 · Estimación **3** · — (técnica, PRD §17; V-02) · FR-01, SEG-02 (RBAC) · AC-T4.1 (§11 #2, parte RBAC) · ↪ US-038 · 🔗 Regresión [FR-15] → US-204 (Post-MVP)

## Story
Como administrador, quiero dar de alta y de baja usuarios desde una CLI y que cada
acción del sistema exija un permiso del rol del usuario, para controlar quién usa
OncoLens sin construir una pantalla de administración en el S1.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado el contenedor de `clinical-api`, cuando se ejecuta
  `oncolens users create --email doc3@test.local --role doctor` con la contraseña por
  `stdin`, entonces existe un `User` activo con `password_hash` Argon2id (prefijo
  `$argon2id$`) y ese usuario inicia sesión con `200`. `[readme §2.5]` `[V-02]`
- **AC-2 (borde · baja)** · Dado `doc3@test.local` con una sesión abierta, cuando se
  ejecuta `oncolens users deactivate --email doc3@test.local`, entonces su siguiente
  request responde `401` y un login nuevo responde el `401` genérico. `[readme §2.5]`
  (asumido: la baja revoca las sesiones abiertas)
- **AC-3 (borde · permiso denegado)** · Dado `lector@test.local` (rol sin
  `ai_analysis:create`, FX-T4a-b), cuando hace `POST /platform/evidence-analyses` sobre
  el paciente semilla (a), entonces responde `403` y el cliente de `rag-orchestrator`
  registra cero llamadas. `[ADR-1]` `[SEG-02]`
- **AC-4 (borde · sin autorización por paciente en el MVP, P-02)** · Dado
  `doc1@test.local`, cuando consulta la ficha de cualquier paciente semilla, entonces
  responde `200`: el MVP solo aplica RBAC y la pertenencia al equipo tratante queda en
  el sistema externo. `[P-02]` `[HU-02]`
- **AC-5 (borde · secretos de la CLI)** · Dada la ejecución del AC-1, cuando se leen la
  salida de la CLI y los logs de `clinical-api`, entonces no contienen la contraseña.
  `[NFR-11]` (asumido)

## Contexto técnico
CLI en `apps/clinical-api/src/cli/` (comandos `users create | deactivate | set-role`),
ejecutable solo dentro del contenedor; no existe ruta HTTP de gestión de usuarios en el
MVP (workaround de V-02). Roles `doctor` y `admin` y su matriz de permisos
(`patients:read`, `patients:create`, `ai_analysis:create`, …) se crean en el seed de
roles de US-039; middleware `authorize(permission)` en cada ruta. Tests: Vitest para la
CLI (AC-1, AC-2, AC-5) y Supertest (AC-3, AC-4).

## Non-goals
Pantalla de administración de usuarios. Equipo tratante (FR-15, Post-MVP por P-02).

## INVEST
**Small** ✓ tres comandos de CLI y un middleware de permisos.
**Testable** ✓ cinco tests automatizados.

---

## US-046 — La identidad del paciente se guarda cifrada y se busca por índice ciego

> Linear: [L1D-200](https://linear.app/l1der-lab-mjbc/issue/L1D-200)

`FEAT-T4a` · Sprint 2 · Estimación **5** · — (técnica, PRD §17) · RN-10 (dueña), SEG-03 · AC-T4.1 (RN-10) · ↪ US-035, US-038 · 🔗 Consumida por: US-039, US-047, US-048, US-051

> **Dependencia hacia adelante (slicing v2, 2026-10-07):** el alta manual (US-047) llega en el S4: en el S2 "registrarlo" del AC-4 es guardarlo con `IdentityService` desde el fixture; US-047 amplía el AC-4 con el alta por API (`🔗 Regresión [RN-10] → US-046`). Esta historia amplía el seed de US-039 con las identidades cifradas (AC-6).

## Story
Como paciente representado por mi oncólogo, quiero que mi documento y mi nombre se
guarden cifrados y nunca salgan del servicio clínico, para que ni la IA, ni los logs,
ni la auditoría, ni el histórico de investigación puedan exponer mi identidad.

## AC (Given/When/Then)
- **AC-1 (happy path)** `[NFR-09]` · Dado FX-T4a-a guardado con `IdentityService`, cuando un test
  lee `identity.patient_identity` con SQL crudo, entonces `national_id_ciphertext` y
  `full_name_ciphertext` no contienen `52123456` ni `Rondón`, `key_version = 1`, y
  `IdentityService.decrypt` devuelve los valores originales. `[RN-10]` `[ADR-6]` `[OL-01]`
- **AC-2 (borde · índice ciego)** · Dados dos cálculos del índice para
  `cedula_ciudadania` + `52123456`, y uno para `52123457`, cuando se comparan, entonces
  los dos primeros son iguales y el tercero distinto, y ninguno contiene el número en
  claro. `[ADR-6]` `[FR-02]`
- **AC-3 (borde · manipulación)** · Dado un `national_id_ciphertext` alterado en un
  byte, cuando se consulta la ficha del paciente, entonces la respuesta es `500` con el
  cuerpo genérico `{ error, message }` sin datos del paciente, y el log registra el
  código `IDENTITY_INTEGRITY_ERROR` sin texto cifrado ni descifrado. (asumido)
- **AC-4 (invariante · no-fuga de identidad)** · Dado FX-T4a-a, después de registrarlo,
  consultar su ficha, buscarlo por documento y ejecutar un análisis, cuando un test
  busca `52123456`, `Lucía` y `Rondón` en los logs de los tres servicios, en todas las
  tablas de `audit`, `research` y `clinical.ai_analysis_record` (todas las columnas
  `jsonb` y de texto) y en el payload capturado hacia `rag-orchestrator`, entonces no
  aparece ninguno. `[RN-10]` `[NFR-11]` `[AC-T4.2]`
- **AC-5 (borde · rotación de clave)** · Dada una identidad cifrada con `key_version = 1`
  y `IDENTITY_KEY_VERSION=2` configurado, cuando se registra un paciente nuevo y se
  leen ambos, entonces el nuevo tiene `key_version = 2` y los dos se descifran. (asumido)
- **AC-6 (borde · identidades del seed)** · Dado el seed sintético de US-039 aplicado con
  esta historia, cuando un test lee `identity.patient_identity` con SQL crudo, entonces
  existen las identidades de los pacientes (a)–(e) con `id_type = sintetico`, ninguna
  columna contiene el número ni el nombre sintético en claro, y `IdentityService` los
  descifra. `[RN-10]` `[OL-01]`

## Contexto técnico
`apps/clinical-api/src/infrastructure/crypto/` (AES-256-GCM con nonce aleatorio por
campo; HMAC-SHA256 con clave separada). El índice se calcula sobre la forma normalizada
`id_type|issuing_country|numero` (sin separadores). Las claves solo se montan en
`clinical-api` (US-035 AC-2). AC-4 es el test exhaustivo de no-fuga de identidad (dueño
de RN-10): las historias que agreguen salidas nuevas (resumen, memoria, auditoría
completa) lo amplían con `🔗 Regresión [RN-10] → US-046`. Tests: Vitest unitarios
(AC-1, AC-2, AC-5) e integración Supertest con `rag-orchestrator` simulado que captura
el payload (AC-3, AC-4).

## INVEST
**Small** ✓ un servicio de cifrado y un test de no-fuga transversal.
**Testable** ✓ seis tests automatizados; AC-4 es un test de búsqueda de cadenas sobre fuentes enumeradas.

---

## US-047 — Registro manual de un paciente con identidad cifrada, convenio y retención

> Linear: [L1D-201](https://linear.app/l1der-lab-mjbc/issue/L1D-201)

`FEAT-T4a` · Sprint 4 · Estimación **5** · HU-07 · FR-03 (manual), FR-17, RN-16 (dueña), RN-18 (campos, dueña), RN-13 · AC-T4.5 (parte S1) · ↪ US-046 · 🔗 Regresión [RN-17] → US-198 (Post-MVP)

## Story
Como doctor, quiero registrar un paciente con un formulario mínimo, para empezar a
trabajar su caso sin capturar consentimientos ni datos personales que OncoLens no
necesita.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado `doc1@test.local`, cuando envía en el formulario de alta
  los datos de identificación de FX-T4a-a con `dataOrigin = sintetico` y
  `agreementReference = "CONV-TEST-01"`, entonces `POST /platform/patients` responde
  `201` con el `id`, existen `Patient`, `PatientIdentity` cifrada y un `CareEpisode`
  abierto, y el listado muestra al paciente con el distintivo "SINTÉTICO". `[HU-07]` `[FR-03]` `[FR-02]`
- **AC-2 (borde · identificación existente)** · Dado FX-T4a-a ya registrado, cuando se
  envía otra alta con el mismo tipo y número, entonces responde `409` con el `patientId`
  existente para abrirlo, y no se crea ningún `Patient`. `[FR-03]` `[HU-07]`
- **AC-3 (borde · menor sin representante)** · Dado el menor de FX-T4a-c sin
  representante en el body, cuando se envía el alta, entonces responde `422`; y con el
  representante, `201` con `LegalRepresentative` cifrado. `[RN-16]` `[AC-T4.5]` `[FR-03]`
- **AC-4 (borde · datos reales antes del gate)** · Dado `dataOrigin = real_identificado`
  con `REAL_IDENTIFIED_ENABLED=false`, cuando se envía el alta, entonces responde `422`
  con `error = "REAL_DATA_DISABLED"` y no se crea nada. `[RN-13]`
- **AC-5 (borde · real sin convenio)** · Dado `PatientRegistrationService` con un alta
  `real_identificado` sin `agreementReference` (test unitario, bandera simulada en
  `true`), cuando se valida, entonces devuelve el error `AGREEMENT_REQUIRED`, mapeado a
  `422`. `[FR-03]` `[RN-15]`
- **AC-6 (borde · sin consentimientos)** · Dado un body que incluye un campo
  `consents`, cuando se envía el alta, entonces responde `422` por campo no permitido
  (esquema Zod estricto). `[FR-03]` `[ADR-18]`
- **AC-7 (borde · retención)** · Dado un alta `sintetico`, cuando se guarda, entonces
  `retention_start`, `retention_until` y `retention_max` quedan nulos (la retención no
  aplica a sintéticos); y en el test unitario de `RetentionPolicy` con fecha de
  aceptación del convenio `2026-01-10` y primera cita `2026-02-01`, entonces
  `retention_start = 2026-01-10`, `retention_until = 2036-01-10` y
  `retention_max = 2046-01-10`. `[FR-17]` `[RN-18]` (asumido en el origen de las fechas)
  > Pendiente de definir en refinamiento (dueño: usuario · afecta: AC-7, body de `POST /platform/patients`): ¿de qué campos del alta salen la "fecha de aceptación del contrato" y la "fecha de la primera cita" que fijan `retention_start` en pacientes reales? readme §4.1 no los incluye.

## Contexto técnico
Módulo `patients` (`*.controller|service|repository|schema.ts`) + `identity`. Tipos de
documento habilitables por configuración: `cedula_ciudadania`, `tarjeta_identidad`,
`cedula_extranjeria`, `pasaporte` (país emisor solo en los dos últimos) `[FR-03]`.
`population` se deriva de `birth_year` y la edad de mayoría configurada (sin asumir
país). Página `web/app/(dashboard)/patients/new`. Tests: Supertest (AC-1 a AC-4, AC-6),
Vitest unitario (AC-5, AC-7) y Playwright (AC-1, distintivo).

## Non-goals
Registro asistido por OCR (FR-03, FEAT-01c, S6 si hay capacidad). Job de mayoría de edad (`si-hay-capacidad`; *workaround*: piloto "solo adultos", DEC-18). Captura
de consentimientos (fuera de OncoLens). Job de retención (Post-MVP).

## INVEST
**Small** ✓ un endpoint, un formulario y una regla de retención pura.
**Testable** ✓ siete tests automatizados.

---

## US-048 — Listado y búsqueda exacta de pacientes

> Linear: [L1D-202](https://linear.app/l1der-lab-mjbc/issue/L1D-202)

`FEAT-T4a` · Sprint 2 · Estimación **5** · HU-06 · FR-02, RN-10 · ↪ US-046, US-039 · 🔗 Regresión [FR-15] → US-204 (Post-MVP)

## Story
Como doctor, quiero buscar y listar pacientes, para llegar rápido a la ficha del
paciente que voy a analizar.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado el seed y `doc1@test.local`, cuando abre el listado,
  entonces `GET /platform/patients?page=1` devuelve los pacientes paginados según
  `PATIENTS_PAGE_SIZE`, cada uno con `dataOrigin` y `lifecycleStatus`, y la UI muestra
  "SINTÉTICO" en todos los pacientes semilla. `[HU-06]` `[FR-02]`
- **AC-2 (borde · búsqueda exacta por documento)** · Dado FX-T4a-a registrado, cuando
  se busca `idType=cedula_ciudadania&nationalId=52123456`, entonces el resultado es
  exactamente ese paciente; y con `nationalId=5212345` (número parcial), cero
  resultados. `[FR-02]` `[ADR-6]`
- **AC-3 (borde · búsqueda por nombre)** · Dado FX-T4a-a, cuando se busca
  `name=Rondón`, entonces el resultado contiene a FX-T4a-a, sin restringir por equipo
  tratante (P-02). `[FR-02]` `[P-02]` (asumido en la semántica de coincidencia)
  > Pendiente de definir en refinamiento (dueño: usuario · afecta: AC-3): ¿la búsqueda por nombre es exacta (nombre completo) o por coincidencia parcial sin tildes ni mayúsculas? FR-02 solo dice "búsqueda exacta" para el documento.
- **AC-4 (borde · filtros)** · Dado el seed, cuando se filtra `dataOrigin=real_identificado`,
  entonces la lista está vacía; y con `status=activo`, contiene los cinco pacientes
  semilla. `[FR-02]`
- **AC-5 (borde · documento en la URL)** · Dada la búsqueda del AC-2, cuando se leen los
  logs de acceso de `web` y `clinical-api`, entonces la URL registrada no contiene
  `52123456` (parámetros `nationalId` y `name` redactados). `[RN-10]` `[NFR-11]`
- **AC-6 (borde · sin sesión)** · Dada una request sin cookie de sesión, cuando se pide
  el listado, entonces responde `401` sin datos. `[FR-01]`

## Contexto técnico
Búsqueda por documento: se calcula el índice ciego del valor recibido y se busca por
igualdad (nunca se guarda el número en claro). Búsqueda por nombre: los nombres están
cifrados, así que se descifran en memoria sobre el conjunto paginable (aceptable para el
volumen del piloto: 10 usuarios); el resultado nunca se cachea. Página
`web/app/(dashboard)/patients`. Tests: Supertest (AC-1 a AC-4, AC-6), integración con
lectura de logs (AC-5) y Playwright (AC-1).

## INVEST
**Small** ✓ un endpoint de lectura con tres modos de búsqueda y una página.
**Testable** ✓ seis tests automatizados.

---

## US-049 — El contexto que sale hacia la IA está siempre desidentificado

> Linear: [L1D-203](https://linear.app/l1der-lab-mjbc/issue/L1D-203)

`FEAT-T4a` · Sprint 1 · Estimación **5** · HU-03 · RN-11 (dueña), SEG-04 (parte S1) · AC-06.2 (fechas relativas), AC-T4.2, AC-T4.3 (parte S1) · ⛔ ADR-40 (US-013, S2) · escenario más probable (opción A: coincidencia exacta con la identidad conocida + patrones configurables) · ↪ US-046 (S2), US-052 · 🔗 Medido en: US-072 (sensibilidad de PII, G-8)

> **Dependencia hacia adelante (slicing v2, 2026-10-07):** ADR-40 (US-013) y la identidad cifrada (US-046) llegan en el S2. En el S1 el detector implementa la opción A de ADR-40 detrás de un puerto (`PiiDetector`): si ADR-40 elige otra opción se sustituye el adapter y se re-estima. La coincidencia exacta del AC-1 usa la identidad de FX-T4a-a servida por un repositorio de identidad falso en el test; con US-046 lee la identidad descifrada.

## Story
Como oncólogo, quiero que todo lo que el sistema envía a la IA sobre mi paciente vaya
desidentificado, incluida mi propia pregunta, para poder usar la herramienta sin
arriesgar la identidad del paciente aunque escriba su nombre por error.

## AC (Given/When/Then)
- **AC-1 (happy path · pregunta con PII)** `[SEG-04]` · Dado FX-T4a-a y la pregunta "¿Qué opciones
  describe la evidencia para Lucía Rondón, CC 52123456, HER2 3+?", cuando se ejecuta el
  análisis, entonces el payload capturado hacia `rag-orchestrator` no contiene
  `52123456`, `Lucía`, `Rondón`, `3001234567`, el `patientId` ni `birthYear`, y la
  `query` enviada conserva "HER2 3+" con marcadores de enmascaramiento en lugar de los
  identificadores. `[RN-11]` `[OL-03]` `[AC-T4.3]`
- **AC-2 (borde · seudónimo por consulta)** · Dados dos análisis seguidos sobre
  FX-T4a-a, cuando se comparan los payloads, entonces los `pseudoPatientId` son
  distintos, ninguno contiene el `patientId` y ninguno se persiste en
  `ai_analysis_record`. `[RN-11]` `[readme §6.1 #6]`
- **AC-3 (borde · fechas relativas)** · Dado FX-T4a-a, cuando se inspecciona
  `clinicalContext`, entonces no contiene fechas absolutas (ninguna cadena
  `AAAA-MM-DD`) y trae `diagnosis.monthsSinceDiagnosis = 14`,
  `biomarkers[HER2].monthsAgo = 13` y en `priorTreatments[0]` `monthsSinceStart = 12` y
  `monthsSinceEnd = 8`. `[RN-11]` `[AC-06.2]`
- **AC-4 (borde · minimización de notas)** · Dado que FX-T4a-a tiene una nota con
  nombre, documento y teléfono, cuando se ejecuta el análisis en el S1, entonces
  `clinicalContext.clinicalNotes = []`. `[OL-03]` `[readme §2.5]`
- **AC-5 (borde · seudónimo fuera del prompt)** · Dado un `RagQueryInternalRequest`
  con `pseudoPatientId = "p-7f3a"`, cuando `rag-orchestrator` arma el prompt para el
  LLM falso, entonces el texto del prompt no contiene `p-7f3a`. `[RN-11]` `[CLAUDE.md]`
- **AC-6 (borde · snapshot persistido)** · Dado el análisis del AC-1, cuando se lee
  `clinical_context_snapshot` del `AIAnalysisRecord`, entonces es igual al
  `clinicalContext` enviado (mismo hash) y tampoco contiene los identificadores del
  AC-1. `[AC-06.2]` `[AC-T1.4]`
- **AC-7 (borde · detector caído)** · Dado el detector de PII lanzando una excepción,
  cuando se solicita el análisis, entonces la respuesta es `503`, el cliente de
  `rag-orchestrator` registra cero llamadas y no se persiste ningún registro. (asumido:
  falla cerrada)

## Contexto técnico
`ContextDeidentifier` en el módulo `evidence-analysis` de `clinical-api`, aplicado al
`ClinicalContext` ya construido por US-052 (allowlist) y etiquetado por US-065: genera
el seudónimo con un generador criptográfico, convierte fechas a meses relativos y
enmascara texto libre (pregunta en el S1; notas desde el S3; eventos y tratamientos
desde el S2) con el detector decidido en ADR-40: coincidencia exacta con la identidad
conocida del paciente y de su representante, más patrones configurables sin asumir
país `[RN-22]`. Dueña de RN-11: las Features que agreguen contenido al contexto (eventos
y tratamientos S2, notas y faltantes S3, memoria S4) llevan `🔗 Regresión [RN-11] → US-049`
y amplían el AC-1 con su PII sembrada. Tests: Supertest con `rag-orchestrator` simulado
que captura el payload (AC-1 a AC-4, AC-6, AC-7) y Pytest del constructor de prompt
(AC-5).

## INVEST
**Small** ✓ un componente puro sobre un contexto ya construido.
**Testable** ✓ siete tests sobre el payload capturado y el prompt.
*(Estimable ⚠ el 5 asume la opción A de ADR-40 —patrones y coincidencia exacta, sin servicio nuevo—; con la opción B, re-estimar.)*

---

## US-050 — Los datos reales solo se procesan con modelos locales, sin respaldo en la nube

> Linear: [L1D-204](https://linear.app/l1der-lab-mjbc/issue/L1D-204)

`FEAT-T4a` · Sprint 6 · Estimación **3** · HU-03 · RN-12 (dueña), SEG-05 · AC-06.1 (`503`) · ↪ US-052, US-055 · 🔗 Medido en: US-072 (G-8: 0 datos reales en la nube)

## Story
Como responsable de la privacidad del piloto, quiero que la regla "datos reales solo
con modelos locales" esté aplicada en el código de ambos backends y probada, para que
un fallo del LLM local nunca termine enviando datos de un paciente real a un proveedor
de nube.

## AC (Given/When/Then)
- **AC-1 (happy path)** `[SEG-05]` · Dado un `RagQueryInternalRequest` con
  `dataClassification = real_identificado`, el LLM local disponible y
  `LLM_CLOUD_ENABLED=true`, cuando se procesa la pregunta, entonces el adapter local
  registra una invocación, el adapter de nube cero, y `meta.llmProvider` es el local.
  `[RN-12]` `[OL-02]`
- **AC-2 (borde · local caído con dato real)** · Dado el mismo request con el LLM local
  caído, cuando se procesa, entonces `rag-orchestrator` responde
  `503 LOCAL_LLM_UNAVAILABLE` y el adapter de nube registra cero invocaciones.
  `[RN-12]` `[readme §4.2]`
- **AC-3 (borde · nube deshabilitada)** · Dado `dataClassification = sintetico`,
  `LLM_CLOUD_ENABLED=false` y el LLM local caído, cuando se procesa, entonces responde
  `503` y el adapter de nube registra cero invocaciones. `[readme §1.4]` `[RN-12]`
- **AC-4 (borde · la clasificación la decide Backend 1)** · Dado un paciente con
  `data_origin = real_identificado` en el repositorio falso del test unitario y un body
  público que intenta enviar `dataClassification = sintetico`, cuando el gateway arma
  el request interno, entonces `dataClassification = real_identificado` (tomado de
  `Patient.data_origin`, nunca del body). `[readme §2.5]` `[OL-03]`
- **AC-5 (borde · propagación al cliente)** · Dado `rag-orchestrator` respondiendo
  `503`, cuando el doctor solicita el análisis, entonces `clinical-api` responde `503`
  sin detalles internos y no persiste ningún `AIAnalysisRecord`. `[FR-09]` `[readme §4.1]`

## Contexto técnico
Regla pura en `rag-orchestrator/app/domain/provider_rule.py`
(`allowed_providers(data_classification, cloud_enabled)`), aplicada por la fábrica de
adapters de `llm/`; la misma regla aplica a *embeddings*, *reranker* y NLI (todos
locales en CPU). En Backend 1, el gateway solo lee la clasificación del paciente.
Tests: Pytest con adapters falsos que cuentan invocaciones (AC-1 a AC-3), Vitest
unitario (AC-4), Supertest con `rag-orchestrator` simulado (AC-5).

## INVEST
**Small** ✓ una regla pura y su uso en la fábrica de adapters.
**Testable** ✓ cinco tests con contadores de invocaciones.

---

## US-013 · ADR-40 — Detección y enmascaramiento de PII en texto libre y documentos

> Linear: [L1D-205](https://linear.app/l1der-lab-mjbc/issue/L1D-205)

`FEAT-T4a` · Sprint 2 · Estimación **5** · — (ADR) · RN-10, RN-11, G-8 · Dueño: Ingeniería · 🔗 Bloquea: US-049 (AC-1), FEAT-01b (gate de PII y adapter `pii/`, S2), FEAT-02b/02c y FEAT-11c (desidentificación de eventos, atributos y memoria) · ⛔ Bloqueada por: — (ADR-39 solo si la opción elegida usa el LLM)

## Story
Como responsable técnico, quiero decidir qué detector de PII se usa y en qué backend
corre cada enmascaramiento, para que el texto libre llegue siempre desidentificado a
Backend 2 y el gate de PII de documentos alcance la sensibilidad de G-8 sin violar el
confinamiento de la identidad.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado el dataset de PII sembrada de OL-06 (pregunta, notas,
  eventos, atributos y documentos sintéticos), cuando se evalúen las opciones, entonces
  `docs/architecture/adr/ADR-40-deteccion-pii.md` registra por opción la sensibilidad
  sobre identificadores directos, los falsos positivos sobre términos clínicos, la
  latencia y la memoria, y elige la que cumple G-8 (≥ 0,95). `[G-8]` `[readme §2.6]`
- **AC-2 (invariante · dónde se enmascara la pregunta)** · Dada la pregunta del doctor
  y las notas, cuando se decida el punto de enmascaramiento, entonces el ADR fija que
  ocurre en `clinical-api` **antes** de construir el request a Backend 2, y descarta
  cualquier opción que envíe texto sin desidentificar a `rag-orchestrator`.
  `[RN-10]` `[RN-11]` `[CLAUDE.md]`
- **AC-3 (borde · identidad conocida)** · Dado que `clinical-api` conoce la identidad
  descifrada del paciente y de su representante, cuando se decida la estrategia,
  entonces el ADR registra si se usa coincidencia exacta con esa identidad como capa
  adicional, y cómo se evita que esa identidad quede en logs o en el contexto. `[RN-10]` (asumido)
- **AC-4 (borde · sin asumir país)** · Dados formatos de documento, teléfono o correo de
  distintos países, cuando se configure el detector, entonces el ADR fija que los
  formatos viven en configuración y que ningún patrón de país está codificado.
  `[readme §2.5]` `[RN-22]`
- **AC-5 (documentos)** · Dado un documento `sintetico` o `real_anonimizado` con PII, y
  uno `real_identificado`, cuando se aplique el gate, entonces el ADR describe qué motor
  usa el adapter `pii/` de Backend 2 y cómo distingue la identidad esperada del paciente
  (verificación con `identityFound`) del resto de PII, que se enmascara.
  `[readme §2.5]` `[readme §4.2]`
- **AC-6** · Dado el ADR aprobado, cuando se cierre, entonces el motor, su versión y los
  umbrales quedan en configuración, y la PR que los cambie dispara la suite OL-06.
  `[RN-22]` `[FR-20]`

## Contexto técnico
OL-05 tarea 12 remite el motor de `PiiAdapter` al ADR de modelos; se separa porque la
decisión tiene dos lados (Node en Backend 1 para texto libre desde el S1; Python en
Backend 2 para documentos desde el S2) y una invariante propia. Una fuga en el S1
contamina `clinical_context_snapshot` y la memoria de análisis de forma irreversible.
El detector nunca registra valores, solo tipos (`findingTypes`).

| Opción | A favor | En contra |
|---|---|---|
| A · B1: patrones configurables + coincidencia exacta con la identidad conocida; B2: mismo enfoque + NER local en `pii/` | Sin servicios nuevos; determinista; la identidad nunca sale de B1 | Nombres de terceros en texto libre dependen de NER solo en documentos |
| B · Servicio local de PII (contenedor Python con NER) en la red de `clinical-api` | Mismo motor para texto libre y documentos | Un contenedor más (memoria, operación) |
| C · NER con el LLM local | Cubre nombres y contexto | No determinista; consume el semáforo de inferencia |
| **Descartada** · Enviar el texto a Backend 2 para enmascararlo | — | Viola RN-10/RN-11 |

Si la opción B supera el presupuesto de memoria de ADR-39, queda descartada por la
restricción de 24 GB.

## Non-goals
No implementar el enmascaramiento (US-049, FEAT-01b). No cambiar el gate de PII ni las
clases de datos (#14).

## INVEST
**Small** ✓ una evaluación acotada sobre un dataset sintético y un documento.
**Testable** ✓ los AC verifican el contenido del ADR (métricas por opción, punto de enmascaramiento, configuración).

---

## Conflictos de fuentes

| # | Fuente A | Fuente B | Se siguió |
|---|---|---|---|
| P-02 | PRD FR-02: la búsqueda por nombre "filtra dentro del equipo tratante"; FR-15, G-9, §11 #2: equipo tratante en el MVP | Decisión del usuario P-02: autorización por paciente en un sistema externo, fuera del MVP; solo RBAC | P-02 (vinculante): US-045 AC-4 y US-048 AC-3 sin filtro por equipo. Registrado para enmendar el PRD |
| C-24 | readme §2.5: bloqueo "por cuenta y por IP" | PRD FR-01: 5 intentos fallidos (sin mencionar IP) | readme complementa sin contradecir: US-044 AC-2 (cuenta) y AC-3 (IP) |
| C-23 | readme §5.0 S2: "regla de proveedores solo locales" en el S2 | readme §6 OL-02 (S1): test de regla de proveedores y `503` | OL-02 (S1): el walking skeleton ya envía `dataClassification` (US-050) |
| — | readme §6 OL-03 "No incluye" y §5.0 S3: enmascaramiento de las notas en el S3 | PRD RN-11: desidentificar "siempre" | Sin contradicción: en el S1 las notas no se envían (`clinicalNotes = []`, US-049 AC-4); cuando se envíen (S3) irán enmascaradas |
| Slicing v2 · Q-06 revisada | readme §5.0 S1 (HU-01, HU-06, HU-07) y OL-02 (regla de proveedores en el S1); PRD §14 S1 | Slicing v2 y Q-06 revisada (`01-requisitos.md` §15): acceso e identidad cifrada en el S2, alta manual en el S4 y regla de proveedores RN-12 (US-050) en el S6, antes de G-Piloto — **aceptado por el usuario el 2026-10-07**; ajuste del 2026-10-07: sesión mínima (US-211) en el S1 | El S1 usa los pacientes semilla por ruta directa con sesión real (US-211: login, cookie opaca y guard); la desidentificación (US-049) sí está en el S1. RN-12 no se relaja: hasta el S6 solo hay datos sintéticos y adapters locales, y US-050 se verifica antes de G-Piloto |
