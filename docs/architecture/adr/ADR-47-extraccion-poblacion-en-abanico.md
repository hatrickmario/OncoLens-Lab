# ADR-47 — La población del estudio se extrae en la ingesta, en abanico por documento y criterio, como lista acotada por fragmento

> Linear: pendiente (se crea al publicar el refinamiento del S4) · Historias: US-240 … US-244, US-233b · Feature: FEAT-08b, FEAT-06c
> Plantilla: MADR 4 (variante mínima, en español).

- **Estado:** aceptado
- **Fecha:** 2026-10-29
- **Decisores:** usuario (product owner), en `/sprint-refine S4` (`[S4 resp. 3]`, `[S4 resp. 5]`)
- **Consultados / informados:** oncólogos asesores (respuestas F-20…F-24 de la Demo 3), `sprint-orchestrator`, `ai-services-dev`, `clinical-platform-dev`, `frontend-dev`
- **Requisitos:** FR-25, RN-01, RN-04, RN-14, RN-21, RN-22, RN-25, RN-26, RN-27, RN-28; ADR-26 (contrato aditivo), ADR-31 (fuente más aplicable), ADR-34 (verbalización determinista); TBD-13

## Contexto y problema

La aplicabilidad (RN-28) compara los datos del paciente con la población de cada estudio citado. En la Demo 3 (2026-10-29) eso no funcionó por dos motivos verificados ([`S3-demo-outcomes.md`](../../../backlog/sprints/S3-demo-outcomes.md) OUT-06 y OUT-07; análisis en [`S4-insumo-extraccion-poblacion.md`](../../../backlog/sprints/S4-insumo-extraccion-poblacion.md)):

1. Los 10 documentos del corpus sembrado tienen todos los criterios en `no_disponible`: la ruta de ingesta (`application/corpus_metadata/`, US-118) existe, pero no se ejecutó sobre la demo. Por eso solo opera el camino de consulta.
2. El proponente de la consulta (`infrastructure/llm/proponente_de_aplicabilidad.py`, L1D-128) hace **una sola llamada** con todas las fuentes y todos los criterios, con una lista abierta de propuestas. Con dos fuentes en el prompt el modelo entra en un **bucle de repetición** (`finish_reason=length`; una propuesta repetida 21 veces). Además, `_parsear` convierte el JSON inválido en `503 LOCAL_LLM_UNAVAILABLE` y descarta un análisis ya validado. Aun cuando termina, tarda de 10 a 39 s y devuelve `propuestas=0`.

A esto se suma que el modelo de datos solo admite **un valor por (fuente, criterio)** (`ValorDelEstudio`, `planificar_propuestas`: «gana la primera»). Los oncólogos pidieron en la Demo 3 lo contrario (F-20…F-24): una población inclusiva («pre y posmenopáusicas») es Parcial, un fragmento que mezcla poblaciones es Parcial, los valores en conflicto se muestran ambos, y la unidad de evaluación son los fragmentos que sustentan la opción, no el documento entero.

## Factores de decisión

- **Fidelidad clínica:** cumplir F-20…F-24 (DEC-11, escenario aceptado `[S4 resp. 8]`) sin falsos Coincide (R1, R18) ni falsos No coincide (R2).
- **Robustez:** que ningún fallo del LLM descarte un análisis validado (RN-26), y que el bucle de OUT-06 sea imposible por construcción.
- **Latencia:** `/platform/evidence-analyses` p95 ≤ 15 s con **un único LLM local** de unos 17 GB en el equipo de referencia (stack ≤ ~30 GB).
- **Reproducibilidad:** que dos consultas iguales den el mismo estado, con valores versionados (prompt, modelo, catálogo) y trazables a su fragmento (RN-04, RN-25).
- **Coste de cambio:** contrato aditivo (ADR-26); migración del schema `corpus` sin tocar los datos clínicos (frontera de `rag_corpus`).
- **Privacidad:** el LLM de extracción no ve datos del paciente (hoy ya es así; hay que preservarlo).

## Opciones consideradas

1. **A · Abanico en la ingesta con lista acotada por criterio y por fragmento**, comparación determinista en la consulta y respaldo corto que degrada.
2. **B · Una llamada por documento con un objeto cerrado** (un valor por criterio; varios valores → Desconocido con `varios_valores_en_la_fuente`).
3. **C · Abanico en la consulta:** tareas cortas en paralelo por (fuente, criterio) en cada análisis, sin persistir.

## Decisión

Opción elegida: **A**, porque es la única que cumple a la vez las respuestas clínicas (lista por criterio con alcance, evaluación por fragmento citado), saca del camino crítico de la consulta un paso de 10 a 39 s y hace que el bucle sea imposible por construcción (tareas cortas, una fuente por llamada, `maxItems`, tope de tokens propio).

**Forma de la decisión:**

