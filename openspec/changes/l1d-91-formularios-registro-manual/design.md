# Design — l1d-91-formularios-registro-manual

## Contexto

`l1d-90` implementa `POST …/biomarkers` y `POST …/diagnoses` (congelados en US-033 AC-10) y añade `escalas.json` al
catálogo. `l1d-76` crea la página `/pacientes/[id]/caso` con `useVistaDeCaso(patientId).recargar()` y lee la ficha en el
RSC (`obtenerFicha`), que trae `PatientSummary.diagnosis` (un `Diagnosis` completo o `null`). En `apps/web` ya existen
el patrón de Route Handler con `Origin`, tope de cuerpo y `5xx` saneado (`lib/server/evidence-analyses.ts`,
`lib/server/completeness.ts`), los textos de origen (`ficha.origen.manual` = «Registro manual»,
`manual_correction` = «Corrección manual») y `@radix-ui/react-label`; no existe `components/ui/dialog.tsx`.

Pantalla de referencia: `docs/ux/S5/pantallas-s5.md` **S5-03 a y b** (diálogo modal accesible, foco atrapado, `Esc`,
retorno al disparador; «Completar diagnóstico a mano»; aviso de corrección; `grade` derivado nunca editable;
gradación estructurada) y **S5-02** (acción por `destination.entity`, prellenado con `?item=`). Decisiones respetadas:
**D-1** (vista de caso mínima: los formularios se abren desde ella y desde la ficha) y **D-7** (sin «Cargar
documento»: `Biomarker` y `Diagnosis` → US-111).

## Decisiones

- **D1 · Opciones del formulario desde `clinical-api` (caro de revertir: contrato).** Nueva lectura
  `GET /platform/patients/{patientId}/manual-entry-options` → `ManualEntryOptions` con los valores del catálogo para el
  tipo de cáncer del diagnóstico vigente (o de todos los habilitados si no hay vigente): términos de biomarcador,
  sistemas de estadificación, escalas con rango, sistemas de gradación, tipos de cáncer habilitados y el destino de
  cada ítem crítico (para resolver `?item=`). Se calcula con una función pura `opcionesDeRegistroManual(catalogo,
  tipoDeCancer)` en `manual-entry.reglas.ts` sobre `datos-criticos.json` (nombres `destination.match.name`),
  `codigos.json` (LOINC) y `escalas.json` (`l1d-90`).
  *Alternativas:* **A · lectura por paciente (elegida):** el cliente no necesita saber el tipo de cáncer, mismo patrón
  que `listClinicalAttributes` de `l1d-80`, una sola lectura por diálogo; **B · `GET /platform/catalog/terms?entity=&
  cancerType=` genérico:** más superficie y el cliente decide el tipo de cáncer (YAGNI); **C · `web` lee el catálogo
  montado:** duplica al dueño de la normalización (ADR-33) y abre un desfase de versión entre `web` y `clinical-api`.
- **D2 · `field` opcional en los `422` de registro manual (caro de revertir: contrato).** AC-4 pide el mensaje junto al
  campo. La propiedad la introduce `l1d-80` en `ErrorRegistroManualInvalido` / `ErrorDiagnosticoInvalido` (y en
  `ErrorRegistroClinicoInvalido`): **opcional, `type: string`, sin enum, misma descripción** (decidido, `[S5 resp. 10]`).
  Este change no la redefine; `clinical-api` la rellena en
  `manual-entry` (primera ruta del error de Zod; el campo validado contra el catálogo; `grading` en
  `GRADACION_INCOHERENTE`; ausente en `PACIENTE_EGRESADO`, que va arriba del formulario).
  *Alternativas:* **A · `field` aditivo (elegida);** **B · mapear por código en el cliente:** `VALOR_FUERA_DE_CATALOGO`
  puede venir de tres campos y no sabría cuál; **C · leer `message`:** acopla la UI a un texto.
- **D3 · Validación en el cliente con el Zod generado.** `zBiomarkerManualCreate` y `zDiagnosisManualCreate`
  (`packages/api-contracts`) más los rangos de `ManualEntryOptions` validan antes de enviar; el servidor sigue siendo la
  autoridad y su `422` se pinta igual (D2). Nada se guarda si hay error.
