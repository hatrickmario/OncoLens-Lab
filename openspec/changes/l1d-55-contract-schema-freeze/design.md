# Design — l1d-55-contract-schema-freeze

## Context

Ver proposal.md (Why). Estado actual: no hay código; los contratos viven como YAML OpenAPI 3.0.3
dentro de readme §4.1 (`clinical-api`) y §4.2 (`rag-orchestrator`), y el DDL y el diagrama del
modelo en readme §3.1. Las decisiones del refinamiento del Pre-S1 (DEC-05,
`[Pre-S1 resp. 1–3, 11, 12, 14–17]`, `[§15 resp. 3, 4]`), las de la primera vuelta del Gate 1
(`[Pre-S1 resp. 18–25]`, 2026-10-11), las de la segunda vuelta (`[Pre-S1 resp. 26–29]`,
2026-10-11: correcciones aceptadas sin re-gate, el Gate 2 las verifica) y las brechas UX-1…UX-8 de
`docs/ux/flujo-e2e.md` no están en ningún artefacto verificable. Fuentes: PRD v1.4 (FR-31,
E-01…E-10) > readme > CLAUDE.md. Decisiones citadas, no reabiertas: ADR-26 (contrato estable,
bloques vacíos y nunca ausentes), ADR-10 (Milvus), ADR-21 (diagnóstico genérico), ADR-33
(normalización final en Backend 1), ADR-34 (afirmaciones sobre datos del paciente), ADR-36
(licencias).

## Goals / Non-Goals

**Goals:**
- Dos `openapi.yaml` 3.1 válidos como fuente única (provider-driven), con los schemas compartidos
  en un solo origen y todos los schemas cerrados (`required`, `additionalProperties: false`).
- Ejemplos versionados, **no normativos** y sintéticos, que prueban el contrato y alimentan los
  mocks (US-213).
- `contracts:check` determinista, local, sin red, con salida que nombre archivo, ruta JSON y AC.
- `contracts:generate` mínimo y reproducible (`contracts:generate:check` sin diferencias), que
  también escribe el extracto no normativo del readme §4 `[Pre-S1 resp. 28]`.
- Modelo de datos congelado en `docs/architecture/data-model.md`, **fuente única** (DDL, diagrama,
  matriz de permisos y aislamiento), que US-038 y US-058 implementan sin decidir nada
  `[Pre-S1 resp. 29]`.

**Non-Goals:**
- `contracts:breaking` (oasdiff) y `contracts:verify-provider` (US-214, S2); CI (US-036).
- Clientes HTTP generados y empaquetado de `packages/api-contracts` (US-214).
- Migraciones, Prisma, Alembic, colección Milvus real.
- Permiso `patients:reveal_identity` (lo añade US-222 en el S6 como cambio aditivo,
  `[Pre-S1 resp. 27]`).

## Decisions

### D1. Origen único de los schemas compartidos (cara de revertir: contrato)
`contracts/schemas/evidence.yaml` define **exactamente** estos ocho schemas (lista canónica; la
misma en el delta y en AC-8): `EvidenceOption`, `DiscardedOption`, `Synthesis`, `SupportedClaim`,
`SourceApplicability`, `ApplicabilityCriterion`, `ApplicabilitySummary` y `CitedSource` (más
`CitedSourceFields`, auxiliar abierto para la composición de D7). `Provenance` **no** es compartido
(`[Pre-S1 resp. 25]`): `clinical-api` declara la suya (con `sourceDocumentId` y
`additionalSourceDocumentIds`) y `rag-orchestrator` la suya, sin ids de documento. Ningún schema
compartido referencia a `Provenance`. Ambos specs los usan vía
`$ref: '../../contracts/schemas/evidence.yaml#/components/schemas/<X>'`.

| Opción | Criterio: un solo origen (AC-8) | Criterio: cada spec autocontenido para herramientas | Decisión |
|---|---|---|---|
| A. Archivo compartido + `$ref` externo | Sí, por construcción | Sí tras *bundle* en memoria | **Elegida** |
| B. Copias en cada spec + test de igualdad | No: dos orígenes que el test vigila | Sí | Descartada: permite divergencia hasta el siguiente check |
| C. `rag-orchestrator` dueño y `clinical-api` referencia su spec | Sí | Sí | Descartada: acopla el contrato público a uno interno y mezcla proveedores (ownership) |

Verificación de AC-8 en dos niveles: (1) `assertSharedSchemasSingleOrigin()` recibe el spec
**crudo** (sin *bundle*) y exige que cada uno de los ocho nombres, donde aparezca en
`components.schemas` o en línea, sea un `$ref` a `contracts/schemas/evidence.yaml`; (2) tras
`contracts:generate`, compara los tipos generados de esos ocho schemas para ambos proveedores y
exige que sean textualmente idénticos (D6, AC-16).

### D2. Herramientas de `contracts:check`
Node ESM (`package.json` raíz con `"type": "module"`) en `scripts/contracts/check.mjs`, invocado
por `npm run contracts:check`. El `package.json` raíz es mínimo (scripts y devDependencies de
contratos); los *workspaces* los completa la historia de monorepo. Piezas, versiones fijadas
exactas en el `package.json`:
- `@redocly/openapi-core`: lint OpenAPI 3.1 (reglas `spec`, sin estilo opinado). El *bundle*
  **en memoria** lo hace `scripts/contracts/lib/bundle.mjs`, un empaquetador propio
  **`[Pre-S1 resp. 35 (D-6)]`** (enmienda de D2, que preveía `bundleDocument` de
  `@redocly/openapi-core`): internaliza solo los `$ref` a
  `contracts/schemas/evidence.yaml#/components/schemas/<Nombre>` y **falla cerrado** ante
  cualquier otra `$ref` externa (arreglo de Gate 2 DPR-7: `bundleOrFail` devuelve el error del
  spec, nunca un *bundle* parcial). Un test comprueba que sus `components.schemas` coinciden con
  los de `@redocly/openapi-core`. **Deuda técnica, S2:** migrar a `bundleDocument` y retirar
  `lib/bundle.mjs` (historia de deuda técnica por abrir en el refinamiento del S2; el código no se
  migra en este change). El *bundle* nunca se escribe en el repo; si una herramienta necesita
  archivo, va a `os.tmpdir()` y se borra al terminar.
- `ajv` (`Ajv2020`, `strict: true`) + `ajv-formats`: valida cada ejemplo contra el destino que
  declara `contracts/examples/index.json`.
- `fast-json-patch`: aplica en los tests los parches de mutación sobre los specs reales.
- Reglas puras propias (ver `## Dependencias y colaboradores`).
- Salida: una línea por hallazgo `ARCHIVO:ruta-json — <regla> — AC-n|RN-n — mensaje`; código ≠ 0
  si hay alguno. Si un spec no existe en su ruta, el hallazgo nombra el archivo ausente.
Descartadas en una línea: Spectral (reglas a medida en otro DSL, más difícil de testear con
parches); `swagger-parser` (soporte 3.1 incompleto).

### D3. Ejemplos (no normativos, sintéticos)
Planos en `contracts/examples/`, todos sintéticos (`dataClassification: sintetico` donde exista).
**Convención sintética** (verificada por `assertExamplesSynthetic()`, RN-14): todo identificador
de documento o nombre de archivo empieza por `SINT-`; todo `nationalId` empieza por `SINT-`; todo
nombre de persona es "Prueba Sintética" (o "Prueba Sintética <n>").

