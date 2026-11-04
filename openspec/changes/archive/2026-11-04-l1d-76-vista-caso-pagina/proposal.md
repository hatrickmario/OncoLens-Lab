# Proposal — l1d-76-vista-caso-pagina

## Trazabilidad

L1D-76 · US-090 · FEAT-02b (L1D-10) · Sprint 5 · Estimación **5** · HU-15 · FR-21 (UI) · FR-07 (origen visible) ·
NFR-12 (accesibilidad) · RN-07 (regresión) · RN-23 (textos nuevos) · RN-24 (análisis previo como evento, no como
dato) · AC-02.1, AC-02.2, AC-02.3, AC-02.4, AC-T1.1 · US-090 AC-1…AC-6 · `backlog/features/FEAT-02b-vista-de-caso.md` ·
`backlog/sprints/S5-refinamiento.md` D-1, D-8 (`[S5 resp. 1]`, `[S5 resp. 5]`) · `docs/ux/S5/pantallas-s5.md` S5-05 ·
Gate 1 del S5: `[S5 resp. 11]` (origen de IA, «Documento», fechas relativas, «Carga inicial»), `[S5 resp. 13]`
(supuestos decididos)

## Por qué

La reconstrucción manual del caso es el dolor transversal más fuerte del Discovery (AS-IS P1; JTBD 1 y 7). G-Demo
(PRD E-17, US-142) recorre «caso editado a mano → faltantes → análisis»; D-1 eligió la **vista de caso mínima**
(US-088 + US-090) como el lugar donde el oncólogo ve el caso reconstruido y donde US-004 (`l1d-96`) y US-094
(`l1d-80`) montan sus acciones. `l1d-74` entrega `GET …/case`; falta la página que lo muestra.

## Qué cambia

- **`apps/web` · BFF (clinical-platform):** Route Handler `GET /api/patients/{id}/case`
  (`app/api/patients/[id]/case/route.ts` sobre `lib/server/caso.ts`), mismo patrón que el checklist (US-005): valida
  el UUID (no UUID → `404` propio sin llamar), reenvía solo la cookie de sesión con el SDK generado, retransmite `200`
  y `4xx` y responde un `500 ERROR_INTERNO` saneado con `traceId` propio ante `5xx`, fallo de red o timeout.
- **`apps/web` · UI (frontend):** página `/pacientes/[id]/caso` (S5-05): RSC que lee la ficha en el servidor para la
  barra del paciente (como la ficha) y monta el organismo cliente `VistaDeCaso`, que pide el `CaseView` por el
  Route Handler y muestra:
  - **Línea de tiempo** con los eventos fechados en el orden del servidor: tipo, fecha **relativa** («hace 12 días»,
    «hoy»; `[S5 resp. 11d]`), descripción, origen en texto, confianza de extracción y estado de revisión (siempre en
    texto, nunca solo color). Los eventos de IA (`analisis_ia`, `resumen_caso`) muestran «Generado por IA · Sin
    verificar», sin confianza (`[S5 resp. 11a]`).
  - **Sin fecha confiable**: los eventos con `datePrecision = incierta` (`eventDate = null`).
  - **Tratamientos previos**: tabla línea · contexto · esquema · inicio · fin · origen, en el orden del servidor
    (D-8; la agrupación por línea con fuentes adicionales llega con US-089).
  - **Atributos clínicos** (atributo · valor · fecha · origen).
  - **Series de biomarcadores** en **tabla** (fecha · valor · origen); sin gráfico (D-8, llega con US-089).
  - Origen sin enlace de descarga ni «Ver documento» (US-212 y el visor son Post-MVP; D-8): `ocr` → «Documento»,
    `seed` → «Carga inicial», `manual` → «Registro manual», `manual_correction` → «Corrección manual».
  - Estados: cargando, `5xx` → «No se pudo cargar la vista de caso» con «Reintentar» y sin datos parciales,
    `401` → login con aviso de sesión expirada, `404` → «Paciente no encontrado».
  - Acción «Analizar la evidencia para este caso» → `/pacientes/[id]/analisis`, y en la ficha el enlace nuevo
    «Ver caso clínico» → `/pacientes/[id]/caso`.
  - Un hueco de maquetación para la columna «Datos críticos» (S5-02), que llena `l1d-96` (US-004), y un
    `recargar()` del hook que reutilizan los diálogos de `l1d-80` y `l1d-96` tras guardar.
