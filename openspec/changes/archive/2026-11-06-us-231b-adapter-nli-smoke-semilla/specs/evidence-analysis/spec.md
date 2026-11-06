## ADDED Requirements

### Requirement: Clasificación NLI real por lotes con mDeBERTa
`rag-orchestrator` MUST disponer de un puerto `NliClassifier` (`clasificar(pares: list[ParNli]) -> list[ResultadoNli]`, por lotes) y de un adapter local de mDeBERTa-v3-base-xnli-multilingual-nli-2mil7 (fp32, ONNX Runtime/CPU) que devuelva, por par, `label` ∈ {`entailment`, `neutral`, `contradiction`} y `p_entailment` ∈ [0,1] a partir de probabilidades que suman 1 (ADR-39, FR-10). El NLI MUST recibir solo premisa (texto del corpus) e hipótesis (RN-11).

#### Scenario: Los tres pares de FX-06a-c se clasifican en un lote con su clase esperada [US-231b AC-1] [ADR-39] [FR-10]
- **GIVEN** los tres pares NLI de FX-06a-c y el `NliClassifier` real con los pesos de `MODEL_CACHE_DIR`
- **WHEN** los clasifica en un único lote
- **THEN** el primer par devuelve `entailment`, el segundo `contradiction` y el tercero `neutral`
- **AND** las probabilidades de cada par suman 1

#### Scenario: El adapter normaliza los logits con softmax y mapea las clases con los índices de configuración [US-231b AC-1] [RN-01] [RN-22]
- **GIVEN** el adapter NLI con una sesión de inferencia falsa que devuelve logits fijos y los índices `NLI_LABEL_INDEX_ENTAILMENT`, `NLI_LABEL_INDEX_NEUTRAL` y `NLI_LABEL_INDEX_CONTRADICTION` de configuración
- **WHEN** clasifica un lote de pares
- **THEN** cada par recibe el `label` de su probabilidad máxima y `p_entailment` es la probabilidad de `entailment`
- **AND** un lote vacío devuelve una lista vacía sin invocar la sesión

#### Scenario: Un mapeo de clases inválido impide el arranque y nunca se lee de un config.json sin verificar [US-231b AC-4] [RN-01] [RN-22]
- **GIVEN** índices de clase repetidos o fuera de [0, 2], o un modelo cuya salida no tiene 3 clases
- **WHEN** arranca `rag-orchestrator` con `MODEL_PROVIDER=local` como subproceso
- **THEN** el proceso termina con código distinto de 0 nombrando la variable de índice, sin su valor
- **AND** ningún módulo del paquete `nli` lee `config.json` ni `id2label`

### Requirement: Procedencia del NLI en meta.nliModel
La metainformación del `NliClassifier` real MUST contener modelo, versión y SHA-256 iguales a los de la configuración, construidos a partir de ella y no del texto generado (FR-25).

#### Scenario: La metainformación del NLI coincide con la configuración [US-231b AC-2] [FR-25]
- **GIVEN** el `NliClassifier` real cableado con `NLI_MODEL`, `NLI_MODEL_REVISION` y `NLI_MODEL_SHA256` definidos
- **WHEN** se lee la metainformación que alimenta `meta.nliModel`
- **THEN** contiene el modelo, la versión y el SHA-256 de la configuración

### Requirement: El NLI real cumple el mismo contrato que su fake
El `NliClassifier` real y su fake MUST superar la misma batería de contrato: misma firma, nunca `None`, `label` dentro del conjunto permitido y el mismo tipo de error del puerto ante un fallo del modelo (el que L1D-180 traduce en `NLI_UNAVAILABLE`) (`[S1 resp. 3]`).

#### Scenario: La misma batería pasa sobre el adapter real y sobre el fake [US-231b AC-3] [S1 resp. 3]
- **GIVEN** el `NliClassifier` real (sesión falsa en la ruta rápida, modelo real con `models`) y su fake
- **WHEN** se ejecuta sobre ambos la misma batería de contrato
- **THEN** cumplen la firma `clasificar(pares) -> list[ResultadoNli]` y nunca devuelven `None`
- **AND** cada `label` pertenece a {`entailment`, `neutral`, `contradiction`}
- **AND** un fallo del modelo lanza `FalloDeInferencia` en ambos, sin texto de premisa ni hipótesis en el mensaje