| Archivo | Destino en `index.json` |
|---|---|
| `con-evidencia-s1.json` | `clinical-api#EvidenceAnalysis` (1 opción, síntesis vacía, `applicability = []`, cita con `authors = null`, **`staleness` neutro** —`patientData = false`, `changedData = []`, `newerEvidenceOrCatalog = false`— y `newerVersionAvailable = false` en la cita, `[Pre-S1 resp. 29]`) |
| `sin-evidencia.json` | `clinical-api#EvidenceAnalysis` (`evidenceOptions = []`, `topRelevanceScore = null`) |
| `tipo-no-habilitado.json` | `clinical-api#EvidenceAnalysis` |
| `con-evidencia-s4.json` | `clinical-api#EvidenceAnalysis` (forma del S4 de readme §4.1: hasta 3 opciones, síntesis y aplicabilidad pobladas, `unknownReason: null` en un criterio, cita con `sourceUrl = null`, una afirmación anclada a `patientDataRefs: ["r2"]` con su `patientDataLinks`; **`agentSteps = []`**, porque el agente es Post-MVP) |
| `follow-up-turn.json` | `clinical-api#FollowUpTurn` (`con_evidencia`, una cita con `isNewSource: true` y otra `false`) |
| `follow-up-fuera-de-contexto.json` | `clinical-api#FollowUpTurn` (`answer = []`, `citedSources = []`) |
| `follow-up-create.json` | `clinical-api` `POST …/follow-ups` requestBody |
| `error-limite-seguimiento.json` | `clinical-api` `POST …/follow-ups` respuesta `409` |
| `error-opt-out.json` | `clinical-api` `POST …/follow-ups` respuesta `403` |
| `error-analisis-sin-evidencia.json` | `clinical-api` `POST …/follow-ups` respuesta `422` |
| `error-credenciales-invalidas.json` | `clinical-api` `POST /platform/auth/login` respuesta `401` (`CREDENCIALES_INVALIDAS` + `traceId`) |
| `login-request.json` | `clinical-api` `POST /platform/auth/login` requestBody (correo `@ejemplo.invalid`) |
| `diagnosis-manual-gleason.json` · `diagnosis-manual-nottingham.json` | `POST …/diagnoses` requestBody (Gleason solo con patrones; `gleasonScore`/`isupGradeGroup` ausentes) |
| `diagnosis-manual-gleason-completo.json` | `POST …/diagnoses` requestBody (con `gleasonScore` e `isupGradeGroup` coherentes) |
| `diagnosis-con-gradings.json` | `clinical-api#Diagnosis` (`grade` derivado + `gradings[]`) |
| `biomarker-manual.json` | `POST …/biomarkers` requestBody |
| `patient-search.json` | `POST /platform/patients/search` requestBody |
| `patient-summary-doctor.json` | `clinical-api#PatientSummary` |
| `patient-summary-admin.json` | `clinical-api#PatientAdminSummary` |
| `rag-query-request.json` · `rag-query-con-evidencia.json` | `rag-orchestrator#RagQueryInternalRequest` / `#RagQueryInternalResponse` (sin `agentLimits`; `dataRef` `r1…rN` en `clinicalContext`) |
| `rag-query-tipo-no-habilitado-422.json` | `rag-orchestrator` `POST /rag/query` respuesta `422` |
| `rag-validacion-422.json` | `rag-orchestrator` `POST /rag/query` respuesta `422` (`ErrorValidacion`, sin el valor recibido) |
| `rag-follow-up-request.json` · `rag-follow-up-response.json` | `rag-orchestrator#RagFollowUpRequest` / `#RagFollowUpResponse` |

`index.json` es una lista de `{ file, spec, target }`, donde `target` es un puntero JSON a un
schema (`#/components/schemas/X`), a un `requestBody` o a una respuesta
(`#/paths/~1platform~1evidence-analyses~1{analysisId}~1follow-ups/post/responses/409`). Todo
código de error declarado en el spec tiene al menos un ejemplo asociado o queda listado en
`index.json` como `pendingExample` con su historia dueña. NCCN/ESMO solo aparecen dentro de
`sourcesNotIncluded`, como exclusión (`[Pre-S1 resp. 12]`). Los ejemplos de Backend 2 no tienen
claves de identidad ni fechas absolutas dentro de `clinicalContext`, `analysisMemory`, `query` ni
`question`; el patrón de fecha cubre `AAAA-MM-DD`, `DD/MM/AAAA`, `D/M/AA` y "<d> de <mes> de
<año>" (privacy M-9).

### D4. `licenseClass` (cara de revertir: contrato y esquema) `[Pre-S1 resp. 21]`

| Opción | Criterio: estable entre sprints (ADR-26) | Criterio: refleja ADR-36/E-07 sin ambigüedad | Decisión |
|---|---|---|---|
| A. Enum de 3 valores (`dominio_publico \| cc_by \| cc_by_sa`) | No: añadir `cc_by_nc` después es un cambio de enum en respuesta, incompatible | Sí para el MVP | Descartada |
| B. Enum de 4 valores (`dominio_publico \| cc_by \| cc_by_sa \| cc_by_nc`) en contrato y DDL de `corpus`; el MVP acepta 3 por `CORPUS_ACCEPTED_LICENSES` | Sí: el universo no cambia al habilitar CC BY-NC | Sí: CC0 → `dominio_publico`; CC BY-NC existe como valor pero la ingesta del MVP lo rechaza (E-07); ND no existe (RN-21) | **Elegida** |
| C. `string` abierto | Sí | No: no valida, admite ND o NCCN por error | Descartada |

El DDL de `corpus` declara el mismo enum (CHECK o tipo enumerado). Que el MVP solo acepte tres es
regla de ingesta (US-058/FEAT-06c), no de contrato.

### D5. Transcripción 3.0.3 → 3.1
`nullable: true` → `type: [<t>, "null"]`; `example` → `examples`. En los **enums nullable** el
`null` se añade explícitamente al `enum` (`type: [string, "null"]`, `enum: [falta_en_paciente,
no_reportado_por_fuente, null]`): en 3.0.3, `nullable` sin `null` en el enum no admitía `null`, así
que la transcripción **corrige** el readme para expresar su intención (que el valor pueda faltar),
no es una transcripción literal. El ejemplo del S4 incluye `unknownReason: null` para probarlo. Se
registra como vacío resuelto. Afecta a `unknownReason`, `patientDataWarning`, `trend` y a
`DiagnosisGrading.specimenType`/`gradeScope` (D9). La regla `assertNullableEnums()` (parte de
`assertClosedSchemas()`) exige `null` en el `enum` de todo enum cuyo `type` admite `null`.

### D6. `contracts:generate` mínimo `[Pre-S1 resp. 20, 28]`
`scripts/contracts/generate.mjs`, desde los specs *bundled* en memoria (volcados a `os.tmpdir()`
solo para las herramientas que exigen archivo). **Layout de salida** (alineado con CLAUDE.md y la
skill `sync-contracts`, que reservan `packages/api-contracts/src/zod/` para los Zod compartidos):

| Generado | Ruta |
|---|---|
| Tipos TS | `packages/api-contracts/src/types/<proveedor>/types.gen.ts` |
| Schemas Zod | `packages/api-contracts/src/zod/<proveedor>/zod.gen.ts` |
| Modelos Pydantic v2 | `apps/rag-orchestrator/app/schemas/generated/` |
| Extracto del readme | `readme.md` §4, entre `<!-- contracts:readme-extract:start -->` y `<!-- contracts:readme-extract:end -->` |

`<proveedor>` ∈ `clinical-api`, `rag-orchestrator`. Los clientes HTTP de US-214 irán en
`packages/api-contracts/src/clients/<proveedor>/`.
- **TS y Zod:** `@hey-api/openapi-ts` (soporta 3.1) con los *plugins* de tipos y de Zod. Sin
  clientes HTTP (US-214).
- **Pydantic v2:** `datamodel-code-generator` (versión fijada en
  `scripts/contracts/requirements-codegen.txt`, `--output-model-type pydantic_v2.BaseModel
  --disable-timestamp --use-annotated`) desde el spec de `rag-orchestrator`. Si falta Python o el
  paquete, el script falla con un mensaje que dice cómo instalarlo; no hay *fallback*.
- **Extracto del readme** (`contracts:readme-extract`, también invocado por `contracts:generate`)
  `[Pre-S1 resp. 28]`: YAML de tres operaciones representativas —`POST
  /platform/patients/{patientId}/documents`, `POST /platform/evidence-analyses` y `GET
  /platform/patients/{patientId}`— copiadas del spec *bundled* de `clinical-api`, precedidas de la
  línea "Extracto generado de `apps/clinical-api/openapi.yaml` — no normativo; el spec manda". El
  resto de readme §4.1/§4.2 enlaza a los specs.
- Cada archivo generado empieza con la cabecera `GENERADO desde <spec> — no editar a mano`.
- `npm run contracts:generate:check` = `contracts:generate` y después
  `git diff --exit-code -- <rutas generadas>` **y** `git status --porcelain -- <rutas generadas>`
  vacío (un archivo nuevo sin versionar también falla). Así se detecta una edición a mano (AC-16).
- `contracts:check` añade `assertReadmeExtractInSync()`: el bloque entre marcadores coincide
  byte a byte con lo que produciría `contracts:readme-extract` (AC-16).
- Comparación de AC-8 sobre lo generado: los tipos de los ocho schemas compartidos en
  `src/types/clinical-api/types.gen.ts` y `src/types/rag-orchestrator/types.gen.ts` son
  textualmente idénticos.
