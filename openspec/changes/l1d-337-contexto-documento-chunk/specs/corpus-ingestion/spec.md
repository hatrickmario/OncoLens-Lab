## ADDED Requirements

### Requirement: Variante de contexto del chunk por configuración
La ingesta del corpus MUST leer la variante de contexto de `CORPUS_CHUNK_CONTEXT`, con los valores cerrados `ninguno`, `determinista` y `llm`, y SHALL usar `ninguno` cuando la clave no está definida. Con `ninguno` el texto que se embebe de cada chunk es su texto original.

#### Scenario: Con ninguno los vectores y los identificadores son los de main [US-279 AC-3] [RN-22]
- **GIVEN** el manifiesto de test de la ingesta y `CORPUS_CHUNK_CONTEXT = ninguno` (o la clave sin definir)
- **WHEN** se ingiere
- **THEN** el codificador *dense* y el *sparse* reciben, byte a byte, el texto original de cada chunk
- **AND** los `chunk_id`, los `document_id` y los vectores de cada chunk son idénticos a los que produce `main` con el mismo manifiesto

#### Scenario: Un valor fuera del conjunto cerrado detiene la ingesta [US-279 AC-3] [RN-22] (asumido)
- **GIVEN** `CORPUS_CHUNK_CONTEXT = resumen`
- **WHEN** se lanza la ingesta
- **THEN** termina con código distinto de cero nombrando la variable, sin leer el manifiesto ni escribir en el catálogo o en Milvus

### Requirement: Contexto determinista del documento en el texto que se embebe
Con `CORPUS_CHUNK_CONTEXT = determinista` la ingesta MUST anteponer al texto que se embebe de cada chunk un prefijo construido solo con metadatos del catálogo del corpus (título, tipo de fuente, tipo de cáncer) y la sección del chunk, sin invocar al LLM. El prefijo SHALL ser idéntico en cada reingesta del mismo documento y su longitud máxima sale de `CORPUS_CHUNK_CONTEXT_MAX_CHARS`.

#### Scenario: El prefijo lleva los metadatos del catálogo y la sección [US-279 AC-1] [RN-22] [RN-25]
- **GIVEN** un documento sintético con título, `source_type`, `cancer_type_tags` y un chunk con sección propia
- **WHEN** se ingiere con `CORPUS_CHUNK_CONTEXT = determinista`
- **THEN** el texto que reciben el codificador *dense* y el *sparse* es el prefijo seguido del texto original del chunk
- **AND** el prefijo contiene el título, el tipo de fuente, el tipo de cáncer y la sección, en ese orden
- **AND** el LLM recibe 0 llamadas para construirlo

#### Scenario: Dos ingestas del mismo documento dan el mismo prefijo [US-279 AC-1] [RN-22]
- **GIVEN** el mismo documento y la misma versión de la plantilla del prefijo
- **WHEN** se ingiere dos veces, en procesos distintos
- **THEN** el texto que se embebe de cada chunk es idéntico, byte a byte, en las dos ingestas

#### Scenario: Un metadato ausente se omite, sin texto de relleno [US-279 AC-1] [RN-25] (asumido)
- **GIVEN** un documento sin tipo de cáncer en el catálogo y un chunk cuya sección es el valor de «documento sin secciones»
- **WHEN** se ingiere con `CORPUS_CHUNK_CONTEXT = determinista`
- **THEN** el prefijo lleva solo el título y el tipo de fuente
- **AND** no contiene «No disponible» ni ningún otro texto que no venga del catálogo

#### Scenario: Un título más largo que el límite se recorta de forma estable [US-279 AC-1] [RN-22] (asumido)
- **GIVEN** un documento cuyo prefijo supera `CORPUS_CHUNK_CONTEXT_MAX_CHARS`
- **WHEN** se ingiere dos veces
- **THEN** el prefijo mide como máximo `CORPUS_CHUNK_CONTEXT_MAX_CHARS` caracteres y es el mismo en las dos ingestas

### Requirement: El contexto no forma parte del texto citable
El texto almacenado de un chunk (`chunk_text`), el que se muestra en una cita y el que se usa como premisa del NLI MUST ser el texto original del chunk copiado del corpus, sin el prefijo de contexto, con cualquier valor de `CORPUS_CHUNK_CONTEXT`. El prefijo SHALL existir solo como entrada de los codificadores *dense* y *sparse*.