- **Ingesta (etapa A, US-242):** una tarea por (documento, criterio del catálogo); **nunca dos documentos en la misma llamada**. Cada tarea recibe los k fragmentos más relevantes para ese criterio y devuelve `{"values": [{"value", "chunkId", "scope"}]}`, con `maxItems` igual a `POPULATION_MAX_VALUES_PER_CRITERION` (3), `value` ≤ 200 caracteres y `scope` ∈ `elegibilidad | subgrupo | mencion`. El `chunkId` debe ser de ese documento. Los valores de relleno («not found», «no expresado») se rechazan. Cada valor pasa por el NLI contra su fragmento y se deduplica por valor normalizado (sinónimos del catálogo; sin código → `no_mapeado`, RN-27). Hay un único reintento con otra semilla, la concurrencia va con semáforo y la caché por documento + criterio + versiones. El resultado se guarda con `metadata_source = extraido_verificado`.
- **Persistencia (US-241):** `corpus.corpus_document.population_criteria` pasa a ser, por criterio, una lista acotada de valores con su procedencia (`chunkId`, `scope`, versión de prompt, modelo y catálogo, resultado NLI). La migración Alembic es la 0005. El lector acepta la forma antigua (string / `{valor, alcance}`) y la nueva durante un sprint.
- **Consulta (etapa B, US-243):** reglas puras de dominio, sin LLM. El estado de una opción se calcula solo con los valores que provienen de **los fragmentos que esa opción cita**, que por RN-01 son fragmentos recuperados en esa consulta y `is_current` (RN-05). Un valor de otro fragmento del mismo documento no cuenta para el estado ni se muestra como cita (hallazgo H-01 del `clinical-language-auditor`, 2026-10-29). Los valores con `scope` subgrupo o mención no cuentan para el estado y se muestran como contexto. Los estados internos (exacto, inclusivo, mezclado, en conflicto) se proyectan a los cuatro visibles de RN-28:
  - exacto y específico del perfil → **Coincide**;
  - inclusivo o mezclado → **Parcial**;
  - restricción explícita incumplida → **No coincide**;
  - valores en conflicto → **Desconocido** con `valores_en_conflicto`, ambos valores visibles y el aviso «requiere validación clínica/patológica» (`[S4 resp. 9]`);
  - valor ausente sin restricción → **Desconocido** (`no_reportado_por_fuente`).
- **Respaldo (etapa C, US-244):** si un documento está `pendiente`, la misma tarea corta corre en la consulta para los criterios que faltan, con plazo propio. Si falla o vence, el criterio queda Desconocido con `respaldo_fallido` y **el análisis no se descarta**: nunca `503` por una salida inválida. Si no hay criterios pendientes, el respaldo no se invoca.
- **Contrato (US-241, `[S4 resp. 5]`):** cambio **aditivo** en `contracts/schemas/evidence.yaml`:
  - nuevo `ApplicabilityCriterion.studyPopulationValues[]` (`{value, chunkId, scope}`). El tope de 3 rige por fragmento y criterio al extraer y persistir. La respuesta une los valores de todos los fragmentos citados por la opción, sin `maxItems`: la UI muestra 3 y revela el resto con «ver más» (US-126 AC-8, `[S4 resp. 13]`);
  - nuevo `ApplicabilityCriterion.partialReason` (`inclusiva | mezclada | rango_solapado | solo_subgrupo | null`) `[S4 resp. 11]`;
  - valores nuevos de `unknownReason`: `varios_valores_en_la_fuente`, `valores_en_conflicto` y `respaldo_fallido`;
  - `studyPopulationValue` se conserva **deprecado** durante un sprint y se retira en el S5 con su excepción de oasdiff declarada (ADR-26).
  - Los ejemplos de `contracts/examples/` y los mocks MSW/`respx` (US-213) se actualizan en el mismo PR.

### Consecuencias

- **Positivas:**
  - Desaparece el 503 de OUT-06 y el bucle no puede crecer, porque en el peor caso se pierde una tarea y no el análisis.
  - La consulta deja de enviar texto del corpus al LLM para este paso, lo que da menos latencia y menos memoria.
  - Los estados son reproducibles y trazables a su fragmento.
  - La UI puede mostrar hasta 3 valores por criterio con su cita y «ver más» (F-24, US-126).
  - La privacidad mejora: el extractor nunca ve al paciente.
- **Negativas:**
  - La ingesta es más larga: 10 documentos × 6 criterios ≈ 3 a 8 min en serie, una *estimación* que mide US-240.
  - Hay más hipótesis NLI por documento, con más RSS y latencia del NLI (deuda us-231b 1.11 → US-233a).
  - Exige un conjunto dorado para medir la precisión por criterio (US-233b).
  - Una nueva versión de prompt, modelo o catálogo obliga a reindexar lo afectado.
  - El dominio de aplicabilidad (`applicability_rules.py`, `aplicabilidad_tipos.py`) se refactoriza con TDD estricto.
  - `clinical-api` conserva los análisis históricos con la forma antigua de `applicability` (JSON persistido), y `web` debe tolerar ambas.
