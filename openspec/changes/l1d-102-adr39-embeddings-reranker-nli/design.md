# Design — l1d-102-adr39-embeddings-reranker-nli

## Context

US-012 · ADR-39 fase A (`[S1 resp. 6]`) fija los tres modelos que corren en CPU dentro de
`rag-orchestrator` y que fuerzan reindexar (o recalcular `relevance_score` y soporte) si cambian:
*embeddings*, *reranker* y NLI. La hipótesis principal es la combinación **A**
(BGE-M3 dense 1024 int8 con sparse propio, bge-reranker-v2-m3 int8,
mDeBERTa-v3-base-xnli-multilingual-nli-2mil7), con **B** (Qwen3-Embedding-0.6B MRL a 1024 +
Qwen3-Reranker-0.6B) y **C** (multilingual-e5-large-instruct + gte-multilingual-reranker-base)
como respaldos medidos con el mismo protocolo (`[S1 resp. 5]`). La elección sale de las cifras
(AC-2, AC-4), no de la hipótesis. **Actualización 2026-10-20 (decisión del usuario):** el *reranker* es
`BAAI/bge-reranker-v2-m3` (hipótesis A) aunque supera el presupuesto original de p95; su presupuesto se
justifica con la medición sobre chunks de 1024 tokens (`eval/configs/adr39-fase-a3.yaml`), y los topes pasan
a 30 GB de stack y 21 GB para el LLM (equipo de referencia MacBook Pro de 32 GB). El insumo (`backlog/sprints/S1-refinamiento.md` §2) no trae
latencias medidas en CPU; la única cifra medida es la del LLM (15 GB residentes, ~79 tok/s,
`[S1 resp. 10]`), que deja ~8–9 GB para el resto del stack.

Máquina (§5): Apple M5 Pro, 48 GB; los modelos se miden en el contenedor Linux arm64 de
`rag-orchestrator`, sin GPU. Descartados por licencia antes de medir: jina-embeddings v3/v4,
jina-reranker v2/v3, HHEM-2.3.

## Goals / Non-Goals

**Goals:** ADR-39 (MADR) con la fase A cerrada por cifras; mini-dataset sintético reutilizable por
US-072; script repetible; pruebas acotadas de *chunking*, solapamiento, estrategia e índice (D8); configuración con modelo, revisión, `EMBEDDING_DIM` y origen del sparse
antes de que US-059 indexe.

**Non-Goals:** pipeline y adapters de producción (US-055), runtime/LLM/OCR/p95 extremo a extremo
(US-224), PII (ADR-40), framework de evaluación (ADR-41), *fine-tuning*, híbrida (S3).

## Decisions

### D1. Una sola decisión con dos fases en un documento
`docs/architecture/adr/ADR-39-modelos-locales.md` sigue `_plantilla-madr.md`: *Context*,
*Decision Drivers* (stack ≤ 30 GB con el LLM ≤ 21 GB, p95 ≤ 15 s, licencia académica, español → inglés, reindexado),
*Considered Options* (A, B, C por componente), *Decision Outcome* por componente, *Consequences*,
y una sección "Fase B" vacía que completa el change de L1D-274 (US-224). Estado: `propuesto` hasta
que el humano lo acepte en el PR; las cifras se registran tal como se midieron (memoria del
usuario: comprobar tags, tamaños y versiones en la fuente; aquí, revisión exacta del repositorio
de Hugging Face y tamaño en disco del artefacto cuantizado).

### D2. Dónde se mide (caro de revertir: modelos)
Se mide en la imagen Linux arm64 de `rag-orchestrator` de US-034, con límites de CPU y memoria del
Compose, porque es donde correrán en producción del MVP. Si al inicio del sprint esa imagen no está
mergeada, se usa un contenedor `python:3.13-slim` arm64 con las mismas dependencias fijadas y el
mismo límite de CPU, y el ADR lo anota; la medición se repite en la imagen final solo si la versión
de ONNX Runtime o los límites cambian. Descartadas: medir en el host macOS (no representa el
contenedor) y esperar a US-034 (retrasa US-058/US-059).

