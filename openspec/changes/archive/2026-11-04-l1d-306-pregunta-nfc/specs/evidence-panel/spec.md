## ADDED Requirements

### Requirement: El panel valida y envía la pregunta normalizada
El panel MUST medir la longitud de la pregunta y enviarla a `POST /api/evidence-analyses` después de normalizarla con la misma regla que `clinical-api` (Unicode NFC, espacios colapsados y recortados), usando el esquema compartido; el campo SHALL conservar el texto tal como lo escribió o pegó el oncólogo. La validación del cliente es de UX: `clinical-api` vuelve a normalizar y validar (OUT-05).

#### Scenario: Una pregunta pegada en NFD se envía en NFC [US-250 AC-1] [OUT-05]
- **GIVEN** el panel del paciente semilla (a) y `POST /api/evidence-analyses` simulado con MSW desde `contracts/examples/` que registra el cuerpo
- **WHEN** el oncólogo pega la pregunta de la Demo 4 en NFD y la envía
- **THEN** el cuerpo registrado tiene la `query` en NFC, idéntica byte a byte a la de la misma pregunta escrita en NFC
- **AND** el campo sigue mostrando el texto pegado

#### Scenario: Una pregunta cuyo NFD supera el máximo y cuyo NFC no se envía sin error [US-250 AC-3] [OUT-05]
- **GIVEN** el mismo panel y una pregunta de 2000 caracteres en NFC cuya forma NFD supera 2000 caracteres
- **WHEN** el oncólogo la pega en NFD y la envía
- **THEN** no aparece "La pregunta admite como máximo 2000 caracteres." y sale un `POST /api/evidence-analyses` con la pregunta en NFC de 2000 caracteres
