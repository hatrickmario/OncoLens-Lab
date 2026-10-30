# Tasks — l1d-95-completeness-endpoint-ficha

> ⛔ Ninguna abierta (l1d-94 y l1d-95a archivados). ↪ Cierra 1.12b y 4.6 de l1d-94. Sin tareas de `apps/web`: el
> Route Handler `GET /api/patients/[id]/completeness` lo crea `l1d-97`, que consume los ejemplos de este change.
> Matriz TDD (CLAUDE.md): endpoint y service con lógica → TDD estricto, doble bucle; cableado, fixtures y deuda →
> test después. Integración con PostgreSQL real de test; MSW solo en el HTTP saliente; sin `vi.mock` de módulos propios
> ni de Prisma; reloj e IDs inyectados; nunca `.skip`/`.only`/`it.todo`. Secuencia: contract → test → feat → refactor.

## 1. contratos

- [ ] 1.1 (`sync-contracts`) Editar primero `apps/clinical-api/openapi.yaml` según el YAML de `design.md` §Contratos: `GET /platform/patients/{patientId}/completeness`, `CompletenessView`, `CompletenessItem`, `CompletenessProvenance` (subconjunto propio; `Provenance` no cambia), `completenessAvailable` opcional solo en `PatientSummary` (`PatientListItem` sin cambios, Q2), `info.version` → `1.12.0` (cadena clinical-api 291 → 95 → 295 → 144 → 300: rebasa sobre `l1d-291`, 1.11.0; `l1d-295` rebasa sobre este). Ejemplos en `contracts/examples/` registrados en `index.json`: `completeness-f-m2.json` (6 faltantes), `completeness-f-m1.json` (0), `completeness-tipo-no-habilitado.json` (`items = []`), `patient-summary-checklist-no-disponible.json` (`PatientSummary` con `missingCriticalCount = 0` y `completenessAvailable = false`, lo consume `l1d-97`, Q2) y los existentes `error-no-autenticado`/`error-permiso-denegado`/`error-no-encontrado`/`error-interno` contra `401/403/404/500` de la operación; `contracts:generate`. Verificación: `contracts:check`, `contracts:generate:check` y `contracts:breaking` en verde. Commit `contract(L1D-95)`.

## 2. clinical-platform

- [ ] 2.1 (TDD estricto) Test de aceptación en rojo: "devuelve 200 con los items de F-M2 y catalogVersion test-1.0.0 [US-003 AC-1]" · integración Supertest. Esqueleto del controller con `throw new Error('no implementado')`. Commit `test(L1D-95)`.
- [ ] 2.2 (TDD estricto) Tests de aceptación en rojo: ficha con `missingCriticalCount = 6` [AC-2]; origen y procedencia por estado [AC-3]; `401` sin invocar el servicio [AC-4]; `admin` → `403 PERMISO_DENEGADO` sin invocar el servicio [AC-4, mínimo privilegio]; `404 { error, message }` [AC-5]; `200` con `items = []` y `cancerTypeEnabled = false` por tipo no habilitado y sin `Diagnosis` activo [AC-6]; ficha `200` con `completenessAvailable = false` y `missingCriticalCount = 0` si el checklist falla [AC-2, RN-26]. Commit `test(L1D-95)`.
- [ ] 2.3 (TDD estricto) `procedenciaDeItem()` puro con unitarios uno a uno (documento con `page`, manual, corrección, faltante, no_aplica con `condition`, `entryMethod = seed` → `origin = seed`); repositorio proyecta `source_span.page` y `sourceDocumentId`, sin N+1 y sin leer `identity` ni `ClinicalNote`. Commit `feat(L1D-95)`.
- [ ] 2.4 (TDD estricto) `completeness.controller.ts` + `completeness.schema.ts` (Zod en el borde, `patientId` UUID; mal formado → `404`), `cancerTypeEnabled` desde `ENABLED_CANCER_TYPES`, sin registrar el error de `pg`. Verificación: 2.1–2.2 (AC-1, 3–6) en verde. Commit `feat(L1D-95)`.
- [ ] 2.5 (TDD estricto) La ficha (`ficha.service.ts`) obtiene `missingCriticalCount` del `CompletenessService` (`0` con tipo no habilitado o sin diagnóstico activo; `0` + `completenessAvailable = false` si el cálculo falla, nunca `5xx`). El listado y la búsqueda (`patients.service.ts`) **no cambian** en el S4 (Q2): no invocan `CompletenessService` y siguen con `FALTANTES_CRITICOS_POR_AHORA`, que se conserva solo para ese uso. Verificación: AC-2 en verde y suites de la ficha (l1d-72) y del listado sin cambios de aserción. Commit `feat(L1D-95)`.
- [ ] 2.6 (test después) Cablear `componerCompletitud` y el router en `src/composition.ts`/`server.ts` (tarea 1.12b de l1d-94). Verificación: la ruta responde en el arranque de la app con `CLINICAL_CATALOG_PATH` de test.
- [ ] 2.7 (test después) No-fuga: logs de `/completeness` y de la ficha sin identidad, valores clínicos, etiquetas ni error de `pg`; el UUID del paciente sí puede aparecer, con `traceId`, `catalogVersion` y conteos. Test con `tests/support/captura-de-salidas.ts`.
- [ ] 2.8 (test después) Deuda l1d-94 4.6: F-3 vocabulario de operadores en un solo sitio; F-5 fixtures FX-04-a a `packages/clinical-catalogs` con sus tests apuntando allí y `label.es` legibles iguales a los de los ejemplos de `contracts/examples/`; F-8, F-9, F-11 según el reporte del Gate 2 de l1d-94. Verificación: `catalog:validate` y suites de completitud en verde.
- [ ] 2.9 Refactor: Extract/Inline Method en los archivos tocados, tests en verde antes y después, commit `refactor(L1D-95)`.

## 3. evaluación

- [ ] 3.1 (exento) Sin cambio de modelo, prompt, umbral, catálogo real ni corpus: `run-ai-eval` no aplica (nota en el PR).

## 4. Verificación

- [ ] 4.1 `openspec validate l1d-95-completeness-endpoint-ficha --strict` en verde.
- [ ] 4.2 Suite de `apps/clinical-api` en verde, `contracts:verify-provider`, `tsc --noEmit`, `eslint`, `lint:lenguaje` y `pii-scan` limpios.
