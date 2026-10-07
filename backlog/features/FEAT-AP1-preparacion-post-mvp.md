# FEAT-AP1 — Preparación para el Post-MVP: snapshot longitudinal, criterio de "listo" de CAP-12 y decisiones futuras

> Linear: [L1D-29](https://linear.app/l1der-lab-mjbc/issue/L1D-29)

**Talla:** M (1 historia técnica, 1 de decisión y 1 ADR futuro sin planificar) · **Sprint:** Post-MVP (US-207, US-208 · DEC-20) · Futuro, sin planificar (US-032 · ADR-7) · **Capacidad:** AC-P.1 (AC-P.1a, AC-P.1b; preparación de CAP-12/CAP-13) · CAP-17 (futuro, ADR-7) · T-4 (sin identidad en el histórico) · **Recorrido principal:** no
**Requisitos:** FR-14 (snapshot longitudinal, dueña) · RN-10, RN-11 (regresión) · TBD-09 (ADR-7)
**Evidencia:** [→ PRD §5 FR-14], [→ PRD §3 Post-MVP (CAP-12, CAP-13), No-objetivos (puntaje de solidez)], [→ PRD §6 RN-10, RN-11], [→ PRD §14 Post-MVP, Futuro], [→ PRD §16 TBD-09], [→ PRD §18.1.2 CAP-12, CAP-13, CAP-17], [→ PRD §18.4 AC-P.1a, AC-P.1b], [→ readme §3.1 `EPISODE_SNAPSHOT` (`snapshot_schema_version = 2`), `RESEARCH_SUBJECT_MAP`], [→ readme §3.2 `ResearchSubjectMap / EpisodeSnapshot`], [→ readme §3.3 #7, #19], [→ backlog/02-adrs.md US-032 · ADR-7]
**Dependencias:** ↪ US-197 (egreso, FEAT-T4b), US-200 (opt-out de investigación), US-193, US-195 (decisiones y evolución, FEAT-11b), US-089 (líneas de tratamiento), US-098 (códigos normalizados), US-038 (rol `research` de solo inserción) · ⛔ DEC-13 (US-023) · escenario más probable (motivo de egreso como código) · 🔗 Regresión [RN-10] → US-046 · 🔗 Regresión [RN-11] → US-049
**Valor:** el MVP no explora cohortes, pero sin un histórico longitudinal bien hecho desde el primer egreso no habrá con qué explorarlas después. Esta Feature deja ese histórico listo, sin identidad, y deja escrito cuándo tendrá sentido construir CAP-12.
**Workaround en el MVP:** sin egreso no se escriben snapshots; el esquema de `EpisodeSnapshot` v2 ya existe desde la migración inicial (US-038), así que no habrá migración de datos al activarlo. ADR-7: etiquetas factuales (diseño, endpoint, n, fecha) y `clinical_evidence_score` reservado (US-168 AC-4).
**Stories:** US-207, US-208 · DEC-20 (6 puntos, Post-MVP) · US-032 · ADR-7 (`?`, Futuro, no suma)

## Fixtures

- **FX-AP1-a · Paciente con trayectoria** (BD de test; `sintetico`; reloj 2026-10-01): **P-LONG** (mama) con diagnóstico 2025-01-10 (CIE-10 `C50.9`), tratamiento previo línea 1 (`ATC-T-TRAS`, 2025-02-01 → 2025-08-01, `end_reason = progresion`), `ClinicalEvent` `progresion` 2025-08-05, decisión `Treatment` línea 2 (`ATC-T-PACL`, 2025-08-20) vinculada a `AN-L1`, `ClinicalEvent` `respuesta_parcial` 2025-11-10; nota clínica con "Juan Pérez CC 7654321"; sin opt-out de investigación.

---

## US-207 — Al egresar, se escribe un `EpisodeSnapshot` longitudinal con líneas, respuestas, progresiones y decisiones, sin identidad ni texto libre

> Linear: [L1D-161](https://linear.app/l1der-lab-mjbc/issue/L1D-161)

`FEAT-AP1` · Post-MVP · Estimación **5** · HU-13 · FR-14 (snapshot, dueña) · AC-P.1a · ↪ US-197, US-200, US-193, US-195 · ⛔ DEC-13 (US-023) · escenario más probable · 🔗 Regresión [RN-10] → US-046 · 🔗 Regresión [RN-11] → US-049

## Story
Como investigador futuro de cohortes, quiero que cada egreso deje la secuencia completa
del caso con fechas relativas y códigos normalizados, sin identidad, para poder estudiar
trayectorias cuando exista la base histórica, sin haber expuesto a ningún paciente.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado P-LONG, cuando se egresa, entonces se inserta un
  `EpisodeSnapshot` con `snapshot_schema_version = 2` y una secuencia de 5 elementos
  ordenados (diagnóstico `C50.9`, línea 1 `ATC-T-TRAS` con fin por progresión,
  progresión, decisión línea 2 `ATC-T-PACL`, respuesta parcial), cada uno con `dayOffset`
  relativo al diagnóstico. `[AC-P.1a]` `[FR-14]`
- **AC-2 (invariante · sin identidad)** · Dado el snapshot del AC-1, cuando se lee con SQL
  crudo, entonces no contiene el UUID del paciente, nombre, documento, fechas absolutas
  ni la nota clínica; solo el seudónimo propio de `ResearchSubjectMap`. `[AC-P.1a]`
  `[RN-10]` `[RN-11]`
- **AC-3 (borde · opt-out de investigación)** · Dado P-LONG con opt-out `investigacion`
  vigente, cuando se egresa, entonces no se escribe snapshot ni fila en
  `ResearchSubjectMap`. `[FR-14]` `[FR-16]`
- **AC-4 (borde · solo inserción)** · Dado el rol de la aplicación sobre el schema
  `research`, cuando se intenta un `UPDATE` o `SELECT` sobre `episode_snapshot` desde
  `clinical-api`, entonces PostgreSQL responde *permission denied*. `[readme §3.1]`
  (asumido en el `SELECT`)
- **AC-5 (borde · datos sin código)** · Dado un tratamiento con `mapping_status =
  no_mapeado`, cuando se escribe el snapshot, entonces el elemento lleva `code = null` y
  `mappingStatus = no_mapeado`, sin texto libre del fármaco. `[RN-27]` `[AC-P.1a]`
- **AC-6 (borde · reactivación y segundo egreso)** · Dado P-LONG reactivado y egresado
  de nuevo, cuando se escribe, entonces el segundo snapshot reutiliza el mismo seudónimo
  y contiene la trayectoria completa hasta el segundo egreso. (asumido)

## Contexto técnico
`EpisodeSnapshotWriter` en `clinical-api`, invocado por el egreso (US-197) en la misma
transacción; arma la secuencia desde `Diagnosis`, `PriorTreatment`, `Treatment` y
`ClinicalEvent` con códigos normalizados y desplazamientos en días; nunca lee el schema
`identity`. Esquema JSON del snapshot v2 versionado en el repo. Tests: Vitest del
*writer* y Supertest + SQL crudo con FX-AP1-a (AC-1…AC-6).

## INVEST
**Small** ✓ un escritor determinista sobre datos ya normalizados.
**Testable** ✓ seis tests.

---

## US-208 · DEC-20 — Criterio de "listo" para construir la exploración de cohortes (CAP-12)

> Linear: [L1D-162](https://linear.app/l1der-lab-mjbc/issue/L1D-162)

`FEAT-AP1` · Post-MVP (al cierre del piloto) · Estimación **1** · — (decisión) · AC-P.1b · D-12 · Dueño: usuario (PO) + entidad médica + oncólogo asesor · 🔗 Relacionada: US-156 (cierre del piloto y decisión sobre el Post-MVP)

## Story
Como product owner, junto con la entidad médica y el oncólogo asesor, quiero dejar
escrito cuándo tiene sentido construir la exploración de cohortes, para que el Post-MVP
no arranque sin volumen, convenio ni consentimiento de investigación suficientes.

> Escenario más probable (a refinar en sprint planning): el criterio exige un volumen mínimo de pacientes con snapshot longitudinal por tipo de cáncer, un convenio de investigación con la entidad médica, el consentimiento de investigación vigente (sin opt-out) en el sistema externo y la validación del oncólogo, porque son los cuatro elementos que enumera AC-P.1b; el número mínimo queda como valor a calibrar.

## AC (Given/When/Then)
- **AC-1** · Dado el acuerdo, cuando se registre en
  `docs/decisions/DEC-20-criterio-listo-cap12.md`, entonces contiene el volumen mínimo de
  pacientes históricos, el convenio requerido, la condición de consentimiento de
  investigación y quién valida, con dueño y fecha. `[AC-P.1b]`
- **AC-2** · Dado el documento, cuando se registre, entonces declara que el volumen mínimo
  es un valor de configuración a calibrar y no un número fijo en el código. `[RN-22]`
  (asumido)
- **AC-3** · Dado el cierre del piloto (US-156), cuando se tome la decisión sobre el
  Post-MVP, entonces el documento de cierre cita esta decisión. (asumido)
- **AC-4** · Dado el criterio, cuando se registre, entonces declara que los pacientes con
  opt-out de investigación no cuentan para el volumen mínimo, porque su snapshot no existe
  (FR-14, FR-16). `[FR-16]` `[AC-P.1b]`

## Contexto técnico
Historia de decisión: el entregable es el documento. No construye CAP-12 ni CAP-13.

## INVEST
**Small** ✓ un acuerdo y un documento.
**Testable** ✓ los AC verifican el contenido del registro.

---

## US-032 · ADR-7 — Scoring de solidez clínica de la evidencia

> Linear: [L1D-163](https://linear.app/l1der-lab-mjbc/issue/L1D-163)

`FEAT-AP1` · Futuro (no planificado) · Estimación **`?`** (no se estima: fuera del MVP; no suma puntos) · — (ADR) · TBD-09 · CAP-17 · Dueño: Ingeniería + oncólogo · **Recorrido principal:** no · **Workaround en el MVP:** etiquetas factuales (diseño, endpoint, n, fecha) y `clinical_evidence_score` reservado (readme §3.3 #7; US-168 AC-4) · ⛔ Bloqueada por: cierre del piloto y decisión sobre el Post-MVP (PRD §14) · 🔗 Bloquea: nada en el MVP

## Story
Como responsable técnico, quiero decidir si y cómo se califica la solidez clínica de una
fuente, para poder mostrarla como metadato verificable en una versión futura sin
convertirla en un criterio de orden ni en una probabilidad de éxito.

## AC (Given/When/Then)
- **AC-1 (invariante)** · Dada cualquier opción, cuando se evalúe, entonces el puntaje
  nunca ordena opciones (el orden sigue siendo el de RN-28), nunca se muestra como
  probabilidad y nunca reemplaza a `relevance_score` (#8). `[RN-28]` `[RN-03]`
  `[readme §3.3 #27]`
- **AC-2 (borde · autorreporte)** · Dado un puntaje calculado o autorreportado por el LLM,
  cuando se evalúe, entonces queda descartado por la misma razón que en #8 (no calibrado).
  `[readme §3.3 #8]`
- **AC-3** · Dado el ADR aprobado, cuando se cierre, entonces
  `docs/architecture/adr/ADR-7-scoring-evidencia-clinica.md` registra la escala elegida,
  quién la valida (oncólogo) y de qué metadatos verificados del corpus se deriva.
  (asumido)
- **AC-4 (MVP)** · Dado el MVP, cuando se audite el código y el contrato, entonces
  `clinical_evidence_score` permanece reservado y sin uso. `[readme §3.3 #7]`

## Contexto técnico
Historia de ADR (copiada de `backlog/02-adrs.md`). Opciones: A · sin puntaje, solo
etiquetas factuales (estado del MVP) · B · nivel de evidencia de una escala estándar
derivada de metadatos verificados, mostrado como etiqueta (requiere SUP-3 y validación
clínica) · descartada: puntaje autorreportado por el LLM (no calibrado, #8). No se
planifica en el MVP y no toca el orden de RN-28.

## INVEST
**Small** ✓ una evaluación de dos opciones.
**Testable** ✓ los AC verifican el ADR y la ausencia de uso en el MVP.
*(Estimable ✗ a propósito: `?` porque es Futuro y depende del cierre del piloto.)*

---

## Conflictos de fuentes

| # | Fuente A | Fuente B | Se siguió |
|---|---|---|---|
| — | PRD §18.1.1, §18.4 AC-P.1 y §18.5: preparación en el Sprint 4, dentro del MVP; readme §5.0 S4 KR3 | Slicing adoptado: snapshot con el egreso, Post-MVP | Slicing: FEAT-AP1 en Post-MVP; el esquema v2 ya existe desde el S1 |
| — | `backlog/01-requisitos.md` §5.4: AC-P.1b "FEAT-AP1 (documento)" sin dueño de decisión | Convención de historias de decisión (DEC con dueño y fecha) | AC-P.1b como DEC-20 (US-208), nueva |
| — | `backlog/02-adrs.md` US-032 · ADR-7: "Feature: — (CAP-17, fuera del MVP)" | Necesidad de ubicar toda historia en una Feature | ADR-7 se ubica en FEAT-AP1 (preparación del futuro), sin sprint ni puntos |
