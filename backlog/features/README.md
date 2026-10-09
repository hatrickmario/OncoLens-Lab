# Backlog de Features — OncoLens (PRD v1.2)

> **Corrida completa de F3 por lotes: cerrada.** Lotes 1 (Pre-S1 y S1), 2 (S2 y S3), 3 (S4 y S5) y 4 (S6, Post-MVP y reconciliación final) escritos, con FEAT-04 (piloto, S3) ajustada en el lote 2. Las Features del S6 marcadas `si-hay-capacidad` y las Post-MVP conservan sus historias completas (cobertura del PRD §18) con `Recorrido principal: no` y *workaround* documentado. Encuadre D-01: análisis de evidencia (`EvidenceAnalysis`), nunca recomendación; consentimiento presunto con opt-out (RN-15). Slicing "por hipótesis" adoptado por el usuario (`backlog/01-requisitos.md` §15).

> **Slicing v2 (aprobado por el usuario el 2026-10-07, `backlog/01-requisitos.md` §15).** Seis sprints recortados al recorrido feliz de la hipótesis, con una demo end-to-end por sprint: Pre-S1 decisiones y contrato · S1 walking skeleton del análisis sobre el paciente semilla · S2 acceso, identidad cifrada, ficha, catálogo, Base del análisis y baseline técnico · S3 ingesta OCR, vista de caso y normalización · S4 revisión, registro manual, faltantes, ingesta del corpus y alta manual · S5 aplicabilidad, hasta 3 opciones, feedback y **G-Demo** · S6 opt-out, auditoría, gate **G-Piloto**, piloto mixto y **G-Éxito**. Lo que sale del MVP comprometido pasa a `Sprint si-hay-capacidad` con `Recorrido principal: no` y un *workaround* en su cabecera; cada Feature afectada registra el cambio frente a PRD §14 / readme §5.0 en `## Conflictos de fuentes`. Las respuestas del usuario a las 7 preguntas de Pre-S1/S1 se citan en los AC como `` `[§15 resp. n]` `` (respuesta *n* de la tabla de `01-requisitos.md` §15).

## Features escritas

