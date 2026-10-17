# Design — l1d-106-retrieval-threshold-sin-evidencia

## Context

Ver `proposal.md` (Why). Estado de partida: `apps/rag-orchestrator` solo tiene `openapi.yaml` y los
modelos Pydantic generados (`app/schemas/generated/models.py`, US-033). El esqueleto FastAPI,
`/health`, Compose, el router delgado `app/api/rag_query.py` sobre `EvidenceQueryPort`
(`app/application/ports.py`), `app/config/settings.py`, la raíz de composición `app/bootstrap.py` y el
*helper* de validación de respuestas contra el spec llegan con el change de L1D-164 (US-034,
`[S1 resp. 17]`); el JWT de servicio con el de L1D-105
(US-054); el schema `corpus` y la colección `corpus_chunks` (con `is_current` y
`cancer_type_tags` denormalizados) con el de L1D-114 (US-058). Los modelos reales de *embeddings* y
*reranker* los fija ADR-39 fase A (L1D-102); hasta entonces, adapters falsos (FX-06a-a).

Pipeline objetivo (readme §6 OL-02, readme l. 1594, FEAT-06a Contexto técnico): detección de idioma
→ *embedding* de la pregunta y del resumen del contexto → búsqueda *dense* con filtros →
*reranker* → umbral → (sin chunks) `sin_evidencia` sin LLM | (con chunks) puerto de generación
(US-225).

## Goals / Non-Goals

**Goals:**
- Tramo de recuperación completo y determinista sobre puertos, verificable con adapters falsos.
- Las invariantes RN-02 (umbral, `null` ≠ `0.0`, cero invocaciones al LLM) y RN-05 (solo
  `is_current`) viven cada una en **un** método con nombre propio, probado en un solo lugar.
- Respuesta `sin_evidencia` completa y válida contra el contrato congelado.

**Non-Goals:**
- Prompt, LLM, citas, NLI, recorte a `maxOptions` y respuesta `con_evidencia`: change de L1D-275.
- `sparse_vector`, híbrida y `sourcesSelected` (S3); `publishedFromYear` (su historia); `409` de
  catálogo y `422 TIPO_NO_HABILITADO` (S2, US-041 / US-043); semáforo y *deadline* (S4, US-056).

## Decisions

1. **Umbral como regla de dominio pura.** `domain/relevance.py` expone
   `filtrar_sobre_umbral(chunks_puntuados, umbral) -> list` y `top_relevance_score(chunks) ->
   float | None`: el **máximo** de los chunks sobre el umbral (`[S1 resp. 18]`), `None` —nunca
   `0.0`— con lista vacía (RN-02). Es la única fuente de `topRelevanceScore`; L1D-275 la reutiliza. El service decide la rama
   con el resultado; no compara números por su cuenta. Alternativa descartada: comparar en el
   service (duplica la regla con US-225 y el seguimiento).
2. **Filtro de Milvus construido en un solo lugar.** `domain/retrieval_filter.py`
   `expresion_filtro_vigente(cancer_type) -> str` produce siempre `is_current == true` y la
   restricción de `cancer_type_tags`; el `MilvusRepository` la recibe ya construida. Así AC-3/AC-4
   se prueban sobre la expresión (unitario) y sobre Milvus de test (integración en la CI).
   Descartado: filtrar en Python tras la búsqueda (rompe `topK` y deja pasar no vigentes al
   *reranker*).
3. **Normalización del *reranker* en el adapter, validada en dominio.** El adapter real devuelve
   el puntaje ya normalizado a [0,1] (sigmoide del logit, ADR-8) y su versión exacta; el dominio
   rechaza (`ValueError`) cualquier valor fuera de [0,1], de modo que un fake o un modelo nuevo que
   rompa el contrato del puerto falla en test. `meta.rerankerModel` sale del adapter, no de un
   literal.
4. **Puerto de generación sin implementación en este change.** `RAGOrchestratorService` implementa
   `EvidenceQueryPort` (de L1D-164) y este change **amplía** `application/ports.py` con el puerto
   interno `EvidenceGenerator`; la composición (`app/bootstrap.py`) lo conecta, con
   `LLM_PROVIDER=local`, a un adapter provisional que responde `503 LOCAL_LLM_UNAVAILABLE` hasta que
   el change de L1D-275 lo reemplace (con `LLM_PROVIDER=fake` sigue `FakeEvidenceQuery` de L1D-164). Evita emitir un `con_evidencia` incompleto que no validaría contra el esquema.
   Descartado: devolver `sin_evidencia` también con chunks sobre el umbral (mentiría, viola el
   sentido de RN-02). Decisión barata de revertir: la sustituye L1D-275.