### Requirement: NLI ausente o alterado impide el arranque
Con `MODEL_PROVIDER=local`, `rag-orchestrator` MUST verificar al arrancar la ruta y el SHA-256 del modelo NLI y de su tokenizer con el mecanismo común de US-231a; si el archivo falta o el *hash* no coincide, el proceso MUST terminar con código distinto de 0 y el error SHALL nombrar la variable de configuración, nunca su contenido (RN-22).

#### Scenario: Un hash alterado del NLI termina el proceso nombrando la variable [US-231b AC-4] [RN-22]
- **GIVEN** un archivo del NLI cuyo SHA-256 no coincide con `NLI_MODEL_SHA256` y `MODEL_PROVIDER=local`
- **WHEN** arranca `rag-orchestrator` como subproceso
- **THEN** el proceso termina con código distinto de 0
- **AND** stdout y stderr completos contienen `NLI_MODEL_SHA256` y no contienen la ruta, el hash esperado ni el calculado

#### Scenario: Un archivo del NLI ausente termina el proceso nombrando la variable de ruta [US-231b AC-4] [RN-22]
- **GIVEN** `NLI_MODEL_PATH` apuntando a un archivo que no existe y `MODEL_PROVIDER=local`
- **WHEN** arranca `rag-orchestrator` como subproceso
- **THEN** el proceso termina con código distinto de 0
- **AND** stdout y stderr completos contienen `NLI_MODEL_PATH` y no contienen la ruta

### Requirement: Los datos externos del ONNX se verifican o el arranque falla
Un modelo ONNX con datos externos (`*.onnx.data` o `*.onnx_data`) MUST tener su par `*_MODEL_DATA_PATH` / `*_MODEL_DATA_SHA256` verificado; sin él, `rag-orchestrator` SHALL fallar cerrado al arrancar nombrando la variable, y la sesión MUST crearse desde los bytes ya hasheados para cargar exactamente lo verificado (RN-22, RN-12, RN-14).

#### Scenario: Un modelo con datos externos sin su par verificado impide el arranque [US-231b AC-4] [RN-22]
- **GIVEN** un `.onnx` del NLI que referencia un archivo de datos externos y `MODEL_PROVIDER=local` sin `NLI_MODEL_DATA_PATH` / `NLI_MODEL_DATA_SHA256`
- **WHEN** arranca `rag-orchestrator` como subproceso con `cwd` igual al directorio que contiene el `.data` (peor caso: una ruta relativa de la referencia externa sí resolvería)
- **THEN** el proceso termina con código distinto de 0, porque la sesión se crea desde bytes y cualquier initializer externo no declarado se rechaza
- **AND** stdout y stderr completos contienen `NLI_MODEL_DATA_PATH` y no contienen la ruta, el hash esperado ni el calculado

#### Scenario: Los patrones de pesos excluyen también los datos externos [US-231b AC-4] [RN-14]
- **GIVEN** `.gitignore`, el `.dockerignore` raíz y `apps/rag-orchestrator/Dockerfile.dockerignore`
- **WHEN** se analizan sus patrones
- **THEN** cada uno excluye `**/*.onnx.data` además de `**/*.onnx_data`

### Requirement: NLI local sin red
El adapter NLI real MUST funcionar sin conexiones salientes y no SHALL importar un cliente de nube o HTTP ni descargar pesos en ejecución (RN-12, NFR-05).

#### Scenario: Con la red bloqueada clasifica y no registra conexiones salientes [US-231b AC-5] [RN-12] [NFR-05]
- **GIVEN** el `NliClassifier` real y la red bloqueada en el test, con registro de conexiones salientes
- **WHEN** clasifica los pares de FX-06a-c
- **THEN** responde sin error
- **AND** el registro de conexiones salientes queda vacío

