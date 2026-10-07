# FEAT-T4e — Equipo tratante y autorización por paciente

> Linear: [L1D-44](https://linear.app/l1der-lab-mjbc/issue/L1D-44)

**Talla:** M (2 historias; el control de acceso es transversal pero sigue el patrón del guardia declarativo de US-148) · **Sprint:** Post-MVP (P-02) · **Capacidad:** T-4 (AC-T4.1: FR-15; §11 #2) · T-3 (AC-T3.3: bloqueo por equipo tratante) · **Recorrido principal:** no
**Requisitos:** FR-15 (dueña) · SEG-02 (plano "sobre qué pacientes") · G-9 (parte de equipo tratante) · V-06, V-19
**Evidencia:** [→ PRD §5 FR-02, FR-15], [→ PRD §2.1 G-9], [→ PRD §11 #2], [→ PRD §13 Seguridad ("autorización por equipo tratante")], [→ PRD §18.4 AC-T3.3, AC-T4.1], [→ readme §3.1 `CARE_TEAM_MEMBER`], [→ readme §4.1 `POST/DELETE …/care-team`, respuestas `403` "El doctor no pertenece al equipo tratante"], [→ readme §5 HU-14], [→ readme §5.0 S5 KR1], [→ backlog/01-requisitos.md §3.1 (controles diferidos), §10 V-06, V-19], [→ backlog/02-adrs.md Resoluciones P-02]
**Dependencias:** ↪ US-045 (RBAC y CLI de usuarios), US-038 (tabla `care_team_member`), US-150 (auditoría) · 🔗 Produce para: US-197 (tratante principal para el egreso, FEAT-T4b), US-189 (memoria "de todo el equipo", FEAT-11c), US-143 (el `preflight` vuelve a verificar la autorización por equipo cuando FR-15 entre) · 🔗 Regresión [FR-18] → US-150 · 🔗 Regresión [RN-26] → US-071
**Valor:** con varios oncólogos en la misma instalación, cada uno debe ver solo a sus pacientes. En el piloto esa autorización la resuelve el sistema externo de la entidad (P-02); esta Feature la trae a OncoLens cuando el producto salga de ese entorno controlado.
**Workaround en el MVP:** solo RBAC (US-045): todo doctor activo ve a todos los pacientes del piloto, y la autorización por paciente la hace cumplir el sistema externo de la entidad médica que controla quién accede a la instalación (P-02). La auditoría de accesos (US-102, US-150) permite revisar a posteriori quién vio qué paciente.
**Stories:** US-203, US-204 (8 puntos)

## Fixtures

- **FX-T4e-a · Equipos tratantes** (BD de test; todos `sintetico`): `doc1@test.local` principal de P-ACT y de A-M1; `doc2@test.local` miembro de P-ACT; `doc3@test.local` sin pacientes; `admin@test.local`. P-ACT y A-M1 de FX-T4b-a y FX-08b-a; P-OTRO sin equipo asignado salvo `doc3` como principal.

---

## US-203 — El administrador gestiona el equipo tratante de cada paciente, con un único tratante principal

> Linear: [L1D-228](https://linear.app/l1der-lab-mjbc/issue/L1D-228)

`FEAT-T4e` · Post-MVP · Estimación **3** · HU-14 (equipo) · FR-15 · AC-T4.1 (FR-15) · ↪ US-045, US-038 · 🔗 Produce para: US-197, US-204 · 🔗 Regresión [FR-18] → US-150

## Story
Como administrador, quiero asignar y retirar doctores del equipo tratante de un paciente
y designar al principal, para que la autorización por paciente y el egreso tengan una
fuente de verdad.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado P-ACT, cuando `admin@test.local` llama a
  `POST /platform/patients/{id}/care-team` con `userId = doc2` y `isPrimary = false`,
  entonces responde `201` y `doc2` queda activo en `care_team_member`. `[FR-15]`
- **AC-2 (borde · un solo principal)** · Dado P-ACT con `doc1` como principal, cuando se
  asigna `doc2` con `isPrimary = true`, entonces `doc2` pasa a principal y `doc1` queda
  miembro, en la misma transacción (nunca dos principales activos). `[FR-15]`
  `[readme §3.1]`
- **AC-3 (borde · no admin)** · Dado `doc1@test.local`, cuando intenta asignar, entonces
  responde `403`. `[FR-15]` (asumido: la gestión por el principal no entra, P-02)
- **AC-4 (borde · retiro del principal)** · Dado `doc1` como único principal, cuando el
  admin llama a `DELETE …/care-team` para `doc1` sin designar otro, entonces responde
  `409` con "El paciente debe conservar un tratante principal". (asumido)
- **AC-5 (borde · auditoría)** · Dadas las operaciones anteriores, cuando se revisa
  `AuditLog`, entonces cada alta, baja y cambio de principal tiene un evento con UUID de
  paciente y de usuarios. `[FR-18]`

## Contexto técnico
Módulo `care-team` en `clinical-api` sobre la tabla y el índice parcial de readme §3.1
(un principal activo por paciente). La CLI de US-045 gana el subcomando
`oncolens care-team` para el alta inicial. Tests: Supertest con FX-T4e-a (AC-1…AC-5).

## INVEST
**Small** ✓ un CRUD acotado con una invariante de unicidad.
**Testable** ✓ cinco tests.

---

## US-204 — Todos los endpoints de paciente responden `403` a un doctor que no pertenece al equipo tratante; `admin` ve todo

> Linear: [L1D-229](https://linear.app/l1der-lab-mjbc/issue/L1D-229)

`FEAT-T4e` · Post-MVP · Estimación **5** · HU-14 (equipo) · FR-15 (dueña) · AC-T3.3 (equipo tratante), AC-T4.1 (FR-15) · G-9 (equipo) · ↪ US-203 · 🔗 Regresión [RN-26] → US-071

## Story
Como paciente, quiero que solo los doctores que me atienden puedan ver y registrar mis
datos o pedir análisis sobre mí, para que mi información no quede al alcance de cualquier
usuario de la instalación.

## AC (Given/When/Then)
- **AC-1 (happy path · ficha)** · Dado P-ACT y `doc3@test.local` (fuera del equipo),
  cuando llama a `GET /platform/patients/{id}`, entonces responde `403` con "El doctor no
  pertenece al equipo tratante" y el evento de auditoría registra la denegación.
  `[FR-15]` `[AC-T3.3]` `[readme §4.1]`
- **AC-2 (invariante · todos los endpoints)** · Dado el registro de rutas, cuando corre el
  test de cobertura, entonces toda ruta `/platform/patients/{id}/…` y
  `/platform/evidence-analyses…` aplica el guardia de equipo, y una ruta sin él hace
  fallar la CI; con `doc3`, cada una responde `403` y el cliente de Backend 2 registra
  cero llamadas. `[FR-15]` `[G-9]` `[AC-T4.1]`
- **AC-3 (borde · miembro)** · Dado `doc2` (miembro de P-ACT), cuando consulta la ficha,
  el caso y pide un análisis, entonces responde `200` en los tres. `[FR-15]`
- **AC-4 (borde · admin)** · Dado `admin@test.local`, cuando consulta la ficha de P-ACT,
  entonces responde `200`. `[FR-15]` `[SEG-02]`
- **AC-5 (borde · búsqueda por nombre)** · Dado `doc3`, cuando busca por el nombre de
  P-ACT en `GET /platform/patients?name=`, entonces no lo encuentra; y el listado solo
  devuelve pacientes de sus equipos. `[FR-02]` (asumido en el listado)
  > Pendiente de definir en refinamiento (dueño: usuario · afecta: AC-5): FR-02 restringe al equipo la búsqueda por nombre, pero no dice si la búsqueda exacta por documento y el listado general también se restringen (V-19); ¿un doctor puede encontrar por documento a un paciente que no es suyo para pedir que lo agreguen al equipo?
- **AC-6 (borde · análisis previo de otro equipo)** · Dado un análisis de P-ACT,
  cuando `doc3` llama a `GET /platform/evidence-analyses/{id}/compare` o
  `POST …/feedback`, entonces responde `403`. `[FR-15]`
- **AC-7 (borde · `preflight`)** · Dado `oncolens preflight real-data` con FR-15 activo,
  cuando se ejecuta, entonces verifica que el test de cobertura del AC-2 pasa y falla si
  no. `[SEG-11]` (asumido: el chequeo se reincorpora al gate)

## Contexto técnico
`CareTeamGuard` declarativo en `clinical-api`, mismo patrón que el guardia de opt-out
(US-148) y el de egreso (US-198); orden: sesión → RBAC → equipo → egreso → opt-out →
*rate limit*. La memoria de análisis (US-189) pasa a filtrar por el equipo actual. Tests:
Supertest con FX-T4e-a (AC-1, AC-3…AC-6), test de cobertura de rutas en Vitest (AC-2) y
test del `preflight` (AC-7).

## INVEST
**Small** ✓ un guardia declarativo y su test de cobertura.
**Testable** ✓ siete tests.

---

## Conflictos de fuentes

| # | Fuente A | Fuente B | Se siguió |
|---|---|---|---|
| P-02 | PRD FR-15 (S5), §11 #2, G-9 ("100 % de endpoints de paciente validan el equipo tratante"), AC-T3.3, AC-T4.1; readme §5.0 S5 KR1 y HU-14 | Resolución del usuario P-02: la autorización por paciente ya existe en un sistema externo y queda fuera del MVP; solo RBAC | P-02: FEAT-T4e en Post-MVP; el `preflight` del S5 no verifica pertenencia (US-143). Se registra para enmendar el PRD |
| — | `backlog/01-requisitos.md` §9 y `02-adrs.md` P-02 (opción sugerida): FR-15 dentro de FEAT-T4c (S5) | Resolución P-02 | FEAT-T4c queda reducida al opt-out; FR-15 en esta Feature |
