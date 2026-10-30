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
