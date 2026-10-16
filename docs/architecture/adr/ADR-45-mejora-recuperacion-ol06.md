# ADR-45 — Mejora de la recuperación frente a las metas de OL-06: diagnóstico, protocolo anti-sobreajuste y plan por ablaciones

> Linear: pendiente (sin publicar) · Historias: US-226…US-230 (borrador en [`FEAT-T5e`](../../../backlog/features/FEAT-T5e-mejora-recuperacion.md)) · Relacionado: ADR-39, US-072, US-073, DEC-07 (US-017), US-112, US-113
> Plantilla: MADR 4 (variante mínima, en español).
> **Numeración:** se pidió ADR-44, pero **ADR-44 ya está asignado** a "Stack de observabilidad" (US-028, FEAT-PL5, Post-MVP; `backlog/02-adrs.md` §4, `backlog/features/FEAT-PL5-hardening-observabilidad.md`). Los IDs publicados son inmutables, así que este ADR toma el **45** (ningún otro documento del repositorio lo usa).

- **Estado:** propuesto (lo acepta el humano; ver "Puntos que decide el humano")
- **Fecha:** 2026-10-16
- **Decisores:** usuario (propietario del producto); oncólogo asesor para el dataset y la auditoría del golden
- **Consultados / informados:** ai-services-dev (análisis), ai-eval-runner (ejecutará las ablaciones), design-principles-reviewer
- **Requisitos:** G-3, FR-09, FR-20, IA-02, M-06.1, RN-02, RN-12, RN-13, RN-14, RN-21, RN-22, RN-27, TBD-02; OL-06

> **Alcance y honestidad de las cifras.** Este ADR **no ejecuta ningún modelo ni mide nada nuevo**. Todas las cifras de recuperación son las ya publicadas en ADR-39 (`reports/adr39/2026-10-16-fase-a.json` y `-fase-a2.json`, rama `feat/l1d-102-adr39-embeddings-reranker-nli`). Cada afirmación lleva su nivel de evidencia: **[medido]** (informe de ADR-39), **[derivado]** (cálculo o lectura del código sobre lo medido, reproducible aquí), **[fuente]** (verificado en la fuente citada el 2026-10-16) o **[hipótesis]** (a comprobar con las ablaciones; no es un hecho). No se decide ningún modelo: se asume la decisión del usuario (BGE-M3 + bge-reranker-v2-m3, chunks de 1024 tokens, HNSW).

## Contexto y problema

ADR-39 (fase A) midió con `data/eval/adr39-mini` (75 preguntas: 59 con respuesta en español, 6 sin respuesta, 10 controles en inglés) una recuperación densa de **recall@10 = 0,710** (IC 95 % 0,609–0,812) y **MRR = 0,356** (0,272–0,453) con chunks de 1024 tokens; con chunks de 256, recall@10 0,594 (0,478–0,710). Las metas iniciales de OL-06 (PRD G-3, M-06.1) son 0,80 / 0,70 (es → en) / 0,60. Solo se cumple es → en (0,729). El usuario pidió investigar mejoras **cuidando el sobreajuste**: con tan pocas preguntas es fácil "mejorar" ajustando a ruido.

Hay una tensión que este ADR hace explícita: el conjunto con el que ADR-39 eligió tamaño de chunk, solapamiento y estrategia (T2–T4) es **el mismo** que se usaría ahora para evaluar mejoras. Esa elección ya consumió parte de su capacidad de dar una medida limpia (ver H11). La respuesta no es medir más sobre ese conjunto, sino (a) congelar una partición, (b) preinscribir qué se prueba y cómo se decide, y (c) validar con preguntas nuevas e independientes.

## Diagnóstico

### H1. El conjunto no puede discriminar mejoras pequeñas [medido + derivado]

- **Unidades independientes:** las 69 preguntas con respuesta evaluadas incluyen 10 controles en inglés que son **la misma pregunta traducida** (`control_de`); las unidades independientes son 59. El bootstrap de ADR-39 remuestrea las 69 como si fueran independientes, por lo que el IC publicado es algo más estrecho de lo real. [derivado: `retrieval_metrics.py::_bootstrap_ic`]
- **Metas frente a los intervalos:** la meta de recall@10 (0,80) cae **dentro** del IC de 0,710 (0,609–0,812): no se puede afirmar ni que se cumple ni que es inalcanzable. La meta de MRR (0,60) queda **fuera** del IC de 0,356 (0,272–0,453): no se cumple, pero la meta se fijó antes de saber que la etiqueta es de pasaje único (H8). Intervalo de Wilson de control, 41/69 = 0,594: 0,476–0,702, coherente con el bootstrap publicado.
- **Potencia:** prueba exacta del signo sobre los pares discordantes (dos colas, α = 0,05), escenarios con 15 % y 25 % de preguntas que cambian de acierto entre dos variantes (supuesto, no medido):

