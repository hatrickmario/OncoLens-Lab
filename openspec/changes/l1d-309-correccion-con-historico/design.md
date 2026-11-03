# Design — l1d-309-correccion-con-historico

## Contexto

ADR-50 (decidido, D-2 `[S5 resp. 2]`) fija el modelo: una corrección crea una fila nueva `entry_method =
manual_correction`, la anterior pasa a `review_status = reemplazado` (e `is_active = false` donde exista) y la nueva
apunta a ella con `supersedes_id`. Las lecturas vigentes ya excluyen `rechazado`/`reemplazado` con `sqlDatoVigente()`
(`src/modules/compartido/estados-de-revision.ts`, RN-07), de modo que la ficha, la vista de caso y el contexto de la IA
toman el valor corregido sin cambios. La huella del contexto (`huellaDelContexto()`, SHA-256 del snapshot
desidentificado) cambia sola cuando cambia un dato vigente (AC-5, D-10). No se reabre ADR-50 ni ADR-40.

## Decisiones

- **D1 · Un módulo `corrections` con una sola regla.** `planDeCorreccion(actual, cambios, hoy)` (función pura) decide
  qué filas se crean y cuáles pasan a `reemplazado`; el service la ejecuta en **una transacción** y el repository
  hace los `INSERT` y el único `UPDATE` permitido (`review_status`, `is_active`, nunca `value`/`content`). Una
  corrección sin cambios reales → `422 CUERPO_INVALIDO` sin `field` (opcional, `[S5 resp. 10]` (3)), no una fila idéntica.
- **D2 · Concurrencia y vigencia.** Solo se corrige una fila vigente: el `UPDATE … WHERE review_status NOT IN
  ('rechazado','reemplazado')` debe afectar 1 fila; si afecta 0 → `409 DATO_NO_VIGENTE` y se revierte la transacción.
  Índice único parcial `supersedes_id WHERE supersedes_id IS NOT NULL` en cada tabla: una fila se reemplaza una vez.
- **D3 · Biomarcador y examen** (resuelve la consecuencia abierta de ADR-50). La corrección de un biomarcador cambia
  `value`, `unit`, `referenceRange` y, opcional, `performedAt`. Sin cambio de fecha, el nuevo `Biomarker` cuelga del
  mismo `Exam`. Con cambio de fecha se crea un `Exam` nuevo `manual_correction` con esa fecha; su `supersedes_id`
  apunta al examen anterior **solo si** este tenía como único biomarcador vigente el corregido (caso de todo registro
  manual, US-110); si tenía otros, `supersedes_id = null` y el examen anterior sigue vigente con los demás. Regla:
  `examenDeLaCorreccion()`. *Descartado:* endpoint propio de corrección de examen completo (copia N biomarcadores;
  sin OCR no hay exámenes con varios biomarcadores; Post-MVP).
- **D4 · Normalización.** El `originalName` del biomarcador no se corrige (el término es el mismo dato); el nuevo
  registro conserva `originalName`, y `name`/`loincCode`/`mappingStatus` los vuelve a decidir `ReconciliationService`
  (l1d-84) con el catálogo montado. `VALOR_FUERA_DE_CATALOGO` cuando el valor cualitativo no está en los valores
  admitidos del catálogo para ese biomarcador (misma regla que US-110, reutilizada, no copiada).
- **D5 · Validación** con el schema Zod generado del spec en el borde (cliente y servidor): fecha posterior a hoy
  (reloj inyectado) → `422 CUERPO_INVALIDO` con `field = "performedAt"`; texto de nota vacío o > `CLINICAL_NOTE_MAX_CHARS`
  (configuración, RN-22) → `422` con `field = "content"`. Paciente egresado → `422 PACIENTE_EGRESADO` **antes** de
  cualquier escritura (RN-17). `admin` → `403` por `x-permission: clinical:write` (el middleware existente).
- **D6 · Nota clínica.** Corregir texto y/o `noteType` crea una nota nueva (`manual_correction`, `verificado`,
  `is_active = true`, `recorded_at` igual al de la anterior) y la anterior `reemplazado`, `is_active = false`.
  El `content` se guarda tal cual lo escribió el oncólogo dentro de `clinical-api` (dato clínico, no identidad); nunca
  va a *logs*. Antes de cualquier salida hacia la IA rige `deidentification` (ver Privacidad).
