# ADR-39 — Modelos locales de recuperación y verificación: BGE-M3 int8, bge-reranker-v2-m3 int8 y mDeBERTa fp32, con chunks de 1024 tokens

> Linear: [L1D-102](https://linear.app/l1der-lab-mjbc/issue/L1D-102) · Historia: US-012 (fase A) · Feature: FEAT-06a
> Plantilla: MADR 4 (variante mínima, en español). La **fase B** (runtime, LLM, OCR, p95 extremo a extremo) es del change de L1D-274 (US-224).

- **Estado:** aceptado (usuario, 2026-10-20) — fase A. La fase B sigue en el change de L1D-274 (US-224). Se mantienen las salvedades y el riesgo de latencia alto aceptado (se cierra en L1D-274; la VM de Docker ≥ 10 GB es requisito de la fase B)
- **Fecha:** 2026-10-16 · revisado 2026-10-20 (decisiones del usuario: reranker bge-reranker-v2-m3 con 12 pares, tope del LLM 21 GB y stack 30 GB)
- **Decisores:** usuario (propietario del producto); oncólogo asesor para el dataset
- **Consultados / informados:** ai-services-dev (mediciones), ai-eval-runner (revisión de reportes en el Gate 2)
- **Requisitos:** IA-01, NFR-01, NFR-05, TBD-01, RN-12, RN-13, RN-14, RN-21, RN-22; US-012 AC-1 a AC-5 y AC-9 a AC-13

## Contexto y problema

Cambiar el modelo de *embeddings* obliga a reindexar Milvus; cambiar el *reranker* o el NLI obliga a recalcular `relevance_score` y el soporte de las citas. US-055, US-058 y US-059 necesitan modelo, dimensión (`EMBEDDING_DIM`), origen del *sparse*, tamaño de chunk e índice fijados **antes** de indexar. La hipótesis de partida (A, `[S1 resp. 5]`) salía de una investigación externa sin latencias medidas en CPU; esta decisión sale de cifras medidas.

**Cómo se midió** (todo en `reports/adr39/2026-10-16-fase-a.json`, `-fase-a2.json` y `2026-10-20-fase-a3-reranker.json`, solo agregados):

- **Dónde:** contenedor provisional Linux arm64 (`python:3.13-slim`, 8 vCPU, sin GPU, 7 GB de RAM; D2 de design.md) porque la imagen de `rag-orchestrator` de L1D-164 aún no está mergeada; se debe repetir si cambian ONNX Runtime o los límites del Compose. Host: Apple M5 Pro, 48 GB; Docker Desktop con 7,75 GB para la VM.
- **Runtime:** ONNX Runtime 1.31.0 (CPU, 8 hilos). Los candidatos se exportan a ONNX fp32 con el exportador basado en `torch.export` (transformers 5.20.0, torch 2.14.1; `gte` con transformers 4.57.6 por su código remoto) y se cuantizan a **int8 dinámico solo en MatMul** (los pesos de *embeddings* de tokens quedan en fp32). Diferencia máxima ONNX fp32 frente a PyTorch ≤ 7,2e-4 en todos los candidatos.
- **Protocolo (D3):** 3 corridas, cada una en un proceso nuevo; 3 llamadas de calentamiento descartadas; carga del modelo fuera del cronómetro; **RSS** muestreado cada 20 ms durante las llamadas cronometradas (modelo cargado y consulta en vuelo); p95 por etapa con `numpy.percentile`; se reporta la mediana de las 3 corridas. La calidad es determinista (misma huella de vectores en las 3 corridas) y se calcula en la corrida 1.
- **Datos:** `data/eval/adr39-mini` v0.1.0 (75 preguntas: 59 es → en con respuesta, 6 sin respuesta, 10 controles en inglés; 39 pares NLI × 2 idiomas = 78 evaluaciones). 27 fuentes descargadas con SHA-256 y **94 citas del golden verificadas** contra su documento (AC-13). Corpus medido: 470 mil tokens aprox. (≈ 2040 chunks de 256 tokens).
- **Acierto:** un chunk acierta si es del documento esperado **y** contiene la cita (normalizando espacios y puntuación). recall@10 y MRR@10, intervalo del 95 % por *bootstrap* (1000 remuestreos, semilla 39).
- **Entrada del *reranker*:** en la fase A, los 24 mejores chunks (`RERANKER_MAX_PAIRS`) del *embedding* elegido, truncados a 512 tokens (`RERANKER_MAX_LENGTH`); la decisión final fija 12 pares (ver "Medición complementaria del reranker").

**Presupuestos** (fijados antes de medir, en `eval/configs/adr39-fase-a.yaml`): en la fase A, pila ≤ 24 GB con 16 GB para el LLM (`[S1 resp. 10]`); p95 por etapa: *embeddings* 500 ms, *reranker* 2000 ms, NLI 1500 ms (suma 4 s: con el LLM, ~10 s para 800 tokens, ~1 s de margen sobre el p95 ≤ 15 s). **Decisiones del usuario del 2026-10-20:** pila ≤ **30 GB** (equipo de referencia: MacBook Pro de 32 GB) con el LLM local ≤ **21 GB**, y p95 del *reranker* **4500 ms** con 12 pares (regla de "Medición complementaria del reranker": p95 mediano medido, 4259 ms, redondeado a 250 ms; el valor de 2000 ms queda sustituido). Licencias académicas aceptadas: `mit`, `apache-2.0` (leídas del repositorio de Hugging Face en la revisión fijada). Empate: diferencia de la métrica principal ≤ 0,02 (≈ 1 pregunta de 59) → gana la menor memoria.

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
| **A** BAAI/bge-reranker-v2-m3 | apache-2.0 | `953dc6f` | **int8** | 2317 MB | 3183 ms | **0,667** (0,551–0,768) | 0,695 | 0,488 | descartado con el presupuesto de 2000 ms (3183 ms); **elegido** con el presupuesto de 4500 ms y la decisión del usuario del 2026-10-20 |
| A | apache-2.0 | `953dc6f` | fp32 | 2966 MB | 9441 ms | 0,667 | 0,695 | 0,488 | descartado: 9441 ms > 4500 ms (y no mejora la calidad) |
| B Qwen/Qwen3-Reranker-0.6B | apache-2.0 | `e61197e` | int8 | 5532 MB | 11214 ms | 0,536 | 0,542 | 0,260 | descartado: 11214 ms > 4500 ms |
| B | apache-2.0 | `e61197e` | fp32 | 6681 MB | 25601 ms | 0,667 | 0,695 | 0,487 | descartado: 25601 ms > 4500 ms |
| C Alibaba-NLP/gte-multilingual-reranker-base | apache-2.0 | `8215cf0` | int8 | 2066 MB | 1140 ms | 0,623 (0,507–0,739) | 0,661 | 0,445 | era el único dentro de 2000 ms; **no elegido** (decisión del usuario: bge-reranker-v2-m3) |
| C | apache-2.0 | `8215cf0` | fp32 | 2308 MB | 3393 ms | 0,667 | 0,712 | 0,517 | no elegido (int8 es 3× más rápido) |

**NLI** — mDeBERTa-v3-base-xnli-multilingual-nli-2mil7 (MIT, `b5113eb`), 78 evaluaciones (39 mismo idioma, 39 mezcla es/en); lote de 5 pares

| Cuant. | RSS máx. | p95 por lote | Exactitud total | Mismo idioma (en–en) | Mezcla (es–en) | Por etiqueta (entailment / neutral / contradiction) |
|---|---|---|---|---|---|---|
| **fp32** | **883 MB** | **248 ms** | **0,974** | 0,974 | 0,974 | 1,00 / 0,92 / 1,00 |
| int8 | 897 MB | 147 ms | 0,718 | 0,744 | 0,692 | 0,81 / 1,00 / 0,35 |

## Decisión

Opción elegida: **A para *embeddings* (BGE-M3 int8, dense 1024 con sparse propio), A para *reranker* (bge-reranker-v2-m3 int8, decisión del usuario del 2026-10-20) y mDeBERTa fp32 para NLI**, con **chunks de 1024 tokens sin solapamiento, tamaño fijo, índice HNSW**. Por componente:

1. **Embeddings → A@int8.** A@int8 y A@fp32 empatan en recall@10 (0,594): gana el de menor memoria (964 MB frente a 1570 MB) y 3× más rápido (AC-4). B@fp32 (0,565) queda dentro del intervalo pero cuesta 2× la memoria y 6× la latencia; B@int8 degrada 0,12; C rinde la mitad (0,31). El *sparse* de BGE-M3 está disponible (`sparse_linear`, 14 tokens con peso en la sonda): `SPARSE_VECTOR_SOURCE=modelo_embeddings`. Nota para US-112: con consultas en español sobre fuentes en inglés el *sparse* aporta poco sin traducir la consulta.
2. **Reranker → A@int8 (bge-reranker-v2-m3), chunks de 1024 tokens, `RERANKER_MAX_LENGTH` = 512 y `RERANKER_MAX_PAIRS` = 12.** Decisión del usuario del 2026-10-20, que prioriza el recall. Con el presupuesto original de 2000 ms la regla descartaba A (3183 ms) y dejaba a gte-multilingual-reranker-base (1140 ms) como único válido; el usuario eligió A por calidad (recall@10 0,667 frente a 0,623; MRR 0,488 frente a 0,445 sobre chunks de 256 tokens). Con 12 pares y chunks de 1024 tokens se midió recall@10 **0,696** (IC 95 % 0,580–0,797), MRR 0,491, **p95 4259 ms** y RSS 2,6 GB. El presupuesto de p95 de la etapa, por la regla fijada antes de medir (p95 mediano redondeado hacia arriba a múltiplos de 250 ms), es **4500 ms** (4259 / 250 = 17,04, se redondea a 18 × 250; **no 4250**, que quedaría por debajo del p95 medido). Con ese presupuesto A gana también por la regla (diferencia de recall@10 de 0,044 > 0,02 de tolerancia frente a gte). **Revisión fijada** `953dc6f6f85a1b2dbfca4c34a2796e7dde08d41e` (cabeza de `main` de `BAAI/bge-reranker-v2-m3` a 2026-10-20, última modificación 2024-06-24), licencia **Apache-2.0** leída de la API de Hugging Face, sin acceso restringido (`gated=false`); `config.json` sin `auto_map` ni archivos `.py` en el repositorio: **no requiere código remoto** (arquitectura `XLMRobertaForSequenceClassification`, exportable a ONNX sin `trust_remote_code`). **Las diferencias de recall@10 entre 12, 16 y 24 pares (0,696 / 0,696 / 0,652) están dentro de los intervalos de confianza (≈ ±0,1)**: 12 pares no se elige porque rinda más, sino porque rinde igual con menos latencia y memoria. **Riesgo principal:** el p95 extremo a extremo estimado es ~14,6 s con un margen de solo ~0,4 s sobre el NFR de 15 s, y depende de un LLM de 10 s **sin medir**; se cierra en L1D-274 (US-224). Ver la sección siguiente.
3. **NLI → mDeBERTa@fp32.** int8 pierde 26 puntos (0,718, y 0,35 en contradicción), así que se usa fp32 (883 MB, 248 ms). Exactitud idéntica en mismo idioma y en mezcla es/en (0,974): no hace falta traducir la afirmación para US-063/US-064.
4. **Presupuesto conjunto de memoria (tope 30 GB, LLM ≤ 21 GB).** Modelos medidos (RSS máximo en MiB, mediana de 3 corridas; 4489 MiB en total): 964 MiB (*embeddings*) + 2642 MiB (*reranker* con la configuración decidida: lotes de 12 pares de 512 tokens sobre chunks de 1024) + 883 MiB (NLI) = **4,38 GiB**. Más el LLM al tope (21 GB) = **25,4 GB**. Resto del stack (PostgreSQL, Milvus con etcd y su MinIO, MinIO clínico, clinical-api, web, proceso base de `rag-orchestrator`, OCR y PII): **medido en reposo, 0,53 GB** (`docker stats` del Compose actual, sin carga ni OCR/PII); **estimado bajo carga ~4,3 GB** (**estimación**: PostgreSQL 0,5, Milvus+etcd+MinIO 1,5, MinIO clínico 0,2, clinical-api 0,3, web 0,5, base de `rag-orchestrator` 0,3 y reserva de 1,0 GB para OCR y PII, que se miden en la fase B). Total: **25,9 GB** (reposo) a **29,7 GB** (estimación) frente a 30 GB: **cabe, con solo 0,3 GB de holgura en el caso estimado**, que deja 2,3 GB (estimación) a 6,1 GB (reposo) para macOS en un equipo de 32 GB (macOS y las aplicaciones necesitan ~3–4 GB: con la estimación queda justo). Para comparar: con 24 pares el RSS del *reranker* sería 4,4 GB y el total estimado 31,4 GB (no cabe); con 8 pares, 1,9 GB y 28,9 GB. Además la VM de Docker (7,75 GB hoy) no alberga los modelos (4,4 GB) más el resto (~4,3 GB): hay que subirla a ≥ 10 GB para ejecutar el stack real. La suma de RSS por separado puede diferir del RSS de un solo proceso; el stack completo con LLM se mide en la fase B (US-224). p95 sumado de las etapas: 59 + 4259 + 248 = **4,57 s** (sin el LLM) frente a 6,5 s presupuestados (500 + 4500 + 1500).

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

### Medición complementaria del reranker (2026-10-20)

Decisión del usuario: el *reranker* es bge-reranker-v2-m3 y, priorizando el recall, se adopta `RERANKER_MAX_PAIRS` = 12 con chunks de 1024 y `RERANKER_MAX_LENGTH` = 512 (escenario `c1024-L512-P12`, 4.ª fila de palancas). Se midió la combinación que la fase A dejó sin medir: chunks de 1024 tokens con `RERANKER_MAX_LENGTH` = 512, frente a la base de 256 tokens, y las palancas `RERANKER_MAX_PAIRS` y truncado **solo como medición, sin cambiar la decisión**. Reglas, escenarios y presupuestos en `eval/configs/adr39-fase-a3.yaml` (commit previo a la medición); reporte `reports/adr39/2026-10-20-fase-a3-reranker.json`. Mismo contenedor, protocolo y dataset de la fase A (3 corridas en procesos nuevos, mediana, 3 llamadas de calentamiento, 12 lotes cronometrados por corrida, ONNX Runtime int8, 8 hilos; recall@10 y MRR con IC 95 % por *bootstrap*). Reproducir: `python -m app.scripts.adr39_measure --reranker-chunks --config eval/configs/adr39-fase-a3.yaml`.

| Escenario (chunk · longitud máx. · pares) | p95 por lote (corridas) | RSS máx. | recall@10 (IC 95 %) | es → en | MRR | recall@10 denso del mismo conjunto |
|---|---|---|---|---|---|---|
| **referencia**: 256 · 512 · 24 | 3947 ms (3946 / 4050 / 3947) | 1930 MB | 0,667 (0,551–0,768) | 0,695 | 0,488 | 0,594 |
| 1024 · 512 · 24 (escenario "vigente" de la configuración, antes de la decisión de 12 pares) | **8252 ms** (8252 / 8120 / 8262) | **4407 MB** | 0,652 (0,536–0,768) | 0,661 | 0,512 | 0,710 |
| 1024 · 768 · 24 | no medible (proceso terminado por falta de memoria, SIGKILL) | > 7 GB | — | — | — | — |
| 1024 · 1280 · 24 (sin truncado) | no medible (SIGKILL) | > 7 GB | — | — | — | — |
| palanca 256 · 512 · 16 | 2770 ms | 1590 MB | 0,667 | 0,695 | 0,483 | 0,594 |
| palanca 256 · 512 · 12 | 1995 ms | 1386 MB | 0,594 | 0,610 | 0,424 | 0,594 |
| palanca 256 · 512 · 8 | 1470 ms | 1190 MB | 0,551 | 0,559 | 0,445 | 0,551 |
| palanca 1024 · 512 · 16 | 5575 ms | 2937 MB | 0,696 (0,594–0,812) | 0,712 | 0,508 | 0,710 |
| **adoptado**: 1024 · 512 · 12 | **4259 ms** (4128 / 4259 / 4485) | **2642 MB** | **0,696** (0,580–0,797) | 0,712 | 0,491 | 0,710 |
| palanca 1024 · 512 · 8 | 2947 ms | 1881 MB | 0,667 (0,551–0,783) | 0,678 | 0,514 | 0,667 |
| palanca 1024 · 256 · 24 (truncado corto) | 3678 ms | 1755 MB | 0,565 | 0,576 | 0,352 | 0,710 |
| palanca 1024 · 1280 · 12 | no medible (SIGKILL) | > 7 GB | — | — | — | — |

**Lectura de las cifras**

1. **Calidad.** Con chunks de 1024 y 512 tokens el *reranker* **no mejora el recall@10 denso** (0,652 frente a 0,710): solo ve la mitad de cada chunk y la cita puede estar en la parte truncada; sí mejora el MRR (0,356 → 0,512). Frente a la base de 256 el recall@10 queda a 0,015 (dentro de la tolerancia de 0,02 y de los IC, que son de ±0,1). Con 24 pares de 1024 tokens el *reranker* examina 4× más texto que con chunks de 256.
2. **Latencia.** El p95 del *reranker* se multiplica por 2,1 (3947 → 8252 ms) y el RSS por 2,3 (1930 → 4407 MB). La medición de hoy de la referencia (3947 ms) es **24 % mayor** que la de la fase A (3183 ms) con el mismo contenedor, protocolo y calidad idéntica (0,667, MRR 0,488): hay variabilidad entre sesiones de medición; dentro de cada sesión las tres corridas difieren ≤ 3 %. Los 3183 ms de la fase A y los 3947 ms de hoy son ambos válidos; las comparaciones de este apartado usan solo las cifras de hoy.
3. **Longitudes mayores no son medibles en esta VM.** 768 y 1280 tokens con 24 pares (y 1280 con 12) agotan los 7,75 GB de la VM de Docker (el escenario vigente ya usa 4,4 GB): el proceso es terminado (SIGKILL). No se inventan cifras: habría que repetirlos con una VM mayor (≥ 12 GB) o en la imagen de L1D-164 con límites mayores.
4. **Palancas** (solo medición; ninguna se adopta aquí).

   | Palanca sobre 24 pares | p95 | recall@10 frente al vigente | p95 extremo a extremo estimado | Margen frente a 15 s |
   |---|---|---|---|---|
   | ninguna (1024 · 512 · 24) | 8252 ms | 0,652 | 18,6 s | −3,6 s (riesgo alto) |
   | `RERANKER_MAX_PAIRS` = 16 | 5575 ms | +0,043 | 15,9 s | −0,9 s (alto) |
   | `RERANKER_MAX_PAIRS` = 12 (**adoptado**) | 4259 ms | +0,043 | 14,6 s | +0,4 s (alto: < 1 s) |
   | `RERANKER_MAX_PAIRS` = 8 | 2947 ms | +0,014 | 13,3 s | +1,7 s (aceptable) |
   | truncado a 256 tokens | 3678 ms | −0,087 (fuera de tolerancia) | 14,0 s | +1,0 s |

   Ninguna palanca cumple la regla estricta de "viable" fijada antes de medir (recall dentro de la tolerancia **y** p95 ≤ 2000 ms); la más cercana es **8 pares** (2947 ms, recall@10 0,667, RSS 1,9 GB), con la salvedad de que con 8 pares el *reranker* ya no mejora el recall@10 del denso (0,667 = 0,667) y solo reordena (MRR 0,352 → 0,514). Reducir el truncado cuesta calidad (−0,087).

**Presupuesto del *reranker* (regla fijada antes de medir, aplicada al escenario adoptado):** p95 mediano (4259 ms, corridas 4128 / 4259 / 4485) redondeado hacia arriba a múltiplos de 250 ms = **4500 ms** (la regla da 4500, no 4250); la condición de calidad (recall@10 del adoptado ≥ el de la base − 0,02) se cumple (0,696 ≥ 0,647). Para el escenario de 24 pares (la configuración que la regla tenía como "vigente" antes de la decisión de 12 pares) la misma regla daría 8500 ms; el reporte `2026-10-20-fase-a3-reranker.json` recoge ambos (`conclusiones.presupuesto_reranker_ms` y `conclusiones.adoptado`).

**Las diferencias de recall@10 entre 12, 16 y 24 pares están dentro del IC 95 %:** 0,696 (0,580–0,797), 0,696 (0,594–0,812) y 0,652 (0,536–0,768); no son significativas.

**Efecto sobre el p95 extremo a extremo** (NFR: `/platform/evidence-analyses` p95 ≤ 15 s). Cota superior = suma de p95 de etapas + LLM; las otras etapas son *embeddings* 59 ms y NLI 248 ms (fase A); la generación del LLM es el **supuesto** de `[S1 resp. 10]` (~10 s para 800 tokens, **no medido aquí**); no incluye Milvus, PII, validación de varias opciones ni clinical-api, así que la cifra real será mayor.

| Configuración del *reranker* | p95 etapa | p95 extremo a extremo estimado | Margen | Riesgo |
|---|---|---|---|---|
| gte int8, chunks 256 (hipótesis previa) | 1140 ms | 11,4 s | +3,6 s | aceptable |
| cálculo previo con bge-reranker-v2-m3 (fase A, 256) | 3183 ms | 13,5 s | +1,5 s | aceptable |
| bge-reranker-v2-m3, chunks 256 (hoy) | 3947 ms | 14,3 s | +0,7 s | alto |
| bge-reranker-v2-m3, chunks 1024 · 512 · 24 (antes de la decisión de 12 pares) | 8252 ms | 18,6 s | −3,6 s | alto: incumple |
| **decidida: bge-reranker-v2-m3, chunks 1024 · 512 · 12** | **4259 ms** | **14,6 s** | **+0,4 s** | **alto: < 1 s** |
| decidida, con el presupuesto de la etapa (4500 ms) | 4500 ms | 14,8 s | +0,2 s | alto: < 1 s |

**Riesgo señalado:** con la configuración decidida (bge-reranker-v2-m3, chunks de 1024 tokens, **12 pares** de 512 tokens) el p95 extremo a extremo estimado es **14,6 s con un margen de solo ~0,4 s** sobre el NFR de 15 s (0,2 s si se usa el presupuesto de 4500 ms en vez del p95 medido: 14,8 s). El margen depende de un LLM de 10 s **sin medir** (supuesto de `[S1 resp. 10]`) y la estimación no incluye Milvus, PII, la validación de varias opciones ni clinical-api: cualquier desviación del LLM o de esas etapas lo agota. **Se cierra en L1D-274 (US-224)**, que mide el p95 con la pila y el LLM reales; hasta entonces el NFR está en riesgo alto. Con 24 pares (la configuración previa a esta decisión) la estimación era 18,6 s (incumple). Si la fase B lo confirma, las salidas son `RERANKER_MAX_PAIRS` = 8 (13,3 s), recalibrar el NFR en el S5 o más CPU. El equipo de producción (MacBook Pro) puede tener más CPU que los 8 vCPU de la VM; la repetición en la imagen de L1D-164 lo dirá.

#### Cambio de topes de memoria (decisión del usuario, 2026-10-20)

`LLM_MEMORY_BUDGET_GB` pasa de 16 a **21** y `STACK_MEMORY_LIMIT_GB` de 24 a **30**. Ningún descarte de la fase A fue por memoria (el mayor, Qwen3-Reranker fp32, 6,7 GB + 16 GB = 22,7 GB ≤ 24), y con los nuevos topes el mayor da 6,7 + 21 = 27,7 GB ≤ 30: **ningún descarte por memoria cambia ni se reabre**. Lo que cambia es el presupuesto conjunto (ver decisión 4).

### Metas de OL-06 frente a lo medido

Ninguna combinación alcanza las metas iniciales: mejor recall@10 denso 0,710 (meta 0,80), es → en 0,729 (meta 0,70: **se cumple**), MRR 0,356–0,392 (meta 0,60). Con bge-reranker-v2-m3 sobre chunks de 1024 tokens y 12 pares (configuración decidida): recall@10 0,696, MRR 0,491. Preguntas sin respuesta: puntaje máximo recuperado 0,583 (mediana 0,530) con coseno denso de BGE-M3; los valores del *reranker* de la fase A (0,459 / 0,398) son de gte sobre chunks de 256 tokens y **no** valen para bge-reranker-v2-m3 (otra escala de puntaje): recalibrar el umbral de RN-02 con la suite `evaluate`. Esos valores son un insumo para calibrar el umbral de RN-02 (US-056) con la suite `evaluate`; este mini-dataset no lo fija.

### Consecuencias

- **Positivas:** modelos con licencia académica y pesos locales; 4,4 GB para los tres con la configuración decidida (12 pares); mejor calidad del *reranker* medida (MRR 0,491 con la configuración decidida de 12 pares; 0,512 con 24 pares); mDeBERTa mantiene 0,974 en mezcla es/en; la decisión es reproducible (`python -m app.scripts.adr39_measure`).
- **Negativas / riesgos:**
  - **p95 extremo a extremo:** la configuración decidida (12 pares) da un p95 estimado de ~14,6 s, margen de ~0,4 s con un LLM de 10 s sin medir; se cierra en L1D-274 (US-224). Ver "Medición complementaria del reranker".
  - **Memoria:** el RSS del *reranker* con 12 pares de 1024 tokens es 2,6 GB; el total estimado (29,7 GB) cabe en 30 GB con solo 0,3 GB de holgura (2,3 GB para macOS) y la VM de Docker debe subir a ≥ 10 GB.
  - Con chunks de 1024 y `RERANKER_MAX_LENGTH` = 512, el *reranker* ve la mitad del chunk y su recall@10 (0,652) queda por debajo del denso (0,710). `RERANKER_MAX_LENGTH` mayor (768, 1280) no se pudo medir en la VM de 7,75 GB.
  - La variabilidad entre sesiones de medición del p95 es ~24 % (3183 ms en la fase A frente a 3947 ms hoy para la misma configuración); repetir en la imagen de L1D-164.
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
RERANKER_MODEL: BAAI/bge-reranker-v2-m3
RERANKER_MODEL_REVISION: 953dc6f6f85a1b2dbfca4c34a2796e7dde08d41e
RERANKER_MAX_PAIRS: 12
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
STACK_MEMORY_LIMIT_GB: 30
LLM_MEMORY_BUDGET_GB: 21
STAGE_P95_BUDGET_MS: '{"embeddings": 500, "reranker": 4500, "nli": 1500}'
ACADEMIC_LICENSES: mit,apache-2.0
```
<!-- adr39:decision:fin -->

### Confirmación

`python -m app.scripts.adr39_measure --check-config` compara `apps/rag-orchestrator/.env.example` con el bloque anterior y falla si `EMBEDDING_DIM`, `SPARSE_VECTOR_SOURCE` o cualquier otra clave faltan o difieren (US-012 AC-3, AC-10 a AC-12); la suite `evaluate` (US-072) reutiliza `data/eval/adr39-mini`. Reproducir: `docker build -f apps/rag-orchestrator/eval/configs/adr39-medicion.Dockerfile …` y `python -m app.scripts.adr39_measure --config eval/configs/adr39-fase-a.yaml`, luego `adr39-fase-a2.yaml --stage t2|t3|t4|t5`; el *reranker* sobre chunks de 1024 con `adr39-fase-a3.yaml --reranker-chunks`.

## Puntos que decide el humano

1. **Reranker A frente a C — resuelto (2026-10-20):** bge-reranker-v2-m3 (A), `RERANKER_MAX_PAIRS` = 12 (el usuario prioriza el recall), chunks de 1024 y `RERANKER_MAX_LENGTH` = 512. Presupuesto de p95 de la etapa: 4500 ms por la regla. Lo que queda abierto: el margen de ~0,4 s sobre el NFR de 15 s (14,6 s estimados) depende de un LLM de 10 s sin medir; lo cierra L1D-274. Alternativas medidas (no aplicadas): 8 pares (13,3 s, recall@10 0,667) o recalibrar el NFR en el S5. Las diferencias de recall entre 12, 16 y 24 pares están dentro del IC.
2. **Tamaño de chunk 1024 y `RERANKER_MAX_LENGTH` = 512 — medido (2026-10-20):** el *reranker* no supera al denso en recall@10 (0,652 frente a 0,710) y cuesta 2,1× la latencia y 2,3× la memoria frente a chunks de 256. 768 y 1280 tokens no se pudieron medir en la VM de 7,75 GB. **Aceptado tal como se midió (usuario, 2026-10-20):** chunk de 1024 y `RERANKER_MAX_LENGTH` = 512. 768 y 1280 tokens quedan sin medir en la VM de 7,75 GB; repetirlos con una VM mayor es una medición nueva que no bloquea.
3. **Metas de OL-06 no alcanzadas** (recall@10 0,71 y MRR 0,36–0,39 frente a 0,80 y 0,60): **Resuelto por referencia (usuario, 2026-10-20):** se atiende en ADR-45 (`ADR-45-mejora-recuperacion-ol06.md`) y en US-226…US-230; las metas de OL-06 siguen provisionales en US-017 y hoy no se cambian.
4. **HNSW frente a FLAT** con 522 vectores: la regla elige HNSW; FLAT es equivalente hoy. **Aceptado (usuario, 2026-10-20):** HNSW por la regla (equivalente a FLAT con 522 vectores).
5. **Tope de memoria — resuelto (2026-10-20):** LLM ≤ 21 GB y stack ≤ 30 GB. Con 12 pares el total estimado (29,7 GB) cabe con 0,3 GB de holgura y la holgura para macOS es de 2,3 a 6,1 GB; confirmar en la fase B con la pila real y subir la VM de Docker a ≥ 10 GB.

### Salvedades registradas en la revisión del Gate 2 (sin cambiar decisiones ni cifras)

1. **Sin evidencia con chunks de 1024 (insumo de US-056).** En el escenario decidido (`c1024-L512-P12`, 6 preguntas sin respuesta) el puntaje máximo de las preguntas sin evidencia es **0,570** en coseno denso (mediana 0,527) y **0,040** en el `relevance_score` del *reranker* bge-reranker-v2-m3 (sigmoide del puntaje crudo; mediana **0,012**). Las dos escalas **no son comparables entre sí**: cada bloque `sin_evidencia_puntaje_maximo` declara `escala_puntaje` (`coseno_denso` | `relevance_score_sigmoide`) en los reportes que se generen desde ahora. Con n = 6 la «mediana» publicada en los reportes ya medidos es la **mediana superior** (elemento 4.º de 6); el cálculo corregido (promedio de los dos centrales) rige para mediciones nuevas. El umbral de RN-02 (US-056) se calibra sobre el `relevance_score` del *reranker*, no sobre el coseno.
2. **Suma de presupuestos por etapa y supuesto del LLM.** Los presupuestos de p95 por etapa suman 500 + 4500 + 1500 = **6,5 s**; con el LLM supuesto de ~10 s la cota es **16,5 s > 15 s** si todas las etapas agotaran su presupuesto a la vez. El supuesto de 10 s para 800 tokens se calculó para el tope anterior de 16 GB de memoria del LLM, no para 21 GB, y **no incluye el *prefill*** de un contexto con chunks de 1024 tokens (12 chunks ≈ 12 000 tokens de entrada). La fase B (L1D-274 / US-224) debe medir el LLM real con ese prefill antes de fijar el presupuesto de la etapa.
3. **Riesgo de latencia aceptado por el humano (2026-10-20).** Riesgo **alto** aceptado: presupuesto del *reranker* de 4500 ms, margen de +0,2 s sobre el NFR de 15 s con un LLM de 10 s sin medir; se cierra en L1D-274. La VM de Docker debe ser **≥ 10 GB** para medir la fase B.
4. **Congelación de la fase A, A2 y A3 (2026-10-20).** `eval/configs/adr39-fase-a*.yaml`, `reports/adr39/*.json` y el dataset no se modifican; cualquier medición nueva va en archivos con fecha nueva. `adr39-fase-a.yaml` conserva `stack_memory_limit_gb: 30` y `llm_budget_gb: 21` aunque el reporte `2026-10-16-fase-a.json` se midió con 24 / 16; ningún descarte de la fase A fue por memoria, así que el reporte sigue siendo válido. Un test (`test_reproducibilidad_fase_a.py`) fija que esa es la única diferencia.
5. **Código remoto.** Solo el exportador de gte-multilingual-reranker-base (candidato C, no elegido) ejecuta código remoto (`trust_remote_code`), fijado al commit `40ced75c3017eb27626c9d4ea981bde21a2662f4` de `Alibaba-NLP/new-impl` (`CODIGO_REMOTO_FIJADO` en `config_medicion.py`); la medición no lo importa y el reranker decidido no lo requiere.

### Adenda de US-231b (2026-10-17): cómo se carga el NLI y de dónde salen sus clases

Sin cambiar ninguna decisión ni cifra del bloque de arriba (por eso `--check-config` no cambia):

1. **Mapeo de clases (`NLI_LABEL_INDEX_ENTAILMENT`, `NLI_LABEL_INDEX_NEUTRAL`, `NLI_LABEL_INDEX_CONTRADICTION`).** Son configuración
   versionada de `rag-orchestrator` (RN-22), no claves del bloque de ADR-39. Su origen es el `id2label` de la model card de la
   revisión fijada `b5113eb38ab63efdd7f280f8c144ea8b13f978ce`, que el responsable del aprovisionamiento transcribe a la configuración:
   la referencia es `entailment` = 0, `neutral` = 1, `contradiction` = 2, **a confirmar contra esa model card al exportar** (el
   valor lo fija la persona, no este documento). El servicio nunca lee el `config.json` del modelo en ejecución: un mapeo alterado
   que intercambiara `entailment` y `contradiction` invertiría el soporte (RN-01). La prueba del AC-1 de US-231b con los pares reales de
   FX-06a-c (`@pytest.mark.models`) detecta un mapeo invertido.
2. **Formato del ONNX fp32 del NLI.** Se reexporta en **un solo archivo** (sin `model.onnx.data`) junto con su `tokenizer.json`. Si
   un modelo trajera datos externos, exige el par `NLI_MODEL_DATA_PATH` / `NLI_MODEL_DATA_SHA256` verificado; sin él, el arranque
   falla cerrado nombrando la variable. `**/*.onnx.data` se ignora en `.gitignore` y en los dos `.dockerignore` (RN-14).
3. **Carga.** La sesión de ONNX Runtime se crea desde los **bytes que se acaban de hashear**, nunca desde una ruta sin verificar. El
   pico de memoria durante la carga incluye esos bytes hasta crear la sesión: se mide junto con el RSS en régimen (US-231b AC-7).
4. **Largo del par.** `NLI_MAX_LENGTH` (512 por defecto) acota el par (premisa, hipótesis); uno más largo falla cerrado en vez de
   recortar la hipótesis. L1D-180 elige el fragmento de premisa que envía.

## Fase B

> Change de L1D-274 (US-224). **Estado de la fase B: propuesto, con las mediciones pendientes.** Lo que ya existe es el
> protocolo, el script, el dataset de OCR y la configuración; **no hay todavía ninguna cifra de LLM, OCR ni p95 extremo a
> extremo**, porque se miden con modelos reales en la MacBook de referencia y esta sesión no tiene ni el hardware ni los
> modelos. Cada celda `pendiente` de las tablas la rellena el comando indicado; ninguna se estima. La decisión
> (runtime, LLM, motor OCR, `LLM_MODEL`) se toma con `python -m app.scripts.adr39 decidir` sobre los reportes medidos y
> pasa a «aceptado» cuando el usuario apruebe el PR con las cifras. Citas: `[S1 resp. 3, 5, 6, 10]`; reglas de
> decisión fijadas el 2026-10-20 antes de medir (`design.md` D3) y copiadas a
> `apps/rag-orchestrator/eval/configs/adr39-fase-b.yaml`.

### Reglas de decisión (fijadas antes de medir; no se modifican tras ver las cifras)

1. **Eliminatorias, en este orden** (la primera que falla descarta con su cifra): licencia académica/permisiva verificada
   (HAI-DEF = «condicionada»: se mide, pero solo se elige con aceptación escrita del usuario) → memoria del LLM
   (`ollama ps`, `num_ctx = 8192`, tras el prompt más largo) **≤ 21 GB** → memoria total del stack **≤ 30 GB** y swap sin
   crecer → JSON válido **≥ 99 %** de 200 llamadas → p95 de `POST /platform/evidence-analyses` **≤ 15 s** y p95 de extracción
   (OCR + estructuración) **≤ 60 s**.
2. **Calidad en español** (muestra de ≥ 20 salidas revisadas a mano por `ai-eval-runner`): fidelidad ≥ 0,90, 0 salidas
   prescriptivas (RN-23), 0 salidas en otro idioma, terminología clínica correcta.
3. **Elección:** mayor fidelidad; empate si difieren en una salida de la muestra (0,05 con n = 20) o menos, y gana la
   **menor memoria**. Un modelo más grande no gana por serlo.
4. **Nadie cumple 1 y 2:** se escala al usuario (US-012 AC-5); no se elige uno que incumpla (`decidir` sale con código 4).
5. **Margen < 1 GB** bajo 21 o 30 GB: se declara riesgo y se registra el respaldo con margen.

Implementadas como funciones puras en `app/scripts/adr39/reglas.py` (`descartar_por_restriccion`, `desempatar_por_memoria`,
`elegir_candidato`, `validar_contra_esquema`) y probadas en `tests/evaluation/test_adr39_reglas.py`. Una cifra no medida es
`null` y deja al candidato `pendiente`: nunca cuenta como 0 ni se elige con datos incompletos.

### Protocolo repetible y comandos (AC-5)

Protocolo común (D1): 3 corridas, mediana; se anotan versión de macOS, de Ollama/vllm-metal, *digest* del modelo,
`num_ctx`, temperatura, `OLLAMA_FLASH_ATTENTION`/`OLLAMA_KV_CACHE_TYPE`, RAM de la máquina, VM de Docker (≥ 10 GB) y si el
Compose estaba levantado. Los reportes (solo agregados) quedan en `reports/adr39/`; la plantilla de cada uno es
`reports/adr39/plantilla-fase-b.json`.

```bash
cd apps/rag-orchestrator
python -m app.scripts.adr39 runtime --runtime ollama --candidato A          # AC-1
python -m app.scripts.adr39 runtime --runtime vllm_metal --candidato A      # AC-1 (tras `vllm serve`, time-box 1 h)
python -m app.scripts.adr39 llm --muestras ~/adr39-muestras                 # AC-2: admisión por memoria y 3 x 200 llamadas por candidato admitido
python -m app.scripts.adr39 llm --candidato A,G --muestras ~/adr39-muestras # o un subconjunto
ADR39_PASSWORD=... python -m app.scripts.adr39 e2e --candidato A \
  --base-url https://localhost --origin https://localhost \
  --cuerpo ../../contracts/examples/evidence-analysis-request.json          # AC-3: 3 x 30 consultas con el stack levantado con LLM_MODEL=<tag de A>
python -m app.scripts.adr39 ocr --motor ocrmypdf-tesseract --tmpdir /tmp --vigilar /app   # AC-6, DENTRO del contenedor read_only con TMPDIR=/tmp en tmpfs
python -m app.scripts.adr39 decidir --motor-ocr ocrmypdf-tesseract --licencias-aceptadas ""  # tabla de decisión → stdout y reports/adr39/decision.json
```

- `e2e` se repite por cada candidato que pase la admisión (hay que reiniciar el stack con su `LLM_MODEL`) y deja
  `e2e-<id>.json`; la contraseña del usuario de prueba sintético `doc1@test.local` llega solo por `ADR39_PASSWORD`.
- Las salidas de la muestra de fidelidad (`--muestras`) van **fuera del repo**; `ai-eval-runner` las revisa a mano y deja
  `reports/adr39/revision-<id>.json` (`fidelidad`, `salidas_prescriptivas`, `salidas_otro_idioma`) y su reporte en
  `reports/eval/` (tarea 2.1).
- Perfil del S4: `--pipeline s4` en `e2e` (síntesis, aplicabilidad y agente) con el mismo protocolo; recalibra G-5.
- El OCR se mide **un motor por proceso** (la memoria pico es la del proceso) y en una imagen que traiga ese motor
  (`ocrmypdf` + `tesseract-ocr-spa`; `paddleocr` y `python-doctr` para los alternativos): la imagen de producción no los
  trae hasta FEAT-01b, así que hace falta una imagen de medición construida a partir del `Dockerfile` del servicio.
  Se pasa `--raiz` y `--config` si el repo se monta en otra ruta del contenedor.

### Runtime del LLM (AC-1)

| Runtime | Versión | (a) GPU Metal fuera de Docker | (b) API compatible con OpenAI | (c) JSON restringido por esquema | Resultado |
|---|---|---|---|---|---|
| Ollama (A) | pendiente (0.34.4 en el refinamiento) | pendiente (`ollama ps` → `100% GPU`) | pendiente | pendiente (¿lo aplica el runtime o solo se valida?) | pendiente |
| vllm-metal 0.1.0 | pendiente | pendiente (log de arranque y monitor de GPU) | pendiente | pendiente | pendiente: instalar `vllm` en `~/.venvs/vllm-metal` según su README (time-box 1 h) o descartar con el motivo y el comando probado |

Medición previa del refinamiento (no repetida aquí, `[S1 resp. 10]`, 2026-10-13, Ollama 0.34.4): `gemma4:26b-a4b-it-qat` =
15 GB residentes, 100 % GPU, ~79 tok/s, JSON con esquema correcto en **una** prueba. Un runtime sin uso real de GPU queda
descartado.

### LLM (AC-2)

Candidatos y licencias: los de la tabla de `design.md` D3 (A, B, C, E, F, G, H, I, J; **D `qwen3.6:35b-a3b-q4_K_M` descartado
sin medir** por el usuario, 2026-10-20, 24 GB > 21 GB). H, I y J: licencia **no verificada** (se verifica en la fuente al medir).
E y F: términos HAI-DEF, **condicionados** a la aceptación escrita del usuario (pendiente). El contexto de las llamadas
son las citas literales etiquetadas del golden de `data/eval/adr39-mini` (el pipeline del S1 recupera con los adapters reales de
US-231a/b; el ADR anotará cuál de los dos contextos se usó).

| Cand. | Tag | Digest | Memoria (GB) | tok/s (gen.) | JSON válido (200) | Fidelidad (muestra) | Estruct. p95 (ms) | p95 e2e (ms) | Stack (GB) | Estado |
|---|---|---|---|---|---|---|---|---|---|---|
| A | `gemma4:26b-a4b-it-qat` | `2dd70431afed` | pendiente | pendiente | pendiente | pendiente | pendiente | pendiente | pendiente | pendiente |
| B | `gemma4:12b-mlx` | `ded7a2735003` | pendiente | pendiente | pendiente | pendiente | pendiente | pendiente | pendiente | pendiente |
| C | `qwen3.5:9b-mlx` | `203e30078279` | pendiente | pendiente | pendiente | pendiente | pendiente | pendiente | pendiente | pendiente |
| D | `qwen3.6:35b-a3b-q4_K_M` | `07d35212591f` | — | — | — | — | — | — | — | descartado sin medir (24 GB publicados > 21 GB, usuario 2026-10-20) |
| E | `medgemma1.5:4b-it-q8_0` | `d6ae3cddb663` | pendiente | pendiente | pendiente | pendiente | pendiente | pendiente | pendiente | pendiente (HAI-DEF: condicionada) |
| F | `medgemma1.5:4b-it-bf16` | `32f17fbd85fe` | pendiente | pendiente | pendiente | pendiente | pendiente | pendiente | pendiente | pendiente (HAI-DEF: condicionada) |
| G | `gemma4:26b-a4b-it-q4_K_M` | `5571076f3d70` | pendiente | pendiente | pendiente | pendiente | pendiente | pendiente | pendiente | pendiente |
| H | `qwen3.6:27b-q4_K_M` | por registrar | pendiente | pendiente | pendiente | pendiente | pendiente | pendiente | pendiente | pendiente (licencia sin verificar) |
| I | `qwen3.5:27b-q4_K_M` | por registrar | pendiente | pendiente | pendiente | pendiente | pendiente | pendiente | pendiente | pendiente (licencia sin verificar) |
| J | `qwen3.5:27b-int4` | por registrar | pendiente | pendiente | pendiente | pendiente | pendiente | pendiente | pendiente | pendiente (licencia sin verificar; soporte INT4 en Ollama 0.34.4 sin comprobar) |

Los tamaños publicados no valen: vale `ollama ps` del día de la medición. **Contrastar** la admisión con la medición del
refinamiento (15 GB, 100 % GPU, ~79 tok/s) y anotar si el *prefill* de contextos largos desplaza esa cifra.

### p95 extremo a extremo (AC-3)

| Candidato en el stack | p95 total (ms) | p50 total (ms) | Errores | Memoria LLM (GB) | Pico Docker (GB) | Stack total (GB) | Swap creciente | `memory_pressure` libre (%) | RAM de la máquina (GB) |
|---|---|---|---|---|---|---|---|---|---|
| pendiente | pendiente | pendiente | pendiente | pendiente | pendiente | pendiente | pendiente | pendiente | pendiente |

Por etapa (gateway y desidentificación, recuperación *dense*, *reranker*, generación, validación de citas, NLI, persistencia
del `AIAnalysisRecord`): **no desglosado hoy**. El script lee `etapa=<x> … ms=<n> … traceId=<id>` de un log
(`--logs-etapas`), pero el pipeline actual de `rag-orchestrator` no emite tiempos por etapa (solo registra
`rag_query_generacion`, `recuperacion_fallo` y `meta.latencyMs` hasta el fin de la recuperación). Hasta que una historia añada ese
registro (sin contenido ni PHI), el ADR declara «no desglosado» en lugar de estimar. Si ninguna combinación cumple 15 s o
30 GB: US-012 AC-5, escalar el ajuste de G-5 / NFR-01 (las palancas medidas son recortar la salida, MTP con
`temperature = 0` y los respaldos B/C). La máquina de medición (M5 Pro de 48 GB) no es el equipo de referencia de 32 GB: no
afirmar «cabe en 32 GB» solo con la suma (repetir allí es recomendado, no bloqueante, decisión del 2026-10-20).

### OCR (AC-6)

Dataset `data/eval/ocr-mini/` (6 PDF escaneados en español de mama y próstata, ficticios, generados por `generar.py` con
semilla fija; `manifest.json` con `clase: sintetico`; verdad de terreno por campo crítico en `ground_truth.json`).

| Motor | Licencia | Exactitud por campo crítico (meta ≥ 0,95) | p95 por documento (meta ≤ 60 s) | Memoria pico (MB) | ¿Escribe a disco? ¿dónde? | Residuos en `TMPDIR` | Estado |
|---|---|---|---|---|---|---|---|
| OCRmyPDF + Tesseract `spa` (A) | por verificar en la fuente (OCRmyPDF MPL-2.0 y Tesseract Apache-2.0, de memoria) | pendiente | pendiente | pendiente | sí (directorio de trabajo con páginas e intermedios; a confirmar) | pendiente | pendiente |
| PaddleOCR (PP-OCRv5 latino) | por verificar (Apache-2.0, de memoria) | pendiente | pendiente | pendiente | puede escribir caché de modelos | pendiente | pendiente |
| docTR | por verificar (Apache-2.0, de memoria) | pendiente | pendiente | pendiente | puede escribir caché de modelos | pendiente | pendiente |
| Surya | GPL-3.0 + OpenRAIL-M con umbral comercial | — | — | — | — | — | **descartado por licencia** (`[S1 resp. 5]`) |

Un motor que necesite escribir fuera de `TMPDIR` o quitar `read_only` queda descartado con el motivo (se corrige con una
variable de directorio, nunca quitando `read_only`). El p95 de extracción de extremo a extremo es el p95 del OCR elegido más
el de la estructuración del LLM elegido (`decidir` suma ambos medianas y exige ≤ 60 s).

### Configuración resultante (AC-4)

| Variable | Valor | Estado |
|---|---|---|
| `LLM_BASE_URL` | `http://host.docker.internal:11434/v1` | ya vigente: runtime nativo fuera de Docker |
| `LLM_MODEL` | tag del candidato elegido, más su *digest* en este ADR | **pendiente** de la elección; sin literal en el código |
| `LLM_NUM_CTX` | `8192` (`[S1 resp. 10]`) | en `Settings`; **lo aplica el runtime** (`OLLAMA_CONTEXT_LENGTH=8192` en el servidor de Ollama): la API compatible con OpenAI no lo recibe por petición |
| `LLM_TEMPERATURE` | `0.0` (la del cliente actual) | en `Settings` y propagada al cliente del LLM; se actualiza si la medición fija otra |
| `LLM_CLOUD_ENABLED` | `false` | sin cambio (RN-12) |
| `OCR_ENGINE`, `OCR_LANGUAGES` | `ocrmypdf-tesseract`, `spa` | en `Settings` (valor por defecto = hipótesis A); los consume FEAT-01b; se cambia si la medición descarta A |

**Regresión [RN-12] activa desde S6 (US-050):** la regla de proveedores se verifica con estos valores cuando exista su test.

### Consecuencias obligatorias para FEAT-01b (adapter OCR, S2)

- El adapter crea un `tempfile.TemporaryDirectory(dir=TMPDIR)` **por request**, pasa esa ruta al motor y lo limpia en un
  `finally`, también si el motor falla o vence el *timeout* (al cancelar, se termina primero el subproceso del motor).
  Nunca se comparte un directorio entre requests.
- Su Pytest de integración reproduce el test de no-residuos en **tres casos**: extracción correcta, fallo del motor
  (motor falso que escribe y luego lanza) y *timeout* (motor falso que escribe y se bloquea más allá del *deadline*); en los
  tres `TMPDIR` queda vacío. El modelo está en `tests/evaluation/test_adr39_ocr.py`.
- El contenedor corre con `read_only: true` y `TMPDIR=/tmp` sobre un `tmpfs` cuyo tamaño es configuración (RN-22), con la
  caché de modelos en un volumen de solo lectura. RN-14: ningún PDF ni texto extraído persiste en el contenedor.
- La imagen de producción incorpora el motor elegido (hoy no trae ninguno).

### Desviaciones del `design.md`

1. **Esquema de validación del JSON.** El script valida contra `ESQUEMA_DE_GENERACION` (el esquema de la salida del LLM del
   S1, `app/application/generation.py`), que es lo que el LLM emite; `RagQueryInternalResponse` es la respuesta del endpoint,
   ensamblada después de validar citas y NLI, y no es lo que el modelo genera.
2. **Dos rutas HTTP a Ollama.** `llm` y `e2e` usan `/api/chat` (acepta `num_ctx`, `think: false` y entrega `eval_count` y
   `eval_duration` para tok/s y *prefill*); el adapter de producción usa `/v1/chat/completions`. `runtime` mide la ruta `/v1`
   (AC-1 b y c). Con vllm-metal no hay desglose de *prefill*/generación (solo `usage`).
3. **Dataset en `data/eval/ocr-mini/`** (la ruta de `tasks.md` y `design.md`), junto a `adr39-mini`, y no en `data/evaluation/`.
   La tipografía del generador debe tener tildes: toma DejaVu Sans (Linux) o Arial (macOS) y falla si no encuentra una; la usada
   queda en el manifiesto.
4. **Un motor OCR por proceso** y **un candidato del stack por corrida e2e** (hay que reiniciar el Compose con su `LLM_MODEL`).
5. **Memoria del stack:** `docker stats` se toma al terminar cada corrida (con el stack caliente) y se informa el pico de
   esas muestras más la memoria residente del LLM; no es un muestreo continuo.
6. **Settings:** además de las claves de `design.md` D7, `LLM_TEMPERATURE` llega al cliente del LLM (antes fija en 0);
   el valor por defecto no cambia el comportamiento.

### Pendiente humano para cerrar la fase B

1. Levantar Ollama y descargar los candidatos; correr `runtime`, `llm` y `e2e` (comandos arriba) y `ocr` en la imagen de
   medición; copiar las medianas a las tablas de este ADR.
2. Verificar en la fuente la licencia de H, I y J y registrar el *digest* (`ollama list`).
3. Decidir si se acepta por escrito la licencia HAI-DEF si E o F ganan (hoy **no aceptada**).
4. `ai-eval-runner` revisa la muestra de fidelidad y deja `revision-<id>.json` (tarea 2.1).
5. `decidir` → fijar `LLM_MODEL` (y `OCR_ENGINE` si cambia), cerrar el estado de este ADR y aprobar el PR.
6. Si el pipeline no emite tiempos por etapa, abrir la historia que lo añada antes de recalibrar G-5 en el S4.

## Pros y contras de las opciones

### A (BGE-M3 · bge-reranker-v2-m3 · mDeBERTa)

- A favor: mejor *embedding* medido; *sparse* propio; mejor *reranker* en calidad (MRR 0,49–0,51; 0,491 con la configuración decidida).
- En contra: el *reranker* tarda 3,2–4,0 s con chunks de 256 y 8,3 s con chunks de 1024 en 8 vCPU; con ello el p95 extremo a extremo estimado supera los 15 s.

### B (Qwen3-Embedding-0.6B · Qwen3-Reranker-0.6B)

- A favor: pesos pequeños; MRR del *embedding* fp32 el más alto (0,413).
- En contra: int8 degrada (0,449); el *reranker* usa 5,5–6,7 GB de RSS y 11–26 s por lote; sin *sparse* nativo.

### C (multilingual-e5-large-instruct · gte-multilingual-reranker-base)

- A favor: el *reranker* int8 es el más rápido (1140 ms) y ligero (el único dentro de 2000 ms).
- En contra: el *embedding* rinde la mitad (0,31) en español → inglés; el *reranker* exige código remoto y rinde menos (0,623).

## Más información

Reportes: `reports/adr39/2026-10-16-fase-a.json`, `reports/adr39/2026-10-16-fase-a2.json`, `reports/adr39/2026-10-20-fase-a3-reranker.json`. Dataset: `data/eval/adr39-mini` (NCI libre de copyright con crédito, PMC CC BY 4.0, ClinicalTrials.gov: *Source: ClinicalTrials.gov, National Library of Medicine*, sin aval de NLM). Bloquea o informa a: L1D-114 (US-058: dimensión e índice), L1D-115 (US-059: tamaño en tokens, solapamiento y estrategia; hoy `fragmentar()` corta por caracteres), L1D-106 (US-055), L1D-274 (US-224), US-072, US-073, ADR-41. Revisión prevista: al medir la fase B y cuando la imagen de L1D-164 esté mergeada.
