# Design — d5fb-05-editar-tratamientos-y-atributos-en-vista-de-caso

## Contexto

Estado verificado en el repo:

- `openapi.yaml` (1.22.0, tras `d5fb-04`) tiene `POST …/prior-treatments` y `POST …/clinical-attributes` (alta manual), `GET
  …/clinical-attributes`, y correcciones solo de `Biomarker` y `ClinicalNote` (`l1d-309`, ADR-50). No hay `PATCH`/`PUT`
  ni corrección de tratamiento o atributo.
- `PriorTreatment` y `ClinicalAttribute` (Prisma) tienen `review_status` pero **no** `supersedes_id`; no tienen
  `is_active` (la vigencia es «no `rechazado` ni `reemplazado`», RN-07).
- La vista de caso (`SeccionesDelCaso`) monta `DialogoTratamientoPrevio` y `DialogoAtributoClinico` como acción de alta
  en `PriorTreatmentsTable` / `ClinicalAttributesTable`; las filas se dibujan sin `id` (clave `regimen-fecha`,
  `clave-valor`) porque `CaseView.priorTreatments` y `.attributes` no exponen `id`.
- La corrección ya resuelta: `AccionCorregirDato`, `HistoricoDelDato`, `AvisoAnalisisAnteriores`, `planDeCorreccion()`,
  `CorrectionHistory`, `ErrorCorreccionInvalida`, `ErrorDatoNoVigente`, Route Handlers `…/corrections` y `…/history`.

## Decisiones

- **D1 · «Editar» = corregir con histórico (ADR-50), no `UPDATE`.** Fila nueva `entry_method = manual_correction`,
  `review_status = verificado`, `supersedes_id` a la anterior, que pasa a `reemplazado` con su contenido intacto, todo en
  una transacción. Razón: RN-08 (nada se sobrescribe en silencio), RN-05 y la huella del análisis (RN-06) no cambian si
  la fila que leyó un análisis queda intacta. *Descartado:* (a) `PATCH` con `UPDATE` en el sitio: viola RN-08 y rompe la
  trazabilidad de los `AIAnalysisRecord`; (b) tabla de versiones o `AuditLog` (opciones 2 y 3 de ADR-50): ya rechazadas
  allí y meterían PHI en auditoría; (c) borrar y volver a crear: pierde el histórico. Consecuencia: **migración aditiva**
  `supersedes_id` en `clinical.prior_treatment` y `clinical.clinical_attribute` (extiende el alcance de ADR-50, que
  nombraba biomarcador, examen y nota; se añade una *nota de alcance* al ADR, sin cambiar su decisión).
- **D2 · Un endpoint `…/corrections` por recurso, no `PATCH`.** Mismo patrón que `l1d-309`
  (`POST …/{id}/corrections` → `201` con la fila nueva). *Descartado:* `PATCH` (su semántica es mutar la misma fila) y un
  endpoint genérico `/corrections` con `entityType` (pierde el tipado del contrato y el `x-permission` por operación).
- **D3 · Cuerpo de la corrección de tratamiento = `PriorTreatmentManualCreate`.** Reemplazo completo de los campos
  editables (línea, contexto, esquema, fechas, en curso, motivo de fin). Reusa la validación del alta (coherencia
  `ongoing`/`endedAt`/`endReason`, `endedAt ≥ startedAt`) y hereda lo que `d5fb-04` agregue. Una corrección **sin
  cambios reales** (`hayCambioReal()`) → `422 CUERPO_INVALIDO`, no una fila idéntica.
- **D4 · Atributo: la clave es inmutable; se corrige `value` y `observedAt`.** Cuerpo `ClinicalAttributeCorrection`
  `{value, observedAt?}`; el valor se valida de nuevo contra la lista del catálogo para el tipo de cáncer (RN-29) →
  `422 VALOR_FUERA_DE_CATALOGO` con `field = value`. Cambiar de clave es otro atributo (alta). Esto resuelve además el
  hueco actual de «dos filas de la misma clave»: la edición sustituye en lugar de duplicar.
- **D5 · Normalización (ADR-33, RN-27).** Si cambia `regimenName`, `ReconciliationService` de Backend 1 decide de nuevo
  `atcCodes` y `mappingStatus` con el catálogo versionado; sin mapeo queda `no_mapeado` sin código, nunca inventado ni
  descartado. `regimenName` se conserva tal como llegó. El cliente nunca envía códigos.
- **D6 · Faltantes y vigencia sin código nuevo de detección.** `GET …/completeness` calcula el checklist en cada lectura
  desde las filas vigentes: al reemplazarse la fila, el ítem cambia de estado solo. El detector de vigencia
  (`Staleness`) compara la huella del contexto (`huellaDelContexto`): la fila nueva cambia la huella, así que un
  análisis guardado pasa a `staleness.patientData = true` con `changedData` incluyendo `priorTreatments` o
  `clinicalAttributes`. El análisis previo **no se toca** (RN-06); la UI muestra el aviso **no bloqueante** de
  `AvisoAnalisisAnteriores` (RN-26). El change lo demuestra con tests de integración; si algún `changedData` no nombra la
  sección, se ajusta el mapeo en `evidence-analysis` (único código de detección permitido aquí).
