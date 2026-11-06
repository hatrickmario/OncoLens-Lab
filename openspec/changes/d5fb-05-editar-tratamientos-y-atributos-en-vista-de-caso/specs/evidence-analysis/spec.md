## ADDED Requirements

### Requirement: Corregir un tratamiento o atributo recalcula faltantes y marca desactualizado el análisis previo
Tras corregir un `PriorTreatment` o un `ClinicalAttribute`, `GET /platform/patients/{id}/completeness` MUST reflejar la fila vigente nueva sin acción adicional, y un `AIAnalysisRecord` anterior MUST seguir intacto con `staleness.patientData = true` y `changedData` nombrando la sección cambiada (RN-06, FR-12). Un aviso de datos cambiados NO SHALL bloquear un análisis nuevo (RN-26).

#### Scenario: El checklist cambia de estado tras corregir [RN-26] [AC-04.1]
- **GIVEN** un ítem crítico con destino `ClinicalAttribute` en estado «Presente sin verificar» por un valor equivocado
- **WHEN** el doctor corrige el atributo
- **THEN** `GET …/completeness` lo devuelve «Presente y verificado» y el conteo de faltantes se actualiza

#### Scenario: El análisis previo queda desactualizado y sin alterar [RN-06] [FR-12]
- **GIVEN** un análisis guardado que usó el tratamiento «AC-T»
- **WHEN** el doctor lo corrige a «FEC»
- **THEN** el registro del análisis conserva su huella y contenido, y su `staleness.patientData` pasa a `true` con `priorTreatments` en `changedData`

#### Scenario: Un análisis nuevo usa el dato vigente [RN-07]
- **WHEN** el doctor genera un análisis después de la corrección
- **THEN** el contexto enviado contiene solo la fila vigente, nunca la `reemplazado`
