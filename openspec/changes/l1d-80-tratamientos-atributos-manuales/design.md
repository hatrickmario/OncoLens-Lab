# Design — l1d-80-tratamientos-atributos-manuales

## Contexto

El esquema ya tiene `clinical.prior_treatment` y `clinical.clinical_attribute` con procedencia (`entry_method`,
`extraction_confidence`, `review_status`) y `mapping_status NOT NULL` en `prior_treatment`: **no hay migración**.
Faltan los endpoints (S5-refinamiento §Contratos y `docs/ux/S5/pantallas-s5.md`, tabla «Dato del contrato»), la
lista de valores de cada atributo en el catálogo (`atributos.json` solo declara claves, etiquetas y tipos de cáncer)
y los diálogos S5-03 c y d. La normalización final es de `ReconciliationService` (`l1d-84`, ADR-33).

## Decisiones

- **D1 · Dos módulos, una guarda común.** `prior-treatments` y `clinical-attributes` (Controller → Service →
  Repository). La regla de RN-17 (`exigirPacienteQueAdmiteRegistros()`) y el bloqueo del paciente ya viven en
  `src/modules/compartido/paciente-activo.ts` (L1D-90/309) y se reutilizan; el episodio del registro y el tipo de
  cáncer del diagnóstico vigente se leen una sola vez en `compartido/contexto-de-registro.ts`, y la traducción HTTP
  común de los dos `POST` en `compartido/registro-http.ts` (implementado así en L1D-80). *Descartado:* comprobar
  RN-17 en cada controller (dos dueños de la regla).
- **D2 · Orden de comprobaciones** (una sola vez cada una): sesión (`401`) → RBAC (`403`, `admin` no tiene
  `clinical:write` ni `clinical:read`) → `patientId` UUID y paciente existente (`404`, sin distinguir mal formado) →
  cuerpo Zod (`422 CUERPO_INVALIDO`) → paciente egresado (`422 PACIENTE_EGRESADO`) → catálogo
  (`422 VALOR_FUERA_DE_CATALOGO` / `TIPO_CANCER_NO_REGISTRADO`) → escritura en una transacción. Ningún `4xx` crea filas.
- **D3 · Tratamiento previo.** El service arma la `PropuestaDeNormalizacion` (`entidad = PriorTreatment`,
  `tipoDeCancer` del diagnóstico vigente, `textoOriginal = regimenName`, sin `codigoPropuesto`) y guarda `atcCodes`
  y `mappingStatus` de la decisión; `regimenName` se conserva tal como llegó. Sin diagnóstico vigente el tipo de
  cáncer es desconocido: el dato **se guarda** con `no_mapeado` (RN-27: nunca se descarta; RN-26: no bloquea)
  (decidido, `[S5 resp. 13]`). `ongoing = true` exige `endedAt` y `endReason` ausentes y guarda
  `end_reason = desconocido` (la columna es `NOT NULL`; decidido, `[S5 resp. 13]`). `ongoing = false` exige `endReason`. `endedAt < startedAt` → `422`.
- **D4 · Atributo clínico (RN-29).** `attributeKey` debe estar declarada en `atributos.json` para el tipo de cáncer
  del diagnóstico vigente y `value` en su lista `values`. Sin diagnóstico vigente → `422 TIPO_CANCER_NO_REGISTRADO`
  (no se puede validar contra el catálogo). Con `observedAt` → `date_precision = dia`; sin él → `incierta` y
  `observedAt = null`. Un segundo registro de la misma clave es una fila nueva (serie por fecha), no una corrección.
- **D5 · `GET …/clinical-attributes` devuelve también los permitidos.** `ClinicalAttributeList =
  { items, allowedAttributes, catalogVersion }`: `items` vigentes ordenados por clave y `observedAt` (nulos al final),
  y `allowedAttributes` (clave, etiqueta, valores) del tipo de cáncer del paciente. Así el diálogo S5-03 c lista
  «solo los del catálogo» sin que `web` monte el catálogo. *Descartado:* endpoint de catálogo aparte (más superficie
  sin segundo consumidor) y listas en el código de `web` (dos fuentes de RN-29).
