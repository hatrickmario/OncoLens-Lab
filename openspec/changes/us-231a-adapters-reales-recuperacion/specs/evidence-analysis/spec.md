## Purpose

Define el comportamiento verificable del pipeline de análisis de evidencia de OncoLens: qué evidencia del corpus se recupera para una pregunta, cuándo se responde "sin evidencia", cómo se generan y validan las opciones descritas en la evidencia y qué contrato final recibe `clinical-api`.

## ADDED Requirements

### Requirement: Embeddings reales de consulta y de pasaje con BGE-M3
`rag-orchestrator` MUST disponer de un adapter local de BGE-M3 (int8, CPU/ONNX) que implemente `QueryEmbedder` y `PassageEmbedder` con el prefijo de pregunta o de pasaje del modelo, y que devuelva vectores *dense* de `EMBEDDING_DIM` dimensiones (ADR-39).

#### Scenario: Los vectores reales tienen 1024 dimensiones y el pasaje correcto queda primero por coseno [US-231a AC-1] [IA-01] [ADR-39]
- **GIVEN** FX-06a-c y los adapters reales de `QueryEmbedder` y `PassageEmbedder` con los pesos de `MODEL_CACHE_DIR`
- **WHEN** se embeben `Q-HER2` y sus tres pasajes
- **THEN** cada vector tiene 1024 dimensiones (`EMBEDDING_DIM`)
- **AND** por similitud coseno, `ch-m1-1` queda primero

#### Scenario: El adapter antepone el prefijo de pregunta o de pasaje según el puerto [US-231a AC-1]
- **GIVEN** el adapter de *embeddings* con una sesión de inferencia falsa que registra la entrada tokenizada
- **WHEN** se llama a `QueryEmbedder.embeber` y a `PassageEmbedder.embeber` con el mismo texto
- **THEN** las entradas enviadas al modelo difieren solo en el prefijo propio de cada puerto

### Requirement: Reranker real con puntaje normalizado a [0,1]
`rag-orchestrator` MUST disponer de un adapter local de bge-reranker-v2-m3 (int8, `RERANKER_MAX_LENGTH` = 512, hasta `RERANKER_MAX_PAIRS` = 12 pares) que implemente `Reranker`, devuelva un puntaje por candidato, en el mismo orden y normalizado a [0,1], y nunca `None` (RN-03, RN-02).

#### Scenario: Los puntajes están en [0,1] y el chunk pertinente supera al de otro tipo de cáncer [US-231a AC-2] [RN-03] [ADR-39]
- **GIVEN** FX-06a-c y el adapter real del *reranker*
- **WHEN** puntúa los pares de `Q-HER2`
- **THEN** cada `relevance_score` está en [0,1]
- **AND** `ch-m1-1` puntúa por encima de `ch-p1-1`

#### Scenario: Un logit de la sesión se normaliza con sigmoide y el exceso de pares se rechaza [US-231a AC-2]
- **GIVEN** el adapter del *reranker* con una sesión de inferencia falsa que devuelve logits fijos
- **WHEN** puntúa los candidatos
- **THEN** cada puntaje es la sigmoide del logit, en el orden de los candidatos
- **AND** más de `RERANKER_MAX_PAIRS` candidatos fallan con el error del puerto, sin truncar en silencio

### Requirement: Procedencia del reranker en meta.rerankerModel
`meta.rerankerModel` de `/rag/query` MUST contener el modelo, la versión y el *hash* SHA-256 del *reranker* iguales a los de la configuración, construidos a partir de ella y no del texto generado (FR-25, RN-03).

#### Scenario: La respuesta registra modelo, versión y hash del reranker configurados [US-231a AC-3] [FR-25] [RN-03]
- **GIVEN** `/rag/query` con el `Reranker` real cableado y `RERANKER_MODEL`, `RERANKER_MODEL_REVISION` y `RERANKER_MODEL_SHA256` definidos en la configuración
- **WHEN** se procesa `Q-HER2` con un JWT de servicio válido
- **THEN** `meta.rerankerModel` contiene el modelo, la versión y el SHA-256 de la configuración
- **AND** la respuesta valida contra `RagQueryInternalResponse` del `openapi.yaml` (helper de validación de L1D-164)

### Requirement: Detector de idioma local y determinista
`rag-orchestrator` MUST disponer de un `LanguageDetector` local y determinista, sin red, que distinga `es` de `en` (ADR-39).

