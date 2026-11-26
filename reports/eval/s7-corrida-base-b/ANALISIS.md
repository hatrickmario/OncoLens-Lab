# Corrida base B del S7 · análisis

> **Estado:** `no_validada`. Dataset sintético; ninguna pregunta ni caso tiene revisión del oncólogo.
> **Qué mide:** `main` en 33ae47db (estado tras O3, catálogo 1.9.0), antes de L1D-335 y L1D-336, con modelos locales:
> - LLM gemma4:26b-a4b-it-q4_K_M en `ollama serve` nativo, con contexto de 8192;
> - BGE-M3, bge-reranker-v2-m3 y mDeBERTa XNLI en ONNX.
>
> **Fechas:** del 2026-11-24 al 2026-11-26, en tres tandas, con la máquina compartida con otras cargas.
> **Uso:** es la referencia contra la que la corrida final F mide las mejoras de O4 a O6 (protocolo anti-sobreajuste de ADR-45).
> **Decisiones de la sesión:** en [`DECISIONES.md`](DECISIONES.md), DB-1 a DB-12.

## 1. Resumen

| Área | Resultado | Frente a la meta |
|---|---|---|
| Recuperación: recall@10, es→en y MRR | 0,906 / 0,914 / 0,887 | ✅ Holgada (metas 0,80 / 0,70 / 0,60) |
| Detección de «sin evidencia» | 0,942 | ✅ (≥ 0,90) |
| Precisión de citas | 1,0 | ✅ |
| Fidelidad NLI de afirmaciones | 0,842 (113: 0,849) | ❌ (≥ 0,90) |
| Opciones con cita y soporte | 0,692 (113: 0,698) | ❌ (≥ 0,90). Es el **cuello de botella del sistema** |
| Salidas prescriptivas (RN-23) | 0 | ✅ |
| Identidad en el hilo y los logs (RN-10/11) | 0 | ✅ |
| Opciones de L1D-246 (dataset `s5`) | fidelidad proxy 0,974, citas 1,0, con soporte 24 de 24 | ✅ |
| Segundo loop contextual: genéricas con evidencia | mama 22 de 22; próstata 9 y 13 de 22 | ⚠️ Próstata, bajo la meta de 18 |
| Población (L1D-299) | estados 9 de 9; cobertura por plantilla 0,078 | ⚠️ «No concluyente» (sin revisor) |
| p95 de la consulta, en proceso | 21,08 s (baseline) y 17,68 s (113) | ⚠️ Cerca del tope de 20 s |
| p95 de punta a punta por el BFF | 25,87 s | ❌ **Provisional** (DB-10): no vale como cifra definitiva |

**Lectura:** la recuperación ya no es el problema. Con 69 preguntas, falla en unas 6 de ellas, y 334 atribuye las pérdidas a etapas distintas, sin un patrón único. Lo que no llega a la meta es que **cada opción generada quede soportada por el NLI**:
- el LLM produce opciones o afirmaciones que el NLI no confirma contra los fragmentos citados;
- RN-01 las descarta, y es correcto que lo haga.

Las mejoras de O4 a O6 deben medirse sobre todo por este eje (opciones con soporte, fidelidad NLI) y por la cobertura de próstata, sin perder recuperación.

## 2. Recuperación y umbrales (L1D-119)

### 2.1 Baseline
- **Global:** recall@10 0,906, es→en 0,914, MRR 0,887, sin evidencia 0,942, citas 1,0.
- **Por tipo de cáncer:**

  | | recall | opciones con soporte |
  |---|---|---|
  | Mama | 0,935 | 0,750 |
  | Próstata | 0,879 | 0,639 |

- **Diferencia entre tipos:** próstata va por detrás en los dos ejes, coherente con su menor cobertura del segundo loop (§4).
- **Juez LLM:** 0,967, pero con kappa de 0,043 frente a la etiqueta. Un acuerdo casi aleatorio no sirve para decidir: el juez queda como informativo hasta que haya revisión humana.

