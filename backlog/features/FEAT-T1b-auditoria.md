# FEAT-T1b — Auditoría de accesos y auditoría completa (S6)

> Linear: [L1D-35](https://linear.app/l1der-lab-mjbc/issue/L1D-35)

**Talla:** M (Feature completa: 3 historias, 11 puntos) · **Sprint:** 6 (US-102 accesos, US-150 acciones; → G-Piloto) · `si-hay-capacidad` (US-151) · **Capacidad:** T-1 (AC-T1.5: accesos en el S2, acciones y verificación en el S5) · T-4 (AC-T4.1: FR-18) · **Recorrido principal:** sí · no (US-151)
**Requisitos:** FR-18 (dueña; S2: lectura de la ficha, de la vista de caso y apertura del documento de origen · S5: acciones) · SEG-03 ("cada vista auditada") · RN-10 (regresión → US-046)
**Evidencia:** [→ PRD §5 FR-04 ("cada lectura de la ficha se audita"), FR-07 ("cada apertura se audita"), FR-18], [→ PRD §6 RN-10], [→ PRD §11 #3], [→ PRD §18.4 AC-T1.5, AC-T4.1], [→ readme §3.1 `AUDIT_LOG`], [→ readme §6 OL-01 (`AuditLog` usada desde el Sprint 2)], [→ readme §5.0 S2 (auditoría de accesos adelantada)], [→ backlog/01-requisitos.md §14 Q-06 (b)], [→ PRD §14 G-Piloto ("G-Demo + AC-T1.5")], [→ PRD §5 FR-16 ("Cada marca es un evento auditado")], [→ PRD §18.4 AC-T4.6]
**Dependencias:** ↪ US-038 (tabla `audit_log`), US-051 (ficha), US-088 (vista de caso), US-212 (descarga del documento, S3), US-053 (análisis), US-076 (carga), US-107 (revisión), US-110 (registro manual), US-149 (marcas de opt-out), US-148 (denegaciones) · 🔗 Relacionada (`si-hay-capacidad`; se auditan si se construyen): US-080 (visor), US-096 (resumen), US-077 (carga múltiple), US-109 (resolución), US-094 (registro manual de atributos) · 🔗 Produce para: US-143 (`preflight`: auditoría) · 🔗 Regresión [RN-10] → US-046
**Valor:** antes de trabajar con pacientes reales, el responsable del piloto necesita poder responder quién vio la ficha, el caso o el documento de un paciente y cuándo, sin que el registro mismo se convierta en una fuga de identidad.
**Workaround en el MVP (US-151):** la verificación de cobertura de auditoría la cubre la lista de chequeos del `preflight` (US-143, chequeo `audit-coverage`).
**Stories:** US-102, US-150 (8 puntos, S6) · US-151 (3 puntos, `si-hay-capacidad`)

---

## Parte S2

## US-102 — Cada lectura de la ficha, de la vista de caso y de un documento queda auditada sin datos personales

> Linear: [L1D-183](https://linear.app/l1der-lab-mjbc/issue/L1D-183)

`FEAT-T1b` · Sprint 6 · Estimación **3** · — (transversal, PRD §17) · FR-18 (accesos, dueña), SEG-03, RN-10 · AC-T1.5 (parte de accesos), AC-T4.1 (FR-18) · ↪ US-038, US-051, US-088, US-212 (escribe `document.file.read` desde el S3) · 🔗 Relacionada: US-080 (visor, `si-hay-capacidad`) · 🔗 Regresión [RN-10] → US-046

## Story
Como responsable del piloto, quiero que cada vez que alguien abre la ficha, la vista de
caso o un documento de un paciente quede un registro de quién, qué y cuándo, sin datos
que lo identifiquen, para poder auditar los accesos antes de habilitar datos reales.

## AC (Given/When/Then)
- **AC-1 (happy path · ficha)** · Dado `doc1@test.local` y el paciente semilla (a),
  cuando llama a `GET /platform/patients/{id}`, entonces existe una fila en `audit_log`
  con `user_id` de `doc1`, `action = patient.read`, `entity_type = patient`,
  `entity_id = {id}`, `metadata.traceId` igual al `X-Trace-Id` de la respuesta y
  `created_at`. `[FR-18]` `[FR-04]` `[Q-06]`
- **AC-2 (borde · vista de caso y documento)** · Dado P-CASO, cuando se llama dos veces
  a `GET …/case` y una vez a `GET …/documents/{docId}/file` (US-212), entonces se
  registran dos `case.read` (entidad paciente), uno por petición, y un
  `document.file.read` (entidad documento), los tres escritos por el *middleware*
  declarativo. `[FR-18]` `[FR-07]` `[AC-T1.5]` (↪ US-212; el visor de US-080, si se
  construye, usa el mismo endpoint y no agrega acciones)
- **AC-3 (invariante · sin PHI)** · Dadas las filas de los AC-1 y AC-2, cuando se leen con
  SQL crudo, entonces ninguna contiene el número de documento, el nombre, el nombre del
  archivo ni texto clínico, y `metadata` solo tiene claves de una *allowlist*
  (`traceId`, `route`, `status`). `[RN-10]` `[FR-18]` `[NFR-11]`
- **AC-4 (borde · lectura fallida)** · Dado un `patientId` inexistente, cuando se pide la
  ficha, entonces responde `404` y no se registra `patient.read`. (asumido)
- **AC-5 (borde · auditoría caída)** · Dado un fallo forzado al insertar en `audit_log`,
  cuando se pide la ficha, entonces responde `500` sin datos del paciente. (asumido:
  falla cerrada)
  > Pendiente de definir en refinamiento (dueño: Ingeniería · afecta: AC-5): si la auditoría no se puede escribir, ¿la lectura falla (falla cerrada, más segura para datos reales) o se sirve y se alerta (más disponible)? Hasta decidirlo se implementa la falla cerrada.

## Contexto técnico
`AuditService` en `clinical-api` con un *middleware* declarativo por ruta (`audit:
"patient.read"`); escribe en el schema `audit` en la misma petición. `ip_address` se
guarda según readme §3.1. Las acciones (análisis, resumen, carga, revisión, opt-out…)
se auditan en la parte S5. `GET …/completeness` (S3) se agrega a esta lista desde FEAT-04
US-003. Tests: Supertest con SQL crudo sobre `audit.audit_log`.

## INVEST
**Small** ✓ un *middleware* y tres rutas marcadas (la del documento ya audita desde US-212; aquí migra al *middleware*).
**Testable** ✓ cinco tests de integración.

---

## Parte S5

## US-150 — Cada acción sobre un paciente queda auditada sin datos personales: análisis, resumen, carga, revisión, registro manual y marcas de opt-out

> Linear: [L1D-184](https://linear.app/l1der-lab-mjbc/issue/L1D-184)

`FEAT-T1b` · Sprint 6 · Estimación **5** · — (transversal, PRD §17) · FR-18 (S5: acciones, dueña), RN-10, FR-16 (marcas auditadas) · AC-T1.5 (acciones), AC-T4.6 (marca auditada), AC-T4.1 (FR-18) · ↪ US-102, US-053, US-076, US-107, US-110, US-149, US-148 · 🔗 Relacionada: US-096 (resumen, `si-hay-capacidad`), US-077 (carga múltiple, `si-hay-capacidad`) · 🔗 Regresión [RN-10] → US-046 · 🔗 Regresión [RN-06] → US-053

> **Dependencia hacia adelante (slicing v2, 2026-10-07):** el resumen del caso (FEAT-02c) y la carga múltiple (US-077) son `si-hay-capacidad`: si se construyen, sus acciones (`case_summary.create`, carga por lote) se agregan al AC-2 con `🔗 Regresión [FR-18] → US-150`.

## Story
Como responsable del piloto, quiero que cada análisis, resumen, carga, revisión, registro
manual y marca de opt-out quede registrado con quién, qué y cuándo, para poder
reconstruir lo que pasó con un paciente real sin que el registro contenga su identidad.

## AC (Given/When/Then)
- **AC-1 (happy path · análisis)** · Dado `doc1@test.local` y el paciente semilla (a),
  cuando completa un análisis de evidencia, entonces existe una fila con
  `action = evidence_analysis.create`, `entity_type = ai_analysis_record`,
  `entity_id` del análisis y `metadata` con `traceId`, `patientId` (UUID) y
  `status`. `[FR-18]` `[AC-T1.5]`
- **AC-2 (borde · resto de acciones)** · Dados P-CASO y FX-T4c-a, cuando se suben 2 PDFs
  (uno por acción), se verifica y se corrige un dato extraído y se registra a mano un
  biomarcador, entonces se registran dos `document.upload`, `clinical_data.review` (con
  `metadata.reviewAction` = `verificar` y `corregir`) y `clinical_data.manual_create`,
  uno por acción. `[FR-18]` `[AC-T1.5]`
- **AC-3 (borde · marcas de opt-out)** · Dado el registro y la revocación de US-149,
  cuando se consulta `audit_log`, entonces hay `opt_out.register` y `opt_out.revoke` con
  `user_id` del admin y el tipo de marca, sin la referencia externa ni el motivo.
  `[FR-16]` `[AC-T4.6]` `[RN-10]` (asumido en la exclusión de referencia y motivo)
- **AC-4 (borde · generación denegada)** · Dado P-OPT-IA, cuando se intenta un análisis
  y responde `403`, entonces queda `evidence_analysis.denied` con
  `metadata.reason = opt_out_analisis_ia`. (asumido)
- **AC-5 (invariante · sin PHI)** · Dados los AC anteriores ejecutados con FX-T4a-a
  (PII sembrada en la pregunta, en el nombre del archivo y en una nota), cuando se lee
  `audit.audit_log` con SQL crudo, entonces ninguna fila contiene el documento, el
  nombre, el nombre del archivo, la pregunta ni texto clínico, y `metadata` solo usa
  claves de la *allowlist*. `[RN-10]` `[FR-18]` `[NFR-11]`
- **AC-6 (borde · fallo de auditoría en una escritura)** · Dado un fallo forzado al
  insertar en `audit_log` durante un análisis, cuando ocurre, entonces la respuesta es
  `500` sin opciones y no queda `AIAnalysisRecord` sin su fila de auditoría.
  `[RN-06]` (asumido: misma transacción, falla cerrada como US-102 AC-5)

## Contexto técnico
Amplía el `AuditService` y el *middleware* declarativo de US-102 con acciones de
escritura; en las escrituras la fila de auditoría se inserta en la misma transacción que
el dato (asumido, ver el pendiente de US-102 con dueño Ingeniería). La CLI de opt-out
(US-149) audita a través del mismo servicio. Las acciones de Features diferidas
(re-ejecución, registro de evolución, búsqueda complementaria, bajas y renovaciones)
llevarán `🔗 Regresión [FR-18] → US-150` cuando se construyan. Tests: Supertest y
pruebas de la CLI con SQL crudo sobre `audit.audit_log`.

## INVEST
**Small** ✓ marca rutas existentes con su acción sobre un servicio ya construido.
**Testable** ✓ seis tests de integración.

---

## US-151 — La cobertura de auditoría se verifica de forma automática y el recorrido completo deja la traza esperada, como prerrequisito del gate

> Linear: [L1D-185](https://linear.app/l1der-lab-mjbc/issue/L1D-185)

`FEAT-T1b` · Sprint si-hay-capacidad · Estimación **3** · — (transversal, PRD §17) · FR-18 · AC-T1.5 (verificación en G-Piloto) · ↪ US-102, US-150 · 🔗 Produce para: US-143 (chequeo de auditoría del `preflight`) · **Recorrido principal:** no · **Workaround en el MVP:** la cubre la lista de chequeos del `preflight` (US-143), que incluye el chequeo `audit-coverage`

## Story
Como responsable del piloto, quiero una verificación automática de que toda ruta sobre
pacientes está auditada y de que un recorrido real deja la traza esperada, para no
descubrir un hueco de auditoría con datos reales ya cargados.

## AC (Given/When/Then)
- **AC-1 (happy path · cobertura de rutas)** · Dado el registro de rutas de
  `clinical-api`, cuando corre el test `audit-coverage`, entonces el 100 % de las rutas
  bajo `/platform/patients/**` y `/platform/evidence-analyses/**` tiene una acción de
  auditoría o una exención explícita con motivo (p. ej., `POST …/feedback`), y el
  resultado se escribe para el `preflight`. `[AC-T1.5]` `[FR-18]`
- **AC-2 (borde · ruta nueva sin auditar)** · Dada una ruta de test agregada bajo
  `/platform/patients/{id}/` sin acción ni exención, cuando corre la CI, entonces el
  test falla y nombra la ruta. `[FR-18]`
- **AC-3 (borde · traza del recorrido)** · Dado el E2E de G-Demo (US-142) ejecutado con
  `doc1`, cuando se consulta `audit_log` por su `user_id`, entonces aparecen en orden
  `patient.read`, `case.read`, `evidence_analysis.create` y ninguna acción de otro
  usuario. `[AC-T1.5]`
- **AC-4 (invariante · escaneo de PII)** · Dado el volcado de `audit.audit_log` tras el
  E2E con PII sembrada (FX-T4a-a), cuando se pasa el detector de PII de ADR-40 y la
  búsqueda literal de los valores sembrados, entonces hay 0 coincidencias.
  `[NFR-11]` `[RN-10]` `[ADR-40]`
- **AC-5 (borde · exención sin motivo)** · Dada una exención sin texto de motivo, cuando
  corre el test, entonces falla. (asumido)

## Contexto técnico
El test lee los metadatos de ruta (`audit: "<accion>"` o `auditExempt: "<motivo>"`) del
*router* de Express; exenciones esperadas: `GET /platform/question-templates` y
`POST …/feedback` (FR-18 no los lista). Tests: Vitest (AC-1, AC-2, AC-5) y Playwright +
consulta SQL contra Compose (AC-3, AC-4).

## INVEST
**Small** ✓ un test de inventario y una verificación sobre un E2E existente.
**Testable** ✓ cinco tests automatizados.

---

## Conflictos de fuentes

| # | Fuente A | Fuente B | Se siguió |
|---|---|---|---|
| C-15 | PRD FR-04 y readme HU-02: cada lectura de la ficha se audita (S1) | PRD FR-18: auditoría de accesos en el S2; readme OL-01: `AuditLog` desde el S2 | Q-06 (b), revisada y aceptada por el usuario el 2026-10-07: la auditoría de la lectura de la ficha llega en el S6 (US-102), antes de G-Piloto |
| — | PRD AC-T1.5: auditoría extendida verificada en G-Piloto (S5) | readme §5.0 S2: auditoría de accesos adelantada | Ambos: accesos en el S2 (US-102); acciones (US-150) y verificación de AC-T1.5 (US-151) en el S5 |
| — | PRD FR-18: auditoría de re-ejecuciones, registro de evolución, búsquedas complementarias, bajas, renovaciones y borrados | Slicing adoptado: esas funciones están en S6 (si hay capacidad) o Post-MVP | US-150 audita las acciones que existen al S5; las Features diferidas llevarán la regresión hacia US-150 |
| Slicing v2 · Q-06 revisada | Q-06 (b) y PRD FR-18: auditoría de lectura de la ficha en el S2; PRD §14 S5: auditoría completa | Slicing v2 y Q-06 revisada (`01-requisitos.md` §15): auditoría de lectura (US-102) y de acciones (US-150) en el S6, antes de G-Piloto — **aceptado por el usuario el 2026-10-07**; excepción: la descarga del documento de origen se audita desde el S3 (US-212) | Decisión del usuario. Hasta el S5 solo hay datos sintéticos; la auditoría es prerrequisito de datos reales (G-Piloto, S6) |
