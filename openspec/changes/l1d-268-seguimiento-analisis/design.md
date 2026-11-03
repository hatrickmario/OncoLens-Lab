# Design — l1d-268-seguimiento-analisis

## Context

Ver proposal.md (Why). Estado actual en `main`:

- **Contrato congelado** (US-033 AC-13): `POST/GET /platform/evidence-analyses/{analysisId}/follow-ups` (`FollowUpCreate`,
  `FollowUpTurn` con `if/then` por `status`, `FollowUpCitedSource.isNewSource`, `409 ErrorLimiteSeguimiento`, `422
  ErrorSeguimientoNoProcesable` con `CUERPO_INVALIDO | PACIENTE_EGRESADO | ANALISIS_SIN_EVIDENCIA`, `403
  PermisoDenegadoOOptOut`, `429`, `502`, `503`, `504`) y `POST /rag/follow-up` (`RagFollowUpRequest` con `clinicalContext`,
  `analysisMemory: PriorAnalysisMemory[]`, `filtersApplied`; `RagFollowUpResponse` con `status`, `answer: SupportedClaim[]`,
  `citedSources`, `omittedClaims`, `topRelevanceScore`, `meta`). Ejemplos: `follow-up-create.json`, `follow-up-turn.json`,
  `follow-up-fuera-de-contexto.json`, `rag-follow-up-{request,response,fuera-de-contexto}.json`, `error-limite-seguimiento.json`.
- **Esquema** (US-038): `clinical.analysis_follow_up` (`turn_number` único por análisis, `question_text` enmascarado, columnas
  de `meta`, `data_classification`, `trace_id` «nuevo por turno», inmutable con `BEFORE UPDATE`, sin `pseudo_patient_id`).
  Permisos `follow_ups:create` y `follow_ups:read` solo para `doctor` (`prisma/seed/roles.ts`).
- **`AIAnalysisRecord`** guarda `clinicalContextSnapshot` (el contexto enviado **sin** `pseudoPatientId`), `patientDataLinks`
  (mapa **completo** `rN → {entityType, entityId}`, `enlacesDeDatos()` en `analysis-record.ts`), `evidenceOptions`,
  `synthesis`, `status`, `queryText` enmascarado y `catalogVersion`.
- **`rag-orchestrator`**: `RAGOrchestratorService.consultar()` ya compone recuperación (`_recuperar_y_puntuar`), umbral,
  generación, `_validar_citas_y_ensamblar` (citas + NLI + RN-23) y `meta`; `/rag/follow-up` ya está especificado para emitir
  `queryRewrite = {applied: false, reason: "no_aplica"}` (spec `evidence-analysis`, US-238). No hay router ni caso de uso.
- **US-250** (`l1d-306-pregunta-nfc`, O1): crea `normalizarPregunta()` / `esquemaPreguntaNormalizada` en
  `packages/clinical-language` y `normalizar_pregunta()` en `app/domain/pregunta.py`, y deja explícito que el seguimiento
  debe reutilizarlas.
- **`AnalysisBasis`** declara `maxOptions` pero no el tope del seguimiento: la UI de US-219 no tiene de dónde leer el «10»
  sin duplicar la configuración (RN-22). Se añade aquí `[S5 resp. 10]`.

Decisiones que aplican: `[Pre-S1 resp. 14, 19, 23, 29]`, `[S4 resp. 1]`, `[S5 resp. 3]`, D-12 `[S5 resp. 7]`,
`[S5 resp. 8]` (DEC-22), `[S5 resp. 10]`, `[S5 resp. 12]` y `[S5 resp. 13]` (todos los supuestos del change, **Decidido
(usuario, 2026-11-03)**). No se reabren
D-01, RN-23 ni RN-24 (`S5-refinamiento.md` §3), ni ADR-26, ADR-34 ni ADR-40.

## Goals / Non-Goals

