# Design — l1d-90-registro-manual-biomarcador-diagnostico

## Contexto

US-110 implementa los dos endpoints de registro manual congelados en el Pre-S1 (US-033 AC-10). El esquema ya tiene
todo salvo dos detalles (D6, D7): `exam.exam_type` libre, `biomarker` con `original_name`, `mapping_status`,
`extraction_confidence` (`n_a`) y `review_status` (`verificado`, `reemplazado`); `diagnosis` con `is_active`,
`entry_method = manual_correction` y la tabla hija `diagnosis_grading` con sus `CHECK` de DEC-05. La normalización es
de `ReconciliationService` (`l1d-84`, ⛔). La corrección del diagnóstico es el patrón que ADR-50 generaliza (fila nueva +
anterior `reemplazado`).

## Decisiones

- **D1 · Un módulo `manual-entry` para los dos endpoints.** `src/modules/manual-entry/` con
  `manual-entry.{controller,service,repository,schema}.ts`, `manual-entry.reglas.ts` y `ports.ts`. Un módulo porque
  comparten las precondiciones (permiso, paciente activo, catálogo, transacción) y los consumidores siguientes (US-094,
  US-253) añadirán aquí sus rutas. *Descartada:* repartir en `biomarkers/` y `diagnoses/` (duplica las precondiciones).
- **D2 · Precondiciones en orden fijo, sin efectos antes de pasar todas:** `authorize('clinical:write')` (403 antes de
  leer el cuerpo) → Zod generado del spec, `strict` (422 `CUERPO_INVALIDO`; cubre `grade` en el cuerpo) → paciente
  existe (404) → `pacienteAdmiteRegistros()` (RN-17, 422 `PACIENTE_EGRESADO`) → valores de catálogo (422
  `VALOR_FUERA_DE_CATALOGO`) → coherencia de gradación (422 `GRADACION_INCOHERENTE`) → transacción. La regla RN-17 se
  extrae a `src/modules/compartido/paciente-activo.ts` (`pacienteAdmiteRegistros(estado)`) para que la usen US-094 y
  US-253; ya existe `EstadoDelPaciente` en `patients.repository.ts`.
- **D3 · Biomarcador:** `Exam` nuevo por registro (`entry_method = manual`, `exam_type = registro_manual`,
  `source_document_id = null`, `episode_id` = episodio abierto del paciente) + `Biomarker` con `name` =
  `decision.terminoCanonico ?? textoOriginal`, `original_name` = texto enviado, `loinc_code` y `mapping_status` de
  `ReconciliationService.decidir({ entidad: 'Biomarker', tipoDeCancer, textoOriginal })`, `extraction_confidence = n_a`,
  `extraction_score = null`, `review_status = verificado`, `reviewed_by` = usuario de la sesión, `reviewed_at` = reloj
  inyectado, `reference_range = ''` y `source_span = '{}'` (convención del seed; la ficha ya mapea `''` → `null`).
  `clinical_significance = relevante` y `significance_source = regla` (decidido, usuario 2026-11-03, `[S5 resp. 13]`).
- **D4 · Corrección del diagnóstico (RN-08, ADR-50).** Método con nombre `corregirDiagnosticoVigente()`: lee el vigente con
  `elegirDiagnosticoVigente()` (`compartido/diagnostico-vigente.ts`, regla existente) **y `SELECT … FOR UPDATE`**,
  construye la fila nueva con `fusionarCorreccion(vigente, cuerpo)` (los campos enviados ganan; los no enviados se
  copian), la inserta `manual_correction`/`verificado`/`is_active = true`, y pasa la anterior a `reemplazado`/
  `is_active = false` **sin tocar sus valores**. Las gradaciones del anterior se copian al nuevo (misma procedencia y
  estado) y la nueva entra `manual`/`verificado`. Con dos correcciones concurrentes, el bloqueo serializa: la segunda
  corrige sobre la primera. Si `cancerType` cambia, `icd10_code`/`mapping_status` se recalculan con `decidir()`.
- **D5 · Gradación (DEC-05).** Reglas puras en `manual-entry.reglas.ts`: `derivarGleason(primario, secundario)` (score
  y grupo ISUP: 3+3→1, 3+4→2, 4+3→3, 8→4, 9–10→5), `validarCoherenciaGleason(entrada)`,
  `elegirGradacionDeReferencia(gradaciones, tipoDeCancer)` (próstata: prostatectomía `global`, si no la `peor` de
  biopsia, desempate por más reciente; mama: la más reciente verificada) y `textoDeGrado(referencia)` («Gleason 4+3=7 ·
  ISUP 3», «Nottingham grado 2»). `nottingham` solo en mama y `gleason_isup` solo en próstata (mapa declarado en
  `escalas.json`, no en código). Los `CHECK` de la BD son la segunda red, no la validación.
