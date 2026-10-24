## ADDED Requirements

### Requirement: Cada dato del contexto clínico lleva su procedencia
Cada dato del `clinicalContext` que `clinical-api` envía a `rag-orchestrator` (diagnóstico, biomarcadores, atributos, tratamientos previos y eventos) MUST llevar `provenance` con `entryMethod`, `extractionConfidence` y `reviewStatus` copiados del dato, y `conflict = true` si y solo si el dato tiene `conflicts_with_id` (RN-07). Un dato sin verificar SHALL viajar etiquetado, nunca omitido.

#### Scenario: El paciente semilla viaja con procedencia seed verificada y sin conflicto [US-065 AC-1] [RN-07]
- **GIVEN** el paciente semilla (a) sin datos añadidos y `rag-orchestrator` simulado que captura el request
- **WHEN** un doctor solicita un análisis de evidencia sobre ese paciente
- **THEN** el diagnóstico y cada biomarcador del `clinicalContext` capturado llevan `provenance` con `entryMethod = seed`, `reviewStatus = verificado` y `conflict = false`

#### Scenario: El dato extraído sin verificar viaja con su procedencia [US-065 AC-2] [RN-07]
- **GIVEN** FX-T1a-a sobre el paciente semilla (a)
- **WHEN** un doctor solicita un análisis de evidencia y se captura el `clinicalContext`
- **THEN** el Ki-67 `20 %` está incluido con `provenance.entryMethod = ocr`, `provenance.extractionConfidence = media` y `provenance.reviewStatus = requiere_revision`

#### Scenario: El dato sembrado en conflicto viaja con conflict true [US-065 AC-4] [readme §4.1] [RN-07] [S3 resp. 8]
- **GIVEN** FX-T1a-a, cuyo receptor de estrógeno `90 %` se inserta ya con `review_status = requiere_revision` y `conflicts_with_id` hacia el receptor de estrógeno del seed, sin detección automática
- **WHEN** un doctor solicita un análisis de evidencia y se captura el `clinicalContext`
- **THEN** el receptor de estrógeno `90 %` lleva `provenance.conflict = true` y `provenance.reviewStatus = requiere_revision`

Regresión [RN-07] activa desde S5 (US-099 AC-8): conflicto detectado por la reconciliación al persistir una extracción, en lugar de sembrado.

### Requirement: Los datos rechazados o reemplazados nunca entran al contexto ni al registro
Un dato con `review_status` `rechazado` o `reemplazado` MUST NOT aparecer en el `clinicalContext` enviado a `rag-orchestrator` ni en el `clinical_context_snapshot` del `AIAnalysisRecord` persistido (RN-07, AC-02.6). La exclusión SHALL aplicarse con un único predicado de RN-07 compartido con la ficha del paciente.

#### Scenario: Los receptores de progesterona rechazado y reemplazado no viajan ni se persisten [US-065 AC-3] [AC-02.6] [RN-07]
- **GIVEN** FX-T1a-a, con un receptor de progesterona `negativo` `rechazado` y otro `positivo` `reemplazado`
- **WHEN** un doctor solicita un análisis de evidencia, se captura el `clinicalContext` y se lee el `AIAnalysisRecord` persistido
- **THEN** ningún biomarcador `Receptor de progesterona` aparece en el `clinicalContext` capturado
- **AND** ningún biomarcador `Receptor de progesterona` aparece en `clinical_context_snapshot`
- **AND** ningún valor `rechazado` ni `reemplazado` aparece en ninguna `provenance.reviewStatus` del payload ni del snapshot
