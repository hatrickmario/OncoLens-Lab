# ADR-0001 — Evaluación y selección de modelos locales

- **Estado:** Propuesto (borrador; la decisión no está tomada)
- **Fecha:** 2026-09-25
- **Decisores:** autor del proyecto; revisión clínica puntual del oncólogo para los criterios de calidad clínica
- **Relacionado con:** `docs/review/propuesta-de-solucion.md` (D-03, D-04, D-04b, D-17, D-18; N-01, N-02; T-1, T-3, T-5, T-6), README §1.4 (ADR de OCR y LLM), §2.6 (evaluación del RAG), §3.3 #7

> La numeración de este ADR es provisional; se puede renumerar al formalizar el resto de ADRs pendientes (§2.3 del README).

## 1. Contexto

OncoLens es un MVP académico que corre **íntegramente en local**, en una MacBook Pro M5 con 32 GB de memoria unificada:
- Los documentos clínicos no salen a la nube (D-03).
- El LLM y los *embeddings* son configurables, con local por defecto (D-04b).
- Los datos reales anonimizados solo se procesan con modelos locales (T-6.4).

Restricciones conocidas:
- **N-01:** Docker en macOS no expone la GPU (Metal) a los contenedores. El LLM corre de forma nativa con **Ollama o vLLM** (D-17). *Embeddings*, *reranker* y NLI se proponen en CPU dentro de `rag-orchestrator`.
- **N-02:** los 32 GB se comparten con PostgreSQL, Milvus (con etcd y MinIO), las tres apps, el OCR, macOS y las herramientas de desarrollo.
- **Idioma:** las preguntas y los documentos clínicos pueden estar en español o en inglés, y la evidencia también (D-04). La respuesta sale en el idioma de la pregunta (D-05).
- **Latencia:** `/rag/query` con p95 ≤ 15 s (KR2 del Sprint 1, a calibrar); OCR con p95 ≤ 60 s por documento (KR2 del Sprint 2).

Cambiar el modelo de *embeddings* después obliga a **reindexar todo el corpus**. Por eso esta decisión se toma al inicio del Sprint 1.

## 2. Decisiones que cubre este ADR

| # | Componente | Uso en OncoLens |
|---|---|---|
| 2.1 | **Runtime del LLM** (Ollama o vLLM, nativo) | Servir el LLM con aceleración de GPU y API compatible con OpenAI |
| 2.2 | **LLM de generación y estructuración** (y su cuantización) | Responder consultas RAG con JSON estructurado; estructurar el texto extraído de documentos clínicos (T-1); expansión bilingüe de la consulta (T-3) |
| 2.3 | **Modelo de *embeddings*** | Vectores *dense* (Sprint 1) y *sparse* (Sprint 3) multilingües |
| 2.4 | ***Reranker*** | Reordenar resultados y producir `relevance_score` (P2-10) |
| 2.5 | **Modelo NLI** | Chequeo de soporte de las afirmaciones (T-5.1) |
| 2.6 | **Motor de OCR** | Páginas escaneadas; la capa de texto digital se extrae sin OCR (P3-08) |

## 3. Criterios de decisión

### 3.1 Restricciones duras (un candidato que no las cumple queda fuera)

| ID | Restricción | Cómo se verifica |
|---|---|---|
| R1 | Memoria total del stack ≤ presupuesto (propuesta: ≤ 24 GB, dejando ≥ 8 GB para macOS y herramientas) | Pico medido con todo el stack levantado y una consulta RAG más una extracción en curso |
| R2 | p95 de `/rag/query` ≤ 15 s con el corpus semilla | 50 consultas del dataset, en caliente, reportando p50 y p95 |
| R3 | p95 de extracción ≤ 60 s por documento | Set `ocr_gold` |
| R4 | Licencia compatible con uso académico y, en lo posible, con el uso futuro como herramienta clínica | Revisión de la licencia del modelo |
| R5 | Soporte real de español | Métricas sobre el subconjunto en español ≥ umbral (ver 3.2) |
| R6 | Salida JSON conforme a un esquema (LLM) | ≥ 99% de respuestas válidas contra el esquema en el dataset |
| R7 | El runtime usa efectivamente la GPU de la M5 | Verificación con monitor de actividad o *logs* del runtime; comparación con la ejecución en CPU |

