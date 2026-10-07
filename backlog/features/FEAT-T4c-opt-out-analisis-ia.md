# FEAT-T4c — Bloqueo por opt-out de `analisis_ia` en toda generación con IA (reducida)

> Linear: [L1D-42](https://linear.app/l1der-lab-mjbc/issue/L1D-42)

**Talla:** L (2 historias de desarrollo + 2 DEC que son prerrequisito del gate) · **Sprint:** 6 (→ G-Piloto) · **Capacidad:** T-4 (AC-T4.6: `403` y registro de marcas; AC-T4.1: FR-16, RN-15) · T-3 (AC-T3.3: bloqueo legal, la parte que G-Demo dejó para G-Piloto) · **Recorrido principal:** sí (sin este control no hay casos reales: RN-13, RN-15)
**Requisitos:** RN-15 (dueña: US-148) · FR-16 (S5: "validación en todos los endpoints de IA"; registro de marcas por CLI como *workaround* de la UI de administración) · G-9 (parte de opt-out) · TBD-21 (DEC-12) · V-15 (DEC-16)
**Evidencia:** [→ PRD §5 FR-16], [→ PRD §6 RN-15, RN-26], [→ PRD §2.1 G-9], [→ PRD §11 #10], [→ PRD §13 Seguridad ("`403` en toda generación con IA sobre un paciente con opt-out")], [→ PRD §14 S5], [→ PRD §16 TBD-21], [→ PRD §18.4 AC-T3.3, AC-T4.1, AC-T4.6], [→ readme §2.5 Consentimientos externos con opt-out], [→ readme §3.1 `PATIENT_OPT_OUT`], [→ readme §3.2 `PatientOptOut`], [→ readme §4.1 `POST/DELETE …/opt-outs`], [→ readme §5 HU-14], [→ readme §5.0 S5 KR2], [→ backlog/01-requisitos.md §3.1 (controles diferidos), §15 P-02], [→ backlog/02-adrs.md US-022 · DEC-12, US-026 · DEC-16, §4.6]
**Dependencias:** ↪ US-045 (CLI y RBAC), US-047 (convenio en el alta), US-052 (gateway del análisis), US-076 (carga), US-088 (vista de caso), FEAT-04 US-003 (`/completeness`), US-137 (feedback) · 🔗 Relacionada: US-096 (resumen del caso, `si-hay-capacidad`) · ⛔ DEC-16 (US-026) · escenario más probable (lista cerrada de endpoints) · ⛔ DEC-12 (US-022) · escenario más probable (formato de referencia y motivos) · 🔗 Produce para: US-143 (`preflight`: procedimiento de opt-out), US-150 (auditoría de marcas y denegaciones) · 🔗 Regresión [RN-10] → US-046 · 🔗 Regresión [RN-26] → US-071
**Valor:** el consentimiento se presume bajo el convenio, así que el único control que protege la voluntad del paciente que se opuso es que OncoLens nunca genere nada con IA sobre él. Esta Feature hace cumplir ese bloqueo en todos los endpoints de generación que existen y permite al administrador registrar la marca sin esperar la UI de administración.
**Recorrido principal (alcance reducido):** sí. **Workaround en el MVP:** la marca de opt-out se registra y revoca por la CLI de administración (`oncolens opt-outs`) y, en los entornos sintéticos, por el seed; la UI de administración de opt-out (FR-16, S4 en el PRD) pasa a FEAT-T4b (Post-MVP). El control (`403`) no se debilita.
**Stories:** US-148, US-149, US-022 · DEC-12, US-026 · DEC-16 (10 puntos, S6)

## Fixtures

- **FX-T4c-a · Pacientes con marcas de opt-out** (sembrados con la CLI de US-149 en la BD de test; todos `data_origin = sintetico`, convenio `CONV-TEST-01`, motivo `solicitud_paciente` del catálogo de test de DEC-12):
  - **P-OPT-IA:** paciente semilla (a) con una marca `analisis_ia` `registrado` (referencia `EXT-TEST-0001`), un análisis previo `AN-PREV` del S4 y un documento ya cargado `D-OPT`.
  - **P-OPT-REV:** paciente semilla (b) con una marca `analisis_ia` `registrado` y después otra `revocado`.
  - **P-OPT-INV:** copia sintética de (a) con solo una marca `investigacion` `registrado`.
  - Cliente de `rag-orchestrator` falso en `clinical-api` que cuenta invocaciones por endpoint interno (`/rag/query`, `/case/summary`, `/documents/extract`).

---

## US-148 — Toda generación con IA sobre un paciente con opt-out de `analisis_ia` responde `403` sin llamar a la IA, y lo demás sigue funcionando

> Linear: [L1D-213](https://linear.app/l1der-lab-mjbc/issue/L1D-213)

`FEAT-T4c` · Sprint 6 · Estimación **5** · HU-14 (opt-out) · RN-15 (dueña), FR-16 (S5), FR-09, FR-21 · AC-T4.6 (`403`), AC-T3.3 (bloqueo por opt-out), AC-06.1 (`403`), AC-02.5 (`403`), AC-T4.1 (parte) · G-9 (opt-out) · ↪ US-149, US-052 · 🔗 Relacionada: US-096 (resumen, `si-hay-capacidad`: AC-2 condicional) · ⛔ DEC-16 (US-026) · escenario más probable · 🔗 Regresión [RN-26] → US-071

## Story
Como paciente que se opuso al análisis con IA (representado por el administrador que
registró su marca), quiero que OncoLens nunca genere nada con IA sobre mis datos, para
que mi decisión se cumpla aunque el oncólogo siga viendo mi caso y cargando mis
documentos.

## AC (Given/When/Then)
- **AC-1 (happy path · análisis)** · Dado P-OPT-IA y `doc1@test.local`, cuando envía
  `POST /platform/evidence-analyses`, entonces responde `403` con
  `error = "opt_out_analisis_ia"`, el cliente de `rag-orchestrator` registra cero
  llamadas a `/rag/query` y no se crea ningún `AIAnalysisRecord`.
  `[RN-15]` `[AC-T4.6]` `[AC-06.1]` `[FR-09]`
- **AC-2 (borde · resumen del caso; condicional: solo si FEAT-02c se construye)** · Dado P-OPT-IA, cuando se envía
  `POST /platform/patients/{id}/case-summary`, entonces responde `403`, cero llamadas a
  `/case/summary` y ningún registro de resumen. `[RN-15]` `[AC-02.5]` `[FR-16]`
- **AC-3 (invariante · todos los endpoints de generación)** · Dado el registro de rutas
  de `clinical-api`, cuando corre el test de cobertura, entonces toda ruta marcada
  `generaIA` (en el MVP: el análisis de S1–S5; resumen del caso, re-ejecución y búsqueda
  complementaria cuando existan) aplica el guardia de opt-out, la lista coincide con la de DEC-16, y una
  ruta `generaIA` sin guardia hace fallar la CI. `[RN-15]` `[G-9]` `[DEC-16]`
- **AC-4 (borde · marca revocada)** · Dado P-OPT-REV (última marca `revocado`), cuando se
  solicita el análisis, entonces responde `200`. `[FR-16]` `[RN-15]`
- **AC-5 (borde · solo opt-out de investigación)** · Dado P-OPT-INV, cuando se solicita
  el análisis, entonces responde `200`. `[FR-16]`
- **AC-6 (borde · análisis en curso)** · Dado un análisis de P-OPT-REV en curso (LLM
  falso lento), cuando el administrador registra un opt-out `analisis_ia` antes de que
  termine, entonces ese análisis responde `200` y queda persistido, y el siguiente
  responde `403`. `[FR-16]`
- **AC-7 (borde negativo en positivo · lo que no es generación)** · Dado P-OPT-IA, cuando
  se consultan `GET /platform/patients/{id}`, `GET …/case` y `GET …/completeness`, se
  sube un documento con `POST …/documents` y se envía feedback de `AN-PREV` con
  `POST /platform/evidence-analyses/{AN-PREV}/feedback`, entonces responden `200`,
  `200`, `200`, `202` y `201`, y el documento llega a `procesado` por la cola de
  extracción. `[FR-16]` `[DEC-16]` `[RN-26]` (asumido en la extracción y el feedback:
  escenario más probable de DEC-16)
- **AC-8 (borde · UI)** · Dado P-OPT-IA en Playwright contra Compose, cuando el doctor
  abre el panel de análisis, entonces ve "El análisis con IA no está disponible para
  este paciente" sin la referencia ni el motivo de la marca, y el botón "Analizar
  evidencia" está deshabilitado; la ficha y la vista de caso se ven completas.
  `[RN-15]` `[RN-10]` (asumido en el texto)

## Contexto técnico
Guardia `OptOutGuard` en `clinical-api` (módulo `opt-outs`), aplicado como *middleware*
declarativo a las rutas con la marca `generaIA`, **antes** del *rate limit* y de
cualquier llamada a Backend 2; lee la última marca de `patient_opt_out` por
`(patient_id, opt_out_type, recorded_at DESC)` (índice de readme §3.1). La ficha expone
un booleano `aiAnalysisAvailable` para la UI, sin el detalle de la marca. Las historias
que agreguen endpoints de generación (re-ejecución de FEAT-11a, US-177; búsqueda complementaria
de FEAT-08c, US-186) llevan `🔗 Regresión [RN-15] → US-148` y se suman al AC-3. El `422` por
egresado y el `403` por equipo tratante no son de esta Feature (Post-MVP). Tests:
Supertest con FX-T4c-a y el cliente falso (AC-1, AC-2, AC-4…AC-7), test de cobertura de
rutas en Vitest (AC-3) y Playwright contra Compose (AC-8).

## Non-goals
Borrado del histórico de investigación por opt-out de `investigacion` (no hay histórico
de investigación hasta el egreso con snapshot, FEAT-T4b, Post-MVP). UI de administración
de opt-out (FEAT-T4b). Autorización por equipo tratante (FEAT-T4e, Post-MVP, P-02).

## INVEST
**Small** ✓ un guardia declarativo, un booleano en la ficha y un mensaje en el panel.
**Testable** ✓ ocho tests de integración, de cobertura de rutas y E2E.

---

## US-149 — El administrador registra y revoca marcas de opt-out por CLI, con referencia externa y motivo del catálogo, auditadas

> Linear: [L1D-214](https://linear.app/l1der-lab-mjbc/issue/L1D-214)

`FEAT-T4c` · Sprint 6 · Estimación **3** · HU-13, HU-14 (opt-out) · FR-16 (registro de marcas, *workaround* de la UI) · AC-T4.6 (solo `admin`, referencia, auditada) · ↪ US-045, US-038 · ⛔ DEC-12 (US-022) · escenario más probable · 🔗 Produce para: US-148, US-150 (auditoría) · 🔗 Regresión [RN-10] → US-046 · 🔗 Regresión [RN-13] → US-039 (el seed se niega en `piloto`)

## Story
Como administrador, quiero registrar y revocar desde la CLI la marca de opt-out que me
llega del sistema externo de consentimientos, con su referencia y su motivo, para que el
bloqueo se aplique desde ese momento aunque todavía no exista una pantalla para hacerlo.

## AC (Given/When/Then)
- **AC-1 (happy path)** `[SEG-10]` · Dado `admin@test.local` y el paciente semilla (a), cuando
  ejecuta `oncolens opt-outs register --as admin@test.local --patient <uuid> --type
  analisis_ia --reference EXT-TEST-0001 --reason solicitud_paciente`, entonces existe
  una fila en `patient_opt_out` con `action = registrado`, esa referencia y motivo,
  `recorded_by` del admin y `recorded_at`. `[FR-16]` `[AC-T4.6]` `[readme §3.1]`
- **AC-2 (borde · no admin)** · Dado `doc1@test.local`, cuando ejecuta el mismo comando
  con `--as doc1@test.local`, entonces sale con código ≠ 0 y el mensaje "Solo el rol
  admin registra marcas de opt-out", sin crear filas. `[FR-16]` `[AC-T4.6]`
- **AC-3 (borde · motivo fuera del catálogo)** · Dado `--reason inventado`, cuando se
  ejecuta, entonces sale con código ≠ 0 y lista los motivos válidos, sin crear filas.
  `[FR-16]` `[TBD-21]`
- **AC-4 (borde · referencia con forma de identidad)** · Dada una referencia que no
  cumple el formato configurado (`OPT_OUT_REFERENCE_PATTERN`, p. ej., un número de
  cédula), cuando se ejecuta, entonces sale con código ≠ 0 sin crear filas.
  `[RN-10]` `[DEC-12]` (asumido: el formato lo fija DEC-12)
- **AC-5 (borde · revocación)** · Dado el opt-out del AC-1, cuando se ejecuta
  `oncolens opt-outs revoke` con la misma referencia, entonces se agrega una fila
  `action = revocado` (la anterior no se borra) y `oncolens opt-outs list --patient
  <uuid>` muestra `analisis_ia: sin opt-out vigente`. `[FR-16]` ("la vigente es la
  última de cada tipo")
- **AC-6 (borde · seed sintético)** · Dado el seed sintético en un entorno `local`,
  cuando se aplica, entonces crea P-OPT-IA con su marca registrada por el admin semilla;
  y con `APP_ENV=piloto` el seed se niega a correr. `[RN-13]` (asumido en el paciente
  sembrado)
- **AC-7 (invariante · salida sin datos personales)** · Dadas las ejecuciones de los AC
  anteriores, cuando se leen la salida de la CLI y los *logs*, entonces solo contienen
  el UUID del paciente, el tipo y el resultado, sin nombre, documento ni referencia
  externa. `[RN-10]` `[NFR-11]` (asumido en la referencia)

## Contexto técnico
Subcomandos de la CLI de US-045 (`oncolens opt-outs register|revoke|list`) que llaman a
`OptOutService` de `clinical-api` (el mismo servicio que usará la API
`POST/DELETE …/opt-outs` de FEAT-T4b); la autenticación `--as` exige la contraseña del
usuario y el permiso `opt_outs:manage` del rol `admin`. Catálogo de motivos y patrón de la
referencia en configuración (`OPT_OUT_REASONS`, `OPT_OUT_REFERENCE_PATTERN`) con los
valores de DEC-12 `[RN-22]`. Cada marca queda auditada por US-150. El UUID se obtiene del
listado o de la búsqueda exacta (US-048). Tests: tests de integración de la CLI contra la
BD de test con SQL crudo (AC-1…AC-6) y captura de *stdout* y *logs* (AC-7).

## Non-goals
API REST y UI de administración de marcas (FEAT-T4b, Post-MVP). Efectos del opt-out de
`investigacion` sobre el histórico (FEAT-T4b).

## INVEST
**Small** ✓ tres subcomandos sobre un servicio de dominio pequeño.
**Testable** ✓ siete tests de integración de la CLI.

---

## US-022 · DEC-12 — Canal de opt-out: referencia externa, catálogo de motivos y SLA

> Linear: [L1D-215](https://linear.app/l1der-lab-mjbc/issue/L1D-215)

`FEAT-T4c` · Sprint 6 (antes de G-Piloto; la conversación con la entidad médica arranca en el S3) · Estimación **1** · — (decisión) · TBD-21 · FR-16 · Dueño: entidad médica + administrador · 🔗 Bloquea: US-149 (formato y motivos), US-143 (prerrequisito "procedimiento documentado de registro de opt-out")

## Story
Como administrador, junto con la entidad médica, quiero acordar el formato de la
referencia al documento externo, el catálogo de motivos y el plazo de registro del
opt-out, para que ninguna marca del sistema externo quede sin reflejar en OncoLens.

> Escenario más probable (a refinar en sprint planning): la referencia es el identificador del documento en el sistema externo (sin PHI), los motivos son un catálogo cerrado acordado con la entidad, y el SLA queda en el procedimiento documentado que exige el gate, porque así lo describen FR-16 y readme §2.5. Mientras la UI de administración no exista (FEAT-T4b, Post-MVP), el procedimiento usa la CLI de US-149 (asumido en el detalle).

## AC (Given/When/Then)
- **AC-1** · Dado el acuerdo, cuando se registre en
  `docs/decisions/DEC-12-canal-opt-out.md`, entonces contiene formato de referencia,
  catálogo de motivos, SLA y responsable, firmado por la entidad médica con fecha.
  `[TBD-21]` (asumido)
- **AC-2** · Dado el formato, cuando se registre, entonces declara que la referencia no
  contiene identidad ni PHI. `[RN-10]` (asumido)
- **AC-3** · Dado el procedimiento, cuando se registre, entonces nombra la CLI de US-149
  como canal de registro en el MVP. `[01-requisitos §15]` (asumido)

## Contexto técnico
Historia de decisión: el entregable es el documento con dueño y fecha. La mecánica
(validación del patrón y de los motivos) es de US-149.

## INVEST
**Small** ✓ un acuerdo y un documento.
**Testable** ✓ los AC verifican el contenido del registro.

---

## US-026 · DEC-16 — Alcance de "generación con IA" bajo el opt-out de `analisis_ia`

> Linear: [L1D-216](https://linear.app/l1der-lab-mjbc/issue/L1D-216)

`FEAT-T4c` · Sprint 6 (antes de G-Piloto) · Estimación **1** · — (decisión) · V-15 · RN-15, FR-16 · Dueño: usuario (PO) + área legal · 🔗 Bloquea: US-148 (lista cerrada de endpoints con `403`)

## Story
Como product owner, junto con el área legal, quiero cerrar si la extracción con LLM de
un documento cuenta como "generación con IA" bajo el opt-out, para que el `403` se
aplique a una lista cerrada y verificable de endpoints.

> Escenario más probable (a refinar en sprint planning): el `403` cubre análisis, resumen del caso, re-ejecución y búsqueda complementaria; la carga y su extracción local **no** se bloquean, porque FR-16 dice que el opt-out no afecta la carga de documentos; el feedback y las lecturas tampoco, porque no generan texto con IA.

## AC (Given/When/Then)
- **AC-1** · Dada la decisión, cuando se registre en
  `docs/decisions/DEC-16-alcance-opt-out.md`, entonces lista los endpoints bloqueados y
  los no bloqueados, con firma del área legal y fecha. `[RN-15]` (asumido)
- **AC-2** · Dada la lista, cuando se registre, entonces marca qué endpoints aún no
  existen en el MVP (re-ejecución, búsqueda complementaria) para que entren al guardia
  cuando se construyan. (asumido)

## Contexto técnico
Historia de decisión. La mecánica (guardia y test de cobertura de rutas) es de US-148.

## INVEST
**Small** ✓ una decisión con una lista cerrada.
**Testable** ✓ los AC verifican el contenido del registro.

---

## Conflictos de fuentes

| # | Fuente A | Fuente B | Se siguió |
|---|---|---|---|
| — | PRD FR-15, §11 #2, G-9 ("100 % de endpoints de paciente validan el equipo tratante"), AC-T3.3 y AC-T4.1 (FR-15 heredado), readme §5.0 S5 KR1 y HU-14 (equipo tratante en el S5) | Resolución del usuario P-02: la autorización por paciente la gestiona un sistema externo; FR-15 pasa a Post-MVP (FEAT-T4e) y el MVP aplica solo RBAC | P-02 (decisión vinculante): FEAT-T4c queda **reducida** al opt-out; G-9 solo se verifica en su parte de opt-out (0 generaciones con IA sobre pacientes con opt-out). Se registra para enmendar el PRD |
| — | PRD FR-16: UI de administración de opt-out en el S4 (HU-13, HU-14); readme §5.0 S4 "HU-14 parcial (UI de opt-out)" | Directriz del usuario (`01-requisitos.md` §15): la UI de gestión de los controles de datos reales admite *workaround* por CLI o seed si no debilita el control | Directriz: marcas por CLI y seed (US-149); la UI pasa a FEAT-T4b (Post-MVP); el `403` se verifica igual (US-148) |
| — | PRD AC-T4.6: "un opt-out de investigación borra el histórico" | Slicing adoptado: ciclo de vida y snapshot de investigación (FEAT-T4b) en Post-MVP | En el MVP no se escribe histórico de investigación; la marca `investigacion` se registra (US-149) y su efecto de borrado queda en FEAT-T4b |
| — | `backlog/02-adrs.md` US-022 · DEC-12: Feature FEAT-T4b | FEAT-T4b pasa a Post-MVP; DEC-12 es prerrequisito del gate del S5 | DEC-12 se ubica en FEAT-T4c (S5), junto al registro de marcas que gobierna |
| C-08 | PRD: UI de opt-out en HU-13 | readme: HU-14 | Q-05: trazado a ambas (US-149 cita HU-13 y HU-14) |
| Slicing v2 | PRD §14 S5 y FR-16 (S5): `403` por opt-out en el S5 | Slicing v2 aprobado por el usuario (`01-requisitos.md` §15, 2026-10-07): `403` por opt-out en el S6, antes de G-Piloto | Las regresiones `🔗 Regresión [RN-15] → US-148` pasan a "activa desde S6"; US-148 verifica los endpoints de generación de S1–S5 |
