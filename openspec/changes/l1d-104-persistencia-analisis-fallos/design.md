# Design — l1d-104-persistencia-analisis-fallos

## Context

Ver `proposal.md` (Why). Punto de partida: el change de L1D-103 deja en `apps/clinical-api/src/modules/evidence-analysis/`
el flujo `guard → Zod → leerCaso → ClinicalContextBuilder → ContextDeidentifier → RagQueryClient` y un puerto
`AnalysisCompletion` con un adaptador provisional que responde `502`. L1D-168 crea `clinical.ai_analysis_record`
(inmutable por *trigger* `BEFORE UPDATE`, `top_relevance_score double precision` nullable, sin `updated_at`). L1D-105
deja `createRagOrchestratorFetch({ baseUrl, signer })`, que arma las cabeceras salientes desde cero, incluida
`X-Request-Deadline`.

Flujo tras este change:

```
service.analizar(peticion, sesion)
  ... (L1D-103) ... request = armarRagQueryRequest(...)
  deadline = clock.now() + RAG_TIMEOUT_MS
  respuesta = RagQueryClient.consultar(request, { deadline, signal })   (cliente hey-api de L1D-105, [S1 resp. 13])
                                                                        ── fallo ──▶ mapearFalloRag() [S1 resp. 12]:
                                                                           503 / 502 / 504, sin INSERT
  AnalysisCompletion.completar(request, respuesta, caso, sesion)
     validarRespuestaInterna(respuesta)                                 ── no valida ──▶ 502, sin INSERT
     base = AnalysisBasisBuilder.construir(request, respuesta)          (S1: BaseDelAnalisisS1)
     registro = armarRegistro(...)                                       (función pura)
     repository.persistirAnalisis(registro)  [transacción]              ── falla ──▶ 500, sin resultados
  ◀── COMMIT ── respuesta 200 = aEvidenceAnalysis(registro)             (desde lo persistido)
```

## Goals / Non-Goals

**Goals:**
- RN-06 en un solo lugar con nombre propio: ningún `200` sin `COMMIT` previo, ningún fallo con resultados.
- Respuesta `200` idéntica a lo persistido (`evidenceOptions`, `analysisBasis`, `topRelevanceScore`).
- Mapeo de errores de Backend 2 cerrado, genérico y sin eco de detalles internos.

**Non-Goals:**
- Builder completo de la Base del análisis (US-066); historial y vigencia (FEAT-11a); el `409`/`429` propios (en el S1 ambos se mapean a `502`, decisión 5)/`503`
  (US-041/US-056/US-050); streaming (ADR-42).

## Decisions

1. **Responder desde lo persistido.** `aEvidenceAnalysis(registro)` mapea la fila escrita (no la respuesta de Backend 2)
   al `EvidenceAnalysis`; así "respuesta = persistido" (AC-1, AC-5) se cumple por construcción. El `INSERT` va en
   `prisma.$transaction` y el controlador escribe el `200` solo cuando la promesa del repository resuelve.
   Extraído como `persistirAntesDeResponder()` (RN-06), único punto que un guardián revisa.
2. **`topRelevanceScore` desde Backend 2, no recalculado** `[S1 resp. 18]`. Backend 2 lo calcula como el **máximo
   del `relevance_score` de los chunks sobre el umbral** (`null` si ninguno lo supera); el Markdown de US-053 y
   US-225 se corrige aparte a ese literal. En FX-06a-a vale 0,87 (`ch-m1-1`; `ch-m1v0-1` 0,91 no es `is_current` y no
   se recupera). Backend 1 no reinterpreta un metadato del *reranker* (RN-03). Se extrae `topRelevanceScorePersistible()`
   que copia el valor y rechaza (→ `502`) una respuesta incoherente (`sin_evidencia` con número, o `con_evidencia`
   con `null`), aunque el Zod generado del `if/then` ya lo cubra. `null` nunca se convierte en `0`.
