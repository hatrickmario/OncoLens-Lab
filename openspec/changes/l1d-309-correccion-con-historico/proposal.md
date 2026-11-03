# Proposal — l1d-309-correccion-con-historico

## Trazabilidad

L1D-309 · US-253 · FEAT-03b (L1D-13) · Sprint 5 · Estimación **5** (D-6, `[S5 resp. 4]`) · CAP-04 (AC-04.1) · FR-23 ·
RN-07, RN-08, RN-11, RN-17, RN-26, RN-27 · ADR-50 (D-2, `[S5 resp. 2]`) · ADR-40 · ADR-33 · ADR-26 · PRD E-17, §10,
§11 · US-253 AC-1…AC-6 · D-10 (AC-5 sin US-251) · UX `docs/ux/S5/pantallas-s5.md` S5-01 variante A `[S5 resp. 4]` ·
`backlog/features/FEAT-03b-revision-conflictos-registro-manual.md` §US-253 · `backlog/sprints/S5-refinamiento.md`
D-2, D-6, D-10 · 🔗 Medido en: US-142 (G-Demo, D-5: «ficha con una corrección de biomarcador»)

## Por qué

Sin OCR en el MVP (PRD E-17) el oncólogo construye el caso a mano y necesita **corregir** lo ya registrado para que el
análisis parta de datos correctos, sin perder lo que había (RN-08: nada se sobrescribe en silencio). `Diagnosis` ya
resuelve la corrección con una fila `manual_correction` y la anterior `reemplazado` (US-110 AC-2); `Biomarker`, `Exam`
y `ClinicalNote` no pueden enlazar su versión anterior. ADR-50 fija el patrón: fila nueva, anterior `reemplazado`,
enlace `supersedes_id`.

## Qué cambia

- **Contrato primero** (`apps/clinical-api/openapi.yaml`, cambio **aditivo**, ADR-26; hoy no existen; `info.version`
  *minor* **1.19.0** (provisional: se implementó **1.18.0**; L1D-80 renumera a 1.19.0 al rebasar) según la cadena de versiones del S5: l1d-306 1.15.1 → l1d-268 1.16.0 → l1d-74 1.17.0 → l1d-80
  1.18.0 → **l1d-309 1.19.0** → l1d-91 1.20.0; quien rebasa renumera y regenera `packages/api-contracts`):
  - `POST /platform/patients/{patientId}/biomarkers/{biomarkerId}/corrections` → `201 Biomarker` (valor, unidad,
    rango y, opcional, fecha del examen).
  - `POST /platform/patients/{patientId}/clinical-notes/{noteId}/corrections` → `201 ClinicalNote` (texto y tipo).
  - `GET /platform/patients/{patientId}/clinical-notes` → notas vigentes de la ficha (`ClinicalNoteList`, sin paginación).
  - `GET …/biomarkers/{biomarkerId}/history` y `GET …/clinical-notes/{noteId}/history` → cadena `supersedes_id`.
  - Schemas nuevos `BiomarkerCorrection`, `ClinicalNote`, `ClinicalNoteList`, `ClinicalNoteCorrection`, `CorrectionHistory`,
    `ErrorCorreccionInvalida` (`CUERPO_INVALIDO | PACIENTE_EGRESADO | VALOR_FUERA_DE_CATALOGO`; `field` opcional,
    `type: string`, sin enum, misma descripción que en los demás 422 que introduce l1d-80, `[S5 resp. 10]` (3)),
    `ErrorDatoNoVigente` (`409 DATO_NO_VIGENTE`); propiedad **opcional** `supersedesId` en `Biomarker`.
    Errores `401`, `403` (`clinical:write`/`clinical:read`, admin sin acceso), `404`, `409`, `422`. Ejemplos nuevos en
    `contracts/examples/`.
- **Esquema** (migración Prisma aditiva + `docs/architecture/data-model.md`, en su **propio commit tras el
  `contract(L1D-309)`**, nunca dentro de él): `supersedes_id uuid NULL REFERENCES …(id)` en `clinical.biomarker`,
  `clinical.exam` y `clinical.clinical_note`, con índice único parcial (una fila solo puede ser reemplazada una vez).
  La vigencia de `Exam` es derivada, sin columna `review_status` (P-1, Decidido (usuario, 2026-11-03), `[S5 resp. 13]`).
