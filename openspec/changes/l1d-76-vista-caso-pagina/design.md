# Design — l1d-76-vista-caso-pagina

## Contexto

`GET /platform/patients/{id}/case` → `CaseView` (congelado desde US-033; implementado por `l1d-74`, que además
declara el `500` y fija los literales de `eventType`, el orden y la procedencia de los eventos derivados, D3–D8). En
`apps/web` ya existen: la ficha RSC (`obtenerFicha`, `PatientHeaderBar`, `FichaDelDoctor`), el patrón del Route Handler
de lectura con `5xx` saneado (`lib/server/completeness.ts`, `retransmitir`, `respuestaPropia`), el hook cliente con
relectura y redirección por sesión vencida (`use-checklist-de-faltantes.ts`), y los textos únicos de origen,
revisión, confianza y fecha (`ficha.origen`, `textoDeOrigen`, `textoDeRevision`, `textoDeConfianza`, `formatearFecha`).

Decisiones del refinamiento que se respetan: **D-1** (vista de caso mínima, `[S5 resp. 1]`), **D-8** (serie en
tabla, sin gráfico; origen «Documento» sin enlace de descarga; lecturas simples sin las reglas de US-089). Pantalla de
referencia: `docs/ux/S5/pantallas-s5.md` **S5-05** (ruta `/pacientes/[id]/caso`, layout de la pantalla 07 del
`flujo-e2e.md`); la columna «Datos críticos» (S5-02) la monta US-004 (`l1d-96`). Decisiones del Gate 1 (usuario,
2026-11-03): `[S5 resp. 11]` a (origen de IA), b («Documento»), d (fechas relativas) y origen semilla «Carga inicial»;
`[S5 resp. 13]` (los supuestos antes marcados `(asumido)` quedan decididos y se citan así).

## Decisiones

Ninguna es cara de revertir (sin cambio de contrato, esquema, modelos ni privacidad nueva): una recomendación por
decisión y las descartadas en una línea.

- **D1 · Lectura en cliente por Route Handler.** La página es RSC (valida el UUID, lee la ficha para la barra con
  `obtenerFicha`, como la ficha) y monta el organismo cliente `VistaDeCaso`, que pide `GET /api/patients/{id}/case`.
  Da «Reintentar» sin recargar y el `recargar()` que piden `l1d-80` y `l1d-96` para actualizar la sección tras
  guardar sin recargar la página. *Descartado:* leer `/case` en el RSC y reintentar con `router.refresh()` (no deja a
  los diálogos refrescar solo la vista sin rehacer la ficha, y no da un Route Handler que verificar en AC-5).
- **D2 · Route Handler calcado del checklist.** `lib/server/caso.ts` exporta `crearManejadorVistaDeCaso(dependencias)`
  con la misma secuencia que `crearManejadorChecklist`: UUID → `404` propio; SDK generado `getPatientCase` con
  `parseAs: 'text'`; `5xx`/red/timeout → `500 ERROR_INTERNO` con mensaje fijo «No se pudo obtener la vista de caso del
  paciente.» y `traceId` de `web`; `200`/`4xx` → `retransmitir`. Evento de log `case.proxy`. Si al implementarlo el
  cuerpo resulta idéntico al del checklist salvo evento, mensaje y operación del SDK, el refactor extrae
  `crearProxyDeLectura({ evento, mensaje, pedir })` en `lib/server/` y lo usan ambos (sin cambiar tests).
- **D3 · Textos de procedencia de una sola fuente.** Origen, revisión y confianza salen de `textoDeOrigen()`,
  `textoDeRevision()` y `textoDeConfianza()` (`ficha.*`), los mismos de la ficha: `seed` → «Carga inicial», `manual` →
  «Registro manual», `manual_correction` → «Corrección manual» y `ocr` → **«Documento»**. **Decidido (usuario,
  2026-11-03) `[S5 resp. 11b]`:** `ficha.origen.ocr` pasa de «Extraído de documento» a «Documento» en la única
  fuente, así que cambia a la vez en ficha y vista de caso (como dicen S5-05 y US-090 AC-1); los tests de la ficha que
  afirman el literal viejo se actualizan en el mismo commit.
- **D4 · Rótulos de `eventType`.** `caso.tiposDeEvento` en `es.json` con las claves que fija `l1d-74` D3
  (`diagnostico`, `inicio_tratamiento_previo`, `fin_tratamiento_previo`, `examen`, `analisis_ia`, `resumen_caso`) y las
  de `ClinicalEvent` del seed (`progresion`, `toxicidad`, `cirugia`, …). Función con nombre `rotuloDeEvento(tipo)`:
  clave desconocida → «Evento clínico» (el contrato deja `eventType` como `string`). Los rótulos de los derivados de
  tratamiento llevan «Tratamiento previo · inicio/fin» (distinguible de «Decisión registrada en OncoLens», Post-MVP).
