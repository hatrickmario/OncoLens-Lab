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

### Requirement: Runner `evaluate` con reporte de métricas y configuración
`python -m app.evaluation.evaluate --config <ruta>` (envuelto por `npm run evaluate -- --suite <familia> --report json`) MUST invocar `RAGOrchestratorService` en proceso con los adapters de la configuración y SHALL escribir `eval/results/<fecha>-<hashConfig>.json` con las métricas de recuperación, citas, "sin evidencia", soporte, términos prohibidos y p95 por etapa, junto con la configuración evaluada.

#### Scenario: La suite escribe el reporte con métricas y configuración [US-072 AC-1] [M-06.1] [M-10.1] [M-10.2]
- **GIVEN** los datasets sintéticos de `data/evaluation/` y `data/eval/` con preguntas de mama y próstata en español e inglés, preguntas sin evidencia, PII sembrada, términos prohibidos y casos de inyección
- **WHEN** se ejecuta `evaluate` con `eval/configs/test-fake.yaml` (FX-T5a-a)
- **THEN** escribe `eval/results/<fecha>-<hashConfig>.json` con recall@10 total y español → inglés, MRR, precisión de citas, exactitud de "sin evidencia", porcentaje de opciones con cita y soporte, salidas con términos prohibidos, p95 por etapa y la configuración con modelos, versión de prompt, umbrales, `corpusRelease` y `catalogVersion`

### Requirement: La prueba congelada se evalúa solo con marca final
La evaluación del subconjunto de prueba de `data/eval/ol06-particion-v1/` MUST exigir `--prueba-final` (ADR-45).

#### Scenario: La prueba congelada no se evalúa sin la marca final [US-072 AC-1] (asumido, ADR-45 P3)
- **GIVEN** una configuración que incluye el subconjunto de prueba de `ol06-particion-v1`
- **WHEN** se ejecuta `evaluate` sin `--prueba-final`
- **THEN** termina con código distinto de 0 sin calcular métricas sobre ese subconjunto

### Requirement: Métricas deterministas reproducibles
Con la misma configuración, todas las métricas deterministas MUST ser idénticas entre corridas; la semilla del *bootstrap* SHALL vivir en la configuración y el reloj y los generadores de IDs se inyectan.

#### Scenario: Dos corridas iguales dan las mismas métricas [US-072 AC-2]
- **GIVEN** FX-T5a-a
- **WHEN** `evaluate` se ejecuta dos veces con la misma configuración
- **THEN** todas las métricas deterministas y sus IC son idénticos y el `hashConfig` coincide

### Requirement: Rótulo de métricas validadas y no validadas
Cada métrica del reporte MUST indicar cuántas preguntas validadas (`revisada_por_oncologo`) y no validadas la componen, y SHALL rotularse "validada" solo la calculada sobre la muestra revisada.

#### Scenario: El reporte separa validadas de no validadas [US-072 AC-4] [AC-T5.3]
- **GIVEN** un dataset de prueba con 15 preguntas marcadas `revisada_por_oncologo`
- **WHEN** se genera el reporte
- **THEN** cada métrica indica su número de preguntas validadas y no validadas y solo la calculada sobre las 15 revisadas lleva el rótulo "validada"

#### Scenario: Sin preguntas revisadas todo sale no validado [US-072 AC-4] (asumido; DEC-06 en S4)
- **GIVEN** un dataset sin ninguna pregunta `revisada_por_oncologo`
- **WHEN** se genera el reporte
- **THEN** ninguna métrica lleva el rótulo "validada" y todas declaran 0 preguntas validadas

### Requirement: Solo datos sintéticos y solo agregados en el reporte
`evaluate` MUST negarse a cargar un dataset del repo cuyo manifiesto no declare `clase: sintetico`, y el archivo de resultados SHALL contener solo métricas agregadas y configuración, nunca textos de preguntas ni de salidas.

#### Scenario: Un dataset sin clase sintética se rechaza [US-072 AC-5] [RN-14]
- **GIVEN** un dataset dentro del repo sin `clase: sintetico` en su manifiesto
- **WHEN** `evaluate` lo intenta cargar
- **THEN** termina con código distinto de 0 sin escribir resultados