- **`clinical-api`**: módulo `src/modules/corrections/` (`Controller → Service → Repository`) con la regla de
  corrección en un único método (`planDeCorreccion()`, RN-08): fila nueva `manual_correction` `verificado`, anterior
  `reemplazado` (`is_active = false` en la nota) en una transacción; normalización del biomarcador por
  `ReconciliationService` (l1d-84, RN-27); RN-17 (`422`) antes de escribir; fecha posterior a hoy → `422` con `field`.
  La fecha corregida de un biomarcador mueve el dato a un `Exam` de corrección (`supersedes_id` al examen anterior
  solo si era su único biomarcador vigente).
- **`apps/web`**: Route Handlers BFF de corrección, historia y notas; en la ficha (variante A de S5-01), acción
  «Corregir dato» por fila en `RecentBiomarkersTable` y en la nueva sección «Notas clínicas», formulario en línea
  «Guardar mi corrección» / «Cancelar», histórico desplegable, aviso fijo de nombres en la nota libre (AC-6), error
  `422` junto al campo y aviso no bloqueante sobre análisis anteriores (AC-5, RN-26). Fechas del histórico en formato
  relativo («hoy», «hace 12 días», `[S5 resp. 11]` (d)). Textos en `messages/es.json`.
- **Seed sintético**: una nota `comorbilidad` y una `nota_libre` sin PII en el paciente semilla (a), para la demo
  (P-3, Decidido (usuario, 2026-11-03), `[S5 resp. 13]`).

## Capacidades

- `human-control` (ADDED): corrección trazable de datos registrados por el oncólogo (RN-08) y su presentación en la
  ficha. Es la capacidad del control humano sobre los datos del caso (FEAT-03b); se justifica aquí porque hoy solo
  contiene el control del lenguaje (RN-23) y la revisión de datos le pertenece por la lista de `openspec/config.yaml`.
- `api-contracts` (ADDED): operaciones de corrección, historia y notas.
- `data-model` (ADDED): `supersedes_id` en las tres tablas.
- `deidentification` (ADDED): una nota corregida nunca viaja a la IA mientras rija la minimización de notas
  (`[S5 resp. 12]`); si algún día entra, solo tras el detector de PII.
- `web-bff` (ADDED): Route Handlers de corrección con verificación de `Origin`.

## Bounded contexts

- `contratos` (primera tarea), `clinical-platform` (`apps/clinical-api`, Route Handlers de `apps/web/app/api`),
  `frontend` (`apps/web` UI). Ni `ai-services` ni `rag-orchestrator`.

## Dependencias

- ↪ `l1d-84-normalizacion-final-manual` (US-098): `ReconciliationService` decide `name`/`loincCode`/`mappingStatus`
  del biomarcador corregido; este change no reimplementa RN-27.
- ↪ `l1d-90-registro-manual-biomarcador-diagnostico` (US-110): mismo patrón de corrección en `Diagnosis`, `Exam`
  `registro_manual` y error `PACIENTE_EGRESADO`; se reutilizan sus reglas de validación (fecha, catálogo).
- ↪ `l1d-72-ficha-minima-paciente` (ficha y `RecentBiomarkersTable`, en `main`).
- 🔗 `l1d-74-vista-caso-timeline` (US-088): su D6 ya excluye del timeline un examen sin biomarcadores vigentes; con
  este change la lectura de la vista de caso sigue sin mostrar filas `reemplazado`.
- ↪ US-094 (L1D-80, tratamientos y atributos): sin dependencia de código; comparte la sección `## contratos` del
  `openapi.yaml` en la misma oleada (O2): conflictos de merge triviales, se resuelven en orden de PR.
- 🔗 US-251 (S6): reutilización de un análisis por huella del contexto; aquí solo se verifica que la huella cambia (D-10).
- 🔗 US-150 (S6): auditoría completa de la acción.

## Fuera de alcance

- Reutilización de un análisis guardado (US-251, S6): AC-5 se verifica como «la huella cambia y el aviso no bloquea» (D-10).
- Enviar notas clínicas al contexto de la IA: siguen minimizadas en el S5 (`clinicalNotes = []`, requisito vigente de
  `deidentification`; P-2, Decidido (usuario, 2026-11-03), `[S5 resp. 12]`).
- Crear notas nuevas desde la ficha, borrar datos, corregir diagnósticos (ya en US-110), tratamientos y atributos (US-094).
- Corrección de un examen completo con varios biomarcadores (fecha o laboratorio para todos): Post-MVP con el OCR
  (sin extracción, cada examen manual tiene un biomarcador).
- Auditoría de la acción (US-150, S6); vista «Historial del dato» en página propia (variante C descartada).
- Orden de recorte del S5 (6): «US-253 sin exámenes» → se quita la regla de fecha de examen (tarea 2.6) y el AC-1 sigue en pie.