**Goals:** implementar el contrato congelado de punta a punta en los dos backends con las mismas garantías del análisis
(RN-01, RN-02, RN-04, RN-06, RN-11, RN-23, RN-24), límite en configuración, Backend 2 sin estado, y la pregunta normalizada
con la regla única de US-250.

**Non-Goals:** UI (US-219); `403` por opt-out (Regresión [RN-15] activa desde S6, DEC-22, US-148); `422 PACIENTE_EGRESADO` (US-198, Post-MVP); ampliar antigüedad
(US-220, S6); memoria entre análisis (US-189…US-191, S6); streaming (TBD-08).

## Decisions

### D1 · El contexto fijo sale del snapshot del análisis, no de los datos actuales

`clinical-api` arma `RagFollowUpRequest.clinicalContext` desde `AIAnalysisRecord.clinicalContextSnapshot` con un
`pseudoPatientId` **nuevo** (generador inyectado) y `filtersApplied` = los del análisis. Los `rN` del snapshot se resuelven
con `patientDataLinks` del análisis (mapa completo), así `FollowUpTurn.patientDataLinks` enlaza a las entidades reales sin
releer datos. Es literalmente «los datos usados por el análisis» `[Pre-S1 resp. 14]` y evita que una corrección posterior
(US-253) cambie el contexto del hilo.

*Descartadas:* reconstruir el contexto con los datos actuales (el hilo dejaría de estar anclado al análisis y el aviso de
contexto cambiado es de FR-12/US-251); enviar el `clinicalContext` sin `dataRef` (perdería ADR-34).

### D2 · `analysisMemory` = el análisis de origen, rotulado

Un único `PriorAnalysisMemory` (`source = analisis_previo_ia`, `citable = false`) con `question` = `queryText` (ya
enmascarado), `synthesisSummary` y `optionsDescribed` (títulos de `evidenceOptions`) **re-enmascarados** con el
desidentificador de ADR-40 (defensa en profundidad: el texto viene del LLM), `monthsAgo` relativo con el reloj inyectado,
`linkedDecision = null` (la decisión es Post-MVP) y `outcomesSince` = eventos clínicos registrados después del análisis, con
`eventType` y `description` enmascarados (AC-6). Los turnos previos **no** viajan: cada pregunta se responde contra el
análisis (`[Pre-S1 resp. 14]`; la memoria de conversaciones es US-255, S6). **Decidido (usuario, 2026-11-03)** `[S5 resp. 13]`.

### D3 · Normalizar → validar → desidentificar, con la regla de US-250

`follow-up.schema.ts` compone el Zod generado `zFollowUpCreate` con `esquemaPreguntaNormalizada` (la longitud se mide tras
normalizar, igual que `query`). Después, la pregunta pasa por el mismo desidentificador que `query` (ADR-40,
`context-deidentifier.ts`) **antes** de persistir y de enviar; `FollowUpTurn.question` y `question_text` guardan la versión
enmascarada. `rag-orchestrator` vuelve a normalizar con `normalizar_pregunta()` en el router. Ningún literal de la regla se
duplica: un dueño por lenguaje.

### D4 · Orden del POST y límite

1. Sesión y `follow_ups:create` (RBAC existente). 2. Cuerpo (D3) → `422 CUERPO_INVALIDO`. 3. Análisis inexistente → `404`.
4. Análisis `sin_evidencia` → `422 ANALISIS_SIN_EVIDENCIA`. 5. Turnos existentes ≥ `ANALYSIS_FOLLOWUP_MAX` → `409
LIMITE_SEGUIMIENTO` (mensaje literal del ejemplo, sin clave de configuración). 6. Desidentificar y llamar a `/rag/follow-up`
con *deadline*. 7. Validar la respuesta (cliente generado), calcular `isNewSource` y `patientDataLinks`, verificar
`llm_provider` contra `data_classification` (RN-12, regla existente). 8. **Insertar** el turno en una transacción que bloquea
la fila del análisis (`SELECT … FOR UPDATE`, no la actualiza) y recalcula `turn_number = max + 1`; si el recálculo supera
el máximo (carrera), `409` y no se responde contenido. 9. `201`.