#### Scenario: Q-HER2 se detecta como español y ch-m1-1 como inglés [US-231a AC-4] [ADR-39]
- **GIVEN** los textos de idioma conocido de FX-06a-c
- **WHEN** el detector real los procesa
- **THEN** devuelve `es` para `Q-HER2`
- **AND** devuelve `en` para `ch-m1-1`

### Requirement: Los adapters reales cumplen el mismo contrato que los fakes
Los adapters reales y sus fakes MUST superar la misma batería de contrato: mismas firmas y mismos tipos de error, un puntaje ausente es `None` y nunca `0.0`, y el fallo de un modelo se traduce en `RETRIEVAL_UNAVAILABLE` (`[S1 resp. 12]`, RN-02).

#### Scenario: La misma batería pasa sobre el adapter real y sobre el fake [US-231a AC-5] [S1 resp. 12] [RN-02]
- **GIVEN** los cuatro adapters (`QueryEmbedder`, `PassageEmbedder`, `Reranker`, `LanguageDetector`) en su versión real y en su versión fake (FX-06a-a)
- **WHEN** se ejecuta sobre ambos la misma batería de contrato
- **THEN** cumplen las mismas firmas y los mismos tipos de error
- **AND** un puntaje ausente se representa con `None` y nunca con `0.0`
- **AND** el fallo de un modelo llega a `/rag/query` como `503` con `error = "RETRIEVAL_UNAVAILABLE"`

### Requirement: Puntaje reproducible entre procesos
Con los mismos pares y la misma configuración, el `relevance_score` MUST ser idéntico en cálculos sucesivos, también en procesos distintos (IA-07, ADR-8).

#### Scenario: Dos procesos distintos calculan el mismo relevance_score [US-231a AC-6] [IA-07] [ADR-8]
- **GIVEN** los mismos pares de FX-06a-c y la misma configuración
- **WHEN** se calcula el `relevance_score` dos veces en procesos distintos
- **THEN** los valores son idénticos

### Requirement: Modelo ausente o alterado impide el arranque
Con `MODEL_PROVIDER=local`, `rag-orchestrator` MUST verificar al arrancar la ruta y el SHA-256 de los modelos de *embeddings* y de *reranker*; si el archivo falta o el *hash* no coincide, el proceso MUST terminar con código distinto de 0 y el error SHALL nombrar la variable de configuración, nunca su contenido (RN-22).

#### Scenario: Un hash alterado termina el proceso nombrando la variable [US-231a AC-7] [RN-22]
- **GIVEN** un archivo de modelo de *reranker* cuyo SHA-256 no coincide con `RERANKER_MODEL_SHA256` y `MODEL_PROVIDER=local`
- **WHEN** arranca `rag-orchestrator` como subproceso
- **THEN** el proceso termina con código distinto de 0
- **AND** stdout y stderr completos contienen `RERANKER_MODEL_SHA256` y no contienen la ruta, el hash esperado ni el calculado

#### Scenario: Un archivo ausente termina el proceso nombrando la variable de ruta [US-231a AC-7] [RN-22]
- **GIVEN** un modelo de *embeddings* cuya ruta (`EMBEDDING_MODEL_PATH`) no existe y `MODEL_PROVIDER=local`
- **WHEN** arranca `rag-orchestrator` como subproceso
- **THEN** el proceso termina con código distinto de 0
- **AND** stdout y stderr completos contienen `EMBEDDING_MODEL_PATH` y no contienen la ruta

#### Scenario: Con el proveedor fake no se verifica ni se carga ningún modelo [US-231a AC-7]
- **GIVEN** el proveedor de modelos `fake` y sin archivos de modelo
- **WHEN** arranca `rag-orchestrator`
- **THEN** arranca sin error y sin importar ningún runtime de modelos

### Requirement: Matriz estricta de proveedores de modelos
`MODEL_PROVIDER` MUST ser exactamente `fake` o `local`; cualquier otro valor SHALL impedir el arranque nombrando la variable. La combinación `LLM_PROVIDER=local` con `MODEL_PROVIDER=fake` MUST fallar cerrado y, con `REAL_*_ENABLED=true`, `MODEL_PROVIDER=fake` MUST impedir el arranque (RN-12, RN-13).

#### Scenario: Un valor fuera del enum impide arrancar [US-231a AC-7] [RN-12]
- **GIVEN** `MODEL_PROVIDER` con un valor distinto de `fake` y `local`
- **WHEN** arranca `rag-orchestrator`
- **THEN** el proceso termina con código distinto de 0 y el error nombra `MODEL_PROVIDER` sin eco de su valor

