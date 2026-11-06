# Proposal — d5fb-05-editar-tratamientos-y-atributos-en-vista-de-caso

## Trazabilidad

Origen: feedback de la Demo 5 (2026-11-05), sin L1D asignado (crear historia en Linear solo con aprobación del usuario) ·
FEAT-03b (revisión, conflictos y registro manual) · FR-23 (UI de registro y corrección) · RN-08, RN-17, RN-26, RN-27,
RN-29, RN-10, RN-11 · ADR-50 (corrección con histórico, se extiende), ADR-33, ADR-26 · PRD E-17 (sin OCR el caso se
construye a mano) · AC-04.1 · patrón reutilizado de `l1d-309` (corrección de biomarcador y nota), `l1d-80` (alta
manual de tratamiento y atributo), `l1d-91`/`l1d-96` (diálogos y vista de caso) · UX `docs/ux/S5/pantallas-s5.md`
S5-01 (variante A) y S5-03 c/d.

> Feedback literal: «En la vista de caso clínico hace falta poder editar los Tratamientos previos y los Atributos
> clínicos.»

## Por qué

Hoy la vista de caso permite **agregar** un tratamiento previo y un atributo clínico (`createManualPriorTreatment`,
`createManualClinicalAttribute`) y **corregir** biomarcadores y notas, pero no corregir un tratamiento o un atributo ya
registrado. Un error de tecleo (esquema, fecha, línea, valor de HER2 o de un atributo del catálogo) obliga a dejar el
dato erróneo o a registrar uno nuevo, y el contrato dice que «un segundo registro de la misma clave es una fila nueva,
no una corrección»: ambos quedan vigentes y la vista muestra los dos sin saber cuál manda. Sin OCR (PRD E-17) la
corrección a mano es la única vía de dejar el caso correcto antes del análisis (G-Demo).

## Qué cambia

- **Contrato primero (aditivo, ADR-26; `clinical-api`, `info.version` minor, 1.22.0 → **1.23.0**):**
  - `POST /platform/patients/{patientId}/prior-treatments/{treatmentId}/corrections` → `201 PriorTreatment`
    (`correctPriorTreatment`); cuerpo = el mismo `PriorTreatmentManualCreate` (reemplazo completo de los campos
    editables, así hereda cualquier campo que añada `d5fb-04`).
  - `POST /platform/patients/{patientId}/clinical-attributes/{attributeId}/corrections` → `201 ClinicalAttribute`
    (`correctClinicalAttribute`); cuerpo `ClinicalAttributeCorrection` `{value, observedAt?}`. La **clave no cambia**.
  - `GET …/prior-treatments/{treatmentId}/history` y `GET …/clinical-attributes/{attributeId}/history` →
    `CorrectionHistory` (schema ya existente de `l1d-309`).
  - `PriorTreatment`, `ClinicalAttribute` y los ítems de `CaseView.priorTreatments` / `CaseView.attributes` ganan `id`
    y `supersedesId` (respuesta; sin esto la vista no puede apuntar a la fila a corregir). Errores `401`, `403`,
    `404`, `409 DATO_NO_VIGENTE`, `422 ErrorCorreccionInvalida` (con `field`).
- **Esquema (migración Prisma aditiva, commit propio tras el `contract`):** `supersedes_id uuid NULL REFERENCES … (id)`
  con índice único parcial en `clinical.prior_treatment` y `clinical.clinical_attribute` (extiende ADR-50 a dos tablas
  más; ver design D1). `docs/architecture/data-model.md` y la nota de alcance del ADR-50.
- **`clinical-api`:** el módulo `corrections` gana dos casos de uso (`corregirTratamiento`, `corregirAtributo`) sobre la
  misma regla pura `planDeCorreccion()`; fila nueva `manual_correction` `verificado`, anterior `reemplazado`, en una
  transacción; `ReconciliationService` (ADR-33) vuelve a decidir `atcCodes`/`mappingStatus` si cambia `regimenName`;
  atributo validado de nuevo contra el catálogo (RN-29); paciente egresado → `422` (RN-17).
- **`apps/web`:** acción «Corregir dato» por fila en `PriorTreatmentsTable` y `ClinicalAttributesTable`
  (`AccionCorregirDato` existente) que abre el **mismo diálogo** de alta con los valores precargados (modo corrección,
  «Guardar mi corrección»); histórico desplegable (`HistoricoDelDato`); aviso no bloqueante de análisis anteriores
  (`AvisoAnalisisAnteriores`); Route Handlers BFF para las 4 operaciones; textos en `messages/es.json`.
