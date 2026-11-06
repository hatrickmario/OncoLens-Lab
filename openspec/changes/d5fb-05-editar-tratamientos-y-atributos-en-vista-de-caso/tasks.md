# Tasks — d5fb-05-editar-tratamientos-y-atributos-en-vista-de-caso

> Origen: feedback de la Demo 5 (2026-11-05), sin L1D asignado. ✅ Apilado sobre `d5fb-04` (rama `feat/d5fb-04-sin-tratamiento-previo`):
> `info.version` 1.22.0 → este change **1.23.0**; si `d5fb-04` cambia al rebasar, renumerar y regenerar.
> Matriz TDD (CLAUDE.md): reglas, services y endpoints → TDD estricto, doble bucle; Route Handlers y UI → test del AC
> primero; migración y cableado → test después. MSW solo en HTTP saliente, handlers desde `contracts/examples/`; nunca
> `vi.mock` de módulos propios ni de Prisma; reloj e IDs inyectados; nunca `.skip`/`.only`/`it.todo`.
> Secuencia: contract → test → feat → refactor.

## 1. contratos

- [x] 1.1 (`sync-contracts`) Editar primero `apps/clinical-api/openapi.yaml` según `design.md` §Contratos:
  `correctPriorTreatment`, `getPriorTreatmentHistory`, `correctClinicalAttribute`, `getClinicalAttributeHistory`,
  `ClinicalAttributeCorrection`, `id`/`supersedesId` en `PriorTreatment`, `ClinicalAttribute` y los ítems de `CaseView`;
  `x-permission`; `info.version` 1.23.0.
  Evidencia: commit `79114739` `contract(d5fb-05)`; `info.version` 1.23.0; operaciones correctPriorTreatment, getPriorTreatmentHistory, correctClinicalAttribute, getClinicalAttributeHistory, ClinicalAttributeCorrection, `supersedesId`, `id` en CaseView y `regimenName` opcional en CorrectionHistoryEntry.
- [x] 1.2 Ejemplos sintéticos en `contracts/examples/` registrados en `index.json` (request/respuesta de cada corrección
  e histórico) y los de error existentes enlazados.
  Evidencia: siete ejemplos nuevos registrados en `index.json` y `id` en `case-view*.json`; `contracts:check` sin hallazgos (33 reglas).
- [x] 1.3 `contracts:check`, `contracts:generate`, `contracts:generate:check`, `contracts:breaking` (0 incompatibles).
  Commit `contract(<L1D>)` solo con spec, ejemplos y generados.
  Evidencia: `contracts:check`, `contracts:generate:check` y `contracts:breaking` (0 incompatibles) en verde.
- [x] 1.4 (test después: esquema; commit propio tras el `contract`) Migración Prisma aditiva `supersedes_id` en
  `clinical.prior_treatment` y `clinical.clinical_attribute` (FK restrictiva, índice único parcial); actualizar
  `docs/architecture/data-model.md` y añadir la nota de alcance en `ADR-50`. Integración con PostgreSQL de test
  (escenarios de `specs/data-model`).
  Evidencia: commit `d76ae1b1`; migración `20261105120000_correccion_tratamiento_atributo` aplica limpia sobre la base de test; `tests/integration/schema/correccion-tratamiento-atributo.test.ts` y `privilegios-rag-corpus.test.ts` (rag_corpus sin acceso) en verde: 20/20; `data-model.md` y nota de alcance en ADR-50.

## 2. clinical-platform

- [x] 2.1 (TDD estricto) Tests de aceptación en rojo (Supertest + PostgreSQL real + verificación del proveedor): fila nueva
  y anterior `reemplazado` intacta (tratamiento y atributo), histórico ordenado, ATC recalculado o `no_mapeado`, `409`,
  `422` con `field` (incoherencia de fechas, valor fuera de catálogo, sin cambios, clave en el cuerpo), `422
  PACIENTE_EGRESADO`, `403` admin, `401`/`404`. Esqueletos con `throw new Error('no implementado')`. Commit `test(...)`.
  Evidencia: commits `e1a9c35f` (rojo: 500 no declarado rechazado por el verificador del proveedor, 31 fallos y 1 acierto) y `313dafa0` (verde); `tests/integration/correcciones/{tratamiento,atributo,tratamiento-atributo-permisos}.test.ts`.
