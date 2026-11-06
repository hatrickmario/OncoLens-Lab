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

- [x] 3.1 (test del AC primero) Tests en rojo (Testing Library + MSW desde `contracts/examples/`): botón «Corregir dato»
  por fila con nombre accesible, diálogo precargado, «Guardar mi corrección», fila nueva con «Corrección manual» e
  histórico, error junto al campo con `aria-live`, egresado deshabilitado, estado vacío sin botones, aviso no
  bloqueante, fechas relativas (reloj congelado), lista de términos prohibidos (RN-23). Commit `test(...)`.
  Evidencia: commit `ad5a3751` (rojo: 14 de 16 fallan en la aserción, `findByRole` del botón «Corregir dato»; los 2
  restantes caracterizan estado vacío y fecha relativa, que ya existían); `tests/ui/correccion-tratamiento-atributo.test.tsx`
  + `tests/support/correccion-caso-ui.tsx` (handlers MSW desde `contracts/examples/`). RN-23: `tests/lib/caso-lenguaje.test.ts`
  y `lint:lenguaje` (0 hallazgos en 580 mensajes) cubren los textos nuevos de `es.json`.
- [x] 3.2 Implementar: `PriorTreatmentsTable`/`ClinicalAttributesTable` con `AccionCorregirDato` + `HistoricoDelDato`
  por fila (clave = `id`); `DialogoTratamientoPrevio`/`DialogoAtributoClinico` y sus formularios con `inicial`/`corrigeId`;
  hook `useEnvioDeCorreccion`; `router.refresh()`; textos en `messages/es.json`. Commit `feat(...)`.
  🔗 Resolver con `d5fb-04` los cambios en `formulario-de-tratamiento-previo.tsx`.
  Evidencia: commits `ab56ae8d` (feat; verde 16/16 de los AC; los fixtures del test —proyección a `CaseView` y error con `field: value`—
  se corrigieron en ese commit sin tocar aserciones), `2a7664f9` (teclado y `endReason`); `apps/web`
  889/889 (119 archivos), `tsc --noEmit`, `eslint --max-warnings 0`, `prettier --check`, `lint:lenguaje` y `contracts:check` en verde.
  Desviaciones de diseño: (a) el formulario de corrección de tratamiento es un hermano del de alta
  (`FormularioDeCorreccionDeTratamiento`) y no el mismo con `inicial`/`corrigeId`: el alta usa `useEnvioDeRegistro` y la
  corrección `useEnvioDeCorreccion` (los hooks no son condicionales); ambos comparten `CamposDelTratamientoPrevio`, y el
  diálogo sí es el mismo (`corrige`). (b) El diálogo de tratamiento sigue recibiendo `estado` obligatorio también al
  corregir; no ofrece la casilla de ausencia. (c) La declaración «Sin tratamiento previo» se corrige desde la sección de
  tratamientos con `DialogoAtributoClinico corrige` (solo cambia la fecha, valor fijo `si`; el 422 `attributeKey` se traduce
  con `esIncoherenciaDeDeclaracion`). (d) La fila nueva recoge el foco (`useFocoAlMontar`) porque la corrección la remonta
  con otro `id`. (e) **DESVIACIÓN: el aviso de «análisis desactualizado» no existe en esta rama** (detector de US-175, ver
  2.4); la UI solo reutiliza `AvisoAnalisisAnteriores` como ya funciona (aviso no bloqueante de RN-26 tras guardar) y no
  simula ni promete el marcado de vigencia. (f) Hallazgo del loop visual: a 375 px la columna única del grid de la vista de
  caso medía el ancho de sus tablas (653 px) y la página desbordaba (543 px ya sin la columna nueva: pre-existente, agravado
  por la columna «Acciones»); `grid-cols-[minmax(0,1fr)]` en `SeccionesDelCaso`, con test en rojo `74aeeae9` y
  corrección `edb5f927` (jsdom no calcula layout: el test comprueba la clase, no el ancho; lo mide el loop visual).