Todo fallo antes de 8 no consume turno ni persiste nada (los fallos de Backend 2 usan la tabla única `rag-failure.ts`). Un
fallo al insertar → `500 ERROR_INTERNO` sin contenido (RN-06). `ANALYSIS_FOLLOWUP_MAX` se declara una vez en
`config/secciones.ts` (`entero positivo`, por defecto 10, RN-22). *Descartada:* contar en la aplicación sin bloqueo (dos
POST simultáneos darían el 11.º turno o un `500` por la clave única).

### D5 · `isNewSource` y estado

`isNewSource = chunkId ∉ {chunkId de evidenceOptions[*].citedSources ∪ synthesis.citedSources del análisis}`. Función pura
`marcarFuentesNuevas()` en el módulo. `status`, `answer`, `citedSources`, `omittedClaims` y `meta` se copian de la
respuesta de Backend 2; `disclaimer` sale de `AI_DISCLAIMER_TEXT` como en el análisis.

### D6 · Backend 2: caso de uso propio sobre el pipeline existente

`app/application/seguimiento.py::ResponderSeguimiento` reutiliza los pasos de `RAGOrchestratorService` (recuperar y
puntuar, umbral, generar, validar citas y soporte, filtro RN-23, `meta`) sin el segundo loop ni la aplicabilidad por opción
(el seguimiento no devuelve opciones). Se exponen como métodos públicos los pasos que hoy son privados que haga falta
compartir (Extract Method), sin duplicar la regla. Router `app/api/rag_follow_up.py`. Orden:
`normalizar_pregunta` → clasificador `fuera_de_contexto` (D7) → recuperar → umbral (RN-02: sin chunks → `sin_evidencia`,
`topRelevanceScore = null`, sin LLM) → prompt de seguimiento → validar → respuesta.

### D7 · `fuera_de_contexto`: regla determinista + regla del prompt

- **Determinista** (`app/domain/contexto_del_seguimiento.py::clasificar_contexto_del_seguimiento()`, pura). Señales
  **Decidido (usuario, 2026-11-03)** `[S5 resp. 13]`; la pregunta es `fuera_de_contexto` si cumple **alguna**:
  1. contiene un marcador de identidad de ADR-40 (otra persona nombrada o identificada; la pregunta ya llega enmascarada);
  2. nombra, por los sinónimos del catálogo, un tipo de cáncer distinto del `cancerType` del contexto **y no** nombra el
     `cancerType` del contexto.

  Una pregunta **comparativa legítima** que nombra los dos tipos (p. ej., en mama, «¿la evidencia del análisis compara
  este resultado con lo descrito en próstata?») **no** es `fuera_de_contexto` por la regla determinista: sigue al pipeline,
  la recuperación filtra por el `cancerType` del contexto y toda afirmación sigue necesitando cita del turno y NLI. Corre
  **antes** de recuperar: si clasifica fuera, no se invoca a ningún adapter.
- **Prompt:** la plantilla instruye devolver el marcador estructurado `fuera_de_contexto` si la pregunta no trata de los
  hallazgos del análisis ni de su evidencia; si el LLM lo devuelve, la respuesta es `fuera_de_contexto` con `answer` y
  `citedSources` vacíos y `topRelevanceScore = null` (contrato). Una salida que no parsea sigue la ruta existente de salida
  inválida, nunca se convierte en `fuera_de_contexto`.

*Descartadas:* clasificador con el LLM como única señal (no determinista, no testeable sin modelo); umbral de similitud con
la memoria (mide relevancia, no pertinencia; RN-03).

### D8 · Memoria no citable (RN-24) por construcción