#### Scenario: LLM local con modelos fake responde 503 fail-closed [US-231a AC-7] [RN-12]
- **GIVEN** `LLM_PROVIDER=local` y `MODEL_PROVIDER=fake`
- **WHEN** se envía `Q-HER2` a `/rag/query` con un JWT de servicio válido
- **THEN** responde `503` con `error = "RETRIEVAL_UNAVAILABLE"` sin recuperar con fakes ni invocar al LLM

#### Scenario: Datos reales habilitados con MODEL_PROVIDER fake impiden el arranque [US-231a AC-7] [RN-13]
- **GIVEN** `REAL_ANONYMIZED_ENABLED=true` y `MODEL_PROVIDER=fake`
- **WHEN** arranca `rag-orchestrator`
- **THEN** el proceso termina con código distinto de 0 y el error nombra `MODEL_PROVIDER`

### Requirement: Pesos fuera del repo y de la imagen, sin red en Compose
El Compose MUST montar los modelos como *bind mount* `read_only` desde un directorio del host fuera del repo y pasar las variables de proveedor, rutas, SHA-256 y modo sin conexión (RN-12, RN-14).

#### Scenario: El Compose monta los modelos de solo lectura y fuerza el modo sin conexión [US-231a AC-8] [RN-14]
- **GIVEN** `infra/docker/docker-compose.yml` y el `.dockerignore` del Dockerfile de `rag-orchestrator`
- **WHEN** se analiza la configuración del servicio `rag-orchestrator`
- **THEN** monta `MODEL_CACHE_DIR` como *bind mount* `read_only` desde fuera del repo
- **AND** define `MODEL_PROVIDER`, `*_MODEL_PATH`, `*_MODEL_SHA256`, `HF_HUB_OFFLINE=1` y `TRANSFORMERS_OFFLINE=1`
- **AND** `.gitignore` y `.dockerignore` excluyen los directorios de modelos

### Requirement: Adapters locales sin red
Los adapters reales MUST funcionar sin conexiones salientes y no SHALL importar un cliente de nube ni descargar pesos en ejecución (RN-12, NFR-05).

#### Scenario: Con la red bloqueada responden y no registran conexiones salientes [US-231a AC-8] [RN-12] [NFR-05]
- **GIVEN** los cuatro adapters reales y la red bloqueada en el test, con registro de conexiones salientes
- **WHEN** procesan FX-06a-c
- **THEN** responden sin error
- **AND** el registro de conexiones salientes queda vacío

#### Scenario: Ningún módulo de los adapters importa un cliente de nube o HTTP [US-231a AC-8] [RN-12]
- **GIVEN** los módulos de `app/infrastructure/{embeddings,reranker,language,models}`
- **WHEN** se inspeccionan sus importaciones
- **THEN** ninguno importa ni usa `huggingface_hub`, `transformers`, `requests`, `httpx`, `urllib.request`, `socket`, un SDK de nube, `from_pretrained` ni `hf_hub_download`
- **AND** la carga usa `Tokenizer.from_file` y `onnxruntime.InferenceSession` con rutas locales

### Requirement: Latencia por etapa medida y reportada
La latencia de los *embeddings* y del *reranker* con modelos reales MUST medirse por etapa (3 corridas, mediana) contra su presupuesto: *embeddings* ≤ 500 ms y *reranker* (12 pares) ≤ 4500 ms; un valor fuera de presupuesto SHALL reportarse y no ocultarse (NFR-01, ADR-39).

#### Scenario: La mediana de cada etapa se compara con su presupuesto y el exceso se reporta [US-231a AC-9] [NFR-01] [ADR-39]
- **GIVEN** FX-06a-c en la VM de Docker de ≥ 10 GB del ADR-39 y los adapters reales
- **WHEN** se mide cada etapa en 3 corridas y se toma la mediana
- **THEN** los *embeddings* quedan en ≤ 500 ms y el *reranker* (12 pares) en ≤ 4500 ms
- **AND** un valor fuera de presupuesto queda en el reporte de la medición para el refinamiento

## Regresiones anotadas (no son escenarios de este change)

- Regresión [RN-12] ausencia de *fallback* a la nube con datos reales: activa desde S6 (proveedores locales, `preflight`).
- La memoria conjunta de los tres modelos y la sustitución de `fabricar_embedder_real` son de US-231b.