| Feature | Talla | CAP / T | Sprint (slicing v2; shc = `si-hay-capacidad`) | Recorrido principal | Requisitos (dueña) | Stories | Puntos | Dependencias |
|---|---|---|---|---|---|---|---|---|
| [FEAT-00 — [Pre-S1] Decisiones previas al Sprint 1](FEAT-00-decisiones-previas.md) | L | — (habilita CAP-02/04/06/08/10, T-5) | Pre-S1 | sí | Contrato `EvidenceAnalysis` y esquema congelados; TBD-04, TBD-11, TBD-17, TBD-19, Q-04 | US-007 · ADR-36, US-008 · DEC-02, US-009 · DEC-03, US-010 · DEC-04, US-011 · DEC-05, US-033 | 12 | ⛔ ADR-39 (US-033 AC-6) |
| [FEAT-PL1 — Plataforma base](FEAT-PL1-plataforma-base.md) | L | T-4, T-5 (DoD) | 1 · 2 | sí | RN-14, RN-22; NFR-05, NFR-10 (S1), NFR-13; SEG-08, SEG-09, SEG-12 | US-034 … US-037, US-213 | 18 (S1) · 3 (S2) | ↪ US-033 |
| [FEAT-PL2 — Esquema completo, seed y roles](FEAT-PL2-esquema-seed-roles.md) | L | T-4 (AC-T4.4) | 1 · 2 | sí | OL-01; FR-17 (esquema); SEG-06 (BD) | US-038, US-039, US-040 | 8 (S1) · 5 (S2) | ↪ US-033, US-035 · ⛔ DEC-05, DEC-04 (escenario / workaround Q-07) |
| [FEAT-PL3 — Catálogos clínicos v1](FEAT-PL3-catalogos-clinicos.md) | L | — (consumida por CAP-02/03/04/05/08) | 2 · `si-hay-capacidad` | sí (US-042: no) | NFR-14; RN-20 (configuración); RN-29 (mínimo S1) | US-041, US-042, US-043, US-018 · DEC-08 | 9 (S2) · 3 (shc) | ↪ US-033, US-037 · ⛔ DEC-04 (workaround Q-07) |
| [FEAT-T4a — Acceso, identidad, pacientes y desidentificación](FEAT-T4a-acceso-identidad-pacientes.md) | XL (propone división) | T-4 | 1 · 2 · 4 · 6 | sí | FR-01, FR-02, FR-03 (manual), FR-17; RN-10, RN-11, RN-12, RN-16, RN-18 (campos) | US-211 (S1), US-044 … US-050, US-013 · ADR-40 | 8 (S1) · 21 (S2) · 5 (S4) · 3 (S6) | ↪ PL1, PL2 · ⛔ ADR-40 (US-049) |
| [FEAT-02a — Ficha mínima](FEAT-02a-ficha-minima.md) | M | CAP-02 (S1), T-1 | 2 | sí | FR-04 (S1) | US-051, US-019 · DEC-09 | 6 | ↪ US-039, US-044, US-046 |
| [FEAT-06a — Análisis de evidencia: walking skeleton](FEAT-06a-analisis-walking-skeleton.md) | XL (propone división) | CAP-06, CAP-10 (S1), CAP-05; T-1, T-4 | 1 · 4 | sí | FR-09 (S1), FR-25 (contrato); RN-02, RN-05 (recuperación), RN-06, RN-30; SEG-07, SEG-13 | US-012 · ADR-39, US-052 … US-057 | 29 (S1) · 6 (S4) | ⛔ ADR-39 (adapters reales) · ↪ T4a (US-211, US-049), T1a, T2a, 06c |
| [FEAT-06c — Corpus científico](FEAT-06c-corpus-cientifico.md) | XL (propone división por sprint) | CAP-06 | 1 · 4 · `si-hay-capacidad` | sí (US-119: no) | FR-19; RN-21; RN-05 (versionado); TBD-20 (CAL) | US-058, US-059 (S1) · US-117, US-118, US-120 (S4) · US-119 (shc) | 10 (S1) · 16 (S4) · 3 (shc) | ⛔ ADR-39 · ⛔ ADR-36 (S3) · 🔗 Medido en: US-132 |
| [FEAT-10a — Panel y opción descrita](FEAT-10a-panel-opcion-descrita.md) | M | CAP-10 (S1), CAP-05 | 1 · 3 | sí | FR-09 (UI S1), FR-10 (UI); RN-03; NFR-12 | US-060, US-061, US-062 | 8 (S1) · 3 (S3) | ↪ US-053, US-211, US-051 |
| [FEAT-T1a — Citas, soporte y procedencia](FEAT-T1a-citas-soporte-procedencia.md) | L | T-1, CAP-10 | 1 · 3 · 5 | sí | RN-01, FR-10, RN-04, RN-07, RN-25 | US-063, US-064 (S1) · US-065 (S3) · US-127 (S5) | 10 (S1) · 3 (S3) · 3 (S5) | ⛔ ADR-39 (NLI real) |
| [FEAT-T2a — Base del análisis S1](FEAT-T2a-base-analisis-s1.md) | M | T-2 | 2 | sí | FR-27 (a, d, e, f, omitidas) | US-066, US-067 | 8 | ↪ US-055, US-059, US-065 · 🔗 US-053 (persistencia) |
| [FEAT-T3 — Control humano](FEAT-T3-control-humano.md) | L | T-3, CAP-10 (AC-10.3) | 1 · 4 · 5 | sí | RN-19, RN-23, RN-26; AC-T3.2 | US-068 … US-071 | 5 (S1) · 2 (S4) · 3 (S5) | US-071 ↪ US-101, US-136, FEAT-04 US-005, US-124 |
| [FEAT-T5a — Baseline de evaluación y suite en DoD](FEAT-T5a-baseline-evaluacion.md) | XL (propone división) | T-5 | 1 · 2 | sí | FR-20 (S1), TBD-02, TBD-03 | US-014 · ADR-41, US-016 · DEC-06, US-017 · DEC-07, US-072 … US-075 | 18 (S1) · 1 + `?` (S2) | ⛔ ADR-39, ADR-41 · ⛔ DEC-02 (escenario) |
| [FEAT-01a — Carga de documentos, cola y visor](FEAT-01a-carga-y-visor.md) | L | CAP-01, T-1 | 2 · 3 · `si-hay-capacidad` | sí (US-076, US-078, US-079, US-212) · no (US-077, US-080, US-081) | FR-05, FR-07, NFR-07 | US-076 … US-081, US-212 | 13 (S2) · 2 (S3) · 9 (shc) | ↪ US-034, US-038, US-044, US-054 · 🔗 Medido en: US-103 |
| [FEAT-01b — Extracción local: OCR, gate de PII, confianza y propuesta de códigos](FEAT-01b-extraccion-ocr-pii.md) | XL (propone división) | CAP-01, CAP-02, CAP-03, T-4 | 3 | sí | FR-06, IA-08, SEG-04 (documentos) | US-082 … US-087 | 31 | ⛔ ADR-39, ADR-40 · ⛔ DEC-09, DEC-04 (escenario / Q-07) · 🔗 Medido en: US-103 … US-106 |
| [FEAT-02b — Vista de caso, tendencia y contexto ampliado](FEAT-02b-vista-de-caso.md) | XL (propone división) | CAP-02, CAP-06 (AC-06.2), CAP-11 (AC-11.4), T-1, T-4 | 3 · `si-hay-capacidad` | sí · no (US-091, US-094) | FR-21 (vista), FR-04 (S2), NFR-03, NFR-12 | US-088 … US-094 | 21 (S3) · 8 (shc) | ↪ US-087, US-051, US-052, US-053 · ⛔ DEC-08 (escenario) · 🔗 Medido en: US-105 |
| [FEAT-02c — Resumen del caso verificable](FEAT-02c-resumen-del-caso.md) | L | CAP-02 (AC-02.5), T-1, T-3, T-4 | `si-hay-capacidad` (primer candidato) | no | FR-21 (resumen), ADR-34 | US-095, US-096, US-097 | 13 | ↪ US-088, US-049, US-064 · ⛔ ADR-39 · 🔗 Medido en: US-105 |
| [FEAT-03a — Normalización final, duplicados y no reemplazo silencioso](FEAT-03a-normalizacion-duplicados.md) | L | CAP-03, T-3 | 3 | sí | FR-22 (S2), RN-08, RN-27, ADR-33 | US-098, US-099, US-100 | 15 | ⛔ DEC-09, DEC-04 (escenario / Q-07) · 🔗 Medido en: US-106 |
| [FEAT-10b — Avisos de datos no verificados, en conflicto y faltantes](FEAT-10b-avisos-datos-no-verificados.md) | M | CAP-10, T-3 | 4 · 5 | sí | FR-11 | US-101 (S4) · US-136 (S5) | 5 (S4) · 5 (S5) | ↪ US-053, US-061, US-065, US-087 · S5: ↪ US-099, US-124, FEAT-04 US-006 |
| [FEAT-T1b — Auditoría de accesos y completa (S6)](FEAT-T1b-auditoria.md) | M | T-1, T-4 | 6 · `si-hay-capacidad` | sí (US-151: no) | FR-18, SEG-03 | US-102, US-150 (S6) · US-151 (shc) | 8 (S6) · 3 (shc) | ↪ US-038, US-051, US-088, US-212, US-149, US-148 · 🔗 Produce para: US-143 |
| [FEAT-T5b — Ampliación de la evaluación](FEAT-T5b-ampliacion-evaluacion.md) | XL (propone división por sprint) | T-5 | 3 · 4 · 5 · `si-hay-capacidad` | sí · no (US-104, US-106, US-133, US-141) | FR-20 (ampliación), TBD-03 (OCR); verificación de G-Demo | US-103, US-105 (S3) · US-131 (S4) · US-132, US-140, US-142 (S5) · US-104, US-106, US-133, US-141 (shc) | 10 (S3) · 3 (S4) · 15 (S5) · 14 (shc) | ↪ US-072, US-074 · ⛔ ADR-39 · ⛔ DEC-07 (escenario) · US-142 ↪ US-139, US-024 · DEC-14 |
| [FEAT-04 — Información faltante](FEAT-04-informacion-faltante.md) | L | CAP-04 · T-1 · T-2 (b) | 4 | sí | FR-23; RN-29 | DEC-01, US-001 … US-006 | 23 | ⛔ DEC-01 (P-03, no bloquea), DEC-05 · ↪ US-041, US-042, US-052, US-053, US-061, US-088, US-090, US-079, US-110, US-111 · 🔗 Medido en: US-131 |
| [FEAT-03b — Revisión, conflictos y registro manual](FEAT-03b-revision-conflictos-registro-manual.md) | L | CAP-03, CAP-04 (AC-04.1), T-3 | 4 · `si-hay-capacidad` | sí (US-109: no) | FR-08, FR-22 (S3), registro manual (Q-03) | US-107 … US-111 | 16 (S4) · 5 (shc) | ↪ US-098, US-099, US-100, US-090 · ⛔ DEC-09, DEC-05 (escenario) |
| [FEAT-06b — Híbrida, expansión bilingüe, filtros y faltantes en la consulta](FEAT-06b-hibrida-y-filtros.md) | L | CAP-06, CAP-05 (AC-05.1), CAP-04 (AC-04.3) | `si-hay-capacidad` · 5 | sí (US-116) · no (US-112…US-115) | FR-09 (S3), IA-02, IA-03 | US-112 … US-116 | 16 (shc) · 3 (S5) | ↪ US-055, US-052, US-117, FEAT-04 US-006 · ⛔ ADR-39 · 🔗 Medido en: US-133 |
| [FEAT-08b — Aplicabilidad paciente ↔ evidencia](FEAT-08b-aplicabilidad.md) | XL (propone división) | CAP-08, CAP-04 (AC-04.3), CAP-10 (AC-10.2), T-1 | 5 | sí | FR-25, RN-28 (agregación y comparador), IA-06, TBD-13 | US-021 · DEC-11, US-121 … US-126 | 29 | ⛔ DEC-11 (escenario, P-03), ADR-39 · ↪ US-055, US-063, US-064, US-118, FEAT-04 US-006 · 🔗 Medido en: US-132 |
| [FEAT-T2b — Base del análisis: incisos del S3](FEAT-T2b-base-analisis-s3.md) | M | T-2, CAP-04 (AC-04.3) | 4 · `si-hay-capacidad` | sí (US-128) · no (US-129, US-130) | FR-27 (b, c, g) | US-128, US-129, US-130 | 3 (S4) · 8 (shc) | ↪ US-066, US-067, FEAT-04 US-006, US-064, US-124 · ⛔ ADR-39 · ⛔ DEC-01 (escenario) |
| [FEAT-10c — Hasta 3 opciones ordenadas por aplicabilidad](FEAT-10c-hasta-3-opciones-por-aplicabilidad.md) | L | CAP-10 (AC-10.1, AC-10.2), CAP-08 (AC-08.8, consumo) | 5 · `si-hay-capacidad` | sí (US-015 · ADR-42: no) | FR-09 (S4: hasta 3 y orden), RN-28 (orden visible), TBD-08 | US-134, US-135, US-015 · ADR-42 | 8 (S5) · 3 (shc) | ↪ US-055, US-061, US-064, US-125, US-126 · ⛔ DEC-11 (escenario), ADR-39 · 🔗 Medido en: US-140, US-141 |
| [FEAT-T5c — Feedback al cerrar cada análisis: validación clínica](FEAT-T5c-feedback-validacion-clinica.md) | L | T-5 (VM-3, VM-4, VM-5) | 5 | sí | FR-20 (VM-4/VM-5, `AnalysisFeedback`, HU-25); validación de DEC-01/DEC-11 por feedback (P-03); M-08.1 (DEC-14) | US-137, US-138, US-139, US-024 · DEC-14 | 12 | ↪ US-053, US-061, FEAT-04 US-005/US-006, US-045 · ⛔ DEC-02 (escenario) |
| [FEAT-T4c — Bloqueo por opt-out de `analisis_ia` (reducida)](FEAT-T4c-opt-out-analisis-ia.md) | L | T-4 (AC-T4.6), T-3 (AC-T3.3) | 6 | sí | RN-15, FR-16 (S5; marcas por CLI), G-9 (parte opt-out), TBD-21 | US-148, US-149, US-022 · DEC-12, US-026 · DEC-16 | 10 | ↪ US-045, US-047, US-052, US-096 · ⛔ DEC-16, DEC-12 (escenarios) |
| [FEAT-T4d — Gate G-Piloto](FEAT-T4d-gate-g-piloto.md) | XL (propone división) | T-4 (AC-T4.1, AC-T4.4, AC-T4.5) | 6 · `si-hay-capacidad` | sí (US-020 · DEC-10 y US-146: no) | RN-13, SEG-08, SEG-09, SEG-11, NFR-06, FR-16 (job de mayoría), RN-20 (piloto), TBD-07, TBD-10, TBD-16 | US-143 … US-147, US-027 · ADR-43, US-020 · DEC-10, US-025 · DEC-15, US-029 · DEC-17, US-030 · DEC-18, US-031 · DEC-19 | 28 (S6) · 5 (shc) | ↪ US-037, US-039, US-034, US-035, US-040, US-050, US-083, US-148, US-151 · ⛔ DEC-12, 15, 16, 17, 18, 19 (escenarios) |
| [FEAT-T5d — Medición del valor clínico en el piloto mixto y evaluación de las capacidades diferidas](FEAT-T5d-medicion-valor-piloto.md) | XL (propone división: núcleo / anexos) | T-5 (VM-1…VM-6, G-15) · CAP-07/08/09/11 (medibles) | 6 · anexos: 6 `si-hay-capacidad` y Post-MVP | sí (núcleo US-152…US-156) · no (anexos) | FR-20 (piloto), G-15, M-02.5, M-08.1 (cohorte real); M-07.1, M-07.3, M-08.5, M-09.1, M-09.2, M-11.1…M-11.4 | US-152 … US-161 | 16 (S6) · 8 (S6 shc) · 6 (Post-MVP) | ↪ US-075, US-139, US-142, US-143 · ⛔ DEC-02 (escenario) |
| [FEAT-09 — Vigencia visible de la evidencia](FEAT-09-vigencia-visible.md) | M | CAP-09, CAP-10 (AC-10.2) | 6 `si-hay-capacidad` | no | FR-26; TBD-15 (CAL) | US-162 … US-165 | 12 | ↪ US-127, US-119, US-061, US-174 · ⛔ ADR-36 · 🔗 Medido en: US-158 |
| [FEAT-07 — Síntesis de evidencia: acuerdos y discrepancias explicadas](FEAT-07-sintesis-evidencia.md) | L | CAP-07, CAP-05 (AC-05.3), T-1 | 6 `si-hay-capacidad` (1.º punto de recorte) | no | FR-24 | US-166 … US-170 | 19 | ↪ US-055, US-064, US-127, US-130 · ⛔ ADR-39 · 🔗 Medido en: US-157 |
| [FEAT-05 — Plantillas de preguntas clínicas](FEAT-05-plantillas-preguntas.md) | M | CAP-05 (AC-05.2) | 6 `si-hay-capacidad` | no | FR-28 | US-171, US-172, US-173 | 9 | ↪ US-041, US-042, US-052, US-115 · ⛔ US-020 · DEC-10 (escenario) |
| [FEAT-11a — Historial, marcas de desactualizado, re-ejecución y comparación](FEAT-11a-historial-reejecucion.md) | XL (propone división) | CAP-11, T-2 (AC-T2.4), T-1 (AC-T1.5) | 6 `si-hay-capacidad` | no | FR-12 | US-174 … US-179 | 26 | ↪ US-053, US-066, US-119, US-148, US-056, US-150 · 🔗 Medido en: US-159 |
| [FEAT-01c — Registro de paciente asistido por OCR](FEAT-01c-registro-asistido-ocr.md) | M | CAP-01, T-3 (AC-T3.2), T-4 | 6 `si-hay-capacidad` | no | FR-03 (asistido), RN-09 | US-180, US-181, US-182 | 11 | ↪ US-047, US-076, US-078, US-082, US-083 · ⛔ ADR-40 |
| [FEAT-PL5 — Hardening mínimo y observabilidad operable](FEAT-PL5-hardening-observabilidad.md) | L | T-4, T-1 | 6 `si-hay-capacidad` · Post-MVP (ADR-44) | no | NFR-10, G-10, IA-11, SEG-03 (*mutation*) | US-183, US-184, US-185, US-028 · ADR-44 | 11 (S6 shc) · 3 (Post-MVP) | ↪ US-034, US-037, US-044…US-046, US-056 |
| [FEAT-08c — Agente acotado: búsqueda complementaria](FEAT-08c-agente-busqueda-complementaria.md) | L | CAP-08 (AC-08.7) | Post-MVP | no | FR-30, IA-05, G-16; TBD-18 (CAL) | US-186, US-187, US-188 | 13 | ↪ US-055, US-063, US-064, US-124, US-056 · ⛔ ADR-39, DEC-11 (escenario) · 🔗 Medido en: US-161 |
| [FEAT-11c — Memoria de análisis previos no citable](FEAT-11c-memoria-analisis.md) | L | CAP-11, T-4 (AC-T4.3) | Post-MVP | no | FR-29 (c), RN-24; TBD-14 (CAL) | US-189 … US-192 | 16 | ↪ US-049, US-057, US-064, US-175, US-195 · ⛔ ADR-40 · 🔗 Medido en: US-160 |
| [FEAT-11b — Decisión de tratamiento y evolución](FEAT-11b-decision-evolucion.md) | L | CAP-11, CAP-02 (AC-02.3), T-3 | Post-MVP | no | FR-13, FR-29 (a, b) | US-193 … US-196 | 16 | ↪ US-088, US-098, US-053, US-175 |
| [FEAT-T4b — Ciclo de vida del paciente y administración de opt-out](FEAT-T4b-ciclo-de-vida-opt-out.md) | XL (propone división) | T-4 (AC-T4.6), T-3 (AC-T3.3), CAP-11 (AC-11.5) | Post-MVP | no | FR-14, FR-16 (UI), RN-17, RN-18 (baja total); TBD-06 (DEC-13) | US-197 … US-202, US-023 · DEC-13 | 27 | ↪ US-047, US-149, US-148, US-150, US-203 · ⛔ DEC-13, DEC-12 (escenarios) |
| [FEAT-T4e — Equipo tratante y autorización por paciente](FEAT-T4e-equipo-tratante.md) | M | T-4, T-3 (AC-T3.3) | Post-MVP (P-02) | no | FR-15, G-9 (equipo), SEG-02 | US-203, US-204 | 8 | ↪ US-045, US-038, US-150 |
| [FEAT-T2c — Base del análisis: incisos h e i](FEAT-T2c-base-analisis-memoria-agente.md) | M | T-2, CAP-08 (AC-08.7), CAP-11 (AC-11.6) | Post-MVP | no | FR-27 (h, i) | US-205, US-206 | 6 | ↪ US-066, US-067, US-189, US-188 |
| [FEAT-AP1 — Preparación para el Post-MVP y decisiones futuras](FEAT-AP1-preparacion-post-mvp.md) | M | AC-P.1, CAP-17 (futuro) | Post-MVP · Futuro (ADR-7) | no | FR-14 (snapshot longitudinal) | US-207, US-208 · DEC-20, US-032 · ADR-7 | 6 + `?` (ADR-7, no suma) | ↪ US-197, US-200, US-193, US-195 · ⛔ DEC-13 (escenario) |
| [FEAT-T4f — Job automático de retención](FEAT-T4f-job-retencion.md) | M | T-4 | Post-MVP | no | FR-17 (job), RN-18 (job) | US-209, US-210 | 8 | ↪ US-047, US-199 · ⛔ DEC-15 (escenario) |

## Stories

