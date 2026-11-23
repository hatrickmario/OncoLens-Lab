# Design — l1d-336-reranker-ventanas-chunk

## Context

Ver `proposal.md`. Estado observado en `main`:

- `app/infrastructure/reranker/bge_reranker.py` (`BgeReranker.puntuar`) codifica el par (pregunta, pasaje), lo recorta con
  `truncar_conservando_el_separador_final(ids, RERANKER_MAX_LENGTH)` y agrupa por presupuesto de tokens
  (`agrupar_por_presupuesto_de_tokens`, `MODEL_BATCH_MAX_TOKENS`). Rechaza más de `RERANKER_MAX_PAIRS` candidatos con
  `FalloDeInferencia` y nunca devuelve `None` ni un `0.0` por defecto.
- El puerto `Reranker` (`app/application/ports.py`) recibe candidatos con `chunk_id` y `chunk_text` y devuelve un puntaje
  por candidato en [0, 1]. Lo implementan `BgeReranker`, `RerankerFalso` (`tests/support/recuperacion.py`,
  `tests/evaluation/modelos_falsos.py`), `RerankerLexico` (`app/evaluation/adaptadores_falsos.py`) y los decoradores
  `RerankerRegistrado` y `RerankerObservado`.
- `RERANKER_MAX_LENGTH` y `RERANKER_MAX_PAIRS` son claves de ADR-39 (`app/config/modelos.py`), sin valor en código: salen
  del entorno y deben coincidir con el bloque `adr39:decision`. Vigentes: 512 y 20; `CORPUS_CHUNK_SIZE` 1024.
- La comparación de brazos de la suite (`app/evaluation/brazos_recuperacion.py`, `config_suite.py`, `corrida_brazos.py`,
  `armado_comparacion.py`) solo conoce `RETRIEVAL_MODE`, `RETRIEVAL_FUSION`, `RRF_K` y `HYBRID_SPARSE_WEIGHT`, y exige que
  el primer brazo sea A0 *dense*.

## Goals / Non-Goals

**Goals:** que el *reranker* pueda leer el chunk entero detrás de una clave de configuración, sin cambiar el resultado
por defecto, y medirlo con un A/B en la misma corrida para decidir con un reporte versionado.

**Non-Goals:** los de `proposal.md` §Fuera de alcance. En particular, este change no decide el valor por defecto.

## Decisions

### D1. Dos claves en `Settings`, con valor inicial en un solo lugar

- `RERANKER_CHUNK_WINDOWS`: `primera` | `maximo`, por defecto `primera`. Vive en `Settings` (como `RETRIEVAL_MODE`), no en
  `CLAVES_MODELOS` de ADR-39: así `primera` rige sin tocar `.env.example` ni el bloque `adr39:decision`, y AC-2 se cumple
  sin paso humano. Si la corrida final adopta `maximo`, H-3 cambia el valor inicial y enmienda ADR-39.
- `RERANKER_WINDOW_OVERLAP`: entero ≥ 0, en tokens. Solo se lee con `maximo`.
- Las constantes `MODO_DE_VENTANAS_INICIAL` y `RERANKER_WINDOW_OVERLAP_INICIAL` se declaran una vez en el módulo de
  dominio nuevo y `Settings` las importa (patrón de `RERANKER_CUT_LOG_MAX_IDS_INICIAL`); ningún otro módulo repite el
  literal.
- **Valor inicial del solape: pendiente de confirmar por el humano** (ver Open Questions). Propuesta: 64 tokens
  (asumido). No es una cifra de evaluación; se puede barrer en la corrida si el humano lo pide.
- Validación al arrancar: modo fuera del conjunto, o solape ≥ `RERANKER_MAX_LENGTH`, falla nombrando la clave y no el
  valor. Descartado: un booleano `RERANKER_WINDOWS_ENABLED` (la historia nombra el enumerado y deja sitio a otra
  agregación sin romper la clave).

### D2. Regla pura de ventanas (`domain/ventanas_del_reranker.py`)

