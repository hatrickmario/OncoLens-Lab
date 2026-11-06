# Design — d5fb-04-sin-tratamiento-previo-a-la-fecha

## Contexto

`PriorTreatment` (`clinical.prior_treatment`) exige `setting`, `regimenName`, `ongoing` y, si terminó, `endReason`
(`PriorTreatmentManualCreate`, `additionalProperties: false`). El ítem del catálogo `tratamientos_previos` tiene
`destination = { entity: PriorTreatment }` y `minValues = 1`: el cálculo de completitud (`completeness.rules.ts`,
`registrosVigentes` → `minValues`) solo sabe contar filas de la entidad destino. `ClinicalAttribute` ya es un par
clave-valor con fecha (`observed_at`, `date_precision`), origen (`entry_method`), `review_status`, historia
(`reemplazado`, RN-07) y lista cerrada de claves en `packages/clinical-catalogs/atributos.json` (RN-29). El contexto
desidentificado a Backend 2 ya incluye `attributes[]` (`contexto_del_paciente.py`) y `priorTreatments[]`; el lector
`("PriorTreatment","line_number")` ignora tratamientos sin número de línea.

## Decisiones

### D1 · Representación: atributo clínico `sin_tratamiento_previo` (opción B)

| Opción | A favor | En contra |
|---|---|---|
| **A** fila `PriorTreatment` con marca `sin_tratamiento` | un solo lugar; `minValues` ya cuenta | **Es una fila falsa**: `regimenName`/`setting` obligatorios obligan a inventarlos; todo consumidor (tabla, línea de tiempo, `lineNumber`, `ongoing`, conteo de líneas, contexto RAG, `atcCodes`/`mappingStatus`, revisión de términos no mapeados) debe filtrarla; riesgo de que el RAG la lea como régimen. Rompe `PriorTreatmentManualCreate`/`PriorTreatment` y el modelo (cambio de esquema, migración) |
| **B** `ClinicalAttribute` | ya tiene fecha, fuente, `review_status`, historial y reemplazo (RN-07/RN-08); **sin migración** (solo catálogo de datos); la lista cerrada de claves es la que valida (RN-29); `CaseView.attributes` y `ClinicalContext.attributes` ya lo transportan; no ensucia la tabla de tratamientos | `completeness` debe aprender que un atributo puede cumplir un ítem de otra entidad (se declara en el catálogo: D2); hay que cuidar la coherencia entre dos tablas (D4) |
| **C** campo en `Diagnosis`/`Patient` | simple | Mezcla un hecho clínico fechado con una entidad de otro ciclo de vida; sin historial propio ni fuente; migración; un diagnóstico se corrige/reemplaza (RN-08) y arrastraría la declaración; expone el dato a más consumidores |

**Elegida: B.** Es la única que no inventa un tratamiento, no migra el esquema y reutiliza fecha, fuente, verificación e
historial. Valor único `si` (la ausencia de declaración es la ausencia de la fila; `no` no existe: «tiene tratamientos»
se expresa registrándolos). `observed_at` = fecha de la declaración («a la fecha»), `date_precision = dia`.

### D2 · Completitud: el catálogo declara qué cumple el ítem (`satisfiedBy`)

`datos-criticos.json` → `tratamientos_previos` gana `satisfiedBy: [{ entity: "ClinicalAttribute", attribute_key:
"sin_tratamiento_previo", value: "si" }]` (RN-29: todo ítem sigue teniendo destino en el modelo; `satisfiedBy` lo
acompaña, no lo sustituye; el esquema JSON del catálogo se extiende de forma opcional). `CompletenessService` aplica un
paso nuevo y puro: si el ítem no alcanza `minValues` con su destino y existe un registro vigente (RN-07) que coincide
con `satisfiedBy`, el ítem queda presente (estado por el `review_status` de esa declaración, igual que
`estadoDeVerificacion`), con `origin` y `provenance` de la declaración y `resolvedBy = declaracion_de_ausencia`.
Si hay tratamientos suficientes, gana el destino (`resolvedBy = registro`). *Descartado:* cablear
`if (item === 'tratamientos_previos')` (viola «las reglas vienen del catálogo, no del código») y cambiar `minValues` a 0
(el ítem dejaría de poder estar faltante).

### D3 · Contrato aditivo

`CompletenessItem.resolvedBy` opcional (`registro` | `declaracion_de_ausencia`); la UI lo usa para el texto «Sin
tratamiento previo (declarado)» sin leer claves clínicas. `POST …/clinical-attributes` documenta el `422` de D4.
Sin endpoint nuevo: el formulario reutiliza `createManualClinicalAttribute`. `info.version` sube un minor; el
`contracts:breaking` debe dar 0 incompatibles; se regeneran `packages/api-contracts` y los schemas Zod y se añaden
ejemplos (`completeness-…-sin-tratamiento.json`, `error-declaracion-incoherente.json`). Un contrato de `PriorTreatment`
sin cambios implica que **la validación Zod del tratamiento sigue exigiendo todos sus campos**: la opción no relaja el
formulario del tratamiento real, lo **sustituye** (D5).

### D4 · Regla de coherencia: una sola verdad