- **D4 · Diagnóstico: solo se envían los campos cambiados.** `cambiosDelDiagnostico(vigente, formulario)` (pura) arma
  el cuerpo con lo que difiere del vigente; sin cambios, «Guardar» queda deshabilitado con «No hay cambios que
  guardar» (el contrato exige `minProperties: 1`). Sin vigente, exige tipo de cáncer, sistema y valor de estadio y
  fecha (US-110 AC-6) y no muestra el aviso de corrección.
- **D5 · `grade` derivado, nunca editable ni calculado en el cliente.** El diálogo muestra el `grade` vigente como texto
  de solo lectura («Grado (derivado de la gradación)») y la gradación como campos estructurados según
  `gradingSystems` de las opciones (mama → `nottingham` 1–3; próstata → patrones 3–5, espécimen, alcance). El texto
  nuevo lo muestra la ficha con el `Diagnosis` devuelto. La derivación vive solo en `clinical-api` (`textoDeGrado`,
  `l1d-90`): sin vista previa en el cliente (una regla, un dueño).
- **D6 · Autocompletado con `<input list>` + `<datalist>` nativo.** Admite texto libre (un término fuera del catálogo
  llega como `no_mapeado`, RN-27), etiqueta asociada y sin dependencia nueva. Si la respuesta `201` trae
  `mappingStatus = no_mapeado`, el diálogo no se cierra: muestra «Sin código en el catálogo versionado: queda como no
  mapeado; nunca se inventa un código.» con «Cerrar» (lo decide el servidor, no una predicción del cliente).
  *Descartados:* `Command` de shadcn (dependencia `cmdk`) y un combobox propio (más código sin evidencia).
- **D7 · Apertura por URL `?item=<clave>`.** En la vista de caso y en la ficha, `item` se resuelve con
  `criticalItems` de las opciones: destino `Biomarker` → abre (a) con `name` = término del ítem; `Diagnosis` → abre (b)
  con el foco en el campo de destino (`histology`, `stage_value`, `grade` → gradación, `performance_value`). Clave
  desconocida o de otra entidad → no se abre nada (lo ampliará `l1d-80`/`l1d-96`). Al cerrar, `router.replace` quita
  `item` de la URL y el foco va al encabezado de la sección. `hrefDeRegistroManual(patientId, item, pagina)` en
  `lib/registro-manual/enlaces.ts` (precondición UUID, mismo estilo que `hrefDeFicha`) es el único constructor del
  enlace. *Descartado:* ruta propia del formulario (saca al oncólogo del caso).
- **D8 · Refresco tras guardar.** El diálogo recibe `alGuardar()`; en la vista de caso llama a `recargar()` de
  `useVistaDeCaso` y `router.refresh()` (barra y ficha RSC); en la ficha, `router.refresh()`. Sin recargar la página.
- **D9 · Errores no de campo.** `401` → `router.replace(RUTA_LOGIN_EXPIRADA)`; `403` → «No tienes permiso para registrar
  datos clínicos.»; `404` → «Paciente no encontrado»; `422 PACIENTE_EGRESADO` → aviso arriba del formulario; `5xx` o red
  → «No se pudo guardar. Inténtalo de nuevo.» sin cerrar el diálogo ni perder lo escrito. Las opciones que no cargan
  (`5xx`) dejan el formulario usable sin autocompletado y con aviso.

- **D10 · Paridad de `criticalItems` con el checklist.** `criticalItems` se calcula con el **mismo lector** de
  `datos-criticos.json` que produce `CompletenessItem.destination` en `GET …/completeness` (sin segundo parser). Un test
  de integración compara, para F-M2 y el paciente de próstata, cada ítem de `criticalItems` (`item`, `entity`, `field`,
  `term`) con el `destination` del ítem homónimo del checklist; si divergen, un faltante abriría el formulario
  equivocado.
## Privacidad y ownership

- Frontera: navegador → `web` (`/api/patients/{id}/…`, cookie de sesión opaca) → `clinical-api`. `web` no contacta a
  `rag-orchestrator` ni a `clinical-minio`; `rag-orchestrator` no toca datos clínicos y no cambia.
- Los cuerpos llevan datos clínicos (biomarcador, valor, histología, estadio), nunca identidad (RN-10). El nombre del
  biomarcador y el `item` del catálogo no son PII; aun así nada clínico va en la URL salvo la clave de catálogo `item`
  (sin valores del paciente). La barra del paciente sigue pintándose en el RSC con `obtenerFicha`.