El prompt lleva la memoria en un bloque rotulado («Contexto del análisis previo, no es evidencia; no lo cites») distinto del
bloque de fragmentos con alias `C<n>`. La validación existente solo acepta citas a chunks recuperados **en este turno** y
calcula el NLI con esos chunks (y la verbalización determinista de los datos del paciente, ADR-34) como premisa; el texto de
la memoria **nunca** entra como premisa. Una afirmación sin cita válida o sin `entailment` frente a sus citas se omite y
suma en `omittedClaims` (AC-2). Regla con nombre: `premisas_del_soporte()` (excluye la memoria).

### D10 · `AnalysisBasis.maxFollowUps` en la Base `[S5 resp. 10]`

`clinical-api` copia `ANALYSIS_FOLLOWUP_MAX` de Settings a `analysisBasis.maxFollowUps` al crear cada análisis, como ya hace
con `maxOptions`; la Base persistida es igual a la respondida (RN-06). Es el **valor vigente al crear el análisis** y solo
informa a la UI (contador «n de N», texto del límite); la **autoridad es el `409 LIMITE_SEGUIMIENTO`**, que el POST calcula
con la configuración vigente en cada petición (D4). Un análisis histórico sin el campo sigue validando (opcional). Sin
literal del tope en `clinical-api` ni en `web`.

*Descartadas:* variable propia de `web` (dos dueños de la configuración, RN-22); contador sin total hasta el `409`
(incumple US-219 AC-1).

### D9 · Sin estado (AC-8)

El caso de uso no escribe en disco, caché, Milvus ni `corpus`; los logs registran `traceId`, conteos y estados, nunca la
pregunta, la memoria ni el contexto. Un Pytest lo demuestra con un `tmp_path` vigilado, el fake de Milvus que registra
escrituras, la sesión de `corpus` en solo lectura y `caplog` sin el texto sembrado.

## Criterios de verificación por AC

| AC | Nivel | Dónde |
|---|---|---|
| AC-1 | Integración (Supertest + PostgreSQL real + MSW hacia `/rag/follow-up` desde `contracts/examples/`) | `apps/clinical-api/tests/integration/evidence-analysis/seguimiento.test.ts` |
| AC-2 | Integración (`TestClient`, LLM y NLI falsos) | `apps/rag-orchestrator/tests/integration/test_rag_follow_up.py` |
| AC-3 | Integración (`TestClient`, contador de llamadas al LLM) + clinical-api persiste el turno `sin_evidencia` | ídem + `seguimiento.test.ts` |
| AC-4 | Integración (Supertest, `ANALYSIS_FOLLOWUP_MAX` inyectado, 10 turnos sembrados) | `seguimiento-limite.test.ts` |
| AC-5 | Unitario del clasificador + integración (`TestClient`, cero llamadas a adapters) | `tests/unit/test_contexto_del_seguimiento.py` + `test_rag_follow_up.py` |
| AC-6 | Integración (PII sembrada en pregunta y en eventos; cuerpo saliente registrado por MSW; logs capturados) | `seguimiento-pii.test.ts` |
| AC-7 | Integración (`TestClient`, LLM falso con término prohibido) | `test_rag_follow_up.py` |
| AC-8 | Integración en ambos lados (dos turnos; `trace_id` propio persistido, seudónimo nunca; Pytest de no escritura) | `seguimiento-seudonimo.test.ts`, `test_rag_follow_up_sin_estado.py` |
| US-219 AC-1 (D10) | Integración (Supertest + PostgreSQL real + MSW hacia `rag-orchestrator`; respuesta validada contra el spec) | `tests/integration/evidence-analysis/base-max-follow-ups.test.ts` |

## Privacidad y ownership

- **Fronteras:** navegador → `web` (US-219) → `clinical-api` con cookie de sesión; `clinical-api` → `rag-orchestrator` con
  JWT de servicio (la sesión nunca cruza). Cruza a Backend 2: pregunta normalizada **y enmascarada**, el snapshot
  desidentificado del análisis (fechas relativas, `rN` opacos, sin UUID) con un `pseudoPatientId` nuevo por turno, y la
  memoria rotulada con texto re-enmascarado y `outcomesSince` enmascarado.