- `trazar_ventanas(tokens_del_pasaje, capacidad, solape) -> tuple[Ventana, ...]`: tramos `[inicio, fin)` sobre los
  tokens del pasaje. La primera empieza en 0; el paso es `capacidad − solape`; la última termina exactamente en el final
  del pasaje (se retrocede su inicio en vez de dejar una ventana corta). Un pasaje que cabe da una sola ventana.
  `capacidad ≤ solape` o `capacidad ≤ 0` → `ValueError` (el adapter lo traduce al error del puerto: falla cerrado).
- `capacidad = RERANKER_MAX_LENGTH − tokens que no son del pasaje` (especiales y pregunta). La pregunta va entera en
  todas las ventanas.
- `agregar_por_maximo(logits_por_ventana) -> float`: el máximo. Se agrega sobre el **logit** y después se normaliza con
  `normalizar_a_unidad` (sigmoide, monótona): equivale al máximo de los normalizados y deja una sola normalización
  (RN-03). El máximo es conmutativo y asociativo: el resultado no depende del orden ni del lote (AC-3). Lista vacía →
  `ValueError`, nunca `0.0`.
- La primera ventana de `maximo` es la misma secuencia que envía `primera`. Consecuencia verificable con sesión falsa:
  el puntaje de `maximo` nunca es menor que el de `primera`. Con el modelo real int8 puede haber diferencias numéricas
  mínimas por el relleno del lote; no se afirma como igualdad exacta con el modelo real.

### D3. El adapter aplica la regla; `primera` conserva su camino de código

- `BgeReranker` recibe `modo_de_ventanas` y `solape`. Con `primera` ejecuta **el mismo camino de hoy**
  (`truncar_conservando_el_separador_final`), sin pasar por la regla de ventanas: AC-2 no depende de una equivalencia.
- Con `maximo`: por candidato, arma las secuencias `prefijo + pasaje[inicio:fin] + sufijo`, las aplana, las agrupa con
  `agrupar_por_presupuesto_de_tokens` (ya determinista), ejecuta, reagrupa por candidato y agrega. Un logit ausente o no
  finito en cualquier ventana → `FalloDeInferencia` (ya existe la comprobación; se extiende a las ventanas).
- Para saber dónde empieza y acaba el pasaje dentro del par, el protocolo interno `Tokenizador`
  (`app/infrastructure/models/sesion.py`) gana un método que devuelve los ids del par y el tramo del pasaje;
  `TokenizadorDeArchivo` lo implementa con los `sequence_ids` de la codificación de `tokenizers`. Es un protocolo de
  infraestructura, no un puerto de `application/`. Descartado: inferir el tramo codificando la pregunta sola y restando
  (depende de la plantilla de especiales del modelo).
- `RERANKER_MAX_PAIRS` sigue contando **candidatos (chunks)**, no ventanas: el corte previo
  (`recortar_a_pares_del_reranker`) y el log `rag_query_corte` no cambian.

### D4. Procedencia: `meta.rerankerModel` no cambia

`meta.rerankerModel` conserva su valor con cualquier modo: `describir_modelo` no añade el modo ni el solape (decisión
de planificación, 2026-11-22, pendiente de aprobación con el plan). Así no cambia ni el contrato ni ningún ejemplo de
`contracts/examples/`, y AC-2 no depende de esta decisión. El modo y el solape se registran **solo en el informe de
evaluación**, por brazo (D6). Consecuencia aceptada: dos análisis guardados con el mismo modelo y distinto modo no se
distinguen por `meta`; si se adopta `maximo`, lo registra la enmienda de ADR-39 (H-3), que fija el modo vigente desde
esa fecha. Descartado: un sufijo en la cadena (`…;ventanas=maximo;solape=<n>`), porque cambia el valor de un campo de
procedencia que `clinical-api` persiste, sin que la historia lo pida.

### D5. Costo: tres ventanas por chunk lleno, no dos

Con `RERANKER_MAX_LENGTH` 512, la pregunta y los especiales ocupan parte de cada ventana, así que la capacidad útil es
menor que 512 y un chunk de 1024 tokens necesita **tres** ventanas incluso con solape 0 (la historia estima «duplican
aproximadamente»). El número real por consulta depende de la distribución de longitudes del corpus; lo da la medición
(AC-4, AC-5), que además compara la etapa con `STAGE_P95_BUDGET_MS`. No se fija ninguna cifra aquí.