- **D6 · `setting` como enum del contrato** (columna `text`): `neoadyuvante`, `adyuvante`,
  `primera_linea_metastasica`, `segunda_linea_metastasica`, `linea_posterior_metastasica`, `otro`, `desconocido`
  (data-model §`prior_treatment`; decidido, `[S5 resp. 13]`). El valor sembrado `primera_linea_metastasica` está incluido.
- **D7 · Valores de atributos en el catálogo.** `atributos.schema.json` acepta `values: [{ value, label: { es, en? } }]`
  (opcional en el schema para no romper los fixtures existentes; `catalog:validate` exige `values` no vacío en el
  catálogo real). `atributos.json` 1.1.0 → 1.2.0 y `manifest.json` 1.3.0 (de `l1d-90`) → **1.4.0**, junto con D9.
  Valores (decididos, `[S5 resp. 13]`, con «sensible a la castración» = `sensible_castracion`, que usa `l1d-310`):
  `estado_menopausico` = `premenopausica | perimenopausica | posmenopausica | desconocido`;
  `estado_castracion` = `castrado | no_castrado | sensible_castracion | resistente_castracion | desconocido`;
  `sitios_metastasicos` = `oseo | ganglionar | hepatico | pulmonar | cerebral | otro`. Los valores del seed y de
  FX-02b-a (`posmenopausica`, `castrado`, `oseo`) deben estar en la lista (test).
- **D8 · UI.** Diálogos en `organisms/` de la vista de caso; al `201` llaman a `router.refresh()` (revalidación del
  RSC) y la fila aparece sin recarga completa (AC-6). Errores `422` se pintan junto al campo que indica `field` (D10),
  o arriba del formulario sin `field`, con `aria-live`.
- **D9 · Subconjunto de ATC (`[S5 resp. 9]`, DEC-04).** Entradas `estandar = atc` en `mama/codigos.json` y
  `prostata/codigos.json` para los fármacos del seed sintético y de la demo: `L02AE02` (leuprorelina), `L02BB03`
  (bicalutamida), trastuzumab, pertuzumab, trastuzumab emtansina (T-DM1) y los demás que use el seed. `nombreOficial`
  = nombre inglés del índice ATC/DDD **literal**; `etiquetaEs` = DCI en español (campo propio); `versionFuente` = año
  del ATC/DDD Index; **sin DDD**; sinónimos ES/EN (nombres comerciales no) en `sinonimos.json`. Cada código se comprueba
  en atcddd.fhi.no antes de versionarlo (nunca de memoria). `NOTICE-atc.txt` ya lleva el aviso literal de WHOCC.
  `manifest.json` → 1.4.0, el mismo en `clinical-api` y `rag-orchestrator` (sin `409`).
- **D10 · `field` en los `422` (`[S5 resp. 10]`).** Propiedad **opcional**, `type: string`, **sin enum**, con la misma
  descripción en `ErrorRegistroClinicoInvalido` (nuevo) y en los existentes `ErrorRegistroManualInvalido` y
  `ErrorDiagnosticoInvalido` (aditivo, `contracts:breaking` = 0). Este change la introduce porque sale antes (1.19.0);
  `l1d-90` y `l1d-91` la usan igual y `l1d-309` la replica en `ErrorCorreccionInvalida`. Aquí se rellena con la
  propiedad del cuerpo causante (`attributeKey`, `value`, `regimenName`, `endedAt`, …; primera ruta del error de Zod),
  nunca con su valor, y se omite en `PACIENTE_EGRESADO` y `TIPO_CANCER_NO_REGISTRADO`. *Descartado:* enum por
  operación (acopla cada schema de error a su cuerpo y obliga a cambiar el contrato con cada campo nuevo).
- Recomendación única salvo D5/D7 (contrato y catálogo: caros de revertir, pero ya fijados por la tabla del UX y la
  regla «valores del catálogo» de la historia; las descartadas se anotan en una línea).

## Privacidad y ownership

- Fronteras: navegador → `web` (Route Handler, cookie de sesión) → `clinical-api`. Nada llega a `rag-orchestrator`;
  el análisis posterior lee estos datos por el constructor de contexto existente, que ya desidentifica (RN-11).