| Mejora absoluta real del recall | Discordancia 15 % → n para 80 % de potencia | Discordancia 25 % → n para 80 % de potencia |
|---|---|---|
| +0,05 | 498 | no alcanzable con n ≤ 600 |
| +0,10 | 122 | 207 |
| +0,15 | 52 | 92 |

Con la discordancia del 25 %, +0,10 de mejora se detecta con 13 % de potencia sobre un conjunto de desarrollo de ~37 preguntas, 25 % con 59 y 30 % con 69. **Conclusión:** sobre el dataset actual solo se pueden descartar regresiones grandes o detectar mejoras de ≥ 0,15–0,20; cualquier "ganancia" de 0,03–0,05 es indistinguible del ruido. Para el nivel de precisión que pide una meta (semiancho del IC ≤ 0,07 con recall ≈ 0,75–0,80) hacen falta **126–147 preguntas independientes** (semiancho ≤ 0,05: 246–289; fórmula normal con p(1−p), aproximación).
- **"Sin evidencia":** con 6 preguntas, ni un 6/6 permite afirmar la meta de 0,90 (límite inferior de Wilson 0,61). Hacen falta **≥ 35 preguntas sin respuesta** para que 35/35 dé un límite inferior ≥ 0,90 (n/(n+z²) ≥ 0,9). [derivado]

### H2. Los fallos se concentran en pocos documentos [medido]

De 69 preguntas fallan 20 con chunks de 1024. Por documento (`por_fuente`): P11 falla 5 de 7, P01 3 de 3, P10 3 de 3, M02 4 de 4 (incluye el control en inglés y la pregunta multidocumento), M09 3 de 5, M01 2 de 5; P04, M03, M14 y M15 una cada uno. Con M02, P01 y P10 el recall es 0 también en los controles en inglés y con todos los tamaños de chunk. Eso apunta a un problema de **recuperación del pasaje concreto** (documentos que compiten con otros del mismo tema) más que de idioma. Las 2 preguntas `multi_documento` (Q-M30 y su control) son una sola pregunta y aportan el 10 % de los fallos.

### H3. El tipo `valor` y los identificadores concentran el error [medido + hipótesis]

Las 22 preguntas de tipo `valor` (cifras, HR, supervivencia, criterios de elegibilidad numéricos) fallan 8 veces (recall 0,636; MRR 0,219): el 40 % de los fallos con el 32 % de las preguntas. Ejemplos de lo que tienen en común sus citas (leído del golden): siglas e identificadores (APHINITY, ALTTO, RTOG-9408, NCT…), números y "HR 0,83". **[hipótesis]** Un embedding denso capta mal ese discriminante léxico y un vector *sparse* podría ayudar, porque números y siglas **no cambian de idioma**. Falta medirlo: ADR-39 solo evaluó recuperación densa.

### H4. El idioma no es la causa principal [medido + derivado]

Es → en 0,729 (n = 59) frente a los controles en → en 0,60 (n = 10, IC 0,30–0,90), con las mismas preguntas. Si el idioma fuera el cuello de botella, el control en inglés rendiría **más**, no igual o menos. Con n = 10 la diferencia no es concluyente, pero ni un solo indicio medido favorece la traducción de la consulta. **[hipótesis]** El techo actual se debe a la especificidad del pasaje, no al idioma; por eso la expansión bilingüe (US-113) tiene un beneficio esperado pequeño sobre este dataset.

### H5. Tamaño de chunk: el recall sube, el ranking no [medido + derivado]

recall@10 0,594 → 0,652 → 0,710 y MRR 0,342 → 0,371 → 0,356 para 256 → 512 → 1024 (IC solapados). El recall sube porque 10 chunks de 1024 tokens cubren cuatro veces más texto que 10 de 256 y el acierto es "algún chunk contiene la cita" (ya anotado en ADR-39, observación b); el MRR no mejora. Un chunk más grande diluye el pasaje en un vector único y el *reranker* con `RERANKER_MAX_LENGTH = 512` **no ve la segunda mitad** de un chunk de 1024. ADR-39 declara que esa combinación (reranker × chunks de 1024) **no se midió**. [medido: configuración; efecto: hipótesis]

### H6. El reranker reordena más de lo que recupera [medido + derivado]

Sobre chunks de 256 y las 24 mejores candidatas densas, bge-reranker-v2-m3 sube el recall de 0,594 a 0,667 (+0,073) y el MRR de 0,342 a 0,488 (+0,146). El reranker solo puede promover lo que ya está en el *pool* de 24: el techo es el recall@24 del recuperador, que **no se reportó**. La mejora de recall del reranker (+0,073, IC solapados) tampoco es distinguible del ruido con n = 69. Latencia de ese modelo con 24 pares: p95 3183 ms (int8) frente al presupuesto de 2000 ms de ADR-39; cualquier brazo que aumente pares o longitud choca con ese presupuesto (punto 2 del humano).

### H7. El vector *sparse* existe pero nunca se evaluó [medido]