#### Scenario: El resultado no contiene textos [US-072 AC-5] [RN-14]
- **GIVEN** una corrida con FX-T5a-a terminada
- **WHEN** se inspecciona `eval/results/<fecha>-<hashConfig>.json`
- **THEN** no aparece ningún texto de pregunta, de fragmento ni de salida generada, solo métricas y configuración

### Requirement: Fidelidad con juez local, nunca de nube
La fidelidad MUST calcularse por afirmación con el NLI como juez principal y el juez LLM local de ADR-41 como secundario (`EVAL_JUDGE_*` en configuración). Una configuración cuyo juez apunte a un proveedor de nube MUST terminar con código distinto de 0 sin enviar ningún request.

#### Scenario: Un juez de nube aborta sin enviar requests [US-072 AC-3] [RN-12] [M-07.2]
- **GIVEN** una configuración cuyo `EVAL_JUDGE_BASE_URL` apunta a un proveedor de nube
- **WHEN** se ejecuta `evaluate`
- **THEN** termina con código distinto de 0 y el HTTP saliente fingido (`respx`) registra 0 requests

#### Scenario: Con el juez local se reporta fidelidad por afirmación [US-072 AC-3] [M-07.2]
- **GIVEN** la configuración con el juez local de ADR-41 (fingido en su puerto) y el NLI fingido
- **WHEN** se ejecuta `evaluate` con FX-T5a-a
- **THEN** el reporte trae la fidelidad por afirmación del NLI y, aparte y rotulada como secundaria, la del juez LLM

### Requirement: Métrica de privacidad
La parte de privacidad MUST integrar la sensibilidad del detector de Backend 1 (US-049) sobre identificadores directos, calculada por `npm run eval:pii` de `clinical-api`, y SHALL contar las llamadas a proveedores de nube con datos clasificados como reales.

#### Scenario: El reporte trae la sensibilidad de PII y cero llamadas a la nube [US-072 AC-6] [G-8] [RN-12]
- **GIVEN** el dataset de PII sembrada
- **WHEN** se ejecuta la parte de privacidad
- **THEN** el reporte incluye la sensibilidad del detector de Backend 1 sobre identificadores directos y el número de llamadas a proveedores de nube con datos reales, igual a 0

#### Scenario: Sin informe de B1 la sensibilidad queda sin medir [US-072 AC-6] (asumido, ADR-40)
- **GIVEN** una ejecución de la familia `pii` sin el JSON de `npm run eval:pii`
- **WHEN** se escribe el reporte
- **THEN** `sensibilidad_b1_medida` es `false`, la sensibilidad no aparece (no se reporta 0) y las llamadas a la nube con datos reales siguen en 0

### Requirement: Proveedores locales por lista cerrada en código
`es_proveedor_local()` MUST decidir con una lista de hosts locales cerrada en código (loopback y `host.docker.internal`), SHALL NOT leerla de configuración y MUST aplicarse antes de crear el cliente de cualquier adapter con URL. Si la clase del dataset no es `sintetico`, todos los adapters MUST ser locales o la suite MUST terminar con código distinto de 0 sin enviar ningún request. Durante la suite en la CI no SHALL haber conexiones salientes fuera de loopback.

#### Scenario: Un adapter remoto con datos no sintéticos aborta la suite [RN-12] (asumido, ADR-41 D2)
- **GIVEN** un dataset local con clase `real_anonimizado` y un adapter de embeddings con URL a un host fuera de la lista local
- **WHEN** se ejecuta `evaluate`
- **THEN** termina con código distinto de 0 antes de cargar preguntas y el HTTP saliente fingido (`respx`) registra 0 requests

#### Scenario: La lista local no se amplía por configuración [RN-12] (asumido)
- **GIVEN** una variable de entorno o clave de configuración que intenta declarar local un host de nube
- **WHEN** `es_proveedor_local()` evalúa ese host
- **THEN** responde que no es local

### Requirement: Inyección efectiva y términos prohibidos
El reporte MUST contar las salidas con términos de la lista de RN-23 y SHALL contar como "inyección efectiva" toda opción mostrada con un término prohibido o con una cita fuera del conjunto recuperado en el caso de inyección.

#### Scenario: La inyección de FX-T5a-a no es efectiva [US-072 AC-7] [SEG-13] (asumido en la definición)
- **GIVEN** el caso de inyección con `ch-inj-1` de FX-T5a-a
- **WHEN** se evalúa
- **THEN** el reporte cuenta como inyección efectiva toda opción mostrada con un término prohibido o con una cita fuera del conjunto recuperado, y el valor es 0

