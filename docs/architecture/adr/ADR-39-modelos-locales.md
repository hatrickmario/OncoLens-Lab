# ADR-39 — Modelos locales de recuperación y verificación: BGE-M3 int8, gte-multilingual-reranker int8 y mDeBERTa fp32, con chunks de 1024 tokens

> Linear: [L1D-102](https://linear.app/l1der-lab-mjbc/issue/L1D-102) · Historia: US-012 (fase A) · Feature: FEAT-06a
> Plantilla: MADR 4 (variante mínima, en español). La **fase B** (runtime, LLM, OCR, p95 extremo a extremo) es del change de L1D-274 (US-224).

- **Estado:** propuesto (lo acepta el humano en el PR; ver "Puntos que decide el humano")
- **Fecha:** 2026-10-16
- **Decisores:** usuario (propietario del producto); oncólogo asesor para el dataset
- **Consultados / informados:** ai-services-dev (mediciones), ai-eval-runner (revisión de reportes en el Gate 2)
- **Requisitos:** IA-01, NFR-01, NFR-05, TBD-01, RN-12, RN-13, RN-14, RN-21, RN-22; US-012 AC-1 a AC-5 y AC-9 a AC-13

## Contexto y problema

Cambiar el modelo de *embeddings* obliga a reindexar Milvus; cambiar el *reranker* o el NLI obliga a recalcular `relevance_score` y el soporte de las citas. US-055, US-058 y US-059 necesitan modelo, dimensión (`EMBEDDING_DIM`), origen del *sparse*, tamaño de chunk e índice fijados **antes** de indexar. La hipótesis de partida (A, `[S1 resp. 5]`) salía de una investigación externa sin latencias medidas en CPU; esta decisión sale de cifras medidas.

**Cómo se midió** (todo en `reports/adr39/2026-10-16-fase-a.json` y `-fase-a2.json`, solo agregados):

- **Dónde:** contenedor provisional Linux arm64 (`python:3.13-slim`, 8 vCPU, sin GPU, 7 GB de RAM; D2 de design.md) porque la imagen de `rag-orchestrator` de L1D-164 aún no está mergeada; se debe repetir si cambian ONNX Runtime o los límites del Compose. Host: Apple M5 Pro, 48 GB; Docker Desktop con 7,75 GB para la VM.
- **Runtime:** ONNX Runtime 1.31.0 (CPU, 8 hilos). Los candidatos se exportan a ONNX fp32 con el exportador basado en `torch.export` (transformers 5.20.0, torch 2.14.1; `gte` con transformers 4.57.6 por su código remoto) y se cuantizan a **int8 dinámico solo en MatMul** (los pesos de *embeddings* de tokens quedan en fp32). Diferencia máxima ONNX fp32 frente a PyTorch ≤ 7,2e-4 en todos los candidatos.
- **Protocolo (D3):** 3 corridas, cada una en un proceso nuevo; 3 llamadas de calentamiento descartadas; carga del modelo fuera del cronómetro; **RSS** muestreado cada 20 ms durante las llamadas cronometradas (modelo cargado y consulta en vuelo); p95 por etapa con `numpy.percentile`; se reporta la mediana de las 3 corridas. La calidad es determinista (misma huella de vectores en las 3 corridas) y se calcula en la corrida 1.
- **Datos:** `data/eval/adr39-mini` v0.1.0 (75 preguntas: 59 es → en con respuesta, 6 sin respuesta, 10 controles en inglés; 39 pares NLI × 2 idiomas = 78 evaluaciones). 27 fuentes descargadas con SHA-256 y **94 citas del golden verificadas** contra su documento (AC-13). Corpus medido: 470 mil tokens aprox. (≈ 2040 chunks de 256 tokens).
- **Acierto:** un chunk acierta si es del documento esperado **y** contiene la cita (normalizando espacios y puntuación). recall@10 y MRR@10, intervalo del 95 % por *bootstrap* (1000 remuestreos, semilla 39).
- **Entrada del *reranker*:** los 24 mejores chunks (`RERANKER_MAX_PAIRS`) del *embedding* elegido, truncados a 512 tokens (`RERANKER_MAX_LENGTH`).

**Presupuestos** (fijados antes de medir, en `eval/configs/adr39-fase-a.yaml`): pila ≤ 24 GB con 16 GB para el LLM (`[S1 resp. 10]`), es decir, ~8 GB para todo lo demás; p95 por etapa: *embeddings* 500 ms, *reranker* 2000 ms, NLI 1500 ms (suma 4 s: con el LLM, ~10 s para 800 tokens, deja ~1 s de margen sobre el p95 ≤ 15 s). Licencias académicas aceptadas: `mit`, `apache-2.0` (leídas del repositorio de Hugging Face en la revisión fijada). Empate: diferencia de la métrica principal ≤ 0,02 (≈ 1 pregunta de 59) → gana la menor memoria.

## Factores de decisión

- RN-12: solo modelos locales con datos reales; pesos descargables, uso sin conexión, fuera del repo.
- NFR-01 / pila ≤ 24 GB y p95 ≤ 15 s; licencia académica; español → inglés; coste de reindexar.
- La calidad se informa frente a las metas iniciales de OL-06 (recall@10 ≥ 0,80; ≥ 0,70 es → en; MRR ≥ 0,60), pero **no son restricciones duras** de la selección (AC-2): se recalibran (TBD-02).

## Opciones consideradas

A (hipótesis): BGE-M3 · bge-reranker-v2-m3 · mDeBERTa-v3-base-xnli-multilingual-nli-2mil7. B: Qwen3-Embedding-0.6B · Qwen3-Reranker-0.6B · mDeBERTa. C: multilingual-e5-large-instruct · gte-multilingual-reranker-base · mDeBERTa. Descartadas por licencia antes de medir: jina-embeddings v3/v4, jina-reranker v2/v3, HHEM-2.3.

### Tabla por candidato (mediana de 3 corridas; revisión = commit del repositorio de Hugging Face verificado en la fuente)

**Embeddings** — chunks de 256 tokens, sin solapamiento (T1)

| Candidato | Licencia | Revisión | Pesos orig. | Cuant. | Tamaño ONNX | RSS máx. | p95 consulta | recall@10 (IC 95 %) | recall@10 es → en | MRR |
|---|---|---|---|---|---|---|---|---|---|---|
| **A** BAAI/bge-m3 | mit | `5617a9f` | 2166 MB | **int8** | 1300 MB | **964 MB** | **59 ms** | **0,594** (0,478–0,710) | 0,610 | 0,342 |
| A | mit | `5617a9f` | 2166 MB | fp32 | 2165 MB | 1570 MB | 180 ms | 0,594 | 0,610 | 0,312 |
| B Qwen/Qwen3-Embedding-0.6B | apache-2.0 | `97b0c61` | 1136 MB | int8 | 1017 MB | 680 MB | 156 ms | 0,449 (0,333–0,565) | 0,492 | 0,257 |
| B | apache-2.0 | `97b0c61` | 1136 MB | fp32 | 2277 MB | 1934 MB | 361 ms | 0,565 (0,464–0,681) | 0,610 | 0,413 |
| C intfloat/multilingual-e5-large-instruct | mit | `274baa4` | 1068 MB | int8 | 1270 MB | 829 MB | 89 ms | 0,319 | 0,305 | 0,174 |
| C | mit | `274baa4` | 1068 MB | fp32 | 2135 MB | 1578 MB | 215 ms | 0,304 (0,188–0,420) | 0,288 | 0,168 |

**Reranker** — sobre el top-24 denso de A@int8 (recall@10 denso del mismo conjunto: 0,594; MRR 0,342); lote de 24 pares truncados a 512 tokens

| Candidato | Licencia | Revisión | Cuant. | RSS máx. | p95 por lote | recall@10 (IC 95 %) | es → en | MRR | Resultado |
|---|---|---|---|---|---|---|---|---|---|
| A BAAI/bge-reranker-v2-m3 | apache-2.0 | `953dc6f` | int8 | 2317 MB | 3183 ms | 0,667 (0,551–0,768) | 0,695 | 0,488 | **descartado: p95 3183 ms > 2000 ms** |
| A | apache-2.0 | `953dc6f` | fp32 | 2966 MB | 9441 ms | 0,667 | 0,695 | 0,488 | descartado: 9441 ms > 2000 ms |
| B Qwen/Qwen3-Reranker-0.6B | apache-2.0 | `e61197e` | int8 | 5532 MB | 11214 ms | 0,536 | 0,542 | 0,260 | descartado: 11214 ms > 2000 ms |
| B | apache-2.0 | `e61197e` | fp32 | 6681 MB | 25601 ms | 0,667 | 0,695 | 0,487 | descartado: 25601 ms > 2000 ms |
| **C** Alibaba-NLP/gte-multilingual-reranker-base | apache-2.0 | `8215cf0` | **int8** | **2066 MB** | **1140 ms** | **0,623** (0,507–0,739) | 0,661 | 0,445 | **elegido** |
| C | apache-2.0 | `8215cf0` | fp32 | 2308 MB | 3393 ms | 0,667 | 0,712 | 0,517 | descartado: 3393 ms > 2000 ms |

**NLI** — mDeBERTa-v3-base-xnli-multilingual-nli-2mil7 (MIT, `b5113eb`), 78 evaluaciones (39 mismo idioma, 39 mezcla es/en); lote de 5 pares

| Cuant. | RSS máx. | p95 por lote | Exactitud total | Mismo idioma (en–en) | Mezcla (es–en) | Por etiqueta (entailment / neutral / contradiction) |
|---|---|---|---|---|---|---|
| **fp32** | **883 MB** | **248 ms** | **0,974** | 0,974 | 0,974 | 1,00 / 0,92 / 1,00 |
| int8 | 897 MB | 147 ms | 0,718 | 0,744 | 0,692 | 0,81 / 1,00 / 0,35 |

## Decisión

Opción elegida: **A para *embeddings* (BGE-M3 int8, dense 1024 con sparse propio), C para *reranker* (gte-multilingual-reranker-base int8) y mDeBERTa fp32 para NLI**, con **chunks de 1024 tokens sin solapamiento, tamaño fijo, índice HNSW**. Por componente:

1. **Embeddings → A@int8.** A@int8 y A@fp32 empatan en recall@10 (0,594): gana el de menor memoria (964 MB frente a 1570 MB) y 3× más rápido (AC-4). B@fp32 (0,565) queda dentro del intervalo pero cuesta 2× la memoria y 6× la latencia; B@int8 degrada 0,12; C rinde la mitad (0,31). El *sparse* de BGE-M3 está disponible (`sparse_linear`, 14 tokens con peso en la sonda): `SPARSE_VECTOR_SOURCE=modelo_embeddings`. Nota para US-112: con consultas en español sobre fuentes en inglés el *sparse* aporta poco sin traducir la consulta.
2. **Reranker → C@int8.** Es el **único candidato dentro del presupuesto de 2000 ms** (1140 ms). A@int8 rinde mejor (0,667 frente a 0,623; MRR 0,488 frente a 0,445) pero tarda 3183 ms con 8 vCPU: queda descartado por la regla, no por calidad. Las palancas de design.md (menos pares, truncado más corto) no se midieron; ver "Puntos que decide el humano". Todos los *rerankers* mejoran la recuperación densa (0,594 → 0,62–0,67) salvo B@int8.
3. **NLI → mDeBERTa@fp32.** int8 pierde 26 puntos (0,718, y 0,35 en contradicción), así que se usa fp32 (883 MB, 248 ms). Exactitud idéntica en mismo idioma y en mezcla es/en (0,974): no hace falta traducir la afirmación para US-063/US-064.
4. **Presupuesto conjunto.** 964 + 2066 + 883 MB = **3,9 GB**; con el LLM de 16 GB suman **19,8 GB** de 24 (holgura de 4,2 GB para OCR, PII, Milvus y PostgreSQL; la suma de RSS por separado puede diferir del RSS de un solo proceso). p95 sumado: 59 + 1140 + 248 = **1,45 s** frente a 4 s presupuestados.

### Chunking e índice (T2–T5, AC-10 a AC-12)

Sobre BGE-M3 int8 y el golden; una prueba por factor, el ganador queda fijo en la siguiente. Regla: gana la variante de menos chunks salvo que otra supere en `CHUNK_SELECTION_MARGIN` = 0,02 el recall@10 de la más barata; si empatan, la más simple.

| Prueba | Variante | Chunks | recall@10 (IC 95 %) | es → en | Controles en | MRR | Decisión |
|---|---|---|---|---|---|---|---|
| T2 tamaño | 256 | 2040 | 0,594 (0,478–0,710) | 0,610 | 0,50 | 0,342 | |
| | 512 | 1027 | 0,652 (0,536–0,768) | 0,661 | 0,60 | 0,371 | |
| | **1024** | **522** | **0,710** (0,609–0,812) | 0,729 | 0,60 | 0,356 | **1024** (menos chunks y mayor recall) |
| T3 solapamiento | **0 %** | 522 | 0,710 | 0,729 | 0,60 | 0,356 | **0 %** |
| | 10 % | 575 | 0,691 (0,589–0,797) | 0,701 | 0,63 | 0,324 | |
| | 15 % | 603 | 0,667 (0,551–0,783) | 0,695 | 0,50 | 0,309 | |
| T4 estrategia | **tamaño fijo** | 522 | 0,710 | 0,729 | 0,60 | 0,356 | **tamaño fijo** |
| | estructura de la fuente | 641 | 0,676 (0,570–0,783) | 0,684 | 0,63 | 0,392 | |

T5 (Milvus 2.5.10 standalone de prueba, colección temporal `adr39_tmp_*`, 522 vectores de 1024): HNSW (M = 16, efConstruction = 200, ef = 64) recupera **1,00** de los vecinos exactos de FLAT (mínimo 0,99) y mismo recall@10 (0,710); p95 de consulta 1,84 ms (HNSW) frente a 1,64 ms (FLAT); memoria estimada del índice 2,21 MB frente a 2,14 MB (estimación por fórmula, no medición del servidor). Decisión según la regla: **HNSW**. Con este tamaño del corpus semilla FLAT y HNSW no discriminan: T5 solo verifica que HNSW no pierde recall, no mide calidad (AC-12); FLAT sería igualmente válido hoy.

Observaciones de las pruebas: (a) **las diferencias de T3 y T4 están dentro de los intervalos de confianza** (≈ ±0,1 con 69 preguntas) y no deciden por sí solas; ganan por la regla de desempate (menos chunks, la más simple); (b) el recall@10 crece con el tamaño del chunk en parte por construcción (10 chunks de 1024 tokens cubren cuatro veces más texto que 10 de 256 y el acierto es "el chunk contiene la cita"); (c) no hubo variantes omitidas por longitud máxima (BGE-M3 admite 8192 tokens).

### Metas de OL-06 frente a lo medido

Ninguna combinación alcanza las metas iniciales: mejor recall@10 denso 0,710 (meta 0,80), es → en 0,729 (meta 0,70: **se cumple**), MRR 0,356–0,392 (meta 0,60). Con el *reranker* elegido sobre chunks de 256 tokens: recall@10 0,623, MRR 0,445. Preguntas sin respuesta: puntaje máximo recuperado 0,583 (mediana 0,530) con coseno denso de BGE-M3 y 0,459 (mediana 0,398) con el *reranker* elegido (chunks de 256 tokens, n = 6). Esos valores son un insumo para calibrar el umbral de RN-02 (US-056) con la suite `evaluate`; este mini-dataset no lo fija.

### Consecuencias

- **Positivas:** modelos con licencia académica y pesos locales; 3,9 GB para los tres; p95 sumado de 1,45 s; mDeBERTa mantiene 0,974 en mezcla es/en; la decisión es reproducible (`python -m app.scripts.adr39_measure`).
- **Negativas / riesgos:**
  - El *reranker* se midió sobre chunks de 256 tokens, pero se fija `CORPUS_CHUNK_SIZE=1024` y `RERANKER_MAX_LENGTH=512`: un chunk de 1024 tokens se trunca a la mitad en el *reranker*. **No se midió esa combinación**; hay que re-medirla antes de implementar US-055 o bajar el tamaño de chunk.
  - gte-multilingual-reranker-base usa **código remoto** de `Alibaba-NLP/new-impl` (sin revisión fijada por este ADR) y exige transformers < 5 solo para exportar; el runtime ONNX no lo ejecuta. Fijar y auditar esa revisión, o exportar una vez y servir el ONNX desde el volumen.
  - Con 8 vCPU y 7 GB de RAM en la VM, no es posible medir el stack completo con el LLM de 16 GB al mismo tiempo; la medición conjunta es de la fase B (US-224).
  - Mini-dataset pequeño: IC ≈ ±0,1; US-072 lo amplía.
- **Configuración (RN-22):** ver bloque de decisión. `NLI_QUANTIZATION` es una clave añadida (la lista de design.md tenía un solo `MODEL_QUANTIZATION`) porque NLI usa fp32 y el resto int8.
- **Sin cambio de contrato.** `data-model.md` no cambia: `dense_vector` sigue declarado con `EMBEDDING_DIM` y remite a este ADR.

<!-- adr39:decision:inicio -->
```yaml
EMBEDDING_MODEL: BAAI/bge-m3
EMBEDDING_MODEL_REVISION: 5617a9f61b028005a4858fdac845db406aefb181
EMBEDDING_DIM: 1024
SPARSE_VECTOR_SOURCE: modelo_embeddings
RERANKER_MODEL: Alibaba-NLP/gte-multilingual-reranker-base
RERANKER_MODEL_REVISION: 8215cf04918ba6f7b6a62bb44238ce2953d8831c
RERANKER_MAX_PAIRS: 24
RERANKER_MAX_LENGTH: 512
NLI_MODEL: MoritzLaurer/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7
NLI_MODEL_REVISION: b5113eb38ab63efdd7f280f8c144ea8b13f978ce
MODEL_QUANTIZATION: int8
NLI_QUANTIZATION: fp32
MODEL_CACHE_DIR: /models
DATA_CACHE_DIR: /data-cache
CORPUS_CHUNK_SIZE: 1024
CORPUS_CHUNK_OVERLAP: 0
CORPUS_CHUNKING_STRATEGY: tamano_fijo
VECTOR_INDEX_TYPE: HNSW
VECTOR_INDEX_PARAMS: '{"M": 16, "efConstruction": 200, "ef": 64}'
CHUNK_SELECTION_MARGIN: 0.02
INDEX_MIN_RECALL_VS_FLAT: 0.99
STACK_MEMORY_LIMIT_GB: 24
LLM_MEMORY_BUDGET_GB: 16
STAGE_P95_BUDGET_MS: '{"embeddings": 500, "reranker": 2000, "nli": 1500}'
ACADEMIC_LICENSES: mit,apache-2.0
```
<!-- adr39:decision:fin -->

### Confirmación

`python -m app.scripts.adr39_measure --check-config` compara `apps/rag-orchestrator/.env.example` con el bloque anterior y falla si `EMBEDDING_DIM`, `SPARSE_VECTOR_SOURCE` o cualquier otra clave faltan o difieren (US-012 AC-3, AC-10 a AC-12); la suite `evaluate` (US-072) reutiliza `data/eval/adr39-mini`. Reproducir: `docker build -f apps/rag-orchestrator/eval/configs/adr39-medicion.Dockerfile …` y `python -m app.scripts.adr39_measure --config eval/configs/adr39-fase-a.yaml`, luego `adr39-fase-a2.yaml --stage t2|t3|t4|t5`.

## Puntos que decide el humano

1. **Reranker A frente a C.** La regla fijada descarta A@int8 por p95 (3183 ms > 2000 ms) aunque rinde 0,044 más de recall@10 y 0,043 más de MRR. Opciones: aceptar C; subir `STAGE_P95_BUDGET_MS.reranker` a ~3,2 s (la suma seguiría en 4,6 s, p95 total ~14,6 s: sin margen); o medir A@int8 con menos pares o truncado más corto (palancas de design.md, no medidas).
2. **Tamaño de chunk 1024 y `RERANKER_MAX_LENGTH`=512** (ver riesgos): decidir si se re-mide la combinación o se acepta 512 tokens.
3. **Metas de OL-06 no alcanzadas** (recall@10 0,71 y MRR 0,36–0,39 frente a 0,80 y 0,60): escalar el ajuste de metas (G-5 / NFR-01, TBD-02) o ampliar el dataset.
4. **HNSW frente a FLAT** con 522 vectores: la regla elige HNSW; FLAT es equivalente hoy.

## Fase B

*(Marcador para el change de L1D-274, US-224: runtime del LLM, OCR, regla de proveedores RN-12 y p95 extremo a extremo con la pila completa.)*

## Pros y contras de las opciones

### A (BGE-M3 · bge-reranker-v2-m3 · mDeBERTa)

- A favor: mejor *embedding* medido; *sparse* propio; mejor *reranker* en calidad.
- En contra: el *reranker* no entra en el presupuesto de latencia con 8 vCPU.

### B (Qwen3-Embedding-0.6B · Qwen3-Reranker-0.6B)

- A favor: pesos pequeños; MRR del *embedding* fp32 el más alto (0,413).
- En contra: int8 degrada (0,449); el *reranker* usa 5,5–6,7 GB de RSS y 11–26 s por lote; sin *sparse* nativo.

### C (multilingual-e5-large-instruct · gte-multilingual-reranker-base)

- A favor: el *reranker* int8 es el más rápido (1140 ms) y ligero.
- En contra: el *embedding* rinde la mitad (0,31) en español → inglés; el *reranker* exige código remoto.

## Más información

Reportes: `reports/adr39/2026-10-16-fase-a.json`, `reports/adr39/2026-10-16-fase-a2.json`. Dataset: `data/eval/adr39-mini` (NCI libre de copyright con crédito, PMC CC BY 4.0, ClinicalTrials.gov: *Source: ClinicalTrials.gov, National Library of Medicine*, sin aval de NLM). Bloquea o informa a: L1D-114 (US-058: dimensión e índice), L1D-115 (US-059: tamaño en tokens, solapamiento y estrategia; hoy `fragmentar()` corta por caracteres), L1D-106 (US-055), L1D-274 (US-224), US-072, US-073, ADR-41. Revisión prevista: al medir la fase B y cuando la imagen de L1D-164 esté mergeada.
