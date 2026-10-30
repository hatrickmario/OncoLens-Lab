# Design — l1d-95-completeness-endpoint-ficha

## Context

`createCompletenessService` y `componerCompletitud` existen (l1d-94) pero sin router; `missingCriticalCount` es
`FALTANTES_CRITICOS_POR_AHORA = 0` en `patients.reglas.ts`, usado por `patients.service.ts` y `ficha.service.ts`.
`/completeness` no está en `apps/clinical-api/openapi.yaml`. El `Provenance` actual (`openapi.yaml` ~:729-760) exige
`extractionConfidence`, `conflict` y `additionalSourceDocumentIds`, que el cálculo del checklist no lee, y no tiene `page`.

## Decisions

- **D1 Procedencia en el servicio, no en el motor puro.** El motor sigue devolviendo estado; un mapper puro
  `procedenciaDeItem()` (en `completeness.rules.ts` o archivo hermano) deriva `origin`/`provenance` del registro que
  contó. `entryMethod` → `origin`: `ocr`→`documento`, `manual`→`manual`, `manual_correction`→`correccion`,
  `seed`→`seed`. `page` sale de `source_span.page`.
- **D1b `origin = seed` es un valor propio (decidido por defecto, Gate 1).** El catálogo no justifica mapear `seed` a
  `manual` (nadie lo registró a mano) ni a `documento` (no hay documento); el seed sintético y FX-04-b usan
  `entry_method = seed` (diagnóstico de F-M2, todo F-M1). Se declara `seed` en el enum de `origin`: AC-3 sigue
  cubriendo `documento|manual|correccion` y `seed` solo aparece en datos sintéticos.
- **D2 Un solo servicio para endpoint y ficha.** La ficha llama a `CompletenessService.calcular()` y cuenta `faltante`
  (AC-2); sin segunda implementación (US-088 lo reutilizará).
- **D3 Tipo no habilitado y sin diagnóstico activo (decidido por defecto, Gate 1).** `ENABLED_CANCER_TYPES` no incluye
  el tipo del `Diagnosis` activo → `200` con `{ items: [], cancerTypeEnabled: false }` (AC-6); habilitado →
  `cancerTypeEnabled = true`. **Sin `Diagnosis` activo** no hay tipo que evaluar → mismo resultado:
  `cancerTypeEnabled = false`, `items = []`. En ambos casos `missingCriticalCount = 0` en la ficha.
- **D4 Borde:** `patientId` validado como UUID con Zod en el controller (mal formado → `404` como la ficha); sesión por
  el guard existente (`401` sin invocar el servicio); rol sin `clinical:read` (`admin`) → `403 PERMISO_DENEGADO` sin
  invocar el servicio; inexistente → `404 { error, message }`. Los faltantes nunca producen `4xx` (RN-26).
- **D5 Sin N+1:** una consulta por entidad de destino (ya así en l1d-94); la procedencia viaja en esas consultas.
- **D6 Deuda l1d-94 4.6:** F-3 operadores en un solo vocabulario; F-5 fixtures FX-04-a a `packages/clinical-catalogs`
  (con `label.es` legibles: «grado», «Ki-67», «Receptor de progesterona»…, los mismos que usan los ejemplos de
  `contracts/examples/`); F-8, F-9, F-11 según el reporte del Gate 2 de l1d-94.
- **D7 Falla del checklist en la ficha (decidido por defecto, Gate 1; RN-26).** Si `CompletenessService.calcular()`
  lanza al armar la ficha, la respuesta sigue siendo `200`: `missingCriticalCount = 0` y
  `completenessAvailable = false` (propiedad nueva opcional de `PatientSummary`; ausente equivale a `true`), y la ficha
  muestra el aviso no bloqueante «No se pudieron verificar los datos críticos» en lugar del contador (lo pinta
  `l1d-97`, decisión Q2 del usuario, 2026-10-30). Nunca `5xx` por esta causa. Se elige una propiedad opcional y no
  `missingCriticalCount: integer|null` porque volver nulable un campo de respuesta es un ERR de oasdiff que exigiría
  una excepción de ADR-26. Pintar el aviso en `apps/web` queda fuera de este change: lo hace `l1d-97` (Q2).
- **D7b Listado y búsqueda sin cambios en el S4 (decisión Q2 del usuario, 2026-10-30).** `patients.service.ts` (listado
  y búsqueda) no invoca `CompletenessService` ni calcula el checklist por fila; `PatientListItem` no gana
  `completenessAvailable` y su `missingCriticalCount` conserva el valor actual (`FALTANTES_CRITICOS_POR_AHORA`, que
  se mantiene solo para ese uso). Por eso el listado no lee datos clínicos nuevos con ninguna sesión.