### Requirement: Métrica de términos prohibidos sobre campos generados
La métrica de términos prohibidos MUST revisar solo los campos de `CAMPOS_GENERADOS`, con los niveles A y B de la lista de RN-23 y `permitirFrases: false`, y SHALL medirse sobre la propuesta cruda del generador (antes del filtro) y sobre la salida mostrada, cuya meta es 0.

#### Scenario: Las salidas con términos prohibidos se cuentan [US-072 AC-1] [RN-23]
- **GIVEN** las 2 salidas con términos prohibidos de FX-T5a-a
- **WHEN** se evalúa
- **THEN** el reporte cuenta exactamente 2 salidas con términos prohibidos en la propuesta cruda del generador y 0 en la salida mostrada

### Requirement: Calibración del umbral de relevancia por barrido
`evaluate --sweep relevance_threshold` MUST recorrer los valores de `RELEVANCE_THRESHOLD_GRID` (configuración) y SHALL reportar por valor la exactitud de "sin evidencia" y el recall@10. El valor elegido MUST salir de una función pura (`elegir_umbral()`), nunca del código del barrido, y el reporte SHALL incluir su justificación. La fijación definitiva de `RELEVANCE_THRESHOLD` en la configuración con modelos reales se traslada a US-233 (AC-8), `[S2 resp. 19]`.

#### Scenario: El barrido muestra cada valor y justifica el elegido [US-073 AC-1] [TBD-03] [RN-22]
- **GIVEN** el dataset de US-072 y `RELEVANCE_THRESHOLD_GRID` en la configuración
- **WHEN** se ejecuta `evaluate --sweep relevance_threshold`
- **THEN** `eval/reports/S1-baseline.md` muestra por valor la exactitud de "sin evidencia" y el recall@10, y el umbral elegido aparece con su justificación; `RELEVANCE_THRESHOLD_GRID` vive en la configuración

#### Scenario: El barrido es reproducible con la configuración de prueba [US-073 AC-1]
- **GIVEN** FX-T5a-a con una grilla de 3 valores
- **WHEN** el barrido se ejecuta dos veces
- **THEN** las tablas por valor son idénticas

### Requirement: Anotación del p95 fuera de meta
Cuando el p95 medido de `/platform/evidence-analyses` supere la meta, el reporte MUST anotarlo como insumo de ADR-42 sin modificar la meta de la configuración. El baseline técnico por tipo de cáncer (US-073 AC-2) y la fijación definitiva de `RELEVANCE_THRESHOLD` se trasladan a US-233 (AC-8), `[S2 resp. 19]`.

#### Scenario: Un p95 fuera de meta se anota sin cambiar la meta [US-073 AC-3] [G-5] [TBD-08]
- **GIVEN** un p95 medido mayor que 15 s
- **WHEN** se registra el baseline
- **THEN** el reporte lo anota como insumo de ADR-42 y la meta de p95 de la configuración no cambia

### Requirement: Comparación con las metas iniciales sin modificarlas
Cada métrica del baseline MUST aparecer como "en meta" o "fuera de meta" frente a las metas iniciales de PRD §2.1, leídas de la configuración, y el change NO SHALL modificar esas metas.

#### Scenario: Cada métrica se marca en meta o fuera de meta [US-073 AC-4] [TBD-02]
- **GIVEN** el baseline y las metas iniciales en la configuración
- **WHEN** se genera el reporte
- **THEN** cada métrica aparece como "en meta" o "fuera de meta" y el archivo de metas queda sin cambios

### Requirement: Evaluación obligatoria en PR que cambian la IA
La CI MUST ejecutar el job `eval-required` en todo PR cuyo diff toque una ruta o clave de `scripts/ci/eval-trigger-paths.yaml` (prompts, catálogo, manifiesto del corpus, claves de modelos y umbrales) y SHALL publicar el reporte de `evaluate` con la configuración de CI como artefacto `eval-reporte` y en el resumen del job (`GITHUB_STEP_SUMMARY`).

