# Design — l1d-109-busqueda-hibrida-retrieval-mode

## Context

`_recuperar()` hace hoy búsqueda *dense* con el *embedding* de la pregunta y del resumen del contexto, une sin repetir y recorta a `retrieval_top_k`; `_armar_meta_de_recuperacion` fija `retrievalMode = dense`. US-112 añade una segunda rama *sparse* y una fusión antes del *reranker*, detrás de `RETRIEVAL_MODE`.

Decisión (una propuesta elegida; descartadas en una línea): fusión como regla pura en `domain/` con dos estrategias seleccionadas por configuración. Descartadas: fusión nativa de Milvus (`RRFRanker`/`WeightedRanker`) como única vía, porque oculta la regla fuera del dominio y no se prueba con recuperadores falsos; híbrida por defecto, porque la medición (US-133) no existe aún.

## Decisiones

- **D1 Flag y valores:** `RETRIEVAL_MODE` ∈ {`dense`, `hibrida`} (mismos valores que el enum del contrato), por defecto `dense`; sin definir = `dense` (AC-6). Valor inválido → falla de arranque (RN-22).
- **D2 Fusión pura:** `fusionar_candidatos(dense, sparse, fusion, k, peso)` en `domain/`: RRF `Σ 1/(k+rank)` con `RRF_K = 60`; ponderada `(1-w)·dense_norm + w·sparse_norm` con `HYBRID_SPARSE_WEIGHT = 0,3` (puntajes normalizados a [0,1] por rama). Desempate por `chunk_id`. Hiperparámetros de la fuente, sin barrido (ADR-45 P1).
- **D3 Filtro idéntico en ambas ramas (RN-05):** un único filtro escalar construido por `retrieval_filter.py` se pasa a las dos búsquedas; un chunk `is_current = false` o de otro tipo de cáncer devuelto por el falso *sparse* nunca llega al *reranker* ni a las citas (AC-3).
- **D4 `relevance_score` solo del *reranker* (RN-03):** la fusión ordena candidatos; el puntaje de la opción y `topRelevanceScore` salen del *reranker* (AC-2). La similitud/fusión no se compara con el umbral.
- **D5 `sin_evidencia` intacta (RN-02):** en modo híbrido, sin chunks sobre el umbral → `sin_evidencia`, `topRelevanceScore = null`, cero invocaciones del LLM (AC-4).
- **D6 *Sparse* de la consulta:** mismo BGE-M3, mismos pesos y mismo `SPARSE_VECTOR_SOURCE` que `reindex-sparse` e ingesta; el adapter de *embeddings* expone `embeber_sparse()` (puerto + fake). En `dense` no se invoca (AC-6: cero llamadas).
- **D7 Trazado sin nulos (decisión D-c del usuario, 2026-10-30):** `meta.retrievalParams` registra siempre `retrievalMode`, `fusion` y `fusionParam`, obligatorios y sin `null` (la regla de `api-contracts` «`RagMeta` estricto… sin campos nulos»):
  - `dense` → `fusion = "ninguna"`, `fusionParam = 0`;
  - `hibrida` + `rrf` → `fusion = "rrf"`, `fusionParam = RRF_K` (entero ≥ 1, 60 por defecto);
  - `hibrida` + `ponderada` → `fusion = "ponderada"`, `fusionParam = HYBRID_SPARSE_WEIGHT` (0 < w < 1, 0,3 por defecto).
  El `0` de `ninguna` no es un valor centinela libre: el contrato lo fija con `if/then` (`fusion = ninguna` ⇔ `retrievalMode = dense` ⇒ `fusionParam = 0`), de modo que un consumidor nunca lo confunde con un `k` o un peso. Se descartó un objeto discriminado (`fusion: {tipo, k | peso}`) por romper la forma plana que ya leen `clinical-api` y la suite `evaluate` (US-133). El bloque se persiste completo en `retrieval_params` (AC-5).
- **D8 Un solo armado para `/rag/query` y `/rag/follow-up`:** `_armar_meta_de_recuperacion` es la única fuente de `retrievalParams`; ambos endpoints comparten `RagMeta`, así que el bloque sale igual en los dos. `/rag/follow-up` aún no está implementado: aquí se actualizan su contrato y sus ejemplos; su historia lo emitirá con este mismo método y `contracts:verify-provider` lo exige por el `required`.
- **D9 Coordinación con US-238 (orden de merge 109 → 300):** `queryRewrite` (L1D-300) y `fusion`/`fusionParam` (este change) son propiedades hermanas de `retrievalParams` con la misma política (obligatorias, sin `null`); 300 rebasa sobre este change en `openapi.yaml`, en los ejemplos y en `_armar_meta_de_recuperacion`. El segundo loop reutiliza `_recuperar()` y por tanto el modo configurado.