3. **Base del análisis mínima del S1 detrás de un puerto.** `AnalysisBasisBuilder` con adaptador `BaseDelAnalisisS1`:
   `sourcesConsulted = { selected: sourcesSelected, filters: filtersApplied efectivos, retrieved, aboveThreshold }`
   (de `retrievalStats`), `sourcesNotIncluded = meta.excludedSources`, `corpusCutoffDate = meta.corpusCutoffDate`,
   `limitations` y `assumptions` de la respuesta, `agentSteps`, `omittedClaims`, `patientDataUsed = []`,
   `missingCriticalData = []`, `priorAnalysesUsed = []`, `continuedWithWarning = continueWithWarning ?? false`.
   **Supuesto fijo del S1** (corrección del Gate 1): `construirBaseS1()` añade al final de `assumptions[]`
   `{ text: config.ANALYSIS_BASIS_S1_ASSUMPTION_TEXT, origin: regla_catalogo }`, con el literal "Datos del paciente
   recibidos como contexto. Esta versión no verifica su completitud ni la ausencia de datos clínicamente
   relevantes." `[S1 resp. 30]` en configuración (junto a
   `AI_DISCLAIMER_TEXT`), nunca en el código; así `patientDataUsed = []` y `missingCriticalData = []` no se leen como
   "no se usaron datos" ni "no faltan datos". El literal pasa `lint:lenguaje` (L1D-193; sin términos de nivel A ni
   B). `origin = regla_catalogo` porque el enum del contrato solo admite `regla_catalogo | llm_verificado` y el texto
   no lo genera el LLM. US-066 (S2) lo sustituye sin tocar el service. Alternativa descartada: construir ya
   `patientDataUsed` (es el alcance de US-066).
4. **Columnas del registro** (`data-model.md` §4.3), armadas por la función pura `armarRegistro()`:
   `id` y `created_at` de `IdGenerator`/`Clock` inyectados; `trace_id` = el `traceId` **generado** por
   `clinical-api` (L1D-103; nunca el `X-Trace-Id` entrante); `analysis_type = analisis_evidencia`;
   `requested_by` = usuario de la sesión; `patient_id`, `episode_id` (episodio activo leído por L1D-103);
   `query_text` y `clinical_context_snapshot` en su versión **desidentificada** y sin `pseudoPatientId` (RN-11,
   nota de `data-model.md`); `context_fingerprint` = SHA-256 hex del JSON canónico (claves ordenadas) del snapshot;
   `question_template_id`, `sources_selected`, `filters_applied` (cierra US-052 AC-5), `continued_with_warning`;
   `synthesis`, `applicability`, `evidence_options`, `discarded_options`, `omitted_claims`, `agent_steps`,
   `analysis_basis`, `patient_data_links` (mapa `dataRef` de L1D-103), `prior_analyses_used = []`,
   `missing_critical_data = []`; `status`, `top_relevance_score`; de `meta`: `query_language`,
   `response_language`, `llm_provider`, `llm_model`, `embedding_model`, `reranker_model`, `nli_model`,
   `prompt_version`, `corpus_release`, `catalog_version`, `retrieval_params`; `data_classification` del request;
   `rerun_of_analysis_id = null`, `case_summary = null`.