- **D5 · Fechas relativas `[S5 resp. 11d]`.** **Decidido (usuario, 2026-11-03):** ficha y vista de caso muestran la
  fecha como relativa con una regla pura `fechaRelativa(fecha, hoy)` en `lib/fechas/` (fuente única): mismo día →
  «hoy»; 1–30 días → «hace n días» («hace 1 día»); 31 días a 23 meses → «hace n meses» («hace 1 mes»; meses de
  calendario completos); desde 24 meses → «hace n años»; una fecha futura o inválida → la absoluta de
  `formatearFecha()`. La absoluta (dd/mm/aaaa) queda en `<time dateTime="AAAA-MM-DD" title="dd/mm/aaaa">` para quien
  necesite el día exacto. `hoy` lo calcula la página RSC con el reloj inyectado del servidor y baja por prop (sin
  `Date.now()` en componentes); los tests lo congelan en 2026-10-01 (reloj de FX-02b-a). Una fecha sin día
  (`eventDate = null`) sigue sin fecha (D6). *Descartado:* fechas absolutas (contradice S5-02/S5-05 y la decisión).
- **D6 · Orden del servidor.** La UI no reordena ni agrupa: la línea de tiempo y las secciones usan el orden de
  `l1d-74` (D5 y D8 de ese change). La separación «Sin fecha confiable» es un filtro por `datePrecision = incierta`
  (`separarSinFecha(timeline)`), no un orden.
- **D7 · Valores de texto libre del contrato** (`setting`, `endReason`, `attributes[].key/value`): rótulo desde
  `caso.contextos`, `caso.motivosDeFin` y `caso.atributos` con respaldo al valor crudo (`rotuloOValor(mapa, valor)`),
  nunca ocultos. `lineNumber = null` y fechas `null` → «No registrado» (`ficha.noRegistrado`); `ongoing = true` →
  «En curso».
- **D8 · Origen sin enlace (D-8).** Ningún componente recibe ni usa `sourceDocumentId` / `additionalSourceDocumentIds`
  para armar URLs o botones. El enlace de descarga se añadirá con US-212 (Post-MVP).
- **D9 · Eventos de IA `[S5 resp. 11a]`.** `analisis_ia` y `resumen_caso` se muestran solo en la línea de tiempo.
  **Decidido (usuario, 2026-11-03):** para esos dos tipos (`esEventoDeIa(eventType)`) la procedencia se pinta como
  «Generado por IA · Sin verificar» (`caso.origenIa`), sin confianza de extracción ni estado de revisión aparte; la
  procedencia técnica que envía `l1d-74` D7 (`manual` / `n_a` / `auto_aceptado`) **nunca** se muestra como «Registro
  manual». *Descartado:* mostrar la procedencia tal cual (atribuye al oncólogo un texto generado por IA, RN-19).
- **D10 · Estados de carga.** `null` mientras no hay primera lectura → esqueleto con `aria-busy`; `ok` → secciones;
  `error` → `VistaDeCasoNoDisponible` («No se pudo cargar la vista de caso» + «Reintentar»), sin secciones;
  `no_encontrado` → «Paciente no encontrado» + «Volver a pacientes»; `sin_sesion` → `router.replace(RUTA_LOGIN_EXPIRADA)`.
  La respuesta `200` se valida con `zCaseView` (generado); un cuerpo inválido cuenta como `error` (sin datos parciales).

## Privacidad y ownership

- Frontera: navegador → `web` (`GET /api/patients/{id}/case`, cookie de sesión opaca) → `clinical-api`. `web` no
  contacta a `rag-orchestrator` ni a `clinical-minio`; `rag-orchestrator` no toca datos clínicos (sin cambios).
- `CaseView` no trae identidad. La barra del paciente (nombre, documento) se pinta en el RSC con `obtenerFicha`, como
  en la ficha; la identidad nunca va en una URL, en el estado cliente de la vista ni en logs.
- RN-11 no aplica: nada sale hacia la IA. La `description` de los eventos se muestra tal como la entrega `l1d-74`
  (`l1d-74` D13, `[S5 resp. 12]`: sin enmascarar hacia el oncólogo, `no-store`, nunca en logs). Logs del BFF: evento, estado, `traceId`, duración y motivo; nunca el id del paciente ni el cuerpo.