### 3.2 Criterios de calidad (se comparan entre los candidatos que cumplen R1–R7)

Datasets y métricas de T-5.2 (`data/evaluation/`):

| Componente | Métrica principal | Métricas secundarias |
|---|---|---|
| *Embeddings* (+ expansión) | Recall@10 total y del subconjunto ES→EN | MRR, tiempo de indexación del corpus |
| *Reranker* | Precisión@3 tras el *rerank* | Calibración del puntaje (relevante vs. no relevante), latencia |
| LLM (generación) | Fidelidad (afirmaciones con soporte) | Precisión de citas, exactitud de "sin evidencia", respeto del idioma de la pregunta, tokens por segundo |
| LLM (estructuración) | Exactitud por campo crítico (valor normalizado) | Exactitud por campo no crítico, tasa de valores sin anclaje textual (T-1.1) |
| NLI | Exactitud de soporte / no soporte en pares ES↔EN anotados | Latencia por afirmación |
| OCR | Exactitud por carácter y por campo en páginas escaneadas | Latencia por página, memoria |

## 4. Candidatos a evaluar

Los nombres de modelos y versiones concretos se fijan **en la fecha de ejecución** del ADR, porque este campo cambia rápido. La lista inicial es orientativa y debe revisarse entonces.

| Componente | Candidatos iniciales |
|---|---|
| Runtime | Ollama (nativo, Metal) · vLLM (nativo; verificar el soporte de GPU en Apple Silicon en la versión vigente) |
| LLM | Modelos abiertos instruct de 7–8B con buen desempeño multilingüe (p. ej., familias Qwen, Llama, Mistral, Gemma) en cuantización de 4 bits. Un modelo de ~14B como candidato "techo", solo si cumple R1 y R2. Variantes biomédicas si existen en un tamaño compatible y con licencia adecuada. |
| *Embeddings* | BGE-M3 (dense + sparse, multilingüe) · multilingual-e5-large (solo dense; exigiría *sparse* aparte) |
| *Reranker* | bge-reranker-v2-m3 (multilingüe) · alternativa multilingüe de tamaño similar |
| NLI | Cross-encoder NLI multilingüe (familia mDeBERTa-v3 entrenada en XNLI o similar) |
| OCR | Tesseract (`spa` + `eng`) · PaddleOCR (CPU ARM64) |

## 5. Método

1. Levantar el stack completo con el corpus semilla y los datasets de T-5.
2. Para cada combinación candidata, correr la suite de evaluación y el protocolo de latencia y memoria (3 corridas; reportar la mediana).
3. Descartar las combinaciones que no cumplen R1–R7.
4. Entre las restantes, elegir la de mejor métrica principal por componente. En caso de empate (diferencia < 2 puntos porcentuales), elegir la de menor memoria.
5. Registrar los resultados en `data/evaluation/results/adr-0001/` (configuración, versiones, cuantización, métricas).
6. Fijar las versiones elegidas en la configuración (variables de entorno o `domain/`) y documentar la descarga de modelos en §1.4 del README.

## 6. Decisión

*Pendiente. Se completa al ejecutar el método de la §5.*

| Componente | Elegido | Versión / cuantización | Justificación (métricas) |
|---|---|---|---|
| Runtime | — | — | — |
| LLM | — | — | — |
| *Embeddings* | — | — | — |
| *Reranker* | — | — | — |
| NLI | — | — | — |
| OCR | — | — | — |

## 7. Consecuencias (a completar)

- Presupuesto de memoria resultante por componente y límites (`mem_limit`) en Compose.
- Cambiar el modelo de *embeddings* obliga a reindexar; cambiar el LLM, el *reranker* o el NLI obliga a volver a correr la suite de T-5 (Definition of Done).
- Riesgos residuales y condiciones para reabrir este ADR (p. ej., un nuevo modelo que mejore la fidelidad en español más de X puntos, o un cambio de hardware).