- **Pendientes (US-214, S2):** `contracts:breaking` y `contracts:verify-provider`, el *hook* que
  bloquea editar lo generado y los clientes HTTP.
- **Zod estricto `[Pre-S1 resp. 33 (D-4)]`:** el *plugin* de Zod de `@hey-api/openapi-ts` emite
  `z.object` aunque el schema declare `additionalProperties: false`. `generate.mjs` registra un
  *resolver* de objetos (`objetoEstricto`, con test) que emite `z.strictObject` cuando el schema
  es cerrado y tiene propiedades; los objetos abiertos (`extractedData.*`, excepción nombrada de
  D7) y los envoltorios de parámetros (`path`, `query`, `headers`) siguen como `z.object`. Así el
  Zod que `web` y `clinical-api` importan rechaza propiedades desconocidas igual que el spec.
- **Brecha declarada `[Pre-S1 resp. 33 (D-4)]`, dueña US-214:** el generador **no traduce**
  (a) los `if/then` condicionales (`RagQueryInternalResponse`, `RagFollowUpResponse`,
  `EvidenceAnalysis`, `FollowUpTurn`: p. ej. `sin_evidencia` ⇒ `topRelevanceScore: null`) ni
  (b) los `anyOf` que solo exigen `required`/`properties` (`PatientSearchRequest`: documento o
  nombre; `EvidenceAnalysisRequest.filters`: al menos un tipo de fuente), que Zod recibe como
  `z.unknown()` en una intersección. Lo que el Zod generado deja pasar lo cubren `contracts:check`
  (sobre los ejemplos) y la validación de respuestas contra el spec de `contracts:verify-provider`
  (US-214). US-214 SHALL decidir si esos refinamientos se escriben como `superRefine` en
  `*.schema.ts` o si el generador los emite; hasta entonces ningún consumidor debe asumir que el
  Zod generado impone esas condiciones.
Descartadas en una línea: `openapi-typescript` + `openapi-zod-client` (dos herramientas y soporte
3.1 desigual); generar Pydantic con `fastapi-code-generator` (genera también rutas, que no
queremos).

### D7. Forma del contrato `[Pre-S1 resp. 25, 29]`
- **Cerrado por defecto:** todo schema `type: object` declara `required` (todas sus propiedades
  salvo las marcadas opcionales en este diseño) y `additionalProperties: false`. Las composiciones
  (`allOf`) usan `unevaluatedProperties: false`. La regla `assertClosedSchemas()` lo exige en ambos
  specs y en `evidence.yaml`. **Excepciones nombradas** (lista cerrada en la regla, cada una con
  dueño): `CitedSourceFields` (auxiliar abierto; solo se usa dentro de un `allOf` que cierra con
  `unevaluatedProperties: false`) y `DocumentExtractResponse.extractedData.*` (forma por tipo de
  documento, la cierran FEAT-01b y FEAT-01c). `meta.retrievalParams` **ya no** es excepción: se
  cierra con `topK`, `rerankTopN`, `relevanceThreshold` y `retrievalMode` (`dense | hibrida`).
- **Bloques de ADR-26 obligatorios aunque vacíos:** `EvidenceAnalysis.required` incluye `id`,
  `traceId`, `queryText`, `questionTemplateId`, `queryLanguage`, `status`, `synthesis`,
  `applicability`, `evidenceOptions`, `discardedOptions`, `analysisBasis`, `topRelevanceScore`,
  `staleness`, `rerunOfAnalysisId`, `patientDataLinks`, `disclaimer` y `createdAt`;
  `Synthesis.required = [agreements, discrepancies]`; `AnalysisBasis` exige todos sus campos (D8).
- **`staleness` y `CitedSource.newerVersionAvailable` neutros en un análisis nuevo**
  `[Pre-S1 resp. 29]`: `staleness = { patientData: false, changedData: [], newerEvidenceOrCatalog:
  false }` y `newerVersionAvailable = false`; los calcula después el detector de vigencia (FR-26).
  El ejemplo del S1 los muestra.
- **Regla `sin_evidencia ⇒ null`** con `if/then` de 2020-12 en `EvidenceAnalysis` y
  `RagFollowUpResponse`: si `status ∈ {sin_evidencia, tipo_no_habilitado}` (o `fuera_de_contexto`
  en el seguimiento), entonces `topRelevanceScore: { type: "null" }` y `evidenceOptions`/`answer`
  con `maxItems: 0`; si `status = con_evidencia`, `topRelevanceScore: { type: number }`. `null` ≠
  `0.0` (RN-02). `FollowUpTurn` lleva su propio `if/then` (clinical-language m8): si `status ≠
  con_evidencia`, `answer` y `citedSources` con `maxItems: 0`; si `con_evidencia`, `answer` con
  `minItems: 1`.
- **Anclaje (RN-01, ADR-34) y referencias `r1…rN`** `[Pre-S1 resp. 29]`:
  `EvidenceOption.citedSources` tiene `minItems: 1`; `SupportedClaim` declara `citedSources` y
  `patientDataRefs` con `anyOf` que exige `minItems: 1` en al menos uno. Las referencias a datos
  del paciente son **opacas, por petición** y las asigna `clinical-api`: `r1`, `r2`, …, nunca un
  UUID. Cada ítem de `ClinicalContext` (diagnóstico, biomarcadores, tendencias, tratamientos,
  eventos, notas) declara `dataRef` **obligatorio** con `pattern: ^r[0-9]+$`; el mismo `pattern`
  rige `SupportedClaim.patientDataRefs[]` y `CaseSummaryInternalResponse.claims[].supportingDataRefs[]`.
  Backend 1 resuelve cada `rN` contra la entidad real y expone el enlace en un campo **propio de
  Backend 1**, fuera del schema compartido: `EvidenceAnalysis.patientDataLinks` y
  `FollowUpTurn.patientDataLinks` (`PatientDataLink[] = { dataRef, entityType, entityId }`, este
  último UUID solo en el contrato público). `assertClaimsAnchored()` verifica en los ejemplos que
  toda cita de una afirmación case **por `chunkId`** con una entrada de `citedSources` de la misma
  respuesta y que todo `patientDataRefs[i]` exista en `patientDataLinks` (Backend 1) o en un
  `dataRef` del `clinicalContext` de la petición (Backend 2).
- **Anclaje de `studyPopulationValue` `[Pre-S1 resp. 37 (D-8)]`:** el criterio de aplicabilidad
  (`ApplicabilityCriterion`) no se ancla por sí mismo: su `citedSources` puede ir vacío. El
  anclaje de `studyPopulationValue` **lo da la opción** (`EvidenceOption.citedSources`, `minItems:
  1`, RN-01) cuya fuente hereda el criterio (RN-28); el valor se copia de esa fuente y nunca lo
  genera el modelo. `patientValue` se ancla al dato del paciente (ADR-34). Los ejemplos
  `con-evidencia-s4.json` y `rag-query-con-evidencia.json` lo muestran (`citedSources: []` en el
  criterio). Una afirmación suelta sobre la población del estudio no es un criterio: sigue
  sujeta a `SupportedClaim` (cita o dato del paciente).
- **Aviso (RN-19):** `disclaimer` es un solo texto configurable (`AI_DISCLAIMER_TEXT`, dueño
  US-069, que manda sobre la redacción exacta) con las dos frases "Análisis generado por IA —
  requiere validación clínica del oncólogo tratante" y "Uso académico/investigación"; `type:
  string, minLength: 1`, obligatorio en `EvidenceAnalysis` y `FollowUpTurn`.
  `assertDisclaimerRequired()` busca en cada `disclaimer` de los ejemplos las subcadenas
  "requiere validación clínica del oncólogo tratante" y "Uso académico/investigación",
  independientemente de raya o dos puntos (clinical-language M-4). El encabezado "Opciones
  descritas en la evidencia" vive en la UI, no en el contrato, y se trata como **clave de
  configuración** (ver `### D15`, textos de UI).
- **`/case/summary` y el aviso de RN-19** `[Pre-S1 resp. 37 (D-8)]`: `CaseSummaryInternalResponse`
  no lleva `disclaimer` (el aviso lo compone Backend 1 / la UI desde `AI_DISCLAIMER_TEXT`), y no
  se añade en este change; la salida del resumen del caso debe mostrar "Análisis generado por IA
  — requiere validación clínica del oncólogo tratante" y "Uso académico/investigación". Queda
  **anotado para sus historias**: US-096 (persistencia y respuesta de `clinical-api`, si el
  contrato público del resumen necesita el campo) y US-097 (UI), con el texto en US-069.
