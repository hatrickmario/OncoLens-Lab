## ADDED Requirements

### Requirement: Barrido del umbral de entailment y de RETRIEVAL_TOP_K sobre el corpus ampliado
`evaluate --sweep nli_entailment_threshold` y `--sweep retrieval_top_k` MUST recorrer `NLI_ENTAILMENT_THRESHOLD_GRID` y `RETRIEVAL_TOP_K_GRID` (configuración) y reportar por valor fidelidad, precisión de citas, «sin evidencia», recall@10 y MRR. El elegido SHALL salir de `elegir_umbral_entailment()` y `elegir_top_k()`, funciones puras, y reportarse como valor propuesto con su justificación; el barrido MUST NOT cambiar ningún valor por defecto (`[S7 resp. 11]`).

#### Scenario: Los barridos con modelos locales proponen los valores sin cambiar la configuración [US-120 AC-5] [ARR-03 AC-5] [RN-22] [S7 resp. 11]
- **GIVEN** el corpus del AC-1 (≥ 20 documentos por tipo), la suite con `proveedor: local` (US-233a) y las grillas en configuración
- **WHEN** se barren `NLI_ENTAILMENT_THRESHOLD` y `RETRIEVAL_TOP_K` en la corrida base
- **THEN** el reporte en `reports/eval/` trae la tabla por valor, el valor propuesto y su justificación, y registra el corpus y los umbrales con los que corrió
- **AND** los valores por defecto de `Settings` y de Compose no cambian

#### Scenario: La elección del umbral de entailment respeta las metas de citas y «sin evidencia» [US-120 AC-5] [RN-01] [RN-22] (asumido, regla a confirmar en /sprint-start)
- **GIVEN** una tabla de barrido con tres umbrales: 0,6 (fidelidad 0,95, precisión de citas 0,85), 0,7 (fidelidad 0,93, precisión 0,91) y 0,8 (fidelidad 0,93, precisión 0,92), todos con «sin evidencia» ≥ 0,90
- **WHEN** se llama a `elegir_umbral_entailment()` con las metas iniciales
- **THEN** elige 0,8: descarta 0,6 por precisión de citas bajo la meta y, a igual fidelidad, prefiere el umbral más alto

#### Scenario: Sin valor que cumpla las metas se conserva el provisional y se marca [US-120 AC-5] (asumido)
- **GIVEN** una tabla de barrido en la que ningún umbral alcanza la meta de precisión de citas
- **WHEN** se llama a `elegir_umbral_entailment()`
- **THEN** devuelve el valor provisional con la marca «sin valor elegible» y el reporte lo dice, sin inventar un valor

#### Scenario: La elección de top-k toma el menor k dentro de la tolerancia de recall [US-120 AC-5] [RN-22] (asumido, regla a confirmar en /sprint-start)
- **GIVEN** una tabla con `k` = 10, 20 y 30 y recall@10 0,74, 0,81 y 0,82, y `RETRIEVAL_TOP_K_RECALL_TOLERANCE = 0,02`
- **WHEN** se llama a `elegir_top_k()`
- **THEN** elige 20

#### Scenario: El barrido es reproducible con adaptadores falsos [US-120 AC-5] (asumido)
- **GIVEN** FX-T5a-a con grillas de 3 valores y `proveedor: fake`
- **WHEN** cada barrido se ejecuta dos veces
- **THEN** las tablas por valor y los elegidos son idénticos

#### Scenario: Sin los pesos locales el barrido no escribe cifras [US-120 AC-5] [OL-06]
- **GIVEN** un entorno sin los pesos de algún modelo de ADR-39
- **WHEN** se pide el barrido con `proveedor: local`
- **THEN** termina con código distinto de 0 nombrando la variable que falta y no modifica la configuración

### Requirement: Baseline técnico por tipo de cáncer con el umbral de relevancia definitivo
Con los modelos locales y el Compose sobre el corpus ampliado, el baseline MUST reportar recall@10, MRR, recall@10 es→en, fidelidad, precisión de citas y «sin evidencia» por tipo de cáncer e idioma, y el p95 de punta a punta de `/platform/evidence-analyses` como mediana de `EVAL_P95_RUNS` corridas (inicial 3); El barrido SHALL proponer `RELEVANCE_THRESHOLD`; el baseline corre con los umbrales actuales y registra corpus y umbrales (`[S7 resp. 11]`).

#### Scenario: El baseline trae las métricas por tipo e idioma y propone el umbral de relevancia [US-120 AC-6] [M-06.1] [M-06.2] [TBD-03] [RN-22] [S7 resp. 11]
- **GIVEN** los modelos locales de ADR-39, el stack de Compose con seed sintético y el corpus del AC-1
- **WHEN** se registra el baseline
- **THEN** el reporte contiene recall@10, MRR, es→en, fidelidad, precisión de citas y «sin evidencia» para mama y para próstata (es/en), cada una marcada «en meta» o «fuera de meta» frente a las metas iniciales sin modificarlas
- **AND** contiene el p95 de `/platform/evidence-analyses` como mediana de 3 corridas
- **AND** trae el valor de `RELEVANCE_THRESHOLD` propuesto por `elegir_umbral()` con su justificación, sin cambiar el valor por defecto
- **AND** registra el corpus medido y los umbrales actuales con los que corrió