- **Ficha (frontend):** con la misma fuente única, `ficha.origen.ocr` pasa de «Extraído de documento» a «Documento»
  (`[S5 resp. 11b]`) y las fechas de la ficha pasan a relativas (`[S5 resp. 11d]`); los tests de la ficha que afirman
  esos literales se actualizan en el mismo commit (cambio de AC registrado en la spec).
- **Contratos:** sin cambios en `openapi.yaml` ni ejemplos nuevos. Consume `contracts/examples/case-view-p-caso.json`
  y sus entradas en `contracts/examples/index.json`, que **crea `l1d-74`** (proveedor) con un test que compara la
  respuesta real de FX-02b-a con el ejemplo.
- **Textos** en `apps/web/messages/es.json` (`caso.*`, `caso.origenIa`, textos de fecha relativa), sin términos
  prohibidos (RN-23, US-068).

## Capacidades

- `case-timeline` (ADDED): requisitos de la página de la vista de caso. La capacidad la crea `l1d-74` (aún no está en
  `openspec/specs/`); este change añade requisitos distintos (UI), sin duplicar los del endpoint.
- `web-bff` (ADDED): la vista de caso se lee por un Route Handler que reenvía la sesión y sanea los `5xx`.

## Bounded contexts

clinical-platform (Route Handler BFF de `apps/web/app/api` y `lib/server/caso.ts`) · frontend (página, organismos,
hook, textos, enlace, origen y fechas de la ficha). Sin cambio de contratos (consume el ejemplo de `l1d-74`), sin
ai-services ni `clinical-api`.

## Dependencias

- ⛔ **`l1d-74-vista-caso-timeline`** (US-088): `GET /platform/patients/{id}/case` implementado, el `500` declarado
  en el contrato (clinical-api 1.17.0), `zCaseView` regenerado y el ejemplo `case-view-p-caso.json` publicado. Sin su merge no hay E2E ni `visual-check` con datos; los tests de
  componente y del Route Handler pueden escribirse antes con MSW sobre el ejemplo.
- ↪ Archivados: `l1d-72` (ficha, `obtenerFicha`, `PatientHeaderBar`, `textoDeOrigen`), `l1d-97` (patrón del Route
  Handler del checklist, `respuestaPropia`, `retransmitir`).
- 🔗 Consumida por `l1d-96` (US-004: columna «Datos críticos» en el hueco reservado) y `l1d-80` (US-094: botones
  «Agregar tratamiento previo» y «Registrar atributo», que llaman a `recargar()`).
- 🔗 Regresión [RN-23] → US-068 (lista de términos prohibidos sobre los textos nuevos).
- 🔗 Medido en US-105 (M-02.1, M-02.2, NFR-03 p95 de la vista ≤ 2 s).

## Fuera de alcance

- Gráfico de la serie, agrupación por línea con fuentes adicionales y «PSA siempre serie» (US-089, S6
  `si-hay-capacidad`); tendencia (US-091).
- Enlace de descarga del PDF de origen y página del valor (US-212, Post-MVP) y visor con resaltado (US-080): AC-2 se
  reduce a mostrar el origen «Documento» sin enlace (D-8). `Provenance` no trae número de página.
- Columna «Datos críticos» con acción (US-004, `l1d-96`) y diálogos de registro (US-094 `l1d-80`, US-111 `l1d-91`).
- Decisiones registradas en OncoLens como eventos «Decisión registrada en OncoLens» (`Treatment`, Post-MVP).
- Auditoría de la lectura de la vista (US-102, S6).
