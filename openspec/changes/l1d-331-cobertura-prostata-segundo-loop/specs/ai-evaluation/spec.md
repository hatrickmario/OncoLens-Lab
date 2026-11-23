## ADDED Requirements

### Requirement: La medición del loop contextual reporta la cobertura de genéricas por caso de próstata
La familia `contextual` de `evaluate` MUST ejecutar las preguntas genéricas de
`preguntas-contextuales.yaml` con cada caso sintético de próstata de su configuración y SHALL reportar, por caso, las
genéricas con evidencia, los tres primeros chunks por pregunta y el resultado frente a la meta
`contextual.genericas_con_evidencia_minimo` de su configuración. El reporte MUST contener solo ids, puestos, puntajes
y recuentos.

#### Scenario: El reporte da la cobertura por caso de próstata y el top-3 por pregunta [US-273 AC-2] [US-273 AC-1] [RN-02]
- **GIVEN** la familia `contextual` con adapters falsos, las 22 preguntas genéricas y los casos sintéticos `prostata-con-grado` y `prostata-con-psa-y-hrr` de `temas-del-caso.json`
- **WHEN** se ejecuta `evaluate` con la configuración de la medición
- **THEN** el reporte trae, por caso, el recuento de genéricas con evidencia sobre 22 y, por pregunta, los ids de sus tres primeros chunks con su `relevance_score`
- **AND** cada caso figura con los campos usados (`contextExpansion.fields`), sin el texto de la pregunta, de la consulta ni de los chunks

#### Scenario: La meta de cobertura sale de la configuración y el reporte dice si se cumple [US-273 AC-2] [RN-22]
- **GIVEN** `contextual.genericas_con_evidencia_minimo` en la configuración de la suite (valor inicial: el de US-273 AC-2) y un caso cuyo recuento queda por debajo
- **WHEN** se escribe el reporte
- **THEN** ese caso figura con la meta leída de la configuración y marcado como no cumplido
- **AND** las demás métricas del reporte no cambian y ningún valor de la meta está escrito en el código

#### Scenario: Las 60 preguntas no empeoran y las adversarias siguen sin evidencia [US-273 AC-2] [RN-02] [OL-06]
- **GIVEN** las 60 preguntas de la medición (22 genéricas, 24 con tema fuera del corpus y 14 controles) y un reporte base de la misma suite
- **WHEN** se compara la corrida con el reporte base
- **THEN** el reporte da, para ambas, recall@10, MRR, controles con evidencia y falsos positivos de las 24, y señala cada métrica que empeora
- **AND** cada adversaria figura como `sin_evidencia` con `topRelevanceScore` `null` y 0 llamadas al LLM de generación
- **AND** la comparación solo se hace si el corpus registrado en los dos reportes coincide (el del dataset `s5-corpus-ampliado`, `[S7 resp. 10]`); si no, termina con error sin escribir diferencias

#### Scenario: Un caso de próstata sin términos del catálogo cuenta como sin evidencia, nunca como cero [US-273 AC-2] [RN-02] [RN-27]
- **GIVEN** un caso de próstata cuyo estadio, grado y biomarcadores no están en el catálogo y cuyo tipo no tiene etiqueta
- **WHEN** se mide una pregunta genérica con ese caso
- **THEN** no hay segunda recuperación, la pregunta cuenta como sin evidencia y su puntaje en el reporte es `null`, no `0.0`

#### Scenario: Sin el modelo local no hay reporte ni se usa la nube [US-273 AC-2] [RN-12] (asumido)
- **GIVEN** la configuración con modelos locales y el runtime local sin responder
- **WHEN** se lanza la medición
- **THEN** la corrida termina con error, no escribe un reporte parcial y no llama a ningún proveedor de nube