- **D6 · Valores válidos en el catálogo (`escalas.json`).** Fichero nuevo en la raíz del catálogo:
  `{ sistemasDeEstadificacion: [{ codigo, tiposDeCancer[] }], escalasFuncionales: [{ codigo, minimo, maximo }],
  sistemasDeGradacion: [{ codigo, tiposDeCancer[] }] }`, con schema en `schemas/escalas.schema.json` y regla del
  validador (cada escala existe en el enum `performance_scale`: `ECOG`, `Karnofsky`, `Lansky`; `minimo ≤ maximo`).
  Catálogo real: `TNM_8` (mama, próstata), `ECOG` 0–5, `Karnofsky` 0–100, `Lansky` 0–100, `nottingham` (mama),
  `gleason_isup` (próstata). El tipo de cáncer se valida contra los tipos habilitados (`ENABLED_CANCER_TYPES`,
  `l1d-173`). Puerto `CatalogoDeEscalas` + adaptador en `src/infrastructure/catalogo/`. *Alternativas (caro de revertir:
  catálogo y su versión):* A · `escalas.json` en el catálogo (**elegida**: AC-5 dice «la lista sale del catálogo»; RN-29;
  versionado y montado en ambos backends); B · lista en configuración (RN-22 es para valores a calibrar, no para
  vocabulario clínico; fuera de la versión del catálogo); C · solo el enum de la BD (no cubre `stagingSystem` ni rangos y
  devuelve 500 en vez de 422).
- **D7 · `diagnosis.histology` nullable.** La migración inicial la dejó `NOT NULL` pero el contrato la declara
  `[string, null]` y AC-6 crea un diagnóstico sin histología. Migración aditiva `ALTER TABLE clinical.diagnosis ALTER
  COLUMN histology DROP NOT NULL` y fila en «Nulabilidades relajadas» de `data-model.md`. Compatible: ninguna escritura
  existente deja de valer. *Descartada:* guardar `''` (un centinela no sustituye a `null`, regla de diseño del S1).
  Decidido (usuario, 2026-11-03) `[S5 resp. 13]`.
- **D8 · Transacción única por petición** (`prisma.$transaction`): un 422 o un fallo intermedio no deja `Exam` sin
  `Biomarker` ni dos diagnósticos activos. Reloj e IDs inyectados (`reloj`, `generarId`).
- **D9 · `field` en los `422` (`[S5 resp. 10]`).** El contrato lo introduce `l1d-80`: propiedad **opcional**,
  `type: string`, **sin enum**, con la misma descripción en `ErrorRegistroManualInvalido`, `ErrorDiagnosticoInvalido`,
  `ErrorRegistroClinicoInvalido` y `ErrorCorreccionInvalida`. Aquí los errores de dominio de `manual-entry` llevan el
  nombre de la propiedad del cuerpo que los causó (nunca su valor) y se emiten como `field` con la misma semántica en
  cuanto el contrato lo declare (`additionalProperties: false` impide emitirlo antes); el mapeo y sus tests de `field`
  sobre estos dos endpoints los cierra `l1d-91`.
- **D10 · Subconjunto mínimo de LOINC (`[S5 resp. 9]`, DEC-04).** Entradas `estandar = loinc` en `mama/codigos.json` y
  `prostata/codigos.json` solo para los biomarcadores de `datos-criticos.json` (HER2, RE, RP, Ki-67, PSA, …), con
  `nombreOficial` = LONG_COMMON_NAME (o el nombre del *Linguistic Variants File* es-ES/es-AR/es-MX) **literal**,
  `etiquetaEs` propia, `versionFuente` con la versión de LOINC, y sinónimos ES/EN en `sinonimos.json`. Excluidos los
  códigos con `EXTERNAL_COPYRIGHT_NOTICE`; sin Part File ni jerarquías. Cada código y nombre se comprueba en loinc.org
  antes de versionarlo (nunca de memoria). `NOTICE-loinc.txt` ya lleva el aviso literal de Regenstrief. Con
  `escalas.json`, `manifest.json` 1.2.0 → **1.3.0**, montado igual en `clinical-api` y `rag-orchestrator` (sin `409`).
  *Descartado:* LOINC completo (licencia y tamaño sin necesidad en el MVP).

