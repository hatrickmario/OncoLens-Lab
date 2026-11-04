# Tasks — l1d-91-formularios-registro-manual

> ⛔ `l1d-90-registro-manual-biomarcador-diagnostico` (endpoints, módulo `manual-entry`, `escalas.json`) antes de §2.2;
> ⛔ `l1d-80-tratamientos-atributos-manuales` (`field` en el contrato, 1.18.0) y `l1d-309` (1.19.0) antes de §1;
> ⛔ `l1d-76-vista-caso-pagina` (página y `recargar()`) antes de montar los botones en la vista de caso (§3.3).
> 🔗 `Dialog` de shadcn/ui: lo añade `l1d-80` (O2); si no está en `main`, lo añade este change. 🔗
> `lib/server/registro-manual.ts` compartido con `l1d-80`. Matriz TDD (CLAUDE.md): endpoint y reglas → TDD estricto,
> doble bucle; Route Handlers y UI → test del AC primero; cableado → test después. MSW solo en el HTTP saliente, con
> handlers desde `contracts/examples/`; nunca `vi.mock` de módulos propios ni de Prisma; reloj e IDs inyectados; nunca
> `.skip`/`.only`/`it.todo`. Secuencia: contract → test → feat → refactor.

## 1. contratos

- [x] 1.1 (`sync-contracts`) Editar primero `apps/clinical-api/openapi.yaml` según `design.md` §Contratos:
  `getManualEntryOptions` y schema `ManualEntryOptions` (`field` ya lo declara `l1d-80`, `[S5 resp. 10]`: no se
  redefine); `info.version` 1.19.0 → **1.20.0** (quien rebase renumera y regenera `packages/api-contracts`). Ejemplos
  nuevos en `contracts/examples/` registrados en `index.json` (`manual-entry-options-mama`,
  `manual-entry-options-prostata`, `manual-entry-options-sin-diagnostico`, `error-valor-fuera-de-catalogo-campo`,
  `error-gradacion-incoherente-campo`) y los de error existentes contra los `4xx/5xx` de la operación nueva.
  `contracts:check`, `contracts:generate`, `contracts:generate:check` y `contracts:breaking` (0 incompatibles). Commit
  `contract(L1D-91)`.

## 2. clinical-platform

- [x] 2.1 (TDD estricto) Tests de aceptación en rojo, Supertest + PostgreSQL de test + catálogo `test-normalizacion-1.0.0`, con
  verificación del proveedor: "devuelve términos, TNM_8, ECOG 0–5, nottingham y el destino de ki67 y grado para F-M2
  [US-111 AC-1] · integración", "devuelve gleason_isup para próstata y todos los tipos habilitados sin diagnóstico
  vigente [US-111 AC-3] · integración", "responde 401, 403 al admin y 404 sin datos del paciente [US-111 AC-1] ·
  integración", "criticalItems coincide con el destination del checklist para F-M2 y próstata [US-111 AC-2] ·
  integración" (paridad, mismo lector de `datos-criticos.json`, design D10). Esqueleto de `opciones()` en el service
  con `throw new Error('no implementado')`. Commit `test(L1D-91)`.
- [x] 2.2 (TDD estricto) Tests de aceptación en rojo: "responde field = performanceValue con ECOG 7 sin repetir el
  valor [US-111 AC-4]", "responde field = grading con Gleason incoherente [US-111 AC-4]", "responde
  PACIENTE_EGRESADO sin field [US-111 AC-4]", "responde field = name con un nombre vacío [US-111 AC-4]" · integración.
  Commit `test(L1D-91)`.
- [x] 2.3 (TDD estricto) Implementar la ruta `GET …/manual-entry-options` en `manual-entry` (`authorize('clinical:read')`),
  `opciones()` del service con los puertos de catálogo inyectados y el mapeo de errores con `field`, con unitarios
  uno a uno. Verificación: 2.1 y 2.2 en verde y los tests de `l1d-90` sin cambios. Commit `feat(L1D-91)`.
- [x] 2.4 Extraer `opcionesDeRegistroManual()` (RN-29) y `campoDelError()` en `manual-entry.reglas.ts`; reutilizar el
  lector de `datos-criticos.json` del checklist (`grep -rn "match.name" apps/clinical-api/src`), sin un segundo parser.
- [x] 2.5 (test del AC primero) Route Handlers BFF `apps/web/app/api/patients/[id]/biomarkers/route.ts` (POST),
  `.../diagnoses/route.ts` (POST) y `.../manual-entry-options/route.ts` (GET) con manejadores en
  `lib/server/registro-manual.ts` (crearlo o ampliarlo si `l1d-80` ya lo creó): `server-only`, cookie reenviada,
  `Origin` en los `POST`, cuerpo sin reserializar con tope, UUID validado, `Cache-Control: no-store`. Tests en rojo
  Vitest + MSW: "retransmite 201 [US-111 AC-1]", "retransmite 422 con field [US-111 AC-4]", "rechaza Origin ajeno
  con 403 sin llamar [US-111 AC-4]", "sanea 5xx y timeout [US-111 AC-4]", "404 propio sin UUID [US-111 AC-1]",
  "el log no contiene cuerpo ni id del paciente". Commits `test(L1D-91)` → `feat(L1D-91)`.
- [x] 2.6 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde
  antes y después, commit `refactor(L1D-91)`.