### D6. Brazos del *reranker* en la suite

- `Brazo` gana campos opcionales de la etapa del *reranker* (`RERANKER_CHUNK_WINDOWS`, `RERANKER_WINDOW_OVERLAP`,
  `RERANKER_MAX_LENGTH`), con `None` = «el de la configuración de la suite»; entran en su `huella`. Los brazos actuales
  (`s4-hibrida*.yaml`) no cambian de huella si los campos nuevos no se serializan cuando son `None` — se verifica con
  un test de la huella de A0, A2 y A2b.
- La composición por brazo crea un `BgeReranker` distinto sobre **la misma sesión y el mismo tokenizador ya cargados**
  (el adapter no tiene estado): los brazos `primera`, `maximo` y `RERANKER_MAX_LENGTH` ampliado comparten modelos e
  índice, como exige ADR-45 P1.
- **Corpus de los brazos (`[S7 resp. 10]`):** la ingesta de `l1d-119` (la colección de Milvus de la corrida base, que
  no se sobrescribe), la misma en la base y en la final. Los brazos `primera`, `maximo` y `RERANKER_MAX_LENGTH`
  ampliado leen esa misma colección: solo cambia cómo puntúa el *reranker*. El informe registra la colección, su
  recuento de chunks vigentes y el `CORPUS_CHUNK_SIZE` con que se ingirió. El dataset `s5-corpus-ampliado` en memoria
  no sirve aquí: sus fragmentos son cortos y casi ninguno supera `RERANKER_MAX_LENGTH`.
- **Fuente del índice de la suite (asumido, se confirma con el plan):** hoy la suite solo compone un buscador en
  memoria desde el `corpus.yaml` del dataset. Para leer la ingesta, `config_suite.py` gana la fuente `indice`
  (`en_memoria`, por defecto, o una colección de Milvus) y `composicion_suite.py` compone, detrás del mismo puerto
  `ChunkSearch`, el adapter de producción en solo lectura. Las configuraciones existentes no cambian de huella. El
  chunk esperado de una pregunta se resuelve por documento y cita literal, como en `l1d-334` (D3 de ese change).
  `l1d-337` reutiliza esta fuente para leer la colección de cada variante.
- **Umbrales (`[S7 resp. 11]`):** todos los brazos corren con los umbrales actuales. Los calibrados entran en la
  corrida final como un brazo más, que aporta `l1d-119`; este change no los mide ni los adopta.
- El brazo de **chunks de 512** necesita otro índice: los mismos documentos de la ingesta de `l1d-119`, fragmentados a
  512 tokens, en una **colección propia**. El informe lo declara («índice distinto») y lo compara contra la referencia
  de la misma sesión de medición. No puede usar `ingest reindex-context` de `l1d-337`: ese subcomando reindexa cada
  variante en su colección **conservando los chunks y sus `chunk_id`**, y aquí cambian los límites de los chunks. Es
  una ingesta aparte, que además choca con el catálogo compartido (`decidir_version` omite un documento ya embebido
  con el mismo `checksum`). **Decidido (usuario, 2026-11-22, `[S7 resp. 14]`): el brazo entra en la corrida final.**
  La ingesta de 512 va a su colección propia y no modifica el catálogo `corpus` compartido ni la colección de la
  ingesta de `l1d-119` (RN-05); el mecanismo lo fija la tarea 2.5b. Si resultara imposible sin tocar el catálogo
  compartido, la implementación se detiene y pregunta; solo entonces el informe lo dejaría «no medido».
- Configuraciones nuevas: `eval/configs/s7-reranker-ventanas.yaml` (real), `s7-reranker-ventanas-fake.yaml` (CI, con
  adapters falsos) y `s7-reranker-chunks512.yaml`. Los valores numéricos de los brazos viven ahí (RN-22).
- Cada brazo registra en el informe su `RERANKER_CHUNK_WINDOWS` y su `RERANKER_WINDOW_OVERLAP`: es el único lugar
  donde queda el modo (D4).
- Métricas nuevas del informe por brazo: falsos «sin evidencia» (pregunta con respuesta esperada que termina en
  `sin_evidencia`), paráfrasis recuperadas (pares de US-276 en los que ambas redacciones recuperan el chunk esperado),
  p95 de la etapa del *reranker* (ya lo cronometra `RerankerObservado`) y p95 de la consulta completa.
