# Proposal — l1d-90-registro-manual-biomarcador-diagnostico

## Trazabilidad

L1D-90 · US-110 · FEAT-03b (L1D-13) · Sprint 5 · Estimación **5** · HU-18 (acceso desde el checklist), HU-09 · FR-23
(registrar a mano), FR-22 (datos manuales), FR-08 · RN-08, RN-17, RN-27 · ADR-33, ADR-21, ADR-50 (mismo patrón de
corrección) · DEC-05 · AC-04.1, AC-03.3 (manuales) · Q-03, Q-04 · `[§15 resp. 4]` `[Pre-S1 resp. 18]` `[Pre-S1 resp. 29]` ·
US-110 AC-1…AC-6 · `backlog/features/FEAT-03b-revision-conflictos-registro-manual.md` ·
`backlog/sprints/S5-refinamiento.md` (O2, «Nunca» se recorta: G-Demo)

## Por qué

Sin OCR en el MVP (PRD E-17), el registro a mano es la única forma de cerrar un faltante: el oncólogo escribe el Ki-67
o completa la gradación, el estadio o el ECOG sin esperar un documento (AC-04.1). G-Demo (D-5) recorre «registro a mano
de un faltante» y no se recorta.

## Qué cambia

- `clinical-api`: módulo nuevo `src/modules/manual-entry/` (Controller → Service → Repository, Zod generado del spec)
  que implementa los dos endpoints **ya congelados** en `apps/clinical-api/openapi.yaml` (US-033 AC-10):
  - `POST /platform/patients/{patientId}/biomarkers` (`createManualBiomarker`) → `201 Biomarker`: crea un `Exam`
    `entry_method = manual`, `exam_type = registro_manual`, y su `Biomarker` `verificado`, `extraction_confidence = n_a`,
    con el término y el código que decide `ReconciliationService` (ADR-33, RN-27).
  - `POST /platform/patients/{patientId}/diagnoses` (`createManualDiagnosis`) → `201 Diagnosis`: sin vigente crea uno
    `manual`; con vigente, **corrección explícita**: fila nueva `manual_correction`, `verificado`, `is_active = true`, con
    los valores del vigente más lo enviado, y la anterior pasa a `reemplazado` e `is_active = false` en la misma
    transacción (RN-08; el patrón que ADR-50 generaliza). `grade` es siempre texto derivado de la gradación de
    referencia (DEC-05); `gleasonScore` e `isupGradeGroup` se derivan y, si llegan, se validan.
  - Ambos: `403` sin `clinical:write` (el `admin`), `404` paciente inexistente, `422 PACIENTE_EGRESADO` (RN-17), `422`
    sin crear filas ante cualquier cuerpo inválido.
- `packages/clinical-catalogs`: fichero nuevo `escalas.json` (sistemas de estadificación por tipo de cáncer y escalas
  funcionales con su rango) con su schema y su regla en el validador, en el catálogo real y en el fixture
  `test-s2-1.0.0` (FX-01b-b ampliado por FX-03b-a: Ki-67, ECOG 0–5, `TNM_8`). Es la «lista de valores válidos que sale
  del catálogo» de AC-5.
- `packages/clinical-catalogs` (`[S5 resp. 9]`): **subconjunto mínimo de LOINC** en `mama/codigos.json` y
  `prostata/codigos.json` (y sus sinónimos) para los biomarcadores de los datos críticos de mama y próstata (HER2, RE, RP,
  Ki-67, PSA, …), con las condiciones de DEC-04: `nombreOficial` = nombre oficial de LOINC **sin modificar**, etiqueta
  propia en español en `etiquetaEs`, versión de LOINC registrada en `versionFuente`, aviso literal de Regenstrief en
  `NOTICE-loinc.txt` y **sin** códigos con `EXTERNAL_COPYRIGHT_NOTICE` (ni Part File ni jerarquías). Con `escalas.json`,
  `manifest.json` sube a **1.3.0**, la misma versión montada en ambos backends. Es cambio de catálogo → `run-ai-eval`.
