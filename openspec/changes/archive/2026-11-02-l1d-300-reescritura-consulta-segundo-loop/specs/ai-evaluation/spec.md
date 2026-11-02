## ADDED Requirements

### Requirement: Medición del brazo de reescritura de consulta
El runner de variantes de `evaluate` (US-226) MUST reportar, para el brazo "reescritura" con el LLM local real, la latencia añadida (mediana y p95) solo en las consultas que disparan el segundo loop, recall@10 y MRR de esas consultas con y sin reescritura, y la métrica «sin evidencia» sobre preguntas sin respuesta (OL-06, TBD-02).

#### Scenario: El reporte mide latencia, calidad y «sin evidencia» del segundo loop [US-238 AC-9] [OL-06] [TBD-02]
- **GIVEN** la suite `evaluate` con el runner de variantes y el LLM local real
- **WHEN** se compara el brazo "reescritura" con la referencia
- **THEN** el reporte incluye la latencia añadida (mediana y p95) solo de las consultas que disparan el loop
- **AND** incluye recall@10 y MRR con y sin reescritura y la métrica «sin evidencia» ≥ 0,90
- **AND** `QUERY_REWRITE_ENABLED` queda en `false` por defecto si la mejora no excluye 0 en el IC pareado, si «sin evidencia» baja o si la latencia p95 añadida supera su límite de configuración (asumido 3 s)