- «No viable»: regla pura `viabilidad_del_brazo(p95, tope, memoria, limite)` → `viable` | `no_viable(motivo)` |
  `no_medido`. El tope de latencia es `p95_evidence_analyses_s` de `eval/configs/metas-iniciales.yaml` (hoy 20) y el de
  memoria `STACK_MEMORY_LIMIT_GB`; ninguno se repite como literal. `None` nunca se lee como dentro de presupuesto.
- La suite cronometra el proceso de `rag-orchestrator` (RSS). La memoria **del stack** completo (con Ollama y Milvus) la
  mide `ai-eval-runner` en la máquina de referencia y entra al informe como dato de la corrida; si no se aporta, el
  brazo queda `no_medido` en memoria.

### D7. Tests (bordes y niveles)

- Unitarios de dominio (`tests/unit/test_ventanas_del_reranker.py`): cobertura completa, solape, última ventana, pasaje
  que cabe, capacidad inválida, máximo y empates con permutaciones.
- Unitarios del adapter (`tests/unit/test_bge_reranker.py`) con sesión y tokenizador falsos (el borde es la sesión de
  inferencia): secuencias enviadas en `maximo`, y los tests actuales de `primera` **sin tocar** como evidencia de AC-2.
- Integración de `/rag/query` (`TestClient`) con `BgeReranker` real sobre sesión falsa de logits: AC-1, AC-3 y AC-6.
  Cada respuesta se valida contra `apps/rag-orchestrator/openapi.yaml`, igual que en `l1d-337`: «sin cambio de
  contrato» queda comprobado y no solo afirmado.
- Batería de contrato (`tests/integration/test_bateria_de_contrato_de_adapters.py`): caso nuevo «chunk más largo que la
  ventana» que corren el adapter real (ambos modos) y los fakes: un puntaje por candidato, en [0, 1], nunca `None`,
  mismo error ante el exceso de pares. Fakes tocados: ninguno cambia de código; `SesionDeLogitsFalsa` y el tokenizador
  falso de los tests ganan el método del tramo del pasaje.
- `tests/integration/test_reranker_real.py` (modelo real, fuera de la CI rápida): un chunk largo con la evidencia al
  final puntúa más con `maximo` que con `primera`.

### D8. Decisiones de implementación (L1D-336, `ai-services-dev`)

Cada una con las alternativas que se descartaron. Nada de esto cambia el contrato ni `meta.rerankerModel`.

- **La regla de ventanas recibe longitudes, no tokens.** `trazar_ventanas(longitud_del_pasaje, capacidad, solape)` devuelve
  tramos `[inicio, fin)`; el adapter corta los ids con ellos. Descartado: pasar la secuencia de tokens (la regla no los lee y
  habría que copiarlos) y devolver listas de ids (mezcla la regla con el tokenizador).
- **El tramo del pasaje sale de `sequence_ids` (`Tokenizador.codificar_par`).** Un método nuevo del protocolo de
  infraestructura que devuelve `ParCodificado(ids, inicio_pasaje, fin_pasaje)` con los mismos ids que `codificar(pregunta,
  pasaje)`. Descartado (ya en D3): restar la pregunta codificada sola. `primera` no lo usa: sigue con `codificar` y el
  truncado de hoy, así AC-2 no depende de ninguna equivalencia.
- **`BgeReranker.variante(modo, solape, max_length)` en vez de cargar otro reranker por brazo.** Devuelve otro adapter sobre
  la MISMA sesión y el MISMO tokenizador (no tiene estado), que es lo que pide ADR-45 P1. `RerankerRegistrado` (RN-12) y
  `RerankerLexico` la delegan o la implementan. Descartado: construir `BgeReranker` en `composicion_suite` (la suite
  conocería los argumentos del adapter) y una fábrica de brazos (otra capa sin segundo uso).