#### Scenario: La desagregación por tipo e idioma es correcta con datos conocidos [US-120 AC-6] (asumido)
- **GIVEN** resultados por consulta de FX-T5a-a con tipo de cáncer e idioma conocidos y adaptadores falsos
- **WHEN** se agregan por tipo e idioma
- **THEN** cada celda coincide con el cálculo a mano y una celda sin consultas se reporta `null` con «no medida», nunca 0,0

#### Scenario: Fidelidad fuera de meta añade la valoración de OUT-08 sin implementarla [US-120 AC-6] [S4 resp. 15] (asumido)
- **GIVEN** un baseline cuya fidelidad queda fuera de meta
- **WHEN** se genera el reporte
- **THEN** incluye la sección de valoración de contexto del fragmento para el NLI y NLI más fuerte es↔en o umbral por tipo de afirmación (OUT-08, soluciones 3 y 4), sin cambiar modelos, *chunking* ni prompts

#### Scenario: El reporte del baseline solo contiene agregados [US-120 AC-6] [RN-14]
- **GIVEN** el baseline con modelos locales y datos sintéticos
- **WHEN** se escribe el reporte
- **THEN** no contiene textos de preguntas, fragmentos ni salidas generadas, solo métricas, configuración y versiones de modelos

### Requirement: Los umbrales calibrados se miden como un brazo de la corrida final
Los valores de `NLI_ENTAILMENT_THRESHOLD`, `RETRIEVAL_TOP_K` y `RELEVANCE_THRESHOLD` propuestos por los barridos de la corrida base MUST medirse en la corrida final como un brazo más, con la misma configuración y el mismo corpus que el baseline. La corrida base y los demás brazos de la final SHALL correr con los umbrales actuales, y ningún valor por defecto SHALL cambiar entre ambas (`[S7 resp. 11]`).

#### Scenario: El brazo de umbrales calibrados se compara con el baseline sin tocar los valores por defecto [US-120 AC-5] [US-120 AC-6] [RN-22] [S7 resp. 11]
- **GIVEN** los reportes de los barridos de la corrida base con un valor propuesto por parámetro y el baseline medido con los umbrales actuales
- **WHEN** en la corrida final se ejecuta el baseline con los umbrales propuestos pasados por configuración de la corrida
- **THEN** el reporte en `reports/eval/` trae las mismas métricas que el baseline, declara los umbrales del brazo y los actuales, y registra el mismo corpus que la base
- **AND** los valores por defecto de `Settings` y de Compose siguen siendo los de la corrida base

#### Scenario: La adopción es una decisión de cierre [US-120 AC-5] [US-120 AC-6] [S7 resp. 11]
- **GIVEN** el reporte del brazo de umbrales calibrados
- **WHEN** se toman las decisiones de cierre del sprint, junto a DEC-07
- **THEN** los valores por defecto de `Settings` y de Compose solo cambian si el usuario adopta los calibrados, con la ruta del reporte como justificación
- **AND** si no se adoptan, la configuración no cambia y el reporte queda como evidencia

## MODIFIED Requirements

### Requirement: Calibración del umbral de relevancia por barrido
`evaluate --sweep relevance_threshold` MUST recorrer los valores de `RELEVANCE_THRESHOLD_GRID` (configuración) y SHALL reportar por valor la exactitud de "sin evidencia" y el recall@10. El valor elegido MUST salir de una función pura (`elegir_umbral()`), nunca del código del barrido, y el reporte SHALL incluir su justificación. La fijación definitiva de `RELEVANCE_THRESHOLD` con modelos reales es de US-120 (AC-6), heredada de US-233 AC-8 `[S4 resp. 6]`, y solo ocurre si el valor calibrado se adopta en las decisiones de cierre tras la corrida final (`[S7 resp. 11]`).

#### Scenario: El barrido muestra cada valor y justifica el elegido [US-073 AC-1] [TBD-03] [RN-22]
- **GIVEN** el dataset de US-072 y `RELEVANCE_THRESHOLD_GRID` en la configuración
- **WHEN** se ejecuta `evaluate --sweep relevance_threshold`
- **THEN** `eval/reports/S1-baseline.md` muestra por valor la exactitud de "sin evidencia" y el recall@10, y el umbral elegido aparece con su justificación; `RELEVANCE_THRESHOLD_GRID` vive en la configuración

#### Scenario: El barrido es reproducible con la configuración de prueba [US-073 AC-1]
- **GIVEN** FX-T5a-a con una grilla de 3 valores
- **WHEN** el barrido se ejecuta dos veces
- **THEN** las tablas por valor son idénticas

### Requirement: Anotación del p95 fuera de meta
Cuando el p95 medido de `/platform/evidence-analyses` supere la meta, el reporte MUST anotarlo como insumo de ADR-42 sin modificar la meta de la configuración. El baseline técnico por tipo de cáncer y la fijación definitiva de `RELEVANCE_THRESHOLD` son de US-120 (AC-6), heredados de US-233 AC-8 `[S4 resp. 6]`; la fijación queda sujeta a la adopción en el cierre (`[S7 resp. 11]`).

#### Scenario: Un p95 fuera de meta se anota sin cambiar la meta [US-073 AC-3] [G-5] [TBD-08]
- **GIVEN** un p95 medido mayor que 15 s
- **WHEN** se registra el baseline
- **THEN** el reporte lo anota como insumo de ADR-42 y la meta de p95 de la configuración no cambia
