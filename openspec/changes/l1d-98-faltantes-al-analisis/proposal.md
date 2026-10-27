# Proposal — l1d-98-faltantes-al-analisis

## Trazabilidad

L1D-98 · US-006 · FEAT-04 (L1D-14) · Sprint 3 · Estimación **3** · HU-18 · FR-23, FR-09 (contexto con
faltantes), FR-27 inciso (b) (produce el dato; dueña del inciso: US-128) · RN-11, RN-26 · AC-04.2, AC-04.3,
AC-T1.4, AC-T4.3 · US-006 AC-1…AC-8 · ↪ US-002 (L1D-94), US-052, US-053 · 🔗 Produce para: US-128 (L1D-188,
inciso b, S3), US-116 (L1D-113, Backend 2, S5), US-124 (L1D-129, aplicabilidad, S3), US-177 (re-ejecución, S6
si hay capacidad) · 🔗 Regresión [RN-11] → US-049 · 🔗 Regresión [RN-06] → US-053 · 🔗 Regresión [RN-02] →
US-055 · 🔗 Regresión [RN-15] → US-148 (activa desde S6) · 🔗 Regresión [RN-17] → US-198 (Post-MVP) · 🔗
Regresión [FR-15] → US-204 (Post-MVP).

> **Reordenamiento (usuario, 2026-10-23):** S4 → S3 (`backlog/features/README.md`, «Reordenamiento del
> 2026-10-23»).
>
> **Decidido (usuario, 2026-10-23, `[S3 resp. 5]`):** si el checklist falla en el servidor, el análisis
> responde error (reproducibilidad, AC-T1.4); no se analiza sin faltantes (AC-8).
>
> **Decidido (usuario, 2026-10-24, `[S3 resp. 18]`):** US-128 (L1D-188) se adelanta al S3 y es quien declara los
> faltantes en la Base del análisis; este change no toca el texto de la Base.

## Why

Hoy `clinical-api` envía `clinicalContext.missingCriticalData = []` y persiste `missing_critical_data = []` en
todo análisis (S1–S2): el análisis no sabe qué datos críticos del paciente faltan y el registro no permite
revisar después con qué información se hizo. Con el checklist determinista de US-002 (L1D-94) disponible en el
S3, el gateway puede enviar los faltantes como claves del catálogo, que Backend 2 tratará como "desconocido"
(US-116) y la aplicabilidad usará como causa `falta_en_paciente` (US-124), y dejarlos persistidos junto con la
elección del oncólogo de continuar con aviso (AC-T1.4). Es el eslabón "faltantes" de la hipótesis del MVP
(caso reconstruido → faltantes → opciones más aplicables).

## What Changes

- El gateway de `POST /platform/evidence-analyses` calcula el checklist **en el servidor, en cada análisis**,
  después de los cortes de tipo de cáncer y antes de construir el contexto, mediante un puerto nuevo
  (`ChecklistDeFaltantes`) sobre `CompletenessService.calcular(patientId)` de US-002.
- `clinicalContext.missingCriticalData` lleva las **claves del catálogo** en estado `faltante`, en el orden del
  catálogo, **siempre**, con o sin `continueWithWarning` (FR-09, RN-26). Nunca etiquetas, texto libre ni valores
  del paciente (RN-11).
- El `AIAnalysisRecord` persiste `missing_critical_data` (la misma lista enviada), `continued_with_warning` y
  `catalog_version` en la misma transacción que el resto del registro y antes de responder (RN-06), también en
  `sin_evidencia`.
- Si el checklist falla, la respuesta es `500 ERROR_INTERNO` sin llamar a `rag-orchestrator` ni persistir
  (`[S3 resp. 5]`).
- Sin cambio de `openapi.yaml` ni de `contracts/examples/`: `ClinicalContext.missingCriticalData`,
  `AnalysisBasis.missingCriticalData`, `continueWithWarning` y `ErrorInterno` ya están congelados (US-033).

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `evidence-analysis-gateway`: el requisito "Contexto clínico por allowlist explícita" deja de exigir
  `missingCriticalData = []`; se añaden requisitos para los faltantes en el request interno, su persistencia con
  el análisis y el fallo cerrado cuando el checklist no está disponible.

El cálculo del checklist (capacidad `completeness`) es de L1D-94 (US-002); este change solo lo consume y no
duplica sus requisitos. El inciso (b) de `analysisBasis` (`analysis-basis`) es de US-128 (L1D-188, adelantada al S3, `[S3 resp. 18]`):
no cambia aquí.

## Bounded contexts

- **clinical-platform** (`apps/clinical-api`, módulo `evidence-analysis`): único contexto con código.
- **ai-services**: sin cambios (`rag-orchestrator` ya acepta `missingCriticalData`; su uso en el prompt es de
  US-116, S5).