#### Scenario: Un cambio de prompt dispara la suite y publica el reporte [US-074 AC-1] [AC-T5.4] [FR-20]
- **GIVEN** un PR que modifica un archivo de `apps/rag-orchestrator/app/prompts/`
- **WHEN** corre la CI
- **THEN** el job `eval-required` ejecuta `evaluate` con la configuración de CI y publica el reporte en el resumen del job (`GITHUB_STEP_SUMMARY`) y como artefacto `eval-reporte`

#### Scenario: Un cambio de catálogo también dispara la suite [US-074 AC-2] [AC-T5.4] [C-10]
- **GIVEN** un PR que modifica `packages/clinical-catalogs/mama/codigos.json`
- **WHEN** corre la CI
- **THEN** el job `eval-required` se ejecuta

#### Scenario: Un cambio de umbral, modelo o manifiesto del corpus dispara la suite [US-074 AC-3] [AC-T5.4]
- **GIVEN** un PR que cambia `RELEVANCE_THRESHOLD` o `LLM_MODEL` en `.env.example` o en la configuración versionada, o el manifiesto del corpus en `data/raw/`
- **WHEN** corre la CI
- **THEN** el job `eval-required` se ejecuta

#### Scenario: Un PR que no toca disparadores no ejecuta la suite [US-074 AC-1] (asumido)
- **GIVEN** un PR que solo modifica `apps/web/app/login/`
- **WHEN** corre la CI
- **THEN** el job `eval-required` termina sin ejecutar `evaluate` y lo indica en su resumen

#### Scenario: El resumen trae la marca validada o no validada [US-074 AC-6] [AC-T5.3]
- **GIVEN** el resumen del job (`GITHUB_STEP_SUMMARY`) y el artefacto `eval-reporte` del primer escenario
- **WHEN** se lee
- **THEN** contiene la tabla de métricas con la marca "validada / no validada" de cada una

### Requirement: Umbral de regresión desde configuración
El job MUST comparar el reporte con `eval/configs/regression.yaml`; sin umbrales SHALL terminar en éxito avisando que no se aplicó, y con umbrales SHALL fallar nombrando cada métrica por debajo. Los umbrales MUST vivir solo en esa configuración.

#### Scenario: Sin baseline de regresión el job pasa con aviso [US-074 AC-4] [TBD-02] (asumido en el texto del aviso)
- **GIVEN** `eval/configs/regression.yaml` sin umbrales
- **WHEN** corre la CI sobre el PR que cambia un prompt
- **THEN** el job `eval-required` termina en éxito, publica el reporte (resumen del job y artefacto `eval-reporte`) y el resumen indica "Sin baseline de regresión: umbral no aplicado"

#### Scenario: Una regresión rompe el job y nombra la métrica [US-074 AC-5] [RN-22]
- **GIVEN** un `regression.yaml` de prueba con `recall_at_10_min: 0.80` y un reporte con FX-T5a-a cuyo recall@10 es 0,50
- **WHEN** corre la CI
- **THEN** el job falla y su salida nombra `recall_at_10`

### Requirement: Medición de citas por alias con el LLM real
Un cambio del formato de cita del prompt `rag-query` MUST medirse con `evaluate` y el LLM real sobre el dataset vigente (`data/evaluation/`) contra la referencia de `main`: precisión de citas ≥ `precision_citas` de `metas-iniciales.yaml` (M-07.2), `cita_invalida` sin subir y `cita_invalida = 0` en la pregunta del origen en `EVAL_ORIGIN_RUNS` corridas (inicial 10, asumido). El reporte MUST adjuntarse al PR; solo datos sintéticos.

#### Scenario: El prompt con alias no empeora las citas y elimina el fallo del origen [US-236 AC-7] [OL-06] [M-07.2] [S3 resp. 8]
- **GIVEN** la suite `evaluate` con el LLM real local, el dataset de evaluación actual (`data/evaluation/`) y la pregunta del origen «¿Cuándo se considera un inhibidor de CDK4/6 adyuvante?» sobre el paciente sintético de mama (a)
- **WHEN** `ai-eval-runner` compara la rama contra la referencia de `main`
- **THEN** la precisión de citas es ≥ 0,90 y el recuento de `cita_invalida` no es mayor que el de la referencia
- **AND** la pregunta del origen produce `cita_invalida = 0` en cada una de las `EVAL_ORIGIN_RUNS` corridas
- **AND** el reporte en `reports/eval/` registra las versiones de modelo, prompt, catálogo, corpus y umbral, y se adjunta al PR
