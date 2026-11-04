# Tasks — l1d-80-tratamientos-atributos-manuales

> ⛔ `l1d-84-normalizacion-final-manual` (ReconciliationService + FX-01b-b), `l1d-74-vista-caso-timeline` (`/case`,
> `openapi.yaml` 1.18.0, de L1D-309) y `l1d-90-…` (catálogo 1.3.0) antes de §1–§2; ⛔ `l1d-76-…` (US-090, página de la vista de caso) antes de §4. 🔗 `l1d-90-…` (US-110) comparte
> `compartido/registro-manual.ts` y el `Dialog`. Matriz TDD (CLAUDE.md): endpoints y services con lógica → TDD
> estricto, doble bucle; UI → test del AC primero; catálogo → `evaluate`; cableado y fixtures → test después.
> Integración con PostgreSQL real; MSW solo en el HTTP saliente; nunca `vi.mock` de módulos propios ni de Prisma;
> reloj e IDs inyectados; nunca `.skip`/`.only`/`it.todo`. Secuencia: contract → test → feat → refactor.

## 1. contratos

- [x] 1.1 (`sync-contracts`) Editar primero `apps/clinical-api/openapi.yaml` según `design.md` §Contratos:
  `createManualPriorTreatment`, `listClinicalAttributes`, `createManualClinicalAttribute`, schemas
  `PriorTreatmentManualCreate`, `PriorTreatment`, `ClinicalAttributeManualCreate`, `ClinicalAttribute`,
  `ClinicalAttributeList`, `ErrorRegistroClinicoInvalido`; propiedad opcional `field` (`type: string`, sin enum, misma
  descripción) en `ErrorRegistroClinicoInvalido`, `ErrorRegistroManualInvalido` y `ErrorDiagnosticoInvalido`
  (`[S5 resp. 10]`); `atcCodes` con el patrón ATC de `rag-orchestrator`; `info.version` 1.18.0 → **1.19.0** (quien
  rebase renumera y regenera `packages/api-contracts`). Ejemplos nuevos en `contracts/examples/` registrados en
  `index.json` (`prior-treatment-manual`, `prior-treatment-manual-creado`, `prior-treatment-no-mapeado`,
  `clinical-attribute-manual`, `clinical-attribute-creado`, `clinical-attributes-list`,
  `error-atributo-sin-tipo-cancer`, `error-registro-clinico-campo`; `prior-treatment-manual-creado` con
  `atcCodes = [L02AE02]`) y los de error existentes contra los `4xx/5xx` de las tres operaciones.
  `contracts:check`, `contracts:generate`, `contracts:generate:check` y `contracts:breaking` (0 incompatibles). Commit
  `contract(L1D-80)`.
  Hecho en `contract(L1D-80)`: `info.version` 1.18.0 → **1.19.0** (L1D-309 ya había tomado 1.18.0). `contracts:check`, `contracts:generate` (con `datamodel-code-generator`), `contracts:breaking` (0 incompatibles) y `contracts:generate:check` (tras el commit) en verde. El fixture es `test-normalizacion-1.0.0` (FX-01b-b).

## 2. clinical-platform

- [x] 2.1 (test después: catálogo) `atributos.schema.json` acepta `values` (aditivo); regla del validador que exige
  `values` no vacío y sin repetidos en el catálogo real; `atributos.json` 1.2.0 con los valores de `design.md` D7 y
  `manifest.json` 1.4.0 (con 2.1b); test "los valores del seed sintético y de FX-02b-a están en el catálogo
  [US-094 AC-3]" y "un atributo sin valores invalida el catálogo [US-094 AC-3]". Verificación: `catalog:validate` en
  verde y en rojo con la copia inválida.
  Hecho: la regla de «valores no vacíos» vive en el esquema (`minItems: 1`) y la de «sin repetidos» en `validator/atributos.mjs`; que el catálogo real declare `values` en cada clave lo comprueba `scripts/catalog/__tests__/atributos.test.mjs`. Desviación: el seed (b) tenía `sensible` y pasó a `sensible_castracion` para cumplir la lista decidida (`[S5 resp. 13]`).