ADR-39 comprobó que BGE-M3 produce pesos *sparse* (14 tokens con peso en la sonda) y fijó `SPARSE_VECTOR_SOURCE=modelo_embeddings`, pero todas las cifras de recuperación son densas. **[fuente]** El artículo de BGE-M3 (arXiv 2402.03216, v4) informa en MKQA (entre idiomas, Recall@100): denso 75,1; *sparse* 45,3; denso + *sparse* 75,3; y en MIRACL (un solo idioma, nDCG@10): denso 69,2; denso + *sparse* 70,4. Los pesos de combinación del artículo son w_denso = 1 y w_sparse = 0,3. Esto sugiere que el híbrido aporta poco **entre idiomas** y algo dentro de un mismo idioma: coherente con la nota de ADR-39 ("el *sparse* aporta poco sin traducir la consulta").

### H8. La métrica y el golden tienen límites conocidos [derivado de `retrieval_metrics.py` y el golden]

1. "recall@10" es en realidad **acierto@10** (hit rate): 1 si algún chunk del top-10 es del documento esperado y contiene la cita, sin importar cuántos pasajes relevantes existan (modo `cualquiera`). Es una métrica legítima, pero conviene nombrarla con precisión al reportar contra la meta.
2. **Etiqueta de pasaje único:** si otro documento del corpus contiene evidencia igualmente válida (hay varios sobre darolutamida: P06, P10, P17), el sistema "falla" aunque haya recuperado evidencia útil. Es un falso negativo del golden, no del recuperador. Un estudio biomédico (arXiv 2505.07917, preprint) advierte lo mismo: "low recall can reflect documents missing from the curated gold set" [fuente, paráfrasis del resumen]. **[hipótesis]** parte de los 20 fallos son de este tipo; se cuantifica con la auditoría ciega D3.
3. **Citas partidas por la frontera del chunk:** la mediana de las 94 citas es de 21 palabras (máximo 57). Con tamaño fijo y sin solapamiento, la probabilidad de que una cita caiga en dos chunks es aproximadamente (tokens de la cita)/(tokens del chunk): con ~30 tokens, ≈ 3 % a 1024 y ≈ 12 % a 256 (cálculo con el supuesto de 1,4 tokens por palabra). Esto penaliza más al chunk pequeño y explica una parte de H5; los solapamientos de 10 y 15 % no mejoraron en ADR-39 (dentro del ruido). [derivado; D1 lo mide exacto]
4. **Validez externa:** las preguntas son breves y autocontenidas; en producción `/rag/query` recibe una pregunta con contexto del caso desidentificado. Y el corpus de prueba es pequeño (27 documentos, 522 chunks): con 20 o más documentos por tipo de cáncer (US-120) habrá más competidores por pregunta, y el recall bajará respecto del medido. Las cifras actuales son, por tanto, **optimistas** respecto de producción. [hipótesis razonada]

### H9. "Sin evidencia" no puede calibrarse con n = 6 [medido + derivado]

El puntaje máximo de las 6 preguntas sin respuesta fue 0,570 con coseno denso (mediana 0,527) y 0,459 con el reranker de 256 tokens. Sirve de insumo para US-073, no de calibración (ver H1: se necesitan ≥ 35).

### H10. Lo que *no* explica el fallo [derivado]

La normalización del acierto (NFKC, quita puntuación, colapsa espacios) hace invisibles `≤`, guiones y corchetes en ambos lados; no es un artefacto de formato. Las citas del golden están verificadas contra los documentos (AC-13 de US-012).

### H11. Ya hay contaminación leve [derivado]

ADR-39 eligió 1024 tokens, 0 % de solapamiento, tamaño fijo y HNSW mirando el recall@10 de **las 75 preguntas**. Son cuatro decisiones discretas y de bajo grado de libertad, pero significan que (a) el 0,710 es una medida algo optimista de ese diseño, y (b) ninguna partición del golden actual es una prueba totalmente ciega para decisiones de chunking. Por eso la **prueba definitiva** de este ADR debe ser un conjunto **nuevo** (US-229).

## Factores de decisión

- No sobreajustar: cada conclusión debe poder repetirse en datos que nadie miró.
- Invariantes: RN-02 (sin chunks sobre el umbral → "sin evidencia" **sin invocar al LLM**), RN-12 (solo modelos locales con datos reales), RN-21 (solo fuentes con licencia aceptada; NCCN y ESMO excluidas), RN-22 (umbrales y pesos en configuración), RN-27 (códigos y sinónimos solo del catálogo versionado).
- Latencia: p95 de `/platform/evidence-analyses` ≤ 15 s; presupuesto de etapas de ADR-39 (reranker 2000 ms).
- Coste de oncólogo (SUP-4): recurso escaso; todo lo que requiera su revisión debe ser acotado.
- Reversibilidad: cambiar chunking o *embeddings* obliga a reindexar; cambiar el ranking posterior, no.

## Opciones consideradas