- **El modo efectivo se comprueba con lo que el adapter dice de sí mismo, no con `meta`.** Como `meta.rerankerModel` no lleva
  el modo (D4), el reranker expone `configuracion` (`ConfiguracionDelReranker`: modo, solape, largo, pares); `RerankerObservado`
  la anota en cada consulta y `evaluar_brazos` aborta (`SuiteAbortada`) si alguna difiere de lo que el brazo declaró. Descartado:
  leerla de `meta` (cambiaría el contrato) y de los logs (no es dato de la corrida).
- **Las paráfrasis entran en la misma corrida como preguntas añadidas.** `comparacion.parafrasis` (ruta de `parafrasis-v1` y
  `pares_minimos`) añade las redacciones al dataset de la configuración, que conserva su partición, y exige que el corpus de los
  pares sea el mismo (nombre y versión). «Paráfrasis recuperadas» cuenta los pares con TODAS sus redacciones con `recall` > 0.
  Descartado: una familia nueva `reranker` con su propio ejecutor (duplicaría `evaluar_brazos` y su esquema) y medirlas en otra
  corrida (la diferencia ya no saldría de la misma sesión).
- **Un dataset sin partición solo se admite con `comparacion.conjunto_de_desarrollo: true`.** El corpus ampliado de S5 y sus
  preguntas son de desarrollo por construcción y no existe una partición de `ol06-particion-v1` para sus ids; la declaración es
  explícita y versionada (ADR-45 P2 sigue sin abrir validación ni prueba). Descartado: crear una partición nueva (fuera de los
  paths de este change) y relajar la regla para cualquier dataset.
- **Los topes de la viabilidad no tienen literales.** `p95_evidence_analyses_s` se lee de `comparacion.metas`
  (`metas-iniciales.yaml`) y `STACK_MEMORY_LIMIT_GB` del entorno (clave de ADR-39); sin alguno la carga se niega nombrándolo. La
  memoria del stack por brazo llega en `--memoria-del-stack <json>` (`{brazo: GB}`, la mide `ai-eval-runner`). Descartado: el
  RSS del proceso como memoria del stack (no incluye Ollama ni Milvus y es monótono entre brazos) y una variable de entorno por
  brazo (el nombre del brazo no es un identificador de entorno).
- **La fuente `indice` ya la dejó `l1d-326`; aquí se extiende por brazo.** `evaluar_brazos` abre cada colección una sola vez
  (`Brazo.indice`, `None` = la de `MILVUS_COLLECTION_NAME`) con el abridor de `OrigenLocal` (el real o el fingido de los tests) y
  el informe trae `corpus` (fuente, colección, recuento y huella de ids, `CORPUS_CHUNK_SIZE` de la ingesta y los brazos con índice
  distinto), sin texto. El `document_id` de la ingesta es `<document_key>@<huella>` y el dataset nombra la clave:
  `RerankerObservado` normaliza con `clave_del_documento` para resolver el chunk esperado por documento y cita literal.
- **Ingesta del brazo de 512 aparte, sin tocar el catálogo (tarea 2.5b).** `IngerirBrazoDeChunks` recibe el catálogo por su puerto
  de LECTURA (`LectorDePoblacionDelCorpus`: sin métodos de escritura) y escribe solo en el almacén de la colección nueva: vuelve a
  leer el texto del manifiesto, lo fragmenta, lo embebe y copia los metadatos del registro del catálogo (sin LLM ni NLI). Solo
  entran los documentos que `l1d-119` dejó vigentes. Descartado: reutilizar `IngestionPipelineService` (`decidir_version` omite el
  documento ya embebido con el mismo `checksum` y escribe en el catálogo compartido) y `reindex-context` de `l1d-337` (conserva
  los `chunk_id`; aquí cambian los límites). El subcomando `ingest brazo-de-chunks` se niega si `--coleccion` es la de
  `MILVUS_COLLECTION_NAME`.
- **El reranker falso también cuenta ventanas.** `RerankerLexico(modo, solape, max_length)` cuenta palabras como tokens y usa la
  misma `trazar_ventanas`; sin `max_length` se comporta como antes (el baseline de la CI no cambia). Con `maximo` nunca puntúa
  menos que con `primera`.
- **Valor inicial del solape: 64 tokens, sin confirmar.** Sigue siendo la propuesta de la pregunta 1; vive en la constante de
  dominio y, para los brazos, en `s7-reranker-ventanas.yaml`. Si la corrida base B o el humano piden otro, se cambia en esos dos
  lugares sin tocar código de reglas.