- **D7 · UI: reutilizar, no inventar.** «Corregir dato» (`AccionCorregirDato`, por fila, nombre accesible propio, deshabilitada
  con el texto de egresado, RN-17) abre el **diálogo de alta ya existente** en *modo corrección*: el formulario recibe
  `inicial` (valores de la fila) y `corrigeId`; el título y el botón cambian a «Corregir tratamiento previo» / «Guardar
  mi corrección». *Descartado:* corrección en línea como en biomarcadores (variante A de S5-01): el tratamiento tiene 6
  campos y un atributo tiene un selector de catálogo; el formulario de alta ya resuelve esa validación y accesibilidad
  (S5-03 c/d), y un diálogo evita duplicar los dos formularios. El histórico se muestra con `HistoricoDelDato` (desplegable,
  fechas relativas); `key` de fila pasa a ser el `id` (corrige claves duplicables). Tras el `201`, `recargar()` /
  `router.refresh()`.
- **D8 · Orden con `d5fb-04` (resuelto).** `d5fb-04` ya está en la rama base: versión 1.22.0 → este change 1.23.0.
  La declaración «sin tratamiento previo a la fecha» es un `ClinicalAttribute` `sin_tratamiento_previo=si` y no una
  fila de tratamiento; `PriorTreatmentManualCreate` no cambió. El diálogo de tratamiento recibe `estado`
  (`{hayTratamientos, declaracion}`), que la UI de este change debe seguir pasando en modo corrección.
- **D12 · Declaración de ausencia y coherencia D4.** (a) Corregir un tratamiento no toca declaraciones: dentro de la
  misma transacción (paciente bloqueado `FOR UPDATE`) la fila vigente pasa a `reemplazado` y la nueva queda vigente, así
  que nunca hay una ventana con cero tratamientos y declaración, ni con ambos. (b) La declaración es corregible como
  un atributo más (misma operación `correctClinicalAttribute`): solo `observedAt` cambia; `value` debe seguir siendo
  `si` y, como la clave es inmutable, una corrección sin cambio de fecha es «sin cambios» (`422`). No se vuelve a
  evaluar D4 porque no se registra ningún tratamiento, pero la corrección se rechaza si en ese momento hay
  tratamientos vigentes (estado imposible por D4; defensa en profundidad con `422` `field = attributeKey`).
  (c) El checklist (`satisfiedBy`/`resolvedBy`) lee las filas vigentes: corregir la fecha de la declaración la
  mantiene cumpliendo `tratamientos_previos`.
- **D9 · Permisos y CSRF.** `x-permission: clinical:write` para las correcciones y `clinical:read` para el histórico;
  `admin` recibe `403` (no lee ni edita datos clínicos, PRD §11). En `web`, los `POST` verifican `Origin` y reenvían solo
  la cookie de sesión; `4xx` se retransmiten, `5xx` se sanean a `ERROR_INTERNO`; un `id` que no es UUID → `404` propio
  sin llamar a `clinical-api`.
- **D10 · Auditoría y privacidad.** La auditoría completa es de S6 (US-150). Ahora, el evento de log
  `corrections.tratamiento` / `corrections.atributo` lleva solo `patientId` (UUID), ids de filas y `traceId`; nunca
  `regimenName`, valores ni identidad. Nada de identidad entra en estas filas (RN-10); el nombre del esquema es texto
  clínico del catálogo o libre del doctor y sigue el tratamiento de `l1d-80` (desidentificación en el contexto del
  análisis, RN-11).
- **D11 · Estados vacíos.** Sin filas: se conserva «Sin datos registrados» y solo la acción de alta (no hay nada que
  corregir). Una fila sin predecesor no muestra histórico. Paciente egresado: acciones deshabilitadas con el texto de
  egresado; el servidor lo impone igual (`422 PACIENTE_EGRESADO`). Corrección de un dato ya reemplazado (doble envío) →
  `409 DATO_NO_VIGENTE` y el formulario ofrece recargar.

## Privacidad y ownership

- Todo ocurre en `clinical-api` y `web`. `rag-orchestrator` no cambia ni recibe datos nuevos (el contexto desidentificado
  del análisis lee la fila vigente nueva igual que la anterior).
- El paciente se identifica por UUID en rutas y logs; ningún log registra valores corregidos.
- Zod en el borde de `clinical-api` (cuerpo, `id` UUID) y esquemas Zod generados en `web` para validar antes de enviar.

## Contratos (diff del `openapi.yaml`, aditivo)

