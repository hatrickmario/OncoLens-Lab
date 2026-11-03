# Proposal — l1d-80-tratamientos-atributos-manuales

## Trazabilidad

L1D-80 · US-094 · FEAT-02b (L1D-10) · Sprint 5 · Estimación **5** · HU-15 · FR-21 (datos manuales) · FR-22
(normalización de datos manuales) · RN-07 · RN-17 · RN-27 · RN-29 · ADR-26 · ADR-33 · ADR-50 (lecturas sin
`reemplazado`) · AC-02.3, AC-02.6, AC-02.7, AC-03.3 (manuales) · US-094 AC-1…AC-6 ·
`backlog/features/FEAT-02b-vista-de-caso.md` · `backlog/sprints/S5-refinamiento.md` D-1, D-3, D-7 (`[S5 resp. 1]`,
`[S5 resp. 3]`) · `docs/ux/S5/pantallas-s5.md` S5-03 c y d, S5-05

## Por qué

Sin OCR en el MVP (PRD E-17), el oncólogo reconstruye el caso a mano. Los tratamientos previos y atributos como el
estado menopáusico o de castración son datos críticos del checklist (`destination.entity = PriorTreatment` y
`ClinicalAttribute`) que hoy no tienen forma de entrar: US-110 cubre biomarcadores y diagnóstico. D-7 fija que toda
fila «Faltante» de esas dos entidades ofrezca la acción manual de US-094, y D-1 la monta en la vista de caso mínima.

## Qué cambia

- **Contrato (aditivo, ADR-26, primera tarea):** `apps/clinical-api/openapi.yaml` gana
  `POST /platform/patients/{patientId}/prior-treatments` (`createManualPriorTreatment`),
  `POST /platform/patients/{patientId}/clinical-attributes` (`createManualClinicalAttribute`) y
  `GET /platform/patients/{patientId}/clinical-attributes` (`listClinicalAttributes`), con los schemas nuevos
  `PriorTreatmentManualCreate`, `PriorTreatment`, `ClinicalAttributeManualCreate`, `ClinicalAttribute`,
  `ClinicalAttributeList` (incluye los atributos permitidos del catálogo para el tipo de cáncer del paciente) y
  `ErrorRegistroClinicoInvalido`. Ejemplos nuevos en `contracts/examples/`. Introduce además la propiedad **opcional
  `field`** (`type: string`, sin enum, misma descripción) en `ErrorRegistroClinicoInvalido` y en los existentes
  `ErrorRegistroManualInvalido` y `ErrorDiagnosticoInvalido` (aditivo; `[S5 resp. 10]`): `l1d-90` y `l1d-91` la usan
  igual y `l1d-309` la replica en `ErrorCorreccionInvalida`. `info.version` 1.17.0 → **1.18.0**. `PriorTreatment.atcCodes`
  usa códigos ATC reales con el mismo patrón que el contrato de `rag-orchestrator` (`^[A-Z][0-9]{2}[A-Z]{2}[0-9]{2}$`,
  sin relajarlo; `[S5 resp. 10]`).
- **`clinical-api`:** módulos nuevos `src/modules/prior-treatments/` y `src/modules/clinical-attributes/`
  (Controller → Service → Repository, Zod generado en el borde, permiso `clinical:write` para POST y `clinical:read`
  para GET; `admin` → `403`).
  - Tratamiento previo: la normalización del esquema (`atcCodes`, `mappingStatus`) la decide
    `ReconciliationService` de `l1d-84` (ADR-33, RN-27); el dato queda `entry_method = manual`,
    `extraction_confidence = n_a`, `review_status = verificado`.
  - Atributo: `attributeKey` y `value` validados contra el catálogo montado para el tipo de cáncer del diagnóstico
    vigente (RN-29); fuera de catálogo → `422 VALOR_FUERA_DE_CATALOGO`.
  - Lectura de atributos solo vigentes con `sqlDatoVigente()` (sin `rechazado`/`reemplazado`, RN-07, ADR-50).
  - Paciente egresado → `422 PACIENTE_EGRESADO` sin crear filas (RN-17).