### D3. Protocolo de medición
- 3 corridas, mediana; *warm-up* descartado; carga del modelo fuera del cronómetro.
- **Memoria residente:** RSS máximo del proceso con el modelo cargado y una consulta en vuelo.
- **p95 por etapa:** *embeddings* = una pregunta + resumen de contexto; *reranker* = un lote de
  `RERANKER_MAX_PAIRS` pares (20–30) truncados a `RERANKER_MAX_LENGTH` tokens; NLI = las
  afirmaciones de una opción contra sus fragmentos.
- **Métrica principal:** recall@10 y MRR (total y español → inglés) para *embeddings* (recuperación
  dense sobre los chunks de la semilla) y para el *reranker* (sobre el top-k dense del *embedding*
  elegido); exactitud sobre pares etiquetados para NLI, desglosada en mismo idioma y mezcla es/en.
- **Variantes:** int8 / ONNX como hipótesis; fp32 solo como referencia de calidad si int8 degrada.
- **Presupuestos** (los fija el ADR y se copian a `eval/configs/adr39-fase-a.yaml`):
  `STACK_MEMORY_LIMIT_GB` (30 desde 2026-10-20; antes 24), tope del LLM (`LLM_MEMORY_BUDGET_GB` 21; antes ~16 GB, `[S1 resp. 10]`) y
  `STAGE_P95_BUDGET_MS` por etapa de modo que la suma con el LLM (~10 s para 800 tokens) deje
  margen para p95 ≤ 15 s en `/platform/evidence-analyses`.

### D4. Regla de selección en funciones puras
`app/evaluation/model_selection.py`: `descartar_por_restricciones()` (AC-2),
`desempatar_por_memoria()` (AC-4) y `seleccionar_componente()` que devuelve `sin_candidato` si la lista
queda vacía (AC-5). Reciben las mediciones; sin E/S. El script orquesta carga del dataset → medición
→ selección → reporte JSON en `reports/adr39/<fecha>-fase-a.json` (agregados y configuración, sin
textos). El ADR se redacta a partir del reporte.

### D5. Sparse
Origen del sparse = el propio modelo de *embeddings* si lo trae (BGE-M3); si gana B o C, el ADR fija
otra fuente (p. ej., BM25 sobre el texto) y `SPARSE_VECTOR_SOURCE` lo refleja. El ADR anota para
US-112 que, con consultas en español sobre un corpus en inglés, el sparse aporta poco sin traducir
la consulta.

### D6. Configuración
Claves en los *settings* de `rag-orchestrator` y en `.env.example`: `EMBEDDING_MODEL`,
`EMBEDDING_MODEL_REVISION`, `EMBEDDING_DIM`, `SPARSE_VECTOR_SOURCE`, `RERANKER_MODEL`,
`RERANKER_MODEL_REVISION`, `RERANKER_MAX_PAIRS`, `RERANKER_MAX_LENGTH`, `NLI_MODEL`,
`NLI_MODEL_REVISION`, `MODEL_QUANTIZATION`, `MODEL_CACHE_DIR`; y, de D8, `CORPUS_CHUNK_SIZE`, `CORPUS_CHUNK_OVERLAP`,
`CORPUS_CHUNKING_STRATEGY`, `VECTOR_INDEX_TYPE`, `VECTOR_INDEX_PARAMS`, `CHUNK_SELECTION_MARGIN`, `INDEX_MIN_RECALL_VS_FLAT` y `DATA_CACHE_DIR`. La configuración de tests sigue con
`EMBEDDING_DIM=8` y adapters falsos (FX-06c). Un chequeo (`python -m app.scripts.adr39_measure
--check-config`) compara la configuración con el bloque de decisión del ADR (AC-3).

