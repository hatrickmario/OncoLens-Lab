## ADDED Requirements

### Requirement: Conjunto dorado de población revisado por una persona
`data/evaluation/poblacion-dorado/` MUST contener, por (documento, criterio, fragmento), los valores esperados con su `scope`, el rol del revisor y la fecha, con ≥ 30 pares documento × criterio estratificados por tipo de fuente (guía, ensayo, revisión) e idioma (es/en), construidos desde la muestra revisada con `PLANTILLA.md` ampliada.

#### Scenario: El conjunto versionado trae valores, scope, revisor y estratos [US-233b AC-1] [S4 resp. 6] [ADR47-R9] (asumido el tamaño mínimo)
- **GIVEN** la muestra revisada por el usuario con `data/evaluation/corpus-metadatos/PLANTILLA.md` ampliada
- **WHEN** se versiona en `data/evaluation/poblacion-dorado/`
- **THEN** cada par documento × criterio trae los valores esperados con `scope` y fragmento, el rol del revisor y la fecha
- **AND** hay al menos 30 pares estratificados por tipo de fuente (guía, ensayo, revisión) e idioma (es/en)

### Requirement: Suite `poblacion` con precisión y cobertura por criterio
`evaluate --suite poblacion` con `proveedor: local` MUST reportar la precisión y la cobertura de cada criterio frente a las metas en configuración y la tasa de duplicados, solo como agregados.

#### Scenario: El reporte trae precisión, cobertura y duplicados por criterio [US-233b AC-2] [M-08.3] [M-08.4] [S4 resp. 3]
- **GIVEN** el conjunto dorado y la configuración con `proveedor: local`
- **WHEN** se ejecuta `evaluate --suite poblacion`
- **THEN** el reporte trae, por criterio, la precisión y la cobertura frente a su meta en configuración (RN-22) y la tasa de duplicados
- **AND** el reporte no contiene valores extraídos ni texto de fragmentos

### Requirement: Sin cortes por longitud en la extracción medida
Si alguna tarea de extracción medida termina con `finish_reason = length`, la suite MUST terminar con código distinto de 0 y nombrar cada caso por documento y criterio, sin contenido; el reporte SHALL escribirse igualmente.

#### Scenario: Cero cortes por longitud da código 0 [US-233b AC-3] [ADR47-R4]
- **GIVEN** la ejecución de la suite sin tareas con `finish_reason = length`
- **WHEN** se cuentan
- **THEN** el recuento es 0 y la suite no termina por esta causa

#### Scenario: Un corte por longitud rompe la suite y se nombra sin contenido [US-233b AC-3] [S4 resp. 3] [RN-14]
- **GIVEN** un adaptador falso que fuerza `finish_reason = length` en una tarea de un documento y criterio
- **WHEN** se ejecuta la suite
- **THEN** termina con código distinto de 0 y el mensaje nombra ese documento y criterio
- **AND** ni el mensaje ni el reporte contienen el prompt, la salida del LLM ni texto de fragmentos

### Requirement: Concordancia de estados con No coincide y Coincide indebidos aparte
La suite MUST comparar los estados esperados del conjunto dorado (casos F-20…F-24 de DEC-11) con los calculados por las reglas de US-243, reportar la concordancia por estado y contar aparte cada No coincide indebido y cada Coincide indebido.

#### Scenario: La concordancia se reporta por estado y los indebidos van aparte [US-233b AC-4] [ADR47-R1] [ADR47-R2] [M-08.2] [S4 resp. 8]
- **GIVEN** los estados esperados de F-20…F-24 y los estados calculados por US-243
- **WHEN** se comparan
- **THEN** el reporte da la concordancia por estado (Coincide, Parcial, No coincide, Desconocido)
- **AND** cuenta aparte cada No coincide indebido y cada Coincide indebido

#### Scenario: Un esperado alterado baja la concordancia [US-233b AC-4] (asumido)
- **GIVEN** un dorado de prueba cuyo estado esperado de un caso se cambia a otro
- **WHEN** se ejecuta la suite
- **THEN** la concordancia baja y el caso cuenta como indebido del tipo que corresponda

### Requirement: Regresión de «sin evidencia» con cero invocaciones del LLM
Con la extracción de US-242 activa, la métrica «sin evidencia» MUST no bajar respecto del baseline registrado y el análisis sin evidencia SHALL tener cero invocaciones del LLM de generación y del agente.

#### Scenario: «Sin evidencia» no baja y no invoca al LLM [US-233b AC-5] [RN-02] [G-4]
- **GIVEN** el baseline registrado en `data/evaluation/baseline.json` y la suite con la extracción de US-242
- **WHEN** se ejecuta la suite
- **THEN** la métrica «sin evidencia» es ≥ la del baseline
- **AND** el recuento de invocaciones del LLM de generación en el camino sin evidencia es 0 y `top_relevance_score` es `null`

#### Scenario: Una baja de «sin evidencia» rompe la regresión [US-233b AC-5] [RN-02] (asumido)
- **GIVEN** un baseline con «sin evidencia» 0,90 y un resultado de 0,80
- **WHEN** se ejecuta la comparación
- **THEN** la suite falla y nombra la métrica `sin_evidencia`