Se evalúan por qué hallazgo atacan, evidencia externa, coste e impacto en invariantes. Ninguna se adopta todavía: la decisión propuesta es medirlas con el protocolo.

| # | Opción | Ataca | Evidencia externa | Coste / invariantes | Riesgo de sobreajuste | Veredicto |
|---|---|---|---|---|---|---|
| O1 | **Ampliar y auditar el dataset** (≥ 160 preguntas nuevas con respuesta y ≥ 45 sin respuesta, documentos nuevos, parte con contexto de caso) y auditar los fallos del golden actual | H1, H8, H9, H11 | [fuente] Dwork et al., *Science* 2015: el análisis adaptativo sobre un mismo conjunto invalida las garantías de validación; Urbano et al., SIGIR 2019: el tamaño del conjunto condiciona los errores de tipo I y II | Tiempo del oncólogo (el mayor coste); sin riesgo de invariantes | Reduce el riesgo | **Hacer primero** (US-227…US-229) |
| O2 | **Re-medir el pipeline real**: bge-reranker-v2-m3 sobre chunks de 1024, con *pool* de 24 y de 48 y recall@pool | H5, H6 | [fuente] la ficha de BGE recomienda recuperación híbrida + *reranking* | Latencia: 3183 ms con 24 pares de ~256 tokens (ADR-39); con 1024 truncado a 512 será mayor [hipótesis]; puede exigir revisar el presupuesto | Bajo (sin hiperparámetros nuevos) | **Hacer** (brazos A0, A1) |
| O3 | **Híbrida denso + *sparse*** con fusión RRF (k = 60) o suma ponderada (1 : 0,3) | H3, H7 | [fuente] Cormack, Clarke y Büttcher, SIGIR 2009: RRF supera a Condorcet y a métodos de aprendizaje de rankings; k = 60 fijado en un piloto y no reajustado (según el resumen de la búsqueda; el PDF no fue legible con las herramientas). BGE-M3: ver H7 | Ya prevista como US-112; índice *sparse* de Milvus; sin LLM | Bajo si k y pesos son los de la fuente y **no se barren** | **Medir** (A2, A2b) |
| O4 | **Expansión con sinónimos del catálogo** (determinista) | H3, parte de H4 | US-113 AC-4; RN-27 | `packages/clinical-catalogs` **aún no existe**; cada sinónimo debe venir del catálogo versionado, no de las preguntas del golden | **Alto** si el glosario se arma mirando el golden | **Medir con glosario congelado fuera del golden** (A3) |
| O5 | **Traducción de la consulta con un modelo de traducción dedicado** (p. ej. Helsinki-NLP/opus-mt-es-en, Apache-2.0 según su ficha, 2026-10-16) y fusión consulta original + traducida por RRF | H4 | [fuente] sin comparación directa de traducir la consulta frente a BGE-M3 multilingüe en la literatura que hallé (2024-2025); la evidencia es indirecta | Modelo nuevo (decisión de modelos, no se adopta aquí); memoria no verificada; sin LLM, **compatible con RN-02** | Bajo | **Medir solo como brazo** (A4); H4 anticipa poca ganancia |
| O6 | **Traducción o HyDE con el LLM local** | H4 | [fuente] HyDE (Gao et al., arXiv 2212.10496, 2022): genera un documento hipotético con un LLM y lo embebe; resultados en recuperación cero-shot | **Choca con RN-02**: invocar al LLM *antes* de saber si hay evidencia sobre el umbral. US-113 ya prevé "el LLM local para la traducción de la pregunta", lo que contradice la letra de RN-02 (punto 3 del humano). Latencia de un LLM de 16 GB antes de recuperar | Medio | **No adoptable hoy**; solo como cota superior diagnóstica, si el humano lo autoriza |
| O7 | **Contexto del documento en cada chunk** (*contextual retrieval*): variante determinista que antepone título, tipo de fuente y sección al texto indexado; variante con LLM que genera una frase de contexto por chunk | H2, H5 | [fuente] Anthropic, 19-sep-2024: embeddings contextuales reducen en 35 % los fallos de recuperación del top-20 (5,7 % → 3,7 %); con BM25 contextual 49 % (2,9 %); con *reranking* 67 % (1,9 %); promedio de varios dominios, modelo de embeddings distinto, reranker de Cohere; "ejecute sus propias evaluaciones". Coste de la generación: 1,02 USD por millón de tokens de documento con un LLM de nube y caché de prompts | Variante determinista: sin LLM, reindexar. Variante con LLM: ingesta offline sobre corpus **público** (no datos de pacientes), pero local por coherencia con RN-12; coste de cómputo del LLM de 16 GB sobre ≥ 40 documentos | Bajo | **Medir la determinista** (A5); la variante LLM, solo si A5 muestra señal |
| O8 | **Chunking por estructura / semántico / *late chunking*** | H5 | [fuente] Qu, Bao y Tu (arXiv 2410.13070; NAACL Findings 2025): el chunking semántico no mejora de forma consistente respecto del tamaño fijo. *Late chunking* (Günther et al., arXiv 2409.04701): codifica el documento completo y trocea después; viable con un modelo de contexto largo como BGE-M3 (8192 tokens) pero **no se hallaron cifras comparables** en la fuente leída | ADR-39 midió "estructura de la fuente": 0,676 frente a 0,710, MRR 0,392 frente a 0,356 (dentro del ruido) | Medio | **No repetir**; reconsiderar tras O1 |
| O9 | **Filtro por tipo de cáncer** como metadato de la solicitud | H2 | Prevista (US-114, `ENABLED_CANCER_TYPES`) | Legítima en producción (el tipo viene del caso). En la evaluación **debe llegar como campo de la solicitud**, nunca derivado de `documentos` del golden (P7) | Alto si se filtra con el golden | **Medir con y sin filtro**, reportando ambos |
| O10 | **Ajuste fino de embeddings o reranker** | H3 | — | Fuera de alcance (el backlog descarta el *fine-tuning*); sobreajuste casi seguro con ~60 preguntas | Muy alto | **Descartada** |
| O11 | **Cambiar de modelos** | — | — | El usuario fijó BGE-M3 + bge-reranker-v2-m3 | — | **Fuera de alcance** |
| O12 | **Recalibrar las metas** (TBD-02, DEC-07/US-017) | H1, H8 | Estadística del propio H1 | Solo decisión; no cambia código | — | **Hacer, pero después de O1** |