- `prisma`: migración aditiva que relaja `clinical.diagnosis.histology` a `NULL` (AC-6 no exige histología y el contrato
  la declara nullable; ver design D7 y P-2).
- Sin cambio de contrato (ADR-26): los dos endpoints, sus schemas y sus ejemplos (`biomarker-manual.json`,
  `diagnosis-manual-*.json`, `error-gradacion-incoherente.json`, `error-paciente-egresado.json`,
  `error-valor-fuera-de-catalogo.json`) ya existen. La propiedad opcional `field` de los `422` (string sin enum, misma
  descripción en todos los errores de registro) la introduce `l1d-80` en el contrato `[S5 resp. 10]`; este change la
  usa igual (design D9).

## Capacidades

- `manual-clinical-entry` (**nueva**): registro manual de datos clínicos y corrección explícita del diagnóstico. No
  está en la lista de `openspec/config.yaml` porque nace con el MVP sin OCR (E-17); ninguna capacidad existente la
  cubre (`terminology-reconciliation` decide el código pero no persiste; `case-timeline` lee). La reutilizarán US-094
  (`l1d-80-*`) y US-253 (`l1d-309-*`).
- `clinical-catalogs` (ADDED): `escalas.json` y su validación en el arranque; subconjunto mínimo de LOINC de los datos
  críticos (`[S5 resp. 9]`).

## Bounded contexts

- `clinical-platform` (`apps/clinical-api`, `packages/clinical-catalogs`). Ni `ai-services` ni `frontend` (los
  formularios son US-111, `l1d-91-*`).

## Dependencias

- ⛔ `l1d-84-normalizacion-final-manual` (US-098): `ReconciliationService.decidir()` es la única dueña de RN-27; este
  change la inyecta y nunca asigna `mapeado`/`no_mapeado` por su cuenta. Su fixture FX-01b-b (`test-s2-1.0.0`) se amplía
  aquí con `escalas.json`.
- ↪ US-033 (contrato congelado, en `main`) · US-041 (catálogo validado en el arranque, en `main`) · US-072 ficha mínima
  y US-079/US-089 checklist (`GET …/completeness`, en `main`) · `l1d-173-tipos-cancer-habilitados`
  (`ENABLED_CANCER_TYPES`) · DEC-05 decidido.
- ↪ US-107 (verificación de datos extraídos): no bloquea en el MVP; sin OCR no hay extraídos que verificar.
- 🔗 Consumida por: `l1d-91-*` (US-111, formularios) y FEAT-04 US-004 (`l1d-96-*`, «Registrar a mano» en la vista de
  caso). `l1d-309-*` (US-253) aplica el mismo patrón a `Biomarker`/`Exam`/`ClinicalNote` con `supersedes_id` (ADR-50).
- 🔗 Cadena del catálogo (orden de merge): este change sube `manifest.json` a **1.3.0**; `l1d-80` lo sube a 1.4.0 (ATC).
  Sin cambio en `info.version` de `clinical-api`. Quien rebase renumera.
- 🔗 `l1d-80-tratamientos-atributos-manuales`: introduce `field` en `ErrorRegistroManualInvalido` y
  `ErrorDiagnosticoInvalido` (`[S5 resp. 10]`); `l1d-91` lo expone en la UI.
- 🔗 Regresión [RN-27] → US-098 · 🔗 Regresión [RN-17] → US-198 (Post-MVP: reactivación del egresado).

## Fuera de alcance

- Formularios y prellenado desde un faltante (US-111). Corrección de biomarcadores, exámenes y notas con
  `supersedes_id` (US-253, ADR-50). Tratamientos previos y atributos (US-094).
- `supersedes_id` en `clinical.diagnosis`: ADR-50 no la añade; el enlace del histórico del diagnóstico es implícito
  (ver P-3).
- `409 CATALOG_VERSION_MISMATCH`: no aplica (no se llama a Backend 2).
- Auditoría de la escritura (US-150, S6) y reactivación de un egresado (US-198, Post-MVP).
- Validar `stageValue` contra el sistema de estadificación (solo se valida el sistema, AC-5).