### D7. Criterios para elegir los modelos de *embeddings* a probar
Se aplican en dos pasos: primero los eliminatorios (son los de `descartar_por_restricciones()`, D4), después
los medidos sobre los candidatos que quedan. Mínimo 2 modelos probados (A y B; C como tercero opcional).

| # | Criterio | Tipo | Cómo se comprueba |
|---|---|---|---|
| 1 | Corre en local, sin enviar datos a la nube (RN-12) | Eliminatorio | Pesos descargables y uso offline; se excluyen las APIs de pago |
| 2 | Licencia que permite el uso académico, con versión y revisión fijadas | Eliminatorio | Licencia leída en la fuente; `EMBEDDING_MODEL_REVISION` |
| 3 | Cabe en la memoria disponible (stack ≤ 30 GB; el LLM usa hasta 21 GB, quedan ~9 GB para el resto; antes 24 y ~8–9 GB) | Eliminatorio | RSS máximo medido (D3) |
| 4 | Multilingüe, con español e inglés (consultas es contra fuentes en inglés) | Eliminatorio | Model card y recall@10 es → en |
| 5 | recall@10 y MRR, en total, por fuente, por tipo de dato y es → en | Medido | Golden test (metas: ≥ 0,80, ≥ 0,70 es → en, MRR ≥ 0,60) |
| 6 | Latencia p95 en CPU dentro del contenedor | Medido | D3 |
| 7 | Efecto de la cuantización (int8 / ONNX) sobre la calidad | Medido | fp32 solo como referencia (D3) |
| 8 | Longitud máxima de entrada frente al tamaño de chunk probado | Condicionante | Verificar en la ficha de cada modelo (tarea 1.6). Un modelo con tope bajo no se prueba con chunks que lo superen |
| 9 | Dimensión (`EMBEDDING_DIM`) y coste de almacenamiento; MRL a 1024 como variante propia | Condicionante | Dimensión declarada y verificada en una inserción de prueba en Milvus |
| 10 | Prefijo o instrucción distinta para consulta y documento | Condicionante | El golden prueba ambos formatos; el envoltorio de medición los aplica |
| 11 | *Sparse* nativo (D5) | Condicionante | Salida sparse disponible o fuente alternativa fijada en `SPARSE_VECTOR_SOURCE` |
| 12 | Soporte en arm64 (sentence-transformers o FlagEmbedding, exportación a ONNX) | Condicionante | Corre en el contenedor de D2 |

**Lo que NO es un criterio:**
- **Compatibilidad con el LLM generador.** El *embedding* no depende de él: solo convierte texto en vectores y debe ser el
  mismo al indexar y al consultar. La elección del LLM (US-224) no restringe esta.
- **Compatibilidad con Milvus.** Milvus es agnóstico al modelo. Solo se comprueban la dimensión, la métrica y el almacén
  del *sparse*.
- **Ajuste fino (*fine-tuning*).** Fuera de alcance (Non-Goals).

Los datos de cada modelo (licencia, longitud máxima, tamaño) se verifican en la fuente durante la tarea 1.6; este cuadro
no los fija.

### D8. Pruebas acotadas de *chunking*, solapamiento, estrategia e índice (T2–T5, `[S1 resp. 38]`)
Una prueba por factor, los demás fijos, en secuencia: el ganador de cada una queda fijo en la siguiente. Siempre sobre el modelo de
*embeddings* ganador de T1 (D3, D7) y el golden de `data/eval/adr39-mini/`.

| Prueba | Varía | Fijo | Decide |
|---|---|---|---|
| T2 | Tamaño de chunk: 256, 512, 1024 tokens (solo los que admite el modelo) | *embedding* de T1, 0 % de solapamiento, FLAT | `CORPUS_CHUNK_SIZE` (AC-10) |
| T3 | Solapamiento: 0 % frente a 10–15 % | tamaño de T2 | `CORPUS_CHUNK_OVERLAP` (AC-10) |
| T4 | Estrategia: tamaño fijo frente a estructura de la fuente (secciones JATS, campos del registro, encabezados de NCI) | T2 y T3 | `CORPUS_CHUNKING_STRATEGY` (AC-11) |
| T5 | Índice: HNSW frente a FLAT | todo lo anterior | `VECTOR_INDEX_TYPE`, `VECTOR_INDEX_PARAMS` (AC-12) |