- **Descripciones normativas** (`assertNormativeDescriptions()`): `relevanceScore` y
  `topRelevanceScore` dicen "metadato secundario", "puntaje del reranker normalizado a [0,1]" y que
  no ordena las opciones ni mide la solidez clínica ni la probabilidad (`minimum: 0`,
  `maximum: 1`); `evidenceOptions` dice "orden determinista por aplicabilidad (RN-28)"; `CitedSource`
  dice "copiado del catálogo del corpus, nunca del texto generado";
  `Synthesis.discrepancies[].explanation` dice "descripción de la diferencia entre fuentes, sin
  afirmación nueva ni valoración clínica" (clinical-language M-5);
  `PriorAnalysisMemory.linkedDecision` y `.outcomesSince` dicen "dato rotulado, no es soporte ni
  cita (RN-24)" (clinical-language P-4); todo texto libre de `ClinicalContext` y de
  `PriorAnalysisMemory` (`type: string` sin `enum`, `const`, `format` ni `pattern`) dice
  "enmascarado (RN-11)" (privacy M-5).
- **camelCase en toda la API** (`assertCamelCaseProperties()`); los nombres `snake_case` solo
  existen en `data-model.md`.

### D8. `AnalysisBasis` canónico y `publishedFromYear`
Campos (todos `required`, lista canónica para AC-4 y el delta): `patientDataUsed`,
`missingCriticalData`, `continuedWithWarning`, `assumptions`, `sourcesConsulted`,
`sourcesNotIncluded`, `corpusCutoffDate`, `limitations`, `priorAnalysesUsed`, `agentSteps` (vacío
en el MVP: agente Post-MVP) y `omittedClaims`. `sourcesConsulted = { selected, filters, retrieved,
aboveThreshold }` y `filters` es `AppliedFilters` (cerrado): `historiaCompleta`,
`soloBiomarcadoresRelevantes`, `ultimosSeisMeses`, `antecedentesFamiliares`, `publishedFromYear`.

Ruta exacta: `AnalysisBasis.sourcesConsulted.filters.publishedFromYear` (`integer | null`).
Semántica (E-02):
- En `POST /platform/evidence-analyses`, `filtersApplied.publishedFromYear` es **opcional**:
  ausente → Backend 1 aplica el valor por defecto `año actual − EVIDENCE_DEFAULT_YEARS` (reloj
  inyectado); `null` → toda la evidencia; entero → ese año mínimo.
- Backend 2 recibe siempre el **valor efectivo**: `RagQueryInternalRequest.filtersApplied`
  (`RagFiltersApplied`, cerrado) con `publishedFromYear` **requerido** (`integer | null`).
- La Base guarda el valor efectivo, nunca "ausente".

### D9. Gradación en el registro manual `[Pre-S1 resp. 18, 29]`
`grade` **nunca** se escribe a mano: no existe en `DiagnosisManualCreate`
(`additionalProperties: false` → `422 CUERPO_INVALIDO`). Es texto derivado de la gradación de
referencia: próstata `"Gleason 4+3=7 · ISUP 3"`; mama `"Nottingham grado 2"`.

```yaml
DiagnosisManualCreate:        # POST /platform/patients/{patientId}/diagnoses
  type: object
  additionalProperties: false
  minProperties: 1
  description: >
    Sin diagnóstico vigente crea uno `manual` y exige cancerType, stagingSystem, stageValue y
    diagnosedAt (si faltan → 422 CUERPO_INVALIDO). Con diagnóstico vigente es una corrección
    explícita: crea uno `manual_correction` y el anterior pasa a `reemplazado` (RN-08).
    Los valores de catálogo (cancerType, stagingSystem, performanceScale) y el rango de
    performanceValue se validan contra el catálogo (422 VALOR_FUERA_DE_CATALOGO).
  properties:
    cancerType:       { type: string, minLength: 1 }
    histology:        { type: [string, "null"], maxLength: 200 }
    stagingSystem:    { type: string, minLength: 1 }
    stageValue:       { type: string, minLength: 1, maxLength: 20 }
    performanceScale: { type: string, minLength: 1 }
    performanceValue: { type: integer, minimum: 0 }
    diagnosedAt:      { type: string, format: date }
    grading:          { $ref: "#/components/schemas/DiagnosisGradingInput" }

DiagnosisGradingInput:
  oneOf: [ GleasonIsupGradingInput, NottinghamGradingInput ]
  discriminator: { propertyName: gradingSystem }

GleasonIsupGradingInput:      # próstata
  type: object
  additionalProperties: false
  required: [gradingSystem, specimenType, gradeScope, gleasonPrimaryPattern,
             gleasonSecondaryPattern]
  description: >
    gleasonScore e isupGradeGroup son opcionales: el servidor los deriva de los patrones; si
    llegan, valida su coherencia (422 GRADACION_INCOHERENTE).
  properties:
    gradingSystem:           { const: gleason_isup }
    specimenType:            { enum: [biopsia, prostatectomia] }
    gradeScope:              { enum: [nucleo_sitio, peor, global] }
    gleasonPrimaryPattern:   { type: integer, minimum: 3, maximum: 5 }
    gleasonSecondaryPattern: { type: integer, minimum: 3, maximum: 5 }
    gleasonScore:            { type: integer, minimum: 6, maximum: 10 }   # opcional
    isupGradeGroup:          { type: integer, minimum: 1, maximum: 5 }    # opcional
  # coherencia (dominio, 422 GRADACION_INCOHERENTE): score = primario + secundario;
  # ISUP: 3+3→1, 3+4→2, 4+3→3, 8→4, 9–10→5 (DEC-05)

NottinghamGradingInput:       # mama
  type: object
  additionalProperties: false
  required: [gradingSystem, nottinghamGrade]
  properties:
    gradingSystem:   { const: nottingham }
    nottinghamGrade: { type: integer, minimum: 1, maximum: 3 }
```

`DiagnosisGrading` (lectura, en `Diagnosis.gradings[]`, `readOnly`): `id`, `gradingSystem`,
`specimenType` (`type: [string, "null"]`, `enum: [biopsia, prostatectomia, null]`), `gradeScope`
(`enum: [nucleo_sitio, peor, global, null]`) (D5, contract-keeper m3), `gleasonPrimaryPattern`,
`gleasonSecondaryPattern`, `gleasonScore`, `isupGradeGroup`, `nottinghamGrade` (todos
`integer | null` según el sistema; en lectura `gleasonScore` e `isupGradeGroup` siempre vienen
derivados), `isReference` (la que deriva `grade`) y `provenance` (`Provenance` de
`clinical-api`). El estado de revisión propio de cada gradación es `provenance.reviewStatus`:
**no** hay un `reviewStatus` duplicado. Gradación de referencia: en próstata, prostatectomía
`global` > biopsia `peor` (DEC-05); en mama, la más reciente verificada (asumido; lo confirma
US-110). Vacío anotado: puntajes parciales de Nottingham (túbulos, pleomorfismo, mitosis) fuera de
alcance, para FEAT-03b.

### D10. Seguimiento en Backend 2: endpoint propio `[Pre-S1 resp. 19, 23, 29]`
`POST /rag/follow-up` en `rag-orchestrator`; `/rag/query` no cambia (AC-9 intacto).
- `RagFollowUpRequest` (cerrado): `traceId` (**nuevo por turno**, `[Pre-S1 resp. 29]`; `type:
  string` con `pattern`, sin `format: uuid`), `dataClassification`, `catalogVersion`, `question`
  (ya enmascarada, RN-11), `clinicalContext` (`ClinicalContext` desidentificado, con un
  `pseudoPatientId` **nuevo por turno** y `dataRef` `r1…rN` por ítem), `analysisMemory` (array de
  `PriorAnalysisMemory`, la misma forma que `ClinicalContext.priorAnalyses`: `source: const
  analisis_previo_ia`, `citable: const false`, `monthsAgo`, `question` enmascarada,
  `synthesisSummary`, `optionsDescribed`, `linkedDecision` y `outcomesSince` —datos rotulados, no
  soporte— con `monthsAgo`; sin fechas absolutas), `filtersApplied` (`RagFiltersApplied`, valor
  efectivo del análisis).
- `RagFollowUpResponse` (cerrado): `status` (`con_evidencia | sin_evidencia | fuera_de_contexto`;
  Backend 2 clasifica `fuera_de_contexto`), `answer` (`SupportedClaim[]`), `citedSources`
  (`CitedSource[]`), `omittedClaims`, `topRelevanceScore` (`number | null`, D7) y `meta`
  (`RagMeta`, el mismo bloque de `/rag/query`; Backend 1 registra con él modelos, versión de
  *prompt* y de catálogo del turno, RN-06).
