# Proposal — l1d-95-completeness-endpoint-ficha

## Trazabilidad

L1D-95 · US-003 · FEAT-04 (L1D-14) · Sprint 4 (recortada) · Estimación **3** · HU-18 · FR-23 (checklist), FR-01 (sesión) ·
AC-04.1, AC-T1.1 · US-003 AC-1, AC-2 (solo ficha), AC-3, AC-4, AC-5, AC-6 · RN-26 (los avisos clínicos no bloquean:
`faltante` nunca da `4xx`) · RN-27 · RN-29 · ↪ US-002 (L1D-94, archivado) · ↪ L1D-95a (seed con códigos del catálogo,
archivado) · `[S4 resp. 6c]`.

- ⛔ Ninguna dependencia abierta: `l1d-94-checklist-determinista` y `l1d-95a-seed-codigos-catalogo` están archivados.
- ↪ Cierra la tarea 1.12b de `l1d-94` (cableado de `componerCompletitud` en `composition.ts`/`server.ts`) y la deuda 4.6.
- 🔗 Produce para: US-088 (`CaseView.completeness`, S5; reutiliza el mismo servicio e ítem), US-005 (S4, enlace a la ficha),
  US-126 (enlace a la ficha), US-004 (S5).
- 🔗 Regresión [FR-18] → US-102 (S6): la lectura auditada de `/completeness` es AC-6 de US-102, no escenario aquí.
- 🔗 Regresión [RN-15] → US-148 (activa desde S6): `/completeness` y `/case` no responden `403` por opt-out (FR-16).
- 🔗 Regresión [FR-15] → US-204 (Post-MVP). 🔗 Medido en: US-105 (M-02.4).

> **Decidido (usuario, 2026-10-29, `[S4 resp. 6c]`):** AC-2 en su parte `GET …/case` pasa a US-088 (S5, AC-8); AC-7
> (lectura auditada) pasa a US-102 (S6, AC-6); AC-6 = `200` con `items = []` y `cancerTypeEnabled = false`.
> **Decidido (usuario, 2026-10-24/27):** el seed usa los códigos del catálogo; la parte del seed se hizo en `l1d-95a`.

## Why

El motor de `l1d-94` calcula el checklist, pero nadie lo expone: no hay ruta, `missingCriticalCount` de la ficha sale
fijo en `0` (`FALTANTES_CRITICOS_POR_AHORA`) y el oncólogo no ve de dónde sale cada dato ni adónde cargar lo que falta
(FR-23, HU-18).

## What Changes

- **`GET /platform/patients/{patientId}/completeness`** (`clinical:read`; `admin` → `403`) devuelve `CompletenessView`
  (`catalogVersion`, `cancerTypeEnabled`, `items[]` con `origin`, `provenance`, `destination`, `condition`); la
  procedencia es un subconjunto propio, `CompletenessProvenance` (con `page`), sin tocar el `Provenance` existente.
- **Procedencia por ítem** en el servicio: `origin`/`provenance` del registro que hizo presente cada ítem
  (`documento|manual|correccion|seed`); `faltante` → `origin = regla`, `provenance = null`, `destination`;
  `no_aplica` → `origin = regla` y `condition`.
- **`PatientSummary.missingCriticalCount`** sale del mismo servicio (número de `faltante`), sustituye al `0` fijo; si el
  cálculo falla, `200` con `completenessAvailable = false` (propiedad opcional nueva **solo en `PatientSummary`**),
  nunca `5xx` (RN-26); la ficha lo pinta como aviso no bloqueante en `l1d-97` (decisión Q2 del usuario, 2026-10-30).
- **Listado y búsqueda sin cambios en el S4 (Q2):** no se calcula el checklist por fila; `PatientListItem` no cambia
  y su `missingCriticalCount` conserva el valor actual (`FALTANTES_CRITICOS_POR_AHORA`).
- **Tipo de cáncer no habilitado o sin `Diagnosis` activo** → `200` con `items = []` y `cancerTypeEnabled = false`
  (`missingCriticalCount = 0`).
- **Cableado** del módulo `completeness` en `composition.ts`/`server.ts` y del router. `info.version` → `1.12.0`.
- El Route Handler BFF `GET /api/patients/[id]/completeness` **no** es de este change: lo crea `l1d-97`.
- **Deuda de `l1d-94` (4.6)**: vocabulario de operadores en un solo sitio (F-3), fixtures FX-04-a a
  `packages/clinical-catalogs` (F-5), F-8, F-9, F-11; `patientId` UUID con Zod y sin registrar el error de `pg`.
- **Decidido (usuario, 2026-10-30):** (1) los cinco Menores del PR #197 se aplican dentro de este change, sin importar
  la numeración F-8/F-9/F-11: (a) JSDoc duplicado de `ports.ts`; (b) exports sobrantes `registrosDelDestino` y
  `excluirNoMapeados`; (c) el marcador de no-fuga cubre `ClinicalEvent.description`; (d) la consulta de `Exam` usaba
  `t.review_status`, columna que `clinical.exam` no tiene; (e) includes de Vitest y dependencia con `evidence-analysis`.
  (2) Tarea 4.7 de l1d-94: para el MVP los criterios son RE/RP/HER2 y basta lo hecho en L1D-95a (#212); BRCA/HRR no se
  eliminan del modelo y quedan como biomarcadores moleculares opcionales con los estados positivo, negativo, no
  realizado y desconocido (se demuestra con una prueba; el texto libre de `Biomarker.value` ya los admite).

## Capabilities

### Modified Capabilities
- `completeness`: endpoint, procedencia por ítem, tipo no habilitado, errores de borde.
- `patients-identity`: el contador de faltantes de la ficha deja de ser fijo; el listado y la búsqueda no cambian (Q2).
- `api-contracts`: `/completeness` y `CompletenessView` en el OpenAPI de `clinical-api` (aditivo).

## Impact

`apps/clinical-api/openapi.yaml` (aditivo, `1.12.0`; regenera `packages/api-contracts` y Zod), `contracts/examples/`
(3 ejemplos `200` nuevos de `/completeness`, 1 de `PatientSummary` con `completenessAvailable = false` y 4 errores
registrados en `index.json`), `src/modules/completeness/*`,
`src/modules/patients/ficha.service.ts` (el listado, `patients.service.ts`, no cambia; Q2), `src/composition.ts`, `src/server.ts`,
`packages/clinical-catalogs` (fixtures). Sin cambios de esquema, de modelo, de IA ni de `apps/web`.

## Non-goals

`CaseView.completeness` (US-088), auditoría de la lectura (US-102), `403` por opt-out (US-148), UI del checklist
(US-004; el aviso de `completenessAvailable = false` en la ficha lo pinta `l1d-97`, Q2), checklist por fila en el
listado o la búsqueda (Q2), Route Handler BFF (l1d-97), verificar datos desde el checklist (US-107/US-108), cualquier bloqueo por faltantes (RN-26).
