# Proposal — l1d-91-formularios-registro-manual

## Trazabilidad

L1D-91 · US-111 · FEAT-03b (L1D-13) · Sprint 5 · Estimación **3** · HU-18 · FR-23 (UI de registro), FR-08 · NFR-12
(accesibilidad) · RN-08, RN-27, RN-17 (regresiones) · RN-23 (textos nuevos) · DEC-05 · AC-04.1, AC-T1.1, AC-T3.2 ·
Q-03 · `[§15 resp. 4]` `[Pre-S1 resp. 18]` · US-111 AC-1…AC-5 ·
`backlog/features/FEAT-03b-revision-conflictos-registro-manual.md` · `backlog/sprints/S5-refinamiento.md` D-1, D-7
(`[S5 resp. 1]`, `[S5 resp. 4]`; O3, «Nunca» se recorta: G-Demo) · `docs/ux/S5/pantallas-s5.md` S5-03 a y b

## Por qué

Sin OCR en el MVP (PRD E-17), el registro a mano es la única forma de cerrar un faltante. `l1d-90` (US-110) entrega
`POST …/biomarkers` y `POST …/diagnoses`; falta la UI que el oncólogo usa en segundos desde la vista de caso, la ficha
o un faltante del checklist (US-004, `l1d-96`). G-Demo (US-142) recorre «caso editado a mano → faltantes → análisis».

## Qué cambia

- **`apps/web` · UI (frontend):** dos diálogos modales accesibles (S5-03): **a · «Registrar biomarcador»**
  (`DialogoRegistroBiomarcador`) y **b · «Completar diagnóstico a mano»** (`DialogoCompletarDiagnostico`), con foco
  atrapado, `Esc` y retorno del foco, etiqueta visible en cada campo, errores junto al campo anunciados en `aria-live`,
  «Guardar» / «Cancelar».
  - a: biomarcador con autocompletado de términos del catálogo (texto libre permitido; si la respuesta llega
    `no_mapeado`, aviso RN-27), valor, unidad, tipo de resultado y fecha del examen.
  - b: valores vigentes precargados; histología, sistema y valor de estadio, gradación estructurada (`nottingham` en
    mama; `gleason_isup` con patrón primario y secundario, espécimen y alcance en próstata), escala y valor
    funcional, fecha. Con diagnóstico vigente, aviso «Guardar registra tu corrección manual; el diagnóstico vigente
    pasa a histórico.». `grade` se muestra derivado y nunca es editable (DEC-05, `[Pre-S1 resp. 18]`).
  - Se abren con botones en la vista de caso (`l1d-76`) y en la ficha, y por URL con `?item=<clave del catálogo>`
    (prellenado desde un faltante, US-004): un ítem con destino `Biomarker` abre (a) con el término seleccionado; uno
    con destino `Diagnosis` abre (b) con el foco en su campo. `hrefDeRegistroManual()` es el enlace que usa `l1d-96`.
  - Tras el `201`, la sección se actualiza sin recargar la página (`recargar()` de `l1d-76` o `router.refresh()`).
- **`apps/web` · BFF (clinical-platform):** Route Handlers `POST /api/patients/{id}/biomarkers`,
  `POST /api/patients/{id}/diagnoses` y `GET /api/patients/{id}/manual-entry-options`: sesión reenviada, `Origin`
  verificado en los `POST`, cuerpo sin reserializar con tope, `4xx` retransmitidos y `5xx` saneados.
- **`apps/clinical-api` (clinical-platform):** lectura nueva `GET /platform/patients/{id}/manual-entry-options`
  (términos de biomarcador, sistemas de estadificación, escalas funcionales con rango, sistemas de gradación y
  destino de cada ítem crítico, todo del catálogo para el tipo de cáncer del paciente), y el relleno de `field` en
  los `422` de `createManualBiomarker` / `createManualDiagnosis` para pintar el error junto a su campo (AC-4). La
  propiedad `field` (opcional, `type: string`, sin enum, misma descripción) la introduce `l1d-80` en el contrato
  `[S5 resp. 10]`; este change la usa igual. Un test de paridad garantiza que `criticalItems` coincide con
  `CompletenessItem.destination` del checklist (mismo lector).
- **Contratos (aditivo, ADR-26):** operación `getManualEntryOptions` y schema `ManualEntryOptions`; ejemplos nuevos en
  `contracts/examples/`. `info.version` 1.19.0 → **1.20.0**.
- **Textos** en `apps/web/messages/es.json` (`registroManual.*`), sin términos prohibidos (RN-23, US-068).

## Capacidades

- `manual-clinical-entry` (ADDED): formularios de registro manual y su apertura desde un faltante. La capacidad la
  crea `l1d-90` (aún no está en `openspec/specs/`); este change añade requisitos de UI y de la lectura de opciones,
  sin duplicar los de los endpoints de escritura.
