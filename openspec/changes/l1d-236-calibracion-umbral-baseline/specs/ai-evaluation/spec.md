## ADDED Requirements

### Requirement: Calibración del umbral de relevancia por barrido
`evaluate --sweep relevance_threshold` MUST recorrer los valores de `RELEVANCE_THRESHOLD_GRID` (configuración) y SHALL reportar por valor la exactitud de "sin evidencia" y el recall@10. El valor elegido MUST quedar en la configuración como `RELEVANCE_THRESHOLD`, nunca en el código, con su justificación en el reporte.

#### Scenario: El barrido muestra cada valor y fija el elegido en configuración [US-073 AC-1] [TBD-03] [RN-22]
- **GIVEN** el dataset de US-072 y `RELEVANCE_THRESHOLD_GRID` en la configuración
- **WHEN** se ejecuta `evaluate --sweep relevance_threshold`
- **THEN** `eval/reports/S1-baseline.md` muestra por valor la exactitud de "sin evidencia" y el recall@10, y `RELEVANCE_THRESHOLD` en la configuración toma el valor elegido con su justificación

#### Scenario: El barrido es reproducible con la configuración de prueba [US-073 AC-1]
- **GIVEN** FX-T5a-a con una grilla de 3 valores
- **WHEN** el barrido se ejecuta dos veces
- **THEN** las tablas por valor son idénticas

### Requirement: Baseline técnico registrado por tipo de cáncer
El baseline MUST registrar recall@10, MRR, español → inglés, fidelidad, precisión de citas y "sin evidencia" para mama y para próstata, y el p95 de `/platform/evidence-analyses` de punta a punta como mediana de 3 corridas, con la configuración de modelos de ADR-39.

#### Scenario: El reporte contiene el baseline completo [US-073 AC-2] [M-06.1] [M-06.2]
- **GIVEN** los modelos de ADR-39 y el stack de Compose
- **WHEN** se registra el baseline
- **THEN** el reporte contiene recall@10, MRR, español → inglés, fidelidad, precisión de citas y "sin evidencia" para mama y para próstata, y el p95 de `/platform/evidence-analyses` de punta a punta (3 corridas, mediana)

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