- **Regla de acierto** (la misma del dataset): un chunk acierta si pertenece al documento esperado y contiene la cita (normalizando espacios y
  puntuación). `cobertura_documentos` (Q-HER2) mide cuántos de los documentos esperados aparecen en el top-k; `sin_evidencia` no tiene acierto: se
  reporta el puntaje máximo recuperado por separado, para calibrar el umbral (RN-02).
- **Métricas:** recall@10 y MRR (total, por fuente, por tipo de dato, español → inglés y controles en inglés), número de chunks, memoria del
  índice y, en T5, recall@10 respecto a FLAT y p95 de consulta. Intervalo de confianza del 95 % por *bootstrap* sobre las preguntas, con semilla fija.
- **Decisión** (función pura `seleccionar_variante()`, junto a la regla de D4): gana la de mayor recall@10 si la diferencia supera
  `CHUNK_SELECTION_MARGIN`; si no, la de menos chunks; si también empatan, la más simple (tamaño fijo, 0 % de solapamiento).
- **Tokens:** se cuentan con el *tokenizer* del modelo elegido. Las variantes por encima de su longitud máxima de entrada se omiten y el reporte lo anota
  (D7, criterio 8).
- **Fuentes:** no se versionan. `adr39_fetch_sources` descarga cada documento del manifiesto (PMC: JATS por la API de Europe PMC; ClinicalTrials.gov:
  API v2; NCI: HTML) a `DATA_CACHE_DIR`, registra su SHA-256 y **falla si una cita del golden no aparece** (AC-13). La atribución a NCI y NLM viaja con el manifiesto.
- **Estructura (T4):** JATS por secciones, ClinicalTrials.gov por campos (resumen, elegibilidad, resultados), NCI por encabezados; texto sin estructura cae a
  tamaño fijo. Los chunks conservan `section`.
- **Milvus:** el del Compose de US-034, en una colección de prueba temporal (nunca `corpus_chunks`); si aún no está, standalone provisional como en D2. Con el
  tamaño del corpus semilla T5 solo verifica que HNSW no pierde recall frente a FLAT; no mide calidad (AC-12).
- **Unidad:** `CORPUS_CHUNK_SIZE` y `CORPUS_CHUNK_OVERLAP` se expresan en **tokens** del *tokenizer* del modelo elegido (las claves ya las define L1D-115). Hoy
  `fragmentar()` de L1D-115 corta por caracteres: al cerrar T2–T3 debe pasar a tokens o convertir la unidad (aviso en su change).
- **Alcance:** las variantes viven en `app/evaluation/chunking_variants.py`. El *chunker* de producción (`chunking.py` de US-059) adopta la ganadora; este
  change no lo implementa.
- **Salida:** `reports/adr39/<fecha>-fase-a2.json` (agregados y configuración, sin textos), sección "Chunking e índice" del ADR y las claves de D6.

## Privacidad y ownership

- Ningún dato clínico cruza fronteras: el change solo trabaja en `rag-orchestrator` con el
  mini-dataset sintético y los documentos públicos de la semilla. No hay tráfico web →
  `clinical-api` → `rag-orchestrator`.
- `rag-orchestrator` no toca datos clínicos ni `clinical-minio`; el script no abre conexiones a
  PostgreSQL clínico, solo lee archivos de `data/eval/` y `data/raw/seed/`.
- RN-13/RN-14: preguntas y pares 100 % sintéticos, sin identificadores de paciente; manifiesto con
  `clase: sintetico`; el script se niega a cargar un dataset sin esa marca.
