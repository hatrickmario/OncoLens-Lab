## ADDED Requirements

### Requirement: La trayectoria del caso viaja en el contexto clínico
El `clinicalContext` MUST incluir los eventos clínicos, los tratamientos previos vigentes y `currentLine` (la mayor línea numerada en curso, o `null`), con tiempos en meses relativos y su `provenance`. Un evento sin fecha confiable (`event_date` nula o `date_precision = incierta`) SHALL viajar con `monthsAgo = null`. Los datos `rechazado`/`reemplazado` MUST NOT viajar (RN-07, ADR-50); `biomarkerTrends` sigue vacío hasta US-091.

#### Scenario: P-CASO envía la progresión, los dos tratamientos y la línea actual sin la cirugía rechazada [US-093 AC-1] [AC-06.2] [readme §4.2]
- **GIVEN** FX-02b-a (P-CASO) sembrado con el reloj de test fijo en 2026-10-01, `doc1@test.local` con sesión válida y `rag-orchestrator` simulado que captura el request
- **WHEN** envía `POST /platform/evidence-analyses` sobre P-CASO
- **THEN** `clinicalContext.events` trae la progresión con `monthsAgo = 2` y no trae ningún evento cuyo `dataRef` enlace a la cirugía `rechazado`
- **AND** `priorTreatments` trae Leuprorelina (`lineNumber = 1`, `atcCodes = [L02AE02]`) y Bicalutamida (`lineNumber = null`, `atcCodes = [L02BB03]`), ambos con `monthsSinceStart` no nulo
- **AND** `currentLine = 1` y `biomarkerTrends` es una lista vacía
- **AND** el `clinicalContext` valida contra `ClinicalContext` de `apps/rag-orchestrator/openapi.yaml`

#### Scenario: El PSA sin verificar viaja con su etiqueta de revisión [US-093 AC-3] [RN-07]
- **GIVEN** P-CASO, cuyo PSA más reciente (2026-07-15, 9,5 ng/mL) está en `requiere_revision`
- **WHEN** se captura el `clinicalContext` del análisis
- **THEN** el biomarcador PSA viaja con `value` 9,5 y `provenance.reviewStatus = requiere_revision`
- **AND** el evento `toxicidad` viaja con `provenance.reviewStatus = requiere_revision`, etiquetado y no omitido

#### Scenario: La toxicidad sin fecha confiable viaja con monthsAgo null [US-093 AC-5] [readme §4.2]
- **GIVEN** la toxicidad de P-CASO con `date_precision = incierta`
- **WHEN** se captura el `clinicalContext`
- **THEN** el evento `toxicidad` viaja con `monthsAgo = null`

#### Scenario: Un evento con fecha informada pero precisión incierta viaja sin meses [US-093 AC-5] (Decidido (usuario, 2026-11-03): misma regla que la vista de caso de l1d-74, `[S5 resp. 13]`)
- **GIVEN** P-CASO más un evento sintético `respuesta` con `event_date = 2026-05-10` y `date_precision = incierta`
- **WHEN** se captura el `clinicalContext`
- **THEN** ese evento viaja con `monthsAgo = null`, nunca con 4

#### Scenario: Un tratamiento y un atributo reemplazados no viajan [RN-07] [ADR-50] [AC-02.6]
- **GIVEN** P-CASO más un `PriorTreatment` y un `ClinicalAttribute` sintéticos que el test inserta en `reemplazado` (estas tablas no llevan `supersedes_id`; ADR-50 lo añade solo a `biomarker`, `exam` y `clinical_note`)
- **WHEN** se captura el `clinicalContext` y se lee el `clinical_context_snapshot` persistido
- **THEN** ningún `dataRef` del payload ni del snapshot enlaza a esas filas `reemplazado`
- **AND** ninguna `provenance.reviewStatus` vale `rechazado` ni `reemplazado`

#### Scenario: Un paciente sin trayectoria envía las listas vacías y currentLine null [US-093] (Decidido (usuario, 2026-11-03): borde de dato ausente, `[S5 resp. 13]`)
- **GIVEN** un paciente sintético con diagnóstico activo y sin eventos, tratamientos ni atributos
- **WHEN** se captura el `clinicalContext`
- **THEN** `events`, `priorTreatments` y `attributes` son listas vacías y `currentLine = null`

Regresión [RN-11] activa desde S1 (US-049): el enmascaramiento y las fechas relativas de la trayectoria los fija `deidentification`.
Regresión [RN-15] activa desde S6 (DEC-22): el opt-out de `analisis_ia` responde `403` antes de construir el contexto.