- Sin identidad: los cuerpos no llevan nombre ni documento; `regimenName` y `value` son datos clínicos (no
  identidad). Ninguno de los dos va a *logs*: el log de la operación lleva `traceId`, UUID del paciente, código de
  error y `mappingStatus`, nunca el texto (test de no-fuga).
- `rag-orchestrator` no toca datos clínicos ni `clinical-minio`; no cambia.
- Solo datos sintéticos (P-CASO / FX-02b-a, seed `sintetico`).
- **Seguridad web:** validación con el schema Zod **generado** del spec, compartido en cliente y servidor; el Route
  Handler es `server-only`, reenvía la cookie y verifica `Origin` (CSRF) como los existentes; sin variables
  `NEXT_PUBLIC_` nuevas; los valores se renderizan como texto de React (sin HTML crudo); sin cambio de CSP ni
  cabeceras. Dependencia posible: `Dialog` de shadcn/ui (Radix), si aún no está en `main`; se audita con `npm audit`
  en el PR.

## Contratos

Proveedor: `clinical-api`. Consumidor: `web` (cliente/Zod generados en `packages/api-contracts`). Cambio
**aditivo** (tres operaciones y seis schemas nuevos; los dos schemas de error existentes solo ganan `field` opcional):
`contracts:breaking` = 0 incompatibles, compatible con ADR-26. `info.version` 1.18.0 → **1.19.0** (cadena del S5:
`l1d-74` 1.17.0 → `l1d-309` 1.18.0 → `l1d-80` 1.19.0 → `l1d-91` 1.20.0; quien rebase renumera y regenera
`packages/api-contracts`).

```yaml
paths:
  /platform/patients/{patientId}/prior-treatments:
    post:
      operationId: createManualPriorTreatment
      tags: [registro-manual]
      summary: Registra a mano una línea de tratamiento previa
      description: >-
        entry_method = manual, extraction_confidence = n_a, review_status = verificado. Backend 1
        decide atcCodes y mappingStatus con el catálogo (ADR-33); sin mapeo, no_mapeado (RN-27).
        Exige un paciente activo (RN-17).
      x-permission: clinical:write
      parameters: [{ $ref: '#/components/parameters/PatientId' }]
      requestBody:
        required: true
        content: { application/json: { schema: { $ref: '#/components/schemas/PriorTreatmentManualCreate' } } }
      responses:
        "201": { content: { application/json: { schema: { $ref: '#/components/schemas/PriorTreatment' } } } }
        "401": { $ref: '#/components/responses/NoAutenticado' }
        "403": { $ref: '#/components/responses/PermisoDenegado' }
        "404": { $ref: '#/components/responses/NoEncontrado' }
        "422": { content: { application/json: { schema: { $ref: '#/components/schemas/ErrorRegistroClinicoInvalido' } } } }
        "500": { $ref: '#/components/responses/ErrorInterno' }
  /platform/patients/{patientId}/clinical-attributes:
    get:
      operationId: listClinicalAttributes
      tags: [pacientes]
      x-permission: clinical:read
      responses:
        "200": { content: { application/json: { schema: { $ref: '#/components/schemas/ClinicalAttributeList' } } } }
        "401" / "403" / "404" / "500": como arriba
    post:
      operationId: createManualClinicalAttribute
      tags: [registro-manual]
      x-permission: clinical:write
      requestBody: { $ref ClinicalAttributeManualCreate }
      responses: { "201": ClinicalAttribute, "401", "403", "404", "422": ErrorRegistroClinicoInvalido, "500" }

components:
  schemas:
    PriorTreatmentManualCreate:   # additionalProperties: false
      required: [setting, regimenName, ongoing]
      lineNumber: { type: integer, minimum: 1 }          # opcional
      setting: { enum: [neoadyuvante, adyuvante, primera_linea_metastasica, segunda_linea_metastasica,
                        linea_posterior_metastasica, otro, desconocido] }
      regimenName: { type: string, minLength: 1, maxLength: 200 }
      startedAt: { type: string, format: date }          # opcional
      endedAt: { type: string, format: date }            # prohibido si ongoing = true
      ongoing: { type: boolean }
      endReason: { enum: [progresion, toxicidad, completado, otro, desconocido] }  # obligatorio si ongoing = false
    PriorTreatment:               # additionalProperties: false
      required: [id, lineNumber, setting, regimenName, atcCodes, mappingStatus, startedAt, endedAt, ongoing,
                 endReason, provenance]
      atcCodes: { type: array, items: { type: string, pattern: '^[A-Z][0-9]{2}[A-Z]{2}[0-9]{2}$' } }  # mismo patrón que rag-orchestrator
      mappingStatus: { enum: [mapeado, no_mapeado] }
      provenance: { $ref: Provenance }                   # entryMethod manual, n_a, verificado
    ClinicalAttributeManualCreate:
      required: [attributeKey, value]
      attributeKey: { type: string, pattern: '^[a-z0-9_]+$', maxLength: 100 }
      value: { type: string, minLength: 1, maxLength: 100 }
      observedAt: { type: string, format: date }         # opcional
    ClinicalAttribute:
      required: [id, key, value, observedAt, datePrecision, provenance]
      datePrecision: { enum: [dia, mes, anio, incierta] }
    ClinicalAttributeList:
      required: [items, allowedAttributes, catalogVersion]
      allowedAttributes: [{ key, label, values: [{ value, label }] }]
    ErrorRegistroClinicoInvalido:   # additionalProperties: false; required: [error, message, traceId]
      error: { enum: [CUERPO_INVALIDO, PACIENTE_EGRESADO, VALOR_FUERA_DE_CATALOGO, TIPO_CANCER_NO_REGISTRADO] }
      field: &field { type: string, description: "Propiedad del cuerpo que causó el error, cuando el error es de un campo; ausente si no lo es (p. ej. PACIENTE_EGRESADO). Nunca repite el valor enviado." }   # opcional
    ErrorRegistroManualInvalido:    # existente: + field opcional (misma definición)
      field: *field
    ErrorDiagnosticoInvalido:       # existente: + field opcional (misma definición)
      field: *field
```

