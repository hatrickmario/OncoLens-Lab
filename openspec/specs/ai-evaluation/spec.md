# ai-evaluation Specification

## Purpose
Fija cómo se eligen, miden y configuran los modelos locales de recuperación y verificación (embeddings, reranker, NLI), el chunking y el índice vectorial, con los valores de ADR-39 como única fuente de configuración (RN-22) y su evidencia de medición reproducible.

## Requirements

### Requirement: Medición repetible de modelos de recuperación y verificación
El script `app.scripts.adr39_measure` MUST medir cada candidato de *embeddings*, *reranker* y NLI con 3 corridas y mediana sobre `data/eval/adr39-mini/` y SHALL registrar por candidato memoria residente, p95 de su etapa en CPU, licencia, versión exacta y métrica principal. El reporte SHALL contener solo agregados y configuración, sin textos de preguntas ni fragmentos.

#### Scenario: El ADR registra cada candidato medido [US-012 AC-1]
- **GIVEN** los candidatos A, B y C de *embeddings*, *reranker* y NLI en `eval/configs/adr39-fase-a.yaml` y el mini-dataset `data/eval/adr39-mini/`
- **WHEN** se ejecuta el script con 3 corridas
- **THEN** el reporte y `docs/architecture/adr/ADR-39-modelos-locales.md` (MADR) contienen por candidato memoria residente, p95 de su etapa en CPU, licencia, versión exacta, recall@10 y MRR total y español → inglés (*embeddings* y *reranker*) o exactitud sobre pares etiquetados (NLI), como mediana de las 3 corridas

### Requirement: Regla de selección con restricciones duras
La selección MUST descartar todo candidato que incumpla una restricción dura (memoria total con el presupuesto del LLM mayor que `STACK_MEMORY_LIMIT_GB`, p95 de etapa mayor que `STAGE_P95_BUDGET_MS.<etapa>`, licencia fuera de `ACADEMIC_LICENSES`), SHALL desempatar por menor memoria y SHALL declarar "ningún candidato cumple" sin elegir uno que incumpla. Los valores los fija el ADR-39 en configuración (RN-22).

#### Scenario: Un candidato que incumple una restricción dura queda descartado con su cifra [US-012 AC-2]
- **GIVEN** un candidato cuya memoria residente sumada al presupuesto del LLM supera `STACK_MEMORY_LIMIT_GB`, o cuyo p95 de etapa supera `STAGE_P95_BUDGET_MS` de esa etapa, o cuya licencia no está en `ACADEMIC_LICENSES`
- **WHEN** la selección lo evalúa
- **THEN** queda descartado aunque tenga la mejor métrica principal, y el reporte y el ADR anotan el motivo y la cifra medida

#### Scenario: El empate se resuelve por menor memoria [US-012 AC-4]
- **GIVEN** dos candidatos válidos del mismo componente con la misma métrica principal
- **WHEN** la selección decide
- **THEN** gana el de menor memoria residente y el ADR registra esa justificación

#### Scenario: Ningún candidato cumple y se escala [US-012 AC-5]
- **GIVEN** que todos los candidatos de un componente incumplen alguna restricción dura
- **WHEN** se agota la lista
- **THEN** la selección no elige ningún modelo para ese componente, el script termina con código distinto de 0 y el ADR declara el componente sin candidato y escala al usuario el ajuste de metas (G-5 / NFR-01) (asumido; aceptado `[S1 resp. 3]`)

### Requirement: Modelos de recuperación fijados en configuración antes de indexar
Al cerrar la fase A, la configuración de `rag-orchestrator` MUST fijar `EMBEDDING_MODEL`, `EMBEDDING_MODEL_REVISION`, `EMBEDDING_DIM`, `SPARSE_VECTOR_SOURCE`, `RERANKER_MODEL`, `RERANKER_MODEL_REVISION` y `NLI_MODEL`, `NLI_MODEL_REVISION` con los valores elegidos en ADR-39, y esos valores SHALL coincidir con los del ADR. El valor numérico de la dimensión SHALL vivir solo en la configuración y el ADR, nunca en `docs/architecture/data-model.md`.

#### Scenario: Dimensión y sparse fijados antes de la indexación de la semilla [US-012 AC-3]
- **GIVEN** el ADR-39 con la fase A cerrada
- **WHEN** se comprueba la configuración antes de que US-059 indexe el corpus semilla
- **THEN** `EMBEDDING_DIM` y `SPARSE_VECTOR_SOURCE` tienen valor, coinciden con el modelo y el origen del sparse que fija el ADR, y la verificación de configuración falla si alguno falta o difiere del ADR

#### Scenario: La dimensión no se escribe en el modelo de datos [US-012 AC-3]
- **GIVEN** la configuración con `EMBEDDING_DIM` fijado
- **WHEN** se revisa `docs/architecture/data-model.md`
- **THEN** `corpus_chunks.dense_vector` sigue declarado con `EMBEDDING_DIM` sin literal numérico y remite a ADR-39