## Privacidad y ownership

- Sin frontera nueva: todo ocurre dentro de `rag-orchestrator`. Los textos que se parten en ventanas son chunks del
  corpus público (schema `corpus` / Milvus) y la pregunta ya desidentificada que llega de `clinical-api` (RN-11); no
  cruza ningún dato adicional `web → clinical-api → rag-orchestrator`.
- `rag-orchestrator` sigue sin tocar datos clínicos ni `clinical-minio`. Sin llamadas de red nuevas: el modelo es local
  (RN-12).
- Logs: las ventanas no se registran. Si se añade un recuento de ventanas al evento existente, es un entero; nunca
  texto de chunks ni de la pregunta.
- Reportes de `evaluate`: ids, puestos, puntajes, recuentos y configuración; preguntas sintéticas (RN-13, RN-14).

## Contratos

Sin diff de `apps/rag-orchestrator/openapi.yaml` ni de `contracts/examples/`: `relevanceScore`, `topRelevanceScore` y
`meta.rerankerModel` conservan tipo, descripción **y valor** con cualquier modo (D4). Proveedor: `rag-orchestrator`;
consumidor: `clinical-api`, que lo persiste tal cual. No es un cambio incompatible (oasdiff sin diferencias);
compatible con ADR-26. No hay tarea `## contratos`; los tests de integración de `/rag/query` validan la respuesta
contra el spec OpenAPI (D7).

## Dependencias y colaboradores

| Módulo | Cambio | Depende de |
|---|---|---|
| `app/domain/ventanas_del_reranker.py` (nuevo) | `trazar_ventanas()`, `agregar_por_maximo()`, constantes iniciales y el enumerado del modo | nada (regla pura) |
| `app/infrastructure/reranker/bge_reranker.py` | aplica el modo; `primera` sin cambios | dominio, `Tokenizador`, `SesionDeInferencia` |
| `app/infrastructure/models/sesion.py`, `onnx.py` | método del tramo del pasaje en `Tokenizador` | `tokenizers` (ya presente) |
| `app/infrastructure/models/local.py` | pasa modo y solape al adapter; `describir_modelo` no cambia | `Settings` |
| `app/config/settings.py` | dos claves y su validación | constantes del dominio |
| `app/evaluation/brazos_recuperacion.py`, `config_suite.py`, `esquema_suite.py`, `composicion_suite.py`, `corrida_brazos.py`, `armado_comparacion.py` | brazos del *reranker*, fuente del índice, métricas y viabilidad | puertos `Reranker` y `ChunkSearch` |
| `app/evaluation/viabilidad_del_brazo.py` (nuevo, o función en `brazos_recuperacion.py`) | regla de «no viable» | nada |
| `scripts/ci/eval-trigger-paths.yaml` | claves `RERANKER_CHUNK_WINDOWS`, `RERANKER_WINDOW_OVERLAP` | — |

`RAGOrchestratorService`, el puerto `Reranker`, `relevance.py` (umbral y `top_relevance_score()`) y
`pares_del_reranker.py` **no se modifican**. Reglas con nombre propio: `trazar_ventanas()` (cobertura),
`agregar_por_maximo()` (RN-03), `viabilidad_del_brazo()` (ADR-39).

## Evaluación

Cambio de umbral de facto: obligatoria la suite con modelos locales (`run-ai-eval`, agente `ai-eval-runner`).

- Métricas OL-06 afectadas: recall@10 (total y es→en), MRR, «sin evidencia» (y sus falsos), fidelidad y precisión de
  citas como control (no deben retroceder), y p95 de la etapa y de la consulta completa.
- Protocolo: A/B en la misma corrida contra `primera` (ADR-45 P1, P6), subconjunto de desarrollo, sobre la ingesta de
  `l1d-119`, la misma de la corrida base (`[S7 resp. 10]`), y con los umbrales actuales (`[S7 resp. 11]`). Va en la
  **corrida final** del sprint junto a los brazos de US-277 y US-279 (`S7-refinamiento.md` §5).
