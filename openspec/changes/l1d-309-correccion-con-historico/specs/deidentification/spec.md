## ADDED Requirements

### Requirement: Una nota corregida nunca viaja a la IA mientras rija la minimización
Mientras rija la minimización de notas (en el S5 las notas quedan fuera del contexto de la IA, `[S5 resp. 12]`), el payload hacia `rag-orchestrator` MUST NOT contener el texto de una `ClinicalNote` corregida ni la PII sembrada en él, y `clinicalNotes` SHALL viajar vacío; si en el futuro las notas entran al contexto, solo podrán salir tras `PiiDetector` (ADR-40) en `ContextDeidentifier`. Ni el `content` ni la identidad SHALL aparecer en *logs* (RN-11).

#### Scenario: La PII sembrada en una nota corregida no viaja a la IA [US-253 AC-6] [US-253 AC-2] [ADR-40] [RN-11]
- **GIVEN** FX-T4a-a con su identidad en el repositorio de identidad, una nota de FX-253-a corregida con el nombre, el documento y un teléfono sintéticos del paciente, y `rag-orchestrator` simulado que captura el request
- **WHEN** el doctor pide un análisis de ese paciente
- **THEN** el payload capturado no contiene el texto de la nota ni ninguno de esos valores, y `clinicalContext.clinicalNotes = []`

#### Scenario: La corrección de una nota no deja su texto en los logs [US-253 AC-6] [RN-11]
- **GIVEN** el logger de test capturando la salida
- **WHEN** el doctor corrige una nota con PII sembrada
- **THEN** el evento `correccion_registrada` lleva solo `entityType`, UUIDs y `traceId`, y ninguna línea contiene el texto anterior, el nuevo ni la PII

Regresión [RN-11]: si un change posterior levanta la minimización (P-2 decidido: no en el S5), este requisito exige que las notas salgan enmascaradas por `PiiDetector`.
