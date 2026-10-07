# FEAT-T4f — Job automático de retención de datos

> Linear: [L1D-45](https://linear.app/l1der-lab-mjbc/issue/L1D-45)

**Talla:** M (2 historias; reutiliza la baja total de FEAT-T4b) · **Sprint:** Post-MVP · **Capacidad:** T-4 (AC-T4.1: RN-18, §11 #10) · **Recorrido principal:** no
**Requisitos:** FR-17 (job, dueña) · RN-18 (job; campos: US-047; baja total: US-199) · TBD-16 (DEC-15)
**Evidencia:** [→ PRD §5 FR-17], [→ PRD §6 RN-18], [→ PRD §3 Post-MVP ("Job automático de retención")], [→ PRD §11 #10, #11], [→ PRD §14 Post-MVP], [→ PRD §16 TBD-16], [→ PRD §18.1.2 (job de retención Post-MVP)], [→ PRD §18.6 PREG-2], [→ readme §3.1 `PATIENT.retention_*`], [→ readme §3.3 #4], [→ backlog/02-adrs.md US-025 · DEC-15]
**Dependencias:** ↪ US-047 (campos `retention_*` desde el alta), US-199 (baja total, FEAT-T4b), US-150 (auditoría) · ⛔ DEC-15 (US-025) · escenario más probable (se aprueba diferir el job; si se rechaza, esta Feature sube al S6 y se re-evalúa SUP-1 con DEC-03) · 🔗 Regresión [RN-10] → US-046 · 🔗 Regresión [FR-18] → US-150
**Valor:** la política de retención ya se registra en cada alta; el job la hace cumplir sola cuando, pasado el piloto, empiecen a vencer los plazos, sin depender de que alguien lo recuerde.
**Workaround en el MVP:** política y campos `retention_*` desde el alta (US-047); durante el piloto ningún dato llega a vencer (D-15) y el área legal valida diferir el job (DEC-15). Si hubiera un vencimiento, el administrador ejecuta la baja total manual (US-199 cuando exista, o procedimiento documentado).
**Stories:** US-209, US-210 (8 puntos)

## Fixtures

- **FX-T4f-a · Pacientes con plazos** (BD de test; reloj fijo **2036-03-01**; `RETENTION_YEARS = 10`, `RETENTION_MAX_YEARS = 20`, `RETENTION_NOTICE_DAYS = 90`):
  - **R-VENCE:** `real_identificado` (dato de test, sin PHI real), `retention_start = 2016-02-15`, `retention_until = 2036-02-15` (ya renovado una vez a 20 años; vencido).
  - **R-RENUEVA:** `real_identificado`, `retention_start = 2026-02-20`, `retention_until = 2036-02-20`, sin baja → renovable.
  - **R-AVISO:** `real_identificado`, `retention_until = 2036-05-15` (dentro de 90 días), ya en su máximo de 20 años.
  - **R-SINT:** `sintetico`, `retention_until = 2030-01-01`.

---

## US-209 — El job diario renueva hasta el máximo de 20 años y, al vencer, aplica la baja total de forma auditada

> Linear: [L1D-230](https://linear.app/l1der-lab-mjbc/issue/L1D-230)

`FEAT-T4f` · Post-MVP · Estimación **5** · — (técnica, PRD §17) · FR-17 (job, dueña), RN-18 · AC-T4.1 (RN-18) · ↪ US-047, US-199 · ⛔ DEC-15 (US-025) · escenario más probable · 🔗 Regresión [FR-18] → US-150 · 🔗 Regresión [RN-10] → US-046

## Story
Como responsable de la protección de datos, quiero que un job diario renueve la retención
de los pacientes sin baja y borre a los que vencieron su máximo, para cumplir la política
sin intervención manual.

## AC (Given/When/Then)
- **AC-1 (happy path · vencido)** · Dado R-VENCE, cuando corre el job, entonces se
  ejecuta la baja total de US-199 (identidad, representantes, histórico y PDFs borrados) y
  queda un evento `retention.expired` en `AuditLog` con el UUID, sin identidad. `[FR-17]`
  `[RN-18]`
- **AC-2 (borde · renovación)** · Dado R-RENUEVA, cuando corre el job en su fecha de
  vencimiento, entonces `retention_until` pasa a `retention_start + 20 años` y queda un
  evento `retention.renewed`. `[FR-17]` `[RN-18]`
- **AC-3 (borde · sintéticos y anonimizados)** · Dado R-SINT, cuando corre el job,
  entonces no lo toca. `[FR-17]`
- **AC-4 (borde · idempotencia)** · Dadas dos ejecuciones del job el mismo día, cuando
  terminan, entonces el resultado es el mismo y no hay eventos duplicados. (asumido)
- **AC-5 (borde · fallo parcial)** · Dado un fallo en la baja de R-VENCE, cuando ocurre,
  entonces el job continúa con los demás, registra `retention.failed` y reintenta al día
  siguiente. (asumido)

## Contexto técnico
Job en `apps/clinical-api/src/workers/retention.ts` (junto al de mayoría de edad,
US-146), programado una vez al día con bloqueo para que no corra dos veces en paralelo;
plazos en configuración `[RN-22]`. Tests: Vitest con reloj falso y Supertest + SQL crudo
con FX-T4f-a (AC-1…AC-5).

## INVEST
**Small** ✓ un job que decide entre tres casos y reutiliza la baja total.
**Testable** ✓ cinco tests con reloj falso.

---

## US-210 — El administrador recibe el aviso de los vencimientos de los próximos 90 días, sin datos personales

> Linear: [L1D-231](https://linear.app/l1der-lab-mjbc/issue/L1D-231)

`FEAT-T4f` · Post-MVP · Estimación **3** · — (técnica, PRD §17) · FR-17 (aviso a 90 días) · ↪ US-209 · ⛔ DEC-15 (US-025) · escenario más probable · 🔗 Regresión [RN-10] → US-046

## Story
Como administrador, quiero saber con 90 días de anticipación qué pacientes van a llegar
al final de su retención, para gestionar con la entidad médica cualquier excepción antes
del borrado.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado R-AVISO, cuando corre el job, entonces
  `GET /platform/admin/retention/upcoming` (solo `admin`) lista su UUID, su
  `retention_until` y los días restantes, y queda un evento `retention.notice` una sola
  vez. `[FR-17]`
- **AC-2 (borde · no admin)** · Dado `doc1@test.local`, cuando consulta el listado,
  entonces responde `403`. (asumido)
- **AC-3 (borde · sin identidad)** · Dado el listado y el evento del AC-1, cuando se
  inspeccionan, entonces no contienen nombre ni documento. `[RN-10]`
- **AC-4 (borde · renovables fuera del aviso)** · Dado R-RENUEVA a 30 días de su
  vencimiento, cuando corre el job, entonces no aparece en el listado porque se renovará
  automáticamente. `[FR-17]` (asumido)
  > Pendiente de definir en refinamiento (dueño: área legal · afecta: AC-1, AC-4): FR-17 pide "aviso a 90 días" sin decir a quién ni por qué canal; ¿basta con el listado del administrador en OncoLens o hay que notificar a la entidad médica o al paciente?

## Contexto técnico
El job de US-209 calcula los avisos; el listado es un `GET` del módulo `retention` con
permiso `admin`. El *endpoint* no figura en readme §4.1 (es Post-MVP). Tests: Supertest
con FX-T4f-a (AC-1…AC-4).

## INVEST
**Small** ✓ un cálculo más en el job y un listado.
**Testable** ✓ cuatro tests.

---

## Conflictos de fuentes

| # | Fuente A | Fuente B | Se siguió |
|---|---|---|---|
| — | PRD §5 FR-17 (D-15): job diferido a Post-MVP **sujeto a validación legal** (TBD-16) | `backlog/02-adrs.md` US-025 · DEC-15: si el área legal lo rechaza, el job entra al S5 | Post-MVP según el escenario más probable de DEC-15; si se rechaza, US-209 y US-210 suben al S5 (FEAT-T4d) y se re-estima con DEC-03 |