### Requirement: Repetición de la causa del bucle en al menos 20 casos
La suite MUST ejecutar la tarea corta de US-242 sobre ≥ 20 pares pregunta + fuentes distintos del caso del tamoxifeno, reportar la tasa de cortes por longitud y marcar la causa de OUT-06 como «cerrada» solo si esa tasa es 0.

#### Scenario: OUT-06 solo se cierra con tasa de cortes 0 [US-233b AC-6] [ADR47-R17] [OUT-06]
- **GIVEN** ≥ 20 pares pregunta + fuentes distintos del caso del tamoxifeno
- **WHEN** se ejecuta la tarea corta de US-242 sobre cada uno
- **THEN** el reporte da la tasa de cortes por longitud
- **AND** la causa de OUT-06 queda «cerrada» solo si la tasa es 0; con tasa > 0 queda «abierta»

#### Scenario: Con menos de 20 pares el cierre no se declara [US-233b AC-6] (asumido)
- **GIVEN** un conjunto de bucle con 19 pares
- **WHEN** se ejecuta la suite
- **THEN** OUT-06 no se marca «cerrada» y el reporte indica el tamaño insuficiente

### Requirement: Conjunto dorado sin revisión es «no concluyente»
Si el conjunto dorado no trae revisor o fecha, la suite MUST marcar la precisión y la cobertura como «no concluyente» y SHALL NOT darles PASS.

#### Scenario: Sin revisor o sin fecha no hay PASS [US-233b AC-7] (asumido)
- **GIVEN** un conjunto dorado sin revisor o sin fecha
- **WHEN** se ejecuta la suite
- **THEN** precisión y cobertura quedan «no concluyente» y el veredicto global no es PASS

### Requirement: Dorado y reporte con solo corpus público y agregados
El conjunto dorado y el reporte MUST contener solo corpus público con licencia aceptada y métricas agregadas, sin datos de pacientes, y el escaneo de PII de la CI SHALL no encontrar nada.

#### Scenario: La CI no encuentra PII ni fuentes sin licencia [US-233b AC-8] [RN-14] [RN-21]
- **GIVEN** `data/evaluation/poblacion-dorado/` y el reporte de la suite
- **WHEN** corre la CI
- **THEN** el manifiesto declara licencia aceptada por fuente y el escaneo de PII y secretos no encuentra hallazgos
- **AND** la suite se niega a correr (código 1) con un manifiesto que no declara corpus público con licencia aceptada, sin calcular métricas

### Requirement: La suite de población corre con modelos locales
`evaluate --suite poblacion` con `adaptadores.proveedor: local` MUST ejecutar la extracción con el LLM y el NLI locales y SHALL negarse a correr, sin escribir cifras, si falta un peso o una variable de los modelos o si la configuración nombra un proveedor que no es local.

#### Scenario: La configuración local compone los puertos locales [US-233b AC-2] [RN-12] (D5-26)
- **GIVEN** `eval/configs/poblacion-local.yaml` con `proveedor: local` y puertos de LLM y NLI sustituidos por adaptadores falsos en el test
- **WHEN** se ejecuta `evaluate --suite poblacion --config eval/configs/poblacion-local.yaml`
- **THEN** la familia corre, no sale con el código 2 de «proveedor sin cablear» y el reporte declara `proveedor = local`

#### Scenario: Sin pesos o con un proveedor de nube la suite no corre [US-233b AC-2] [RN-12] (asumido)
- **GIVEN** la configuración local sin la variable de un peso de modelo, o con un alias de proveedor de nube
- **WHEN** se ejecuta la suite
- **THEN** termina con código distinto de 0, el mensaje nombra la variable o el proveedor y no se escribe ningún reporte con cifras

### Requirement: El conjunto dorado cubre los criterios de próstata
`data/evaluation/poblacion-dorado/` MUST incluir al menos 16 pares documento × criterio de próstata que cubran `estado_castracion`, `extension`, `isup` y `hrr_brca`, estratificados por tipo de fuente (guía, ensayo, revisión) e idioma (es/en), además de `ecog` y `linea_tratamiento`.

#### Scenario: El dorado ampliado trae pares de próstata por criterio y estrato [US-233b AC-1] [ADR47-R9] `[S7 resp. 1]` (asumido: D-1 amplía lo que pide el AC-1)
- **GIVEN** el conjunto dorado ampliado
- **WHEN** corre el test de carga del dataset
- **THEN** hay al menos 16 pares de próstata y cada uno de `estado_castracion`, `extension`, `isup` y `hrr_brca` tiene pares de guía, ensayo y revisión en español y en inglés
- **AND** los 36 pares de mama siguen presentes y todo el texto es sintético con licencia `sintetico_propio`

### Requirement: El conjunto dorado incluye redacciones difíciles y distractores
El conjunto dorado MUST incluir al menos 12 casos con redacción no plantilla (negación, rango, definición implícita, inclusión total, umbral y valor en tabla) y al menos 8 distractores en los que el valor aparece solo con alcance de subgrupo o como mención, y la suite SHALL reportar la precisión y la cobertura por tipo de redacción y contar aparte los valores dados como elegibilidad en un distractor.