- `api-contracts` (ADDED): operación de opciones de registro manual (`field` ya lo declara `l1d-80`).
- `web-bff` (ADDED): el registro manual y sus opciones pasan por Route Handlers de `web`.

## Bounded contexts

- **contratos** (`apps/clinical-api/openapi.yaml`, `contracts/examples/`, generados en `packages/api-contracts`).
- **clinical-platform** (`apps/clinical-api` módulo `manual-entry`; Route Handlers `apps/web/app/api` y
  `apps/web/lib/server/registro-manual.ts`).
- **frontend** (diálogos, hook, enlaces, botones en la vista de caso y la ficha, textos).
- Sin ai-services: `rag-orchestrator` no cambia.

## Dependencias

- ⛔ `l1d-90-registro-manual-biomarcador-diagnostico` (US-110): los endpoints `POST …/biomarkers` y
  `POST …/diagnoses` implementados, el módulo `manual-entry` (donde se monta la lectura de opciones y se rellena
  `field`) y `escalas.json` en el catálogo (sistemas de estadificación, escalas con rango y sistemas de gradación).
  Bloquea `## clinical-platform` en `clinical-api`; los diálogos y los Route Handlers pueden empezar con MSW sobre los
  ejemplos congelados.
- ⛔ `l1d-76-vista-caso-pagina` (US-090): la página `/pacientes/[id]/caso` y `useVistaDeCaso().recargar()` para el botón
  y el refresco de AC-1 en la vista de caso. Solo bloquea las tareas de `## frontend` que montan los botones ahí.
- ↪ `l1d-84-normalizacion-final-manual` (US-098, vía `l1d-90`): el `mappingStatus` de la respuesta.
- 🔗 **`Dialog` de shadcn/ui** (`components/ui/dialog.tsx`, `@radix-ui/react-dialog`; S5-refinamiento §5): lo añade
  **`l1d-80-tratamientos-atributos-manuales` primero** (oleada O2); este change (O3) lo reutiliza. Si este change
  llegara antes a `main`, lo añade él con `npm audit` en el PR y `l1d-80` lo reutiliza. `l1d-309-correccion-con-historico`
  no lo usa (variante A: corrección en línea).
- 🔗 Coordinación con `l1d-80`: `apps/web/lib/server/registro-manual.ts` es compartido (el primero que llegue a `main`
  lo crea; el otro añade sus manejadores). El hook `useEnvioRegistroManual` nace aquí (dos diálogos = dos
  consumidores) y `l1d-80` puede reutilizarlo.
- ⛔ `l1d-80-tratamientos-atributos-manuales` (contrato 1.18.0): introduce `field` en `ErrorRegistroManualInvalido` y
  `ErrorDiagnosticoInvalido` `[S5 resp. 10]`. Bloquea §1 y §2.2.
- 🔗 Cadena de versiones del `openapi.yaml` de `clinical-api` (orden de merge): `l1d-74` 1.17.0 → `l1d-80` 1.18.0 →
  `l1d-309` 1.19.0 → **`l1d-91` 1.20.0**. Quien rebase renumera y regenera `packages/api-contracts` (nunca fusiona
  generados a mano).
- 🔗 Consumida por FEAT-04 US-004 (`l1d-96`, change por crear): la columna «Datos críticos» enlaza con
  `hrefDeRegistroManual(patientId, item)` (D-7) y reutiliza los dos diálogos.
- 🔗 Regresión [RN-23] → US-068 (lista de términos prohibidos sobre los textos nuevos).

## Fuera de alcance

- Los endpoints de escritura, su validación y la regla de corrección del diagnóstico (US-110, `l1d-90`).
- Diálogos de atributo clínico y tratamiento previo (S5-03 c y d, US-094 `l1d-80`). Corrección con histórico de un
  biomarcador ya registrado (US-253, `l1d-309`).
- La columna «Datos críticos» con su acción por ítem (US-004, `l1d-96`); aquí solo se expone el enlace y la apertura
  por `?item=`.
- «Cargar documento» desde un faltante (OCR a Post-MVP, D-7). Campo de «información adicional» para un `no_mapeado`
  (US-107): los formularios nunca asignan un código a un `no_mapeado`.
- Vista previa en el cliente del texto de `grade` o del grupo ISUP: la regla vive solo en `clinical-api` (DEC-05).

## Nota sobre US-111 AC-3

El AC-3 del Markdown de US-111 está **desfasado** («Guardar crea una corrección manual del diagnóstico vigente», «al
guardar `grade = "2"`»). **Manda el design**: aviso «Guardar registra tu corrección manual; el diagnóstico vigente pasa
a histórico.» y gradación estructurada con `grade` derivado (`[Pre-S1 resp. 18]`, S5-03 b). El AC del backlog y de
Linear se actualiza aparte.