Ejemplos nuevos (registrados en `contracts/examples/index.json`): `prior-treatment-manual.json` (AC-1, request),
`prior-treatment-manual-creado.json` (201, `atcCodes = [L02AE02]`), `prior-treatment-no-mapeado.json` (201, AC-2),
`clinical-attribute-manual.json` (request), `clinical-attribute-creado.json` (201),
`clinical-attributes-list.json` (200 con `allowedAttributes`). Reutilizados contra los `4xx` de las tres operaciones:
`error-cuerpo-invalido`, `error-paciente-egresado`, `error-valor-fuera-de-catalogo`, `error-no-autenticado`,
`error-permiso-denegado`, `error-no-encontrado`, `error-interno`; `TIPO_CANCER_NO_REGISTRADO` con un ejemplo propio
`error-atributo-sin-tipo-cancer.json` (el existente es del análisis y su mensaje no aplica) y
`error-registro-clinico-campo.json` (`VALOR_FUERA_DE_CATALOGO` con `field = value`). Los ejemplos existentes sin
`field` siguen válidos. Zod y cliente TS se
**generan** del spec (`contracts:generate`), nunca a mano.

## Componentes y patrones

- `organisms/case-view/DialogoTratamientoPrevio` (S5-03 d) y `DialogoAtributoClinico` (S5-03 c): `'use client'`, un
  concepto cada uno, < 100 líneas; campos como moléculas existentes (`Label` + `Input`/`select` nativo).
- Botones «+ Agregar tratamiento previo» y «+ Registrar atributo» en las secciones de la página RSC de `l1d-76`;
  solo el diálogo es cliente. Sin provider ni hook nuevo: un `useEnvioRegistro` solo si `l1d-90`/`l1d-96` ya lo
  traen (≥2 consumidores); si no, YAGNI.