| ID | Título | Feature | Sprint | Est. | Recorrido |
|---|---|---|---|---|---|
| US-007 · ADR-36 | [Pre-S1] Fuentes y licencias del corpus científico | FEAT-00 | Pre-S1 (cierre ≤ S1) | 3 | sí |
| US-008 · DEC-02 | [Pre-S1] Protocolo y metas de VM-1…VM-6 | FEAT-00 | Pre-S1 | 1 | sí |
| US-009 · DEC-03 | [Pre-S1] Estimación de capacidad S1–S4 | FEAT-00 | Pre-S1 | 1 | sí |
| US-010 · DEC-04 | [Pre-S1] Términos de uso de LOINC, CUPS y ATC | FEAT-00 | Pre-S1 | 1 | sí |
| US-011 · DEC-05 | [Pre-S1] Destino de TNM y Gleason/ISUP en próstata | FEAT-00 | Pre-S1 | 1 | sí |
| US-033 | [Pre-S1] El contrato `EvidenceAnalysis` y el esquema de datos quedan congelados y verificables | FEAT-00 | Pre-S1 | 5 | sí |
| US-034 | El stack levanta con Compose y solo `web` publica un puerto | FEAT-PL1 | 1 | 5 | sí |
| US-035 | Los secretos y certificados se generan con scripts y nunca se versionan | FEAT-PL1 | 1 | 3 | sí |
| US-036 | La CI valida build, contratos y bloquea secretos y PII en el repositorio | FEAT-PL1 | 1 | 5 | sí |
| US-037 | Toda configuración calibrable vive en variables validadas al arranque y los logs salen en JSON con `traceId` | FEAT-PL1 | 2 | 3 | sí |
| US-213 | La CI aplica umbrales de tamaño y complejidad y reglas de dependencias entre capas en los dos backends y en `web` | FEAT-PL1 | 1 | 5 | sí |
| US-038 | La migración inicial crea el esquema completo de readme §3.1 | FEAT-PL2 | 1 | 5 | sí |
| US-039 | El seed sintético carga los pacientes de demo y se niega a correr en el entorno piloto | FEAT-PL2 | 1 | 3 | sí |
| US-040 | El rol `rag_corpus` solo accede al schema `corpus` y la CI lo prueba | FEAT-PL2 | 2 | 5 | sí |
| US-041 | El catálogo clínico v1 se monta en ambos backends y una versión distinta responde `409` | FEAT-PL3 | 2 | 5 | sí |
| US-042 | El validador mínimo impide publicar un catálogo con ítems sin destino o con estándares no permitidos | FEAT-PL3 | `si-hay-capacidad` | 3 | no |
| US-043 | Solo los tipos de cáncer habilitados se analizan; el resto responde `tipo_no_habilitado` sin invocar a la IA | FEAT-PL3 | 2 | 3 | sí |
| US-018 · DEC-08 | Umbrales de tendencia por biomarcador | FEAT-PL3 | 2 | 1 | sí |
| US-211 | Sesión mínima del S1: login con cookie opaca y guard en `web` y `clinical-api` | FEAT-T4a | 1 | 3 | sí |
| US-044 | Expiración, cierre de sesión y bloqueo por intentos fallidos | FEAT-T4a | 2 | 3 | sí |
| US-045 | Los usuarios se gestionan por CLI y cada acción exige el permiso de su rol | FEAT-T4a | 2 | 3 | sí |
| US-046 | La identidad del paciente se guarda cifrada y se busca por índice ciego | FEAT-T4a | 2 | 5 | sí |
| US-047 | Registro manual de un paciente con identidad cifrada, convenio y retención | FEAT-T4a | 4 | 5 | sí |
| US-048 | Listado y búsqueda exacta de pacientes | FEAT-T4a | 2 | 5 | sí |
| US-049 | El contexto que sale hacia la IA está siempre desidentificado | FEAT-T4a | 1 | 5 | sí |
| US-050 | Los datos reales solo se procesan con modelos locales, sin respaldo en la nube | FEAT-T4a | 6 | 3 | sí |
| US-013 · ADR-40 | Detección y enmascaramiento de PII en texto libre y documentos | FEAT-T4a | 2 | 5 | sí |
| US-051 | Veo la ficha mínima del paciente con su diagnóstico vigente y sus biomarcadores recientes | FEAT-02a | 2 | 5 | sí |
| US-019 · DEC-09 | Reglas del semáforo de biomarcadores y de vigencia de diagnósticos | FEAT-02a | 2 | 1 | sí |
| US-012 · ADR-39 | Evaluación y selección de modelos locales y runtime | FEAT-06a | 1 (inicio) | 8 | sí |
| US-052 | El gateway valida la pregunta y envía a `rag-orchestrator` el contexto clínico del caso | FEAT-06a | 1 | 5 | sí |
| US-053 | El análisis queda persistido antes de responder y un fallo nunca muestra resultados | FEAT-06a | 1 | 5 | sí |
| US-054 | `clinical-api` y `rag-orchestrator` se autentican con un JWT de servicio asimétrico | FEAT-06a | 1 | 3 | sí |
| US-055 | `/rag/query` recupera evidencia vigente, aplica el umbral y responde "sin evidencia" sin invocar al LLM | FEAT-06a | 1 | 8 | sí |
| US-056 | El límite de consultas, el semáforo de inferencia y el tiempo máximo protegen el LLM local | FEAT-06a | 4 | 3 | sí |
| US-057 | Las instrucciones del prompt quedan separadas de los datos para resistir *prompt injection* | FEAT-06a | 4 | 3 | sí |
| US-058 | El catálogo del corpus y la colección de Milvus se crean con su esquema final | FEAT-06c | 1 | 5 | sí |
| US-059 | El corpus semilla de mama y próstata se carga solo con documentos de licencia aceptada | FEAT-06c | 1 | 5 | sí |
| US-060 | El navegador pide el análisis solo a `web` mediante un Route Handler | FEAT-10a | 1 | 3 | sí |
| US-061 | El panel muestra la opción descrita con sus citas, la relevancia como metadato secundario y las descartadas aparte | FEAT-10a | 1 | 5 | sí |
| US-062 | El panel resuelve los estados de espera, sin evidencia y error sin mostrar detalles internos | FEAT-10a | 3 | 3 | sí |
| US-063 | Cada cita de una opción apunta a un chunk recuperado en esa consulta y copia sus datos del corpus | FEAT-T1a | 1 | 5 | sí |
| US-064 | Las opciones sin soporte van a descartadas y las afirmaciones sueltas sin soporte se omiten y se cuentan | FEAT-T1a | 1 | 5 | sí |
| US-065 | Cada dato del contexto enviado a la IA viaja etiquetado con su procedencia y los rechazados nunca entran | FEAT-T1a | 3 | 3 | sí |
| US-066 | Todo análisis, incluido "sin evidencia", trae la Base del análisis con los incisos del S1 | FEAT-T2a | 2 | 5 | sí |
| US-067 | El panel muestra el resumen de la Base del análisis sin expandir y explica qué se buscó cuando no hay evidencia | FEAT-T2a | 2 | 3 | sí |
| US-068 | Ningún texto de la UI ni salida generada usa términos prescriptivos de la lista prohibida | FEAT-T3 | 1 | 3 | sí |
| US-069 | Toda salida generada muestra el aviso de IA y la etiqueta "Uso académico/investigación" | FEAT-T3 | 1 | 2 | sí |
| US-070 | El análisis nunca ejecuta acciones clínicas por su cuenta | FEAT-T3 | 4 | 2 | sí |
| US-071 | Los avisos clínicos nunca bloquean; solo bloquean las reglas legales y de acceso | FEAT-T3 | 5 | 3 | sí |
| US-014 · ADR-41 | Framework y protocolo de evaluación de calidad de la IA | FEAT-T5a | 1 | 3 | sí |
| US-016 · DEC-06 | Revisión clínica de la muestra del dataset de evaluación y del diccionario de significancia | FEAT-T5a | 1 | 1 | sí |
| US-017 · DEC-07 | Metas definitivas de evaluación técnica tras el baseline | FEAT-T5a | 2 (cierre) | 1 | sí |
| US-072 | La suite `evaluate` mide recuperación, fidelidad, "sin evidencia", privacidad y lenguaje de forma reproducible | FEAT-T5a | 1 | 8 | sí |
| US-073 | El umbral de relevancia se calibra y el baseline técnico del S1 queda registrado | FEAT-T5a | 2 | ? (3–5) | sí |
| US-074 | Todo PR que cambie modelo, prompt, umbral, catálogo o corpus ejecuta la suite y adjunta el reporte | FEAT-T5a | 1 | 3 | sí |
| US-075 | El baseline manual de VM-1 y VM-2 se mide con los oncólogos antes de cerrar el S1 | FEAT-T5a | 1 | 3 | sí |
| US-076 | El oncólogo sube un PDF y el sistema lo valida, lo guarda y encola su extracción | FEAT-01a | 2 | 5 | sí |
| US-077 | El oncólogo sube varios PDFs en una sola acción y cada uno avanza por su cuenta | FEAT-01a | `si-hay-capacidad` | 3 | no |
| US-078 | La cola de extracción procesa cada documento una sola vez, reintenta y nunca deja documentos colgados | FEAT-01a | 2 | 5 | sí |
| US-079 | Desde la ficha y la vista de caso subo documentos y veo el estado de cada uno | FEAT-01a | 2 | 3 | sí |
| US-080 | Desde un dato extraído abro el documento de origen en la página del valor | FEAT-01a | `si-hay-capacidad` | 3 | no |
| US-081 | Un documento en cuarentena o con identidad distinta se muestra con su motivo y no aporta datos | FEAT-01a | `si-hay-capacidad` | 3 | no |
| US-212 | Descargo el PDF de origen de un dato desde la ficha o la vista de caso | FEAT-01a | 3 | 2 | sí |
| US-082 | `/documents/extract` lee el PDF en memoria, aplica OCR solo donde hace falta y estructura los datos clínicos | FEAT-01b | 3 | 8 | sí |
| US-083 | Un documento con datos personales inesperados queda en cuarentena sin persistir nada | FEAT-01b | 3 | 5 | sí |
| US-084 | La confianza de cada dato extraído se calcula con señales deterministas, nunca con la que declara el LLM | FEAT-01b | 3 | 5 | sí |
| US-085 | La extracción incluye eventos fechados, tratamientos previos y atributos clínicos con su procedencia | FEAT-01b | 3 | 5 | sí |
| US-086 | Backend 2 propone códigos del catálogo con su confianza, o `no_mapeado`, y nunca inventa uno | FEAT-01b | 3 | 3 | sí |
| US-087 | Lo extraído se persiste en una sola transacción, sin datos parciales y sin duplicar al reprocesar | FEAT-01b | 3 | 5 | sí |
| US-088 | `GET …/case` arma el timeline con eventos derivados, sin duplicados y sin datos rechazados | FEAT-02b | 3 | 5 | sí |
| US-089 | La vista de caso agrupa los tratamientos previos por línea y muestra series de biomarcadores y atributos | FEAT-02b | 3 | 5 | sí |
| US-090 | Veo la vista de caso con el timeline, la sección sin fecha confiable, los tratamientos y las series | FEAT-02b | 3 | 5 | sí |
| US-091 | La tendencia de cada biomarcador se calcula con el umbral del catálogo y se muestra en la ficha, la vista de caso y el contexto | FEAT-02b | `si-hay-capacidad` | 3 | no |
| US-092 | La ficha muestra los datos extraídos con su origen, confianza, revisión y semáforo | FEAT-02b | 3 | 3 | sí |
| US-093 | El contexto del análisis incluye las tendencias y los eventos extraídos, desidentificados | FEAT-02b | 3 | 3 | sí |
| US-094 | Registro a mano tratamientos previos y atributos clínicos que no están en los documentos | FEAT-02b | `si-hay-capacidad` | 5 | no |
| US-095 | Backend 2 genera el resumen y solo devuelve afirmaciones respaldadas por los datos que referencian | FEAT-02c | `si-hay-capacidad` | 5 | no |
| US-096 | `clinical-api` pide el resumen con referencias opacas, lo persiste antes de responder y lo enlaza a los datos | FEAT-02c | `si-hay-capacidad` | 5 | no |
| US-097 | Veo el resumen del caso con sus enlaces, los avisos y cuántas afirmaciones se omitieron | FEAT-02c | `si-hay-capacidad` | 3 | no |
| US-098 | Backend 1 decide la normalización final de todo dato, también del manual, y nunca acepta un código fuera del catálogo | FEAT-03a | 3 | 5 | sí |
| US-099 | El mismo dato en dos documentos queda como un solo dato con dos fuentes, y dos valores distintos del mismo día quedan en conflicto | FEAT-03a | 3 | 5 | sí |
| US-100 | Un dato extraído nunca reemplaza en silencio a uno verificado; en diagnósticos decide la fecha | FEAT-03a | 3 | 5 | sí |
| US-101 | La tarjeta de la opción avisa cuando el análisis depende de datos sin verificar, sin bloquear nada | FEAT-10b | 4 | 5 | sí |
| US-102 | Cada lectura de la ficha, de la vista de caso y de un documento queda auditada sin datos personales | FEAT-T1b | 6 | 3 | sí |
| US-103 | La suite mide la exactitud de la extracción, su p95, la calidad de `auto_aceptado` y el gate de PII en documentos | FEAT-T5b | 3 | 5 | sí |
| US-104 | Los umbrales de confianza del OCR se calibran con el set de referencia y quedan en configuración | FEAT-T5b | `si-hay-capacidad` | 3 | no |
| US-105 | La suite mide la fidelidad del caso reconstruido, el origen de cada dato, el soporte del resumen y el p95 de la vista de caso | FEAT-T5b | 3 | 5 | sí |
| US-106 | La suite mide duplicados fusionados, conflictos detectados, fusiones incorrectas y mapeo terminológico | FEAT-T5b | `si-hay-capacidad` | 5 | no |
| DEC-01 | Catálogo de datos críticos de mama y próstata revisado por el oncólogo (sin firma formal, P-03) | FEAT-04 | 4 | 1 | sí |
| US-001 | El catálogo de datos críticos se publica versionado y solo si cada ítem tiene campo de destino | FEAT-04 | 4 | 5 | sí |
| US-002 | El checklist calcula de forma determinista el estado de cada dato crítico | FEAT-04 | 4 | 5 | sí |
| US-003 | El checklist se expone por API en `/completeness`, en la vista de caso y en la ficha | FEAT-04 | 4 | 3 | sí |
| US-004 | En la vista de caso veo el checklist y desde un faltante puedo cargarlo o registrarlo | FEAT-04 | 4 | 3 | sí |
| US-005 | Antes de analizar, el panel lista los faltantes y me deja cargar información o continuar con aviso | FEAT-04 | 4 | 3 | sí |
| US-006 | Los faltantes viajan al análisis como "desconocido" y quedan persistidos con el análisis | FEAT-04 | 4 | 3 | sí |
| US-107 | El oncólogo verifica, corrige o rechaza un dato extraído y confirma o descarta un diagnóstico en conflicto | FEAT-03b | 4 | 5 | sí |
| US-108 | En la vista de caso tengo una lista de pendientes de revisión con sus acciones | FEAT-03b | 4 | 3 | sí |
| US-109 | El oncólogo resuelve los valores en conflicto y mapea los términos no reconocidos | FEAT-03b | `si-hay-capacidad` | 5 | no |
| US-110 | Registro a mano un biomarcador o un dato del diagnóstico y queda normalizado por Backend 1 | FEAT-03b | 4 | 5 | sí |
| US-111 | Formularios de registro manual de biomarcadores y diagnóstico, prellenables desde un faltante | FEAT-03b | 4 | 3 | sí |
| US-112 | La recuperación combina *dense* y *sparse* y mantiene la relevancia del *reranker* | FEAT-06b | `si-hay-capacidad` | 5 | no |
| US-113 | Una pregunta en español recupera también evidencia en inglés, y viceversa | FEAT-06b | `si-hay-capacidad` | 3 | no |
| US-114 | Las fuentes y los filtros del panel se aplican de verdad a la búsqueda y al contexto | FEAT-06b | `si-hay-capacidad` | 5 | no |
| US-115 | El panel ofrece los selectores de fuentes y filtros que el backend ya aplica | FEAT-06b | `si-hay-capacidad` | 3 | no |
| US-116 | Los datos críticos faltantes viajan como "desconocido" al prompt y enriquecen la consulta | FEAT-06b | 5 | 3 | sí |
| US-117 | La ingesta del corpus es reanudable, indexa *dense* y *sparse*, versiona sin borrar y rechaza lo que no tiene licencia | FEAT-06c | 4 | 8 | sí |
| US-118 | Los metadatos de población, diseño y endpoint se toman de la fuente o se extraen y verifican, y una muestra se revisa a mano | FEAT-06c | 4 | 5 | sí |
| US-119 | Cada ingesta publica una `CorpusRelease` con su fecha de corte y la Base del análisis la usa | FEAT-06c | `si-hay-capacidad` | 3 | no |
| US-120 | El corpus del S3 alcanza al menos 20 documentos por tipo de cáncer de al menos 3 fuentes abiertas | FEAT-06c | 4 | 3 | sí |
| US-021 · DEC-11 | Criterios de aplicabilidad, excluyentes y definición de "Parcial" (sin firma formal, P-03) | FEAT-08b | 5 | 1 | sí |
| US-121 | Los criterios de aplicabilidad de mama y próstata viven en el catálogo con destino, excluyentes y regla de "Parcial" | FEAT-08b | 5 | 3 | sí |
| US-122 | Con valores estructurados, el estado de cada criterio se calcula con la regla del catálogo y el valor del paciente se copia del contexto | FEAT-08b | 5 | 5 | sí |
| US-123 | Si la población del estudio solo está en el texto, el valor se acepta solo con cita y soporte; si no, queda "Desconocido" | FEAT-08b | 5 | 5 | sí |
| US-124 | Cada criterio desconocido dice su causa, avisa si el dato del paciente no está verificado, y un excluyente en "No coincide" marca la población como no comparable | FEAT-08b | 5 | 5 | sí |
| US-125 | Una opción con varias fuentes hereda la aplicabilidad de la más comparable, y con una sola opción se elige la más aplicable | FEAT-08b | 5 | 5 | sí |
| US-126 | Veo la tabla de aplicabilidad de cada fuente y el resumen de la opción, con estados en texto y los avisos visibles | FEAT-08b | 5 | 5 | sí |
| US-127 | Los metadatos factuales de cada fuente se copian del catálogo del corpus y lo ausente se muestra "No disponible" | FEAT-T1a | 5 | 3 | sí |
| US-128 | La Base del análisis declara los datos críticos faltantes y si el oncólogo continuó con aviso | FEAT-T2b | 4 | 3 | sí |
| US-129 | Los supuestos del análisis salen de reglas del catálogo o, si los propone la IA, solo se aceptan si están anclados a un faltante y nada los contradice | FEAT-T2b | `si-hay-capacidad` | 5 | no |
| US-130 | La Base del análisis declara las limitaciones estructurales y solo las redactadas por la IA que tienen soporte | FEAT-T2b | `si-hay-capacidad` | 3 | no |
| US-131 | La suite mide la sensibilidad y la especificidad del checklist de faltantes con faltantes sembrados | FEAT-T5b | 4 | 3 | sí |
| US-132 | La suite verifica que la aplicabilidad no inventa valores ni coincidencias y mide los metadatos del corpus | FEAT-T5b | 5 | 5 | sí |
| US-133 | La recuperación híbrida no retrocede respecto del baseline del S1 | FEAT-T5b | `si-hay-capacidad` | 3 | no |
| US-134 | `/rag/query` devuelve hasta 3 opciones en orden determinista por aplicabilidad y `clinical-api` las persiste en ese orden | FEAT-10c | 5 | 5 | sí |
| US-135 | El panel muestra hasta 3 tarjetas en el orden recibido, con el criterio de orden visible y sin rótulos de jerarquía clínica | FEAT-10c | 5 | 3 | sí |
| US-015 · ADR-42 | Streaming de eventos de progreso del análisis | FEAT-10c | `si-hay-capacidad` | 3 | no |
| US-136 | La tarjeta avisa cuando la opción depende de datos en conflicto o de datos críticos faltantes, calculado por criterio y sin bloquear | FEAT-10b | 5 | 5 | sí |
| US-137 | `POST /platform/evidence-analyses/{id}/feedback` guarda la calificación 1–5 y los dos checkboxes de faltantes, sin texto libre | FEAT-T5c | 5 | 5 | sí |
| US-138 | Al cerrar cada análisis el panel ofrece la calificación 1–5 y, si hubo aviso de faltantes, los dos checkboxes, sin bloquear nada | FEAT-T5c | 5 | 3 | sí |
| US-139 | El reporte de feedback agrega VM-4 y VM-5 por cohorte y por versión de catálogo y dice si el catálogo queda validado | FEAT-T5c | 5 | 3 | sí |
| US-024 · DEC-14 | Revisión clínica de la muestra de aplicabilidad (VM-3) | FEAT-T5c | 5 | 1 | sí |
| US-140 | La suite mide que hasta 3 opciones siguen citadas, con soporte, no prescriptivas y en el orden de RN-28 | FEAT-T5b | 5 | 5 | sí |
| US-141 | El p95 del análisis se mide con aplicabilidad y hasta 3 opciones y la meta de G-5 se recalibra con ese dato | FEAT-T5b | `si-hay-capacidad` | 3 | no |
| US-142 | G-Demo se verifica con el recorrido de la hipótesis sobre casos sintéticos y queda registrado | FEAT-T5b | 5 (cierre) | 5 | sí |
| US-143 | `oncolens preflight real-data` verifica los prerrequisitos del gate y `clinical-api` no arranca con datos reales si alguno falla | FEAT-T4d | 6 | 8 | sí |
| US-144 | `web` solo se publica en la interfaz de la VPN y con HTTPS firmado por la CA interna | FEAT-T4d | 6 | 5 | sí |
| US-145 | Los backups de PostgreSQL y `clinical-minio` salen cifrados del equipo y su restauración se prueba | FEAT-T4d | 6 | 5 | sí |
| US-146 | El job de mayoría de edad marca "requiere ratificación" con la edad de configuración, sin bloquear al paciente | FEAT-T4d | `si-hay-capacidad` | 5 | no |
| US-147 | La revisión de seguridad del piloto queda registrada y ningún hallazgo crítico o alto queda abierto al gate | FEAT-T4d | 6 | 3 | sí |
| US-027 · ADR-43 | Catálogo del corpus en una base de datos separada de la misma instancia | FEAT-T4d | 6 (condicional) | 2 | sí, condicional |
| US-020 · DEC-10 | Plantillas de preguntas clínicas validadas por tipo de cáncer | FEAT-T4d | 6 | 1 | no |
| US-025 · DEC-15 | Validación legal de diferir el job de retención | FEAT-T4d | 6 | 1 | sí |
| US-029 · DEC-17 | Mapeos terminológicos firmados | FEAT-T4d | 6 | 1 | sí |
| US-030 · DEC-18 | Edad de mayoría configurada | FEAT-T4d | 6 | 1 | sí |
| US-031 · DEC-19 | Criterio de "listo" por tipo de cáncer firmado | FEAT-T4d | 6 | 1 | sí |
| US-148 | Toda generación con IA sobre un paciente con opt-out de `analisis_ia` responde `403` sin llamar a la IA, y lo demás sigue funcionando | FEAT-T4c | 6 | 5 | sí |
| US-149 | El administrador registra y revoca marcas de opt-out por CLI, con referencia externa y motivo del catálogo, auditadas | FEAT-T4c | 6 | 3 | sí |
| US-022 · DEC-12 | Canal de opt-out: referencia externa, catálogo de motivos y SLA | FEAT-T4c | 6 | 1 | sí |
| US-026 · DEC-16 | Alcance de "generación con IA" bajo el opt-out de `analisis_ia` | FEAT-T4c | 6 | 1 | sí |
| US-150 | Cada acción sobre un paciente queda auditada sin datos personales: análisis, resumen, carga, revisión, registro manual y marcas de opt-out | FEAT-T1b | 6 | 5 | sí |
| US-151 | La cobertura de auditoría se verifica de forma automática y el recorrido completo deja la traza esperada, como prerrequisito del gate | FEAT-T1b | `si-hay-capacidad` | 3 | no |
| US-152 | VM-1 y VM-2 se miden con OncoLens en ambas cohortes y se comparan con el baseline manual | FEAT-T5d | 6 | 5 | sí |
| US-153 | VM-3 se mide en la cohorte real con una muestra de tablas de aplicabilidad revisada por el oncólogo | FEAT-T5d | 6 | 3 | sí |
| US-154 | VM-4 y VM-5 del piloto se reportan por cohorte con su tasa de respuesta y las metas congeladas | FEAT-T5d | 6 | 2 | sí |
| US-155 | La encuesta de VM-6 se aplica al final del piloto y mide verificabilidad y no prescripción percibidas | FEAT-T5d | 6 (cierre del piloto) | 3 | sí |
| US-156 | El informe de G-Éxito consolida VM-1…VM-6 contra las metas congeladas y los incidentes críticos, y cierra el piloto | FEAT-T5d | 6 (cierre del piloto) | 3 | sí |
| US-157 | La suite mide que la síntesis reporta las discrepancias sembradas y copia las etiquetas factuales del catálogo | FEAT-T5d | 6 `si-hay-capacidad` | 3 | no |
| US-158 | La suite verifica que el 100 % de las citas muestra su fecha y el de las guías su versión | FEAT-T5d | 6 `si-hay-capacidad` | 2 | no |
| US-159 | La suite verifica que todo análisis afectado queda desactualizado y que ninguna cita del historial deja de resolverse | FEAT-T5d | 6 `si-hay-capacidad` | 3 | no |
| US-160 | La suite verifica que la memoria de análisis nunca es soporte y nunca lleva datos personales | FEAT-T5d | Post-MVP | 3 | no |
| US-161 | La suite mide cuántos criterios resuelve la búsqueda complementaria y recalibra el p95 con el agente | FEAT-T5d | Post-MVP | 3 | no |
| US-162 | `/rag/query` entrega en cada cita la fecha, la versión, el tipo de fuente y el idioma copiados del catálogo, y la marca de antigüedad | FEAT-09 | 6 `si-hay-capacidad` | 3 | no |
| US-163 | El umbral de antigüedad vive en configuración, lo confirma el oncólogo y aplica igual en análisis y en el historial | FEAT-09 | 6 `si-hay-capacidad` | 3 | no |
| US-164 | La tarjeta y las citas muestran la vigencia, y el análisis muestra "Evidencia actualizada al ‹fecha de corte›" | FEAT-09 | 6 `si-hay-capacidad` | 3 | no |
| US-165 | En el historial la cita conserva su versión original y avisa "Existe una versión más reciente" | FEAT-09 | 6 `si-hay-capacidad` | 3 | no |
| US-166 | Con dos o más fuentes sobre el umbral, `/rag/query` devuelve "Puntos de acuerdo" y "Discrepancias" y cada afirmación queda citada y con soporte | FEAT-07 | 6 `si-hay-capacidad` | 5 | no |
| US-167 | Cada discrepancia explica la diferencia de contexto desde los metadatos, o dice "Causa de la discrepancia no identificada" | FEAT-07 | 6 `si-hay-capacidad` | 5 | no |
| US-168 | Las etiquetas factuales de cada fuente se copian del catálogo y no se muestra ningún puntaje de solidez | FEAT-07 | 6 `si-hay-capacidad` | 3 | no |
| US-169 | Con una sola fuente no hay sección de discrepancias, y una pregunta que no es de tratamiento recibe síntesis sin opciones | FEAT-07 | 6 `si-hay-capacidad` | 3 | no |
| US-170 | El panel muestra la síntesis con sus citas, las etiquetas por fuente, el aviso de IA y lenguaje no prescriptivo | FEAT-07 | 6 `si-hay-capacidad` | 3 | no |
| US-171 | Las plantillas viven en el catálogo versionado, cada marcador tiene campo de destino y `GET /platform/question-templates` las sirve por tipo de cáncer | FEAT-05 | 6 `si-hay-capacidad` | 3 | no |
| US-172 | La plantilla se completa con los datos del caso, marca lo que falta y nunca inserta identidad | FEAT-05 | 6 `si-hay-capacidad` | 3 | no |
| US-173 | El panel ofrece las plantillas, permite editarlas antes de enviar y el análisis guarda qué plantilla se usó | FEAT-05 | 6 `si-hay-capacidad` | 3 | no |
| US-174 | El historial lista y muestra cada análisis previo desde su snapshot, con su contexto, sus modelos, sus versiones y la Base del análisis idéntica | FEAT-11a | 6 `si-hay-capacidad` | 5 | no |
| US-175 | Un análisis cuyos datos cambiaron se marca "Desactualizado: datos del paciente" con la lista de cambios | FEAT-11a | 6 `si-hay-capacidad` | 5 | no |
| US-176 | Un análisis muestra "Evidencia o catálogo más reciente disponible" cuando cambió la `CorpusRelease` o la versión del catálogo | FEAT-11a | 6 `si-hay-capacidad` | 3 | no |
| US-177 | Re-ejecutar con datos actuales crea un análisis nuevo, recalcula los faltantes y deja el anterior intacto | FEAT-11a | 6 `si-hay-capacidad` | 5 | no |
| US-178 | La comparación muestra opciones nuevas, opciones eliminadas y criterios de aplicabilidad que cambiaron | FEAT-11a | 6 `si-hay-capacidad` | 3 | no |
| US-179 | Veo el historial con sus marcas, abro un análisis previo, lo re-ejecuto y comparo el resultado | FEAT-11a | 6 `si-hay-capacidad` | 5 | no |
| US-180 | Al subir un PDF de alta, el sistema crea un borrador con los datos sugeridos y su confianza, sin crear ningún paciente | FEAT-01c | 6 `si-hay-capacidad` | 5 | no |
| US-181 | El doctor confirma el borrador y solo entonces se crea el paciente, con las mismas reglas que el alta manual | FEAT-01c | 6 `si-hay-capacidad` | 3 | no |
| US-182 | La pantalla "Nuevo paciente desde PDF" muestra lo sugerido, resalta lo de confianza media o baja y exige confirmar | FEAT-01c | 6 `si-hay-capacidad` | 3 | no |
| US-183 | `/metrics` expone en los tres servicios la latencia, los errores y las métricas de IA por etapa, sin datos personales ni puertos nuevos | FEAT-PL5 | 6 `si-hay-capacidad` | 3 | no |
| US-184 | El 100 % de las requests lleva un `traceId` que se correlaciona de `web` a `rag-orchestrator` | FEAT-PL5 | 6 `si-hay-capacidad` | 3 | no |
| US-185 | StrykerJS alcanza un *mutation score* ≥ 70 % sobre auth, autorización y cifrado, y la CI lo exige | FEAT-PL5 | 6 `si-hay-capacidad` | 5 | no |
| US-028 · ADR-44 | Stack de observabilidad: métricas, paneles y *tracing* distribuido | FEAT-PL5 | Post-MVP | 3 | no |
| US-186 | Si quedan criterios "No reportado por la fuente", el agente planifica sub-consultas dirigidas sobre el corpus dentro de los límites de configuración | FEAT-08c | Post-MVP | 5 | no |
| US-187 | Lo que encuentra el agente pasa por la misma validación y solo regenera los bloques afectados | FEAT-08c | Post-MVP | 5 | no |
| US-188 | El agente respeta el *deadline*, devuelve el primer resultado validado si no alcanza y queda registrado en `agent_steps` | FEAT-08c | Post-MVP | 3 | no |
| US-189 | El análisis nuevo recibe como memoria los últimos N análisis de evidencia del paciente y la evolución posterior a cada uno | FEAT-11c | Post-MVP | 5 | no |
| US-190 | La memoria viaja desidentificada, rotulada "análisis previo de IA" y delimitada como datos | FEAT-11c | Post-MVP | 3 | no |
| US-191 | Un análisis previo nunca es citable ni cuenta como soporte, y una afirmación que solo él respalda se descarta | FEAT-11c | Post-MVP | 5 | no |
| US-192 | Si un análisis usado como memoria queda desactualizado, el que lo usó también queda desactualizado (cascada) | FEAT-11c | Post-MVP | 3 | no |
| US-193 | El oncólogo registra el tratamiento decidido con fármacos normalizados y un vínculo opcional al análisis, nunca a una opción descartada | FEAT-11b | Post-MVP | 5 | no |
| US-194 | La decisión aparece en el timeline como evento derivado "Decisión registrada en OncoLens", distinta de los tratamientos previos | FEAT-11b | Post-MVP | 3 | no |
| US-195 | El oncólogo registra la evolución, que entra al timeline y al contexto y marca desactualizados los análisis afectados | FEAT-11b | Post-MVP | 5 | no |
| US-196 | Desde la vista de caso y desde un análisis registro la decisión y la evolución | FEAT-11b | Post-MVP | 3 | no |
| US-197 | El tratante principal o un administrador egresa al paciente con un motivo, y la reactivación abre un episodio nuevo conservando la historia | FEAT-T4b | Post-MVP | 5 | no |
| US-198 | Un paciente egresado no admite ningún registro hasta su reactivación: `422` en todos los endpoints de registro | FEAT-T4b | Post-MVP | 5 | no |
| US-199 | La baja total borra identidad, representantes, histórico y PDFs, seudonimiza el resto y exige confirmación explícita | FEAT-T4b | Post-MVP | 5 | no |
| US-200 | Un opt-out de investigación borra el histórico de investigación del paciente y evita el snapshot al egresar | FEAT-T4b | Post-MVP | 3 | no |
| US-201 | El administrador registra y revoca marcas de opt-out desde la API y una pantalla de administración | FEAT-T4b | Post-MVP | 5 | no |
| US-202 | Pantallas de egreso, reactivación y baja total con confirmación explícita | FEAT-T4b | Post-MVP | 3 | no |
| US-023 · DEC-13 | Catálogo de motivos de egreso | FEAT-T4b | Post-MVP | 1 | no |
| US-203 | El administrador gestiona el equipo tratante de cada paciente, con un único tratante principal | FEAT-T4e | Post-MVP | 3 | no |
| US-204 | Todos los endpoints de paciente responden `403` a un doctor que no pertenece al equipo tratante; `admin` ve todo | FEAT-T4e | Post-MVP | 5 | no |
| US-205 | La Base del análisis lista los análisis previos usados como contexto, con la marca "contexto, no evidencia" | FEAT-T2c | Post-MVP | 3 | no |
| US-206 | La Base del análisis lista cada sub-consulta de la búsqueda complementaria, su objetivo y si encontró evidencia | FEAT-T2c | Post-MVP | 3 | no |
| US-207 | Al egresar, se escribe un `EpisodeSnapshot` longitudinal con líneas, respuestas, progresiones y decisiones, sin identidad ni texto libre | FEAT-AP1 | Post-MVP | 5 | no |
| US-208 · DEC-20 | Criterio de "listo" para construir la exploración de cohortes (CAP-12) | FEAT-AP1 | Post-MVP | 1 | no |
| US-032 · ADR-7 | Scoring de solidez clínica de la evidencia | FEAT-AP1 | Futuro | ? | no |
| US-209 | El job diario renueva hasta el máximo de 20 años y, al vencer, aplica la baja total de forma auditada | FEAT-T4f | Post-MVP | 5 | no |
| US-210 | El administrador recibe el aviso de los vencimientos de los próximos 90 días, sin datos personales | FEAT-T4f | Post-MVP | 3 | no |