### 2.2 Barridos (S7.11)

**`RETRIEVAL_TOP_K`** (con `RERANKER_MAX_PAIRS=20`):

| Valor | recall@10 | MRR | Sin evidencia | Opciones con soporte |
|---|---|---|---|---|
| 10 | 0,906 | 0,863 | 0,928 | 0,708 |
| **20** | **0,953** | **0,898** | **0,986** | 0,692 |
| 30 (actual) | 0,906 | 0,887 | 0,942 | 0,695 |
| 50 | 0,922 | 0,880 | 0,957 | 0,695 |

- **Curva no monótona:** con 30 o 50 candidatos, el corte a 20 pares deja fuera candidatos que con 20 llegaban al reranker. Lo que se ve es la interacción del corte de pares con el orden de fusión, no un óptimo de `top_k`.
- **Ganancia:** +0,047 en recall son unas 3 preguntas. Es pequeña pero consistente en las tres métricas de recuperación.
- **Decisión:** se propone 20 (DB-5) y lo confirma el brazo «umbrales calibrados» de F. L1D-336 (ventanas de chunk) cambia el corte, así que el valor de B no se traslada tal cual.

**`RELEVANCE_THRESHOLD`:**
- Idéntico entre 0,20 y 0,50; 0,10 gana por una pregunta de 69.
- Se propone **mantener 0,30** (DB-5): la diferencia está dentro del ruido y bajar el filtro admite chunks menos relevantes.

**`NLI_ENTAILMENT_THRESHOLD`:**

| Umbral | 0,5 | 0,6 | 0,7 (actual) | 0,8 | 0,9 |
|---|---|---|---|---|---|
| Opciones con soporte | 0,789 | 0,748 | 0,670 | 0,667 | 0,607 |

- La recuperación no cambia con este umbral.
- Ningún valor llega a 0,90, y bajarlo infla de forma circular la métrica que el propio NLI mide.
- Se propone **mantener 0,70** (DB-5).
- **Hallazgo:** entre 0,5 y 0,7 se pierden 12 puntos. Muchas afirmaciones quedan con *entailment* entre 0,5 y 0,7: la generación parafrasea más de lo que el NLI acepta. Es el objetivo natural de los cambios de prompt o de afirmaciones atómicas, no del umbral.

### 2.3 Brazos no medidos
- **8.5, híbrido A0/A2/A2b:** la config no carga (DB-8).
- **8.6, reescritura:** sin runner (DB-4).

Los dos quedan como deuda.

### 2.4 Ingesta (L1D-119, AC-7)
- **Corpus:** 717 chunks vigentes.
- **Extracción de población:** **0 extracciones** de HER2, receptores hormonales, BRCA y extensión en los documentos **en español**.
- **Metadatos pendientes:** los de `pmc-prostata-darolutamida-japon-eca` quedaron pendientes (`SalidaInvalida`, sin descartar el documento).
- **Consecuencia:** una opción respaldada por una fuente en español no hereda estados de población, así que su aplicabilidad queda en Desconocido. En el p95 de punta a punta, la consulta de mama da `desconocido=24`.

## 3. Generación, opciones y chat

| Familia | Cifra clave | Lectura |
|---|---|---|
| 113 `--suite all` (misma configuración que el baseline) | recall, MRR, citas y sin evidencia idénticos; fidelidad 0,849; opciones con soporte 0,698; `no_inferencia` 5 de 5 | Diferencias de ±0,007 frente al baseline: es la **varianza del LLM entre corridas**. Una mejora en F tiene que superar ese margen para contar |
| 246 opciones `s5` | fidelidad proxy 0,974 (38 de 39), citas 1,0, esperadas presentes 0,80 (24 de 30), orden RN-28 12 de 12 | Con preguntas acotadas, las opciones que salen están soportadas. El 20 % de opciones esperadas ausentes es cobertura, no fidelidad |
| 326 chat `chat-v1` | prescriptivas 0, identidad 0, intent 0,917 (1 de 12 mal clasificado) | Cumple RN-23 y RN-10/11 |
| 326 por tipo | mama: soporte 0,667 con 3 afirmaciones; próstata: 1,0 con 8 | n de 2 a 8: indicativo. Faltantes no medidos (D6-51) |