- `RagMeta` (cerrado y **estricto**, compartido por `/rag/query` y `/rag/follow-up`; **enmienda
  `[Pre-S1 resp. 32 (D-3)]`**): `llmModel`, `embeddingModel`, `rerankerModel`, `nliModel`,
  `promptVersion`, **`catalogVersion` obligatorio** `[Pre-S1 resp. 29]`, `corpusRelease`,
  `corpusCutoffDate`, `excludedSources`, `retrievalParams` (cerrado, D7) y `latencyMs`; ningún
  campo es nulo. La versión inicial de D10 compartía un único `RagMeta` nullable con
  `/case/summary`; eso dejaba que una consulta al corpus devolviera `retrievalParams: null` sin
  que el contrato lo detectara.
- `CaseSummaryMeta` (cerrado, solo `/case/summary`, **enmienda `[Pre-S1 resp. 32 (D-3)]`**): mismos
  campos, pero `embeddingModel`, `rerankerModel`, `corpusRelease`, `corpusCutoffDate`,
  `excludedSources` y `retrievalParams` son `null` (la operación no consulta el corpus) y
  `catalogVersion` sigue siendo obligatorio. `contracts:check` (`assertFollowUpContract`) exige que
  `RagMeta` no admita `null` en ningún campo, que ambos bloques exijan `catalogVersion` y que cada
  respuesta use el suyo.
- `isNewSource` lo calcula **Backend 1**, comparando los `chunkId` del turno con los del análisis
  persistido; Backend 2 no lo conoce.
- **Sin estado:** `rag-orchestrator` no guarda turnos ni memoria entre llamadas (ni en disco, ni en
  caché, ni en Milvus, ni en *logs*). La descripción de la operación lo dice literalmente.
- **Solo modelos locales con datos reales** (privacy M-4): la descripción de la operación y la de
  su `503` dicen "con datos reales solo se usan modelos locales, sin *fallback* a la nube
  (RN-12)".
- Respuestas: `200`, `401`, `409 CATALOG_VERSION_MISMATCH`, `422` (`oneOf`
  `TIPO_NO_HABILITADO | CUERPO_INVALIDO`), `429`, `503 LOCAL_LLM_UNAVAILABLE`, `504`.
- **Persistencia en Backend 1** (`clinical.analysis_follow_up`, privacy M-8 / contract-keeper
  M10): `id`, `analysis_id`, `turn_number` (único por análisis), `question_text` (enmascarado si
  tenía PII), `status`, `answer` (afirmaciones validadas), `cited_sources` (con `is_new_source`),
  `omitted_claims`, `patient_data_links`, `data_classification` y `llm_provider` **`[Pre-S1 resp.
  36 (D-7)]`** (para auditar RN-12 por turno), las columnas de `meta` (`llm_model`,
  `embedding_model`, `reranker_model`, `nli_model`, `prompt_version`, `catalog_version`),
  `trace_id` y `created_at`; **sin `pseudoPatientId` ni identidad**.
- **`llmProvider` es un enum `[Pre-S1 resp. 36 (D-7)]`:** `RagMeta.llmProvider` y
  `CaseSummaryMeta.llmProvider` pasan de `string` libre a `enum [local, nube]` (RN-12). Se eligió
  el enum sobre un campo `providerLocality` aparte para no duplicar la información en el contrato
  ni en la columna `llm_provider` (que lleva `CHECK (llm_provider IN ('local','nube'))`); el
  modelo concreto sigue identificándose con `llmModel`. Con datos reales el valor es siempre
  `local`, sin *fallback* a la nube; Backend 1 lo verifica contra `data_classification`.
- **`clinical_context_snapshot` sin `pseudoPatientId` `[Pre-S1 resp. 36 (D-7)]`:**
  `ai_analysis_record.clinical_context_snapshot` guarda el contexto desidentificado con sus
  etiquetas pero **no** el `pseudoPatientId`, que es efímero por consulta y nunca se persiste
  (RN-11); un snapshot con seudónimo permitiría enlazar análisis entre sí.
- Vacío anotado para US-218: si los turnos previos del mismo análisis viajan como elementos de
  `analysisMemory` (misma forma) y si un turno `fuera_de_contexto` cuenta para el límite.

### D11. Errores con código cerrado
`Error` base: `{ error, message, traceId }` (cerrado). Cada respuesta de error referencia un schema
con `error` restringido por `const` o `enum`. **Sin eco** (privacy M-10): `Error` y
`ErrorValidacion` nunca contienen el valor recibido; `ErrorValidacion.detail[]` es cerrado
(`loc`, `msg`, `type`; **sin** `input` ni `ctx`, que FastAPI añade por defecto y el *handler* de
la implementación quita) y `message`/`msg` no reproducen el valor. `assertErrorsNoEcho()` lo
verifica en los schemas y en los ejemplos de error.

| Proveedor · respuesta | Códigos |
|---|---|
| `clinical-api` `401` | `NO_AUTENTICADO` (login: `CREDENCIALES_INVALIDAS`, con `traceId`) |
| `clinical-api` `403` | `PERMISO_DENEGADO` (RBAC) · `OPT_OUT_ANALISIS_IA` (toda generación con IA, RN-15) |
| `clinical-api` `404` | `NO_ENCONTRADO` |
| `clinical-api` `409` | `LIMITE_SEGUIMIENTO` · `DOCUMENTO_DUPLICADO` |
| `clinical-api` `422` | `CUERPO_INVALIDO` · `PACIENTE_EGRESADO` · `ANALISIS_SIN_EVIDENCIA` · `GRADACION_INCOHERENTE` · `VALOR_FUERA_DE_CATALOGO` (según la operación) |
| `clinical-api` `429` | `LIMITE_SOLICITUDES` · `COLA_INFERENCIA_LLENA` |
| `clinical-api` `502/503/504` | `ERROR_SERVICIO_IA` · `LOCAL_LLM_UNAVAILABLE` · `DEADLINE_VENCIDO` |
| `rag-orchestrator` `401` | `TOKEN_SERVICIO_INVALIDO` (JWT de servicio ausente o inválido) |
| `rag-orchestrator` `422` | `oneOf`: `ErrorTipoNoHabilitado` (`const TIPO_NO_HABILITADO`) · `ErrorValidacion` (`const CUERPO_INVALIDO`, `detail[]` con `loc`, `msg`, `type`) |
| `rag-orchestrator` `409/429/503/504` | `CATALOG_VERSION_MISMATCH` · `COLA_INFERENCIA_LLENA` · `LOCAL_LLM_UNAVAILABLE` · `DEADLINE_VENCIDO` |

**Códigos no congelados aquí, con dueño** (contract-keeper m6): los de carga de documentos
(`413` tamaño, `415` tipo de archivo; `POST …/documents` y `/documents/extract`) quedan como
`pendingExample` y respuesta anotada "dueño FEAT-01b"; el refinamiento de los estados de cuenta
en el login (si alguno deja de ser `CREDENCIALES_INVALIDAS` genérico) queda para US-211. Hasta
entonces no se declaran códigos inventados.

`CATALOG_VERSION_MISMATCH` y `LOCAL_LLM_UNAVAILABLE` conservan el nombre del readme; los nuevos van
en español. Las descripciones visibles no son prescriptivas ni nombran claves de configuración
(clinical-language M-1): `409 LIMITE_SEGUIMIENTO` — "Este análisis alcanzó el máximo de preguntas
de seguimiento configurado. Una pregunta distinta puede formularse en un análisis nuevo." (el
máximo vive en `ANALYSIS_FOLLOWUP_MAX`, que solo se nombra en la descripción técnica de la
operación, no en `message`); `fuera_de_contexto` — "La pregunta no se refiere a este análisis ni a
su evidencia; no se generó respuesta."

### D12. Identidad fuera de la URL y de las cabeceras `[Pre-S1 resp. 22]`
`POST /platform/patients/search` con `PatientSearchRequest` (cerrado; `anyOf`:
`[idType, nationalId]` o `[name]`; `page` opcional) → `200 PatientPage`. La búsqueda por
documento es exacta (índice ciego); la **búsqueda por nombre** queda con **US-048 como dueña**
(`[Pre-S1 resp. 36 (D-7)]`): este change fija su forma en el contrato, no su algoritmo.
`GET /platform/patients` solo admite `status`, `dataOrigin` y `page`. Regla
`assertNoIdentityInUrl()`: ningún parámetro `in: query`, `in: path` o `in: header` del spec de
`clinical-api` coincide con `IDENTIDAD_PII` (D13). Los UUID en la ruta están permitidos
(`{patientId}`, `{analysisId}`): un parche positivo que declara `{patientId}` no produce hallazgo.
Cabeceras permitidas sin revisión: `Idempotency-Key`, `X-Trace-Id`, `X-Request-Deadline`
(privacy M-11); cualquier otra cabecera se somete a la lista.