#### Scenario: El dorado declara casos difíciles de cada tipo [US-233b AC-1] `[S7 resp. 1]` (asumido: D-2)
- **GIVEN** el conjunto dorado ampliado
- **WHEN** corre el test de carga del dataset
- **THEN** hay al menos 12 casos marcados como difíciles y cada tipo (negación, rango, definición implícita, inclusión total, umbral, tabla) tiene al menos uno

#### Scenario: El reporte separa la redacción plantilla de la difícil [US-233b AC-2] [M-08.3] [M-08.4] (asumido: D-2)
- **GIVEN** el dorado ampliado y la configuración de adaptadores falsos
- **WHEN** se ejecuta la suite
- **THEN** el reporte trae la precisión y la cobertura por criterio y, aparte, por tipo de redacción, solo con agregados

#### Scenario: Un valor de subgrupo o mención dado como elegibilidad se cuenta aparte [US-233b AC-2] [ADR-47] (asumido: D-3)
- **GIVEN** al menos 8 distractores cuyo esperado no tiene valores de `elegibilidad` y un adaptador falso que devuelve un valor de elegibilidad en uno de ellos
- **WHEN** se ejecuta la suite
- **THEN** el reporte cuenta 1 valor indebido en distractores y nombra el documento y el criterio, sin el valor ni el fragmento

### Requirement: Los estados esperados cubren próstata y las rendijas de la revisión clínica
`estados.yaml` MUST incluir un caso por regla F-20…F-23 con el criterio `estado_castracion` y casos de `extension` (C-1), y SHALL contar aparte, sin cambiar la regla vigente, los casos de elegibilidad de un solo valor sin marcador de restricción (C-3).

#### Scenario: La concordancia incluye casos de estado de próstata [US-233b AC-4] [M-08.2] `[S7 resp. 1]` (asumido: D-5)
- **GIVEN** `estados.yaml` con un caso por regla F-20…F-23 sobre `estado_castracion` y los casos de `extension`
- **WHEN** se comparan con los estados calculados por las reglas de US-243 con un catálogo que tiene reglas de próstata
- **THEN** el reporte da la concordancia por estado también para próstata y cuenta aparte cada No coincide indebido y cada Coincide indebido

#### Scenario: Los casos de extension cubren el estado principal y el repliegue de C-1 [US-233b AC-4] [M-08.2] (asumido: supuesto compartido SC-1 de `l1d-126`)
- **GIVEN** `estados.yaml` con dos casos de `extension` frente a una fuente restringida a enfermedad metastásica: un paciente con M0 legible en su estadio y otro cuyo estadio no permite leer M0 ni M1
- **WHEN** se comparan con los estados calculados con el catálogo de `l1d-126` parte B
- **THEN** el esperado del segundo caso es `desconocido` con `sin_regla_de_comparacion` y no cuenta como No coincide
- **AND** el esperado del primero es el que da la regla del catálogo mergeado: `no_coincide` si la lectura de M0/M1 entró, `desconocido` si no entró, y el reporte dice cuál de los dos

#### Scenario: Los casos de un solo valor sin restricción se cuentan como rendija [US-233b AC-4] (asumido: C-3, pregunta Q-1 para expertos)
- **GIVEN** casos en los que la fuente declara un solo valor de un criterio mutuamente excluyente sin marcador de restricción y el paciente tiene otro valor
- **WHEN** se ejecuta la suite
- **THEN** el estado esperado y el calculado son `desconocido` según la regla vigente
- **AND** el reporte cuenta aparte cuántos casos caen en esa situación, sin marcarlos como error

### Requirement: Un dorado con revisión provisional de IA sigue siendo no concluyente
Un conjunto dorado cuyo manifiesto solo trae `revision_provisional` con rol `ia`, sin revisor humano, MUST dar la precisión y la cobertura como «no concluyente» y SHALL NOT dar PASS.

#### Scenario: La base y la final miden el mismo dorado, corpus y umbrales [US-233b AC-2] `[S7 resp. 10]` `[S7 resp. 11]` (asumido: política de ventanas del Gate 1 del S7)
- **GIVEN** la parte del dorado que no depende del catálogo de `l1d-126` parte B, añadida antes de la corrida base, y la parte que depende de C-1, C-2, C-4 o C-5, añadida entre la base y la final
- **WHEN** se comparan los reportes de la corrida base y de la corrida final
- **THEN** los dos declaran como corpus los documentos del dorado y los mismos umbrales
- **AND** el reporte de la final separa los pares y casos añadidos después de la base y los declara no comparables con ella

#### Scenario: La revisión de IA no convierte el dorado en revisado [US-233b AC-7] `[S7 resp. 1]`
- **GIVEN** un manifiesto con `revision_provisional = {rol: ia, fecha: 2026-11-21}` y `revisor = {rol: null, fecha: null}`
- **WHEN** se ejecuta la suite
- **THEN** precisión y cobertura quedan «no concluyente», el veredicto global no es PASS y el reporte declara la revisión provisional