- [ ] 3.3 Loop visual (`visual-check`): estados, consola sin CSP/hidratación, red solo `/api/*` sin PII en URLs,
  accesibilidad y teclado, capturas a 375 y 1280 px; cada fallo se convierte primero en test en rojo.
  Evidencia parcial (PASS en lo verificable; el resto PENDIENTE): imagen web temporal de la rama en `127.0.0.1:3100`
  contra el Compose de la demo (seed sintético, paciente (h) y (d)); el `clinical-api` de la demo es anterior (la vista de
  caso no trae `id`), así que el script añade ids sintéticos y el histórico en el navegador (`page.route`) y aborta
  cualquier `POST …/corrections`: no se envió ninguna corrección válida. Verificado: botón por fila con nombre propio,
  histórico de ambos datos, precarga del tratamiento y del atributo, sin casilla de ausencia al corregir, clave fija,
  validación local junto al campo (`aria-live`, `aria-invalid`) sin envío, Escape/Cancelar devuelven el foco, Tab+Enter,
  estado vacío, 375 y 1280 px sin scroll horizontal, consola 0 errores/advertencias, red solo mismo origen sin identidad en
  URLs, `Origin` en el login, LCP 328 ms y CLS 0. PENDIENTE: guardado real, errores `409/422` del servidor, fila nueva con
  «Corrección manual», aviso tras guardar, egresado y declaración de ausencia (el seed no tiene ninguna) contra un
  `clinical-api` con los endpoints; los cubren los tests de 3.1 y el E2E de 3.4 en la CI. Capturas en
  `reports/visual/d5fb-05/` (ignorado por git).
- [ ] 3.4 E2E (Playwright contra Compose, seed sintético): corregir un tratamiento y un atributo, ver faltantes y aviso de
  análisis desactualizado.
  Escrito y SIN ejecutar en local (Compose completo; memoria de la VM justa): `e2e/vista-de-caso-correccion.spec.ts`, dos tests
  serializados sobre el paciente (h), que va después de `demo-s5-pacientes.spec.ts`; el orden de mutaciones está en
  `e2e/soporte.ts`. Lo ejerce el job `e2e` de la CI. No verifica «faltantes» ni «análisis desactualizado»: el checklist lo
  cubren los tests de integración de la fase 1 y el marcado de vigencia está trasladado a US-175 (2.4).
- [x] 3.5 Refactor en verde.
  Evidencia: commit `6ad34452` `refactor(d5fb-05)`: Extract Method · `organisms/dialogo-atributo-clinico.tsx:ContenidoDelDialogoDeAtributo`
  (mezclaba disparador, títulos y tres contenidos; 142 → 75 líneas); 888/888 antes y después.
  Ajustes del Gate 2 (PASS en los 4 guardianes), en tests `6f74dfb7`, refactor `ed0ea2d1`, feat `5bdcccd2` y E2E `509fb05a`:
  design #3 Replace Conditional with Catalog Lookup · `historico-del-dato.tsx:textoDeLaVersion` (`Record<DatoCorregible, …>`),
  con `tests/ui/historico-del-dato.test.tsx` por cada `DatoCorregible` (verde antes y después); P3 #6 `valorFijo` en el
  formulario de atributo, #7 `useFocoAlMontar` sin `eslint-disable`, #8 `esIncoherenciaDeDeclaracion({campo, codigo})`;
  design #2 `retries: 0` junto a `serial` en `vista-de-caso-correccion.spec.ts` y `declaracion-sin-tratamiento.spec.ts`, con
  la precondición `exigirPacienteSinCorregir` (#11) y el desborde a 375 px (`scrollWidth ≤ 375`, sin ejecutar en local); el test
  de layout de clase CSS se rotula como guardia. Textos visibles cambiados (lenguaje): aviso tras guardar («Si ya hay análisis
  guardados, se hicieron con el valor previo…»), error 422 de la declaración y título del diálogo de la declaración.
  `apps/web` 893/893 (120 archivos), `tsc --noEmit -p apps/web`, `eslint --max-warnings 0`, `prettier --check`,
  `lint:lenguaje` y `contracts:check` en verde.
  DEUDA anotada (Gate 2): #5 extraer `contenido-del-dialogo-de-tratamiento.tsx` de `dialogo-tratamiento-previo.tsx` (126
  líneas, bajo el límite; no se hizo para no ampliar el cambio); #9 y #10 de `design-principles-reviewer` sin abordar en
  este change (quedan como deuda del Gate 2).

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