- **frontend**: sin cambios (el aviso previo y `continueWithWarning = true` desde el panel son de US-005, S4).

## Dependencias

- ↪ **L1D-94 (US-002)**, change `l1d-94-checklist-determinista` (**ya mergeado**): `CompletenessService.calcular(patientId)`
  (devuelve `{ catalogVersion, items: [{ key, status }] }`), su motor puro, los fixtures FX-04-a (catálogos
  `test-1.0.0` y `test-1.1.0` en `apps/clinical-api/tests/fixtures/completeness/catalogos/`) y FX-04-b (pacientes
  F-M1, F-M2, F-M3, F-P1). El adaptador del puerto `ChecklistDeFaltantes` es la única pieza del gateway que
  conoce esa interfaz. L1D-94 (1.12b) **trasladó a L1D-95 el cableado** de `componerCompletitud` en
  `composition.ts`/`server.ts` y el `l1d-95a-seed-codigos-catalogo` no lo hace: aún no existe, la tarea 1.6b lo hace aquí.
- ↪ **`l1d-95a-seed-codigos-catalogo` (renombra a `RE`/`RP` los biomarcadores «Receptor de …»)**: el catálogo real declara
  las claves `re` y `rp`; mientras el seed no mergee, el checklist con el **catálogo real** da `re`/`rp` como
  faltantes falsos. Por eso L1D-98 va **después** del change de seed (los tests con `test-1.0.0` no se ven
  afectados). Riesgo conocido adicional: `her2_ihq` saldría faltante falso con el catálogo real (`exam_type = 'IHQ'` vs `'inmunohistoquimica'` sembrado); no afirmarlo en demo/AC. Decisión pendiente del usuario: alinear `exam_type` en `l1d-95a-seed-codigos-catalogo` (recomendado) o en L1D-95/S4.
- ↪ **US-052 / US-053** (archivados, S1): gateway, persistencia antes de responder, deadline y mapeo de fallos.
- ↪ **US-066** (archivado, S2): `AnalysisBasisBuilder`, que ya recibe el request interno con la lista.
- 🔗 Produce para **L1D-188 (US-128)**, adelantada al S3 (`[S3 resp. 18]`): ↪ L1D-98; declara los faltantes en la
  Base (inciso b) a partir de `missing_critical_data`.
- 🔗 Produce para **L1D-129 (US-124)**, change `l1d-129-aplicabilidad-causas-avisos`: la causa
  `falta_en_paciente` desde `missingCriticalData`.

## Fuera de alcance

- Uso de los faltantes en el prompt y en la recuperación de Backend 2 → US-116 (S5).
- "Desconocido: falta en el paciente" en la aplicabilidad → US-124 (L1D-129).
- Inciso (b) de `analysisBasis` (`missingCriticalData`, `continuedWithWarning` de la Base) y retiro del supuesto
  declarado "Los faltantes críticos aún no se calculan en esta versión" → US-128 (L1D-188, adelantada al S3, `[S3 resp. 18]`), que depende de este change.
- Supuestos anclados a faltantes, inciso (c) → US-129. Aviso `datos_faltantes` en las tarjetas → US-136.
- `GET /platform/patients/{id}/completeness` y el aviso del panel antes de analizar → US-003, US-005 (S4).
- Re-ejecución que recalcula los faltantes → US-177. Marca "catálogo más reciente" → FR-12 (FEAT-11a).
- `tipo_no_habilitado` (US-043): no calcula el checklist ni llama a Backend 2; sigue persistiendo
  `missing_critical_data = []` (significa «no se evaluó»).
- Semántica de `[]`: `missingCriticalData = []` significa «ningún ítem en `faltante`» y **no equivale a
  «completo»** cuando no hay diagnóstico activo o tipo de cáncer (el checklist de US-002 devuelve `items: []`);
  esos casos ya se cortan antes (`404` / `tipo_no_habilitado`, design D2).

## Impact

- `apps/clinical-api/src/modules/evidence-analysis/`: `ports.ts` (puerto `ChecklistDeFaltantes` y error
  `ChecklistNoDisponibleError`), `evidence-analysis.service.ts` (paso del checklist), `clinical-context.builder.ts`
  (recibe la lista), `analysis-record.ts` (persiste la lista del request), `evidence-analysis.controller.ts`
  (mapeo a `500 ERROR_INTERNO`), `evidence-analysis.module.ts` (adaptador sobre `CompletenessService`), `src/composition.ts` y `src/server.ts`
  (composición de `componerCompletitud` con el mismo catálogo que `CatalogVersionProvider`).
- Tests de integración del gateway con FX-04-a/FX-04-b y `rag-orchestrator` simulado con MSW.
- API: sin cambio de forma; `missingCriticalData` deja de ir vacío. Evaluación: no cambia modelo, prompt,
  umbral, catálogo real ni corpus.