## 3. frontend

- [x] 3.1 (test del AC primero) Tests en rojo (Vitest + Testing Library + MSW desde `contracts/examples/`):
  "registra Ki-67 elegido del autocompletado y avisa al guardar [US-111 AC-1]", "avisa no_mapeado tras el 201
  [US-111 AC-1]", "abre con Ki-67 seleccionado con ?item=ki67 y con el foco en la gradación con ?item=grado
  [US-111 AC-2]", "muestra los valores vigentes, el aviso de corrección y el grado de solo lectura, y envía solo la
  gradación [US-111 AC-3]", "deshabilita Guardar sin cambios y exige los mínimos sin vigente [US-111 AC-3]", "pinta el
  422 junto al campo de field, egresado arriba y 5xx sin perder lo escrito [US-111 AC-4]", "atrapa el foco, Esc
  devuelve el foco y anuncia errores en aria-live [US-111 AC-5]", "admin no ve las acciones [US-111 AC-5]". Commit
  `test(L1D-91)`.
  Evidencia: rojo 77d36f0c (18 de 19 fallan en la aserción), verde c45f7c50 (19/19; web 752/752).
- [x] 3.2 (test del AC primero) E2E Playwright en rojo contra Compose con seed sintético (F-M2): "registra Ki-67 desde
  la vista de caso y aparece en la ficha y en la vista con origen Registro manual sin recargar [US-111 AC-1]" y
  "?item=ki67 abre el formulario con Ki-67 seleccionado [US-111 AC-2]", con aserción de que solo hay peticiones a
  `/api/*` del mismo origen. Commit `test(L1D-91)`.
  Evidencia: rojo c49f8c15 (2 fallan: no existe el botón), verde en c45f7c50 y tras el refactor bb2ac557 (2/2 contra Compose con LLM fingido).
- [x] 3.3 (test del AC primero) Implementar `DialogoRegistroBiomarcador`, `DialogoCompletarDiagnostico`,
  `CamposDeGradacion`, `CampoConError`, `AnuncioDeErrores` y la isla `AccionesDeRegistroManual` (S5-03 a y b,
  `docs/ux/S5/pantallas-s5.md`); hooks `useEnvioRegistroManual` y `useOpcionesDeRegistroManual`; funciones puras
  `cambiosDelDiagnostico()`, `erroresDelServidor()`, `resolverItem()` y `hrefDeRegistroManual()` en
  `lib/registro-manual/` con sus unitarios uno a uno; botones en `VistaDeCaso` (sección de biomarcadores, con
  `recargar()`) y en `FichaDelDoctor` (diagnóstico y biomarcadores, con `router.refresh()`); textos en
  `messages/es.json` (`registroManual.*`). Añadir `Dialog` de shadcn/ui solo si no está en `main` (`npm audit` en el
  PR). Verificación: 3.1 y 3.2 en verde, `lint:lenguaje` limpio. Commit `feat(L1D-91)`.
  Evidencia: c45f7c50, 3.1 y 3.2 en verde, `lint:lenguaje` 0 hallazgos, `quality` 0 errores. Desviaciones: sin `CampoConError` propio (se reusan `CampoDeTexto` y `CampoDeSeleccion`); el envío reutiliza `useEnvioDeRegistro`; `?item=` llega como prop desde el RSC (no `useSearchParams`); sin validación de rango en el cliente (la decide el 422 con `field`: una regla, un dueño); en la vista de caso solo va el botón de biomarcador (el de diagnóstico vive en la ficha).
- [x] 3.4 Comprobar una regla, un dueño: `grep -rn "Nottingham grado\|ISUP\|no_mapeado" apps/web/lib apps/web/components`
  sin derivación de `grade` ni decisión de mapeo en `web`; `hrefDeRegistroManual()` único constructor del enlace.
  Evidencia: el grep solo halla comentarios y la lectura de `mappingStatus` del servidor; ninguna derivación de `grade` ni decisión de mapeo en `web`.
- [x] 3.5 Loop visual (visual-check): estados, consola sin errores ni violaciones de CSP, red solo /api/* sin PII en
  URLs, accesibilidad y teclado, rendimiento y capturas a 375 y 1280 px; cada fallo se convierte primero en un test en
  rojo.
  Evidencia: visual-check PASS local con Compose y seed sintético; capturas a 375 y 1280 px en reports/visual/L1D-91.
- [x] 3.6 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde
  antes y después, commit `refactor(L1D-91)`.
  Evidencia: bb2ac557 (Extract CamposDeBiomarcador, CamposDeGleason y Opciones, SeriesConRegistroManual), tests en verde antes y después.

## 4. Verificación

- [x] 4.1 `openspec validate l1d-91-formularios-registro-manual --strict` en verde.
  Evidencia: `openspec validate --strict` válido.
- [ ] 4.2 Suites de `apps/clinical-api` y `apps/web` (unitarios, integración y E2E de AC-1/AC-2) en verde;
  `contracts:verify-provider` sobre `getManualEntryOptions`, `createManualBiomarker` y `createManualDiagnosis`
  (incluidos 401/403/404/422/500), `tsc --noEmit`, `eslint`, `lint:lenguaje` y `pii-scan` limpios. Sin `run-ai-eval`:
  no cambia modelo, prompt, umbral, catálogo ni corpus.