- **D7 · Histórico** se lee siguiendo `supersedes_id` hacia atrás desde la fila vigente
  (`GET …/history`, CTE recursiva acotada a `CORRECTION_HISTORY_MAX` filas, RN-22). `Biomarker.supersedesId`
  (opcional, aditivo) le dice a la UI si hay histórico sin pedirlo.
- **D8 · UI, variante A** de `docs/ux/S5/pantallas-s5.md` S5-01: corrección en línea en la misma fila, histórico
  desplegable bajo la fila. Recomendación única (decisión de UX ya tomada, `[S5 resp. 4]`); B y C descartadas allí.
  Las fechas del histórico y de las notas se muestran **relativas** («hoy», «hace 12 días») con la fecha absoluta en
  `<time dateTime>` y `title`, como en el resto de la ficha y la vista de caso (`[S5 resp. 11]` (d)).

## Privacidad y ownership

- Fronteras: navegador → `web` (Route Handlers, verificación de `Origin`, cookie de sesión) → `clinical-api`. Nada
  cruza a `rag-orchestrator` en este change; `rag-orchestrator` sigue sin acceso a datos clínicos ni a `clinical-minio`.
- **Notas y PII (AC-2, AC-6, ADR-40, RN-11):** en el S5 las notas siguen **fuera del contexto de la IA** (`[S5 resp. 12]`, P-2
  decidido): **minimizadas** (`clinicalNotes = []`,
  requisito vigente «Minimización de notas clínicas en el S1»; `verificarDesidentificado()` rechaza un contexto con
  notas). Por tanto una nota corregida no llega a la IA; si en el futuro entra, solo lo hará tras `PiiDetector` (opción
  A de ADR-40) en `ContextDeidentifier`, que es el único punto de salida. El escenario de AC-6 lo fija con PII
  sembrada en la nota corregida y el payload capturado. El aviso de nombres en la UI es preventivo: ADR-40 MVP no
  detecta nombres de terceros (solo identidad exacta y patrones).
- *Logs*: el evento `correccion_registrada` lleva solo `entityType`, `patientId` (UUID), ids de filas y `traceId`;
  nunca `value`, `content`, `originalName` ni identidad. El logger ya redacta `clinicalNotes`; se añade `content`.
- Solo datos sintéticos: fixtures FX-253-a y seed sin PII real; la PII de prueba es sintética de rangos reservados.
- **Seguridad web:** validación con el schema Zod compartido generado del spec en cliente y servidor; sin variables
  `NEXT_PUBLIC_` nuevas; Route Handlers `server-only`; el texto de la nota se renderiza como texto React (sin
  `dangerouslySetInnerHTML`); sin impacto en CSP ni cabeceras; mutaciones con verificación de `Origin` y cookie
  `SameSite=Strict` (CSRF); sin dependencias nuevas (si hiciera falta `Textarea` de shadcn/ui, es código copiado, no
  paquete; se audita igual).

## Contratos

Proveedor: `clinical-api` (`apps/clinical-api/openapi.yaml`). Consumidor: `web` (cliente generado en
`packages/api-contracts`). Cambio **aditivo** (oasdiff: 0 incompatibles; rutas y schemas nuevos, propiedad opcional
nueva en una respuesta). Compatible con ADR-26. Zod y tipos se generan del spec (`contracts:generate`), nunca a mano.
`info.version` *minor* **1.19.0** (cadena del S5: 1.15.0 → l1d-306 1.15.1 → l1d-268 1.16.0 → l1d-74 1.17.0 → l1d-80
1.18.0 → **l1d-309 1.19.0** → l1d-91 1.20.0). Quien rebasa renumera y **regenera** `packages/api-contracts`; nunca
fusiona generados a mano. `field` de `ErrorCorreccionInvalida` es opcional, `type: string`, sin enum y con la misma
descripción que en `ErrorRegistroManualInvalido`, `ErrorDiagnosticoInvalido` y `ErrorRegistroClinicoInvalido`; lo
introduce l1d-80, que mergea antes (`[S5 resp. 10]` (3)).

