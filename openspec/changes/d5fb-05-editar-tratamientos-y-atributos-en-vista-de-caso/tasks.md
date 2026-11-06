# Tasks — d5fb-05-editar-tratamientos-y-atributos-en-vista-de-caso

> Origen: feedback de la Demo 5 (2026-11-05), sin L1D asignado. ⛔ Orden con `d5fb-04`: **`d5fb-04` antes** (formulario
> de tratamientos y `PriorTreatmentManualCreate`); si no está en `main`, rebasar y renumerar `info.version`.
> Matriz TDD (CLAUDE.md): reglas, services y endpoints → TDD estricto, doble bucle; Route Handlers y UI → test del AC
> primero; migración y cableado → test después. MSW solo en HTTP saliente, handlers desde `contracts/examples/`; nunca
> `vi.mock` de módulos propios ni de Prisma; reloj e IDs inyectados; nunca `.skip`/`.only`/`it.todo`.
> Secuencia: contract → test → feat → refactor.

## 1. contratos

- [ ] 1.1 (`sync-contracts`) Editar primero `apps/clinical-api/openapi.yaml` según `design.md` §Contratos:
  `correctPriorTreatment`, `getPriorTreatmentHistory`, `correctClinicalAttribute`, `getClinicalAttributeHistory`,
  `ClinicalAttributeCorrection`, `id`/`supersedesId` en `PriorTreatment`, `ClinicalAttribute` y los ítems de `CaseView`;
  `x-permission`; `info.version` minor sobre la vigente al rebasar.
- [ ] 1.2 Ejemplos sintéticos en `contracts/examples/` registrados en `index.json` (request/respuesta de cada corrección
  e histórico) y los de error existentes enlazados.
- [ ] 1.3 `contracts:check`, `contracts:generate`, `contracts:generate:check`, `contracts:breaking` (0 incompatibles).
  Commit `contract(<L1D>)` solo con spec, ejemplos y generados.
- [ ] 1.4 (test después: esquema; commit propio tras el `contract`) Migración Prisma aditiva `supersedes_id` en
  `clinical.prior_treatment` y `clinical.clinical_attribute` (FK restrictiva, índice único parcial); actualizar
  `docs/architecture/data-model.md` y añadir la nota de alcance en `ADR-50`. Integración con PostgreSQL de test
  (escenarios de `specs/data-model`).

## 2. clinical-platform

- [ ] 2.1 (TDD estricto) Tests de aceptación en rojo (Supertest + PostgreSQL real + verificación del proveedor): fila nueva
  y anterior `reemplazado` intacta (tratamiento y atributo), histórico ordenado, ATC recalculado o `no_mapeado`, `409`,
  `422` con `field` (incoherencia de fechas, valor fuera de catálogo, sin cambios, clave en el cuerpo), `422
  PACIENTE_EGRESADO`, `403` admin, `401`/`404`. Esqueletos con `throw new Error('no implementado')`. Commit `test(...)`.
- [ ] 2.2 (TDD estricto) Tests de aceptación en rojo: checklist cambia tras corregir; el `AIAnalysisRecord` previo queda
  intacto con `staleness.patientData = true` y `changedData` correcto; el análisis nuevo usa solo la fila vigente;
  el log no contiene valores. Commit `test(...)`.
- [ ] 2.3 (TDD estricto) Implementar `corregirTratamiento` y `corregirAtributo` en `src/modules/corrections/`
  (controller, service por factory, repository, `ports.ts`) reutilizando `planDeCorreccion()`, `hayCambioReal()`, la
  guarda RN-17, `ReconciliationService` y la validación de catálogo; exponer `id`/`supersedesId` en `case-view`, ficha
  y lecturas; verificar que toda lectura filtra vigentes (`sqlDatoVigente()`). Unitarios uno a uno. Commit `feat(...)`.
- [ ] 2.4 Si `changedData` no distingue las secciones, ajuste mínimo del mapeo en `evidence-analysis` (único código de
  detección), con su test. Commit `feat(...)`.
- [ ] 2.5 (test del AC primero) Route Handlers en `apps/web/app/api/patients/[id]/` para las 4 operaciones sobre
  `lib/server/registro-manual.ts`; tests en rojo (Vitest + MSW): Origin ajeno `403`, retransmisión de `409/422`, `5xx`
  saneado, id no UUID `404`. Commits `test(...)` → `feat(...)`.
- [ ] 2.6 Refactor (Extract/Inline Method) en los archivos tocados, tests en verde antes y después.

## 3. frontend

- [ ] 3.1 (test del AC primero) Tests en rojo (Testing Library + MSW desde `contracts/examples/`): botón «Corregir dato»
  por fila con nombre accesible, diálogo precargado, «Guardar mi corrección», fila nueva con «Corrección manual» e
  histórico, error junto al campo con `aria-live`, egresado deshabilitado, estado vacío sin botones, aviso no
  bloqueante, fechas relativas (reloj congelado), lista de términos prohibidos (RN-23). Commit `test(...)`.
- [ ] 3.2 Implementar: `PriorTreatmentsTable`/`ClinicalAttributesTable` con `AccionCorregirDato` + `HistoricoDelDato`
  por fila (clave = `id`); `DialogoTratamientoPrevio`/`DialogoAtributoClinico` y sus formularios con `inicial`/`corrigeId`;
  hook `useEnvioDeCorreccion`; `router.refresh()`; textos en `messages/es.json`. Commit `feat(...)`.
  🔗 Resolver con `d5fb-04` los cambios en `formulario-de-tratamiento-previo.tsx`.
- [ ] 3.3 Loop visual (`visual-check`): estados, consola sin CSP/hidratación, red solo `/api/*` sin PII en URLs,
  accesibilidad y teclado, capturas a 375 y 1280 px; cada fallo se convierte primero en test en rojo.
- [ ] 3.4 E2E (Playwright contra Compose, seed sintético): corregir un tratamiento y un atributo, ver faltantes y aviso de
  análisis desactualizado.
- [ ] 3.5 Refactor en verde.

## humano

- [ ] H.1 Decidir con el usuario: ¿eliminar/rechazar un dato cargado por error? (fuera de alcance aquí).
- [ ] H.2 Crear la historia en Linear (equipo L1D, proyecto OncoLens-1) solo con aprobación explícita y sustituir
  «sin L1D asignado» en la trazabilidad.

## 4. cierre

- [ ] 4.1 `openspec validate d5fb-05-editar-tratamientos-y-atributos-en-vista-de-caso --strict`; suites de `clinical-api`
  y `web` y `contracts:verify-provider` en verde; `run-ai-eval` no aplica.