**Todas las historias de ADR y DEC de `backlog/02-adrs.md` (US-007…US-032) están ubicadas.** Lote 1: US-007…US-014, US-016…US-019 · lote 2: US-021 · DEC-11 → FEAT-08b · lote 3: US-015, US-020, US-022, US-024…US-027, US-029…US-031 · **lote 4:** US-023 · DEC-13 → FEAT-T4b (Post-MVP) · US-028 · ADR-44 → FEAT-PL5 (Post-MVP) · US-032 · ADR-7 → FEAT-AP1 (Futuro, sin puntos). **Nueva en el lote 4:** US-208 · DEC-20 (criterio de "listo" de CAP-12, AC-P.1b).

### Ubicación de ADR y DEC distinta de `02-adrs.md`

| Historia | `02-adrs.md` | Ubicación final | Motivo |
|---|---|---|---|
| US-012 · ADR-39 | FEAT-00 (decisión) | FEAT-06a (S1) | Es del S1 en todas las fuentes y se aplica en FEAT-06a; FEAT-00 queda solo con historias Pre-S1 |
| US-018 · DEC-08 | FEAT-02b (S2) | FEAT-PL3 (S1) | El umbral vive en el catálogo (FR-04); la DEC es del S1 y queda en el milestone de su sprint |
| US-019 · DEC-09 | FEAT-01b (S2) | FEAT-02a (S1) | La ficha del S1 ya muestra diagnóstico vigente y semáforo; la DEC es del S1 |
| DEC-01 | FEAT-04 · 2 puntos · firma | FEAT-04 · **1 punto** · sin firma formal | Convención de 1 punto por DEC y resolución P-03 |
| US-015 · ADR-42 | FEAT-10a (decisión) | FEAT-10c (S4) | FEAT-10a es del S1; la espera que mide el ADR es la de hasta 3 opciones |
| US-024 · DEC-14 | FEAT-T5d (medición) | FEAT-T5c (S4) | FEAT-T5d es del S6; DEC-14 es del S4 y forma parte de la validación clínica con casos sintéticos |
| US-022 · DEC-12 | FEAT-T4b | FEAT-T4c (S5) | FEAT-T4b pasa a Post-MVP; DEC-12 gobierna el registro de marcas por CLI del S5 |
| US-020 · DEC-10 | FEAT-05 | FEAT-T4d (S5) | FEAT-05 queda en el S6 si hay capacidad; DEC-10 es criterio del gate (escenario: el PO lo retira del gate) |
| US-023 · DEC-13 | FEAT-T4b (hoy S4; Post-MVP si se difiere) | FEAT-T4b · Post-MVP | El ciclo de vida pasa a Post-MVP por el slicing adoptado |
| US-028 · ADR-44 | FEAT-PL5 · Post-MVP | FEAT-PL5 · Post-MVP (la Feature es S6 `si-hay-capacidad`) | Sin cambio de Feature; la historia conserva su sprint |
| US-032 · ADR-7 | — (CAP-17, fuera del MVP) | FEAT-AP1 · Futuro, sin puntos | Toda historia debe vivir en una Feature; AP1 agrupa la preparación del futuro |