### D13. Dos listas de identidad (privacy F-1, M-1; contract-keeper M1)
Coincidencia por **expresión regular sin distinguir mayúsculas**, sobre el nombre normalizado
(sin `_` ni `-`, en minúsculas; cubre camelCase y snake_case), con una **lista blanca explícita**
en la regla:
- **`IDENTIDAD_PII`** (rige la URL y las cabeceras de Backend 1, D12):
  `name$` (incluye `name`, `fullName`, `patientName`, `firstName`, `lastName`, `givenName`,
  `familyName`), `^nombres?$`, `^apellidos?$`, `^nationalid$`, `^idtype$`, `^documentnumber$`,
  `^documento$`, `^birth(date|year)$`, `^dateofbirth$`, `^dob$`, `^fechanacimiento$`,
  `^address$`, `^direccion$`, `^phone$`, `^mobile$`, `^telephone$`, `^telefono$`, `^email$`,
  `^medicalrecordnumber$`, `^historiaclinica$`.
- **`IDENTIDAD_B2`** = `IDENTIDAD_PII` + identificadores enlazables: `^patientid$`,
  `^analysisid$`, `^episodeid$`, `^userid$`, `^sourcedocumentid$`,
  `^additionalsourcedocumentids$`, `^documentid$`. Rige **todo** el spec de `rag-orchestrator`
  (parámetros, cabeceras, `requestBody` y respuestas, recursivamente: `$ref`, `allOf/oneOf/anyOf`,
  `items`, `properties`). Además, ningún `requestBody` de Backend 2 declara `format: uuid`
  `[Pre-S1 resp. 29]`.
- **Lista blanca** (nombres que casan con `name$` pero no son identidad): `biomarkerName`,
  `sourceName`, `regimenName`, `originalName`, `drugName`, `llmModel` y los demás que se añadan
  con justificación en un PR revisado por privacy-guardian.
- **Excepción única por puntero JSON exacto** (privacy M-2):
  `#/paths/~1documents~1extract/post/responses/200/content/application~1json/schema` →
  `DocumentExtractResponse.identityFound` (`idType`, `nationalId`), que existe solo para que
  `clinical-api` verifique que el documento pertenece al paciente y nunca se registra en *logs*. La
  misma propiedad en cualquier otra respuesta, o `nationalId` en el cuerpo multipart de
  `/documents/extract`, es hallazgo (parches negativos).
- `DocumentExtractResponse.piiScan.findingTypes` es un `enum` cerrado (`nombre`,
  `documento_identidad`, `fecha`, `direccion`, `telefono`, `email`, `historia_clinica`, `otro`;
  asumido, lo refina ADR-40) (privacy M-3).
Consecuencia (vacío resuelto): el nombre del biomarcador en `ClinicalContext.biomarkers[]`,
`biomarkerTrends[]` y `DocumentExtractResponse.extractedData.biomarkers[]` pasa de `name` a
`biomarkerName`, y el de cualquier parámetro de query futuro de Backend 1 también.

### D14. Permisos por operación y vista por permiso `[Pre-S1 resp. 24, 27, 29]`
- `x-permission` en **cada** operación de `clinical-api`: un código o una **lista** de códigos
  concretos de la matriz de `docs/architecture/data-model.md` (sin comodines: `clinical:*` es
  hallazgo). El valor `publico` solo se admite en la lista blanca de la regla
  (`POST /platform/auth/login`). `POST /platform/auth/logout` usa `session:logout`.
- Asignación: `GET /platform/patients` y `POST /platform/patients/search` → `patients:lookup`;
  `GET /platform/patients/{patientId}` → `[clinical:read, patients:lookup]`; `POST …/documents` →
  `documents:upload`; `POST …/biomarkers` y `POST …/diagnoses` → `clinical:write`; `POST
  /platform/evidence-analyses` → `ai_analysis:create`; `POST …/follow-ups` → `follow_ups:create`;
  `GET …/follow-ups` → `follow_ups:read`.
- **Vista por permiso** `[Pre-S1 resp. 27]`: `GET /platform/patients/{patientId}` responde `200`
  `oneOf [PatientSummary, PatientAdminSummary]` con `discriminator: view` y declara
  `x-view-by-permission: { clinical:read: PatientSummary, default: PatientAdminSummary }`. La
  misma extensión rige los ítems de `PatientPage`, **pero con otra vista** `[Pre-S1 resp. 36
  (D-7, privacidad)]`: el listado y la búsqueda declaran `x-view-by-permission: { clinical:read:
  PatientListItem, default: PatientAdminSummary }`. `PatientListItem` (cerrado, `view: const
  doctor_listado`) devuelve `fullNameMasked` y `nationalIdMasked` **enmascarados** y los contadores;
  el nombre y el documento **completos** solo viajan en la ficha (`PatientSummary.identification`),
  y cada lectura de la ficha se audita (RN-10). `PatientAdminSummary` (cerrado): `view: const
  admin`, `id`, `idType`, `nationalIdMasked`, `dataOrigin`, `lifecycleStatus`, `registeredAt`;
  sin diagnóstico, biomarcadores, documentos, análisis ni contadores clínicos. Para el `admin`,
  vista de caso, documentos, análisis, seguimiento y resumen del caso → `403 PERMISO_DENEGADO`.
- `assertOperationsDeclarePermission()` y `assertViewByPermission()`: cada operación declara
  `x-permission`; cada código existe en la matriz; ningún comodín; `publico` solo en la lista
  blanca; toda operación cuyo `200` sea un `oneOf` de vistas declara `x-view-by-permission`, cada
  esquema mapeado está en el `oneOf` y el `default` es una vista sin propiedades clínicas (lista
  en la regla: `diagnosis`, `biomarkers`, `documents`, `analyses`, `openReviewCount`,
  `missingCriticalCount`).
- **Descifrado completo de identidad para el opt-out:** solo por la CLI (B-05), auditado; **no**
  se congela `patients:reveal_identity` (lo añade US-222 en el S6, cambio aditivo,
  `[Pre-S1 resp. 27]`).