- **D8 El Route Handler BFF no es de este change.** `GET /api/patients/[id]/completeness` en `apps/web` lo crea
  `l1d-97-aviso-faltantes-panel`; este change no toca `apps/web`.

## Privacidad y ownership

`clinical-api` es dueño del dato y del cálculo; no se llama a `rag-orchestrator` ni a ningún LLM (RN-12). Respuesta sin
identidad (RN-10): `sourceDocumentId` y `page` son UUID y entero, nunca nombre de archivo ni URL del documento.
**Regla de logs (común con l1d-97):** el UUID del paciente SÍ puede ir en logs; la identidad (nombre, documento) nunca.
Logs de `/completeness` y de la ficha: UUID del paciente, `traceId`, `catalogVersion`, conteos y latencia; sin valores
clínicos, sin etiquetas y sin el error de `pg`. `admin` no lee datos clínicos: `403` en `/completeness`
(`x-permission: clinical:read`). Solo datos sintéticos (RN-13/14).

## Contratos

Contract-first (`sync-contracts`), commit `contract(L1D-95)`. Cambio **aditivo** (oasdiff sin ERR); `info.version` de
`clinical-api` sube a **1.12.0** (versión asignada en el S4 por el orden real de oleadas; cadena clinical-api 291 → 95 → 295 → 144 → 300: rebasa sobre
`l1d-291`, que deja 1.11.0, y `l1d-295` rebasa sobre este). No se
modifica el `Provenance` existente: el checklist usa un subconjunto propio y explícito, `CompletenessProvenance`.

```yaml
paths:
  /platform/patients/{patientId}/completeness:
    get:
      operationId: getCompleteness
      tags: [pacientes]
      summary: Checklist de datos críticos del paciente con procedencia por ítem
      description: >-
        Determinista (FR-23), sin IA. Un faltante nunca produce 4xx (RN-26). Lectura clínica: el
        administrador recibe 403.
      x-permission: clinical:read
      parameters:
        - $ref: '#/components/parameters/PatientId'
      responses:
        "200":
          description: Checklist del paciente.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/CompletenessView'
        "401": { $ref: '#/components/responses/NoAutenticado' }
        "403": { $ref: '#/components/responses/PermisoDenegado' }
        "404": { $ref: '#/components/responses/NoEncontrado' }
        "500": { $ref: '#/components/responses/ErrorInterno' }

components:
  schemas:
    CompletenessView:
      type: object
      additionalProperties: false
      required: [catalogVersion, cancerTypeEnabled, items]
      properties:
        catalogVersion:
          type: string
          minLength: 1
        cancerTypeEnabled:
          type: boolean
          description: >-
            false si el Diagnosis activo es de un tipo fuera de ENABLED_CANCER_TYPES o si no hay
            Diagnosis activo; entonces items = [].
        items:
          type: array
          items:
            $ref: '#/components/schemas/CompletenessItem'

    CompletenessItem:
      type: object
      additionalProperties: false
      required: [item, label, status, origin, provenance, destination, condition]
      properties:
        item:
          type: string            # clave del catálogo (her2_ihq)
          minLength: 1
        label:
          type: string            # label.es del catálogo; nunca valores del paciente
          minLength: 1
        status:
          type: string
          enum: [presente_verificado, presente_sin_verificar, faltante, no_aplica]
        origin:
          type: string
          enum: [documento, manual, correccion, seed, regla]
          description: regla si status es faltante o no_aplica; si no, sale del entryMethod del registro que cuenta.
        provenance:
          oneOf:
            - $ref: '#/components/schemas/CompletenessProvenance'
            - type: "null"
          description: null si y solo si status es faltante o no_aplica.
        destination:
          type: object
          additionalProperties: false
          required: [entity, field]
          properties:
            entity:
              type: string
              enum: [Diagnosis, Biomarker, ClinicalAttribute, PriorTreatment]
            field:
              type: [string, "null"]   # null cuando el destino es la entidad entera (PriorTreatment)
        condition:
          description: Condición del catálogo que no se cumplió; no nula solo si status es no_aplica.
          oneOf:
            - type: object
              additionalProperties: false
              required: [item, operator, values]
              properties:
                item: { type: string, minLength: 1 }
                operator: { type: string, enum: [igualdad, pertenencia, prefijo] }
                values:
                  type: array
                  minItems: 1
                  items: { type: string }
            - type: "null"

    CompletenessProvenance:
      type: object
      description: >-
        Subconjunto propio del checklist; no es el Provenance completo (no lleva extractionConfidence,
        conflict ni additionalSourceDocumentIds, que el cálculo no lee).
      additionalProperties: false
      required: [entryMethod, reviewStatus, sourceDocumentId]
      properties:
        entryMethod:
          type: string
          enum: [ocr, manual, manual_correction, seed]
        reviewStatus:
          type: string
          enum: [auto_aceptado, requiere_revision, verificado, corregido]
        sourceDocumentId:
          type: [string, "null"]
          format: uuid
        page:
          type: integer
          minimum: 1
          description: Solo si el registro viene de un documento y su source_span tiene página.

    # PatientSummary: propiedad nueva opcional (D7) dentro de `properties`; `required` no cambia y no se crea un
    # schema hermano. PatientListItem NO cambia (D7b, Q2).
    PatientSummary:
      properties:
        # … propiedades existentes sin cambios …
        completenessAvailable:
          type: boolean
          description: >-
            false si el checklist no pudo calcularse; entonces missingCriticalCount = 0 y no debe
            mostrarse como contador. Ausente equivale a true.
```

