## ADDED Requirements

### Requirement: Corregir un tratamiento o atributo recalcula el checklist y deja intacto el análisis previo
Tras corregir un `PriorTreatment` o un `ClinicalAttribute`, el checklist MUST reflejar la fila vigente nueva sin acción adicional y un `AIAnalysisRecord` anterior MUST seguir intacto, con una huella de contexto distinta de la del análisis nuevo (RN-06, FR-12). Un aviso de datos cambiados NO SHALL bloquear un análisis nuevo (RN-26). La marca `staleness.patientData` la calculará el detector de US-175 (L1D-148, S6); hoy `staleness` es neutro.

#### Scenario: El checklist cambia de estado tras corregir [RN-26] [AC-04.1]
- **GIVEN** un ítem crítico con destino `ClinicalAttribute` en estado «Presente sin verificar» por un valor equivocado
- **WHEN** el doctor corrige el atributo
- **THEN** `GET …/completeness` lo devuelve «Presente y verificado» y el conteo de faltantes se actualiza

#### Scenario: El análisis previo queda intacto y su huella difiere de la del análisis nuevo [RN-06] [FR-12]
- **GIVEN** un análisis guardado que usó el tratamiento «TCH propio» y el atributo `posmenopausica`
- **WHEN** el doctor los corrige a «FEC» y `premenopausica` y se genera un análisis nuevo
- **THEN** el registro del análisis previo conserva su huella y su instantánea, y el nuevo tiene otra huella
- **AND** (TRASLADADA a US-175 / L1D-148) `staleness.patientData = true` con la sección en `changedData` cuando exista el detector

#### Scenario: Un análisis nuevo usa el dato vigente [RN-07]
- **WHEN** el doctor genera un análisis después de la corrección
- **THEN** el contexto enviado contiene solo la fila vigente, nunca la `reemplazado`
