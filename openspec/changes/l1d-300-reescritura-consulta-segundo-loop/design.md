# Design — l1d-300-reescritura-consulta-segundo-loop

## Context

RN-02 enmendada: sin chunks sobre el umbral tras el primer loop → un único segundo loop de reescritura con el LLM local; si tampoco supera el umbral → `sin_evidencia` sin invocar al LLM de generación ni al agente, con `topRelevanceScore = null` (`null` ≠ `0.0`). Es el único uso del LLM permitido antes de declarar «sin evidencia». Convive con US-113 (sin LLM). Bucle razonar → actuar → observar de una iteración, no el agente de FR-30.

Decisión del flujo (una propuesta elegida; descartadas en una línea): `QueryRewriteStep` dentro de `RAGOrchestratorService` con puerto `QueryRewriter`. Descartadas: reescribir siempre (viola AC-2 y añade latencia); reescritura en `clinical-api` (el contexto del paciente no debe acercarse al prompt, RN-11).

## Decisiones

- **D1 Disparo:** `debeReescribir(aboveThreshold, enabled, iteracion, max)` pura en `domain/`; solo con `aboveThreshold = 0` del primer loop. Con `QUERY_REWRITE_MAX_ITERATIONS = 1` hay un solo segundo loop aunque el LLM proponga otra reformulación (AC-4).
- **D2 Términos solo del catálogo (RN-27):** el LLM propone términos de expansión; `filtrarTerminosDelCatalogo()` (pura, usa `domain/catalogo.py` y `CLINICAL_CATALOG_PATH`) descarta los ausentes. La consulta del segundo loop = pregunta original + términos admitidos (la original manda). Si no queda ningún término admitido, no hay segunda recuperación.
- **D3 Pregunta original manda (RN-03, RN-06):** solo cambia el texto que se embebe para Milvus; el reranker puntúa contra la **pregunta original** y el umbral se compara con ese puntaje; `AIAnalysisRecord` y la respuesta usan la original.
- **D4 Fallo cerrado:** LLM caído, `QUERY_REWRITE_DEADLINE_MS` vencido, salida del LLM que no valida o cero términos admitidos → `sin_evidencia` con `queryRewrite = {applied: false, reason: "no_disponible"}`; nunca `5xx` por esto (asumido en el AC-5). `no_disponible` significa «no hubo reformulación utilizable»: es un metadato interno, no un mensaje de «LLM no disponible» al usuario, y nunca descarta un análisis ya validado (no lo hay: el primer loop estaba vacío). En esos caminos el log registra solo `reason` y el tipo de error (nombre de la clase de la excepción), **nunca** `str(exc)` ni `exc.errors()`: el mensaje de un `ValidationError` de Pydantic incluye `input_value` con la salida del LLM (RN-14); lo verifica la tarea 2.3 con caplog.
- **D5 Configuración (RN-22):** `QUERY_REWRITE_ENABLED`, `QUERY_REWRITE_MAX_ITERATIONS` (1), `QUERY_REWRITE_DEADLINE_MS`, versión del prompt de reescritura. Ningún literal en código.
- **D6 Forma de `queryRewrite` (decisión D-c del usuario, 2026-10-30; misma política que `fusion`/`fusionParam` de l1d-109):** objeto obligatorio y sin `null`, `{applied: boolean, reason: enum}`:

  | `reason` | `applied` | Cuándo |
  |---|---|---|
  | `disparado` | `true` | El primer loop quedó vacío y hubo segunda recuperación con la consulta reformulada (rescate o no). |
  | `no_disparado` | `false` | El primer loop tuvo ≥ 1 chunk sobre el umbral, o `QUERY_REWRITE_ENABLED = false`. |
  | `no_disponible` | `false` | Primer loop vacío pero sin reformulación utilizable (D4). |
  | `no_aplica` | `false` | `/rag/follow-up`: el segundo loop nunca corre en seguimiento. |

  El contrato ata `applied = true` ⇔ `reason = disparado` con `if/then`. Se descarta `reason` nullable (la regla de `api-contracts` exige `RagMeta` sin nulos).
