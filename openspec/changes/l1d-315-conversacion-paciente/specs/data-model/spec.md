## ADDED Requirements

### Requirement: Persistencia de la conversación y de sus turnos
El modelo MUST declarar `clinical.conversation`, con `thread_id` único, y `clinical.conversation_turn`, con
`turn_number` único por conversación, la pregunta enmascarada, la intención, los bloques validados (`blocks`, con las
citas dentro de cada bloque), los enlaces a datos (`data_links`), `analysis_id` opcional,
`structured_state`, modelos y `trace_id` (ADR-51 §3). Ambas tablas MUST quedar "sin pseudoPatientId ni identidad" (RN-10,
RN-11) y con la retención del registro del análisis (RN-18).

#### Scenario: conversation y conversation_turn están en el modelo [US-258 AC-1] [US-258 AC-2] [ADR-51]
- **WHEN** se revisa el schema `clinical` de `docs/architecture/data-model.md` y la migración Prisma
- **THEN** existen `conversation` con `thread_id` único y `conversation_turn` con `turn_number` único por conversación, `analysis_id` como FK opcional a `ai_analysis_record`, las columnas de modelos y `trace_id`, y la frase "sin pseudoPatientId ni identidad"

#### Scenario: Una columna de identidad en la conversación rompe la verificación [US-258 AC-5] [RN-10] [RN-11]
- **WHEN** un parche sobre una copia en memoria del documento añade `pseudo_patient_id` a `conversation_turn` o elimina `trace_id`
- **THEN** `assertDataModelDocument()` falla nombrando la tabla y la columna