## Puntos por sprint (slicing v2, con los ajustes del 2026-10-07)

Recalculado con un script sobre la línea de metadatos de cada historia (`Sprint …` · `Estimación`), historia a historia (213 historias), tras aplicar el slicing v2 y los ajustes del usuario del 2026-10-07 (`01-requisitos.md` §15, "Ajustes al slicing v2"): US-211 nueva (S1, 3) y US-044 re-estimada (S2, 5 → 3); US-212 nueva (S3, 2) y US-080 re-estimada (`si-hay-capacidad`, 5 → 3); US-014, US-016, US-072 y US-074 del S2 al S1 (15 puntos).

| Sprint | Puntos | Detalle | Gate / demo |
|---|---|---|---|
| Pre-S1 | **12** | FEAT-00: ADR-36 (3) + DEC-02…DEC-05 (4) + US-033 (5) | Contrato y esquema congelados |
| S1 | **114** | 06a 29 (incluye ADR-39) · T5a 18 (ADR-41, DEC-06, US-072, US-074, US-075) · PL1 18 (incluye US-213, 2026-10-08) · 06c 10 · T1a 10 · PL2 8 · 10a 8 · T4a 8 (US-049, US-211) · T3 5 | Demo: login → análisis *dense* con una opción citada sobre el paciente semilla, por ruta directa; la suite `evaluate` corre en cada PR que cambia la IA |
| S2 | **66 + `?`** (71 con US-073 = 5) | T4a 21 (incluye ADR-40) · 01a 13 · PL3 9 (incluye DEC-08) · T2a 8 · 02a 6 (incluye DEC-09) · PL2 5 · PL1 3 · T5a 1 (DEC-07) + US-073 (`?`, rango 3–5) | Demo: login → listado → ficha → análisis con Base del análisis; baseline técnico calibrado y umbral de regresión activo |
| S3 | **85** | 01b 31 · 02b 21 · 03a 15 · T5b 10 · 10a 3 · T1a 3 · 01a 2 (US-212) | Demo: carga de PDF → extracción → vista de caso con enlace al PDF de origen (hipótesis 1) |
| S4 | **79** | 04 23 (incluye DEC-01) · 03b 16 · 06c 16 · 06a 6 · 10b 5 · T4a 5 (US-047) · T2b 3 · T5b 3 · T3 2 | Demo: revisión, registro manual y checklist de faltantes (hipótesis 2) |
| S5 | **78** | 08b 29 (incluye DEC-11) · T5b 15 · T5c 12 (incluye DEC-14) · 10c 8 · 10b 5 · 06b 3 · T1a 3 · T3 3 | **G-Demo al cierre del S5** (sintético, hipótesis 3) |
| S6 | **65** | T4d 28 (incluye ADR-43 condicional y DEC-10, 15, 17, 18, 19) · T5d 16 (núcleo) · T4c 10 (incluye DEC-12, 16) · T1b 8 · T4a 3 (US-050) | **G-Piloto** → piloto mixto con casos reales → **G-Éxito al cierre del S6** |
| **MVP comprometido (Pre-S1…S6)** | **494 + `?`** (**499** con US-073 = 5) | | |
| `si-hay-capacidad` | **186** | 96 que ya estaban en el S6 `si-hay-capacidad` (11a 26 · 07 19 · 09 12 · 01c 11 · PL5 11 · 05 9 · T5d anexos 8) + **90 que salen del MVP comprometido con el slicing v2**: 06b 16 (US-112…US-115) · T5b 14 (US-104, US-106, US-133, US-141) · 02c 13 · 01a 9 (US-077, US-080 = 3, US-081) · 02b 8 (US-091, US-094) · T2b 8 (US-129, US-130) · 03b 5 (US-109) · T4d 5 (US-146) · 06c 3 (US-119) · 10c 3 (US-015 · ADR-42) · PL3 3 (US-042) · T1b 3 (US-151) | Se priorizan en el *planning* de cada sprint si sobra capacidad |
| Post-MVP | **109** | T4b 27 (incluye DEC-13) · 11b 16 · 11c 16 · 08c 13 · T4e 8 · T4f 8 · T2c 6 · AP1 6 (incluye DEC-20) · T5d anexos 6 (US-160, US-161) · PL5 3 (ADR-44) | |
| Futuro (sin planificar) | `?` | US-032 · ADR-7 (FEAT-AP1), no suma | |
| **Total del backlog** | **789 + 2 `?`** | US-073 (S2) y US-032 · ADR-7 (Futuro) | |

