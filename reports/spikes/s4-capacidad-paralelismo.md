# Spike US-240 (L1D-290): capacidad y paralelismo de la extracción de población

Fecha: 2026-10-30. Rama `spike/l1d-290`. Solo métricas agregadas (RN-14); el script del spike vive fuera del repo (AC-6).

## 1. Qué se midió y con qué

- Tarea: una llamada corta por (documento, criterio), JSON estricto `{"values":[{value,chunkId,scope}]}` con `maxItems` 3, `temperature` 0, `reasoning_effort: none`, vía `/v1/chat/completions` (misma forma que el adapter de producción).
- Entrada: los 10 documentos del corpus público de la semilla (`data/raw/seed`, licencia aceptada) × 6 criterios (subtipo, estadio, línea, biomarcadores, edad, ECOG) = **60 tareas** por nivel, mismo orden en todos los niveles. Sin pacientes (RN-13).
- LLM: `gemma4:26b-a4b-it-q4_K_M` (ADR-39), Ollama 0.40.6, `OLLAMA_CONTEXT_LENGTH=8192`, `OLLAMA_FLASH_ATTENTION=1`. Para variar `OLLAMA_NUM_PARALLEL` se arrancó una instancia temporal propia en el puerto 11435 (apagada al terminar); la del usuario (11434) no se tocó. Cada nivel usa `OLLAMA_NUM_PARALLEL` = solicitudes simultáneas.
- NLI: mDeBERTa fp32 ONNX en CPU (`~/adr39-modelos/nli`), proceso aparte.

### Limitaciones declaradas (leer antes de usar las cifras)

1. **El equipo no es el de referencia:** tiene 48 GB de RAM, no 32 GB. Un OOM o un swap del MacBook de 32 GB **no se pudo observar**; las cifras de memoria dicen cuánto se usó, no si cabría en 32 GB.
2. **Stack de Compose no levantado** (no había contenedores; VM de Docker de 12,65 GiB, sin medir bajo carga). Se midió el LLM y el NLI por separado; la memoria total del stack ≤ ~30 GB **no está verificada**.
3. **Selección de fragmentos aproximada:** los k fragmentos (1024 tokens BGE-M3) se eligen por puntuación léxica de palabras clave del criterio y de secciones típicas, no con la búsqueda híbrida/densa de producción. El prompt es un borrador, no `poblacion_v1`.
4. **Sin conjunto dorado:** "valores en el fragmento" (el valor aparece como subcadena del fragmento citado) es una señal de verificabilidad, no de precisión clínica (eso es US-233b).
5. **`size`/`size_vram` de `/api/ps` poco fiable:** el muestreo dio 16,2 GB en el nivel 1 pero 1,4 a 2,7 GB en el resto, con el mismo modelo cargado; no se diagnosticó. El único valor coherente con el tamaño del modelo (18,0 GB en disco, q4_K_M) es el del nivel 1. El RSS de procesos `ollama` (incluye el servidor de la app del usuario, inactivo) y `swap` están contaminados por otras aplicaciones del equipo (swap de partida 1,5 GB). No se atribuye el swap al spike.
6. Una misma tarea repetida responde en ~0,6 s (caché de prefijo): la "tarea caliente" no es representativa y no entra en las estadísticas.
7. El arranque en frío (carga del modelo + primera tarea) se midió una vez por nivel: 9,4 / 6,9 / 5,1 s (y 4,8 a 6,2 s en las otras corridas).

## 2. Tiempos por nivel (AC-1)

k = 4 fragmentos por tarea, 60 tareas por nivel, `max_tokens` 1024 (sin truncar, para ver la distribución real).