- [x] 2.1b (test después: catálogo, `[S5 resp. 9]`) Subconjunto ATC en `mama|prostata/codigos.json` y `sinonimos.json`
  según design D9 y DEC-04 (`L02AE02`, `L02BB03`, trastuzumab, pertuzumab, T-DM1 y los demás fármacos del seed y de la
  demo): nombre inglés literal comprobado en atcddd.fhi.no, DCI en `etiquetaEs`, año del índice en `versionFuente`,
  sin DDD; `NOTICE-atc.txt` con el aviso literal; `manifest.json` → **1.4.0**. Tests: "los fármacos del seed tienen
  su código ATC real [US-094 AC-1]" y "el aviso de WHOCC y el manifest 1.4.0 acompañan al subconjunto". Verificación:
  `catalog:validate` en verde; misma versión montada en ambos backends.
  Hecho: leuprorelina `L02AE02`, bicalutamida `L02BB03`, trastuzumab `L01FD01`, pertuzumab `L01FD02`, trastuzumab emtansina `L01FD03`, docetaxel `L01CD02` y letrozol `L02BG04`, verificados en atcddd.fhi.no el 2026-11-03 (índice 2026). Desviación: el único régimen del seed sintético, «Deprivación androgénica», es una clase terapéutica sin código ATC y queda `no_mapeado` (RN-27); no se inventó un código. Los tests de versión de `apps/rag-orchestrator` (`test_catalogo_clinico.py`, `test_catalogo_real_poblacion_reglas.py`) subieron a 1.4.0 como en las subidas anteriores del manifest.
- [x] 2.2 (TDD estricto) Tests de aceptación en rojo (Supertest + PostgreSQL de test + FX-02b-a + FX-01b-b,
  respuestas validadas contra el spec): "registra Leuprorelina manual con L02AE02 y mapeado y aparece en /case
  [US-094 AC-1]", "guarda Fármaco experimental X como no_mapeado sin código [US-094 AC-2]". Esqueletos de
  `prior-treatments.{controller,service,repository}.ts` con `throw new Error('no implementado')`. Commit
  `test(L1D-80)`.
- [x] 2.3 (TDD estricto) Tests de aceptación en rojo: "registra estado_menopausico posmenopausica en mama y rechaza
  color_ojos con 422 [US-094 AC-3]", clave de otro tipo de cáncer y valor fuera de lista → 422, sin diagnóstico
  vigente → `TIPO_CANCER_NO_REGISTRADO`, sin `observedAt` → `incierta`; "no devuelve atributos reemplazados ni
  rechazados [US-094 AC-4]", `allowedAttributes` del tipo de cáncer y `field` = `attributeKey`/`value` en los
  `422 VALOR_FUERA_DE_CATALOGO` (sin repetir el valor) y ausente en `PACIENTE_EGRESADO`. Esqueletos de `clinical-attributes.*`. Commit
  `test(L1D-80)`.
- [x] 2.4 (TDD estricto) Tests de aceptación en rojo: "responde 422, 404 o 401 sin crear filas
  [US-094 AC-5]", `admin` → `403` en las tres operaciones, egresado → `422 PACIENTE_EGRESADO` y lectura `200`
  (RN-17), coherencia `ongoing`/`endedAt`/`endReason` → `422`, tratamiento sin diagnóstico vigente → `no_mapeado`,
  BD caída → `500` sin detalle. Commit `test(L1D-80)`.
- [x] 2.5 (TDD estricto) Implementar `compartido/registro-manual.ts` (`exigirPacienteActivo()`, `episodioVigente()`;
  reutilizar si `l1d-90` ya lo creó) y el módulo `prior-treatments` con `ReconciliationService` inyectado; unitarios
  uno a uno de la coherencia de fechas y fin. Verificación: 2.2 y la parte de 2.4 de tratamientos en verde. Commit
  `feat(L1D-80)`.
  Desviación del design D1: no se creó `compartido/registro-manual.ts`; se reutilizan `exigirPacienteQueAdmiteRegistros()` y `bloquearPaciente()` (L1D-90/309) y se añade `compartido/contexto-de-registro.ts` (`episodioDelRegistro()`, `tipoDeCancerVigente()`), `compartido/cuerpo-de-registro.ts` y `compartido/registro-http.ts`.
- [x] 2.6 (TDD estricto) Implementar el módulo `clinical-attributes`, el puerto `CatalogoDeAtributos` y su adaptador
  `src/infrastructure/catalogo/catalogo-de-atributos.ts`. Extraer `atributoPermitido()` (RN-29); lectura con
  `sqlDatoVigente()` existente. Verificación: 2.3 y 2.4 en verde. Commit `feat(L1D-80)`.
- [x] 2.7 (test después) Cablear ambos módulos en `composition.ts`/`server.ts`. Verificación: las rutas responden en
  el arranque con `CLINICAL_CATALOG_PATH` de test.