> **Diferencia con el reparto aprobado (Pre-S1 12 · S1 91 · S2 88 · S3 83 · S4 79 · S5 78 · S6 65 = 496):** S1 **+18** (US-211 +3; US-014, US-016, US-072, US-074 +15) · S2 **−17** con US-073 = 5 (US-044 −2; las cuatro de evaluación −15) · S3 **+2** (US-212). El MVP comprometido pasa de 496 a **499** (con US-073 = 5) y `si-hay-capacidad` de 188 a 186 (US-080 −2). El total del backlog pasa de 788 a **789 + 2 `?`**.

> **Desequilibrio S1/S2 tras los ajustes.** El S1 (109) supera en ~20–30 puntos el reparto supuesto de ~80–90 por sprint y el S2 (71 con US-073 = 5) queda por debajo. Candidatos naturales para devolver al S2 sin romper el walking skeleton ni la suite en la DoD: US-075 (baseline manual VM-1/VM-2, 3; depende de la agenda de los oncólogos), US-016 · DEC-06 (1; US-072 AC-4 rotula "no validada" mientras tanto) o una de las historias de plataforma de PL1/PL2 que no bloquean el análisis. Decisión del usuario en el *planning* del S1 (DEC-03 la valida con la velocidad real).

**Gates del slicing v2.** **G-Demo** al cierre del **S5** (recorrido de la hipótesis con casos sintéticos: US-142, que integra la medición de p95 de US-141). **G-Piloto** dentro del **S6**, antes de cargar casos reales (`preflight` de US-143, `403` por opt-out de US-148, auditoría de US-102/US-150, VPN/HTTPS y *backups*). **G-Éxito** al cierre del **S6** (US-156). Ninguno de los dos primeros cambia de criterio; solo de sprint.

**Primer candidato si hay capacidad:** el resumen del caso (FEAT-02c, US-095…US-097); el timeline y la vista de caso reconstruyen el caso mientras tanto.

**Próximos recortes si la velocidad real es ~65 puntos por sprint** (en este orden; ninguno toca una invariante ni una dueña de RN-01, RN-06, RN-10…RN-14 o RN-23): (1) US-123 (población solo en texto, aceptada con cita y soporte; sin ella el criterio queda "Desconocido", 5) · (2) US-101 (aviso de datos sin verificar en la tarjeta, 5) · (3) US-062 (estados de espera, sin evidencia y error del panel, 3) · (4) opciones 3 → 1 en US-134/US-135 (el orden por aplicabilidad de US-125 sigue eligiendo la opción única) · (5) alta manual de pacientes US-047 (los pacientes del piloto se cargan por el seed o la CLI de administración, 5).

> **Riesgo de capacidad.** El reparto supone ~80–90 puntos por sprint. DEC-03 (US-009) lo valida en el Pre-S1; si la velocidad real es ~65, se aplican los recortes anteriores antes de tocar el S6, que es el camino crítico de G-Piloto. Las Features XL proponen además su división en Features hermanas sin cambiar IDs.

## Reglas de negocio → Story dueña (final)