```yaml
/platform/patients/{patientId}/prior-treatments/{treatmentId}/corrections:
  post: { operationId: correctPriorTreatment, tags: [registro-manual], x-permission: clinical:write,
          requestBody: { $ref PriorTreatmentManualCreate },
          responses: { "201": PriorTreatment (Cache-Control no-store), "401", "403", "404",
                       "409": ErrorDatoNoVigente, "422": ErrorCorreccionInvalida } }
/platform/patients/{patientId}/prior-treatments/{treatmentId}/history:
  get:  { operationId: getPriorTreatmentHistory, x-permission: clinical:read, "200": CorrectionHistory }
/platform/patients/{patientId}/clinical-attributes/{attributeId}/corrections:
  post: { operationId: correctClinicalAttribute, x-permission: clinical:write,
          requestBody: { $ref ClinicalAttributeCorrection }, "201": ClinicalAttribute, "409", "422" }
/platform/patients/{patientId}/clinical-attributes/{attributeId}/history:
  get:  { operationId: getClinicalAttributeHistory, x-permission: clinical:read, "200": CorrectionHistory }
components.schemas:
  ClinicalAttributeCorrection: { required: [value], properties: { value, observedAt (date) } }
  PriorTreatment / ClinicalAttribute / CaseView.priorTreatments[] / CaseView.attributes[]:
    + id (uuid, requerido en respuesta), + supersedesId (uuid|null)
```

`info.version` minor sobre la vigente (1.22.0 tras `d5fb-04`) → **1.23.0**. `PriorTreatment` y `ClinicalAttribute` ya traen `id`; este change añade `supersedesId` y, en `CaseView.priorTreatments[]` y `CaseView.attributes[]`, `id` y `supersedesId`. `CorrectionHistoryEntry` gana el campo opcional `regimenName` (esquema anterior del tratamiento; `value` ya cubre al atributo). Ejemplos nuevos en
`contracts/examples/` (`prior-treatment-correction-request`, `prior-treatment-corregido`,
`clinical-attribute-correction-request`, `clinical-attribute-corregido`, `correction-history-prior-treatment`,
`correction-history-clinical-attribute`) registrados en `index.json`. `contracts:check`, `contracts:generate`,
`contracts:generate:check`, `contracts:breaking` (0 incompatibles; `id` y `supersedesId` solo se añaden a respuestas) y
verificación del proveedor. Skill `sync-contracts`: primero el spec.

## Componentes y patrones

- **Backend:** `Controller → Service → Repository` en `src/modules/corrections/`; reglas puras en
  `corrections.reglas.ts` (`planDeCorreccion`, `hayCambioReal`); service por factory con `Reloj`, IDs y
  `ReconciliationService` inyectados; sin `vi.mock` de módulos propios. Lecturas de tratamientos y atributos de
  `case-view`, `completeness` y contexto del análisis siguen filtrando vigentes (`sqlDatoVigente()`).
- **Web:** `PriorTreatmentsTable` y `ClinicalAttributesTable` aceptan `alCorregir`/`egresado` y pintan `AccionCorregirDato`
  + `HistoricoDelDato` por fila; `DialogoTratamientoPrevio` y `DialogoAtributoClinico` admiten `inicial`/`corrigeId`;
  hook `useEnvioDeCorreccion` existente. Patrón: composición sobre los componentes de `l1d-309`/`l1d-80`.

## Tests

- **Aceptación (Supertest + PostgreSQL real, verificación del proveedor):** corrección crea fila nueva y deja la
  anterior `reemplazado` intacta; histórico ordenado; `409` en reenvío; `422` con `field` (fechas incoherentes, valor
  fuera de catálogo, sin cambios); `422 PACIENTE_EGRESADO`; `403` admin; ATC recalculado o `no_mapeado`; checklist
  cambia tras corregir; el análisis guardado queda `staleness.patientData = true`; log sin valores.
- **Web (Testing Library + MSW desde `contracts/examples/`):** botón por fila, diálogo precargado, error junto al campo
  con `aria-live`, egresado deshabilitado, aviso no bloqueante, histórico con fechas relativas, estado vacío; Route
  Handlers (Origin ajeno → `403` sin llamar a `clinical-api`, retransmisión de `422/409`, `5xx` saneado).
- **TDD (CLAUDE.md):** reglas, service y endpoints → **estricto, doble bucle** (`test(L1D-nn)` en rojo antes de
  `feat`); componentes y Route Handlers → test del AC primero; migración y cableado → test después. Nunca `.skip`.
  `visual-check` (375 y 1280 px, consola, red sin PII en URLs) y un E2E del recorrido en Compose con seed sintético.

## Evaluación

No aplica `run-ai-eval`: ni modelo, prompt, umbral, catálogo ni corpus cambian.

## Riesgos

- **Colisión con `d5fb-04`** en formulario y contrato: mitigada por el orden de D8 y por reusar `PriorTreatmentManualCreate`.
- **`changedData`** puede no distinguir tratamiento/atributo: se cubre con test y, si falta, ajuste mínimo del mapeo (D6).
- **Quien necesita borrar** un registro erróneo sigue sin poder: queda fuera de alcance (pregunta abierta abajo).
- **Cargas de datos con id en vista:** exponer `id` en `CaseView` no revela identidad; es UUID de fila.

## Preguntas abiertas (para el usuario)

1. (Resuelta 2026-11-05) Eliminar/rechazar un dato cargado por error queda fuera de alcance; se anota como deuda.
2. (Resuelta 2026-11-05) La declaración de ausencia es corregible como una fila más (D12).
3. ¿Crear la historia en Linear (L1D)? Solo con aprobación explícita (H.2).