| Solicitudes simultáneas | `OLLAMA_NUM_PARALLEL` | p50 por tarea | p95 por tarea | máx | tareas/min | `finish_reason` | JSON válido |
|---|---|---|---|---|---|---|---|
| 1 | 1 | 5,40 s | 7,29 s | 8,65 s | 11,5 | 60 `stop` | 60/60 |
| 2 | 2 | 11,76 s | 18,90 s | 20,12 s | 11,2 | 60 `stop` | 60/60 |
| 4 | 4 | 22,08 s | 35,86 s | 52,13 s | 11,8 | 60 `stop` | 60/60 |

Conclusión: **el rendimiento total no sube con la concurrencia** (11,2 a 11,8 tareas/min, dentro del ruido); la GPU es el cuello de botella y cada tarea solo espera más. La latencia por tarea sube casi linealmente. Prefijo de prompt: p50 4045 / máx 4790 tokens; salida: p50 145 / p95 180 a 194 / **máx 220 tokens** en los tres niveles. 0 tareas con `finish_reason=length`.

## 3. Memoria (AC-2)

| Nivel | `OLLAMA_NUM_PARALLEL` | `ollama ps` size / size_vram (máx. muestreado) | RSS procesos ollama (máx.) | memoria disponible mínima | swap usado (mín.–máx.) |
|---|---|---|---|---|---|
| 1 | 1 | 16,2 GB / 16,2 GB (contexto 8192) | 26,8 GB | 5,3 GB | 1,52–3,41 GB |
| 2 | 2 | 1,8 GB / 1,8 GB (ver limitación 5) | 27,2 GB | 5,5 GB | 3,37–3,40 GB |
| 4 | 4 | 2,7 GB / 2,7 GB (ver limitación 5) | 29,5 GB | 4,8 GB | 3,37–5,10 GB |

- **LLM ≤ 21 GB:** el único valor fiable de `size` (16,2 GB, nivel 1) cumple. A más ranuras la caché KV se multiplica por `NUM_PARALLEL`; el RSS sube de 26,8 a 29,5 GB (+2,7 GB) entre los niveles 1 y 4, coherente con ADR-47 (margen de ~0,7 GB en 32 GB) pero **no concluyente** por las limitaciones 1 y 5.
- **Stack ≤ ~30 GB:** no se puede afirmar. El RSS observado solo del LLM (26,8 a 29,5 GB, incluye ruido de otros procesos ollama) ya roza ese tope antes de sumar Compose (Milvus, PostgreSQL, rag-orchestrator, clinical-api, web) y el NLI. Debe confirmarse en el MacBook de 32 GB con el stack arriba antes de fijar `NUM_PARALLEL` > 1.
- **NLI (fp32, CPU, 29 premisas de 350 palabras reales, hipótesis corta):** RSS 50 MB → **3,1 GB tras cargar** (carga 0,32 s) y **pico 5,9 GB** con lotes de 18 pares. Latencia: lote 1 p50 0,090 s / p95 0,100 s; lote 8 p50 1,09 s (136 ms/par); lote 18 p50 2,66 s (148 ms/par, **una sola muestra**). Una verificación por valor ≈ 0,1 s: 6 criterios × hasta 3 valores ≈ 18 hipótesis por documento ≈ 2 a 3 s, despreciable frente al LLM.

## 4. Nivel que falla (AC-3)

Criterio de corte: OOM, swap o p95 > 2× el del nivel 1 (7,29 s → 14,58 s).

- Nivel 2: **falla** (p95 18,90 s = 2,6×). Sin OOM.
- Nivel 4: **falla** (p95 35,86 s = 4,9×; máx 52 s; el swap llegó a 5,1 GB, aunque parte es ruido del equipo).
- Nivel 1: no falla. `POPULATION_EXTRACTION_CONCURRENCY` = **1**.

Un nivel 2 o 4 no gana tiempo total de ingesta (≈ 5,2 min para las 60 tareas en los tres niveles: 313, 323 y 305 s), así que no compensa su coste de memoria. La ingesta de 10 documentos × 6 criterios cae en la horquilla de 3 a 8 min que ADR-47 daba como estimación.