| RN | Dueña | Notas |
|---|---|---|
| RN-01 | US-064 (FEAT-T1a) | Citas: US-063. Etapas que amplían el validador con regresión: aplicabilidad (US-123, S5); resumen (US-095), supuestos y limitaciones (US-129, US-130) y síntesis (US-166), `si-hay-capacidad`, búsqueda complementaria (US-187, Post-MVP) |
| RN-02 | US-055 (FEAT-06a) | Persistencia con `null`: US-053 AC-5 · regresión en US-112, US-116, US-124, US-128, US-166 · agente nunca tras "sin evidencia": US-186 AC-3 |
| RN-03 | US-061 (FEAT-10a) | Cálculo determinista: US-055 AC-6 · híbrida: US-112 AC-2 · invariante frente al puntaje de solidez: US-032 · ADR-7 |
| RN-04 | US-063 (FEAT-T1a) | Regresión: US-162 (vigencia), US-191 (memoria) |
| RN-05 | US-055 (recuperación, FEAT-06a) · US-059 (versionado sin borrado, FEAT-06c) | Ingesta del S3: regresión en US-117, US-119; híbrida: US-112; historial desde el snapshot: US-165, US-174 |
| RN-06 | US-053 (FEAT-06a) | Regresión: US-087, US-096, US-101, US-124, US-166, US-177 (re-ejecución) |
| RN-07 | US-065 (FEAT-T1a) | Regresión: US-084, US-093, US-107 |
| RN-08 | **US-100 (FEAT-03a)** | Corrección y confirmación explícitas: US-107, US-110 |
| RN-09 | **US-180 (FEAT-01c, S6 `si-hay-capacidad`)** | Confirmación explícita: US-181, US-182 · regresión de AC-T3.2 → US-070 · *workaround* del MVP: alta manual (US-047) |
| RN-10 | US-046 (FEAT-T4a) | Regresión: US-083, US-096, US-102, US-212 (descarga y auditoría del documento), US-180 (borrador de alta), US-183 (métricas), US-199 (baja total), US-207 (snapshot) |
| RN-11 | US-049 (FEAT-T4a) | Regresión: US-093 (eventos y tratamientos), US-096 (resumen), US-114 (notas), US-116 y FEAT-04 US-006 (faltantes), US-172 (plantillas), US-190 (memoria), US-195 (evolución), US-207 (snapshot) |
| RN-12 | US-050 (FEAT-T4a) | Regresión: US-082 (extracción), US-095 (resumen), US-166 (síntesis), US-177 (re-ejecución), US-180 (registro asistido) |
| RN-13 | **US-143 (FEAT-T4d, S6)** | Guarda de arranque: US-037 AC-3 (S2); seed: US-039 AC-5; solo sintético en G-Demo: US-142 AC-3; cohorte real solo tras G-Piloto: US-152, US-154 |
| RN-14 | US-036 (FEAT-PL1) | Cohorte real del piloto fuera del repositorio: US-152 AC-4, US-153 AC-5 |
| RN-15 | **US-148 (FEAT-T4c, S6)** | Verifica el análisis (US-052) y, si FEAT-02c se construye, el resumen (US-096; AC-2 condicional) y, en positivo, ficha, caso, `/completeness`, carga con extracción y feedback; marcas por CLI: US-149; re-ejecución (US-177) y búsqueda complementaria (US-186) entran por el test de cobertura de rutas de US-148 AC-3; lecturas del historial en positivo: US-174 AC-5, US-178 AC-4; API y UI de marcas: US-201 (Post-MVP) |
| RN-16 | US-047 (FEAT-T4a) | Job de mayoría de edad: US-146 (`si-hay-capacidad`); registro asistido: US-181 AC-3 |
| RN-17 | **US-198 (FEAT-T4b, Post-MVP)** | Quién egresa: US-197; lista cerrada de endpoints pendiente de V-14 (dueño: usuario); evolución: US-195 AC-3 |
| RN-18 | US-047 (campos, FEAT-T4a) | Baja total: US-199 (FEAT-T4b) · job automático: US-209, US-210 (FEAT-T4f), ambos Post-MVP |
| RN-19 | US-069 (FEAT-T3) | Resumen del caso ("Verifique contra las fuentes"): US-097 · síntesis: US-170 |
| RN-20 | US-043 (configuración, FEAT-PL3) | Criterio de "listo": US-031 · DEC-19 (S6); verificado en el `preflight`: US-143 AC-4 |
| RN-21 | US-059 (FEAT-06c) | Ingesta del S3: US-117, US-120 |
| RN-22 | US-037 (FEAT-PL1) | Valores nuevos del lote 4: `EVIDENCE_STALE_YEARS` (US-163), `ANALYSIS_MEMORY_MAX` (US-189), `AGENT_MAX_*` (US-186, US-188), `MUTATION_SCORE_MIN` (US-185), metas de VM (US-152…US-155), plazos de retención (US-209) |
| RN-23 | US-068 (FEAT-T3) | Regla en ejecución (§15 resp. 2: afirmación prescriptiva → omitida y contada; justificación de opción → `discardedOptions` con `afirmacion_sin_soporte`; nunca se muestra): US-064 AC-7, AC-8, con regresión en US-095, US-129, US-130, US-166 · Textos nuevos del lote 4 con regresión: US-155, US-164, US-170, US-173, US-179, US-182, US-196, US-202; salidas prescriptivas del piloto: US-156 AC-3 |
| RN-24 | **US-191 (FEAT-11c, Post-MVP)** | Regresión: US-170 (síntesis), US-187 (agente); rótulo de la memoria: US-190; medido en US-160 (M-11.3) |
| RN-25 | **US-127 (FEAT-T1a, S5)** | Metadatos `no_disponible` en el corpus: US-118 · etiquetas factuales de la síntesis: US-168 · vigencia: US-162 |
| RN-26 | US-071 (FEAT-T3, S5) | Bloqueo por opt-out: US-148; avisos de conflicto y faltantes: US-136; bloqueo por egreso: US-198; bloqueo por equipo tratante: US-204; "desactualizado" no bloquea: US-175 AC-5 |
| RN-27 | **US-098 (FEAT-03a)** | Propuesta de Backend 2: US-086; manuales: US-094, US-110; mapeo humano: US-109; decisiones de tratamiento (ATC): US-193; medido en US-106 (M-03.5) |
| RN-28 | **US-134 (FEAT-10c, S5: orden visible de hasta 3 opciones)** | **Comparador, agregación por opción y selección de la opción única por aplicabilidad antes del recorte: US-125 (FEAT-08b, S5, AC-5…AC-7)**; S1–S4 sin aplicabilidad: US-055 AC-8 (relevancia, con regresión a US-125); texto del criterio: neutro en el S1–S4 (US-061 AC-3, confirmado: §15 resp. 7), de aplicabilidad desde el S5 (US-126 AC-7); UI de hasta 3: US-135; medido en US-140 |
| RN-29 | US-001 (FEAT-04) | Validador mínimo: US-042 (`si-hay-capacidad`; la regla de destinos inexistentes la cubre US-001 AC-4) · criterios de aplicabilidad: US-121 · reglas de supuestos: US-129 · marcadores de plantillas: US-171 |
| RN-30 | US-056 (FEAT-06a, S4) | Resumen del caso: US-096 · re-ejecución: US-177 AC-3 · agente dentro del semáforo: US-188 AC-3 |

**30/30 RN con Story dueña.**

## Cobertura de AC y medibles del PRD (final)

Verificada con un script que busca cada ID como cita `` `[ID]` `` dentro de los bloques `## AC` de las historias: **54/54 `AC-xx.y` · 23/23 `AC-Tn.m` · 2/2 `AC-P.1x` · 36/36 `M-xx.y`**.