- RN-11 no aplica: nada sale hacia la IA en este change. El dato manual entra al contexto del análisis por las lecturas
  ya existentes, que desidentifican.
- Logs del BFF: evento (`registro-manual.proxy`, `registro-manual.opciones`), estado, `traceId` y duración; nunca el id
  del paciente, el cuerpo ni el `message` del proveedor. Logs de `clinical-api`: los de `l1d-90`, sin el valor.
- `admin` no ve los botones (sin `clinical:write`) y el proveedor responde `403` igualmente (mínimo privilegio, E-04).
- RN-12/13/14: solo datos sintéticos (F-M2, paciente de próstata de FX-03b-a) en tests, ejemplos y `visual-check`.

### Seguridad web

- Validación: Zod **generado** del spec compartido en cliente (D3) y servidor (`zCreateManualBiomarkerPath`, cuerpo).
- Sin variables `NEXT_PUBLIC_` nuevas. `lib/server/registro-manual.ts` y los Route Handlers importan `server-only`.
- CSRF: los `POST` verifican `Origin` (cookie `SameSite=Strict`), como `evidence-analyses`; el `GET` de opciones no.
- Render: todo valor (término, histología) como texto de React; sin `dangerouslySetInnerHTML`. El `message` del
  proveedor no se muestra: la UI usa su texto propio por código y campo. Sin texto del LLM ni del corpus.
- CSP y cabeceras: sin cambios (mismo origen). Respuestas del BFF con `Cache-Control: no-store`.
- Dependencias: `@radix-ui/react-dialog` vía `Dialog` de shadcn/ui, la añade `l1d-80` (o este change si llega antes,
  con `npm audit` sin altas ni críticas en el PR). Ninguna otra.

## Componentes y patrones

Pantalla de referencia S5-03 a y b; sin desviaciones (el `grade` derivado se muestra como el vigente, D5).

| Nivel | Componente | Concepto | Tipo |
|---|---|---|---|
| ui | `components/ui/dialog.tsx` | `Dialog` de shadcn/ui (de `l1d-80` o de aquí) | cliente (Radix) |
| organism | `organisms/dialogo-registro-biomarcador.tsx` | S5-03 a | `'use client'` |
| organism | `organisms/dialogo-completar-diagnostico.tsx` | S5-03 b (campos comunes) | `'use client'` |
| molecule | `molecules/campos-de-gradacion.tsx` | gradación `nottingham` / `gleason_isup` | sin estado propio |
| molecule | `molecules/campo-con-error.tsx` | `Label` + control + error con `id` para `aria-describedby` | sin estado |
| molecule | `molecules/anuncio-de-errores.tsx` | región `aria-live="polite"` con el resumen de errores | sin estado |
| molecule | `molecules/acciones-de-registro-manual.tsx` | botones «Registrar biomarcador» / «Completar diagnóstico a mano» + apertura por `?item=` | `'use client'` (isla que monta los diálogos) |

- Las páginas (ficha y vista de caso) siguen siendo RSC; la isla cliente `AccionesDeRegistroManual` recibe
  `patientId`, `diagnosticoVigente` (de `obtenerFicha`) y `alGuardar`. En la vista de caso se monta dentro de
  `VistaDeCaso` (ya cliente) para tener `recargar()`.
- **Custom hook `useEnvioRegistroManual(operacion)`** (`lib/registro-manual/use-envio-registro-manual.ts`):
  `{ enviar, enviando, erroresPorCampo, errorGeneral }`. Evidencia: dos consumidores en este change (los dos diálogos)
  y `l1d-80` puede reutilizarlo. **Hook `useOpcionesDeRegistroManual(patientId)`**: dos consumidores (los dos
  diálogos). Sin provider ni compound components (sin prop drilling ≥ 3).
- Lógica pura en `lib/registro-manual/`: `cambiosDelDiagnostico()`, `erroresDelServidor(respuesta)` (`field` →
  error de campo; sin `field` → general), `resolverItem(opciones, item)`, `hrefDeRegistroManual()`.
- Cada componente con un concepto; alerta a 100 líneas, límite 150.

## Contratos

