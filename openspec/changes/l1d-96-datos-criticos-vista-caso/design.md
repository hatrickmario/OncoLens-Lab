# Design — l1d-96-datos-criticos-vista-caso

## Contexto

En `main` ya existen: el Route Handler `GET /api/patients/{id}/completeness` (`lib/server/completeness.ts`, US-005), el
hook `useChecklistDeFaltantes(patientId)` con `{ lectura, releer }` y redirección por sesión vencida, `lecturaDeLaVista`
y `enlaceDeRegistro` (`lib/evidence/faltantes.ts`), `ChecklistNoDisponible`, `ScopeNotice`, `EnlaceDeRegistro`,
`FocoPorAncla` con la lista cerrada `ANCLAS_DE_FICHA`, y los textos únicos de origen (`textoDeOrigen`, `ficha.origen`).
`l1d-76` crea la página `/pacientes/[id]/caso` con el hueco `datosCriticos` y `useVistaDeCaso` con `recargar()`;
`l1d-80` crea `DialogoAtributoClinico` y `DialogoTratamientoPrevio`; `l1d-91` (en creación) crea los diálogos de
biomarcador y diagnóstico de US-111.

Decisiones del refinamiento que se respetan: **D-1** (vista de caso mínima), **D-7** (sin «Cargar documento»; acción
según `destination.entity`; origen sin enlace a PDF; el pendiente de AC-2 queda resuelto con «Registrar a mano»),
**D-8** (origen sin descarga). Pantalla de referencia: `docs/ux/S5/pantallas-s5.md` **S5-02** (layout de la pantalla 07
de `docs/ux/flujo-e2e.md`, sistema de diseño §3.5: «Faltante» con icono neutro, nunca ✕ rojo). Decisiones del Gate 1
(usuario, 2026-11-03): `[S5 resp. 11c]` (texto del enlace del aviso), `[S5 resp. 11b]` («Documento»), origen semilla
«Carga inicial» (`[S5 resp. 11]`) y `[S5 resp. 13]` (P2 y P3 decididos; los supuestos antes marcados `(asumido)` se
citan así).

## Decisiones

Ninguna es cara de revertir (sin contrato, esquema, modelos ni privacidad nueva): una recomendación por decisión y las
descartadas en una línea.

- **D1 · La columna lee `/completeness`, no `CaseView.completeness`.** El contrato congelado de `CaseView.completeness`
  solo trae `{ item, status }`; la columna necesita `label`, `destination.entity`, `origin` y `provenance` (AC-1, AC-3,
  AC-4). Se reutiliza `GET /api/patients/{id}/completeness` (mismo `CompletenessService`, `l1d-74` AC-8) con
  `useChecklistDeFaltantes`. Además da AC-5 de forma natural: si el checklist cae, `/case` sigue en `200` y la vista se
  muestra. **Desviación registrada del UX S5-02** (que pide leer `CaseView.completeness`): `CaseView.completeness` no
  trae etiqueta, destino ni origen, así que la columna lee `/completeness`; **aceptada por `contract-keeper` en el
  Gate 1** (sin cambio de contrato, mismo `CompletenessService`). *Descartados:* ampliar
  `CaseView.completeness` (cambio de contrato congelado, otra historia) y cruzar `CaseView.completeness` con el catálogo
  en el cliente (duplica la regla, prohibido por FR-23).
- **D2 · Lectura con todos los ítems.** `LecturaDelChecklist` en `ok` gana `items: CompletenessItem[]` (todos, en el
  orden del servidor) y `catalogVersion`, además de `faltantes`; el panel sigue usando `faltantes`. Un solo hook y una
  sola lectura para panel y columna (≥2 consumidores). *Descartado:* un segundo hook calcado (conocimiento duplicado).
- **D3 · Acción por entidad, regla con nombre.** `accionDeFaltante(item): AccionDeFaltante` en
  `lib/evidence/faltantes.ts` → `{ tipo: 'biomarcador' | 'diagnostico' | 'atributo' | 'tratamiento', item }` según
  `destination.entity` (`Biomarker`, `Diagnosis`, `ClinicalAttribute`, `PriorTreatment`); ninguna devuelve
  «Cargar documento». Una entidad desconocida → sin acción (la fila se muestra igual). **Apertura de los formularios de
  US-111 (contrato de coordinación con `l1d-91`):** la acción es un enlace a `?item=<clave>` sobre la vista de caso
  (`hrefDeRegistroManual(patientId, item)`), que los diálogos de `l1d-91` leen para abrirse y prellenar (US-111 AC-2:
  `?item=ki67` → «Ki-67» seleccionado; `?item=grado` → foco en la gradación). Si `l1d-91` fija otro mecanismo al cerrar
  su design, este change lo adopta sin tocar la regla de `accionDeFaltante` (`l1d-91` D7 ya fija `?item=`).