## Decisión

Opción elegida: **plan por fases con protocolo obligatorio**, en este orden: O1 (diagnóstico, auditoría y ampliación del dataset) → O2, O3, O4, O5, O7, O9 como **ablaciones preinscritas** → decisión sobre la prueba nueva → O12 (metas). Se rechaza adoptar cualquier mejora técnica antes de tener la partición congelada y el conjunto nuevo, porque, con los datos de hoy, ni una mejora real de +0,10 se distinguiría del ruido (H1). La razón de fondo: las diferencias que importan (0,05–0,10) exigen ~120–200 preguntas independientes; todo lo demás es ruido con apariencia de precisión.

### Protocolo anti-sobreajuste (normativo para cualquier cambio de recuperación)

**P1. Preinscripción.** Antes de ejecutar un brazo se commitea un documento con: hipótesis, brazos, hiperparámetros, métrica primaria (acierto@10 sobre el *conjunto final de chunks* tras el reranker; MRR secundaria), regla de decisión y las comparaciones previstas. Los hiperparámetros se toman de la fuente donde existen (k = 60 de RRF; pesos 1 : 0,3 de BGE-M3) y **no se barren**.

**P2. Partición congelada antes de experimentar.** [`data/eval/ol06-particion-v1/`](../../../data/eval/ol06-particion-v1/README.md), generada sin leer resultados, determinista (SHA-256 con sal fija) y estratificada por tipo de cáncer × clase de pregunta; cada pregunta y su control en inglés van al mismo conjunto. Desarrollo 39 preguntas (36 con respuesta), validación 20 (18) y prueba 16 (15). Cambiarla exige `ol06-particion-v2`.

**P3. La prueba se toca una vez.** La prueba definitiva es el conjunto nuevo de US-229 (lote B). Se evalúa una sola vez, al cierre, con la configuración ya congelada (SHA del commit y huella de la configuración). El *runner* se niega a evaluar la prueba sin `--prueba-final` y sin una huella registrada; cada acceso queda registrado. El subconjunto "prueba" del golden actual (15 con respuesta) es un respaldo de potencia mínima: solo descarta regresiones grandes.

**P4. Hiperparámetros solo en desarrollo, y los mínimos.** Validación y prueba no se usan para elegir valores. Máximo **7 brazos**.

**P5. Estadística.** IC de 95 % por *bootstrap pareado* con remuestreo **por grupo** (pregunta + control), ≥ 10 000 réplicas, semilla fija; se reporta la **diferencia** frente al brazo de referencia con su IC, no solo los niveles. Se informan n efectivo y cuántos casos validados (clase del oncólogo) componen cada cifra. Los desgloses por documento, tipo o idioma con n < 10 son **descriptivos**, no deciden nada.

**P6. Rechazo de mejoras dentro del ruido.** Una variante solo se adopta si Δ ≥ +0,05 absoluto en la métrica primaria **y** el límite inferior del IC de Δ es > 0 en la prueba (IC de 95 % con un finalista; de 97,5 % con dos, por la corrección de Bonferroni/Holm). Si el IC incluye 0, no se adopta; a igualdad, gana la más simple y barata (misma lógica que `CHUNK_SELECTION_MARGIN` de ADR-39). Además, ninguna adopción puede empeorar la exactitud de "sin evidencia", el p95 por etapa ni los invariantes.