## Dependencias y colaboradores

- Modifica: `app/application/rag_orchestrator_service.py` (`_recuperar`, `_armar_meta_de_recuperacion`), `app/application/ports.py` (método *sparse* del repositorio y del embedder), `app/config/settings.py`, `.env.example`, `app/schemas/generated` (regenerado), adapter Milvus (`hybrid_search`/*sparse*) y su fake.
- Crea: `app/domain/fusion_de_candidatos.py` (puro).
- El service depende de puertos; el dominio no importa infraestructura. Mocks solo en Milvus, embeddings, reranker, LLM.

## Privacidad y ownership

- `rag-orchestrator` sigue sin acceso a datos clínicos: la consulta ya llega enmascarada (RN-11); el vector *sparse* se calcula en memoria y no se registra. Solo schema `corpus` y Milvus.
- Logs (regla común del *pipeline*, compartida con L1D-300): recuentos, `retrievalMode`, `fusion`, `fusionParam`, candidatos por rama y `chunkId` permitidos; nunca el texto de la consulta, de un fragmento, del *prompt* ni la salida del LLM (RN-10). Sin nube (RN-12): BGE-M3 local.

## Contratos

- `apps/rag-orchestrator/openapi.yaml` 1.6.0 → **1.7.0** (minor, aditivo, ADR-26; rebasa sobre `l1d-291`; cadena rag-orchestrator 291 → 109 → 295 → 144 → 300; después rebasan `l1d-295`, `l1d-144` y `l1d-300`): `RagMeta.retrievalParams` (cerrado) gana `fusion` (`type: string`, `enum: [ninguna, rrf, ponderada]`, sin `null`) y `fusionParam` (`type: number`, `minimum: 0`, sin `null`), ambos en `required`, con `allOf` de `if/then`: `retrievalMode = dense` ⇒ `fusion = ninguna` y `fusionParam = 0`; `retrievalMode = hibrida` ⇒ `fusion ∈ {rrf, ponderada}`; `rrf` ⇒ `fusionParam` entero ≥ 1; `ponderada` ⇒ `0 < fusionParam < 1`. Para el consumidor (`clinical-api`) es una respuesta con dos campos más: sin incompatibles en `contracts:breaking`.
- Primero el contrato (`sync-contracts`): todos los ejemplos con `retrievalParams` — `contracts/examples/rag-query-*.json` **y** `rag-follow-up-*.json` — ganan `fusion = "ninguna"` y `fusionParam = 0`; ejemplo nuevo `rag-query-hibrida.json` (`fusion = "rrf"`, `fusionParam = 60`) con **su propio request** `rag-query-request-hibrida.json` cuya `query` es distinta de las demás (`assertFixtureQueriesDistinct()`), registrados en `index.json`. `contracts:check`, `contracts:breaking`, `contracts:generate`. Sin endpoint nuevo.
- `retrievalMode` ya admite `hibrida`. Colección de Milvus: **sin cambio de esquema** (el campo *sparse* ya existe por US-117b); solo se consulta.

## Evaluación

La calidad (recall@10, MRR, retroceso frente a `dense`) se mide en US-133 con el runner de variantes (US-226): brazos A2 y A2b de ADR-45. Este change no fija umbrales ni decide el modo de la demo.


## Decidido (usuario, 2026-10-30)

Desviación de D7: el contrato 1.7.0 fija solo el vínculo modo/fusión con un `if/then/else` (`dense` ⇒ `ninguna` y `fusionParam = 0`; `hibrida` ⇒ `rrf` o `ponderada`). El rango de `fusionParam` (k entero ≥ 1 con `rrf`; peso en (0, 1) con `ponderada`) lo valida únicamente `Settings` al arrancar. Motivo: un `anyOf` por combinación rompe `contracts:breaking` (`response-property-any-of-added`) y habría exigido excepciones ADR-26 E-6/E-7 y ampliar `scripts/contracts/lib/refinamientos.mjs`; se descartaron ambas.