- **RN-10/RN-11:** la identidad nunca sale de `clinical-api`; `pseudoPatientId` y `traceId` nuevos por turno (generadores
  inyectados); el seudónimo **no** se persiste (la tabla no tiene la columna; `data-model` lo exige). El `trace_id` propio
  del turno **sí** se persiste (`data-model` §7), nunca el seudónimo: **Decidido (usuario, 2026-11-03)** `[S5 resp. 12]`
  (se corrige el texto de US-218 AC-8).
- **Desidentificación:** el mismo desidentificador de ADR-40 (patrones + identidad exacta) para la pregunta, la memoria y
  los eventos; si no está disponible, falla cerrado con el `503` existente sin llamar a la IA.
- **RN-12:** con datos reales solo modelos locales; `clinical-api` verifica `meta.llmProvider` contra
  `dataClassification` con la regla existente, y `rag-orchestrator` usa `reglas_proveedor` existente.
- **rag-orchestrator** no toca datos clínicos, `clinical-minio` ni tablas fuera de `corpus`; no persiste nada del turno.
- **Logs:** ni la pregunta, ni la respuesta, ni la memoria en ningún log de los dos backends (requisito existente «El
  gateway no registra la pregunta ni el contexto en los logs», extendido al seguimiento); solo UUID del análisis y `traceId`.
- **Fixtures:** solo sintéticos (paciente semilla (b), PII sintética sembrada de FX de ADR-40).
- **`maxFollowUps`** (D10): entero de configuración, sin PII.

## Contratos

