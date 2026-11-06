# Proposal — d5fb-02-listado-faltantes-criticos-reales

## Trazabilidad

Origen: feedback de la Demo 5 (2026-11-05), sin L1D asignado (crear historia en Linear solo con aprobación del usuario) ·
FR-23 (checklist de datos críticos), FR-02 (listado) · RN-26 (los avisos clínicos no bloquean) · RN-10 (sin identidad
fuera de `clinical-api`) · RN-22 (valores a calibrar en configuración) · ↪ US-003 (L1D-95, archivado; decisión Q2 / D7b que
aplazó el cálculo por fila) · ↪ US-048 (listado) · ↪ US-254 (seed de la Demo 4-5) · PRD v1.4 §11 (el `admin` no lee datos clínicos).

> **Feedback del usuario (2026-11-05):** «En el listado de pacientes `/pacientes` todos dicen 0 en la columna "Faltantes
> críticos"; agregar al menos 2 pacientes con faltantes críticos.»

## Why

El 0 del listado **no es falta de datos del seed**: es un valor fijo. `FALTANTES_CRITICOS_POR_AHORA = 0`
(`patients.reglas.ts`) alimenta `missingCriticalCount` en el listado y la búsqueda (`patients.service.ts`), porque
`l1d-95` (decisión Q2, D7b) aplazó el checklist por fila «hasta que una historia posterior lo calcule». La ficha sí lo
calcula con `CompletenessService`. El resultado es una columna que afirma «0 faltantes» para pacientes que, en su ficha,
tienen varios: un valor inventado que desorienta al oncólogo (FR-23) y que contradice a la ficha.

## What Changes

- **El listado y la búsqueda calculan `missingCriticalCount` con el mismo `CompletenessService`** que la ficha, **en
  lote por página** (una consulta por entidad de destino para todos los pacientes de la página, no una por fila). Se
  retira `FALTANTES_CRITICOS_POR_AHORA`.
- **`CompletenessService.calcularVarios(patientIds)`** (puerto nuevo, misma regla pura `calcularChecklist`): devuelve por
  paciente el checklist o `no_disponible`; el fallo de un paciente no afecta a los demás.
- **Si el cálculo falla** (por paciente o del lote) el listado sigue en `200` (RN-26): esa fila trae
  `missingCriticalCount = 0` y `completenessAvailable = false`, y la UI muestra «No disponible», nunca un 0 como dato.
- **Contrato aditivo:** `PatientListItem.completenessAvailable` (booleano opcional; ausente equivale a `true`), igual que
  en `PatientSummary`. `info.version` de `clinical-api` sube un menor (hoy `1.20.0`; este change toma **`1.21.0`**; d5fb-04 tomará `1.22.0` y d5fb-05 `1.23.0` al rebasar).
- **Administrador:** sin cambios. `PatientAdminSummary` no tiene contadores clínicos y la vista `admin` no invoca el
  servicio de completitud (mínimo privilegio).
- **Web:** la columna «Faltantes críticos» pinta «No disponible» cuando `completenessAvailable = false` y «—» cuando `cancerTypeEnabled = false` (otro agente).
- **Seed:** **no se añaden pacientes** (10 de 13 ya tienen faltantes con el catálogo real, design D6); una prueba fija
  como invariante que el listado del seed muestra ≥ 2 pacientes con `missingCriticalCount > 0` y que el contador de
  cada fila iguala al de su ficha.
- **Presupuesto:** se usa el NFR del PRD (listado p95 ≤ 1 s) y el criterio estructural «el número de consultas no crece
  con el tamaño de página».

## Capabilities

### Modified Capabilities
- `patients-identity`: el listado y la búsqueda calculan el contador por el servicio de completitud, en lote, con
  degradación por fila; sustituye al requisito «no calculan el checklist en el S4».
- `completeness`: `calcularVarios` (lote) con equivalencia exacta con `calcular` y consultas acotadas.
- `api-contracts`: `PatientListItem.completenessAvailable` (aditivo) y su ejemplo.

## Impact

`apps/clinical-api/openapi.yaml` (aditivo; regenera `packages/api-contracts` y Zod), `contracts/examples/` (listado con
una fila `completenessAvailable = false`), `src/modules/completeness/{ports,completeness.service,repositorio}.ts`,
`src/modules/patients/{patients.service,patients.reglas}.ts`, `src/composition.ts` (el servicio de completitud ya se
inyecta en `patients`), la tabla del listado en `apps/web` y `docs/demo/guia-demo-S5.md` (columna de faltantes del
listado). Sin cambios de esquema, de modelo, de IA, de catálogo ni de corpus.

## Non-goals

Persistir o cachear el contador (columna desnormalizada), ordenar o filtrar el listado por faltantes, exponer el contador
al `admin`, cambiar la regla del checklist o el catálogo, bloquear nada
por faltantes (RN-26), cambios en `apps/web` más allá del texto de la celda.
