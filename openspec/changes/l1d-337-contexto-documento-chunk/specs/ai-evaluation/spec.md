## ADDED Requirements

### Requirement: Comparación de las variantes de contexto del chunk en la misma corrida
La suite `evaluate` MUST comparar las variantes `ninguno`, `determinista` y `llm` de `CORPUS_CHUNK_CONTEXT` en una sola ejecución, con los mismos modelos locales, las mismas preguntas y un índice propio para cada brazo, y SHALL reportar por brazo las métricas de recuperación, de latencia y de costo de la ingesta, y la diferencia frente a `ninguno`. El reporte no cambia ningún valor por defecto.

#### Scenario: El reporte compara los tres brazos con los pares de paráfrasis [US-279 AC-5] [OL-06] [ADR-45 P6]
- **GIVEN** la suite `evaluate` con los modelos locales de ADR-39, el conjunto de desarrollo, los pares de paráfrasis de US-276, los umbrales actuales y una colección por brazo: la de la ingesta de `l1d-119` para `ninguno` y las reindexadas desde ella para `determinista` y `llm`
- **WHEN** se ejecuta con la configuración de las variantes de contexto
- **THEN** el reporte trae para `ninguno`, `determinista` y `llm`: recall@10, MRR, falsos «sin evidencia», paráfrasis recuperadas, p95 de consulta completa, duración de la construcción del índice y memoria
- **AND** trae la diferencia de `determinista` y de `llm` frente a `ninguno` de esa misma corrida, con su intervalo de confianza pareado
- **AND** registra, por brazo, la variante, la versión de la plantilla del prefijo, la colección leída y, en `llm`, el modelo, la versión del prompt y los chunks que quedaron con respaldo determinista
- **AND** registra la colección de origen, que es el mismo corpus de la corrida base (`[S7 resp. 10]`)

#### Scenario: El reporte señala si un brazo cumple la regla de adopción, sin adoptarlo [US-279 AC-5] [RN-22]
- **GIVEN** un brazo cuya mejora frente a `ninguno` excluye 0 en el intervalo pareado y cuyo p95 de consulta completa no supera el tope `p95_evidence_analyses_s` de la configuración de metas
- **WHEN** termina la suite
- **THEN** el reporte marca ese brazo como «cumple la regla de adopción» y a los demás como «no cumple», con el motivo
- **AND** el valor por defecto de `CORPUS_CHUNK_CONTEXT` sigue siendo `ninguno`: la adopción es una decisión del usuario sobre el reporte versionado en `reports/eval/`

#### Scenario: Un brazo sin preguntas medibles no se reporta como cero [US-279 AC-5] (asumido)
- **GIVEN** un brazo para el que una métrica no tiene preguntas con respuesta que medir
- **WHEN** se arma el reporte
- **THEN** esa métrica es `null` («no medible») y no `0.0`, y el brazo no se marca como «cumple la regla de adopción»

#### Scenario: La comparación corre en la CI con adaptadores falsos y sin cifras de calidad [US-279 AC-5] (asumido)
- **GIVEN** la configuración de la comparación con adaptadores falsos y el dataset sintético de test
- **WHEN** corre en la CI
- **THEN** el reporte trae los tres brazos, cada consulta trazada con su brazo, y el rótulo de «no validada»
- **AND** el brazo `llm` usa el generador de contexto falso, sin ninguna llamada de red

#### Scenario: El brazo llm no se mide con un proveedor que no sea local [US-279 AC-5] [RN-12]
- **GIVEN** la configuración de la comparación con `proveedor: local` y una URL del LLM fuera de la lista local cerrada
- **WHEN** se lanza la suite
- **THEN** termina con código distinto de cero antes de construir ningún índice y no escribe cifras
