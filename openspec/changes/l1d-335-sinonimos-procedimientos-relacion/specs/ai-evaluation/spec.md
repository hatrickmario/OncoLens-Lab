# Spec Delta — ai-evaluation (l1d-335, US-277)

## ADDED Requirements

### Requirement: Los pares de paráfrasis se miden con el catálogo ampliado y la reescritura activa
La suite `evaluate` con modelos locales MUST repetir, con el catálogo ampliado y `QUERY_REWRITE_ENABLED = true`, los pares de paráfrasis de US-276 cuya pérdida se atribuyó a la recuperación o al umbral, y SHALL reportar la proporción de pares en que la redacción coloquial obtiene evidencia cuando la técnica la obtiene, frente a la meta de configuración `paraphrase_evidence_min_ratio` (inicial 0,80, RN-22). Toda cifra MUST salir de un reporte versionado en `reports/eval/`.

#### Scenario: El reporte da la proporción de paráfrasis con evidencia [US-277 AC-2] [FR-09] [M-06.1]
- **GIVEN** los pares de US-276 atribuidos a la recuperación o al umbral, el catálogo ampliado y `QUERY_REWRITE_ENABLED = true`
- **WHEN** corre la suite con modelos locales
- **THEN** el reporte lista cada par con el resultado de sus dos redacciones y la proporción global
- **AND** declara si la proporción alcanza `paraphrase_evidence_min_ratio`

#### Scenario: Sin pares atribuidos a la recuperación o al umbral la proporción no se inventa [US-277 AC-2] (asumido)
- **GIVEN** un diagnóstico de US-276 sin pares atribuidos a la recuperación ni al umbral
- **WHEN** corre la suite
- **THEN** el reporte declara `sin_pares_aplicables` y la proporción es nula, no `0.0` ni `1.0`

### Requirement: El catálogo ampliado no empeora la recuperación fuera del ruido
La corrida final con el catálogo ampliado MUST compararse con la corrida base del mismo sprint y SHALL reportar recall@10, MRR, exactitud de «sin evidencia», preguntas adversarias y p95 de consulta completa frente a `p95_evidence_analyses_s`. Una métrica que empeore fuera del ruido (ADR-45 P6) o un p95 sobre el tope MUST marcar el brazo como «no adoptable»; `QUERY_REWRITE_ENABLED` no cambia de valor por defecto sin decisión del usuario sobre ese reporte.

#### Scenario: El reporte compara la corrida final con la base [US-277 AC-5] [ADR-45 P6] [ADR-39]
- **GIVEN** la corrida base del S7 y la corrida final con el catálogo ampliado y la reescritura activa
- **WHEN** se genera el reporte
- **THEN** da para cada métrica el valor base, el final y si la diferencia queda dentro del ruido
- **AND** registra el corpus de la corrida, que es el mismo de la base (`[S7 resp. 10]`), y los umbrales con los que corrió, que son los actuales en las dos (`[S7 resp. 11]`)
- **AND** da el p95 de consulta completa y si queda dentro de `p95_evidence_analyses_s`

#### Scenario: Una regresión fuera del ruido marca el brazo como no adoptable [US-277 AC-5] [ADR-45 P6]
- **GIVEN** un reporte comparado en el que la exactitud de «sin evidencia» baja fuera del ruido
- **WHEN** se evalúa la regla de adopción
- **THEN** el brazo queda «no adoptable» y `QUERY_REWRITE_ENABLED` conserva `false` por defecto

### Requirement: La corrida reporta también el brazo de 30 pares del reranker
La misma corrida MUST incluir un brazo con `RERANKER_MAX_PAIRS = 30` junto al valor vigente, y SHALL reportar para ambos recall@10, falsos «sin evidencia» y p95 de recuperación y de consulta completa. El valor por defecto de `RERANKER_MAX_PAIRS` MUST NOT cambiar en este cambio: lo decide el usuario sobre ese reporte (D6-61, RN-22).

#### Scenario: El reporte incluye el brazo de 30 pares [US-277 AC-6] [RN-22]
- **GIVEN** la suite de la corrida final con el valor vigente de `RERANKER_MAX_PAIRS` y el brazo de 30
- **WHEN** corre con modelos locales
- **THEN** el reporte da las métricas de los dos brazos sobre las mismas preguntas

#### Scenario: El valor por defecto no cambia sin decisión [US-277 AC-6] [RN-22]
- **GIVEN** el reporte con el brazo de 30 pares
- **WHEN** se cierra el cambio sin una decisión registrada del usuario
- **THEN** `RERANKER_MAX_PAIRS` conserva su valor por defecto vigente en configuración y en `.env.example`