5. **Una sola tabla de mapeo** (`mapearFalloRag()`, función pura, `[S1 resp. 12]`). Cada fila tiene su escenario:

   | Fallo de `rag-orchestrator` | Respuesta de `clinical-api` |
   |---|---|
   | `503` con `error = LOCAL_LLM_UNAVAILABLE` | `503 LOCAL_LLM_UNAVAILABLE` (`error-llm-local-no-disponible.json`) |
   | `503` con `error = RETRIEVAL_UNAVAILABLE` (L1D-106) | `502 ERROR_SERVICIO_IA` |
   | `503` con `error = NLI_UNAVAILABLE` (L1D-180) | `502 ERROR_SERVICIO_IA` |
   | `422` con `error = TIPO_CANCER_NO_REGISTRADO` (L1D-106, defensa en profundidad) | `422 TIPO_CANCER_NO_REGISTRADO` (`error-tipo-cancer-no-registrado.json`, L1D-103) `[S1 resp. 35]` |
   | cualquier otro `422` (validación o `tipo_no_habilitado`) | `502 ERROR_SERVICIO_IA` |
   | `401` (token de servicio inválido) | `502 ERROR_SERVICIO_IA` |
   | cualquier otro `5xx` (incluido un `503` con código desconocido) | `502 ERROR_SERVICIO_IA` |
   | error de red (asumido) | `502 ERROR_SERVICIO_IA` |
   | `200` que no valida contra `RagQueryInternalResponse` (asumido) | `502 ERROR_SERVICIO_IA` |
   | *timeout* local (`AbortError` al vencer `RAG_TIMEOUT_MS`) o `504 DEADLINE_VENCIDO` de rag | `504 DEADLINE_VENCIDO` |
   | `409` de rag (p. ej. catálogo) — **en el S1** | `502 ERROR_SERVICIO_IA` (Gate 1, 2ª vuelta); desde S2, `409` (US-041, por regresión) |
   | `429` de rag — **en el S1** | `502 ERROR_SERVICIO_IA`, sin `Retry-After` (Gate 1, 2ª vuelta); desde S4, `429` con `Retry-After` (US-056, por regresión) |

   En el S1 no hay ramas reservadas inertes: `409` y `429` caen explícitamente en `502` con su escenario, para que
   el comportamiento sea verificable y US-041/US-056 lo cambien por regresión, no por una rama sin probar.
   Ninguna fila persiste un `AIAnalysisRecord` ni hace eco del cuerpo, del `message` ni de las cabeceras de Backend 2.
   La fila de `TIPO_CANCER_NO_REGISTRADO` `[S1 resp. 35]` es la única que conserva el código de rag: el caso no
   tiene tipo de cáncer y decir `ERROR_SERVICIO_IA` mentiría sobre la causa; se responde con el mensaje fijo de
   `clinical-api`, nunca con el `message` de rag. En el flujo normal no se alcanza (L1D-103 corta antes).
   Fallo de `persistirAnalisis()` → `500 ERROR_INTERNO`. Los cuerpos usan los mensajes fijos de los ejemplos
   (`error-servicio-ia.json`, `error-llm-local-no-disponible.json`, `error-deadline-vencido.json`,
   `error-interno.json`, `error-tipo-cancer-no-registrado.json`) más el `traceId` generado; jamás el *stack* de Backend 2 o de PostgreSQL. El `504` propio de
   rag se trata como *timeout* porque significa que venció el `X-Request-Deadline` propagado.
6. **Deadline** `[S1 resp. 13]`. `RAG_TIMEOUT_MS` (propuesta 30000; RN-22, en `src/config.ts`). El service calcula
   `deadline = clock.now() + RAG_TIMEOUT_MS` y lo pasa como el **parámetro tipado** `X-Request-Deadline` (ISO 8601)
   de la operación del cliente hey-api generado de L1D-105 (cabecera declarada en el spec de `rag-orchestrator`),
   junto con un `AbortSignal` cuyo temporizador es inyectable (tests con `vi.useFakeTimers`). El transporte
   `createRagOrchestratorFetch()` solo añade el JWT y no copia cabeceras entrantes; no se duplica el transporte.
7. **Logs.** En cada fallo: `{ event, codigo, traceId, patientId }` (UUID); nunca la pregunta, el contexto, la
   respuesta de Backend 2 ni el mensaje del error de PostgreSQL (puede contener valores de la fila).
8. **Evento derivado (AC-6, ADR-32).** El flujo no escribe en `clinical.clinical_event`; el test lo afirma contando filas.