Proveedores: `clinical-api` (`/follow-ups`, `AnalysisBasis`) y `rag-orchestrator` (`/rag/follow-up`). Consumidores: `web`
(US-219) → `clinical-api`; `clinical-api` → `rag-orchestrator` (cliente generado). Cambios **solo aditivos** (ADR-26).
Versiones `[S5 resp. 10]`: `clinical-api` 1.15.1 → **1.17.0** (provisional: L1D-74, #295, toma 1.16.0; el orden de merge decide, si 268 entra antes se renumera a 1.16.0), `rag-orchestrator` 1.10.1 → **1.11.0** (tras `l1d-306`);
quien rebase renumera y regenera `packages/api-contracts`, nunca fusiona generados a mano.

```diff
 # apps/clinical-api/openapi.yaml · components.schemas.FollowUpCreate.properties
         question:
           type: string
           minLength: 1
           maxLength: 2000
+          description: >-
+            Pregunta de seguimiento. clinical-api la normaliza antes de validarla, desidentificarla,
+            persistirla y enviarla (Unicode NFC, espacios colapsados a uno y recortados; mayúsculas y
+            puntuación sin cambios). minLength y maxLength se miden después de normalizar (US-250, US-218).
```

```diff
 # apps/rag-orchestrator/openapi.yaml · components.schemas.RagFollowUpRequest.properties
         question:
           type: string
           minLength: 1
           maxLength: 2000
-          description: Pregunta ya enmascarada (RN-11).
+          description: >-
+            Pregunta ya enmascarada (RN-11) y normalizada por clinical-api (Unicode NFC, espacios
+            colapsados y recortados). rag-orchestrator vuelve a normalizarla al recibirla; vacía tras
+            normalizar → 422 (US-250, US-218).
```

```diff
 # apps/clinical-api/openapi.yaml · components.schemas.AnalysisBasis.properties
         maxOptions:
           type: integer
           minimum: 1
           maximum: 3
           description: ANALYSIS_MAX_OPTIONS aplicado en este análisis (RN-22, FR-09). Ausente en análisis históricos.
+        maxFollowUps:
+          type: integer
+          minimum: 1
+          description: >-
+            ANALYSIS_FOLLOWUP_MAX vigente al crear este análisis (RN-22, FR-31): tope de preguntas de
+            seguimiento que muestra la UI. La autoridad es el 409 LIMITE_SEGUIMIENTO. Ausente en
+            análisis históricos.
```

- Ejemplo `contracts/examples/con-evidencia-s4-tres-opciones.json` con `"maxFollowUps": 10` (y los `EvidenceAnalysis`
  nuevos del S5); los históricos sin el campo siguen validando.
- Ejemplos nuevos: `contracts/examples/follow-up-sin-evidencia.json` (`FollowUpTurn`, `status = sin_evidencia`, `answer` y
  `citedSources` vacíos) y `rag-follow-up-sin-evidencia.json` (`RagFollowUpResponse`, `topRelevanceScore: null`,
  `queryRewrite = no_aplica`), registrados en `contracts/examples/index.json` con su `target` y `request`. Sin PII.
- **Fallo cerrado alineado con el análisis** (vacío del contrato congelado: el seguimiento reutiliza el mismo pipeline y
  falla por las mismas causas):

```diff
 # apps/rag-orchestrator/openapi.yaml · paths./rag/follow-up.post.responses
         "503":
-          description: >-
-            LLM local no disponible (LOCAL_LLM_UNAVAILABLE). Con datos reales solo se usan
-            modelos locales, sin fallback a la nube (RN-12).
+          description: >-
+            Un componente local no está disponible o su salida no es válida (LOCAL_LLM_UNAVAILABLE,
+            LLM_OUTPUT_INVALID, RETRIEVAL_UNAVAILABLE, NLI_UNAVAILABLE): falla cerrada, ninguna
+            afirmación se devuelve sin validar (RN-01), sin respuesta parcial. Con datos reales solo
+            modelos locales, sin fallback a la nube (RN-12).
           content:
             application/json:
               schema:
-                $ref: '#/components/schemas/ErrorLlmLocalNoDisponible'
+                oneOf:
+                  - $ref: '#/components/schemas/ErrorLlmLocalNoDisponible'
+                  - $ref: '#/components/schemas/ErrorRecuperacionNoDisponible'
+                  - $ref: '#/components/schemas/ErrorNliNoDisponible'
+                  - $ref: '#/components/schemas/ErrorSalidaLlmInvalida'
```

```diff
 # apps/clinical-api/openapi.yaml · paths./platform/evidence-analyses/{analysisId}/follow-ups.post.responses
         "503":
-          $ref: '#/components/responses/LlmLocalNoDisponible'
+          $ref: '#/components/responses/GeneracionNoDisponible'
```

  `GeneracionNoDisponible` ya existe (lo usa `POST /platform/evidence-analyses`): LLM caído, salida inválida o
  desidentificación no disponible. `RETRIEVAL_UNAVAILABLE` y `NLI_UNAVAILABLE` de Backend 2 se exponen como `502` según la
  tabla única `rag-failure.ts`, igual que en el análisis. *Descartadas:* `500` genérico (oculta la causa y no es lo que
  hace el análisis) y no tocar el contrato (el 503 de `NLI_UNAVAILABLE` sería una respuesta fuera de spec y rompería la
  verificación del proveedor).
- **`oasdiff` (regla real, medida):** `scripts/ci/contracts-breaking.sh` corre `oasdiff breaking --fail-on ERR` y solo
  consulta `contracts-breaking-excepciones.json` si hay ERR. Medido el 2026-11-03 con `oasdiff` 1.33.0 sobre una copia de
  `main` con estos cambios aplicados (`bundle-specs.mjs` + `oasdiff breaking`): **0 ERR** y **1 WARN por proveedor**,
  `response-body-wrapped-in-one-of-original-preserved` (nivel 2) en `POST /rag/follow-up` y en
  `POST /platform/evidence-analyses/{analysisId}/follow-ups`; `maxFollowUps` y las descripciones no dan hallazgos. No es
  `response-body-one-of-added` (esa regla, ERR, aparece cuando el `503` **ya** era un `oneOf`, caso de E-3/E-14/E-16):
  aquí el `503` pasa de un `$ref` único a un `oneOf` que conserva el original. Por eso **no** se añade entrada al JSON de
  excepciones (no perdonaría nada y rompería el test que enumera E-1…E-17). La decisión aprobada `[S5 resp. 10]` se
  registra como fila E-18/E-19 de la tabla de ADR-26 (tarea humana `H-2`, tras el commit `contract(L1D-268)`), y el WARN
  se declara en el PR (ADR-26, Consecuencias). Si la medición de la tarea 1.3 contra la base real diera un ERR, se para
  y se añaden las entradas exactas al JSON con el texto de `oasdiff` (mismo `H-2`).
- Ejemplos de error: `rag-nli-no-disponible.json` y `error-desidentificacion-no-disponible.json` existentes se registran
  también contra los `503` del seguimiento en `contracts/examples/index.json`.
- Generados (`packages/api-contracts/**`, `app/schemas/generated/models.py`) solo con `contracts:generate`.
- Verificación del proveedor (US-214): las respuestas de ambos endpoints y todos sus errores se validan contra el spec en
  los tests de integración.

## Evaluación

**Prompt nuevo** (`app/prompts/seguimiento.py`, versión propia en `meta.promptVersion`) → suite `evaluate` obligatoria
(OL-06): reporte de `ai-eval-runner` en el PR (job `eval-required`), con adapters falsos en la CI. Métricas afectadas:
fidelidad (≥ 0,90), precisión de citas (≥ 0,90), «sin evidencia» (≥ 0,90), salidas prescriptivas (= 0) y una
comprobación nueva de RN-24 (ninguna afirmación mostrada con soporte solo en la memoria). Casos mínimos sintéticos en el
dataset de evaluación: 1 con evidencia, 1 sin evidencia, 1 fuera de contexto, 1 con la memoria como única base. La medición
con modelos locales va en la **corrida nocturna del día 2** (`S5-refinamiento.md` §5); la suite completa de opciones y
seguimiento es de US-140. Sin cambio de modelo, umbral, catálogo ni corpus.

## Dependencias y colaboradores

| Módulo | Cambio | Depende de |
|---|---|---|
| `clinical-api/src/modules/evidence-analysis/follow-up.controller.ts` | nuevo: POST y GET | `FollowUpService` (factory) |
| `…/follow-up.service.ts` | nuevo: orden de D4, límite, armado, persistencia | puertos `FollowUpRepository`, `RagFollowUpPort`, desidentificador ADR-40, reloj e IDs inyectados |
| `…/follow-up.repository.ts` | nuevo: lectura del análisis, conteo, inserción con bloqueo, listado | Prisma |
| `…/follow-up.schema.ts` | nuevo: compone `zFollowUpCreate` con `esquemaPreguntaNormalizada` | Zod generado, `packages/clinical-language` (US-250) |
| `…/follow-up.request.ts` | nuevo: `armarRagFollowUpRequest()`, `memoriaDelAnalisis()` (puras) | snapshot y registro del análisis |
| `…/follow-up.reglas.ts` | nuevo: `marcarFuentesNuevas()`, `superaLimiteDeSeguimiento()` (puras) | — |
| `…/rag-query.adapter.ts` / `ports.ts` | puerto `RagFollowUpPort` y adapter con el cliente generado | `packages/api-contracts` |
| `…/rag-failure.ts` | reutilizado sin cambios (tabla única de fallos) | — |
| `clinical-api/src/config/secciones.ts` | `ANALYSIS_FOLLOWUP_MAX` | — |
| `clinical-api/src/modules/evidence-analysis/` (armado de la Base) | copia `ANALYSIS_FOLLOWUP_MAX` a `analysisBasis.maxFollowUps` (D10) | Settings |
| `rag-orchestrator/app/api/rag_follow_up.py` | nuevo router; `normalizar_pregunta()` | `ResponderSeguimiento` |
| `app/application/seguimiento.py` | nuevo caso de uso | pasos compartidos de `RAGOrchestratorService`, puertos existentes |
| `app/domain/contexto_del_seguimiento.py` | nuevo: `clasificar_contexto_del_seguimiento()` | catálogo (sinónimos) |
| `app/domain/support.py` (o `soporte_por_papel.py`) | `premisas_del_soporte()` explícita (excluye memoria) | — |
| `app/prompts/seguimiento.py` | nueva plantilla y su versión | `app/domain/lenguaje.py` (RN-23) |

Reglas extraídas con nombre propio: `superaLimiteDeSeguimiento()` (RN-22), `marcarFuentesNuevas()`,
`memoriaDelAnalisis()` (RN-11/RN-24), `clasificar_contexto_del_seguimiento()`, `premisas_del_soporte()` (RN-24). Antes del
PR: buscar en el árbol el literal del mensaje de `LIMITE_SEGUIMIENTO`, `ANALYSIS_FOLLOWUP_MAX` y el cálculo de huella/alias
para no duplicar; el umbral (RN-02), el validador de citas (RN-01/RN-04) y el verificador RN-23 se **reutilizan**.

**Fakes:** `tests/support/llm_falso.py` (guiones de seguimiento: con evidencia, memoria como única base, término prohibido,
marcador `fuera_de_contexto`), `nli_falso.py`, almacenes falsos de recuperación y `milvus.py` (registro de escrituras); todos
siguen verdes contra `tests/support/contract.py` (mismos errores, `null` ≠ `0.0`). En `clinical-api`, MSW hacia
`/rag/follow-up` desde `contracts/examples/`; sin mocks de módulos propios ni de Prisma.

## Risks / Trade-offs

- [Carrera en el límite] → bloqueo de la fila del análisis y recálculo en la transacción (D4).
- [El clasificador determinista deja pasar preguntas ajenas] → la regla del prompt es la segunda capa; y aunque pase, toda
  afirmación mostrada sigue necesitando cita del turno y NLI.
- [Coste de un turno ≈ un análisis] → mismo *deadline*, `429` y semáforo de inferencia existentes; sin streaming.
- [Divergencia de pasos entre `/rag/query` y `/rag/follow-up`] → los pasos se comparten (Extract Method), no se copian.
- [`maxFollowUps` desfasado si cambia la configuración] → es informativo; el `409` manda (D10).
- [`l1d-306` no mergeado a tiempo] → las tareas de normalización esperan; el resto avanza con el Zod generado y se compone
  al mergear.

## Migration Plan

Sin migración (tabla y permisos desde US-038; `maxFollowUps` viaja dentro de la Base ya persistida). `.env.example` con `ANALYSIS_FOLLOWUP_MAX=10` vía `H-1`. *Rollback* = revertir
el PR; los turnos persistidos quedan (tabla inmutable).

## Open Questions

**Pendientes del humano (vuelta 1 del Gate 2, no decididos en la implementación):** ¿un turno `fuera_de_contexto` cuenta en el límite de 10 (hoy sí)?; ¿`maxFollowUps` de la Base o la configuración vigente en el `409` (hoy la vigente)?; `consulta_equivalente` ignora el filtro de fuentes del análisis original; la evolución posterior usa `event_date >` estricto. Ver `tasks.md` H-4.


Ninguna abierta. Resueltas en el Gate 1 (usuario, 2026-11-03):

- **AC-8 y `trace_id`** `[S5 resp. 12]`: se persiste el `trace_id` propio del turno, nunca el seudónimo; se corrige US-218 AC-8.
- **Señales del clasificador determinista (D7)** `[S5 resp. 13]`: las dos de D7, con el escenario de la pregunta
  comparativa legítima.
- **`503` del seguimiento** `[S5 resp. 10]`: E-18/E-19 aprobadas; regla real medida (WARN, sin entrada en el JSON); fila
  en ADR-26 vía `H-2`.
- **RN-15 en el S5** `[S5 resp. 8]`: Regresión [RN-15] activa desde S6 (DEC-22).
- **Tope del contador de US-219** `[S5 resp. 10]`: `AnalysisBasis.maxFollowUps` en este change (D10).