| AC / M del PRD | Historia |
|---|---|
| AC-01.1 | US-076 (AC-2…AC-4), US-078 (AC-3…AC-5), US-080, US-081, US-082 (AC-3), US-083, US-087 (AC-3) |
| AC-01.2 | US-077, US-079 |
| AC-01.3 | US-085, US-084, US-087 (AC-1, AC-5) |
| AC-02.1 | US-088, US-090, US-194 (AC-4) |
| AC-02.2 | US-088 (AC-3), US-090, US-085 (AC-2) |
| AC-02.3 | US-089 (AC-1), US-090, US-094 · decisiones distintas de tratamientos previos: US-194 (AC-3) |
| AC-02.4 | US-051 (AC-4, S2), US-089 (AC-2, AC-3), US-091 |
| AC-02.5 | US-095, US-096, US-097 (`si-hay-capacidad`, primer candidato) · `403` → US-148 (AC-2 condicional) · `422` → US-198 |
| AC-02.6 | US-065 (AC-3), US-088 (AC-4), US-089 (AC-5), US-096 (AC-6), US-107 |
| AC-02.7 | US-085 (AC-4, AC-5), US-087 (AC-5), US-089 (AC-4), US-094 (AC-3) · checklist: FEAT-04 |
| AC-03.1 | US-099 (AC-1, AC-2), US-080 (AC-2), US-089 (AC-2) |
| AC-03.2 | US-099 (AC-3, detección), US-109 (resolución), US-124 (AC-3, aviso por criterio), US-136 (tarjeta) |
| AC-03.3 | US-086, US-098, US-094, US-109 (AC-3), US-110 |
| AC-03.4 | US-076 (AC-4, checksum), US-100, US-107 |
| AC-03.5 | US-098 (AC-7) |
| AC-04.1 … AC-04.5 | FEAT-04 (US-001 … US-006, DEC-01) · registro manual: US-110, US-111, US-094 · AC-04.3: US-116, US-124, US-128 · AC-04.5 (aplicabilidad): US-121 |
| AC-05.1 | US-052 (AC-2, AC-5), US-062 (AC-4), US-114, US-115, US-173 (AC-3) |
| AC-05.2 | US-171, US-172, US-173 (S6 `si-hay-capacidad`) |
| AC-05.3 | S1: US-033 (AC-3), US-055 (AC-7), US-061 (AC-5) · síntesis sin opciones: US-169 (AC-2) |
| AC-06.1 | S1: US-055, US-043, US-050, US-053, US-056, US-059 · S3: US-112, US-113, US-114, US-117, US-120 · `403`: US-148 · S6/Post-MVP: US-166 (AC-4), US-177 (AC-5) |
| AC-06.2 | US-052 (AC-1), US-049 (AC-3, AC-6), US-091, US-093 |
| AC-07.1 | US-166, US-170 |
| AC-07.2 | US-167, US-170 (AC-1) |
| AC-07.3 | US-168, US-170 |
| AC-07.4 | US-169 (AC-1) · limitación estructural en la Base: US-130 |
| AC-07.5 | US-168 (AC-3…AC-5) · ADR futuro: US-032 · ADR-7 |
| AC-08.1 | US-121, US-122, US-126 |
| AC-08.2 | US-124 (AC-1), US-126 (AC-2) |
| AC-08.3 | US-123, US-122 (AC-5), US-187 (AC-2) |
| AC-08.4 | US-124 (AC-2, AC-3), US-126 (AC-4) |
| AC-08.5 | US-124 (AC-5), US-126 (AC-1, AC-6) |
| AC-08.6 | US-124 (AC-4), US-126 (AC-3), US-121 (AC-1) |
| AC-08.7 | US-186, US-187, US-188 (Post-MVP) · Base, inciso (i): US-206 · medido: US-161 (AC-4) |
| AC-08.8 | US-125, US-126 (AC-5), US-134 (AC-7, orden) |
| AC-08.9 | US-122 (AC-1, AC-2, AC-6), US-127 (AC-4) |
| AC-09.1 | US-162 (AC-1), US-164 (AC-1), US-158 (AC-3) |
| AC-09.2 | US-164 (AC-1, AC-4) |
| AC-09.3 | US-162 (AC-2), US-163 (AC-3), US-164 (AC-2) |
| AC-09.4 | US-165 |
| AC-10.1 | S1–S4: US-055 (AC-1, AC-8), US-061 (AC-3, texto neutro) · S5: US-125 (AC-5…AC-7, opción única por aplicabilidad), US-126 (AC-7, texto del criterio), US-134 (orden y hasta 3), US-135 (UI) |
| AC-10.2 | US-061 (S1), US-101 (avisos sin verificar), US-126 (aplicabilidad), US-136 (conflicto y faltantes), US-135 (varias tarjetas) · vigencia: US-164 (AC-1) |
| AC-10.3 | US-068 (AC-1, AC-4), US-170 (AC-3) |
| AC-10.4 | US-053 (AC-2), US-055 (AC-2), US-061 (AC-4), US-062 (AC-2), US-063 (AC-3), US-064 (AC-2) |
| AC-11.1 | historial: US-174 · decisión con vínculo, nunca a una descartada: US-193 |
| AC-11.2 | US-175, US-179 (AC-1) · cascada por memoria: US-192 · por evolución: US-195 (AC-2) · medido: US-159 |
| AC-11.2b | US-176, US-179 (AC-2) |
| AC-11.3 | re-ejecución: US-177 · comparación: US-178 · UI: US-179 (AC-3) |
| AC-11.4 | vista: US-053 (AC-6), US-033 (AC-7), US-088 (AC-5), US-096 (AC-1) · decisión: US-194, US-196 (AC-1) |
| AC-11.5 | US-195, US-196 · `422`: US-198 (AC-2) |
| AC-11.6 | US-189, US-190 (AC-3), US-191 · Base, inciso (h): US-205 |
| AC-T1.1 | US-051 (AC-5), US-065, US-212 (descarga del PDF de origen, S3), US-080, US-090, US-092, FEAT-04 US-003 (AC-3), US-108 |
| AC-T1.2 | US-063, US-064 (S1) · US-095 (resumen) · US-123 (aplicabilidad) · US-129, US-130 (supuestos y limitaciones) · US-166 (síntesis) · US-187 (agente) · US-191 (memoria nunca soporte) |
| AC-T1.3 | US-063 (AC-1, AC-4), US-127 |
| AC-T1.4 | US-053 (AC-1), US-041 (AC-1), US-049 (AC-6), FEAT-04 US-006 (AC-2), US-112 (AC-5), US-119 (AC-2), US-166 (AC-6), US-174 (AC-2), US-177, US-188 (AC-1), US-189 (AC-1) |
| AC-T1.5 | US-102 (accesos, S6), US-150 (acciones, S6), US-151 (verificación en G-Piloto, `si-hay-capacidad`; *workaround*: chequeo `audit-coverage` de US-143) · re-ejecución: US-177 (AC-6) |
| AC-T2.1 | US-066 (AC-1), US-067 (AC-1), US-033 (AC-4), US-128, US-129 (AC-5) · inciso (h): US-205 · inciso (i): US-206 |
| AC-T2.2 | US-066 (AC-4), US-128 (AC-3), US-129, US-130 · (h): US-205 (AC-2) · (i): US-206 (AC-4) |
| AC-T2.3 | US-066 (AC-2), US-067 (AC-3), US-114 (AC-6), US-115 (AC-3), US-164 (AC-4), US-169 (AC-4), US-206 (AC-3) |
| AC-T2.4 | US-066 (AC-5), US-128 (AC-1) · historial: US-174 (AC-2), US-205 (AC-4) |
| AC-T3.1 | US-069, US-097, US-170 (AC-2) |
| AC-T3.2 | US-070, US-100 (AC-6), US-107 (AC-6), US-109 (AC-6), US-180 (AC-2), US-182 (AC-4), US-193 (AC-5) |
| AC-T3.3 | US-071 (avisos, S5), US-101 (AC-4), US-136 (AC-6) · bloqueo por opt-out: US-148 (S6) · egreso: US-198 (Post-MVP) · equipo tratante: US-204 (Post-MVP, P-02) |
| AC-T3.4 | US-068, US-173 (AC-4), US-196 (AC-4) |
| AC-T4.1 | S1–S2: US-211 (sesión mínima, S1), US-044, US-045, US-046, US-047, US-049, US-050, US-054, US-034, US-035, US-036, US-037, US-040, US-057, US-102 (FR-18) · S5: US-143 (`preflight`), US-144, US-145, US-147, US-148, US-150 · S6: US-183 (red), US-185 (*mutation*) · Post-MVP: US-198 (RN-17), US-199, US-209 (RN-18), US-203, US-204 (FR-15) |
| AC-T4.2 | US-049, US-046 (AC-4), US-093 |
| AC-T4.3 | US-049 (AC-1), FEAT-04 US-006, US-093 (AC-2), US-096 (AC-2), US-114 (AC-4) · memoria: US-190 (AC-1), US-160 (AC-2) · evolución: US-195 (AC-6) |
| AC-T4.4 | US-040, US-034 (AC-3), US-078 (AC-6), US-122, US-147 (AC-2, entorno piloto), US-027 · ADR-43, US-186 (AC-5) |
| AC-T4.5 | US-047 (AC-3, S4) · job de mayoría de edad: US-146 (`si-hay-capacidad`), US-030 · DEC-18 · identificados en el `preflight`: US-143 (AC-3) |
| AC-T4.6 | `403`: US-148, US-177 (AC-2) · solo `admin`, referencia y auditoría: US-149, US-150 (AC-3), US-201 · borrado del histórico por opt-out de investigación: US-200 (Post-MVP) |
| AC-T5.1 | US-103, US-105, US-106 (`si-hay-capacidad`), US-131, US-132 (S5), US-140 (S5, opciones) · discrepancias sembradas: US-157 (AC-1) |
| AC-T5.2 | US-075 |
| AC-T5.3 | US-072 (AC-4), US-074 (AC-6), US-014, US-016, US-103 (AC-4), US-140 (AC-5), US-139 (cohortes) · piloto: US-152 (AC-3), US-153 (AC-4), US-160 (AC-4) |
| AC-T5.4 | US-074, US-014 (AC-5), US-103 (AC-5), US-131 (AC-3), US-157 (AC-4), US-159 (AC-4), US-160 (AC-3) |
| AC-P.1a | US-207 (Post-MVP) |
| AC-P.1b | US-208 · DEC-20 (Post-MVP) |
| M-01.1, M-01.2, M-01.3 | 🔗 US-103 (+ US-104, calibración TBD-03) |
| M-02.1, M-02.2, M-02.3, M-02.4 | 🔗 US-105 |
| M-02.5 | baseline: US-075 + US-008 · DEC-02 · medición con OncoLens en ambas cohortes: **US-152** |
| M-03.1 … M-03.5 | 🔗 US-106 (invariante de M-03.5 también en US-098 AC-2 y US-086 AC-3) |
| M-04.1, M-04.2 | 🔗 US-131 |
| M-04.3 (gobierno) | DEC-01 AC-1 (revisado sin firma formal, P-03; conflicto con el PRD registrado en FEAT-04) |
| M-05.1 (gobierno) | US-020 · DEC-10 (S6; escenario: retirado del gate mientras FEAT-05 no exista) |
| M-06.1 | 🔗 US-072, US-073 (S2), US-133 (`si-hay-capacidad`, sin retroceso) |
| M-06.2 | 🔗 US-073 (S2), US-142 AC-7 (recalibración con hasta 3 opciones, S5; integra US-141 `si-hay-capacidad`, insumo de ADR-42), US-161 (con agente, Post-MVP) |
| M-07.1 | 🔗 US-157 (S6 `si-hay-capacidad`) |
| M-07.2 | 🔗 US-072 (AC-3), US-073, US-140 (con hasta 3 opciones) |
| M-07.3 | 🔗 US-157 (invariante también en US-168 AC-1) |
| M-08.1 (mixto) | US-024 · DEC-14 (S5, cohorte sintética) · cohorte real: **US-153** (S6) |
| M-08.2, M-08.6 | 🔗 US-132 (invariantes también en US-122 AC-2) |
| M-08.3, M-08.4 | 🔗 US-132 (muestra humana: US-118 AC-5) |
| M-08.5 | 🔗 US-161 (Post-MVP) |
| M-09.1, M-09.2 | 🔗 US-158 (S6 `si-hay-capacidad`) |
| M-10.1 | 🔗 US-072, US-140 (con hasta 3 opciones) |
| M-10.2 | 🔗 US-072 (salidas), US-068 (UI), US-140 (con hasta 3 opciones), US-156 (salidas del piloto) |
| M-11.1, M-11.2 | 🔗 US-159 (S6 `si-hay-capacidad`) |
| M-11.3, M-11.4 | 🔗 US-160 (Post-MVP; invariantes también en US-191 y US-190) |
| VM-4, VM-5 | US-137, US-138 (captura), US-139 (agregado y validación de catálogos, P-03: aplicabilidad ← VM-4 ≥ 70 % con calificación ≥ 4, datos críticos ← VM-5 ≥ 80 % "correcto y útil", §15 resp. 5) · piloto: US-154 |
| VM-6 | US-155 |
| G-15 / G-Éxito | US-156 |

**`AC-xx.y`, `AC-Tn.m`, `AC-P.1x` y `M-xx.y` del PRD sin historia:** ninguno.

### Cobertura de FR, HU y OL

| Familia | Cobertura | Historias añadidas en el lote 4 |
|---|---|---|
| FR-01…FR-30 | **30/30** con ≥ 1 Story | FR-03 asistido: US-180…US-182 · FR-12: US-174…US-179 · FR-13: US-193, US-194 · FR-14: US-197, US-199, US-207 · FR-15: US-203, US-204 · FR-16 (UI, investigación): US-200, US-201 · FR-17 (job): US-209, US-210 · FR-24: US-166…US-170 · FR-26: US-162…US-165 · FR-28: US-171…US-173 · FR-29: US-189…US-192, US-195 · FR-30: US-186…US-188 |
| HU-01…HU-26 | **26/26** con ≥ 1 Story | HU-08: US-180…US-182 · HU-11: US-174, US-179 · HU-12: US-193, US-194, US-196 · HU-13: US-197…US-202 · HU-14: US-201, US-203, US-204 · HU-19: US-171…US-173 · HU-20 (vigencia): US-162…US-165 · HU-21: US-166…US-170 · HU-23: US-195, US-196 · HU-24: US-175…US-178, US-189…US-192 · HU-26: US-186…US-188 |
| OL-01…OL-06 | **6/6** con ≥ 1 Story | Cabeceras de historia con el ticket: OL-03 (US-052, US-053), OL-04 (US-060, US-061), OL-05 (US-076, US-082, US-087); OL-01, OL-02 y OL-06 ya estaban en las cabeceras (US-038…US-040, US-055/US-058/US-059, US-072…US-075) |

## Historias pendientes de crear

Ninguna. Todos los IDs provisionales quedaron reconciliados (verificación: `grep -rnoE 'US-[A-Z][A-Za-z0-9]*-[0-9x]+' backlog/features/` solo encuentra esta nota histórica).

### Nota histórica de reconciliación (única ubicación de los IDs provisionales)

- **Lote 1:** US-CAT-01 → US-041 (+ US-042) · US-OL03-01 → US-052 y US-053 · US-OL04-01 → US-060 y US-061 (RN-23 → US-068) · US-T3-01 → US-071 · US-T5-02 → US-074.
- **Lote 2:** US-HU15-01 → US-088 (API) y US-090 (página) · US-FR04-01 → US-091 · US-HU04-01 → US-079 (+ US-076, US-077) · US-T1b-01 → US-102 · US-MAN-01 → US-110 y US-111 · US-T2-01 → US-128 · US-T2-xx → US-129 (c) y US-130 (g) · US-T5-01 → US-131 · US-CAP06-01 → US-112, US-114 y US-116 · US-CAP08-01 → US-124 (+ US-122, US-123). US-FR11-01 se acotó a conflicto y faltantes (S4); la parte S2 es US-101. Nuevo en el lote 2: US-FR12-01 (hallazgo M-14 del piloto).
- **Lote 3:** US-HU10-01 → US-134 (+ US-135, UI) · US-FR11-01 → US-136 · US-HU25-01 → US-137 (+ US-138, US-139) · US-RN13-01 → US-143 · US-RN15-01 → US-148 (+ US-149, marcas por CLI).
- **Lote 4:** US-FR12-01 → **US-177** (re-ejecución que recalcula faltantes, FEAT-11a) · US-RN17-01 → **US-198** (`422` por egresado, FEAT-T4b) · US-FR15-01 → **US-204** (`403` por equipo tratante, FEAT-T4e). En el lote 4 se retiraron de las cabeceras de historia las anotaciones "absorbe US-…" y las tablas locales de IDs provisionales (FEAT-04): esta nota es la única fuente de las equivalencias.

## Publicación en Linear (F6, 2026-10-07)

Proyecto `OncoLens-1` (`P-L1D-1`), equipo `L1D`. El Markdown es la fuente; Linear es el espejo. Cada Feature y cada historia lleva debajo de su título la línea `> Linear: [L1D-NN](…)`.

- **Features:** 45 issues padre (L1D-5 … L1D-49), con label `Feature`, talla y capacidad.
- **Historias:** 213 sub-issues (L1D-50 … L1D-262), con milestone, estimación Fibonacci y labels (`recorrido-principal`, `si-hay-capacidad`, `needs-refinement`, `ADR`, `Decisión` + `refinar-en-planning`, `estimate/?`).
- **Milestones:** Pre-S1, Sprint 1…Sprint 6, Si hay capacidad, Post-MVP.
- **Relaciones de bloqueo:** 30 (`blockedBy`), según la lista ⛔ de cada historia en el manifiesto de publicación.

## Último ID usado: US-213

**US-213** (FEAT-PL1, S1, 5 puntos, 2026-10-08): herramientas deterministas de calidad (ESLint, Ruff, dependency-cruiser, import-linter y umbrales en `quality-thresholds.json`) que consume el agente `design-principles-reviewer`. Pendiente de publicar en Linear.


Historias nuevas de los ajustes del usuario del 2026-10-07: **US-211** (FEAT-T4a, S1, división de US-044) y **US-212** (FEAT-01a, S3, extraída de US-080). DEC nuevas del lote 4: **DEC-20** (US-208, criterio de "listo" de CAP-12). Último DEC: DEC-20. Último ADR del backlog: ADR-44 (ADR-7 es anterior y Futuro).