**Ejemplos** en `contracts/examples/`, registrados en `index.json` (los consume `l1d-97` para MSW):

| Archivo | Target | Contenido |
|---|---|---|
| `completeness-f-m2.json` (nuevo) | `…/completeness/get/responses/200` | `test-1.0.0`, `cancerTypeEnabled: true`, 12 ítems: `histologia`, `tnm`, `ecog` (`seed`), `her2_ihq` (`correccion`, `corregido`), `tratamientos_previos` (`manual`, `PriorTreatment`, `field: null`) en `presente_verificado`; `re` (`documento`, `requiere_revision`, `sourceDocumentId` + `page`) en `presente_sin_verificar`; **6 `faltante`**: `grado` (`Diagnosis.grade`), `rp`, `her2_ish`, `ki67`, `brca_germinal` (`Biomarker.value`), `estado_menopausico` (`ClinicalAttribute.value`), todos `origin: regla`, `provenance: null`, `condition: null` |
| `completeness-f-m1.json` (nuevo) | `…/completeness/get/responses/200` | `test-1.0.0`, `cancerTypeEnabled: true`, **0 `faltante`**; `her2_ish` (`condition {her2_ihq, prefijo, [2+]}`), `tratamientos_previos` y `brca_germinal` (`{tnm, prefijo, [IV]}`) en `no_aplica` con `origin: regla` |
| `completeness-tipo-no-habilitado.json` (nuevo) | `…/completeness/get/responses/200` | `{ catalogVersion, cancerTypeEnabled: false, items: [] }` |
| `patient-summary-checklist-no-disponible.json` (nuevo) | `#/components/schemas/PatientSummary` | derivado de `patient-summary-doctor.json` con `missingCriticalCount: 0` y `completenessAvailable: false`; lo consume `l1d-97` (MSW de la ficha, Q2) |
| `error-no-autenticado.json` (existente) | `…/completeness/get/responses/401` | `NO_AUTENTICADO` |
| `error-permiso-denegado.json` (existente) | `…/completeness/get/responses/403` | `PERMISO_DENEGADO` (admin) |
| `error-no-encontrado.json` (existente) | `…/completeness/get/responses/404` | `NO_ENCONTRADO` |
| `error-interno.json` (existente) | `…/completeness/get/responses/500` | `ERROR_INTERNO` |

Luego `contracts:generate`. La verificación del proveedor valida la respuesta real contra el spec (US-214).
**`CaseView.completeness`** conserva su forma actual (`item`, `status`) y **converge con `CompletenessItem` en US-088
(S5, AC-8)**, que reutiliza el mismo servicio.

## Risks / Open points

- **Resuelto (decisión Q2 del usuario, 2026-10-30):** `completenessAvailable = false` se pinta en la ficha como aviso
  no bloqueante «No se pudieron verificar los datos críticos» (RN-26), y lo implementa `l1d-97` (frontend) con el
  ejemplo `patient-summary-checklist-no-disponible.json` de este change. El listado y la búsqueda quedan sin cambios en
  el S4 (D7b): sin cálculo por fila, sin `completenessAvailable` en `PatientListItem`, y por tanto sin riesgo nuevo de
  mínimo privilegio con la sesión `admin` (el listado no invoca `CompletenessService` con ninguna sesión).
- El contador del listado sigue en el valor actual hasta una historia posterior que lo calcule por fila (deuda
  registrada; no bloquea, RN-26).