#### Scenario: El chunk almacenado conserva el texto original [US-279 AC-2] [RN-04]
- **GIVEN** un documento ingerido con `CORPUS_CHUNK_CONTEXT = determinista`
- **WHEN** se lee cada chunk del almacén vectorial
- **THEN** su `chunk_text` es idéntico, byte a byte, al del mismo documento ingerido con `ninguno`
- **AND** su `chunk_id` es el mismo

#### Scenario: La cita y la premisa del NLI no llevan el prefijo [US-279 AC-2] [RN-04] [RN-01]
- **GIVEN** un índice construido con `CORPUS_CHUNK_CONTEXT = determinista` y una pregunta que recupera un chunk sobre el umbral
- **WHEN** se ejecuta `/rag/query`
- **THEN** el texto de cada cita de la respuesta es el texto original del chunk
- **AND** cada premisa que recibe el clasificador NLI es el texto original del chunk, sin el título ni el resto del prefijo

#### Scenario: Con la variante llm la frase generada tampoco se cita [US-279 AC-2] [RN-04] (asumido)
- **GIVEN** un índice construido con `CORPUS_CHUNK_CONTEXT = llm`
- **WHEN** se ejecuta `/rag/query` y la respuesta trae citas
- **THEN** ninguna cita ni premisa del NLI contiene la frase de contexto escrita por el LLM

### Requirement: La variante de contexto no cambia la regla de «sin evidencia»
Con cualquier valor de `CORPUS_CHUNK_CONTEXT`, cuando ningún chunk supera `RELEVANCE_THRESHOLD`, `/rag/query` MUST responder «sin evidencia» con `topRelevanceScore = null` sin invocar al LLM de generación (RN-02).

#### Scenario: Sin chunks sobre el umbral la respuesta sigue siendo sin evidencia [US-279 AC-6] [RN-02]
- **GIVEN** un índice construido con `CORPUS_CHUNK_CONTEXT = determinista` y una pregunta para la que ningún chunk supera `RELEVANCE_THRESHOLD`
- **WHEN** se ejecuta `/rag/query`
- **THEN** la respuesta es «sin evidencia» con `topRelevanceScore = null`
- **AND** el LLM de generación recibe 0 llamadas

### Requirement: Variante con LLM local y respaldo determinista
Con `CORPUS_CHUNK_CONTEXT = llm` la ingesta MUST pedir al LLM local una frase de contexto por chunk, a partir del texto del propio documento admitido, validar la salida contra su esquema y añadirla al prefijo determinista. Una salida inválida o un LLM no disponible SHALL dejar ese chunk con el contexto determinista, contarse en el resumen y no abortar la ingesta.

#### Scenario: El LLM local escribe una frase de contexto por chunk [US-279 AC-4] [RN-12] [RN-21]
- **GIVEN** un documento sintético admitido de 3 chunks y un LLM local que devuelve una salida válida
- **WHEN** se ingiere con `CORPUS_CHUNK_CONTEXT = llm`
- **THEN** el LLM recibe 3 llamadas, una por chunk, y cada una lleva solo metadatos y texto de ese documento
- **AND** el inicio del documento de cada llamada son sus primeros chunks, en orden, recortados a `CORPUS_CHUNK_CONTEXT_LLM_DOC_MAX_CHARS`
- **AND** el texto que se embebe de cada chunk es el prefijo determinista, la frase validada y el texto original

#### Scenario: La reindexación llm reconstruye el inicio del documento desde sus chunks [US-279 AC-4] [RN-21] (asumido)
- **GIVEN** una colección de origen con un documento de 3 chunks vigentes y `CORPUS_CHUNK_CONTEXT = llm`
- **WHEN** se ejecuta `ingest reindex-context`
- **THEN** cada llamada al LLM lleva como inicio del documento los primeros chunks vigentes de ese documento, en orden y recortados a `CORPUS_CHUNK_CONTEXT_LLM_DOC_MAX_CHARS`
- **AND** esa entrada es la misma que recibió el LLM al ingerir ese documento, sin leer ningún archivo ni fuente fuera de la colección de origen y del catálogo

