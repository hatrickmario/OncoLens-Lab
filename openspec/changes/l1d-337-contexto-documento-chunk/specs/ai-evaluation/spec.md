## ADDED Requirements

### Requirement: Comparación de las variantes de contexto del chunk en la misma corrida
La suite `evaluate` MUST comparar las variantes `ninguno`, `determinista` y `llm` de `CORPUS_CHUNK_CONTEXT` en una sola ejecución, con los mismos modelos locales, las mismas preguntas y un índice propio para cada brazo, y SHALL reportar por brazo las métricas de recuperación, de latencia y de costo de la ingesta, y la diferencia frente a `ninguno`, y marca cada brazo «adoptable» con `decidir_adopcion` (usuario, 2026-11-26). No cambia ningún valor por defecto.

#### Scenario: El reporte compara los tres brazos con los pares de paráfrasis [US-279 AC-5] [OL-06] [ADR-45 P6]
- **GIVEN** la suite `evaluate` con los modelos locales de ADR-39, el conjunto de desarrollo, los pares de paráfrasis de US-276, los umbrales actuales y una colección por brazo: la de la ingesta de `l1d-119` para `ninguno` y las reindexadas desde ella para `determinista` y `llm`
- **WHEN** se ejecuta con la configuración de las variantes de contexto
- **THEN** el reporte trae para `ninguno`, `determinista` y `llm`: recall@10, MRR, falsos «sin evidencia», paráfrasis recuperadas, p95 de consulta completa, duración de la construcción del índice y memoria
- **AND** trae la diferencia de `determinista` y de `llm` frente a `ninguno` de esa misma corrida, con su intervalo de confianza pareado
- **AND** registra, por brazo, la variante, la versión de la plantilla del prefijo, la colección leída y, en `llm`, el modelo, la versión del prompt y los chunks que quedaron con respaldo determinista
- **AND** registra la colección de origen, que es el mismo corpus de la corrida base (`[S7 resp. 10]`)

#### Scenario: Un brazo limpio es adoptable, sin adoptarlo [US-279 AC-5] [RN-22]
- **GIVEN** un brazo cuya mejora de recall@10 frente a `ninguno` excluye 0 en el intervalo pareado (`mejora_fuera_del_ruido`), cuyo p95 de consulta completa no supera `p95_evidence_analyses_s`, que no retrocede en recall ni en MRR más que `RETRIEVAL_REGRESSION_TOLERANCE`, que no aumenta los falsos «sin evidencia» por encima de esa tolerancia y cuya viabilidad es `viable`
- **WHEN** termina la suite
- **THEN** el reporte marca `adoptable: true` en ese brazo, con `motivos` vacíos, y a los demás con `adoptable: false` y sus motivos
- **AND** el valor por defecto de `CORPUS_CHUNK_CONTEXT` sigue siendo `ninguno`: adoptar es una decisión del usuario sobre el reporte versionado en `reports/eval/`

#### Scenario: Un brazo con mejora y p95 en regla pero con retroceso no es adoptable [US-279 AC-5] [ADR-45 P6]
- **GIVEN** un brazo con IC pareado de recall@10 que excluye 0, p95 bajo el tope y un retroceso de recall o de MRR mayor que la tolerancia de retroceso frente a `ninguno`
- **WHEN** termina la suite
- **THEN** el reporte marca `adoptable: false` con el motivo `retroceso`

#### Scenario: Un brazo que aumenta los falsos «sin evidencia» no es adoptable [US-279 AC-5] [RN-02]
- **GIVEN** un brazo con mejora fuera del ruido y p95 en regla, cuya proporción de falsos «sin evidencia» supera la de `ninguno` por más que la tolerancia de retroceso
- **WHEN** termina la suite
- **THEN** el reporte marca `adoptable: false` con el motivo `falsos_sin_evidencia`

#### Scenario: Un brazo fuera de los topes de viabilidad no es adoptable [US-279 AC-5] [ADR-39]
- **GIVEN** un brazo con mejora fuera del ruido y p95 en regla cuya viabilidad es `no_viable` (la memoria del stack supera el límite de ADR-39)
- **WHEN** termina la suite
- **THEN** el reporte marca `adoptable: false` con el motivo `no_viable`

#### Scenario: Una medición ausente deja la adopción en null y no en cero [US-279 AC-5] [RN-22]
- **GIVEN** un brazo sin retroceso ni aumento de falsos ni exceso de topes, pero cuya memoria del stack, falsos «sin evidencia», intervalo pareado o p95 no se midió
- **WHEN** termina la suite
- **THEN** el reporte marca `adoptable: null` (no `0.0` ni `false`) con el motivo de la medición ausente, y nunca `true`

#### Scenario: La mejora fuera del ruido y el p95 siguen exigidos para adoptar [US-279 AC-5] [RN-22]
- **GIVEN** un brazo sin retroceso, sin aumento de falsos y viable, pero cuyo IC pareado de recall@10 incluye 0 o cuyo p95 de consulta completa supera `p95_evidence_analyses_s`
- **WHEN** termina la suite
- **THEN** el reporte marca `adoptable: false` con el motivo `sin_mejora` o `p95_sobre_el_tope`
- **AND** `mejora_fuera_del_ruido` sigue informado por separado, y la regla se calcula con `decidir_adopcion` sin duplicarla en el código de la suite de contexto

#### Scenario: Un brazo sin preguntas medibles no se reporta como cero [US-279 AC-5] (asumido)
- **GIVEN** un brazo para el que una métrica no tiene preguntas con respuesta que medir
- **WHEN** se arma el reporte
- **THEN** esa métrica es `null` («no medible») y no `0.0`, y el brazo no se marca como adoptable (`adoptable: null`)

#### Scenario: La comparación corre en la CI con adaptadores falsos y sin cifras de calidad [US-279 AC-5] (asumido)
- **GIVEN** la configuración de la comparación con adaptadores falsos y el dataset sintético de test
- **WHEN** corre en la CI
- **THEN** el reporte trae los tres brazos, cada consulta trazada con su brazo, y el rótulo de «no validada»
- **AND** el brazo `llm` usa el generador de contexto falso, sin ninguna llamada de red

#### Scenario: El brazo llm no se mide con un proveedor que no sea local [US-279 AC-5] [RN-12]
- **GIVEN** la configuración de la comparación con `proveedor: local` y una URL del LLM fuera de la lista local cerrada
- **WHEN** se lanza la suite
- **THEN** termina con código distinto de cero antes de construir ningún índice y no escribe cifras