- [x] 2.8 (test después) No-fuga: logs de las tres operaciones sin identidad, `regimenName`, `value`, claves fuera
  del catálogo ni error de `pg` (`tests/support/captura-de-salidas.ts`).
- [x] 2.9 (test del AC primero) Route Handlers BFF `apps/web/app/api/patients/[id]/prior-treatments/route.ts` (POST)
  y `.../clinical-attributes/route.ts` (GET, POST) con manejadores en `lib/server/registro-manual.ts`: `server-only`,
  cookie reenviada, `Origin` verificado, Zod generado, errores del proveedor propagados sin detalle. Tests Vitest +
  MSW (handlers desde `contracts/examples/`): `201`, `422`, `403` y `Origin` ajeno → `403`. Commits `test(L1D-80)` →
  `feat(L1D-80)`.
  Hecho en `lib/server/registro-manual.ts` (ya existía por US-253): tres operaciones más y los Route Handlers `prior-treatments/route.ts` y `clinical-attributes/route.ts`.
- [x] 2.10 Buscar `no_mapeado` y `attribute_key` en `apps/clinical-api/src`: ningún mapeo fuera de
  `ReconciliationService` y ninguna lista de atributos fuera del catálogo.
- [x] 2.11 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en
  verde antes y después, commit `refactor(L1D-80)`.
  Hecho: `Inline · apps/clinical-api/src/modules/manual-entry/manual-entry.repository.ts:episodioDelRegistro · duplicaba la consulta de compartido/contexto-de-registro`. Sin más cambios (los controllers de `manual-entry` y `corrections` conservan su propia fábrica HTTP: D5-29).

## 3. evaluación

- [x] 3.1 (evaluate, obligatorio `[S5 resp. 9]`) `run-ai-eval` por el cambio de catálogo (`atributos.json` 1.2.0,
  subconjunto ATC, `manifest.json` 1.4.0); mapeo terminológico ≥ 0,95:
  comparación con el baseline sin regresiones y sin `409` de versión entre backends; reporte en `reports/eval/`.
  Corrida local con adapters falsos (`npm run evaluate -- --suite all --report json`, FX-T5a-a): código de salida 0; la suite no lee `packages/clinical-catalogs` (su `catalogVersion` es el del fixture), así que no hay regresión por el catálogo 1.4.0 ni `409` de versión. El mapeo terminológico del cambio lo miden los tests de catálogo (ATC resueltos con `ReconciliationService`). El reporte en `reports/eval/` va en H-1.

## 4. frontend

- [x] 4.1 (test del AC primero) Tests en rojo (Vitest + Testing Library + MSW): `DialogoTratamientoPrevio` envía el
  cuerpo del contrato y muestra el aviso RN-27 con `no_mapeado`; `DialogoAtributoClinico` lista solo
  `allowedAttributes`, anuncia el `422` junto al campo con `aria-live` y `Esc` devuelve el foco al disparador
  [US-094 AC-6]. Commit `test(L1D-80)`.
  Hecho: `apps/web/tests/ui/registro-manual-caso.test.tsx` (6 tests; 3 con `[US-094 AC-6]`), rojo en la aserción en `0e3e8833` (no se encuentra el botón «+ Agregar tratamiento previo»), verde en `96e513fa`.
- [x] 4.2 (test del AC primero) E2E Playwright en rojo contra Compose con P-CASO: "el tratamiento y el atributo
  registrados aparecen en su sección sin recargar [US-094 AC-6]", con aserción de que solo hay peticiones a `/api/*`
  del mismo origen. Commit `test(L1D-80)`.
  Hecho: `apps/web/e2e/registro-manual-caso.spec.ts` contra Compose (`scripts/e2e/ejecutar.sh`), 1 passed. Desviación: el spec se escribió después del `feat` (su primera corrida falló porque el catálogo real deja «Leuprorelina» sin ATC en mama; el spec usa «Fármaco experimental X» y comprueba el aviso RN-27), sin rojo previo contra el build sin la UI.
- [x] 4.3 (test del AC primero) Implementar los dos diálogos (S5-03 c y d, `docs/ux/S5/pantallas-s5.md`) y los
  botones «+ Agregar tratamiento previo» y «+ Registrar atributo» en la página de `l1d-76`; `router.refresh()` tras
  el `201`. Añadir `Dialog` de shadcn/ui si no está en `main` (`npm audit` en el PR). Verificación: 4.1 y 4.2 en
  verde, `lint:lenguaje` limpio. Commit `feat(L1D-80)`.
  Desviación: la recarga tras el `201` es `recargar()` de `useVistaDeCaso` (la vista de caso es un componente cliente), no `router.refresh()`. `Dialog` ya estaba en `main`.