### Requirement: Mini-dataset sintético de selección de modelos
`data/eval/adr39-mini/` MUST contener ≥ 30 preguntas sintéticas (≥ 10 en español contra fuentes en inglés) etiquetadas con documento y cita literal de las fuentes de su manifiesto y ≥ 30 pares afirmación–fragmento etiquetados para NLI, con un manifiesto que declara `clase: sintetico` y la licencia de cada fuente. SHALL ser reutilizable por `evaluate` (US-072) y nunca SHALL contener datos reales ni identificadores de paciente (RN-13, RN-14).

#### Scenario: El mini-dataset cumple tamaño, idioma y manifiesto [US-012 AC-9]
- **GIVEN** `data/eval/adr39-mini/`
- **WHEN** el validador del dataset lo inspecciona
- **THEN** hay ≥ 30 preguntas con ≥ 10 en español etiquetadas contra documentos en inglés, cada pregunta con respuesta trae documento y cita literal de una fuente del manifiesto del dataset, hay ≥ 30 pares NLI etiquetados, y el manifiesto declara `clase: sintetico` y una licencia aceptada (RN-21) o unos términos de reutilización verificados (NCI, NLM) por fuente

#### Scenario: Un dataset sin clase sintética se rechaza [US-012 AC-9]
- **GIVEN** una copia del manifiesto sin `clase: sintetico`, o con una fuente sin licencia
- **WHEN** el script de medición intenta cargar el dataset
- **THEN** termina con código distinto de 0 sin medir ningún candidato

### Requirement: Pruebas acotadas de *chunking*, solapamiento, estrategia e índice
La medición MUST variar un solo factor por prueba (tamaño de chunk, solapamiento, estrategia, índice), fijando los demás, y SHALL calificar un acierto cuando un chunk del documento esperado contiene la cita. El reporte SHALL incluir recall@10 y MRR (total, por fuente, por tipo de dato, español → inglés y controles en inglés), número de chunks y memoria del índice, con intervalo de confianza. Si la mejora no supera `CHUNK_SELECTION_MARGIN`, MUST ganar la variante con menos chunks.

#### Scenario: Tamaño y solapamiento de chunk fijados por medición [US-012 AC-10]
- **GIVEN** el modelo de *embeddings* elegido, el golden y las fuentes descargadas con checksum
- **WHEN** se mide el tamaño de chunk en {256, 512, 1024} tokens (los que admite el modelo) y después el solapamiento en {0 %, 10–15 %}, variando un solo factor
- **THEN** el ADR registra las métricas por variante y fija `CORPUS_CHUNK_SIZE` y `CORPUS_CHUNK_OVERLAP`; si la mejora de recall@10 no supera `CHUNK_SELECTION_MARGIN`, la elegida es la de menos chunks, y las variantes por encima de la longitud máxima del modelo constan como omitidas

#### Scenario: Estrategia de *chunking* fijada por medición [US-012 AC-11]
- **GIVEN** el tamaño y el solapamiento del escenario anterior
- **WHEN** se compara el *chunking* de tamaño fijo con el que respeta la estructura de la fuente (secciones JATS, campos del registro, encabezados de NCI)
- **THEN** el ADR fija `CORPUS_CHUNKING_STRATEGY` con las mismas métricas y el mismo criterio de desempate, y el texto sin estructura cae a tamaño fijo

#### Scenario: HNSW se acepta solo si no pierde recall frente a FLAT [US-012 AC-12]
- **GIVEN** el *chunking* elegido y una colección de prueba temporal en Milvus
- **WHEN** se compara el índice HNSW con la búsqueda exacta FLAT
- **THEN** el ADR registra el recall@10 de HNSW respecto a FLAT y su p95, fija `VECTOR_INDEX_TYPE` y `VECTOR_INDEX_PARAMS`, y mantiene FLAT si el recall de HNSW queda por debajo de `INDEX_MIN_RECALL_VS_FLAT`

### Requirement: Fuentes reproducibles y preguntas sin respuesta
Los textos de las fuentes NO SHALL versionarse. El script MUST descargar cada documento del manifiesto, registrar su SHA-256 y terminar con código distinto de 0 si una cita del golden no aparece en su documento. El reporte SHALL separar el puntaje máximo recuperado en las preguntas sin respuesta.

#### Scenario: Una cita que no aparece en su documento detiene la medición [US-012 AC-13]
- **GIVEN** el manifiesto y el golden, con una cita que no está en el texto descargado de su documento
- **WHEN** se prepara la medición
- **THEN** el script termina con código distinto de 0 sin medir, e indica el documento y la pregunta

#### Scenario: Las preguntas sin respuesta se reportan aparte [US-012 AC-13]
- **GIVEN** preguntas con `modo_acierto: sin_evidencia`
- **WHEN** se ejecuta la medición
- **THEN** no cuentan como acierto ni como fallo en recall@10, y el reporte incluye por separado el puntaje máximo recuperado para calibrar el umbral (RN-02)