- Referencia visual: `docs/ux/S5/pantallas-s5.md` S5-03 (diálogo modal accesible, foco atrapado, `Esc`, retorno al
  disparador; «Guardar»/«Cancelar»; aviso RN-27 de término sin código) y S5-05 (secciones). Sin desviaciones.

## Dependencias y colaboradores

- **Nuevo** `src/modules/prior-treatments/{controller,service,repository,schema}.ts`: el service depende del puerto
  `ReconciliationService` (`l1d-84`), de `RegistroManual` (guarda de paciente) y de su repository por parámetro de
  una *factory*; reloj e IDs inyectados.
- **Nuevo** `src/modules/clinical-attributes/{controller,service,repository,schema}.ts`: depende del puerto
  `CatalogoDeAtributos` (`clavesPermitidas(tipoDeCancer)`, `version()`), con adaptador en
  `src/infrastructure/catalogo/catalogo-de-atributos.ts` que lee `atributos.json` (ya validado al arrancar).
  Regla extraída: `atributoPermitido(clave, valor, tipoDeCancer)` (RN-29), una sola vez.
- **Nuevo/compartido** `src/modules/compartido/registro-manual.ts` (D1); lectura vigente con `sqlDatoVigente()`
  existente (no se reescribe el predicado).
- **Modificado** `composition.ts`/`server.ts` (cableado), `packages/clinical-catalogs` (schema, `atributos.json`,
  `manifest.json`, regla del validador que exige `values` en el catálogo real).
- `web`: `lib/server/registro-manual.ts` (manejadores BFF), Route Handlers y los dos diálogos.
- **Fakes:** ninguno nuevo; integración con PostgreSQL real y adaptador real del catálogo sobre FX-01b-b. El
  `ReconciliationService` va real (lógica pura).
- Regla única: `grep -rn "no_mapeado\|attribute_key" apps/clinical-api/src` antes del PR; ningún mapeo fuera de
  `ReconciliationService` y ninguna lista de atributos fuera del catálogo.

## Evaluación

Cambia el **catálogo** (`atributos.json` 1.2.0 con `values` y subconjunto ATC en `codigos.json`/`sinonimos.json`,
`manifest.json` 1.4.0): `run-ai-eval` obligatorio (OL-06, `[S5 resp. 9]`). Métricas esperadas: sin regresión en
recall@10, MRR, fidelidad y citas; mapeo terminológico ≥ 0,95 (los fármacos del seed pasan a `mapeado`). Se reporta
la comparación con el baseline y el `409` de versión entre backends no debe aparecer (misma versión montada en ambos).

## Riesgos

- Cadena de versiones del `openapi.yaml` y del catálogo con otros changes del S5 (merge en conflicto): la ordena
  `/sprint-start`.
- Un código o nombre ATC copiado mal rompería DEC-04: se verifica cada entrada en la fuente, sin DDD. Con el catálogo
  real 1.4.0, «Leuprorelina» manual sale `mapeado` con `L02AE02` en la demo; AC-1 se sigue verificando con FX-01b-b.
- `l1d-74` (FX-02b-a) usa `L02AE02` y `L02BB03` (resuelto en el Gate 1, `[S5 resp. 10]`).

## Decisiones del Gate 1 (usuario, 2026-11-03)

- **P-1 → decidido `[S5 resp. 13]`:** listas de `setting` (D6) y de `values` (D7), incluido el valor para «sensible a
  la castración» (`sensible_castracion`).
- **P-2 → decidido `[S5 resp. 13]`:** `end_reason = desconocido` en un tratamiento en curso (sin migración).
- **P-3 → decidido `[S5 resp. 13]`:** sin diagnóstico vigente, tratamiento → `no_mapeado`; atributo →
  `422 TIPO_CANCER_NO_REGISTRADO`.
- **P-4 → decidido (DEC-01 Q1, `[S5 resp. 13]`):** el dato manual `verificado` cuenta como «Presente y verificado».
- `[S5 resp. 9]` subconjunto ATC (D9) · `[S5 resp. 10]` `field` (D10) y ATC reales en lugar de `ATC-T-LEUP`.
- Los supuestos marcados antes como «(asumido)» quedan decididos `[S5 resp. 13]`.