- **D4 · Diálogos de US-094.** Para `ClinicalAttribute` la acción abre `DialogoAtributoClinico` con
  `claveInicial = item.item`. Supuesto verificado por test: en el catálogo, todo dato crítico con destino
  `ClinicalAttribute` tiene `attribute_key` igual a su `key` (hoy `estado_menopausico`). Para `PriorTreatment`, abre
  `DialogoTratamientoPrevio` sin prellenado. Se añaden a esos diálogos dos props opcionales (`claveInicial`,
  `alGuardar`), sin cambiar su comportamiento por defecto.
- **D5 · Relectura tras guardar.** Al `201` de cualquiera de los cuatro diálogos, la vista llama a `releer()` del
  checklist y a `recargar()` de `useVistaDeCaso`. `router.refresh()` (lo que prevé `l1d-80` D8) revalida el RSC pero
  **no** vuelve a pedir las lecturas cliente de la vista ni del checklist. **Decidido (usuario, 2026-11-03)
  `[S5 resp. 13]` (antes P2):** los cuatro diálogos (`l1d-80` y `l1d-91`) exponen el callback opcional `alGuardar`,
  que se llama tras el `201`; sin `alGuardar` conservan su comportamiento por defecto. *Descartado:* recargar la página
  entera (S5-02: «sin recargar») y depender solo de `router.refresh()`.
- **D6 · Origen de una sola fuente.** `presente_*` muestran `textoDeOrigen(provenance.entryMethod)` (`ficha.origen`):
  `seed` → «Carga inicial», `manual` → «Registro manual», `manual_correction` → «Corrección manual», `ocr` →
  «Documento» (`ficha.origen.ocr`, que cambia `l1d-76` D3, `[S5 resp. 11b]`). *Desviación de S5-02* («Semilla
  sintética»): el Gate 1 fijó «Carga inicial» (`[S5 resp. 11]`) y el literal tiene un solo dueño. Ningún componente usa `sourceDocumentId` ni `page` para armar URLs.
- **D7 · Estados en símbolo y palabra.** `presentarEstado(status)` → `{ simbolo, texto }`: ✓ «Presente y verificado»,
  ◐ «Presente sin verificar», ◌ «Faltante» (neutro), · «No aplica»; el símbolo con `aria-hidden`, la palabra en el
  árbol de accesibilidad. Un estado desconocido del contrato no puede llegar (enum); no se inventa respaldo.
- **D8 · Checklist no disponible.** **Decidido (usuario, 2026-11-03) `[S5 resp. 13]` (antes P3):** en la columna,
  `no_disponible` muestra «No se pudo calcular el checklist» (`datosCriticos.noCalculable`, texto de US-004 AC-5).
  `ChecklistNoDisponible` recibe el texto por prop (`mensaje`); el panel conserva el suyo («No se pudieron verificar
  los datos críticos», `faltantes.noVerificables`, US-005) sin cambiar sus tests. `cancerTypeEnabled = false` →
  `ScopeNotice` (`[S5 resp. 13]`).
- **D9 · Enlace del panel.** `enlaceDeRegistro(patientId, item)` pasa a devolver
  `hrefDeVistaDeCaso(patientId, 'datos-criticos')` para todo ítem; el texto pasa a «Ir a ‹etiqueta› en el caso
  clínico» (`faltantes.enElCaso` sustituye a `faltantes.enLaFicha`). `ANCLAS_DE_CASO = ['datos-criticos']` en
  `lib/ficha/anclas.ts` y `FocoPorAncla` recibe la lista de anclas permitidas por prop (la ficha pasa
  `ANCLAS_DE_FICHA`, la vista `ANCLAS_DE_CASO`); el encabezado `h2#datos-criticos` lleva `tabindex="-1"`.
  *Descartado:* enlazar con `?item=` para abrir el diálogo directamente desde el panel (salta la vista del estado del
  resto de faltantes y mueve el foco a un diálogo que el oncólogo no pidió).