#### Scenario: Una salida inválida deja el chunk con el contexto determinista [US-279 AC-4] [RN-21]
- **GIVEN** un LLM local que para el segundo chunk devuelve una salida que no cumple el esquema (no es JSON, viene vacía o supera `CORPUS_CHUNK_CONTEXT_LLM_MAX_CHARS`)
- **WHEN** se ingiere con `CORPUS_CHUNK_CONTEXT = llm`
- **THEN** el segundo chunk se embebe con el contexto determinista y los otros dos con su frase
- **AND** el resumen cuenta 1 chunk con respaldo por salida inválida
- **AND** la ingesta termina y el documento queda `embebido`

#### Scenario: Un proveedor de LLM no local detiene la variante llm [US-279 AC-4] [RN-12]
- **GIVEN** `CORPUS_CHUNK_CONTEXT = llm` y una configuración del LLM que no es local
- **WHEN** se lanza la ingesta o la reindexación
- **THEN** termina con código distinto de cero nombrando la variable que lo incumple, sin llamar a ningún LLM ni escribir en Milvus

#### Scenario: Con el LLM caído los chunks quedan con el contexto determinista [US-279 AC-4] (asumido)
- **GIVEN** `CORPUS_CHUNK_CONTEXT = llm` y el LLM local sin responder
- **WHEN** se ingiere un documento de 3 chunks
- **THEN** los 3 chunks se embeben con el contexto determinista y el documento queda `embebido`
- **AND** el resumen cuenta 3 chunks con respaldo por LLM no disponible, aparte de los de salida inválida

### Requirement: Reindexación de una variante en colección propia
El subcomando `ingest reindex-context` MUST construir el índice de la variante configurada en una colección de Milvus distinta de la de origen, con los mismos `chunk_id`, `chunk_text` y metadatos, recalculando solo los vectores de los chunks vigentes. SHALL NOT escribir en la colección de origen ni en el catálogo, y SHALL rechazar una colección cuyo nombre no corresponde a la variante.

#### Scenario: La reindexación crea chunks vigentes nuevos y no borra el histórico [US-279 AC-6] [RN-05]
- **GIVEN** una colección de origen con 4 chunks vigentes y 2 no vigentes, indexada con `ninguno`
- **WHEN** se ejecuta `ingest reindex-context` con `CORPUS_CHUNK_CONTEXT = determinista` hacia la colección de esa variante
- **THEN** la colección de destino tiene los 4 chunks con `is_current = true`, sus mismos `chunk_id` y `chunk_text`, y vectores calculados con el contexto
- **AND** los 2 no vigentes están en el destino con `is_current = false`, sin recalcular
- **AND** la colección de origen conserva sus 6 chunks sin ningún cambio y el catálogo no recibe escrituras

#### Scenario: Una colección que no corresponde a la variante se rechaza [US-279 AC-5] [RN-22] (asumido)
- **GIVEN** `CORPUS_CHUNK_CONTEXT = determinista` y `MILVUS_COLLECTION_NAME` igual al nombre de la colección de la variante `ninguno`
- **WHEN** se lanza `ingest` o `ingest reindex-context`
- **THEN** termina con código distinto de cero nombrando las dos variables, sin escribir ningún chunk

#### Scenario: Una reindexación interrumpida se reanuda sin repetir lo hecho [US-279 AC-6] (asumido)
- **GIVEN** una reindexación con `CORPUS_CHUNK_CONTEXT = llm` cortada cuando el destino ya tenía 2 de 4 chunks vigentes
- **WHEN** se relanza
- **THEN** solo se procesan los 2 chunks que faltan y el LLM recibe 2 llamadas
- **AND** el destino termina con los mismos `chunk_id` que tendría sin interrupción

#### Scenario: Milvus caído durante la reindexación termina con error sin tocar el origen [US-279 AC-6] [RN-05] (asumido)
- **GIVEN** una reindexación en curso y el almacén vectorial deja de responder al escribir
- **WHEN** falla la escritura
- **THEN** el subcomando termina con código distinto de cero informando la etapa y la clase del error, nunca su mensaje
- **AND** la colección de origen no cambia

#### Scenario: El resumen de la reindexación no lleva contenido [US-279 AC-5] (asumido)
- **GIVEN** una reindexación terminada
- **WHEN** se lee su resumen JSON
- **THEN** trae la variante, la versión de la plantilla, los recuentos de chunks leídos, reindexados, copiados y con respaldo, y la duración
- **AND** no trae texto de chunks, prefijos, frases del LLM, URLs ni mensajes de excepción