5. **Parámetros en configuración** (RN-22): `RELEVANCE_THRESHOLD`, `RETRIEVAL_TOP_K`,
   `RERANK_TOP_N` en `Settings` (`app/config/settings.py`, `pydantic-settings`), expuestos en `meta.retrievalParams`
   (`retrievalMode = dense` fijo hasta el S3). Nombres de las dos últimas claves: asumidos.
6. **Limitación estructural del "sin evidencia".** Se añade una sola entrada `limitations[]` con
   `origin = estructural` y texto fijo de configuración, como en
   `contracts/examples/rag-query-sin-evidencia.json`.
7. **`meta` completo también sin LLM.** `RagMeta` es estricto (ningún campo nulo): `llmModel`,
   `nliModel` y `promptVersion` se rellenan con la configuración vigente aunque no se invoquen,
   para que `clinical-api` registre con qué versión se habría generado (RN-06). `latencyMs` se mide
   con un reloj inyectado.
8. **Recuperación no disponible → `503 RETRIEVAL_UNAVAILABLE`** (`[S1 resp. 12]`). Un error o
   *timeout* de los puertos `ChunkSearch` (Milvus) o `QueryEmbedder` se traduce en
   `RecuperacionNoDisponibleError` de `application/`, que el router responde con
   `ErrorRecuperacionNoDisponible` (`message` genérico, `traceId`, sin eco ni detalle del motor). Sin
   reintento silencioso ni respuesta parcial; el LLM no se invoca. Resuelve la antigua Open Question.