#### Scenario: Ningún módulo del paquete nli importa un cliente de nube o HTTP [US-231b AC-5] [RN-12]
- **GIVEN** los módulos de `app/infrastructure/nli`
- **WHEN** se inspeccionan sus importaciones
- **THEN** ninguno importa ni usa `huggingface_hub`, `transformers`, `requests`, `httpx`, `urllib.request`, `socket`, un SDK de nube, `from_pretrained` ni `hf_hub_download`
- **AND** la carga usa `Tokenizer.from_file(<ruta local>)` y `onnxruntime.InferenceSession(<bytes leídos de la ruta ya verificada>)`, nunca una ruta sin verificar

### Requirement: Latencia de la etapa NLI medida y reportada
La latencia de la etapa NLI con el modelo real MUST medirse (3 corridas, mediana) contra su presupuesto de 1500 ms; un valor fuera de presupuesto SHALL reportarse y no ocultarse (NFR-01, ADR-39).

#### Scenario: La mediana de la etapa NLI se compara con 1500 ms y el exceso se reporta [US-231b AC-6] [NFR-01] [ADR-39]
- **GIVEN** FX-06a-c en la VM de Docker de ≥ 10 GB del ADR-39 y el `NliClassifier` real
- **WHEN** se mide la etapa NLI en 3 corridas y se toma la mediana
- **THEN** la mediana es ≤ 1500 ms
- **AND** un valor fuera de presupuesto queda en el reporte de la medición para el refinamiento

### Requirement: Memoria conjunta de los tres modelos medida y reportada
La memoria residente de `rag-orchestrator` con BGE-M3, bge-reranker-v2-m3 y mDeBERTa cargados a la vez MUST medirse contra la cifra del ADR-39 (4489 MiB); un valor fuera de presupuesto SHALL reportarse (NFR-01, ADR-39).

#### Scenario: El RSS conjunto no excede 4489 MiB y el exceso se reporta [US-231b AC-7] [NFR-01] [ADR-39]
- **GIVEN** los tres modelos cargados a la vez en la VM de Docker de ≥ 10 GB y una inferencia ejecutada con cada uno
- **WHEN** se mide la memoria residente máxima del proceso de `rag-orchestrator`
- **THEN** no excede 4489 MiB
- **AND** un valor fuera de presupuesto queda en el reporte de la medición para el refinamiento

### Requirement: Chunking de la semilla en tokens de BGE-M3
Con `MODEL_PROVIDER` real, `load_seed_corpus` MUST obtener el *embedder* de pasajes real de US-231a y trocear contando tokens con el tokenizer de BGE-M3, de modo que ningún chunk exceda `CORPUS_CHUNK_SIZE` tokens (`[S1 resp. 38]`).

#### Scenario: ch-largo-1 se trocea en al menos dos chunks de ≤ 1024 tokens [US-231b AC-8] [S1 resp. 38]
- **GIVEN** `load_seed_corpus` con `MODEL_PROVIDER=local`, `CORPUS_CHUNK_SIZE = 1024` y `ch-largo-1` de FX-06a-c (1500 tokens de BGE-M3)
- **WHEN** se trocea
- **THEN** cada chunk tiene ≤ 1024 tokens contados con el tokenizer de BGE-M3
- **AND** se producen al menos 2 chunks (el número exacto depende de `CORPUS_CHUNK_OVERLAP`, asumido)

#### Scenario: La fábrica de embeddings devuelve el adapter real y no sale con código 1 [US-231b AC-8]
- **GIVEN** `MODEL_PROVIDER=local` con los pesos de embeddings verificados
- **WHEN** `fabricar_embedder_real` construye el *embedder* de pasajes
- **THEN** devuelve el adapter de `PassageEmbedder` de US-231a
- **AND** con `MODEL_PROVIDER=fake` falla nombrando la variable, sin devolver un *embedder* falso

#### Scenario: El cargador de la semilla verifica todos los archivos que abre y no revela rutas ni hashes [US-231b AC-8] [RN-22]
- **GIVEN** `MODEL_PROVIDER=local` y un tokenizer de BGE-M3 cuyo SHA-256 no coincide con `EMBEDDING_TOKENIZER_SHA256`
- **WHEN** corre `python -m app.scripts.load_seed_corpus` como subproceso
- **THEN** termina con código distinto de 0
- **AND** stdout y stderr completos contienen `EMBEDDING_TOKENIZER_SHA256` y no contienen la ruta, el hash esperado ni el calculado