- [x] 2.2 (TDD estricto) Tests de aceptación en rojo: checklist cambia tras corregir; el `AIAnalysisRecord` previo queda
  intacto con una huella distinta de la del análisis nuevo; el análisis nuevo usa solo la fila vigente; el log no
  contiene valores. Commit `test(...)`.
  Evidencia: `tratamiento-atributo-efectos.test.ts` (3/3 en verde; escrito junto al resto en `e1a9c35f`/`313dafa0`).
- [x] 2.3 (TDD estricto) Implementar `corregirTratamiento` y `corregirAtributo` en `src/modules/corrections/`
  (controller, service por factory, repository, `ports.ts`) reutilizando `planDeCorreccion()`, `hayCambioReal()`, la
  guarda RN-17, `ReconciliationService` y la validación de catálogo; exponer `id`/`supersedesId` en `case-view`, ficha
  y lecturas; verificar que toda lectura filtra vigentes (`sqlDatoVigente()`). Unitarios uno a uno. Commit `feat(...)`.
  Evidencia: commits `313dafa0` y `b4f354d0` (defensa D4 con rojo previo `19e265dd`); 72/72 en `tests/integration/correcciones`; el listado (`calcularVarios`) no cambió: ninguna consulta nueva de completitud.
- [ ] 2.4 TRASLADADA a US-175 (L1D-148): `staleness.patientData = true` con `changedData` tras corregir un tratamiento o un
  atributo. En esta rama `staleness` es neutro (`aEvidenceAnalysis`) y no hay lectura del historial ni detector; no se
  inventa uno aquí. Cuando exista, ajustar el mapeo de `changedData` con su test.
- [x] 2.5 (test del AC primero) Route Handlers en `apps/web/app/api/patients/[id]/` para las 4 operaciones sobre
  `lib/server/registro-manual.ts`; tests en rojo (Vitest + MSW): Origin ajeno `403`, retransmisión de `409/422`, `5xx`
  saneado, id no UUID `404`. Commits `test(...)` → `feat(...)`.
  Evidencia: commits `f6d9e874` (rojo: 12 fallos por 500) y `1760ab09` (verde); `apps/web` 870/870.
- [x] 2.6 Refactor (Extract/Inline Method) en los archivos tocados, tests en verde antes y después.

  Evidencia: commit `d84f6bb7` `refactor(d5fb-05)`: `reemplazarFilaVigente` (Extract Method) en `corrections.repository.ts`; correcciones 72/72 antes y después.

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

- [ ] H.1 DEUDA (decisión del usuario, 2026-11-05): eliminar/rechazar (`rechazado`) un tratamiento o atributo cargado por error queda fuera de alcance; no se crea nada en Linear.
- [ ] H.2 Crear la historia en Linear (equipo L1D, proyecto OncoLens-1) solo con aprobación explícita y sustituir
  «sin L1D asignado» en la trazabilidad.

## 4. cierre

- [ ] 4.1 (fase 1, backend y BFF: hecho; falta la fase UI) `openspec validate d5fb-05-editar-tratamientos-y-atributos-en-vista-de-caso --strict`; suites de `clinical-api`
  y `web` y `contracts:verify-provider` en verde; `run-ai-eval` no aplica.
  Evidencia fase 1: `openspec validate --strict` válido; clinical-api unitaria 1255/1255 e integración 779/779 (146 archivos);
  `contracts:verify-provider` 869 respuestas verificadas; `apps/web` 870/870; `tsc`, `eslint --max-warnings 0`, `prettier`,
  `lint:lenguaje`, `pii-scan`, `contracts:check/breaking/generate:check` en verde.
