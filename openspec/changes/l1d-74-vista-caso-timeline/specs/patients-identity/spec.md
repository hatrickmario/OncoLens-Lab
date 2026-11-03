## MODIFIED Requirements

### Requirement: Contador de datos pendientes de revisión
`pendingReviewCount` MUST contar las filas clínicas vigentes del paciente con `review_status = requiere_revision` y, además, los `ClinicalEvent` vigentes con `date_precision = incierta` aunque su revisión sea `verificado` (PRD AC-02.2, US-088 AC-3), cada fila una sola vez. MUST NOT contar por su estado `auto_aceptado`, `verificado`, `corregido`, `rechazado` ni `reemplazado` (P-4). Si es mayor que 0, la ficha SHALL mostrar "[n] datos por revisar · no bloquean el análisis" y "Analizar evidencia" sigue disponible (RN-26).

#### Scenario: Con todo verificado el contador es 0 y sube a 1 con un biomarcador por revisar [US-051 AC-6] [FR-04] [S2 resp. 5]
- **GIVEN** el paciente semilla (a) con todos sus datos `verificado`
- **WHEN** se solicita la ficha
- **THEN** `pendingReviewCount = 0`
- **AND WHEN** el test cambia un biomarcador del paciente a `requiere_revision` y vuelve a solicitarla
- **THEN** `pendingReviewCount = 1`

#### Scenario: Un dato auto_aceptado no cuenta como pendiente [US-051 AC-6] [RN-26] [S2 resp. 5]
- **GIVEN** el paciente semilla (a) con un biomarcador cambiado a `auto_aceptado`
- **WHEN** se solicita la ficha
- **THEN** `pendingReviewCount = 0` y la fila de ese biomarcador muestra "Sin verificar" como texto

#### Scenario: El aviso de pendientes no bloquea el análisis [US-051 AC-6] [RN-26]
- **GIVEN** un `PatientSummary` con `pendingReviewCount = 2`
- **WHEN** se renderiza la ficha
- **THEN** se muestra el aviso informativo "2 datos por revisar · no bloquean el análisis" (no de error) y el enlace "Analizar evidencia" a `/pacientes/[id]/analisis` está visible y habilitado

#### Scenario: Los datos auto_aceptado muestran un aviso agregado que no bloquea [US-051 AC-6] [RN-26] (Gate 1)
- **GIVEN** un `PatientSummary` con dos valores mostrados en `reviewStatus = auto_aceptado`
- **WHEN** se renderiza la ficha
- **THEN** se muestra el aviso informativo "2 datos sin verificar · no bloquean el análisis" y "Analizar evidencia" sigue habilitado

#### Scenario: Un evento sin fecha confiable cuenta como pendiente aunque esté verificado [US-088 AC-3] [AC-02.2] [HU-15]
- **GIVEN** P-CASO (FX-02b-a), cuya toxicidad tiene `date_precision = incierta` y `review_status = requiere_revision`
- **WHEN** se solicita la ficha, el test cambia la revisión de esa toxicidad a `verificado` y se vuelve a solicitar
- **THEN** la toxicidad cuenta exactamente una vez en `pendingReviewCount` en las dos respuestas, y el contador no baja tras el cambio a `verificado`

#### Scenario: Un evento sin fecha confiable rechazado no cuenta [US-088 AC-3] [RN-07] [S5 resp. 13]
- **GIVEN** un paciente sintético con un único `ClinicalEvent` de `date_precision = incierta` en `rechazado` y el resto `verificado`
- **WHEN** se solicita la ficha
- **THEN** `pendingReviewCount = 0`