**P7. Prohibido.** (a) Ajustar sobre preguntas individuales: reglas especiales, listas de excepciones, términos añadidos porque una pregunta falla, indicaciones de prompt con el vocabulario del desarrollo. (b) Usar `documentos`, `evidencia`, `respuesta_esperada` o `cancer` del golden como entrada de filtro, expansión o ranking (el tipo de cáncer entra como campo de la solicitud, igual que en producción). (c) Construir glosarios o sinónimos a partir de las preguntas del golden: salen del catálogo clínico versionado (RN-27) o de fuentes externas. (d) Mirar la prueba. (e) Corregir una pregunta del golden *porque un brazo la falla*.

**P8. Detección de fuga.** Un test del *runner* falla si la consulta o el índice reciben campos del golden distintos de `pregunta` y los metadatos de la solicitud.

**P9. Comparaciones múltiples.** Se registran **todos** los brazos y configuraciones ejecutados (incluidos los fallidos), porque el número de intentos es lo que infla el falso positivo. Holm sobre los finalistas.

**P10. Auditoría ciega del golden.** El oncólogo asesor revisa una muestra de fallos del brazo de referencia (y de un acierto de cada diez, como control), sin saber qué brazo los produjo, y clasifica: fallo real / evidencia alternativa válida en el top-10 / etiqueta incorrecta. Las correcciones producen `golden v0.2` y una partición nueva solo si cambian ids; nunca se hacen caso por caso para mejorar un brazo.

**P11. Validación externa.** El dataset nuevo lo redactan personas **distintas** de quien experimenta, sobre documentos que no están en el corpus actual, con revisión del oncólogo (`revision_oncologo`) y `clase: sintetico`. Incluye ≥ 30 % de consultas con contexto de caso desidentificado, más cercanas a producción (H8.4).

**P12. Independencia.** Los controles pareados cuentan como un solo grupo; las preguntas del mismo documento se reportan por documento (efecto de agrupamiento) y las conclusiones no dependen de un documento.

### Brazos de las ablaciones (preinscritos; solo en desarrollo)