- **Configuración (RN-22):**
  - `POPULATION_MAX_VALUES_PER_CRITERION` (3)
  - `POPULATION_EXTRACTION_TOP_K` (k fragmentos, 3 a 5)
  - `POPULATION_EXTRACTION_MAX_OUTPUT_TOKENS` (≈ 256, a medir)
  - `POPULATION_EXTRACTION_CONCURRENCY` (por US-240)
  - `POPULATION_EXTRACTION_RETRIES` (1)
  - `POPULATION_FALLBACK_DEADLINE_MS`
  - el umbral NLI de verificación (el ya existente, `NLI_ENTAILMENT_THRESHOLD`, salvo que US-233b justifique otro)

### Confirmación

- **US-243:** tests de aceptación por caso clínico (F-20…F-24) y unitarios de las reglas puras, con TDD estricto y doble bucle.
- **US-244:** test de integración con un adapter que repite una propuesta hasta el tope y otro que devuelve JSON truncado. En ambos casos la respuesta es `200`, con el criterio Desconocido (`respaldo_fallido`) y las opciones conservadas.
- **`contracts:check` y `oasdiff`:** sin ERR (cambio aditivo). Los mocks se construyen desde `contracts/examples/`.
- **Suite `evaluate` (US-233b):** precisión y cobertura por criterio, tasa de duplicados, `finish_reason=length` = 0, concordancia de estados contra el conjunto dorado, regresión de «sin evidencia» y repetición de la causa del bucle en ≥ 20 casos (R17).
- **Datos de demo (US-247):** al menos dos pares paciente + pregunta con Coincide > 0 y Parcial > 0, y un No coincide excluyente.

## Pros y contras de las opciones

### A · Abanico en la ingesta con lista acotada

- A favor:
  - Cumple F-20…F-24.
  - Saca el LLM de la consulta para este paso.
  - Bucle imposible por construcción.
  - Valores versionados y revisables por humanos.
  - Escala con el corpus como trabajo por lotes.
  - Precedente en el código: el lector ya acepta `{valor, alcance}` (`domain/applicability_rules.py`).
- En contra:
  - Migración de datos y refactor del dominio.
  - Ingesta más larga.
  - Necesita un conjunto dorado.
  - Las reglas clínicas de la lista requieren la firma de DEC-11.

### B · Una llamada por documento, un valor por criterio

- A favor:
  - Es la opción más barata, porque reutiliza el extractor actual de US-118.
  - El contrato solo cambia en un valor nuevo de `unknownReason`.
  - No hay migración de forma.
- En contra:
  - Pierde las poblaciones inclusivas: «pre y posmenopáusicas» queda Desconocido en vez de Parcial, lo que contradice F-20.
  - Evalúa el documento entero y no el fragmento citado: con guías y revisiones da falsos positivos (R18), lo que contradice F-22.
  - Con todo el documento en una llamada, mantiene el riesgo de truncación.

### C · Abanico en la consulta

- A favor: no necesita migración ni ingesta nueva, y el valor siempre es fresco.
- En contra:
  - Con un único LLM local, paralelizar no escala: la caché KV multiplica la memoria por `OLLAMA_NUM_PARALLEL` y el margen del equipo de referencia es de unos 0,7 GB.
  - El paso, de 10 a 39 s, se queda en el camino crítico y pone en riesgo el p95 ≤ 15 s.
  - No es reproducible ni revisable por humanos.
  - Con cientos de documentos es inviable.

## Más información

- Análisis base y riesgos R1…R18: [`backlog/sprints/S4-insumo-extraccion-poblacion.md`](../../../backlog/sprints/S4-insumo-extraccion-poblacion.md).
- Evidencia del bucle y del 503: [`backlog/sprints/S3-demo-outcomes.md`](../../../backlog/sprints/S3-demo-outcomes.md) OUT-06.
- Respuestas clínicas F-20…F-24: [`backlog/sprints/S3-demo-cierre.md`](../../../backlog/sprints/S3-demo-cierre.md) §4.
- Decisiones del refinamiento: [`backlog/sprints/S4-refinamiento.md`](../../../backlog/sprints/S4-refinamiento.md).
- **No hacer** (medido en OUT-06): subir la temperatura o las penalizaciones como arreglo (`frequency_penalty` 0,5 corrompe los `chunkId`, RN-04), subir el tope de tokens o añadir un tope de iteraciones de búsqueda (no aplica a este fallo).
- **Revisión prevista:** cierre del S4, con el informe de US-240 (capacidad) y la suite de US-233b. Si la precisión por criterio no alcanza la meta, se reevalúa la extracción doble con comparación (S6 / si hay capacidad).