## Privacidad y ownership

- Frontera: navegador → `web` (`GET /api/patients/{id}/completeness`, ya existente; los `POST` de registro son de
  `l1d-80` y `l1d-91`) → `clinical-api`. `web` no contacta a `rag-orchestrator` ni a `clinical-minio`;
  `rag-orchestrator` no toca datos clínicos (sin cambios).
- `CompletenessView` no trae identidad: solo claves y etiquetas del catálogo, estados y procedencia. La identidad del
  paciente no va en la URL (`?item=` lleva una **clave del catálogo**, nunca un valor clínico ni un nombre), ni en el
  estado cliente, ni en logs.
- RN-11 no aplica: nada sale hacia la IA. RN-12/13/14: solo datos sintéticos (FX-04-b F-M2, `test-1.0.0`); el ejemplo
  nuevo no lleva PII.

### Seguridad web

- Validación: la respuesta del checklist ya se valida con el Zod generado (`zCompletenessView`) en `leerChecklist`; el
  parámetro `?item=` se acepta solo si coincide con un `item` de la lectura vigente (lista cerrada; un valor ajeno se
  ignora), nunca se interpola en selectores ni HTML.
- Sin `NEXT_PUBLIC_` nuevas; sin módulos `server-only` nuevos (no hay Route Handler nuevo).
- Render: etiquetas del catálogo como texto de React; sin `dangerouslySetInnerHTML`. Sin texto del LLM ni del corpus.
- CSP y cabeceras: sin cambios. Dependencias nuevas: ninguna (el `Dialog` lo trae `l1d-80`/`l1d-91`).

## Componentes y patrones

Pantalla de referencia S5-02. Desviaciones registradas: lectura por `/completeness` (D1, aceptada por
`contract-keeper` en el Gate 1) y «Carga inicial» (D6, `[S5 resp. 11]`).

| Nivel | Componente | Concepto | Tipo |
|---|---|---|---|
| organism | `organisms/critical-data-checklist.tsx` | columna «Datos críticos»: cabecera, filas, nota, estados de lectura | sin estado (hijo de `VistaDeCaso`, cliente) |
| molecule | `molecules/fila-de-dato-critico.tsx` | una fila: etiqueta, estado (D7), origen (D6) o acción (D3) | sin estado |
| molecule | `molecules/accion-de-faltante.tsx` | enlace «Registrar a mano» / «Completar diagnóstico a mano» / «Agregar tratamiento previo» con la etiqueta en `sr-only` | sin estado |
| molecule existente | `ChecklistNoDisponible` (prop `mensaje`), `ScopeNotice`, `EnlaceDeRegistro` (texto nuevo), `FocoPorAncla` (prop `anclas`) | reutilizados | — |

- Cada componente con un concepto; alerta a 100 líneas, límite 150.
- **Sin patrón nuevo:** se reutiliza `useChecklistDeFaltantes` (ya con 1 consumidor; ahora 2) y `useVistaDeCaso`. La
  vista (`VistaDeCaso`, único `'use client'` de `l1d-76`) monta el hook del checklist y pasa `lectura` a la columna; los
  diálogos se montan donde los dejen `l1d-80`/`l1d-91`, controlados por `?item=` (D3). Sin provider ni compound
  components (sin prop drilling ≥ 3).
- Lógica pura en `lib/evidence/faltantes.ts`: `accionDeFaltante()` (D3), `presentarEstado()` (D7), `contarFaltantes()`
  si no basta `faltantes.length`; en `lib/ficha/anclas.ts`: `ANCLAS_DE_CASO`, `hrefDeVistaDeCaso(id, ancla?)` (amplía la
  firma que crea `l1d-76`) y `hrefDeRegistroManual(id, item)`.

## Contratos

Proveedor: `clinical-api`; consumidor: `web` (cliente y Zod generados: `getPatientCompleteness`, `zCompletenessView`,
ya en uso). **Sin diff en `apps/clinical-api/openapi.yaml`**; `oasdiff` no aplica; ADR-26 intacto.

Ejemplos (contract-first de los mocks, US-213):