| Brazo | Configuración | Hiperparámetros |
|---|---|---|
| A0 | Referencia: BGE-M3 denso, chunks de 1024, bge-reranker-v2-m3 sobre el top-24, `RERANKER_MAX_LENGTH` = 512 | los del usuario / ADR-39 |
| A1 | A0 con *pool* de 48 | solo si el p95 cabe; si no, se mide fuera de línea y se reporta como "no viable" |
| A2 | A0 + *sparse* de BGE-M3 con RRF | k = 60 |
| A2b | A0 + suma ponderada denso/*sparse* | 1 : 0,3 (BGE-M3) |
| A3 | A2 + sinónimos del catálogo | glosario congelado, ajeno al golden |
| A4 | A2 + traducción de la consulta con un modelo dedicado, fusión por RRF | k = 60 |
| A5 | A0 con contexto determinista antepuesto al chunk (título, tipo de fuente, sección) | plantilla fija |

Además se miden (sin ser brazos): recall@24 antes del reranker (techo del *pool*), acierto@10 **por documento** y el efecto del filtro de cáncer pasado como campo de solicitud.

Flujo de decisión: DEV (cribado: pasan como máximo 2 brazos con Δ ≥ +0,05 sin regresión mayor de 0,05 en idioma o tipo con n ≥ 10) → VALIDACIÓN (un solo experimento por finalista, sin ajustes) → PRUEBA nueva (una vez). El cribado en desarrollo no demuestra nada (H1): sirve para descartar lo que no se mueve y para no gastar la prueba.

### Metas de OL-06 (TBD-02, DEC-07)

Propuesta de **enmienda a US-017** (no aplicada; las historias publicadas son inmutables): (1) mientras no exista el conjunto de US-229, las metas de recuperación se informan como **provisionales** y no bloquean la CI; (2) la meta pasa a evaluarse sobre el **límite inferior del IC de 95 %** y no sobre el punto medio; (3) se reporta recall@10 **tras el reranker** (lo que ve el generador), con acierto@10 por documento como secundaria; (4) las metas finales se fijan con las cifras del conjunto nuevo y una justificación de producto (cuántas de cada 10 consultas deben traer la evidencia en el top-10), no por defecto en 0,80 / 0,60. Mantener sin cambio G-2 = 100 % y salidas prescriptivas = 0, como exige US-017 AC-4. Ni este ADR ni sus historias fijan valores nuevos.

### Consecuencias

- **Positivas:** las decisiones técnicas posteriores se apoyan en datos que nadie ajustó; el esfuerzo del oncólogo se concentra en un dataset reutilizable (US-072, US-133); queda por escrito qué no se puede concluir hoy.
- **Negativas:** retrasa las mejoras técnicas hasta tener el conjunto nuevo (≈ 205 preguntas por escribir y revisar); añade un *runner* con control de acceso; el costo de revisión del oncólogo es el cuello de botella (SUP-4). Si el usuario necesita una mejora sin esperar, solo se puede adoptar con evidencia de desarrollo + validación, **marcada como no confirmada**.
- **Configuración (RN-22):** `RETRIEVAL_FUSION` (`rrf`|`ponderada`), `RRF_K` (60), `HYBRID_SPARSE_WEIGHT` (0,3), `RERANKER_MAX_PAIRS`, `QUERY_EXPANSION` (`ninguna`|`catalogo`|`traduccion`), `CHUNK_CONTEXT_PREFIX` (bool), todos con valor por defecto igual al comportamiento actual. Las metas viven en la configuración de la suite.

### Confirmación

- `ol06-particion-v1/particion.yaml` guarda la huella SHA-256 del golden de origen; la CI falla si no coincide y si el *runner* recibe campos del golden fuera de `pregunta` (P8).
- El informe de `ai-eval-runner` (suite `evaluate`) incluye la lista de brazos ejecutados, las diferencias con IC pareado, la huella de la configuración y los accesos a la prueba (P1, P3, P9).
- Revisión en el Gate 2 de cualquier PR que toque modelo, prompt, umbral, catálogo o corpus (OL-06).

## Pros y contras de las opciones

### Plan por fases con protocolo (elegida)

- A favor: protege contra el sobreajuste; reutiliza lo ya decidido; aprovecha US-072/US-073; deja las metas con base estadística.
- En contra: tarda; depende del tiempo del oncólogo; las ablaciones finales no pueden empezar a decidir hasta tener el conjunto nuevo.

### Probar mejoras ya sobre el golden actual y adoptar la mejor

- A favor: rápido.
- En contra: potencia de 13–30 % para +0,10 (H1); cualquier ganancia observada es ruido más selección; ya hay contaminación (H11).

### Bajar las metas a lo medido (0,71 / 0,36) sin más

- A favor: cierra TBD-02 hoy.
- En contra: fija como meta lo que el sistema hace con un dataset que no puede distinguir 0,71 de 0,81; ancla una vara que quizá sea inferior a lo alcanzable; vara basada en un MRR que depende de la definición de acierto (H8).

### Dejar todo como está

- A favor: sin trabajo.
- En contra: llegaría a G-Demo con una meta de recuperación incumplida y sin saber si es real.

## Decisiones del humano (usuario, 2026-10-20)

Resuelven los puntos 1, 3, 4 y 6 de la lista siguiente (la lista se conserva como registro):

1. **Protocolo P1–P12 y partición congelada: aceptados.** La prueba definitiva es el conjunto nuevo (US-229); el subconjunto de 16 preguntas del golden actual es solo respaldo. Condición añadida: el lote B lo redactan personas distintas de quienes experimentan con las ablaciones.
2. **RN-02 frente a US-113: se mantiene RN-02** («sin invocar al LLM» cuando no hay chunks sobre el umbral). La expansión bilingüe de US-113 **no usa el LLM local**: se resuelve con sinónimos del catálogo (A3) o un modelo de traducción dedicado (A4), medidos como brazos. US-113 se enmienda en ese sentido (nota en `FEAT-06b`). Si ninguno de los dos brazos mejora, se vuelve a esta decisión con datos.
3. **Oncólogo asesor: se escalona.** Primero el lote A reducido (≥ 60 preguntas con respuesta y ≥ 10 sin respuesta, US-228) y la auditoría ciega de los 20 fallos (US-227). El lote B (US-229) solo se redacta si el lote A muestra que vale la pena seguir. La opción de ~80 respondibles + 35 sin respuesta queda como último recurso (solo detecta ≥ +0,15).
4. **Metas de US-017: provisionales.** No se modifican ni se bajan antes de terminar US-229. La enmienda propuesta (límite inferior del IC y recall@10 tras el reranker) se aplica después. Nota en `FEAT-T5a`.

## Puntos que decide el humano

1. **Aceptar el protocolo P1–P12 y la partición congelada**, incluido que el subconjunto "prueba" actual es solo un respaldo y la prueba definitiva es el conjunto nuevo.
2. **Presupuesto de latencia del reranker.** El modelo elegido por el usuario (bge-reranker-v2-m3) mide 3183 ms p95 con 24 pares de ~256 tokens frente a 2000 ms presupuestados (ADR-39, punto 1 del humano; el texto de ADR-39 en su rama aún recomienda gte-multilingual-reranker-base y debe alinearse con la decisión del usuario). El brazo A1 (más candidatos) y chunks de 1024 empeoran la latencia; ¿se revisa `STAGE_P95_BUDGET_MS.reranker`?
3. **RN-02 frente a US-113.** US-113 prevé el LLM local para traducir la pregunta antes de recuperar, lo que contradice la letra de RN-02 ("sin invocar al LLM"). Opciones: (a) entender RN-02 como "sin invocar al LLM *de generación*" y enmendar el PRD; (b) mantener RN-02 y usar solo sinónimos del catálogo o un modelo de traducción dedicado (O4, O5). Este ADR propone (b) por ser lo que menos toca el invariante.
4. **Tiempo del oncólogo asesor** para redactar o revisar ≈ 205 preguntas nuevas y auditar la muestra de fallos (US-227…US-229); es el cuello de botella. Alternativa de menor costo: un lote de ~80 respondibles y ~35 sin respuesta, con potencia reducida (solo detecta ≥ +0,15).
5. **Cuándo**: propuesta de sprint 2 con US-072/US-073 (donde el *runner* ya existe), con el conjunto nuevo antes de fijar las metas definitivas (DEC-07).
6. **Metas**: aplicar la enmienda propuesta a US-017 solo después de US-229; mientras tanto, tratarlas como provisionales.
7. **Modelo de traducción (A4)** y **variante con LLM de O7**: son componentes nuevos; este ADR solo autoriza medirlos como brazos, no adoptarlos (cualquier adopción exige enmendar ADR-39).

## Más información

**Fuentes verificadas el 2026-10-16** (lo verificado y lo no verificado se indica):

- Chen et al., *M3-Embedding* (BGE-M3), arXiv 2402.03216 (v1 feb-2024, v5 dic-2025): 100+ idiomas, hasta 8192 tokens, denso + *sparse* + multivector. Cifras de MKQA y MIRACL y pesos w = 1 / 0,3 leídos en la versión HTML v4. La ficha de Hugging Face de BAAI/bge-m3 muestra `weights_for_different_modes=[0.4, 0.2, 0.4]` solo como **ejemplo** y recomienda híbrida + *reranking*; no da cifras de MIRACL/MKQA en texto.
- Cormack, Clarke y Büttcher, *Reciprocal Rank Fusion outperforms Condorcet and individual Rank Learning Methods*, SIGIR 2009, pp. 758–759, doi 10.1145/1571941.1572114. Título y venue confirmados por búsqueda; el valor k = 60 (fijado en un piloto, sin reajuste) procede del resumen de esa búsqueda: **el PDF no fue legible con las herramientas**, conviene confirmarlo.
- Anthropic, *Introducing Contextual Retrieval*, 19-sep-2024: 35 % / 49 % / 67 % (top-20, 150 candidatos al reranker), con los matices citados en O7.
- Gao et al., *Precise Zero-Shot Dense Retrieval without Relevance Labels* (HyDE), arXiv 2212.10496, dic-2022.
- Günther et al., *Late Chunking*, arXiv 2409.04701 (sep-2024; v3 jul-2025): sin cifras en la fuente leída.
- Qu, Bao y Tu, *Is Semantic Chunking Worth the Computational Cost?*, arXiv 2410.13070 (oct-2024), Findings of NAACL 2025.
- Dwork et al., *The reusable holdout: Preserving validity in adaptive data analysis*, *Science* 349(6248):636, 2015, doi 10.1126/science.aaa9375.
- Smucker, Allan y Carterette, *A comparison of statistical significance tests for IR evaluation*, CIKM 2007, pp. 623–632: poca diferencia práctica entre aleatorización, *bootstrap* y prueba t; seguimiento SIGIR 2009 recomienda la prueba de aleatorización con pocos temas.
- Urbano, Lima y Hanjalic, SIGIR 2019, pp. 505–514, doi 10.1145/3331184.3331259: el número de temas es una condición central de los errores; **no pude verificar las cifras concretas de temas** del artículo.
- Xiong et al., *Benchmarking Retrieval-Augmented Generation for Medicine* (MIRAGE/MedRAG), Findings of ACL 2024, arXiv 2402.13178: 7663 preguntas, 41 combinaciones de corpus, recuperadores y LLM; mejora de hasta 18 % frente a *chain-of-thought*; combinar corpus y recuperadores rinde mejor. **No obtuve las cifras por recuperador**, por lo que no se usan para decidir.
- Estudio biomédico con híbrida RRF, arXiv 2505.07917 (preprint): recall 0,567 híbrida frente a 0,537 BM25 y 0,273 MedCPT; la ganancia es pequeña y el propio estudio advierte de huecos en el oro. Evidencia débil, no usada para decidir.
- Helsinki-NLP/opus-mt-es-en (Hugging Face): licencia Apache-2.0 según su ficha; tamaño y revisión no mostrados en la ficha (hay que fijar una revisión antes de cualquier adopción, como en ADR-39).
- **No verificado:** MTEB (no se consultó; no se usa), literatura clínica específica de traducción de consultas es → en (no hallé una comparación directa), y cualquier cifra de latencia de modelos no incluidos en ADR-39.

**Historias:** US-226…US-230 (borrador, sin publicar en Linear). Bloquea o informa a: US-072, US-073, DEC-07/US-017, US-112, US-113, US-133, US-058/US-059 (si se adopta A5), ADR-41.
**Revisión prevista:** al cerrar US-229 (conjunto nuevo) o ante cualquier cambio de modelo.