Alternativas: ninguna decisión es cara de revertir salvo el contrato, y el cambio de contrato es aditivo (una
respuesta nueva); se descartan en línea: devolver `502` ante fallo de persistencia (contradice PRD §10 y AC-2);
responder desde la respuesta de Backend 2 (abre divergencia con lo persistido).

## Privacidad y ownership

- **Fronteras:** `web` → `clinical-api` (cookie opaca); `clinical-api` → `rag-orchestrator` solo por
  `createRagOrchestratorFetch()` con JWT de servicio (L1D-105), por `RAG_ORCHESTRATOR_URL` interno. Este change no
  añade datos al request saliente: solo la cabecera `X-Request-Deadline`.
- **Qué se persiste:** todo en `clinical.ai_analysis_record` (schema `clinical`, dueño Backend 1). `query_text` y
  `clinical_context_snapshot` en su versión desidentificada (RN-11, L1D-203), sin `pseudoPatientId`; la identidad
  (schema `identity`) no se lee ni se copia (RN-10). `patient_data_links` (UUID reales) solo vive en Backend 1.
- **rag-orchestrator no toca datos clínicos:** no recibe nada persistido ni tiene ruta a PostgreSQL clínico ni a
  `clinical-minio`.
- **Respuestas de error y logs:** genéricas, sin detalles internos ni eco (requisito "Códigos de error cerrados y sin
  eco"); logs con `traceId` y UUID, nunca PHI.
- **Datos:** solo seed sintético (semilla a) y fixtures FX-06a; ningún dato real (RN-13, RN-14).

## Contratos

- **Proveedor:** `clinical-api` (`POST /platform/evidence-analyses`); **consumidor:** `web` (L1D-139). **Proveedor:**
  `rag-orchestrator` (`POST /rag/query`); **consumidor:** `clinical-api` (sin cambios).
- **Diff propuesto** de `apps/clinical-api/openapi.yaml` (`info.version` **1.2.0 → 1.3.0**, `[S1 resp. 37]`):

  ```diff
   /platform/evidence-analyses:
     post:
       responses:
  +      "500":
  +        $ref: '#/components/responses/ErrorInterno'
         "502":
           $ref: '#/components/responses/ErrorServicioIa'
   components:
     responses:
  +    ErrorInterno:
  +      description: >-
  +        Fallo interno de clinical-api (p. ej., al persistir el AIAnalysisRecord). Nunca incluye resultados
  +        del análisis ni detalles internos (RN-06).
  +      content:
  +        application/json:
  +          schema:
  +            $ref: '#/components/schemas/ErrorInterno'
     schemas:
  +    ErrorInterno:
  +      type: object
  +      additionalProperties: false
  +      required: [error, message, traceId]
  +      properties:
  +        error: { type: string, const: ERROR_INTERNO }
  +        message: { type: string }
  +        traceId: { type: string }
  # info.version: 1.1.0 (L1D-164) → 1.2.0 (L1D-103) → 1.3.0 (este change); L1D-194 → 1.3.1 y L1D-203 → 1.4.0 [S1 resp. 37]
  ```

- **Ejemplos:** nuevo `contracts/examples/error-interno.json`
  (`{"error":"ERROR_INTERNO","message":"No se pudo completar el análisis.","traceId":"req_…"}`) con entrada en
  `index.json` (`target: #/paths/~1platform~1evidence-analyses/post/responses/500`). Se reutilizan
  `error-servicio-ia.json`, `error-deadline-vencido.json`, `rag-query-con-evidencia.json`,
  `rag-query-sin-evidencia.json`, `rag-token-servicio-invalido.json`, `con-evidencia-s1.json`, `sin-evidencia.json`,
  `error-tipo-cancer-no-registrado.json` (L1D-103) y `rag-tipo-cancer-no-registrado.json` (L1D-106) `[S1 resp. 35]`.
- **Compatibilidad:** añadir una respuesta a una operación es aditivo; `oasdiff` no debe reportar incompatibilidad
  (ADR-26). Si la reporta, el change se detiene y se declara.
- **Orden y archivos tocados** `[S1 resp. 17]`: `contracts:generate` (cliente, Zod y extracto del `readme.md` §4)
  **antes** de `contracts:check`; `readme.md` figura como archivo tocado (extracto generado). Ante conflicto de merge
  en `openapi.yaml`, lo generado o el extracto del readme, se rebasa y se **regenera**; nunca se fusiona a mano.
- **Generado, nunca fuente:** el Zod de `RagQueryInternalResponse` (defensa en el borde) y de `ErrorInterno`, y el
  cliente TS, salen de `packages/api-contracts` (skill `sync-contracts`).
- **Verificación del proveedor:** `200` con evidencia, `200` sin evidencia, `500`, `502`, `503` y `504` se validan
  contra el spec de `clinical-api` con el *helper* de L1D-164 (Ajv2020 sobre el *bundle*, `[S1 resp. 17]`);
  `contracts:verify-provider` llega con US-214.

## Dependencias y colaboradores

| Módulo | Nuevo/Mod. | Depende de (puertos) | Reglas extraídas |
|---|---|---|---|
| `analysis-completion.ts` (`crearAnalysisCompletion`) | nuevo | `AnalisisRepository`, `AnalysisBasisBuilder`, `Clock`, `IdGenerator`, config | `validarRespuestaInterna()`, `topRelevanceScorePersistible()` (RN-02), `armarRegistro()`, `persistirAntesDeResponder()` (RN-06) |
| `analysis-basis.ts` (`BaseDelAnalisisS1`) | nuevo | — | `construirBaseS1()` |
| `rag-failure.ts` | nuevo | — | `mapearFalloRag()` |
| `evidence-analysis.service.ts` | mod. | `RagQueryClient` (con `deadline`/`signal`), `Clock` | `calcularDeadline()` (RN-22) |
| `evidence-analysis.repository.ts` | mod. | Prisma (real en tests) | `persistirAnalisis()` (transacción) |
| `evidence-analysis.mapper.ts` | nuevo | — | `aEvidenceAnalysis(registro)` |
| `src/config.ts` | mod. | — | `RAG_TIMEOUT_MS`, `AI_DISCLAIMER_TEXT`, `ANALYSIS_BASIS_S1_ASSUMPTION_TEXT` |

Ningún service importa Prisma ni un cliente HTTP concreto; los reciben por la *factory* (sin contenedor de DI).

## Risks / Trade-offs

- **Contención con L1D-103 en los mismos archivos** (service, repository, `ports.ts`) → se implementa en la oleada
  siguiente sobre su rama mergeada; este change no redefine lo que L1D-103 crea.
- **Choque de `info.version`** con L1D-164/L1D-103/L1D-194/L1D-203 → resuelto por el registro de versiones
  `[S1 resp. 37]` (este change = 1.3.0); quien mergea segundo rebasa y regenera.
- **Fallo de persistencia en integración sin mockear Prisma** → se provoca en la BD real de test con un *trigger*
  temporal `BEFORE INSERT` que lanza `RAISE EXCEPTION` (creado y borrado por el test); el repository es real.

## Pendiente de definir

- ~~Firma del transporte para el deadline~~: resuelta por `[S1 resp. 13]` (`X-Request-Deadline` es parámetro tipado
  de la operación del cliente hey-api de L1D-105; `signal` por la opción de `fetch` inyectable).
- ~~Discrepancia `topRelevanceScore`~~: resuelta por `[S1 resp. 18]` (máximo de los chunks sobre el umbral,
  calculado por Backend 2).
- **Mensaje de `ERROR_INTERNO`** (dueño: `clinical-language-auditor` en Gate 1): literal propuesto "No se pudo
  completar el análisis."