```yaml
# DIFF PROPUESTO (forma exacta; la tarea 1.1 la lleva al spec sin cambiar nombres ni restricciones)
info:
  version: 1.19.0                                  # minor; cadena del S5: l1d-80 1.18.0 → l1d-309 1.19.0 → l1d-91 1.20.0
paths:
  /platform/patients/{patientId}/biomarkers/{biomarkerId}/corrections:
    post:
      operationId: correctBiomarker
      tags: [registro-manual]
      x-permission: clinical:write
      parameters: [{ $ref: PatientId }, { name: biomarkerId, in: path, required: true, schema: { type: string, format: uuid } }]
      requestBody:
        required: true
        content: { application/json: { schema: { $ref: BiomarkerCorrection },
                   examples: { correccion: { externalValue: biomarker-correction-request.json } } } }
      responses:
        "201": { content: { application/json: { schema: { $ref: Biomarker },
                 examples: { corregido: { externalValue: biomarker-corrected.json } } } } }   # manual_correction, supersedesId = biomarkerId
        "401": { $ref: NoAutenticado }
        "403": { $ref: PermisoDenegado }             # error-permiso-denegado.json (reutilizado)
        "404": { $ref: NoEncontrado }                # dato inexistente o de otro paciente
        "409": { content: { application/json: { schema: { $ref: ErrorDatoNoVigente },
                 examples: { noVigente: { externalValue: error-dato-no-vigente.json } } } } }
        "422": { content: { application/json: { schema: { $ref: ErrorCorreccionInvalida },
                 examples: { fechaFutura: { externalValue: error-correccion-fecha-futura.json },
                             egresado: { externalValue: error-paciente-egresado.json } } } } }
  /platform/patients/{patientId}/biomarkers/{biomarkerId}/history:
    get:
      operationId: getBiomarkerHistory
      tags: [registro-manual]
      x-permission: clinical:read
      responses:
        "200": { content: { application/json: { schema: { $ref: CorrectionHistory },
                 examples: { historico: { externalValue: correction-history-biomarker.json } } } } }
        "401": { $ref: NoAutenticado }
        "403": { $ref: PermisoDenegado }
        "404": { $ref: NoEncontrado }
  /platform/patients/{patientId}/clinical-notes:
    get:
      operationId: listClinicalNotes
      tags: [registro-manual]
      x-permission: clinical:read
      responses:                                    # lista completa de notas vigentes, sin paginación
        "200": { content: { application/json: { schema: { $ref: ClinicalNoteList },
                 examples: { notas: { externalValue: clinical-notes-list.json } } } } }
        "401": { $ref: NoAutenticado }
        "403": { $ref: PermisoDenegado }
        "404": { $ref: NoEncontrado }
  /platform/patients/{patientId}/clinical-notes/{noteId}/corrections:
    post:
      operationId: correctClinicalNote
      tags: [registro-manual]
      x-permission: clinical:write
      requestBody:
        required: true
        content: { application/json: { schema: { $ref: ClinicalNoteCorrection },
                   examples: { correccion: { externalValue: clinical-note-correction-request.json } } } }
      responses:
        "201": { content: { application/json: { schema: { $ref: ClinicalNote },
                 examples: { corregida: { externalValue: clinical-note-corrected.json } } } } }
        "401": { $ref: NoAutenticado }
        "403": { $ref: PermisoDenegado }
        "404": { $ref: NoEncontrado }
        "409": { content: { application/json: { schema: { $ref: ErrorDatoNoVigente } } } }
        "422": { content: { application/json: { schema: { $ref: ErrorCorreccionInvalida } } } }
  /platform/patients/{patientId}/clinical-notes/{noteId}/history:
    get:
      operationId: getClinicalNoteHistory
      tags: [registro-manual]
      x-permission: clinical:read
      responses:
        "200": { content: { application/json: { schema: { $ref: CorrectionHistory },
                 examples: { historico: { externalValue: correction-history-clinical-note.json } } } } }
        "401": { $ref: NoAutenticado }
        "403": { $ref: PermisoDenegado }
        "404": { $ref: NoEncontrado }
components:
  schemas:
    Biomarker:
      properties:
        supersedesId: { type: [string, "null"], format: uuid }   # opcional (no entra en required): aditivo
    BiomarkerCorrection:
      type: object
      additionalProperties: false
      required: [value]
      properties:
        value: { type: string, minLength: 1 }
        unit: { type: [string, "null"] }
        referenceRange: { type: [string, "null"] }
        performedAt: { type: string, format: date }               # opcional; posterior a hoy → 422 field performedAt
    NoteType: { type: string, enum: [antecedente, comorbilidad, alergia, antecedente_familiar, nota_libre] }
    ClinicalNote:
      type: object
      additionalProperties: false
      required: [id, noteType, content, recordedAt, provenance, supersedesId]
      properties:
        id: { type: string, format: uuid }
        noteType: { $ref: NoteType }
        content: { type: string, minLength: 1 }                   # maxLength lo impone CLINICAL_NOTE_MAX_CHARS (configuración)
        recordedAt: { type: string, format: date-time }
        provenance: { $ref: Provenance }                          # sin cambios: no admite reemplazado
        supersedesId: { type: [string, "null"], format: uuid }
    ClinicalNoteList:                                             # nombre propio para { items: ClinicalNote[] }
      type: object
      additionalProperties: false
      required: [items]
      properties:
        items: { type: array, items: { $ref: ClinicalNote } }
    ClinicalNoteCorrection:
      type: object
      additionalProperties: false
      minProperties: 1
      properties:
        content: { type: string, minLength: 1 }
        noteType: { $ref: NoteType }
    CorrectionHistoryEntry:
      type: object
      additionalProperties: false
      required: [id, entryMethod, reviewStatus, recordedAt, createdAt]
      properties:
        id: { type: string, format: uuid }
        entryMethod: { type: string, enum: [ocr, manual, manual_correction, seed] }   # mismo enum que Provenance
        reviewStatus: { const: reemplazado }
        recordedAt: { type: string, format: date-time }
        createdAt: { type: string, format: date-time }
        value: { type: string }                                   # solo en biomarcadores
        unit: { type: [string, "null"] }                          # solo en biomarcadores
        content: { type: string }                                 # solo en notas
        noteType: { $ref: NoteType }                              # solo en notas
    CorrectionHistory:                                            # de la más reciente a la más antigua, sin la vigente
      type: object
      additionalProperties: false
      required: [items]
      properties:
        items: { type: array, items: { $ref: CorrectionHistoryEntry } }   # tope en configuración: CORRECTION_HISTORY_MAX (RN-22)
    ErrorCorreccionInvalida:
      type: object
      additionalProperties: false
      required: [error, message, traceId]
      properties:
        error: { type: string, enum: [CUERPO_INVALIDO, PACIENTE_EGRESADO, VALOR_FUERA_DE_CATALOGO] }
        field: { type: string }        # opcional, sin enum; misma descripción que en ErrorRegistroManualInvalido,
                                       # ErrorDiagnosticoInvalido y ErrorRegistroClinicoInvalido (la introduce l1d-80)
        message: { type: string }
        traceId: { type: string }
    ErrorDatoNoVigente:
      type: object
      additionalProperties: false
      required: [error, message, traceId]
      properties:
        error: { const: DATO_NO_VIGENTE }
        message: { type: string }
        traceId: { type: string }
```