### Requirement: Smoke de la semilla con embeddings reales y recuperación compuesta
El cargador de la semilla MUST dejar la semilla `embebido` y vigente con los metadatos del catálogo y su `CorpusRelease`, y `app/main.py` MUST componer los bordes reales del corpus de modo que `/rag/query` deje de responder `503 RETRIEVAL_UNAVAILABLE` por composición (RN-05, AC-06.1, `[S1 resp. 82]`).

#### Scenario: Todos los documentos de la semilla quedan embebidos y la release publicada [US-231b AC-9] [US-059 AC-1] [AC-06.1] [RN-05]
- **GIVEN** el manifiesto real `data/raw/seed/manifest.yaml`, los *embeddings* reales y el Compose de L1D-164
- **WHEN** corre `python -m app.scripts.load_seed_corpus`
- **THEN** todos los documentos quedan `embebido` con `is_current = true`
- **AND** sus chunks vigentes llevan copiados del catálogo `source_type`, `language` y `cancer_type_tags`
- **AND** existe la `CorpusRelease` con `excluded_sources = ["NCCN", "ESMO"]`

#### Scenario: Con modelos locales, main.py compone el corpus y /rag/query recupera [US-231b AC-9] [S1 resp. 82]
- **GIVEN** `LLM_PROVIDER=local`, `MODEL_PROVIDER=local`, el corpus compuesto por `main.py`, la semilla cargada y `RETRIEVAL_TOP_K=30` con `RERANKER_MAX_PAIRS=12`, sin ningún generador falso inyectado por entorno
- **WHEN** se envía `Q-HER2` a `/rag/query` con un JWT de servicio válido
- **THEN** la respuesta es `200` con `sin_evidencia` o `503 LOCAL_LLM_UNAVAILABLE`, y nunca `503 RETRIEVAL_UNAVAILABLE`
- **AND** una respuesta `200` se valida contra `RagQueryInternalResponse` del `openapi.yaml`

#### Scenario: La etapa de corte envía como máximo 12 pares al reranker y registra solo recuentos [US-231b AC-9] [S1 resp. 82]
- **GIVEN** la integración de la tarea 1.9 (Milvus fingido en su puerto, *reranker* espía) con 30 candidatos y `RERANKER_MAX_PAIRS=12`
- **WHEN** corre la recuperación
- **THEN** el *reranker* recibe como máximo 12 pares, recortados por puntaje de recuperación con desempate determinista por `chunk_id`
- **AND** el log de la etapa contiene solo recuentos (recibidos, descartados, enviados), sin ids ni texto

#### Scenario: Milvus o el catálogo inaccesibles impiden el arranque sin revelar su dirección [US-231b AC-9] [RN-12] [RN-22]
- **GIVEN** `MODEL_PROVIDER=local` y un Milvus (`MILVUS_URI`) o un catálogo (`CORPUS_DATABASE_URL`, rol `rag_corpus`) inaccesible
- **WHEN** arranca `rag-orchestrator` como subproceso y ejecuta la sonda de arranque (`has_collection`; `SELECT 1`)
- **THEN** el proceso termina con código distinto de 0 y stdout y stderr completos contienen `MILVUS_URI` o `CORPUS_DATABASE_URL`
- **AND** no contienen la URI, el host, el puerto ni el DSN, y no se recurre a un corpus falso

#### Scenario: Con modelos fake main.py no compone el corpus ni importa runtimes [US-231b AC-9]
- **GIVEN** `MODEL_PROVIDER=fake`
- **WHEN** arranca `rag-orchestrator`
- **THEN** arranca sin construir Milvus ni los lectores del schema `corpus` y sin importar ningún runtime de modelos

## Regresiones anotadas (no son escenarios de este change)

- Regresión [RN-12] ausencia de *fallback* a la nube con datos reales: activa desde S6 (proveedores locales, `preflight`).
- La etapa de soporte, el umbral `NLI_ENTAILMENT_THRESHOLD` y el `503 NLI_UNAVAILABLE` son de L1D-180 (US-064).