- **Recalculo:** sin código nuevo de detección: el checklist se calcula en cada lectura y el detector de vigencia compara
  la huella del contexto; el change **demuestra con tests** que una corrección cambia ambos (design D6).

## Capacidades

- `human-control` (ADDED): corrección trazable de tratamientos previos y atributos clínicos (RN-08).
- `api-contracts` (ADDED): las cuatro operaciones y los campos `id`/`supersedesId`.
- `data-model` (ADDED): `supersedes_id` en las dos tablas.
- `web-bff` (ADDED): Route Handlers con verificación de `Origin`.
- `evidence-analysis` (ADDED): corregir un tratamiento o atributo recalcula el checklist y deja intacto el análisis previo (huella distinta en el nuevo); la marca `staleness.patientData` queda TRASLADADA a US-175 (L1D-148), que no existe aún en la rama.

## Bounded contexts

- **contratos** (`apps/clinical-api/openapi.yaml`, `contracts/examples/`, `packages/api-contracts` generado).
- **clinical-platform** (`apps/clinical-api` módulo `corrections`; Route Handlers de `apps/web/app/api`,
  `apps/web/lib/server/registro-manual.ts`).
- **frontend** (`apps/web`: tablas, diálogos en modo corrección, textos).
- Sin `ai-services`: `rag-orchestrator`, prompts, umbrales, catálogo y corpus no cambian (no aplica `run-ai-eval`).

## Dependencias

- ✅ `l1d-80` (alta manual de tratamiento/atributo y `field` en 422), `l1d-309` (`planDeCorreccion`, `CorrectionHistory`,
  `HistoricoDelDato`, `AccionCorregirDato`), `l1d-84` (normalización final), `l1d-91` (`Dialog` y hook de envío),
  `l1d-96`/`l1d-76` (vista de caso): archivados, en `main`.
- ✅ **`d5fb-04` (opción «sin tratamiento previo a la fecha»), ya implementado en la rama base de este change
  (apilado sobre `feat/d5fb-04-sin-tratamiento-previo`):** `info.version` está en **1.22.0** → este change toma
  **1.23.0** (aditivo, ADR-26). La declaración es un `ClinicalAttribute` con clave `sin_tratamiento_previo` y valor
  `si` (no una fila `PriorTreatment`), con la regla de coherencia **D4** en
  `src/modules/compartido/declaracion-de-ausencia.ts` (un `PriorTreatment` vigente y una declaración vigente nunca
  coexisten; se aplica con el paciente bloqueado `FOR UPDATE` y en la misma transacción). La completitud usa
  `satisfiedBy`/`resolvedBy`, el catálogo está en 1.5.0 y el diálogo de tratamiento previo recibe un `estado`
  obligatorio (`{hayTratamientos, declaracion}`). Consecuencias para este change:
  - Corregir un tratamiento **no crea ni borra declaraciones**: la fila nueva sustituye a la anterior dentro de la
    misma transacción, de modo que sigue habiendo un tratamiento vigente y, por D4, ninguna declaración vigente.
  - Corregir la declaración `sin_tratamiento_previo` es una **corrección de atributo normal** (fila nueva
    `manual_correction`, anterior `reemplazado`): solo `observedAt` es corregible; la clave y el valor `si` son
    inmutables (cambiar a otra cosa es registrar un tratamiento, que ya reemplaza la declaración).
  - Invariante D4 conservada: tras cualquier corrección, si hay tratamiento vigente no hay declaración vigente, y
    viceversa.
- Coordinación con el resto de `d5fb-*` que tocan `openapi.yaml` (`d5fb-02`): misma regla de renumeración.

## Fuera de alcance

- **Eliminar/rechazar** un tratamiento o atributo cargado por error (`rechazado`): decisión del usuario (2026-11-05),
  queda como deuda (tasks H.1).
- Cambiar la **clave** de un atributo (se registra otro atributo) y cambiar el término de un biomarcador.
- Corrección de lo extraído por OCR (Post-MVP); todo dato corregido aquí es manual.
- Auditoría completa de accesos (US-150, S6): aquí solo el evento de log sin PHI.
- Envío a la IA del contenido corregido: sigue el flujo existente; no hay texto libre nuevo.