- **D7 Solo en `/rag/query`; `no_aplica` en `/rag/follow-up`:** el segundo loop corre solo en `/rag/query`. `/rag/follow-up` emite siempre `{applied: false, reason: "no_aplica"}` desde el mismo `_armar_meta_de_recuperacion`, de modo que el *prompt* de reescritura nunca recibe la memoria rotulada (`analysisMemory`, RN-24) ni el historial del seguimiento. `/rag/follow-up` aún no está implementado: aquí se fijan su contrato y sus ejemplos; la historia que lo implemente hereda el valor fijo.
- **D8 La Base declara el rescate (decisión D-d del usuario, 2026-10-30):** `clinical-api` (dueño de la Base, `AnalysisBasisBuilder`, determinista y sin LLM) fija `analysisBasis.sourcesConsulted.queryRewritten = true` solo si `meta.retrievalParams.queryRewrite.applied = true` **y** `status = con_evidencia`; en cualquier otro caso `false`. El panel, con `true`, muestra en la Base del análisis, bajo «Qué se buscó» y sin expandir: «La búsqueda se repitió con una reformulación de la pregunta con términos del catálogo; la relevancia se calculó contra la pregunta original». La consulta reformulada nunca sale de `rag-orchestrator`: solo viaja el booleano. Se descartó usar `limitations` (no es una limitación y quedaría fuera de «Qué se buscó») y un texto libre en el contrato (el texto es de la UI y su catálogo i18n).
- **D9 Sin persistencia ni caché de la reformulación (Q1):** la consulta reformulada y su *embedding* viven solo en memoria durante la petición en `rag-orchestrator`; no se escriben en el schema `corpus`, en Milvus, en disco, en logs ni en ninguna caché (ni siquiera por pregunta), y se descartan al responder. Solo `queryRewrite` (`applied`, `reason`) sale en `meta.retrievalParams`.

## Dependencias y colaboradores

- `rag-orchestrator` — crea: `app/application/reescritura_de_consulta.py` (`QueryRewriteStep`), puerto `QueryRewriter` en `app/application/ports.py`, `app/infrastructure/llm/reescritor_de_consulta.py` (Adapter) y su fake, `app/domain/reescritura.py` (`debeReescribir`, `filtrarTerminosDelCatalogo`), `app/prompts/reescritura_consulta.py`. Modifica: `rag_orchestrator_service.py` (llamada al paso antes de `_responder_sin_evidencia`, `_recuperar`/`_armar_meta_de_recuperacion`, ya tocados por l1d-109), `app/config/settings.py` y `.env.example`, `app/schemas/generated` (regenerado, no a mano).
- `clinical-api` — modifica: el builder de la Base (`evidence-analysis/analysis-basis`) para `queryRewritten`; schemas/cliente generados desde los contratos. Sin migración: `retrieval_params` ya es JSON.
- `web` — modifica: el componente de la Base del análisis y `apps/web/messages/es.json` (clave nueva `evidence.base.reescrituraAplicada`).
- El service depende del puerto, no del cliente concreto; el dominio no importa infraestructura. Mocks solo en LLM, embeddings, reranker, Milvus y HTTP.
- Reglas con nombre: `debeReescribir()`, `filtrarTerminosDelCatalogo()` (RN-27), `conservarPreguntaOriginal()` (RN-03/RN-06), `declararReescrituraEnLaBase()` (D8).

## Privacidad y ownership

- Frontera: `clinical-api` → `rag-orchestrator` ya envía la pregunta enmascarada (RN-11, US-049). El prompt de reescritura contiene **exactamente** la pregunta recibida (ya enmascarada): sin `clinicalContext`, sin `pseudoPatientId`, sin `analysisMemory`. La reescritura nunca sale de `rag-orchestrator` (ni a la respuesta, ni a `clinical-api`, ni a la Base).
- Reparto de la verificación (AC-8): en `rag-orchestrator`, el test captura el *prompt* del fake y comprueba que es exactamente la pregunta recibida y que no contiene `clinicalContext`, `pseudoPatientId` ni memoria. El enmascaramiento de PII sembrada en la pregunta queda como **regresión de US-049 en `clinical-api`** (Supertest + MSW que captura el request saliente a `/rag/query`).
- Proveedor local obligatorio; sin *fallback* a la nube (RN-12), verificado por la matriz de proveedores existente.
- Logs (regla común del *pipeline*, compartida con l1d-109): recuentos, `rewriteApplied`, `reason`, `latencyMs` y `chunkId` permitidos; nunca el texto de la pregunta, de la consulta reescrita, de un fragmento, del *prompt* ni la salida del LLM (RN-10).
- `rag-orchestrator` no toca datos clínicos ni `clinical-minio`; solo schema `corpus` y Milvus. Regresión [RN-10, RN-11, RN-12] → US-049.

