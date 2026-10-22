## ADDED Requirements

### Requirement: Calibración del umbral de relevancia por barrido
`evaluate --sweep relevance_threshold` MUST recorrer los valores de `RELEVANCE_THRESHOLD_GRID` (configuración) y SHALL reportar por valor la exactitud de "sin evidencia" y el recall@10. El valor elegido MUST salir de una función pura (`elegir_umbral()`), nunca del código del barrido, y el reporte SHALL incluir su justificación. La fijación definitiva de `RELEVANCE_THRESHOLD` en la configuración con modelos reales se traslada a US-233 (AC-8), `[S2 resp. 19]`.

#### Scenario: El barrido muestra cada valor y justifica el elegido [US-073 AC-1] [TBD-03] [RN-22]
- **GIVEN** el dataset de US-072 y `RELEVANCE_THRESHOLD_GRID` en la configuración
- **WHEN** se ejecuta `evaluate --sweep relevance_threshold`
- **THEN** `eval/reports/S1-baseline.md` muestra por valor la exactitud de "sin evidencia" y el recall@10, y el umbral elegido aparece con su justificación; `RELEVANCE_THRESHOLD_GRID` vive en la configuración

#### Scenario: El barrido es reproducible con la configuración de prueba [US-073 AC-1]
- **GIVEN** FX-T5a-a con una grilla de 3 valores
- **WHEN** el barrido se ejecuta dos veces
- **THEN** las tablas por valor son idénticas

### Requirement: Anotación del p95 fuera de meta
Cuando el p95 medido de `/platform/evidence-analyses` supere la meta, el reporte MUST anotarlo como insumo de ADR-42 sin modificar la meta de la configuración. El baseline técnico por tipo de cáncer (US-073 AC-2) y la fijación definitiva de `RELEVANCE_THRESHOLD` se trasladan a US-233 (AC-8), `[S2 resp. 19]`.

#### Scenario: Un p95 fuera de meta se anota sin cambiar la meta [US-073 AC-3] [G-5] [TBD-08]
- **GIVEN** un p95 medido mayor que 15 s
- **WHEN** se registra el baseline
- **THEN** el reporte lo anota como insumo de ADR-42 y la meta de p95 de la configuración no cambia

### Requirement: Comparación con las metas iniciales sin modificarlas
Cada métrica del baseline MUST aparecer como "en meta" o "fuera de meta" frente a las metas iniciales de PRD §2.1, leídas de la configuración, y el change NO SHALL modificar esas metas.

#### Scenario: Cada métrica se marca en meta o fuera de meta [US-073 AC-4] [TBD-02]
- **GIVEN** el baseline y las metas iniciales en la configuración
- **WHEN** se genera el reporte
- **THEN** cada métrica aparece como "en meta" o "fuera de meta" y el archivo de metas queda sin cambios