## Privacidad y ownership

- Todo ocurre dentro de `clinical-api` y `clinical` (PostgreSQL). No se llama a `rag-orchestrator` ni a `clinical-minio`;
  `rag-orchestrator` sigue sin acceso a datos clínicos.
- El navegador llega por el BFF de `web` (US-111); este change no toca `apps/web`.
- Los datos registrados son datos clínicos, no identidad (RN-10): ningún campo del cuerpo toca el schema `identity`.
  Nunca van a *logs*: solo `patientId` (UUID), `operationId`, código de error y `traceId`. Los mensajes de error no
  repiten el valor enviado (`VALOR_FUERA_DE_CATALOGO` nombra el campo, no su contenido).
- La desidentificación hacia la IA (RN-11) no cambia: el dato manual entra al contexto del análisis por las lecturas ya
  existentes, que ya enmascaran texto libre (`histology` es texto libre y ya pasa por ese camino).
- `admin` no escribe datos clínicos (mínimo privilegio, E-04): 403. Solo datos sintéticos en tests y fixtures (RN-13).

## Contratos

- **Proveedor:** `clinical-api`. **Consumidores:** `web` (US-111, cliente generado). **Sin diff en
  `apps/clinical-api/openapi.yaml` ni en `apps/rag-orchestrator/openapi.yaml`**: `createManualBiomarker`,
  `createManualDiagnosis`, `BiomarkerManualCreate`, `DiagnosisManualCreate`, `DiagnosisGradingInput`,
  `ErrorRegistroManualInvalido` y `ErrorDiagnosticoInvalido` están congelados (US-033 AC-10). `contracts:breaking` = 0.
- Ejemplos existentes en `contracts/examples/` reutilizados por los tests: `biomarker-manual.json`,
  `diagnosis-manual-nottingham.json`, `diagnosis-manual-gleason.json`, `diagnosis-manual-gleason-completo.json`,
  `error-gradacion-incoherente.json`, `error-paciente-egresado.json`, `error-valor-fuera-de-catalogo.json`,
  `error-cuerpo-invalido.json`, `error-permiso-denegado.json`.
- Zod de entrada **generado** del spec (`src/zod/`), nunca a mano. Verificación del proveedor (US-214) en cada test de
  integración, incluidos los 4xx. ADR-26: contrato estable.
- Observación: AC-1 del Markdown dice `value = "20 %"`; el ejemplo congelado separa `value = "20"` y `unit = "%"`. El
  escenario usa el ejemplo (manda el contrato).

## Evaluación

`escalas.json` y el subconjunto LOINC de `codigos.json`/`sinonimos.json` son cambio de catálogo: `run-ai-eval` (OL-06)
es **obligatorio** (decidido, `[S5 resp. 9]` y `[S5 resp. 13]`). No toca criterios de aplicabilidad ni el corpus; se
espera delta 0 en recall@10, MRR, fidelidad y precisión de citas, y el mapeo terminológico ≥ 0,95 (los biomarcadores de
los datos críticos pasan de `no_mapeado` a `mapeado`). `manifest.json` 1.3.0 se monta igual en los dos backends (sin
`409`).

## Dependencias y colaboradores

- **Nuevo** `src/modules/manual-entry/`: controller (HTTP ↔ service, `authorize('clinical:write')`), service (factory
  `createManualEntryService({ repositorio, reconciliacion, escalas, reloj, generarId })`), repository (Prisma,
  transacción, `FOR UPDATE`), `manual-entry.reglas.ts` (`derivarGleason`, `validarCoherenciaGleason`,
  `elegirGradacionDeReferencia`, `textoDeGrado`, `fusionarCorreccion`, `validarValoresDeCatalogo`), `ports.ts`.
- **Nuevo** `src/modules/compartido/paciente-activo.ts` (`pacienteAdmiteRegistros()`, RN-17).
- **Nuevo** `src/infrastructure/catalogo/catalogo-de-escalas.ts` (adaptador de `escalas.json`).
- **Usa** `ReconciliationService` (puerto de `l1d-84`), `elegirDiagnosticoVigente` (`compartido/diagnostico-vigente.ts`),
  `authorize`, `http-errores.ts`. El service depende de puertos, nunca de Prisma ni de adaptadores concretos.