Proveedor: `clinical-api`. Consumidor: `web` (cliente y Zod generados en `packages/api-contracts`). Cambio **aditivo**
(una operación y un schema; `field` ya lo declaró `l1d-80`): `contracts:breaking` = 0. `info.version` 1.19.0 →
**1.20.0** (cadena: `l1d-74` 1.17.0 → `l1d-80` 1.18.0 → `l1d-309` 1.19.0 → `l1d-91` 1.20.0; quien rebase renumera y
regenera `packages/api-contracts`).

```yaml
paths:
  /platform/patients/{patientId}/manual-entry-options:
    get:
      operationId: getManualEntryOptions
      tags: [registro-manual]
      summary: Valores del catálogo para los formularios de registro manual
      x-permission: clinical:read
      parameters: [{ $ref: '#/components/parameters/PatientId' }]
      responses:
        "200": { content: { application/json: { schema: { $ref: '#/components/schemas/ManualEntryOptions' } } } }
        "401": { $ref: '#/components/responses/NoAutenticado' }
        "403": { $ref: '#/components/responses/PermisoDenegado' }
        "404": { $ref: '#/components/responses/NoEncontrado' }
        "500": { $ref: '#/components/responses/ErrorInterno' }
components:
  schemas:
    ManualEntryOptions:
      type: object
      additionalProperties: false
      required: [catalogVersion, cancerType, enabledCancerTypes, biomarkerTerms, stagingSystems,
                 performanceScales, gradingSystems, criticalItems]
      properties:
        catalogVersion: { type: string }
        cancerType: { type: [string, "null"], description: Tipo de cáncer del diagnóstico vigente; null sin vigente. }
        enabledCancerTypes: { type: array, items: { type: string } }
        biomarkerTerms:
          type: array
          items:
            type: object
            additionalProperties: false
            required: [term, label]
            properties: { term: { type: string }, label: { type: string } }
        stagingSystems: { type: array, items: { type: string } }
        performanceScales:
          type: array
          items:
            type: object
            additionalProperties: false
            required: [code, minimum, maximum]
            properties: { code: { type: string }, minimum: { type: integer }, maximum: { type: integer } }
        gradingSystems: { type: array, items: { type: string, enum: [nottingham, gleason_isup] } }
        criticalItems:
          type: array
          description: Destino de cada ítem crítico del catálogo, para abrir el formulario desde un faltante.
          items:
            type: object
            additionalProperties: false
            required: [item, entity, field, term]
            properties:
              item: { type: string }
              entity: { type: string, enum: [Diagnosis, Biomarker, ClinicalAttribute, PriorTreatment] }
              field: { type: [string, "null"] }
              term: { type: [string, "null"], description: Término del biomarcador (match.name) si entity es Biomarker. }
    # ErrorRegistroManualInvalido / ErrorDiagnosticoInvalido: sin cambio aquí; `field` (opcional, string, sin enum)
    # lo introduce l1d-80 [S5 resp. 10]. Valores que rellena este change: name, value, unit, resultType, performedAt;
    # cancerType, histology, stagingSystem, stageValue, performanceScale, performanceValue, diagnosedAt, grading.
```

Ejemplos nuevos (registrados en `contracts/examples/index.json`): `manual-entry-options-mama.json` (F-M2, catálogo de
test: Ki-67, RE, RP, HER2, `TNM_8`, `ECOG` 0–5, `nottingham`, ítems `ki67` → Biomarker y `grado` → Diagnosis),
`manual-entry-options-prostata.json` (`gleason_isup`), `manual-entry-options-sin-diagnostico.json` (`cancerType =
null`), `error-valor-fuera-de-catalogo-campo.json` (`field = performanceValue`) y
`error-gradacion-incoherente-campo.json` (`field = grading`). Los ejemplos existentes de `l1d-90`
(`biomarker-manual.json`, `diagnosis-manual-nottingham.json`, …) siguen válidos (`field` es opcional). Reutilizados en
los `4xx/5xx` de la operación nueva: `error-no-autenticado`, `error-permiso-denegado`, `error-no-encontrado`,
`error-interno`. Zod y cliente TS se **generan** (`contracts:generate`), nunca a mano. Los handlers de MSW de los tests
de `web` salen de estos ejemplos (US-213).

## Dependencias y colaboradores