- RN-12: los modelos corren locales; la descarga de pesos (Hugging Face) es de artefactos públicos,
  sin enviar datos. Pesos fuera del repo (`MODEL_CACHE_DIR`, volumen).
- RN-21: cada fuente del mini-dataset con licencia aceptada (ADR-36); NCCN/ESMO no aparecen.
- *Logs* y reporte sin textos de preguntas ni de fragmentos.

## Contratos

Sin cambios. `apps/rag-orchestrator/openapi.yaml` ya declara `meta.embeddingModel`,
`meta.rerankerModel` y `meta.nliModel` en la respuesta de `/rag/query`; sus valores saldrán de esta
configuración cuando US-055 implemente los adapters reales. Ningún ejemplo de `contracts/examples/`
cambia. Compatible con ADR-26.

## Evaluación

Cambia modelos (los selecciona), así que aplica OL-06 en su forma mínima: recall@10 (meta ≥ 0,80;
≥ 0,70 es → en), MRR (≥ 0,60) y exactitud NLI sobre el mini-dataset, medidos por el propio script.
La suite `evaluate` completa llega con US-072 (S2) y reutiliza `data/eval/adr39-mini/`; hasta
entonces, `ai-eval-runner` revisa el reporte del script como evidencia del Gate 2.

## Dependencias y colaboradores

- Crea: `app/scripts/adr39_measure.py` (orquestación, CLI), `app/evaluation/model_selection.py`
  (reglas puras), `app/evaluation/dataset_loader.py` (validación de manifiesto y tamaños),
  `eval/configs/adr39-fase-a.yaml`.
- El script usa los modelos a través de envoltorios de medición propios del script (no los
  adapters de producción de US-055) para no adelantar su diseño; las reglas de selección no
  dependen de ninguna librería de modelos.
- Lee: `data/eval/adr39-mini/manifest.yaml` (fuentes y licencias) y `golden.yaml` (citas). Crea además `app/scripts/adr39_fetch_sources.py`, `app/evaluation/chunking_variants.py`, `app/evaluation/retrieval_metrics.py` y `eval/configs/adr39-fase-a2.yaml`.

## Risks / Trade-offs

- **Manifiesto de la semilla tardío** → etiquetar contra los `external_id` previstos en ADR-36 y
  validar al llegar el manifiesto; el chequeo de etiquetas falla si alguno no existe.
- **Latencia del *reranker*** (estimada 1–2 s int8 para 20–30 pares) es el segundo cuello de
  botella; palancas: truncado, menos pares, B como respaldo.
- **NLI multilingüe débil en mezcla es/en** → el ADR registra la exactitud por idioma; si no
  alcanza, se anota para US-063/US-064 (traducir la afirmación o el fragmento).
- **Mini-dataset pequeño (≥ 30; hoy 75)**: métricas con alta varianza; el ADR lo declara y US-072 amplía.
- **Corpus de 39 documentos** (T4–T5): HNSW y FLAT no discriminan y los intervalos de confianza son amplios → se prefiere la variante más barata y T5 es la primera candidata a salir si la capacidad falta.
- **Descarga externa** (Europe PMC, ClinicalTrials.gov, cancer.gov): el contenido de NCI y de los registros se actualiza; el SHA-256 detecta el cambio y la medición usa la caché.
- **Modelos de entrada corta** (p. ej. 512 tokens): no admiten chunks de 1024; se omite esa variante y se anota.

## Migration Plan

No hay datos que migrar: la colección se crea con su esquema final en US-058 usando
`EMBEDDING_DIM` de esta configuración.

## Open Questions

- ¿Se acepta medir en un contenedor arm64 provisional si la imagen de US-034 no está lista (D2)?
- ~~¿El mini-dataset se etiqueta contra el manifiesto final de US-059 o contra los `external_id` de ADR-36?~~ **Resuelta:**
  el dataset trae su propio manifiesto y etiqueta por documento y cita literal; el manifiesto de L1D-115 podrá derivar de él.
