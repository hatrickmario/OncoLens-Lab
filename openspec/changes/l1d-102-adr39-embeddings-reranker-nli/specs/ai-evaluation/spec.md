## ADDED Requirements

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
`data/eval/adr39-mini/` MUST contener ≥ 30 preguntas sintéticas (≥ 10 en español contra fuentes en inglés) etiquetadas contra la semilla de US-059 y ≥ 30 pares afirmación–fragmento etiquetados para NLI, con un manifiesto que declara `clase: sintetico` y la licencia de cada fuente. SHALL ser reutilizable por `evaluate` (US-072) y nunca SHALL contener datos reales ni identificadores de paciente (RN-13, RN-14).

#### Scenario: El mini-dataset cumple tamaño, idioma y manifiesto [US-012 AC-9]
- **GIVEN** `data/eval/adr39-mini/`
- **WHEN** el validador del dataset lo inspecciona
- **THEN** hay ≥ 30 preguntas con ≥ 10 en español etiquetadas contra documentos en inglés, cada etiqueta apunta a un documento de `data/raw/seed/manifest.yaml`, hay ≥ 30 pares NLI etiquetados, y el manifiesto declara `clase: sintetico` y una licencia aceptada (RN-21) por fuente

#### Scenario: Un dataset sin clase sintética se rechaza [US-012 AC-9]
- **GIVEN** una copia del manifiesto sin `clase: sintetico`, o con una fuente sin licencia
- **WHEN** el script de medición intenta cargar el dataset
- **THEN** termina con código distinto de 0 sin medir ningún candidato