- **Modificado** `apps/clinical-api/src/modules/manual-entry/` (`l1d-90`): ruta `GET …/manual-entry-options` en el
  controller (`authorize('clinical:read')`), método `opciones(patientId)` en el service (puertos `CatalogoDeEscalas` de
  `l1d-90` y el lector de `datos-criticos`/`codigos` ya existente del checklist, inyectados por la *factory*), y el
  mapeo de errores que rellena `field`. Reglas extraídas: `opcionesDeRegistroManual()` y `campoDelError()`.
- **Nuevo** `apps/web/app/api/patients/[id]/{biomarkers,diagnoses,manual-entry-options}/route.ts` sobre
  `lib/server/registro-manual.ts` (compartido con `l1d-80`): `crearManejadorRegistroManual({ operacion })` y
  `crearManejadorOpcionesDeRegistro()`, con las dependencias de `lib/server/dependencias.ts` (SDK generado, reloj,
  `traceId`).
- **Nuevo** `apps/web/lib/registro-manual/` (hooks y funciones puras de D3–D8) y los componentes de la tabla anterior.
- **Modificado** `organisms/vista-de-caso.tsx` (`l1d-76`: monta la isla en la sección de biomarcadores),
  `organisms/ficha-del-doctor.tsx` (botones en diagnóstico y biomarcadores), `messages/es.json` (`registroManual.*`).
- **Fakes:** ninguno nuevo. Integración de `clinical-api` con PostgreSQL real y el catálogo de test; en `web`, MSW
  hacia `clinical-api` desde `contracts/examples/` (borde HTTP).
- **Una regla, un dueño:** antes del PR, `grep -rn "Nottingham grado\|ISUP\|no_mapeado" apps/web/lib apps/web/components`
  (ninguna derivación de `grade` ni decisión de mapeo en `web`) y `grep -rn "match.name\|datos-criticos"
  apps/clinical-api/src` (reutilizar el lector del checklist, no un segundo parser).

## Tests

- `clinical-api` (TDD estricto, integración Supertest + PostgreSQL de test + catálogo `test-s2-1.0.0`, verificación del
  proveedor): opciones de mama, próstata y sin diagnóstico; `401/403/404`; `field` en los `422` de ambos `POST`;
  paridad `criticalItems` ↔ `CompletenessItem.destination` (D10).
  Unitarios de `opcionesDeRegistroManual()` y `campoDelError()`.
- BFF (test del AC primero, Vitest + MSW): `201`, `422` con `field` retransmitido, `403` por `Origin` ajeno, `5xx`
  saneado, tope de cuerpo.
- UI (test del AC primero, Vitest + Testing Library + MSW): AC-1…AC-5. Unitarios de `cambiosDelDiagnostico()`,
  `erroresDelServidor()`, `resolverItem()`, `hrefDeRegistroManual()`.
- E2E (Playwright contra Compose con seed sintético): AC-1 y AC-2 de punta a punta (la historia los pide E2E), con la
  aserción de que solo hay peticiones a `/api/*` del mismo origen.

## Riesgos

- Estimación: la historia (3 pts) suponía «endpoints existentes»; la lectura de opciones y el relleno de `field`
  añaden trabajo en `clinical-api` (US-111 sigue en 3, `[S5 resp. 14]`).
- En la demo, con el catálogo real 1.3.0+ (subconjunto LOINC de `l1d-90`, `[S5 resp. 9]`), Ki-67 manual sale
  `mapeado`; un término fuera del subconjunto sigue `no_mapeado` (RN-27). AC-1 se verifica con el catálogo de test.

## Decisiones del Gate 1 (usuario, 2026-11-03)

- **P-1 → resuelto:** el AC-3 del Markdown de US-111 está desfasado; manda este design (aviso «Guardar registra tu
  corrección manual; el diagnóstico vigente pasa a histórico.» y gradación estructurada con `grade` derivado,
  `[Pre-S1 resp. 18]`). El AC del backlog y de Linear se actualiza aparte.
- **P-2 → decidido `[S5 resp. 10]`:** contrato aditivo de D1; `field` lo introduce `l1d-80` (opcional, string, sin enum).
- **P-3 → decidido `[S5 resp. 10]`:** `field` en todos los `422` de campo; ausente en `PACIENTE_EGRESADO`.
- Los supuestos marcados antes como «(asumido)» quedan decididos `[S5 resp. 13]`.