- RN-12/13/14: solo datos sintéticos. El ejemplo `case-view-p-caso.json` (lo publica `l1d-74`, design D15) usa la
  toxicidad **sin** la PII sintética de FX-02b-a («Toxicidad cutánea grado 2»); la PII sembrada se prueba en `l1d-74`
  (logs) armada en tiempo de test.
- `hoy` para las fechas relativas viaja como fecha ISO por prop desde el RSC; ninguna fecha va en la URL.

### Seguridad web

- Validación: `zGetPatientCasePath` en el servidor (UUID) y `zCaseView` en el cliente para el `200`; ambos generados
  del spec (`packages/api-contracts`), nunca a mano.
- Sin `NEXT_PUBLIC_` nuevas. `lib/server/caso.ts` y el Route Handler importan `server-only`.
- Render: todo texto (incluidas `description`, `regimenName`, `value`) como texto de React; sin
  `dangerouslySetInnerHTML` ni HTML crudo. No hay texto del LLM ni del corpus en esta vista.
- CSP y cabeceras: sin cambios (mismo origen, sin recursos externos). Respuesta del BFF con `Cache-Control: no-store`.
- CSRF: lectura `GET` con cookie `SameSite=Strict`; sin `Origin` exigido, como el checklist.
- Dependencias nuevas: ninguna (sin librería de gráficos: D-8).

## Componentes y patrones

Pantalla de referencia S5-05 (y pantalla 07 del `flujo-e2e.md` para el layout). Sin desviaciones: fechas relativas
(D5), «Documento» (D3), «Generado por IA · Sin verificar» (D9) y «Carga inicial» siguen al diseño y al Gate 1.

| Nivel | Componente | Concepto | Tipo |
|---|---|---|---|
| page | `app/(dashboard)/pacientes/[id]/caso/page.tsx` | ruta, UUID, barra del paciente, estados de la ficha | RSC |
| template | `templates/case-view-template.tsx` | layout de dos columnas con hueco `datosCriticos` (S5-02, lo llena `l1d-96`) y acción «Analizar la evidencia para este caso» | RSC |
| organism | `organisms/vista-de-caso.tsx` | orquesta estados (D10) y monta las secciones | `'use client'` (único) |
| organism | `organisms/case-timeline.tsx` | línea de tiempo de fechados | sin estado (hijo de cliente) |
| organism | `organisms/undated-events.tsx` | «Sin fecha confiable» | sin estado |
| organism | `organisms/prior-treatments-table.tsx` | tabla de tratamientos previos | sin estado |
| organism | `organisms/clinical-attributes-table.tsx` | tabla de atributos | sin estado |
| organism | `organisms/biomarker-series-tables.tsx` | una tabla por serie | sin estado |
| molecule | `molecules/procedencia-del-dato.tsx` | origen · revisión · confianza en texto (D3, D9) | sin estado |
| molecule | `molecules/vista-de-caso-no-disponible.tsx` | error + «Reintentar» | sin estado |
| atom/molecule existente | `SeccionDeFicha` (o el encabezado equivalente de la ficha) | `h2` de sección con `id` | reutilizado |

- Cada componente con un concepto; alerta a 100 líneas, límite 150.
- **Custom hook `useVistaDeCaso(patientId)`** (`lib/caso/use-vista-de-caso.ts`): `{ lectura, recargar }`. Evidencia:
  ≥2 consumidores de `recargar` (el «Reintentar» de este change y los diálogos de `l1d-80`/`l1d-96` tras guardar) y
  la misma forma ya probada en `useChecklistDeFaltantes`. Sin provider ni compound components (sin prop drilling ≥ 3).
- Lógica pura en `lib/caso/`: `leerVistaDeCaso()` (fetch + clasificación + `zCaseView`), `separarSinFecha()`,
  `rotuloDeEvento()`, `rotuloOValor()`, `esEventoDeIa()`; en `lib/fechas/`: `fechaRelativa()` (D5), que usan ficha y
  vista.
- Átomo `FechaRelativa` (`atoms/fecha-relativa.tsx`): `<time>` con la relativa visible y la absoluta en `dateTime` y
  `title`; lo usan la vista y la ficha.
- En la ficha: enlace «Ver caso clínico» en `FichaDelDoctor` (RSC), con `hrefDeVistaDeCaso(id)` junto a `hrefDeFicha`
  en `lib/ficha/anclas.ts` (precondición UUID, mismo estilo).

## Contratos