- **Registrar un `PriorTreatment` manual con declaración vigente** → en la misma transacción la declaración pasa a
  `reemplazado` (historia conservada, RN-05/RN-07) y el `201` no cambia. Es un acto explícito y verificado del mismo
  oncólogo; no es el caso que RN-08 protege (un dato *extraído* no sustituye en silencio a uno verificado).
- **Declarar «sin tratamiento previo» con ≥1 `PriorTreatment` vigente** → `422` `ErrorRegistroManualInvalido` con
  `field = attributeKey` y mensaje «Hay tratamientos previos registrados; no se puede declarar su ausencia». Sin
  efecto lateral.
- **Re-declarar** (ya hay una vigente): crea una nueva con la fecha nueva y reemplaza la anterior (regla ya vigente de
  atributos por clave).
- **Post-MVP (OCR):** un tratamiento *extraído* posterior a la declaración no la reemplaza: la deja
  `requiere_revision` con `conflicts_with_id` (RN-08). Se documenta aquí para que la ingesta futura no lo olvide.
- **Paciente egresado:** `422` como todo registro (RN-17). **Opt-out:** no aplica (no es generación de IA).
- **Autorización:** `clinical:write` (oncólogo); `admin` no lee ni escribe datos clínicos.

### D5 · UI

`DialogoTratamientoPrevio` (organismo existente) añade una casilla «Sin tratamiento previo a la fecha» arriba de los
campos.
- **Marcada:** régimen, línea, contexto, inicio, fin, «En curso» y motivo se ocultan (no solo se deshabilitan, para que
  los lectores de pantalla no los anuncien), **se excluyen de la validación** y del cuerpo; queda solo «Fecha de la
  declaración» (obligatoria, no futura, por defecto hoy). «Guardar» envía `POST /api/patients/{id}/clinical-attributes`
  con `{ attributeKey: "sin_tratamiento_previo", value: "si", observedAt, datePrecision: "dia" }`.
- **Desmarcada:** el formulario actual intacto. Los valores escritos se conservan en memoria al alternar.
- Si ya hay tratamientos registrados, la casilla no se ofrece (D4); si ya hay declaración, el diálogo muestra «Sin
  tratamiento previo declarado el ‹fecha›» y ofrece «Registrar un tratamiento» (que la reemplaza al guardar, con aviso
  previo «Esto reemplazará la declaración “Sin tratamiento previo”»).
- Foco, `aria-describedby` y errores junto al campo como el resto de diálogos (`manual-clinical-entry`). Tras el `201`,
  `alGuardar` relee checklist y vista (L1D-96 D5). Textos en `messages/es.json` sin términos prohibidos (RN-23).
- La acción del faltante `tratamientos_previos` sigue siendo «Agregar tratamiento previo» (abre este diálogo).

### D6 · Análisis y desidentificación (RN-11)

`ClinicalContext.attributes` ya lleva `{ key, value, monthsAgo, provenance }`: la declaración viaja con fecha relativa,
sin identidad ni texto libre (valor de lista cerrada), así que no añade superficie de PII. Dos garantías nuevas, probadas:
(1) el contexto con declaración y `priorTreatments = []` produce la frase determinista «Sin tratamiento previo a la fecha
(declarado hace N meses)» (verbalización ADR-34), distinta de la omisión cuando no hay declaración; (2) la declaración
**no** es citable ni soporte NLI como corpus (RN-24: es dato del paciente, enlazable como tal). Aplicabilidad:
`linea_tratamiento` no cambia —«Sin tratamiento» no equivale a «línea 1» (puede ser adyuvante o metastásica)—, así que
sigue «Desconocido» con `unknownReason`; la diferencia visible es que el hecho del paciente aparece declarado, no
ausente. Si se decide mapear a «Coincide» sería una regla de catálogo y de dominio nueva, con `ai-eval` (OL-06), en otro change.
Si la verbalización toca texto de prompt, corre `run-ai-eval` (obligatoria en cambios de prompt).

### D7 · Vista de caso, auditoría y logs

La sección de tratamientos de `CaseView` ya recibe `attributes`; con 0 tratamientos y declaración vigente muestra «Sin
tratamiento previo a la fecha (declarado el ‹fecha relativa›)» + su origen; sin ninguna, «Sin datos». La línea de tiempo
no recibe evento. La escritura del atributo hereda el registro y la auditoría de los registros manuales; ningún log
incluye valores clínicos (solo UUID de paciente y `traceId`).

## Riesgos

- Catálogo y código divergen: el validador del catálogo (CI) falla si `satisfiedBy` apunta a una clave ausente de `atributos.json`.
- Doble verdad por carrera (dos pestañas): D4 se aplica con transacción y bloqueo de la fila del paciente; test de concurrencia.
- Clínica puede querer otra semántica de aplicabilidad (Pregunta abierta 1); queda aislada.

## Pruebas (política TDD del proyecto)

- **TDD estricto, doble bucle** (reglas RN, services, endpoints): regla pura de completitud y de coherencia (Vitest);
  aceptación Supertest + PostgreSQL real; commit `test(…)` en rojo antes del `feat(…)`.
- **Test del AC primero** (UI): Testing Library + MSW desde `contracts/examples/`; `visual-check`.
- **Test después**: catálogo/validador, contrato (`contracts:check`/`breaking`), E2E.