- [x] 4.4 Loop visual (visual-check): estados, consola sin errores ni violaciones de CSP, red solo /api/* sin PII en
  URLs, accesibilidad y teclado, rendimiento y capturas a 375 y 1280 px; cada fallo se convierte primero en un test
  en rojo.
  Hecho (visual-check, 375 y 1280 px, Compose `oncolens-e2e` con seed sintético): consola 0 errores, red solo `/api/*`, foco y `Esc` correctos; capturas en `reports/visual/L1D-80/` (carpeta ignorada).
- [x] 4.5 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en
  verde antes y después, commit `refactor(L1D-80)`.

## 5. Verificación

  Hecho: `Extract · formulario-de-tratamiento-previo.tsx · CamposDeTratamiento, CamposDeFinDeTratamiento y PieDeFormularioDeRegistro (este último también en formulario-de-atributo-clinico.tsx) · el formulario superaba los 100 de max-lines`.
- [x] 5.1 `openspec validate l1d-80-tratamientos-atributos-manuales --strict` en verde.
- [x] 5.2 Suites de `apps/clinical-api`, `apps/web` y `packages/clinical-catalogs` en verde; `contracts:verify-provider`
  (tres operaciones, incluidos los códigos de error), `tsc --noEmit`, `eslint`, `lint:lenguaje` y `pii-scan` limpios;
  `run-ai-eval` (3.1) adjunto al PR (reporte en H-1). Hecho en clinical-api, catálogo y BFF; los gates de `apps/web` de la sección 4 los cierra `frontend-dev`.

## Diferidas

- [ ] D5-29 Adoptar `compartido/registro-http.ts` (fábrica HTTP de los registros) en los controllers de `manual-entry` y `corrections` y rellenar `field` en los 422 de `manual-entry` (el contrato ya lo declara). DIFERIDA -> D5-29 (fuera de los archivos de este change; reportado al coordinador).
- [ ] D5-30 La fila «Deprivación androgénica» del seed (b) es una clase sin ATC: decidir con el oncólogo si se siembra un fármaco concreto (p. ej. leuprorelina) para que la demo la muestre `mapeado`. DIFERIDA -> D5-30.
- [ ] D5-31 Al mergear L1D-195, añadir a `sembrarFilasManuales()` (`apps/clinical-api/tests/integration/evidence-analysis/analisis-sin-escrituras.test.ts`) un paso que registre un tratamiento previo y un atributo por los endpoints de este change. DIFERIDA -> L1D-195.

- [ ] D5-33 `CaseView.priorTreatments` no trae `mappingStatus` ni `id`: la tabla del caso muestra «Sin código ATC en el catálogo» cuando `atcCodes` está vacío. Añadir `mappingStatus` (aditivo) al contrato del proveedor para mostrar «No mapeado» con certeza (RN-27). DIFERIDA -> D5-33 (clinical-platform-dev; fuera del alcance de `frontend-dev`).
- [ ] D5-34 `useEnvioDeRegistro` (L1D-80) y `useEnvioDeCorreccion` (L1D-309) son casi iguales, y `CampoDeSeleccion`/`PieDeFormularioDeRegistro`/`AccionDeRegistro` son nuevos: unificar cuando L1D-91 sea el tercer consumidor. DIFERIDA -> L1D-91.

- [ ] D5-35 Menores del Gate 2 de L1D-80: design 4-7 y 11-14; contract 1 y 3 (versiones de `sinonimos.json`); language 1-2 (redacción de `caso.registro.tratamiento.descripcion` y `enCurso`). DIFERIDA -> D5-35.

## humano

- [ ] H-1 Guardar el reporte de la corrida de `run-ai-eval` del cambio de catálogo (salida 0, adapters falsos, FX-T5a-a) en `reports/eval/`. DIFERIDA -> H-1. Bloque literal: ejecutar `EVAL_PYTHON=<venv con las dependencias de rag-orchestrator> npm run evaluate -- --suite all --report json --salida reports/eval/l1d-80` en la rama y versionar la salida.
- [ ] H-2 Si `.env.example` fija `CLINICAL_CATALOG_VERSION` (o la versión esperada del catálogo), subirla de `1.3.0` a `1.4.0`, la misma en ambos backends. DIFERIDA -> H-2. Bloque literal: `CLINICAL_CATALOG_VERSION=1.4.0`.