Proveedor: `clinical-api`; consumidor: `web` (cliente generado `getPatientCase`, `zCaseView`, `zGetPatientCasePath`).
**Sin diff en `apps/clinical-api/openapi.yaml` ni en `contracts/examples/`**: el `500`, la cabecera `no-store`, el
ejemplo `case-view-p-caso.json` y las entradas de `/case` en `contracts/examples/index.json` los publica `l1d-74`
(proveedor, clinical-api 1.17.0, design D15), con un test que compara la respuesta real de FX-02b-a con el ejemplo.
Este change no cambia rutas, schemas, códigos ni ejemplos, y `oasdiff` no aplica.

Ejemplos consumidos (contract-first de los mocks, US-213): `case-view-p-caso.json` (FX-02b-a: 10 eventos fechados +
la toxicidad `incierta`; Leuprorelina `L02AE02` y Bicalutamida `L02BB03`; dos atributos; PSA 3 puntos y testosterona
1), `error-no-autenticado.json`, `error-permiso-denegado.json`, `error-no-encontrado.json` y `error-interno.json`. Los
handlers de MSW leen de `contracts/examples/`.

## Dependencias y colaboradores

- `lib/server/caso.ts` (nuevo, `server-only`): depende de `DependenciasDelBff` (config, fetch, reloj, traceId,
  registro), del SDK generado y de `retransmitir`/`respuestaPropia`; nunca de `fetch` global directo.
- `app/api/patients/[id]/case/route.ts` (nuevo): solo cablea `crearManejadorVistaDeCaso(dependenciasDeEntorno())`.
- `lib/caso/*` (nuevo): reglas puras con nombre (D4, D6, D7, D9) y el hook; `leerVistaDeCaso` recibe `fetch` del
  entorno del navegador y no conoce `clinical-api`.
- `lib/ficha/anclas.ts` (modificado): `hrefDeVistaDeCaso()`.
- `components/organisms/ficha-del-doctor.tsx` (modificado): enlace «Ver caso clínico», y `hoy` del reloj del RSC
  para las fechas relativas de la ficha (los componentes de la ficha que hoy usan `formatearFecha()` pasan a
  `FechaRelativa`, D5).
- `lib/fechas/fecha-relativa.ts` y `atoms/fecha-relativa.tsx` (nuevos): regla pura y átomo de D5.
- `messages/es.json` (modificado): `caso.*` (incluida `caso.origenIa`), textos de fecha relativa y
  `ficha.origen.ocr` = «Documento» (D3); sin duplicar `ficha.origen`, `ficha.confianza`, `evidence.base.revision`.
- Fakes: ninguno nuevo de puerto. MSW en el borde HTTP (`tests/support/caso-simulado.ts` hacia `clinical-api` para el
  Route Handler; handlers de `/api/patients/{id}/case` para la UI), ambos desde `contracts/examples/`.

## Tests

- Route Handler (Vitest + MSW, validado con `assertMatchesSpec` contra `CaseView` y los errores): `200`, `4xx`
  retransmitidos, no UUID, `5xx` y red saneados.
- UI (Vitest + Testing Library + MSW sobre `/api/*` con `onUnhandledRequest: 'error'`): AC-1…AC-6 y los supuestos decididos `[S5 resp. 13]`; reloj de la página congelado en 2026-10-01.
- E2E Playwright contra Compose con P-CASO sembrado (`l1d-74` 2.1 adaptado al seed E2E) y peticiones interceptadas:
  AC-1, AC-5 y AC-6 (con `page.route` sobre `/api/patients/*/case` para el `5xx`).
- `visual-check` a 375 y 1280 px.

## Riesgos

- **Literales de `eventType` en dos apps** (constante de `l1d-74` en `clinical-api` y rótulos en `es.json`): el
  contrato los deja como `string`. Mitigación: `rotuloDeEvento` con respaldo «Evento clínico» y un test que recorre los
  `eventType` de `case-view-p-caso.json` (que `l1d-74` compara con su respuesta real).
- **Tests de la ficha** que afirman «Extraído de documento» o fechas dd/mm/aaaa cambian con D3 y D5: se actualizan
  al requisito nuevo sin debilitar aserciones; si alguno se elimina, `Test-Removal:`. Si se repite, ADR o `enum` en el contrato (cambio de contrato, otra historia).
- **Orden de merge** con `l1d-74` (bloqueante para E2E) y con `l1d-80`/`l1d-96` (consumen `recargar()` y el hueco).
- **NFR-03** (p95 ≤ 2 s): una sola petición desde el cliente; se mide en US-105.

## Pendiente de definir

Nada. P1 (origen de los eventos de IA) quedó decidido en D9 `[S5 resp. 11a]`, P2 (texto del origen `ocr`) en D3
`[S5 resp. 11b]` y las fechas en D5 `[S5 resp. 11d]`.