- **Nuevo** `contracts/examples/completeness-f-m2-ki67-registrado.json`: igual a `completeness-f-m2.json` con `ki67`
  en `presente_verificado`, `origin = manual`, `provenance = { entryMethod: manual, reviewStatus: verificado,
  sourceDocumentId: null }` (cinco faltantes). Entrada en `contracts/examples/index.json` →
  `#/paths/~1platform~1patients~1{patientId}~1completeness/get/responses/200`. `contracts:check` lo valida.
- Reutilizados: `completeness-f-m2.json`, `completeness-f-m1.json`, `completeness-tipo-no-habilitado.json`,
  `error-interno.json`, `case-view-p-caso.json` (lo publica `l1d-74`, proveedor).

## Dependencias y colaboradores

- `lib/evidence/faltantes.ts` (modificado): `lecturaDeLaVista` conserva todos los ítems (D2); `enlaceDeRegistro` apunta
  a la vista de caso (D9); nuevas `accionDeFaltante`, `presentarEstado`. Sin E/S.
- `lib/ficha/anclas.ts` (modificado): `ANCLAS_DE_CASO`, `hrefDeVistaDeCaso(id, ancla?)`, `hrefDeRegistroManual`.
- `components/molecules/foco-por-ancla.tsx` (modificado): lista de anclas por prop; la ficha pasa `ANCLAS_DE_FICHA`.
- `components/molecules/enlace-de-registro.tsx` (modificado): texto «en el caso clínico».
- `components/organisms/vista-de-caso.tsx` (de `l1d-76`, modificado): monta `useChecklistDeFaltantes`, la columna en el
  hueco `datosCriticos`, `FocoPorAncla anclas={ANCLAS_DE_CASO}` y el `alGuardar` → `releer()` + `recargar()` (D5).
- Diálogos de `l1d-80` (props opcionales `claveInicial`, `alGuardar`) y de `l1d-91` (`alGuardar`, `?item=`).
- `messages/es.json` (modificado): `datosCriticos.*` (con `datosCriticos.noCalculable` = «No se pudo calcular el
  checklist») y `faltantes.enElCaso` = «Ir a ‹etiqueta› en el caso clínico»; sin duplicar `ficha.origen`.
- Fakes: ninguno nuevo de puerto. MSW en `/api/*` desde `contracts/examples/` (`onUnhandledRequest: 'error'`).

## Tests

- Unitarios (Vitest): `accionDeFaltante` por cada entidad (ninguna «Cargar documento»), `presentarEstado`,
  `hrefDeRegistroManual`/`hrefDeVistaDeCaso` (precondición UUID), `lecturaDeLaVista` con `items` completos, y el test de
  catálogo de D4 (`datos-criticos.json` de mama, próstata y `test-1.0.0`).
- UI (Testing Library + MSW): AC-1…AC-6 sobre `completeness-f-m2.json`, con la relectura de AC-3 sobre el ejemplo nuevo;
  panel: el enlace va a `/pacientes/{id}/caso#datos-criticos` (tests de US-005 actualizados al requisito nuevo).
- E2E Playwright contra Compose (perfil de test: FX-04-b y `test-1.0.0` en ambos backends, LLM fingido): AC-1, AC-3
  (Ki-67 registrado → la fila deja de ser «Faltante»), AC-5 (`page.route` sobre `/api/patients/*/completeness` con
  `500`), AC-6 (teclado) y el enlace del panel con foco en `#datos-criticos`; `e2e/aviso-faltantes.spec.ts` actualizado.
- `visual-check` a 375 y 1280 px.

## Riesgos

- **Orden de merge** con `l1d-76`, `l1d-80` y `l1d-91` (tres bloqueantes de la misma oleada O3). Mitigación: los tests
  de la columna con MSW pueden escribirse antes; el montaje y el E2E esperan a los tres.
- **Cambio de un AC ya mergeado (US-005 AC-3 y AC-7):** los tests del panel cambian su `href` esperado por el requisito
  nuevo; si alguno se elimina en lugar de actualizarse, el commit lleva `Test-Removal:` (lo revisa el Gate 2).
- **Supuesto D4** (`attribute_key == key`): si un ítem futuro lo rompe, el test de catálogo falla antes que la UI.

## Pendiente de definir

Nada. P1 (apertura de los formularios de US-111) quedó fijado por `l1d-91` D7 (`?item=<clave>`, el mecanismo que
propone D3); P2 (callback `alGuardar`) en D5 y P3 (literal del checklist caído) en D8, ambos `[S5 resp. 13]`.