- **Ninguna cifra de este change se escribe sin reporte versionado en `reports/eval/`** producido por `run-ai-eval`.
- Riesgo a vigilar: con `maximo` los puntajes solo pueden subir; pueden aparecer falsos positivos sobre
  `RELEVANCE_THRESHOLD` en las preguntas sin respuesta. El informe debe mostrar «sin evidencia» por brazo; recalibrar el
  umbral queda fuera de alcance.

## Risks / Trade-offs

- **Latencia (≈3 ventanas por chunk lleno, D5)** → la clave nace en `primera`; AC-5 marca «no viable» y el valor no
  cambia. Alternativa en el mismo informe: `RERANKER_MAX_LENGTH` ampliado (una pasada más larga en vez de tres).
- **Sesgo al alza de los puntajes** → se mide «sin evidencia» por brazo; el umbral no se toca aquí.
- **Índice propio del brazo de 512** → es una ingesta aparte, no una reindexación de `l1d-337` (D6); si no cabe en la
  corrida final, el informe lo deja como «no medido» y la decisión se toma sin él (lo decide el humano).
- **Tres changes tocan la comparación de brazos** → ver §8.

## Migration Plan

Sin migración de datos ni de índice para el valor por defecto. Reversión: quitar la clave del entorno (o `primera`).
Adoptar `maximo` (H-3) no obliga a reindexar: cambia la lectura, no el corpus.

## 8. Coordinación con otros changes del S7

- **L1D-335 (US-277):** añade el brazo de `RERANKER_MAX_PAIRS` = 30 y toca `brazos_recuperacion.py`, `config_suite.py`,
  `esquema_suite.py`, `composicion_suite.py` y `eval-trigger-paths.yaml`. Va **después** de este change y extiende el
  `Brazo` que este deja. Con 30 pares y `maximo` el número de ventanas se multiplica: el informe final debe medir la
  combinación solo si ambos brazos son viables por separado.
- **L1D-337 (US-279):** antepone el contexto **solo al texto que entra a los codificadores** *dense* y *sparse*; el
  prefijo no se guarda en ningún campo. El *reranker* recibe siempre el `chunk_text` original, con o sin contexto en
  el índice: `l1d-337` no lo cambia y las ventanas de este change no pierden capacidad por el prefijo. `l1d-337`
  reindexa cada variante en una colección propia desde la de origen, con los mismos chunks y `chunk_id`, y reutiliza
  la fuente del índice de la suite que añade este change (D6).
- **L1D-334 (US-276):** aporta el dataset de pares de paráfrasis y su informe por etapa.
- Orden de los archivos de la suite (propuesta de planificación, se aprueba con el plan): `l1d-334` → `l1d-329` →
  `l1d-331` (parte de código) → **`l1d-336`** → `l1d-335` → `l1d-337`. Cada uno rebasa sobre el anterior.

## Open Questions

1. **Valor inicial de `RERANKER_WINDOW_OVERLAP`** (propuesta: 64 tokens, asumido). ¿Se confirma, se iguala a
   `CORPUS_CHUNK_OVERLAP` o se barre en la corrida?
2. **Valor de `RERANKER_MAX_LENGTH` del brazo alternativo.** La historia dice 1024; ADR-39 anota que 768 y 1280 no se
   pudieron medir en la VM de 7,75 GB. ¿Solo 1024 en la máquina de referencia?
3. **Brazo de chunks de 512:** exige una ingesta aparte en colección propia (D6), no una reindexación de `l1d-337`.
   **Resuelta (`[S7 resp. 14]`): entra en la corrida final** (tarea 2.5b).
4. **`meta.rerankerModel` con el modo (D4): resuelta en planificación (2026-11-22, pendiente de aprobación con el
   plan).** La cadena queda intacta; el modo y el solape van solo en el informe de evaluación.
5. **Decisión posterior (no bloquea):** valor por defecto de `RERANKER_CHUNK_WINDOWS` y enmienda de ADR-39, sobre el
   reporte de la corrida final (H-3).
6. **Fuente del índice de la suite (D6): confirmada (`[S7 resp. 14]`).** Leer la colección de la ingesta de `l1d-119` desde la suite. Si
   `l1d-119` ya deja otra forma de medir sobre su ingesta, se usa esa y la tarea 2.3b se reduce a configurarla.
