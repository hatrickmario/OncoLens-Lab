# FEAT-02a — Ficha mínima del paciente

> Linear: [L1D-9](https://linear.app/l1der-lab-mjbc/issue/L1D-9)

**Talla:** M · **Sprint:** 2 · **Capacidad:** CAP-02 (S1: ficha) · T-1 (AC-T1.1 en la ficha) · **Recorrido principal:** sí
**Requisitos:** FR-04 (parte S1, vía HU-02; tendencia y procedencia OCR en el S2) · DEC-09
**Evidencia:** [→ PRD §5 FR-04], [→ PRD §17 FR-04 → HU-02, HU-05], [→ PRD §18.3.2 AC-02.4], [→ PRD §18.4 AC-T1.1], [→ readme §5 HU-02], [→ readme §4.1 `PatientSummary`, `GET /platform/patients/{patientId}`], [→ readme §6 OL-01 (pacientes semilla)], [→ readme §3.3 #12], [→ PRD §16 TBD-06], [→ backlog/01-requisitos.md §14 Q-06 (b); §15 P-02], [→ docs/AS-IS.md P1]
**Dependencias:** ↪ US-039 (seed), US-044 (sesión), US-046 (identidad), US-041 (códigos CIE-10) · 🔗 Regresión [AC-T1.5/FR-18, auditoría de lectura de la ficha] → US-102 (activa desde S6) · 🔗 Produce para: US-091 (tendencia en la ficha, `si-hay-capacidad`) · 🔗 Regresión [FR-15] → US-204 (Post-MVP)
**Valor:** antes de preguntarle nada a la IA, el oncólogo necesita ver en una pantalla el diagnóstico vigente y los biomarcadores recientes de su paciente, sin abrir documentos sueltos (P1: el dolor "document-centric vs patient-centric"). Es la puerta de entrada del walking skeleton hacia el análisis.
**Stories:** US-051, US-019 · DEC-09 (6 puntos, S2)

---

## US-051 — Veo la ficha mínima del paciente con su diagnóstico vigente y sus biomarcadores recientes

> Linear: [L1D-72](https://linear.app/l1der-lab-mjbc/issue/L1D-72)

`FEAT-02a` · Sprint 2 · Estimación **5** · HU-02 · FR-04 (S1), RN-10 · AC-T1.1 (ficha) · ↪ US-039, US-044, US-046 · 🔗 Regresión [FR-18] → US-102 (activa desde S6) · 🔗 Produce para: US-091

## Story
Como doctor autenticado, quiero ver la ficha resumen de un paciente (datos básicos,
diagnóstico vigente y biomarcadores recientes), para tener el contexto clínico antes de
decidir qué preguntarle al asistente de IA.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado `doc1@test.local` autenticado y el paciente semilla (a),
  cuando navega a su ficha, entonces `GET /platform/patients/{id}` responde `200` con
  `PatientSummary`: `identification` descifrada, `dataOrigin = sintetico`,
  `diagnosis.cancerType = mama`, `stagingSystem = TNM_8`, `stageValue = IIA`,
  `performanceScale = ECOG`, `performanceValue = 1`, y `recentBiomarkers` con HER2
  `3+` y receptor de estrógeno positivo, cada uno con `clinicalSignificance`, unidad,
  rango y `provenance`; y la página muestra el distintivo "SINTÉTICO". `[HU-02]` `[FR-04]`
- **AC-2 (borde · paciente inexistente)** · Dado un `patientId` con formato UUID que no
  existe, cuando se solicita la ficha, entonces responde `404` y la página muestra
  "Paciente no encontrado" sin romper la navegación. `[HU-02]` `[FR-04]`
- **AC-3 (borde · diagnóstico vigente)** · Dado el paciente semilla (c), con un
  diagnóstico inactivo y uno activo, cuando se solicita la ficha, entonces
  `diagnosis` corresponde al `Diagnosis` con `is_active = true`. `[HU-02]` `[OL-01]`
- **AC-4 (borde · último valor por biomarcador)** · Dado el paciente semilla (b), con
  tres valores de PSA fechados, cuando se solicita la ficha, entonces
  `recentBiomarkers` contiene una sola entrada de PSA, la de `performedAt` más
  reciente, con `trend = null` (la tendencia llega en el S2). `[FR-04]` `[AC-02.4]`
- **AC-5 (borde · origen visible)** · Dada la ficha del AC-1, cuando se renderiza,
  entonces cada valor del diagnóstico y de los biomarcadores muestra su origen ("Carga
  inicial" para `entry_method = seed`, "Registro manual" para `manual`) y su estado de
  revisión en texto, no solo con color. `[AC-T1.1]` `[FR-04]` `[NFR-12]`
- **AC-6 (borde · pendientes de revisión)** · Dado el paciente semilla (a) con todos sus
  datos `verificado`, cuando se solicita la ficha, entonces `pendingReviewCount = 0`; y
  si un test cambia un biomarcador a `requiere_revision`, entonces
  `pendingReviewCount = 1`. `[FR-04]` (asumido en la definición del contador)
  > Pendiente de definir en refinamiento (dueño: usuario · afecta: AC-6): ¿qué estados cuentan como "pendiente de revisión" en el contador de la ficha: solo `requiere_revision`, o también `auto_aceptado`?

## Contexto técnico
Módulo `patients` de `clinical-api` (lectura) + `IdentityService` para descifrar la
identificación solo en esta respuesta. Página
`web/app/(dashboard)/patients/[patientId]/page.tsx` con `PatientContextCard` reutilizable
por el panel de análisis (US-061) y un botón "Analizar evidencia" que navega al panel.
`missingCriticalCount` queda en `0` hasta el S3 (FEAT-04 US-003). En el S1 cualquier
doctor autenticado ve cualquier paciente (HU-02; P-02 lo mantiene en el MVP) y la
lectura **no** se audita todavía: la auditoría de accesos llega en el S6 (US-102; Q-06 revisada, aceptada por el usuario el 2026-10-07).
Tests: Supertest (AC-1 a AC-4, AC-6) y Playwright contra Compose con el seed (AC-1,
AC-2, AC-5).

> Pendiente de definir en refinamiento (dueño: usuario · afecta: campo `PatientSummary.diagnosis`): FR-04 pide "diagnóstico vigente" y `PatientSummary` (readme §4.1) no trae `histology` ni `grade`; ¿la ficha debe mostrar la histología y el Gleason/ISUP de próstata (DEC-05) o quedan solo en la vista de caso (AC-02.7, S2)?

## Non-goals
Tendencia ↑ ↓ = (S2, US-091, tras DEC-08). Visor del documento de origen y datos
extraídos por OCR (S2). Contador de faltantes (S3). Auditoría de la lectura (S2).
Acceso a la vista de caso (S2, US-090).

## INVEST
**Small** ✓ un endpoint de lectura y una página.
**Testable** ✓ seis tests de integración y E2E sobre pacientes semilla definidos por OL-01.

---

## US-019 · DEC-09 — Reglas del semáforo de biomarcadores y de vigencia de diagnósticos

> Linear: [L1D-73](https://linear.app/l1der-lab-mjbc/issue/L1D-73)

`FEAT-02a` · Sprint 2 · Estimación **1** · — (decisión) · RN-08 · TBD-06 (reglas clínicas), ADR-12 · Dueño: oncólogo asesor · 🔗 Bloquea: FEAT-01b (regla de diagnóstico extraído vs. vigente y origen del semáforo, S2), FEAT-03a (S2), FEAT-03b (conflictos, S3)

## Story
Como oncólogo asesor, quiero validar la regla de vigencia de diagnósticos y las reglas
del semáforo, para que la extracción nunca reemplace en silencio un diagnóstico y el
semáforo refleje una severidad que el oncólogo reconoce.

> Escenario más probable (a refinar en sprint planning): se valida tal cual la regla de #12 (la fecha decide: anterior → histórico; posterior o sin fecha confiable → `requiere_revision` con `conflicts_with_id`) y el semáforo normal / alterado / relevante / crítico con registro de su origen (documento, regla del catálogo o inferido por IA con aviso), porque es lo ya escrito en readme §3.3 #12 y §1.3. Por P-03, el registro es una revisión con fecha y revisor, sin sesión de firma formal.

## AC (Given/When/Then)
- **AC-1** · Dada la regla de #12, cuando el oncólogo la revise, entonces
  `docs/decisions/DEC-09-vigencia-semaforo.md` registra "validada" o el ajuste pedido,
  con revisor y fecha. `[ADR-12]`
- **AC-2** · Dado el semáforo, cuando se valide, entonces el documento registra de dónde
  sale cada nivel (rango del documento, catálogo o inferencia de la IA) y que el
  inferido por IA lleva aviso. `[HU-05]` (asumido)
- **AC-3** · Dado un ajuste a la regla de #12, cuando se registre, entonces el documento
  nombra las historias de FEAT-01b y FEAT-03a que deben re-estimarse. (asumido)
- **AC-4** · Dadas las reglas del semáforo que dependen de rangos por biomarcador, cuando
  se registren, entonces quedan en `packages/clinical-catalogs` y no en el código.
  `[RN-22]` `[ADR-29]`

## Contexto técnico
Historia de decisión ubicada en esta Feature porque la ficha del S1 ya muestra el
diagnóstico vigente y el semáforo (`clinicalSignificance`, `significanceSource`); su
aplicación a datos extraídos es del S2 (FEAT-01b, FEAT-03a).

## INVEST
**Small** ✓ una revisión de dos reglas ya escritas.
**Testable** ✓ el documento contiene veredicto, origen de cada nivel y fecha.

---

## Conflictos de fuentes

| # | Fuente A | Fuente B | Se siguió |
|---|---|---|---|
| C-15 | PRD FR-04 y readme HU-02: "cada lectura de la ficha se audita" (S1) | PRD FR-18: auditoría de accesos en el S2; readme OL-01: `AuditLog` "usada desde Sprint 2" | Decisión Q-06 (b), revisada y aceptada por el usuario el 2026-10-07: ficha sin auditoría hasta el S6; la auditoría de lectura llega en el S6 (US-102), antes de G-Piloto |
| P-02 | PRD FR-04: `403` si el doctor no está en el equipo tratante (S5); readme §4.1 | Decisión P-02: autorización por paciente fuera del MVP | P-02: la ficha no valida pertenencia en el MVP (US-204, Post-MVP) |
| — | PRD FR-04: "Sprint 1–2" con tendencia | PRD §18.3.2 AC-02.4 (S2) y TBD-13 (umbrales antes del S2) | Tendencia en el S2 (US-091); en el S1 `trend = null` (US-051 AC-4) |
| — | backlog/02-adrs.md: DEC-09 en la Feature FEAT-01b | Mapa de lotes de F3: DEC-09 en el S1 | Se ubica en FEAT-02a (S1) para que la historia quede en el milestone de su sprint; la bloqueada sigue siendo FEAT-01b |
| Slicing v2 | readme §5.0 S1 (HU-02) y PRD §14 S1: ficha mínima en el S1 | Slicing v2 aprobado por el usuario (`01-requisitos.md` §15, 2026-10-07): ficha en el S2 | El walking skeleton del S1 abre el panel del paciente semilla por ruta directa; la ficha llega en el S2 |