- `Provenance.reviewStatus` **no** cambia (no admite `reemplazado`): el histórico usa su propio schema con
  `reviewStatus: const reemplazado`, de modo que ninguna respuesta existente amplía su enum.
- Ejemplos nuevos (sintéticos): `biomarker-correction-request.json`, `biomarker-corrected.json`,
  `clinical-note-correction-request.json`, `clinical-note-corrected.json`, `clinical-notes-list.json` (lista completa,
  sin paginación; antes `clinical-notes-page.json`), `correction-history-biomarker.json`,
  `correction-history-clinical-note.json`, `error-correccion-fecha-futura.json`, `error-dato-no-vigente.json`; se reutilizan
  `error-paciente-egresado.json` y `error-permiso-denegado.json`. Índice en `contracts/examples/index.json`.
- La migración Prisma y `data-model.md` (tablas `biomarker`, `exam`, `clinical_note` y matriz de permisos) van en un
  **commit propio después** del `contract(L1D-309)` (`chore(L1D-309)`, test después), nunca dentro del commit del contrato.

## Dependencias y colaboradores

- **Nuevo** `apps/clinical-api/src/modules/corrections/`: `corrections.controller.ts`, `corrections.service.ts`
  (factory `createCorrectionsService({ repo, reconciliation, reloj, ids, pacientes })`), `corrections.repository.ts`,
  `corrections.reglas.ts` (`planDeCorreccion()`, `examenDeLaCorreccion()`, `hayCambioReal()`), `ports.ts`.
  El service depende de puertos (`RepositorioDeCorrecciones`, `ReconciliationService` de l1d-84, `Reloj`,
  `GeneradorDeIds`, la guarda de paciente activo existente de RN-17); nunca de Prisma ni de clientes concretos.
- **Reutiliza** sin copiar: `sqlDatoVigente()` (RN-07), la guarda RN-17 y la validación de valores del catálogo de
  `l1d-90` (si aún no está extraída a `compartido/`, se extrae allí, un solo dueño), `huellaDelContexto()`.
