# Proposal — l1d-96-datos-criticos-vista-caso

## Trazabilidad

L1D-96 · US-004 · FEAT-04 (L1D-14) · Sprint 5 · Estimación **3** · HU-18 · FR-23 (checklist en la vista de caso) ·
FR-07 (origen visible) · NFR-12 (accesibilidad) · RN-26 (avisos que no bloquean) · RN-23 (textos nuevos, regresión) ·
AC-04.1, AC-T1.1 · US-004 AC-1…AC-6 · US-005 AC-1, AC-3, AC-7 (el enlace del aviso del panel cambia de destino) ·
`backlog/features/FEAT-04-informacion-faltante.md` · `backlog/sprints/S5-refinamiento.md` D-1, D-7, D-8
(`[S5 resp. 1]`, `[S5 resp. 4]`) · `docs/ux/S5/pantallas-s5.md` S5-02 · Gate 1 del S5: `[S5 resp. 11]` (c: texto del
enlace; «Documento»; «Carga inicial»), `[S5 resp. 13]` (P2 `alGuardar`, P3 literal del checklist caído y supuestos
decididos)

## Por qué

El oncólogo descubre hoy el faltante *después* de analizar: «el loop más costoso» del Discovery (AS-IS P4, JTBD 2).
US-005 ya le avisa en el panel, pero lo manda a la ficha a buscar dónde se ingresa cada dato. G-Demo (D-5) recorre
«vista de caso con timeline y datos críticos → registro a mano de un faltante → análisis». Con la vista de caso mínima
(D-1) y sin OCR en el MVP (PRD E-17, D-7), la columna «Datos críticos» de la vista de caso es el lugar donde se ve el
estado de cada dato y se cierra el faltante a mano, sin salir de la pantalla.

## Qué cambia

- **`apps/web` · UI (frontend):** organismo `CriticalDataChecklist` en el hueco `datosCriticos` de la vista de caso
  (`l1d-76`), con ancla `#datos-criticos` (S5-02):
  - Una fila por ítem del checklist en el orden del catálogo, con la etiqueta del catálogo y el estado en **símbolo y
    palabra** («Presente y verificado», «Presente sin verificar», «Faltante», «No aplica»), cabecera con la versión del
    catálogo y el número de faltantes, y la nota «Los faltantes no bloquean…» (RN-26).
  - **Acción solo manual según `destination.entity` (D-7):** `Biomarker` → «Registrar a mano» (diálogo de US-111,
    `l1d-91`, prellenado con `?item=<clave>`); `Diagnosis` → «Completar diagnóstico a mano» (US-111);
    `ClinicalAttribute` → «Registrar a mano» (diálogo de US-094, `l1d-80`, con la clave del atributo preseleccionada);
    `PriorTreatment` → «Agregar tratamiento previo» (US-094). **Nunca «Cargar documento»**.
  - Origen en texto de los `presente_*` desde la fuente única `textoDeOrigen()`: «Carga inicial», «Registro manual»,
    «Corrección manual» o «Documento» (`ocr`, `[S5 resp. 11b]`), **sin** enlace a PDF ni URL de documento (US-212
    Post-MVP).
  - Tras guardar, la fila deja de mostrar «Faltante» sin recargar la página: los cuatro diálogos llaman a `alGuardar`,
    que relee el checklist y la vista (P2 decidido, `[S5 resp. 13]`).
  - `GET /api/patients/{id}/completeness` en `5xx` → «No se pudo calcular el checklist» en la columna (P3 decidido,
    `[S5 resp. 13]`); la línea de tiempo,
    los tratamientos y las series se muestran igual. Tipo de cáncer no habilitado → el aviso de alcance existente.
- **`apps/web` · panel de análisis (frontend):** el enlace de cada faltante del aviso de US-005 deja de ir a la ficha y
  apunta a `/pacientes/{id}/caso#datos-criticos`, con el foco en el encabezado de la columna; su texto pasa a
  «Ir a ‹etiqueta› en el caso clínico» (S5-02: «El enlace del aviso de faltantes del panel pasa a apuntar aquí»).
  Las anclas de la ficha (`#diagnostico`, `#biomarcadores`) se conservan: las usa la tabla de aplicabilidad.