### D15. Lenguaje no prescriptivo (RN-23) `[clinical-language M-2]`
`assertNoPrescriptiveLanguage()` recorre todo texto de ambos specs, `evidence.yaml` y los ejemplos
(descripciones, `summary`, valores `string`, **claves de propiedad y valores de `enum`/`const`**),
normalizado sin mayúsculas ni acentos (NFD), contra la lista de RN-23 más los prefijos
`recomend*` y `recommend*` (español e inglés). Frases negativas normativas permitidas, en lista
blanca exacta de la regla (p. ej., "no constituye una recomendación", "no recomienda ni
prescribe"). Mientras no exista `packages/clinical-catalogs/lenguaje/terminos-prohibidos.json`
(US-068), lee `scripts/contracts/terminos-prohibidos-rn23.json` con los literales de RN-23; cuando
US-068 lo cree, la regla pasa a leer el catálogo y el archivo provisional se borra (dueño:
US-068).

**Textos de UI como claves de configuración `[Pre-S1 resp. 37 (D-8)]`:** los textos con
consecuencia de lenguaje que el contrato no transporta —el de un seguimiento
`fuera_de_contexto`, el de un análisis `sin_evidencia` y el encabezado "Opciones descritas en la
evidencia"— se guardan en **claves de configuración** (RN-22), nunca como literales en el
componente (nombres propuestos: `UI_TEXTO_FUERA_DE_CONTEXTO`, `UI_TEXTO_SIN_EVIDENCIA`,
`UI_ENCABEZADO_OPCIONES_DESCRITAS`; los fija la historia de `apps/web` que los consuma, junto con
`AI_DISCLAIMER_TEXT` de US-069). Este change solo lo documenta; su revisión de lenguaje
(RN-23) ocurre en el **Gate 2 de `apps/web`** (`clinical-language-auditor`), no aquí. El texto
acordado del `fuera_de_contexto` es "La pregunta no se refiere a este análisis ni a su evidencia;
no se generó respuesta." (D11).

## Privacidad y ownership

- Este change no mueve datos en ejecución; fija qué cruza cada frontera.
  `web → clinical-api`: cookie de sesión opaca; la identidad del paciente solo viaja en el **cuerpo**
  de `POST /platform/patients/search` y en las respuestas autorizadas, nunca en la URL ni en
  cabeceras (D12). `clinical-api → rag-orchestrator`: JWT de servicio y contexto desidentificado,
  sin identificadores enlazables (D13).
- **Login** `[Pre-S1 resp. 29]`: `POST /platform/auth/login` responde `204` sin cuerpo; su
  cabecera `Set-Cookie` se documenta como cookie opaca `HttpOnly; Secure; SameSite=Strict; Path=/`
  (privacy M-11). `401 CREDENCIALES_INVALIDAS` (con `traceId`) es genérico para credenciales
  erróneas y cuentas no activas (anti-enumeración).
- `clinical-api` es dueño del contrato público y del modelo `auth`/`identity`/`clinical`/`audit`/
  `research`; `rag-orchestrator` del interno y de `corpus` + Milvus.
- El spec de `rag-orchestrator` no declara identidad ni identificadores enlazables (D13): el
  contexto es el `ClinicalContext` de readme §4.2 (seudónimo por consulta **y por turno de
  seguimiento**, `traceId` nuevo por turno, fechas relativas, texto libre enmascarado, referencias
  `r1…rN` por petición, RN-11); `analysisMemory` es memoria rotulada, sin identidad (RN-10), nunca
  citable ni soporte NLI (RN-24). `Provenance` de Backend 2 no lleva ids de documento.
- **Seguimiento sin estado en Backend 2** (`[Pre-S1 resp. 23]`): `rag-orchestrator` no guarda
  turnos ni memoria (disco, caché, Milvus ni *logs*). `analysis_follow_up.question_text` y
  `FollowUpTurn.question` guardan y devuelven la versión **enmascarada** si la pregunta tenía PII
  (como `query_text`).
- `rag-orchestrator` no toca datos clínicos ni `clinical-minio`. El modelo documenta el
  aislamiento del rol `rag_corpus` (readme §2.5 y §6 OL-01): `USAGE` solo sobre `corpus`;
  `REVOKE ALL` sobre `auth`, `identity`, `clinical`, `audit` y `research`; `ALTER DEFAULT
  PRIVILEGES FOR ROLE <rol de migraciones> IN SCHEMA …` para que las tablas que cree el rol de
  migraciones en esos schemas tampoco le den acceso; `REVOKE ALL ON SCHEMA public FROM PUBLIC`;
  `pg_hba` que solo admite `rag_corpus` desde `corpus-db-net`; sin credenciales ni ruta hacia
  `clinical-minio` (privacy M-11).
- **Mínimo privilegio del administrador** (`[Pre-S1 resp. 24, 27]`, E-04): D14. Los `403` de
  readme "no pertenece al equipo tratante" se reescriben como "RBAC u opt-out" (equipo tratante
  Post-MVP, B-03). `audit:read_patient` = no para todos los roles hasta que una historia lo pida
  `[Pre-S1 resp. 29]`.
- **Cuentas** (E-03): `pendiente` y `rechazado` no inician sesión; pasar a `desactivado` revoca
  las sesiones vivas.
- `sourceUrl`: `format: uri` + `pattern: ^https://`; la UI la abre con
  `rel="noopener noreferrer"` (nota para las historias de `frontend` que la rendericen).
- Ejemplos: solo sintéticos, con la convención de D3; `assertExamplesSynthetic()` lo verifica
  (RN-14).

## Contratos

**Proveedores:** `clinical-api` (consumidor: `web`), `rag-orchestrator` (consumidor:
`clinical-api`). **Compatibilidad:** primer contrato publicado (`1.0.0`); no hay base para oasdiff.
Política de `info.version` (requisito del delta): *major* para un cambio incompatible declarado en
su change (ADR-26), *minor* para uno aditivo y *patch* para descripciones y ejemplos. ADR-26:
bloques no disponibles van vacíos y son `required`. Todo en camelCase. Parámetros de ruta:
`{patientId}` y `{analysisId}` en el spec y en este diseño (las historias escriben `{id}` por
brevedad).

Diff propuesto `apps/clinical-api/openapi.yaml` (respecto de readme §4.1):
```diff
+ openapi: 3.1.0                       # antes 3.0.3; info.version 1.0.0
  components.schemas:
+   EvidenceOption, DiscardedOption, Synthesis, SupportedClaim, SourceApplicability,
+   ApplicabilityCriterion, ApplicabilitySummary, CitedSource → $ref contracts/schemas/evidence.yaml
+     CitedSource: + licenseClass (4 valores), authors (string|null), sourceUrl (uri https|null),
+                  newerVersionAvailable (false en un análisis nuevo);
+                  todos required (nullables: studyDesign, trialPhase, primaryEndpoint, sampleSize,
+                  publishedAt, lastUpdatedAt, guidelineVersion, authors, sourceUrl)
+     SupportedClaim: + patientDataRefs (pattern ^r[0-9]+$); anyOf citedSources|patientDataRefs minItems 1
+     EvidenceOption.citedSources: minItems 1
~   Provenance (propia de clinical-api, cerrada, con sourceDocumentId)
~   EvidenceAnalysis: required (D7), if/then sin_evidencia|tipo_no_habilitado ⇒ topRelevanceScore null,
~                     disclaimer minLength 1, queryText enmascarado, staleness neutro,
+                     patientDataLinks: PatientDataLink[] (propio de B1)
+   PatientDataLink { dataRef (^r[0-9]+$), entityType, entityId (uuid) }
~   AnalysisBasis: required (D8); sourcesConsulted.filters: AppliedFilters (+ publishedFromYear)
+   AppliedFilters, Diagnosis { id, cancerType, icd10Code, histology, histologyCode, grade (readOnly,
+              derivado), gradings: DiagnosisGrading[] (readOnly), stagingSystem, stageValue,
+              performanceScale, performanceValue, diagnosedAt, isActive, provenance }
+   DiagnosisGrading (D9, specimenType/gradeScope nullables con null en el enum),
+   DiagnosisManualCreate, DiagnosisGradingInput, GleasonIsupGradingInput (score y grupo opcionales),
+              NottinghamGradingInput (D9)
+   BiomarkerManualCreate { name, value, unit?, resultType, performedAt }  # US-110; name en el cuerpo, no en la URL
+   FollowUpCreate { question (1..2000) }
+   FollowUpTurn { id, analysisId, turnNumber, question (enmascarada), status, answer: SupportedClaim[],
+                  citedSources: FollowUpCitedSource[], omittedClaims, patientDataLinks, disclaimer,
+                  createdAt }; if/then por status
+   FollowUpCitedSource: allOf [CitedSourceFields, { isNewSource }], unevaluatedProperties: false
~   PatientSummary { view: const doctor, …, diagnosis: Diagnosis|null }
+   PatientAdminSummary { view: const admin, id, idType, nationalIdMasked, dataOrigin,
+                         lifecycleStatus, registeredAt }
+   PatientListItem { view: const doctor_listado, id, idType, nationalIdMasked, fullNameMasked, … }
+   PatientSearchRequest, PatientPage { items: (PatientListItem|PatientAdminSummary)[], page, pageSize, total }
+   LoginRequest { email, password }
+   Error + ErrorXxx con error const/enum, sin eco (D11)
  paths (cada operación con x-permission, D14):
+   POST /platform/auth/login         204 sin cuerpo (Set-Cookie HttpOnly; Secure; SameSite=Strict)
+                                     | 401 CREDENCIALES_INVALIDAS | 422 | 429     x-permission: publico
+   POST /platform/auth/logout        204 | 401                                  x-permission: session:logout
+   GET  /platform/patients?status=&dataOrigin=&page=   200 PatientPage | 401 | 403 | 422
+   POST /platform/patients/search    200 PatientPage | 401 | 403 | 422 | 429
~   GET  /platform/patients/{patientId}   200 oneOf PatientSummary|PatientAdminSummary
~                                         + x-view-by-permission | 401 | 403 | 404
~   POST /platform/patients/{patientId}/documents   403 "RBAC u opt-out" (no "equipo tratante");
~                                                   413/415 anotados, dueño FEAT-01b
~   POST /platform/evidence-analyses   description "evento derivado" (sin escribir analisis_ia);
~                                      filtersApplied.publishedFromYear opcional (D8); errores D11
+   POST /platform/patients/{patientId}/biomarkers   201 Biomarker | 401 | 403 | 404 | 422
+   POST /platform/patients/{patientId}/diagnoses    201 Diagnosis | 401 | 403 | 404 | 422
+   GET  /platform/patients/{patientId}/case   200 CaseView | 401 | 403 | 404   x-permission: clinical:read
+        [Pre-S1 resp. 34 (D-5): se mantiene; el administrador recibe 403, es lectura clínica]
+   POST /platform/evidence-analyses/{analysisId}/follow-ups
+        201 FollowUpTurn | 401 | 403 PERMISO_DENEGADO|OPT_OUT_ANALISIS_IA | 404 | 409 LIMITE_SEGUIMIENTO
+        | 422 CUERPO_INVALIDO|PACIENTE_EGRESADO|ANALISIS_SIN_EVIDENCIA | 429 | 502 | 503 | 504
+   GET  /platform/evidence-analyses/{analysisId}/follow-ups   200 FollowUpTurn[] | 401 | 403 | 404
```
Diff propuesto `apps/rag-orchestrator/openapi.yaml` (respecto de readme §4.2):
```diff
+ openapi: 3.1.0                       # info.version 1.0.0
+   8 schemas compartidos → $ref contracts/schemas/evidence.yaml (los "object" sin forma desaparecen)
~   Provenance (propia, cerrada, sin ids de documento)
~   ClinicalContext: cerrado; dataRef (^r[0-9]+$) obligatorio en cada ítem; texto libre "enmascarado
~                    (RN-11)"; biomarkers[].name y biomarkerTrends[].name → biomarkerName;
~                    priorAnalyses: PriorAnalysisMemory[]
+   PriorAnalysisMemory { source const analisis_previo_ia, citable const false, monthsAgo, question,
+                         synthesisSummary, optionsDescribed, linkedDecision, outcomesSince }
~   RagQueryInternalRequest: + filtersApplied: RagFiltersApplied { publishedFromYear (integer|null) } required
~   RagQueryInternalResponse.status: con_evidencia | sin_evidencia   # sin cambios (AC-9)
+   RagMeta (cerrado y estricto: sin campos nulos; catalogVersion obligatorio; retrievalParams
+          cerrado), usado por /rag/query y /rag/follow-up
+   CaseSummaryMeta (cerrado; campos del corpus y retrievalParams null; catalogVersion obligatorio),
+          usado por /case/summary
+   RagFollowUpRequest, RagFollowUpResponse (D10)
~   CaseSummaryInternalResponse.claims[].supportingDataRefs: pattern ^r[0-9]+$; meta: CaseSummaryMeta
~   DocumentExtractResponse.extractedData.biomarkers[].name → biomarkerName; extractedData.* abierto
~                    (excepción nombrada, FEAT-01b/c); piiScan.findingTypes enum
+   Error, ErrorTipoNoHabilitado, ErrorValidacion (detail sin input), ErrorXxx (D11)
  paths:
~   POST /rag/query: 401 TOKEN_SERVICIO_INVALIDO; 422 oneOf [ErrorTipoNoHabilitado, ErrorValidacion]
+   POST /rag/follow-up: 200 RagFollowUpResponse | 401 | 409 | 422 oneOf | 429 | 503 | 504
+                        (sin estado; RN-12 en la descripción y en el 503)
~   POST /case/summary, POST /documents/extract: cuerpos cerrados; errores D11; requestBody sin format: uuid
```
Ejemplos: ver D3. Zod, tipos TS y Pydantic se **generan** de estos specs con `contracts:generate`
(D6); nunca son fuente.

## Dependencias y colaboradores

- Nuevos: `scripts/contracts/check.mjs`, `scripts/contracts/generate.mjs` y
  `scripts/contracts/readme-extract.mjs` (orquestan E/S: leer YAML, *bundle* en memoria, ejecutar
  generadores, imprimir). Reglas puras en `scripts/contracts/rules/*.mjs`, cada una
  `(specs, examples, docs) → Finding[]`, sin E/S, con el AC que verifica:

| Regla | AC |
|---|---|
| `assertEvidenceAnalysisShape()`, `assertClosedSchemas()` (+ enums nullables), `assertCamelCaseProperties()` | AC-1 |
| `assertNoV1Vocabulary()` | AC-2 |
| `assertExamplesValid()`, `assertNoEvidenceImpliesNullScore()` | AC-3 (y AC-11, AC-12 por sus ejemplos) |
| `assertAnalysisBasisComplete()` | AC-4 |
| `assertDataModelDocument()` | AC-5, AC-6, AC-13 (datos), AC-15, AC-18 (chequeos simples de texto) |
| `assertDerivedEventDescription()` | AC-7 |
| `assertSharedSchemasSingleOrigin()` (spec crudo) | AC-8 |
| `assertRagTipoNoHabilitado()` | AC-9 |
| `assertManualEntryEndpoints()` | AC-10 |
| `assertDiagnosisGrading()` | AC-11 |
| `assertCitedSourceAttribution()` | AC-12 |
| `assertFollowUpContract()` (incluye la frase sin estado, RN-12 y pregunta enmascarada) | AC-13 |
| `assertPublishedFromYear()` | AC-14 |
| `assertSharedTypesIdenticalAcrossProviders()` (comparación AC-8 sobre lo generado), `assertReadmeExtractInSync()` | AC-16 |
| `assertNoPrescriptiveLanguage()`, `assertDisclaimerRequired()`, `assertClaimsAnchored()`, `assertNormativeDescriptions()`, `assertErrorCodesClosed()`, `assertErrorsNoEcho()`, `assertNoIdentityInRagContract()`, `assertNoIdentityInUrl()`, `assertOperationsDeclarePermission()`, `assertViewByPermission()`, `assertExamplesSynthetic()` | AC-17 |
| `assertSpecVersions()` (`info.version` semántico y operaciones del S1) | AC-1 |

- Depende de `@redocly/openapi-core`, `ajv`, `@hey-api/openapi-ts` y `datamodel-code-generator`
  solo en `check.mjs`/`generate.mjs`; las reglas reciben objetos.
- `assertDataModelDocument()` y `assertOperationsDeclarePermission()` leen
  `docs/architecture/data-model.md` (matriz de permisos); por eso el modelo, al menos con su
  estructura mínima y la matriz, entra en un commit `docs(L1D-55)` **antes** del `chore` que crea
  las reglas (tasks.md).
- Se modifican: `readme.md` §3.1 (DDL **y** diagrama mermaid → `data-model.md`; queda solo el
  enlace, `[Pre-S1 resp. 29]`), §4.1 y §4.2 (YAML y ejemplos → enlaces; extracto generado de 3
  endpoints entre marcadores, `[Pre-S1 resp. 28]`; tabla de "Endpoints adicionales" con la frase
  reescrita: "cada historia los añade al spec del proveedor antes de implementarlos").

## Risks / Trade-offs

- [`unevaluatedProperties` o `if/then` sin soporte completo en un generador] → `contracts:generate`
  se prueba en este change; si un generador los ignora, el tipo queda más laxo pero Ajv y la
  verificación del proveedor (US-214) siguen aplicando el schema completo.
- [Habilitar `cc_by_nc` en la ingesta] → cambio de configuración (`CORPUS_ACCEPTED_LICENSES`), no de
  contrato (D4).
- [`$ref` externos que alguna herramienta no resuelve] → se genera siempre desde el *bundle* en
  memoria.
- [Aserciones de descripción acopladas a la redacción] → solo buscan frases normativas cortas.
- [La regex `name$` produce falsos positivos] → lista blanca explícita y revisada (D13); preferible
  a un falso negativo de identidad.
- [Gradación de referencia de mama asumida] → la confirma US-110; no cambia el contrato.
- [Python requerido para `contracts:generate`] → mensaje de instalación explícito; US-036 lo
  provisiona en la CI.

## Migration Plan

No aplica (sin despliegue). Rollback: revertir el PR.

## Open Questions

- Ninguna bloqueante. Vacíos anotados con dueño: turnos previos en `analysisMemory` y conteo de
  `fuera_de_contexto` (US-218); gradación de referencia de mama (US-110); puntajes parciales de
  Nottingham (FEAT-03b); forma de `extractedData.*` y códigos `413`/`415` de documentos
  (FEAT-01b/FEAT-01c); `piiScan.findingTypes` definitivo (ADR-40); lista de términos prohibidos en
  el catálogo (US-068); literal del aviso (US-069); `contracts:breaking`,
  `contracts:verify-provider`, *hook* de generados y clientes HTTP (US-214); login: respuesta para
  cuentas no activas (US-211); `patients:reveal_identity` (US-222).