9. **`clinicalContext.diagnosis = null` → `422 TIPO_CANCER_NO_REGISTRADO`** `[S1 resp. 35]` (validación
   clínica de los oncólogos asesores, 2026-10-14; **sustituye** el supuesto anterior "`diagnosis = null`
   → `sin_evidencia` estructural (asumido)"). Un caso sin tipo de cáncer **no** es "sin evidencia": sin
   tipo no hay filtro de `cancer_type_tags`, no se mezclan tipos (OL-02) y presentarlo como ausencia de
   evidencia confundiría al oncólogo. El service lanza `TipoCancerNoRegistradoError` de `application/`
   **antes** de detectar idioma, generar *embeddings*, consultar Milvus o invocar al LLM; el router lo
   responde con `ErrorTipoCancerNoRegistrado` (`message` genérico, `traceId`, sin eco). Es **defensa en
   profundidad**: el gateway de `clinical-api` (L1D-103) ya corta antes con el mismo código, así que
   en el flujo normal este `422` no se alcanza. Va en la **misma subida 1.2.0** que D8 `[S1 resp. 37]`.

## Privacidad y ownership

- **Fronteras:** `web` → `clinical-api` → `rag-orchestrator`. Este change solo implementa el lado
  receptor: `RagQueryInternalRequest` llega con `query` ya enmascarada y `clinicalContext`
  desidentificado (seudónimo por consulta, fechas relativas, `dataRef` opacos), hecho por
  `clinical-api` (RN-10, RN-11; change de la desidentificación, US-049). Aquí no se desidentifica ni
  se re-identifica nada.
- **`rag-orchestrator` no toca datos clínicos:** lee solo Milvus y el schema `corpus` con el rol
  `rag_corpus`; ninguna credencial ni ruta hacia `clinical-minio` ni hacia otros schemas.
- **Logs:** `traceId`, contadores (`retrieved`, `aboveThreshold`), latencias por etapa y versiones
  de modelos; **nunca** `query`, texto del contexto, `pseudoPatientId` ni texto de chunks.
- **`pseudoPatientId`** no entra en el *embedding* ni en ningún texto enviado a un modelo: el
  "resumen del contexto" se construye solo con campos clínicos desidentificados.
- **Datos:** FX-06a-a es sintético (corpus de prueba con títulos "(test)"); ningún dato real ni
  identificador de paciente (RN-13, RN-14). RN-12 (solo modelos locales con datos reales) no se
  ejercita: este tramo no llama a ningún proveedor; los adapters de *embeddings* y *reranker* son
  locales por diseño (ADR-39).

## Contratos

- **Proveedor:** `rag-orchestrator` (`apps/rag-orchestrator/openapi.yaml`). **Consumidor:**
  `clinical-api` (cliente generado en `packages/api-contracts`).
- **Diff propuesto del `openapi.yaml`** (aditivo, `[S1 resp. 12]`; lo aplica la tarea
  `contract(L1D-106)`, primera del change, con la skill `sync-contracts`):

  ```yaml
  # paths./rag/query.post.responses
  "503":
    description: >-
      Un componente local no está disponible: LLM (LOCAL_LLM_UNAVAILABLE, también salida del LLM
      inválida o fuera de esquema) o recuperación (RETRIEVAL_UNAVAILABLE: Milvus o embeddings).
      Falla cerrada, sin respuesta parcial. Con datos reales solo modelos locales, sin fallback a la
      nube (RN-12).
    content:
      application/json:
        schema:
          oneOf:
            - $ref: '#/components/schemas/ErrorLlmLocalNoDisponible'
            - $ref: '#/components/schemas/ErrorRecuperacionNoDisponible'
  "422":   # [S1 resp. 35], misma subida
    description: >-
      Cuerpo inválido (Pydantic); TIPO_NO_HABILITADO: cancerType fuera de ENABLED_CANCER_TYPES; o
      TIPO_CANCER_NO_REGISTRADO: el contexto no tiene tipo de cáncer (diagnosis null). Los dos últimos
      responden sin buscar ni invocar al LLM (defensa en profundidad).
    content:
      application/json:
        schema:
          oneOf:
            - $ref: '#/components/schemas/ErrorTipoNoHabilitado'
            - $ref: '#/components/schemas/ErrorValidacion'
            - $ref: '#/components/schemas/ErrorTipoCancerNoRegistrado'
  # components.schemas
  ErrorTipoCancerNoRegistrado:
    type: object
    additionalProperties: false
    required: [error, message, traceId]
    properties:
      error: { type: string, const: TIPO_CANCER_NO_REGISTRADO }
      message: { type: string }
      traceId: { type: string }
  ErrorRecuperacionNoDisponible:
    type: object
    additionalProperties: false
    required: [error, message, traceId]
    properties:
      error: { type: string, const: RETRIEVAL_UNAVAILABLE }
      message: { type: string }
      traceId: { type: string }
  # info.version: 1.1.0 (L1D-164) → 1.2.0 [S1 resp. 37]
  ```
  `/rag/follow-up`, `/case/summary` y `/documents/extract` no cambian. El resto de lo que emite esta
  historia (`RagQueryInternalResponse` con su `if/then` de `sin_evidencia`, `RagMeta.retrievalParams`,
  `401`) ya está congelado (US-033); `contracts/examples/rag-query-sin-evidencia.json` sigue vigente.
- **Ejemplo nuevo:** `contracts/examples/rag-recuperacion-no-disponible.json`
  (`{"error":"RETRIEVAL_UNAVAILABLE","message":"La recuperación de evidencia no está disponible.","traceId":"req_…"}`)
  con su entrada en `contracts/examples/index.json` (`spec: rag-orchestrator`,
  `target: #/paths/~1rag~1query/post/responses/503`), y
  `contracts/examples/rag-tipo-cancer-no-registrado.json`
  (`{"error":"TIPO_CANCER_NO_REGISTRADO","message":"El contexto no tiene tipo de cáncer; no es posible filtrar la evidencia.","traceId":"req_…"}`)
  con su entrada (`spec: rag-orchestrator`, `target: #/paths/~1rag~1query/post/responses/422`)
  `[S1 resp. 35]`. Orden: editar el spec → ejemplos e índice → `contracts:generate` → `contracts:check`.
- **Compatibilidad (ADR-26):** se conserva `ErrorLlmLocalNoDisponible` intacto como primera
  alternativa del `oneOf`; las alternativas son disjuntas por el `const` de `error`. `oasdiff` emite
  el **warning** `response-body-wrapped-in-one-of-original-preserved` (no un error); se declara aquí y
  en el PR. Añadir `ErrorTipoCancerNoRegistrado` al `oneOf` ya existente del `422` es aditivo (una
  alternativa nueva en una respuesta; oasdiff, a lo sumo, `WARN`/`INFO`). La CI corre `oasdiff` con
  `--fail-on ERR`, así que no bloquea. Si reportara un `ERR`, se
  detiene el change y se declara.
- **Modelos Pydantic y cliente TS:** se regeneran del spec (`contracts:generate`), nunca a mano.
- **Validación de respuestas:** cada respuesta de los tests de integración (`200 sin_evidencia`,
  `401`, `503 LOCAL_LLM_UNAVAILABLE` del adapter provisional y `503 RETRIEVAL_UNAVAILABLE`) se valida
  contra el spec con el *helper* de L1D-164 (Pytest) `[S1 resp. 17]`; `contracts:verify-provider` no
  existe hasta US-214.
- **Consumidor:** el mapeo en `clinical-api` (`RETRIEVAL_UNAVAILABLE` → `502 ERROR_SERVICIO_IA`, sin
  persistir y sin eco) es de L1D-104 `[S1 resp. 12]`; el `422 TIPO_CANCER_NO_REGISTRADO` se traduce a
  `422` con el mismo código, no a `502` (L1D-104, `[S1 resp. 35]`).

## Evaluación

Toca un **umbral** (RN-22) y la ruta de recuperación: métricas OL-06 afectadas, precisión de "sin
evidencia" ≥ 0,90 (M-10.1) y recall@10 / MRR (M-06.1). Este change no fija el valor de producción
de `RELEVANCE_THRESHOLD` (los tests usan 0,30 y 0,90); la medición con modelos reales llega con
US-072/US-073 (S2). Si el PR cambia el valor por defecto de configuración, corre `run-ai-eval`;
mientras la suite no exista, `ai-eval-runner` lo evalúa a mano con FX-06a-a.

## Dependencias y colaboradores

| Módulo | Nuevo/modifica | Depende de |
|---|---|---|
| `app/api/rag_query.py` | modifica (L1D-164) | `EvidenceQueryPort` (inyectado), dependencia JWT de L1D-105; `RecuperacionNoDisponibleError` → `503 ErrorRecuperacionNoDisponible` |
| `app/application/rag_orchestrator_service.py` | nuevo | implementa `EvidenceQueryPort`; puertos `QueryEmbedder`, `ChunkSearch`, `Reranker`, `EvidenceGenerator`, `LanguageDetector`, `Clock`; reglas de `domain/` |
| `app/application/ports.py` | modifica (L1D-164) | añade `QueryEmbedder`, `ChunkSearch`, `Reranker`, `EvidenceGenerator`, `LanguageDetector`, `Clock` (Protocol) |
| `app/domain/relevance.py` | nuevo | — (puro): `filtrar_sobre_umbral()` (RN-02), `top_relevance_score()` (RN-02), `validar_puntaje_normalizado()` (RN-03) |
| `app/domain/retrieval_filter.py` | nuevo | — (puro): `expresion_filtro_vigente()` (RN-05, OL-02) |
| `app/infrastructure/milvus/milvus_repository.py` | nuevo | `pymilvus`; implementa `ChunkSearch` |
| `app/infrastructure/embeddings/`, `reranker/` | nuevo | adapters falsos de test (FX-06a-a); reales tras L1D-102 |
| `app/config/settings.py` | modifica (L1D-164) | `Settings` (`pydantic-settings`): `RELEVANCE_THRESHOLD`, `RETRIEVAL_TOP_K`, `RERANK_TOP_N` |
| `app/bootstrap.py` | modifica (L1D-164) | enlaza `RAGOrchestratorService` como `EvidenceQueryPort` con `LLM_PROVIDER=local` y el adapter `503` provisional de `EvidenceGenerator` |

El service nunca importa `pymilvus` ni clientes concretos; recibe puertos por constructor (raíz de
composición en `app/bootstrap.py`, no en `app/main.py`, `[S1 resp. 17]`).

## Risks / Trade-offs

- [El esqueleto (L1D-164) o el schema (L1D-114) no están mergeados al empezar] → los tests
  unitarios y de `TestClient` con adapters falsos no los necesitan; el test contra Milvus de test
  (AC-3) entra en cuanto exista la colección.
- [Choque con L1D-275 en `rag_orchestrator_service.py`] → este change deja la rama con evidencia
  aislada tras `EvidenceGenerator`; L1D-275 solo sustituye el adapter y añade su tramo.
- [Requisitos de `evidence-analysis` añadidos en paralelo por otros changes] → nombres de requisito
  específicos de recuperación; el `## Purpose` de la capacidad es genérico para que el primer
  archivo que llegue no la sesgue.
- [`diagnosis = null` en el contexto] → D9: `422 TIPO_CANCER_NO_REGISTRADO` `[S1 resp. 35]`; doble con el
  corte de L1D-103, pero barato (una rama del service) y protege si un consumidor futuro omite el corte.
- [Choque del `oneOf` del `503` con L1D-180 e `info.version`] → orden de merge 164 → 105 → 106 →
  179 → 275 → 180 `[S1 resp. 17]`: L1D-180 añade su alternativa al `oneOf` que deja este change y sube
  a 1.3.0; quien mergea segundo rebasa.

## Decisiones de implementación (Gate 2, vuelta 1)

Precisan D1–D9 sin cambiar el contrato (`openapi.yaml` y la tarea 1.3 quedan como estaban; el ERR de oasdiff del `422`
sigue pendiente de decisión del usuario).

- **D2 (precisión):** `cancerType` es el **código del catálogo** (`^[a-z][a-z0-9_]*$`; la normalización de tildes,
  mayúsculas y sinónimos es de Backend 1, ADR-33); `próstata` ⇒ `422 TIPO_CANCER_NO_REGISTRADO`. La expresión compara la
  etiqueta **completa** dentro de la lista separada por comas (`== "t"`, `like "t,%"`, `like "%,t"`, `like "%,t,%"`), así
  `mama` no casa con `mama_masculina` ni `ta` con `prostata`. `exigir_filtro_vigente()` (mismo módulo) garantiza que
  `is_current == true` sea obligatorio en toda expresión que llegue a Milvus; lo usan `MilvusRepository` y el fake. La
  sintaxis de Milvus vive en `domain/` a propósito (Q2 del Gate 2: se deja así, para probar la regla sin Milvus).
- **D3 (precisión):** `validar_puntaje_normalizado()` está en `domain/normalizacion_puntaje.py`. Rechaza lo que no sea
  `int`/`float` (no `bool`), no finito o fuera de [0,1]; una lista de puntajes inválida (`None`, `"0.5"`, `True`, cantidad
  distinta) falla cerrado como `503 RETRIEVAL_UNAVAILABLE`, no como `500`.
- **D4 / 2.12 (Q1 opción b):** con `LLM_PROVIDER=local` la ruta `/rag/query` **siempre** se registra y el arranque exige
  `RELEVANCE_THRESHOLD`, `RETRIEVAL_TOP_K` y `RERANK_TOP_N`. Si faltan los adapters reales de *embeddings*, *reranker* e
  idioma (historia nueva US-231), responde `503 RETRIEVAL_UNAVAILABLE` (etapa `composicion`) fallando cerrado; con los
  puertos presentes monta `RAGOrchestratorService` y el generador provisional (`503 LOCAL_LLM_UNAVAILABLE`).
- **D8 (precisión):** todo borde (incluido el detector de idioma) se invoca con `_invocar_borde_fallando_cerrado`: solo se
  registran la clase del error, la etapa y el `traceId`, con `from None` para que ni el mensaje ni el traceback con la
  pregunta lleguen al log. Un `Exception` no traducido responde un `500` fijo (`ERROR_INTERNO`, sin eco); ese cuerpo no
  está en `openapi.yaml` (el contrato de rag no declara `500`) y queda como defensa en profundidad. Starlette vuelve a
  lanzar la excepción tras responder, por lo que uvicorn aún escribe su traceback: el *handler* no lo evita.
- **Umbral:** "sobre el umbral" es estricto (`>`): un chunk con puntaje igual al umbral no cuenta (supuesto).
- **`traceId`:** una sola fuente por petición: el del cuerpo de `/rag/query` (es el `X-Trace-Id` del contrato); lo usan los
  logs del servicio y los manejadores de error de esa ruta. Antes de leer el cuerpo (401, 422 de validación) se mantiene
  el `X-Trace-Id` validado o uno generado.
- **Pendiente anotado:** `ConfigRecuperacion` anidada y obligatoria en `Settings` (en vez de campos opcionales validados
  en el arranque) no cupo en esta vuelta.

## Migration Plan

No hay datos ni esquema que migrar. Rollback: revertir el PR; `/rag/query` vuelve a no existir.

## Open Questions

- **Resuelta `[S1 resp. 12]`:** Milvus o *embeddings* caídos → `503 RETRIEVAL_UNAVAILABLE` (D8).
- **Resuelta `[S1 resp. 35]`:** `clinicalContext.diagnosis = null` → `422 TIPO_CANCER_NO_REGISTRADO`
  sin buscar ni invocar al LLM (D9), en lugar del supuesto anterior (`sin_evidencia` estructural). No es
  un AC de US-055; se apoya en la validación clínica.

## Regresiones anotadas (no son escenarios de este change)

- Regresión [NFR-14] `409 CATALOG_VERSION_MISMATCH` activa desde S2 (US-041, L1D-171).
- Regresión [RN-20] `422 TIPO_NO_HABILITADO` sin LLM activa desde S2 (US-043, L1D-173).
- Regresión [RN-28] selección por aplicabilidad activa desde S5 (US-125), sobre el tramo de US-225.