## 5. Efecto de k fragmentos por tarea

Mismas 20 tareas, concurrencia 1, `NUM_PARALLEL` 1:

| k | prompt p50 / máx (tokens) | p50 | p95 | tareas/min | valores devueltos | valores presentes en un fragmento citado |
|---|---|---|---|---|---|---|
| 2 | 2119 / 2423 | 4,35 s | 5,88 s | 14,8 | 35 | 34 de 35 |
| 4 | 4064 / 4513 | 7,65 s | 9,01 s | 8,7 | 42 | 42 de 42 |
| 6 | 6031 / 6625 | 9,64 s | 11,23 s | 6,6 | 45 | 42 de 45 |

(El p50 de k = 4 en estas 20 tareas es mayor que el de las 60 del nivel 1 porque la muestra es distinta.) Con k = 6 el prompt llega a 6,6 mil de 8192 tokens de contexto, sin margen para criterios con fragmentos más largos. Con `NUM_PARALLEL=4` y una sola solicitud el p50 es 7,26 s frente a 7,65 s con `NUM_PARALLEL=1` (mismas 20 tareas): reservar ranuras no cuesta tiempo, pero sí memoria.

## 6. Presupuesto del plazo en la consulta

Una tarea caliente a k = 4: p50 5,4 s, p95 7,3 s, máx 8,65 s. Con el modelo descargado se suma el arranque en frío (4,8 a 9,4 s). Con concurrencia 1, las tareas pendientes se encolan: cada una añade ~5 a 7 s. Con el p95 de `/platform/evidence-analyses` ≤ 15 s (a recalibrar en el S5) y la generación y el NLI ya consumiendo el LLM, el respaldo solo cabe **una tarea** por consulta; el resto de criterios pendientes quedan "Desconocido" sin bloquear (RN-26).

## 7. Valores propuestos para l1d-292 / US-244

| Clave | Valor propuesto | Justificación | Incertidumbre |
|---|---|---|---|
| `POPULATION_EXTRACTION_CONCURRENCY` | **1** | §2, §4: rendimiento plano, p95 > 2× desde 2 | Baja para este modelo y Ollama; se reevaluaría con otro runtime/modelo |
| `OLLAMA_NUM_PARALLEL` | **1** | §3, §4: más ranuras multiplican la KV sin ganar tareas/min | Baja |
| `POPULATION_EXTRACTION_TOP_K` | **4** | §5: k = 2 pierde valores (35 vs 42) y k = 6 cuesta +26 % de tiempo con prompt de 6,6 mil tokens | Media: selección léxica, sin conjunto dorado; recalibrar con la búsqueda real y US-233b |
| `POPULATION_EXTRACTION_MAX_OUTPUT_TOKENS` | **512** | §2: máx observado 220 (p95 ≤ 194), 0 `length`; con `maxItems` 3 y valor ≤ 200 caracteres el peor caso ronda ~300; 512 deja margen sin permitir divagar | Baja a media: otro prompt (`poblacion_v1`) puede cambiar la salida |
| `POPULATION_FALLBACK_DEADLINE_MS` | **10000** (plazo total del respaldo, 1 tarea) | §6: cubre p95 (7,3 s) y máx (8,65 s) de una tarea caliente; no cubre el arranque en frío ni una segunda tarea | **Alta:** depende del reparto con el p95 de 15 s del análisis, que se recalibra en el S5; es una decisión de diseño apoyada en la medición, no una medida directa |

`.env.example` y Compose no se tocan en esta rama (restricción del encargo); el AC-4 lo cierra l1d-292 con estos valores y la cita de las secciones 2 a 6.

## 8. Pendiente fuera del alcance medido

Repetir los niveles 1 y 2 en el MacBook de 32 GB con Compose arriba para verificar el tope de 30 GB y el swap; medir con la búsqueda de producción y `poblacion_v1` (US-233b).