- **Modificado** `server.ts`/composición (montar el router), `packages/clinical-catalogs` (schema, validador, catálogo
  real, fixture), `prisma/` (migración D7), `docs/architecture/data-model.md` (D7, `escalas.json`, regla de referencia de
  mama confirmada: «la más reciente verificada»).
- **Fakes:** ninguno nuevo. Los tests de integración usan PostgreSQL real, el adaptador real de catálogo sobre el fixture
  y el `ReconciliationService` real (no hay borde arquitectónico que fingir).
- **Una regla, un dueño:** antes del PR, `grep -rn "Nottingham grado\|Gleason .*ISUP\|no_mapeado\|egresado"
  apps/clinical-api/src`: si la ficha o el seed ya derivan el texto de `grade` o el grupo ISUP, se reutiliza o se mueve a
  `manual-entry.reglas.ts` y se reexporta (el seed se exceptúa si usa datos fijos).

## Tests

- Unitarios (lógica pura, uno a uno): `derivarGleason`, `validarCoherenciaGleason`, `elegirGradacionDeReferencia`,
  `textoDeGrado`, `fusionarCorreccion`, `pacienteAdmiteRegistros`.
- Aceptación/integración (Supertest + PostgreSQL de test + catálogo `test-s2-1.0.0`): AC-1…AC-6, 401/403/404/RN-17 y
  no-fuga en *logs*, con F-M2, el paciente de próstata de FX-03b-a y un egresado sintético.
- Catálogo: validador sobre el catálogo real, el fixture y un fixture inválido.

## Riesgos

- Un código o nombre LOINC copiado mal rompería DEC-04: se verifica cada entrada en la fuente y se registra la versión.
  AC-1 se sigue verificando con el fixture `test-s2-1.0.0`; con el catálogo real, Ki-67 manual sale `mapeado` (D10).
- Copiar gradaciones al diagnóstico nuevo duplica filas de `diagnosis_grading`; es el precio de que cada diagnóstico
  tenga su gradación de referencia (índice único parcial por `diagnosis_id`).

## Decisiones del Gate 1 (usuario, 2026-11-03)

- **P-1 → decidido `[S5 resp. 13]`:** biomarcador manual `clinical_significance = relevante`, `significance_source =
  regla` (D3); sin cambio del enum.
- **P-2 → decidido `[S5 resp. 13]`:** migración aditiva `histology` nullable (D7).
- **P-3 → decidido `[S5 resp. 13]`:** sin `supersedes_id` en `clinical.diagnosis`; el histórico se lee por
  `reemplazado` y fecha.
- **P-4 → decidido `[S5 resp. 9]`:** `run-ai-eval` se corre (cambio de catálogo: `escalas.json` y LOINC).
- DEC-01 Q1: el dato manual `verificado` cuenta como «Presente y verificado» en el checklist.
- Los supuestos marcados antes como «(asumido)» quedan decididos `[S5 resp. 13]`.

## Decisiones del Gate 2 (vuelta 1, 2026-11-03)

- **Validación sobre el diagnóstico resultante (P2-2).** D4 solo decía «si `cancerType` cambia, se recalcula CIE-10». Se amplía: toda corrección valida SIEMPRE contra el catálogo el diagnóstico resultante (estadificación heredada, escala y rango del valor heredado, y el sistema de gradación de cada gradación copiada), no solo lo enviado. Una corrección que solo cambia el tipo de cáncer o la escala y deja un dato heredado inválido responde `422 VALOR_FUERA_DE_CATALOGO`. Efecto lateral aceptado: un catálogo montado sin `escalas.json` rechaza cualquier corrección con estadificación o gradación heredadas. Confirmada por el usuario (2026-11-03).
- **`ReconciliationService` acepta `tipoDeCancer: null` (P3-7).** Un biomarcador de un paciente sin diagnóstico vigente se normaliza a `no_mapeado` por una ruta explícita del servicio, sin el centinela `''`. `estadoPersistible(decision)` es el único estrechamiento de `n_a` a los estados persistibles (P2-3).

- **Fuente del subconjunto LOINC (D10, tarea 2.1b).** loinc.org y fhir.loinc.org exigen cuenta, así que el usuario autorizó otra fuente verificable: la API pública Clinical Tables del NLM (`loinc_items` v3, `data_version` 2.83, consulta del 2026-11-03). Solo entran los códigos verificados uno a uno (Ki-67, RE, RP, PSA); HER2 queda fuera porque el catálogo lo identifica por nombre y el código de inmunohistoquímica no sirve para ISH.