## Contratos

- **`apps/rag-orchestrator/openapi.yaml` 1.9.0 → 1.10.0** (proveedor `rag-orchestrator`, consumidor `clinical-api`; aditivo, ADR-26), rebasado sobre `l1d-144` (1.9.0), que ya incluye `l1d-109` (1.7.0, `fusion`/`fusionParam`) y `l1d-295` (1.8.0); cadena rag-orchestrator 291 → 109 → 295 → 144 → 300: `RagMeta.retrievalParams` gana `queryRewrite` (`type: object`, `additionalProperties: false`, `required: [applied, reason]`, `applied: boolean`, `reason: enum [disparado, no_disparado, no_disponible, no_aplica]`, sin `null`) y se agrega a `required` de `retrievalParams`, con `if/then`: `applied = true` ⇔ `reason = disparado`. Las descripciones de `/rag/follow-up` dicen que allí `queryRewrite = {applied: false, reason: "no_aplica"}`.
- Ejemplos: **solo los ejemplos con `meta.retrievalParams`** ganan `queryRewrite` (los requests y los que no traen `meta` no cambian): los `contracts/examples/rag-query-*.json` (`{applied: false, reason: "no_disparado"}` en los que tienen chunks sobre el umbral; `{applied: true, reason: "disparado"}` en `rag-query-sin-evidencia.json`, el caso de AC-3: se reescribió y tampoco superó el umbral) y los `rag-follow-up-*.json` con `meta.retrievalParams` ganan `{applied: false, reason: "no_aplica"}`. Ejemplo nuevo `rag-query-reescritura-aplicada.json` (`con_evidencia`, `{applied: true, reason: "disparado"}`) con **su propio request** `rag-query-request-reescritura-aplicada.json` cuya `query` (la de `Q-TYPO-SIN-EVIDENCIA`) es distinta de las demás (`assertFixtureQueriesDistinct()`), ambos en `index.json`.
- **`apps/clinical-api/openapi.yaml` 1.14.0 → 1.15.0** (aditivo para el navegador; rebasa sobre `l1d-144`; cadena clinical-api 291 → 95 → 295 → 144 → 300): `AnalysisBasis.sourcesConsulted` gana `queryRewritten` (`boolean`, en `required`), con descripción normativa (D8). Todos los ejemplos con `analysisBasis` ganan `queryRewritten: false`; ejemplo nuevo `con-evidencia-reescritura.json` con `true`.
- Pydantic, Zod y clientes TS se regeneran (`contracts:generate`); nunca a mano.

## Evaluación

Prompt nuevo versionado → `evaluate` obligatoria (OL-06, TBD-02): latencia añadida (mediana, p95 ≤ 3 s asumido) solo en consultas que disparan el loop; recall@10 y MRR con y sin reescritura (IC pareado excluye 0); «sin evidencia» sobre preguntas sin respuesta ≥ 0,90; PII y términos prohibidos sin regresión. Si no cumple, `QUERY_REWRITE_ENABLED = false` por defecto y la historia se cierra con la medición.

## Risks / Trade-offs

- Latencia extra solo en el camino ya fallido. Un segundo loop podría fabricar evidencia: lo contiene el reranker contra la pregunta original y el umbral intacto.
- Conflicto textual con `l1d-295`, `l1d-144` y `l1d-109` en `rag_orchestrator_service.py` y `openapi.yaml`: entran antes y este change rebasa sobre `l1d-144`.
- `queryRewritten = false` cuando la reescritura se intentó sin rescatar: la Base no lo menciona (decisión D-d: solo se declara el rescate); `retrieval_params` sí lo conserva para auditoría.

## Pendientes de definir

- Ninguno bloqueante. Asumidos: AC-5 cae a «sin evidencia» (no error); umbral de adopción p95 ≤ 3 s.