- **Modificado** `ficha.repository.ts`: `recentBiomarkers` expone `supersedesId`.
- **Nuevo** en `apps/web/app/api/patients/[id]/…`: `biomarkers/[biomarkerId]/corrections/route.ts`,
  `biomarkers/[biomarkerId]/history/route.ts`, `clinical-notes/route.ts`, `clinical-notes/[noteId]/corrections/route.ts`,
  `clinical-notes/[noteId]/history/route.ts`, sobre el helper de reenvío existente.
- **Fakes:** ninguno nuevo. Integración con PostgreSQL real; `ReconciliationService` real con FX-01b-b; reloj e IDs
  inyectados y congelados. Sin `vi.mock` de módulos propios.

## Componentes y patrones

- `RecentBiomarkersTable` (organismo, RSC) añade por fila un `AccionCorregirDato` (`'use client'`, molécula) que
  alterna la fila entre lectura y `FormularioDeCorreccionDeBiomarcador` (molécula cliente: valor, unidad, fecha;
  «Guardar mi corrección», «Cancelar»; error `aria-live="assertive"` junto al campo).
- `HistoricoDelDato` (molécula cliente): botón «▸ Histórico» que pide `…/history` al desplegarse y lista filas
  `reemplazado`. Dos consumidores (biomarcador y nota) → componente compartido, sin patrón adicional.
- **Nuevo** `NotasClinicasDeFicha` (organismo RSC) con `FilaDeNotaClinica` y `FormularioDeCorreccionDeNota`
  (molécula cliente: tipo, texto, aviso fijo de nombres encima del campo).
- `AvisoAnalisisAnteriores` (átomo): texto no bloqueante tras guardar (RN-26).
- Revalidación del RSC tras guardar (`router.refresh()`); sin provider ni custom hook nuevo (un solo uso de cada
  estado). Ningún componente supera 100 líneas; `admin` no ve la acción (vista `PatientAdminSummary` sin clínica) y el
  paciente egresado la ve deshabilitada con el texto de RN-17.
- Referencia visual: `docs/ux/S5/pantallas-s5.md` S5-01 variante A y el sistema de diseño de `docs/ux/`; en 375 px la
  fila pasa a tarjeta y el formulario ocupa el ancho (mitigación documentada en la variante).

## Tests

- TDD estricto (doble bucle) en `clinical-api`: aceptación de AC-1…AC-6 con Supertest + PostgreSQL de test +
  verificación del proveedor; unitarios de `planDeCorreccion()`, `examenDeLaCorreccion()`, `hayCambioReal()`.
- Test del AC primero en `web` (Testing Library + MSW desde `contracts/examples/`): AC-1, AC-2, AC-3, AC-4 (egresado),
  AC-5 (aviso), AC-6 (aviso de nombres). `visual-check` a 375 y 1280 px.
- Migración: test después (integración: columna, FK e índice único parcial).

## Evaluación

No aplica: no cambia modelo, prompt, umbral, catálogo ni corpus (el seed añade notas, que no viajan a la IA).

## Riesgos

- Choque de `openapi.yaml` con US-094 en la oleada O2: aditivo en ambos; se resuelve en orden de merge.
- Si l1d-90 no extrae la validación de valores del catálogo, este change la extrae a `compartido/` (un solo dueño).
- Las lecturas que no usen `sqlDatoVigente()` mostrarían filas `reemplazado`: la tarea 2.8 busca en el árbol las
  lecturas de `biomarker`, `exam` y `clinical_note`.

## Decisiones cerradas (antes «Pendiente de definir»)

- **P-1 · Decidido (usuario, 2026-11-03), `[S5 resp. 13]`:** la vigencia de `Exam` es **derivada** (un examen sin
  biomarcadores vigentes no se muestra, D6 de l1d-74); no se añade columna `review_status` a `exam` (ADR-50 solo pide
  `supersedes_id`).
- **P-2 · Decidido (usuario, 2026-11-03), `[S5 resp. 12]`:** las notas quedan **fuera del contexto de la IA en el S5**
  (siguen minimizadas; habilitarlas cambiaría el prompt y exigiría `evaluate`). AC-2/AC-6 se verifican como «la nota
  corregida nunca viaja mientras rija la minimización».
- **P-3 · Decidido (usuario, 2026-11-03), `[S5 resp. 13]`:** el seed suma **2 notas sintéticas** al paciente (a)
  (`comorbilidad`, `nota_libre`, sin PII). Crear notas nuevas desde la ficha queda fuera.