**Diferencia entre 246 y 119.** 246 da 0,974 de fidelidad y 119 da 0,69 de opciones con soporte. No se contradicen:
- 246 mide las afirmaciones de las opciones que se muestran;
- 119 cuenta cuántas opciones generadas sobreviven a RN-01.

El sistema es fiel en lo que muestra, pero descarta una fracción alta de lo que genera.

## 4. Segundo loop contextual (L1D-329, 331, 333 y 334)

| Caso | Expansión activa | Expansión apagada | Meta |
|---|---|---|---|
| Mama | 22 de 22 | 0 de 22 | 18 |
| Próstata con grado | 9 de 22 | 1 de 22 | 18 |
| Próstata con PSA y HRR | 13 de 22 | — | 18 |

- **Efecto de la expansión:** sin ella, las preguntas genéricas no tienen evidencia (1 de 44).
- **Próstata, sin cobertura suficiente:** los términos de próstata del catálogo 1.9.0 no recuperan bastante. Es el objetivo de L1D-335 (sinónimos y procedimientos, ya mergeado en #436 después de B) y de O5.
- **Adversarias:** 1 falso positivo de 24 en cada caso de próstata y 0 en mama. Bajo, pero F debe vigilar que la ampliación de sinónimos no lo suba.
- **Sinónimos:** 6 de 6.

**333, pares del reranker (20 frente a 12):**

| Métrica | 20 pares | 12 pares |
|---|---|---|
| recall@10 | 0,906 | 0,875 |
| MRR | 0,887 | 0,849 |
| Reranker p95 | 2,45 s | 1,72 s |

- Con 12 pares la latencia de la consulta completa no cambia, porque domina la generación.
- **Decisión:** se mantienen 20.

**334, diagnóstico por etapas.** De 12 preguntas fallidas, hay 1 pérdida por embedding denso, 1 por umbral, 1 por NLI y 9 sin pérdida atribuible, con 0 salidas inválidas. No hay una etapa dominante que justifique un cambio estructural de la recuperación.

## 5. Población (L1D-299)
- **Robustez de la extracción:**
  - concordancia de estados 9 de 9;
  - 0 cortes de bucle en 24 pares (OUT-06 cerrada);
  - 0 cortes por longitud en 228 tareas;
  - 0 duplicados;
  - 0 violaciones de RN-02.
- **Cobertura:** baja, 0,078 (5 de 64) con precisión de 0,625.
  - Con redacción «difícil», 0 de 12.
  - ECOG, 0 de 16.
- **Veredicto:** «no concluyente» por falta de revisor.
- **Lectura:** la extracción es segura pero conservadora. Coincide con las 0 extracciones en español de §2.4.

## 6. Latencia

| Medición | p95 | Generación | Reranker | NLI |
|---|---|---|---|---|
| 119 baseline, en proceso (con swap y otras cargas) | 21,08 s | 17,1 s | — | — |
| 113, en proceso | 17,68 s | 15,1 s | 2,9 s | 0,70 s |
| 333 p20, en proceso | ~14,8 s | — | 2,45 s | — |
| **De punta a punta por el BFF, Docker** (90 consultas, 3 corridas) | **25,87 s** (p50 25,36 s) | ~12,9 s | ~6,3 s | ~7,1 s |

El desglose de punta a punta salió «no desglosado» en el script. Lo reconstruí con las marcas de tiempo de los eventos `rag_query_*` del log del orquestador, por `traceId`: entre `corte` y `chat_evidencia_prompt` (reranker), entre `chat_evidencia_prompt` y `rag_query_generacion` (LLM), y el `latencyMs` del evento `rag_query_soporte` (NLI).

**Hallazgo principal.** El exceso de punta a punta **no está en el LLM**, que corre nativo y tarda lo mismo o menos. Está en el **NLI (unas 10 veces más lento) y el reranker (unas 2 veces)** dentro del contenedor de `rag-orchestrator`.

Hipótesis, sin verificar:
- **CPU de la VM:** la VM de Docker tiene 8 CPU, compartidas con Milvus y Postgres. `MODEL_INTRA_OP_THREADS=8` compite por ellas.
- **ONNX Runtime:** el de Linux arm64 en la VM puede rendir menos que el nativo de macOS.
- **Swap:** había 20,7 GB de swap al inicio.

Con los valores en proceso, la consulta de punta a punta rondaría los 18 a 19 s. Por eso:
- el p95 de punta a punta se **repite tras un reinicio** (DB-6 y DB-10);
- la configuración de hilos y CPU del contenedor queda como deuda, con medición propia (DB-10).

**Errores:** 1 de 90 consultas falló con `OperationalError` en la etapa `catalogo`. Fue la primera consulta, justo tras reiniciar Postgres (DB-11). No es un fallo del sistema bajo carga.

## 7. Memoria
- **`llama-server`:** RSS de hasta 26,6 GB (en `top`, en la tanda 1) y 20,8 GB (en `ps`, en la tanda 2), frente al tope de 21 GB de ADR-39. `ollama ps` informa 17 GB.
  - Lo más probable es que `top` cuente memoria comprimida y mapeada.
  - Hay que medirlo con un criterio único antes de afirmar que se excede (deuda).
- **NLI:** pico de RSS de 11,4 GB en el baseline y de 6,1 GB en 113, frente al límite de 4,5 GB que declara la suite (deuda).
- **Swap:** máximo de 24,9 GB en la tanda 2 con Docker, el LLM y Python juntos. Ninguna familia se detuvo por el freno.

## 8. Qué se lleva la corrida final F
1. **Medir contra B** con margen: las diferencias de ±0,01 en fidelidad y opciones son ruido del LLM (113 frente a 119).
2. **Ejes de mejora esperados:**
   - opciones con soporte y fidelidad (O5 y O6);
   - cobertura de próstata en el segundo loop (L1D-335 y O5);
   - recuperación con ventanas de chunk (L1D-336).
3. **Ejes que no pueden empeorar:** recall@10, MRR, sin evidencia, citas, prescriptivas 0, identidad 0 y adversarias.
4. **p95 de punta a punta:** repetirlo tras reiniciar y con la nota de CPU y hilos del contenedor, para separar el efecto de Docker del de los cambios del sprint.

## 9. Deuda que deja B (pendiente de registrar en el backlog con aprobación)

| # | Deuda | Origen |
|---|---|---|
| 1 | `s4-hibrida.yaml` sin `tolerancia_retroceso`: 119 8.5 no medible | DB-8 (D4-21 abierta) |
| 2 | `contextual-local-apagado.yaml` sin `genericas_con_evidencia_minimo` | DB-9 |
| 3 | Brazo de reescritura sin runner en `evaluate` | DB-4 (D4-30 abierta) |
| 4 | NLI y reranker de 2 a 10 veces más lentos en Docker; revisar CPU de la VM y `MODEL_INTRA_OP_THREADS` | DB-10 |
| 5 | Pico de RSS del NLI por encima del límite de la suite | §7 |
| 6 | RSS de `llama-server` frente al tope de 21 GB: criterio de medida único | §7 |
| 7 | 0 extracciones de población en documentos en español | §2.4 (AC-7 de 119) |
| 8 | Metadatos de `pmc-prostata-darolutamida-japon-eca` pendientes (`SalidaInvalida`) | §2.4 |
| 9 | El script de p95 de punta a punta no reconoce el formato JSON de los eventos `rag_query_*` | §6 |
