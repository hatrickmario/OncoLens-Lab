## ADDED Requirements

### Requirement: Familia `contextual` del segundo loop contextual
El runner `evaluate` SHALL ofrecer la familia `contextual`, fuera de `all`, que ejecuta las preguntas de la medición de
ADR-52 por el servicio real de consulta, con el contexto de casos sintéticos y el indicador de expansión de su
configuración, y escribe por pregunta el estado, si superó `RELEVANCE_THRESHOLD` y el segundo loop usado, más los
recuentos por clase. El informe MUST llevar solo ids, puntajes y recuentos.

#### Scenario: Cada pregunta de sinónimos supera el umbral o queda con su causa [US-271 AC-9] [RN-27]
- **GIVEN** la familia `contextual` con adaptadores falsos, los sinónimos del catálogo de la versión del manifest y tres preguntas de sinónimos declaradas en `contextual.preguntas_de_sinonimos`: una cuyo término recupera sobre el umbral, una cuyo término no aparece en ningún chunk del corpus de la corrida y una cuyo término aparece pero queda bajo el umbral
- **WHEN** corre `evaluate --suite contextual`
- **THEN** la primera lleva `supero_umbral: true` y `causa: null`
- **AND** la segunda lleva `supero_umbral: false` y `causa: termino_ausente_del_corpus`
- **AND** la tercera lleva `supero_umbral: false` y `causa: bajo_umbral_con_termino_en_corpus`
- **AND** ninguna pregunta de sinónimos queda sin `supero_umbral: true` o una causa de la lista cerrada

#### Scenario: La causa busca el término con todas sus formas del catálogo [US-271 AC-9] [RN-27] (asumido)
- **GIVEN** una pregunta de sinónimos bajo el umbral cuyo término solo aparece en el corpus con uno de los textos de su `sinonimos[]`, no con su forma canónica
- **WHEN** corre `evaluate --suite contextual`
- **THEN** la causa es `bajo_umbral_con_termino_en_corpus`, no `termino_ausente_del_corpus`
- **AND** cuenta como forma cada texto de `sinonimos[]` del término, sea cual sea su relación con el canónico

#### Scenario: El informe registra el corpus, el catálogo y los umbrales de la corrida [US-271 AC-9] [S7 resp. 10] [S7 resp. 11]
- **GIVEN** un informe de la familia
- **WHEN** se lee su configuración
- **THEN** trae la ruta y la versión del dataset del corpus, su recuento de chunks, la versión del catálogo y los umbrales con los que corrió
- **AND** el corpus es el del dataset `s5-corpus-ampliado`, el mismo en la corrida base y en la final

#### Scenario: Un término de sinónimos que no está en el catálogo impide la corrida [US-271 AC-9] [RN-27] (asumido)
- **GIVEN** una pregunta de sinónimos cuyo `termino` no es un `terminoCanonico` del catálogo versionado montado
- **WHEN** corre `evaluate --suite contextual`
- **THEN** la suite termina con código distinto de 0 nombrando el id de la pregunta y el término, y no escribe cifras

#### Scenario: Una pregunta sin evidencia lleva el puntaje en null, nunca en 0.0 [US-271 AC-3] [RN-02]
- **GIVEN** una pregunta que sigue bajo `RELEVANCE_THRESHOLD` tras el segundo loop
- **WHEN** se lee su fila del informe
- **THEN** `estado` es `sin_evidencia`, `top_relevance_score` es `null` y `supero_umbral` es `false`

#### Scenario: El informe da los recuentos por clase y el segundo loop usado [US-271 AC-2] [US-271 AC-4] [US-275 AC-4]
- **GIVEN** preguntas de las clases `generica`, `con_tema` y `control`, y `contextual.expansion_habilitada` en `true`
- **WHEN** corre la familia
- **THEN** el informe da, por caso y en total, las genéricas con evidencia, las de `con_tema` con evidencia (falsos positivos) y los controles con evidencia, cada uno con su denominador
- **AND** cada fila dice `segundo_loop: contextual` o `ninguno`
- **AND** con `contextual.expansion_habilitada` en `false` ninguna fila dice `contextual`

#### Scenario: El informe no lleva texto y solo acepta datos sintéticos [US-271 AC-6] [RN-13] [RN-14]
- **GIVEN** un informe de la familia y un dataset cuya clase no es `sintetico`
- **WHEN** se inspecciona el informe y se intenta correr con ese dataset
- **THEN** el informe no contiene el texto de ninguna pregunta, chunk, término del caso ni salida del LLM
- **AND** con el dataset no sintético la suite termina con código distinto de 0 sin escribir cifras

#### Scenario: La misma configuración con adaptadores falsos da el mismo informe [US-271 AC-9] (asumido)
- **GIVEN** `eval/configs/contextual-fake.yaml` y el reloj inyectado
- **WHEN** la familia corre dos veces
- **THEN** los dos informes son idénticos byte a byte