- **Lectura del checklist:** la columna lee el `CompletenessView` completo por el Route Handler **existente**
  `GET /api/patients/{id}/completeness` (US-005), porque `CaseView.completeness` solo trae `{ item, status }`, sin
  etiqueta, destino ni procedencia (design D1). Sin Route Handler nuevo ni cambio de contrato. Es una desviación
  registrada del UX S5-02 (que decía `CaseView.completeness`), aceptada por `contract-keeper` en el Gate 1.
- **Contratos:** sin diff en `openapi.yaml`. Ejemplo nuevo `contracts/examples/completeness-f-m2-ki67-registrado.json`
  (F-M2 con Ki-67 `presente_verificado`, `manual`) para la relectura tras guardar.
- **Textos** en `apps/web/messages/es.json` (`datosCriticos.*`, incluido `datosCriticos.noCalculable`;
  `faltantes.enElCaso` = «Ir a ‹etiqueta› en el caso clínico», `[S5 resp. 11c]`), sin términos prohibidos.
- ↪ Consume `contracts/examples/case-view-p-caso.json`, que publica `l1d-74` (proveedor).

## Capacidades

- `completeness` (ADDED): la columna «Datos críticos» de la vista de caso, sus acciones manuales, su origen visible,
  su degradación y su accesibilidad. Es la UI del checklist cuya regla ya vive en esta capacidad.
- `evidence-panel` (MODIFIED y REMOVED + ADDED): el aviso de faltantes del panel enlaza a la columna de la vista de caso
  en lugar de a la ficha; el requisito «El enlace del faltante lleva a la sección existente de la ficha» se sustituye
  por uno con el destino nuevo (cambia el título).

## Bounded contexts

frontend (organismo, acciones, enlace del panel, anclas, textos) · contratos (solo un ejemplo nuevo, sin cambio del
spec). Sin clinical-platform nuevo (se reutiliza el Route Handler del checklist de US-005), sin `clinical-api` y sin
ai-services.

## Dependencias

- ⛔ **`l1d-76-vista-caso-pagina`** (US-090): página `/pacientes/[id]/caso`, hueco `datosCriticos` del template y
  `recargar()` de `useVistaDeCaso`. Sin su merge no hay dónde montar la columna.
- ⛔ **`l1d-91-formularios-registro-manual`** (US-111, en creación): diálogos de biomarcador y diagnóstico abiertos y
  prellenados por `?item=<clave>`. Contrato de coordinación en design D3.
- ⛔ **`l1d-80-tratamientos-atributos-manuales`** (US-094): diálogos «Registrar atributo» y «Agregar tratamiento
  previo». Este change les añade la preselección de la clave del atributo y el aviso de guardado (design D4).
- ↪ `l1d-74-vista-caso-timeline` (US-088): `GET …/case` para la página y para el E2E.
- ↪ `l1d-90-registro-manual-biomarcador-diagnostico` (US-110): `POST …/biomarkers` y `POST …/diagnoses` para que el
  guardado del E2E cierre el faltante.
- ↪ Archivados: `l1d-97` (US-005: Route Handler `/api/patients/{id}/completeness`, `useChecklistDeFaltantes`,
  `ChecklistNoDisponible`, `FocoPorAncla`), US-003 (`CompletenessView` con `destination`, `origin` y `provenance`).
- 🔗 Regresión [RN-23] → US-068 (textos nuevos) · 🔗 Regresión [RN-17] → US-198 (Post-MVP) · 🔗 Medido en US-142
  (G-Demo, D-5).

## Fuera de alcance

- «Cargar documento» desde un faltante y la carga de US-079 (OCR a Post-MVP, PRD E-17, D-7). Descartado el botón
  deshabilitado «Disponible más adelante».
- Enlace de descarga del PDF y página de origen (US-212, Post-MVP) y visor (US-080): AC-4 se reduce a mostrar el origen
  en texto (D-7, D-8).
- Revisar o verificar un `presente_sin_verificar` desde la columna (US-107, US-108).
- Faltantes en la ficha más allá del contador `missingCriticalCount` (readme §4.1).
- Los formularios en sí (US-111 `l1d-91`, US-094 `l1d-80`) y los endpoints de registro (US-110 `l1d-90`, US-094).
- Si un dato manual cuenta como verificado en el checklist: DEC-01 Q1 (escenario `propuesta_revisada`: sí).
