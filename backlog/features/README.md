# Backlog de Features — OncoLens (PRD v1.2)

> Corrida piloto acotada a **CAP-04 · Información faltante** (FR-23, HU-18, Sprint 3). Las demás Features están por escribir; sus historias referenciadas figuran abajo con un ID provisional.

## Features escritas

| Feature | Talla | CAP / T | Sprint | Requisitos | Stories | Dependencias |
|---|---|---|---|---|---|---|
| [FEAT-04 — Información faltante: checklist determinista de datos críticos](FEAT-04-informacion-faltante.md) | L | CAP-04 · T-1 (AC-T1.1, AC-T1.4) · T-2 (produce el inciso b) | 3 | FR-23 (dueña); FR-09 y FR-27 (b) (produce); RN-29 (dueña); RN-26, RN-11, RN-07, RN-22 | DEC-01, US-001 … US-006 | ⛔ TBD-12 → DEC-01 · ↪ US-CAT-01, US-OL03-01, US-OL04-01, US-HU15-01 · 🔗 Medido en: US-T5-01 |

## Stories

| ID | Título | Sprint | Estimación |
|---|---|---|---|
| DEC-01 | Catálogo de datos críticos de mama y próstata validado y firmado por el oncólogo (dueño: oncólogo asesor) | 3 | 2 |
| US-001 | El catálogo de datos críticos se publica versionado y solo si cada ítem tiene campo de destino | 3 | 5 |
| US-002 | El checklist calcula de forma determinista el estado de cada dato crítico | 3 | 5 |
| US-003 | El checklist se expone por API en `/completeness`, en la vista de caso y en la ficha | 3 | 3 |
| US-004 | En la vista de caso veo el checklist y desde un faltante puedo cargarlo o registrarlo | 3 | 3 |
| US-005 | Antes de analizar, el panel lista los faltantes y me deja cargar información o continuar con aviso | 3 | 3 |
| US-006 | Los faltantes viajan al análisis como "desconocido" y quedan persistidos con el análisis | 3 | 3 |

## Puntos por sprint

| Sprint | Puntos | Detalle |
|---|---|---|
| Pre-S1 | 0 | — |
| S1 | 0 | — |
| S2 | 0 | — |
| S3 | **24** | DEC-01 (2) + US-001…US-006 (22) |
| S4 | 0 | — |
| S5 | 0 | — |
| S6 | 0 | — |
| **Total** | **24** | Sin historias en `?` ni en 13 |

## Cobertura de AC del PRD (alcance de esta corrida)

| AC / M del PRD | Historia |
|---|---|
| AC-04.1 | US-002 (AC-1, AC-2), US-003 (AC-1, AC-2), US-004 (AC-1 a AC-3) |
| AC-04.2 | US-005 (AC-1 a AC-3), US-006 (AC-3) |
| AC-04.3 | US-006 (AC-1). 🔗 Produce para la Base del análisis → US-T2-01; para la aplicabilidad → US-CAP08-01 |
| AC-04.4 | US-002 (AC-5, AC-6), US-006 (AC-4), DEC-01 (AC-4) |
| AC-04.5 | US-001 (AC-1 a AC-3) |
| M-04.1, M-04.2 | 🔗 Medido en: US-T5-01 (pendiente) |
| M-04.3 (gobierno) | DEC-01 |
| AC-T1.1 (checklist) | US-003 (AC-3), US-004 (AC-4) |
| AC-T1.4 (faltantes) | US-006 (AC-2) |
| AC-T4.3 (no-fuga en faltantes) | US-006 (AC-6) |

**`AC-xx.y` del PRD sin historia:** dentro de CAP-04, ninguno. Fuera de CAP-04, todos los demás (AC-01.x … AC-11.x, AC-T1.x a AC-T5.x salvo los citados, AC-P.1) quedan pendientes de sus Features, que esta corrida no escribe.

## Historias pendientes de crear en otras Features

| ID provisional | Feature / T dueña probable | Qué debe cubrir | Referenciada por |
|---|---|---|---|
| US-CAT-01 | Plataforma · catálogos (S1) | Primera versión de `packages/clinical-catalogs`, montaje de solo lectura, `CLINICAL_CATALOG_VERSION`, `409 CATALOG_VERSION_MISMATCH` (ADR-38) y su mapeo en el gateway. Debería adoptar el validador de RN-29 desde el S1 | US-001 |
| US-OL03-01 | CAP-06 / CAP-10 · gateway (S1, OL-03) | `POST /platform/evidence-analyses`; dueña de RN-06 y RN-11 | US-006 |
| US-OL04-01 | CAP-06 / CAP-10 · panel (S1, OL-04) | Panel y Route Handler; dueña de RN-23 en textos de UI | US-004, US-005 |
| US-HU15-01 | CAP-02 · vista de caso (S2) | `GET …/case` (`CaseView`) y página de vista de caso | US-003, US-004 |
| US-HU04-01 | CAP-01 · carga de documentos (S2) | Carga unitaria o múltiple desde la vista de caso | US-004 |
| US-MAN-01 | CAP-02 o FR-04 (por decidir) | Registro manual de biomarcadores y de campos de `Diagnosis` (histología, grado, estadio, ECOG): no hay endpoint en readme §4.1 | US-004 |
| US-T2-01 | T-2 · Base del análisis (S3, HU-20) | Inciso (b): `analysisBasis.missingCriticalData` y `continuedWithWarning`, en la respuesta y en la UI | US-006 |
| US-T2-xx | T-2 · Base del análisis (S3, HU-20) | Inciso (c): supuestos anclados a faltantes | US-006 (non-goal) |
| US-T3-01 | T-3 · control humano | Dueña de RN-26 / AC-T3.3 en todos los avisos clínicos | US-005, US-006 |
| US-T5-01 | T-5 · evaluación | Dataset de faltantes sembrados; M-04.1 y M-04.2 (puede reutilizar los fixtures F-M1…F-P1 de US-002) | US-002 |
| US-T5-02 | T-5 · evaluación | Suite de evaluación en todo PR que cambie el catálogo (AC-T5.4) | US-001 |
| US-CAP06-01 | CAP-06 · recuperación (S3) | Backend 2 usa `missingCriticalData` como "desconocido" en el prompt y para enriquecer la consulta (PRD §12) | US-006 |
| US-CAP08-01 | CAP-08 · aplicabilidad (S4) | "Desconocido: falta en el paciente" con enlace al checklist (AC-04.3, AC-08.2) | US-006 |
| US-FR11-01 | CAP-10 · avisos (S3, HU-05) | Aviso `datos_faltantes` en las tarjetas de opción | US-005, US-006 |
| US-HU25-01 | T-5 · feedback (S4) | Campos de VM-5 en `AnalysisFeedback` | US-005 |
| US-RN17-01 | CAP-11 / T-4 · ciclo de vida (S4) | `422` por paciente egresado en todo registro, incluido el análisis | US-006 |
| US-RN15-01 | T-4 · opt-out (S5) | `403` por opt-out de `analisis_ia` en toda generación con IA; `/completeness` y `/case` siguen respondiendo `200` (FR-16) | US-003, US-006 |
| US-FR15-01 | T-4 · equipo tratante (S5) | `403` sin pertenencia al equipo tratante en todos los endpoints de paciente | US-003, US-006 |