- **`packages/clinical-catalogs`:** `atributos.json` declara los valores permitidos de cada clave (`values`, campo
  aditivo en `atributos.schema.json`; `atributos.json` 1.2.0) y **subconjunto de ATC** de los fármacos del seed y de la
  demo (`L02AE02` leuprorelina, `L02BB03` bicalutamida, trastuzumab, pertuzumab, trastuzumab emtansina, …) en
  `codigos.json` con las condiciones de DEC-04: nombre inglés literal en `nombreOficial`, DCI en español en `etiquetaEs`,
  aviso de WHOCC en `NOTICE-atc.txt`, **sin DDD** (`[S5 resp. 9]`). `manifest.json` 1.3.0 → **1.4.0**, misma versión
  en ambos backends. Es cambio de catálogo → `run-ai-eval`.
- **`apps/web`:** Route Handlers BFF `app/api/patients/[id]/prior-treatments/route.ts` (POST) y
  `app/api/patients/[id]/clinical-attributes/route.ts` (GET, POST); diálogos «Agregar tratamiento previo» (S5-03 d)
  y «Registrar atributo» (S5-03 c) en la vista de caso mínima (S5-05) de `l1d-76`, que actualizan su sección sin
  recargar la página.

## Capacidades

- `case-timeline` (ADDED): registro manual y lectura de tratamientos previos y atributos clínicos. La capacidad la
  introduce `l1d-74` (aún no está en `openspec/specs/`); este change añade requisitos distintos, sin duplicar.
- `clinical-catalogs` (ADDED): valores permitidos de cada atributo clínico.
- `terminology-reconciliation`: sin delta; se **consume** el requisito de `l1d-84` (su regresión «pasa por el mismo
  servicio» se verifica aquí en integración).

## Bounded contexts

contratos · clinical-platform (`apps/clinical-api`, Route Handlers de `apps/web/app/api`, catálogo) · frontend
(diálogos en `apps/web`). Sin ai-services: `rag-orchestrator` no cambia.

## Dependencias

- ⛔ `l1d-84-normalizacion-final-manual` (US-098): `ReconciliationService` y el fixture FX-01b-b
  (leuprorelina `L02AE02`). Sin él no hay `atcCodes`/`mappingStatus` (AC-1, AC-2).
- ⛔ `l1d-90-registro-manual-biomarcador-diagnostico` (cadena del catálogo): sube `manifest.json` a 1.3.0; este change
  parte de ahí y lo sube a 1.4.0. Quien rebase renumera.
- ⛔ `l1d-74-vista-caso-timeline` (US-088): `GET …/case` para comprobar que el tratamiento aparece en `/case` (AC-1).
- ⛔ `l1d-76-…` (US-090, change por crear): la página `/pacientes/[id]/caso` con las secciones «Tratamientos
  previos» y «Atributos clínicos» donde se montan los botones (AC-6). Solo bloquea las tareas de `## frontend`.
- 🔗 Coordinación con `l1d-90-…` (US-110, change por crear): comparten la guarda de RN-17 y el episodio vigente; el
  primero que llegue a `main` crea `compartido/registro-manual.ts`, el otro lo reutiliza. También el `Dialog` de
  shadcn/ui (S5-refinamiento §Stack): se añade en el primer change que lo necesite.
- 🔗 Cadena de versiones del `openapi.yaml` de `clinical-api` (orden de merge): 1.15.0 → `l1d-306` 1.15.1 → `l1d-268`
  1.16.0 → `l1d-74` 1.17.0 → **`l1d-80` 1.18.0** → `l1d-309` 1.19.0 → `l1d-91` 1.20.0. Quien rebase renumera y regenera
  `packages/api-contracts` (nunca fusiona generados a mano).
- 🔗 Consumida por: FEAT-04 US-004 (`l1d-96`, faltantes con acción, D-7) reutiliza los dos diálogos.
- 🔗 Regresión [RN-27] → US-098 · 🔗 Regresión [RN-17] → US-198 (Post-MVP).

## Fuera de alcance

- Registro manual de biomarcadores y diagnóstico (US-110) y `ClinicalEvent` manual (FEAT-11b, Post-MVP).
- Corrección con histórico de un tratamiento o atributo ya registrado (`supersedes_id`, ADR-50 cubre biomarcador,
  examen y nota en US-253); `GET …/prior-treatments` (la lectura es `/case`).
- Si un dato manual cuenta como verificado en el checklist: decidido por DEC-01 Q1 (cuenta como verificado;
  `[S5 resp. 13]`); aquí solo se guarda `verificado`.
- Autocompletado ATC en el formulario (texto libre que normaliza Backend 1) y la tendencia (US-091).
