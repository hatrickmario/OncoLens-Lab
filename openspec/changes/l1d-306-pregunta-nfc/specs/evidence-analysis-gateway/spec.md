## ADDED Requirements

### Requirement: La pregunta se normaliza a NFC en el borde antes de validarse, persistirse y enviarse
`clinical-api` MUST normalizar la `query` de `POST /platform/evidence-analyses` en el borde, antes de validar su longitud y de desidentificarla: Unicode NFC, todo espacio en blanco Unicode (incluidos los no separables) colapsado a un espacio y recortado en los extremos, sin cambiar mayúsculas, signos ni puntuación. El `queryText` persistido y la `query` enviada a `rag-orchestrator` SHALL ser los de la pregunta normalizada (RN-06, OUT-05).

#### Scenario: La pregunta de la Demo 4 en NFD se persiste y se envía byte a byte igual que en NFC [US-250 AC-1] [OUT-05] [RN-06]
- **GIVEN** `doc1@test.local` con sesión válida, el paciente semilla (a) y `rag-orchestrator` simulado (MSW desde `contracts/examples/`) que registra el cuerpo recibido
- **WHEN** envía `POST /platform/evidence-analyses` con la pregunta de la Demo 4 en NFD y, en otra petición, la misma pregunta en NFC
- **THEN** ambas responden `200`, válidas contra el spec de `clinical-api`
- **AND** la `query` que recibe `rag-orchestrator` está en NFC y es idéntica byte a byte en las dos peticiones
- **AND** el `queryText` de los dos `AIAnalysisRecord` persistidos está en NFC y es idéntico byte a byte

#### Scenario: Espacios en los extremos, repetidos o no separables se recortan y colapsan sin tocar el resto [US-250 AC-2] [OUT-05]
- **GIVEN** el mismo contexto
- **WHEN** envía una pregunta con espacios al inicio y al final, dos espacios seguidos, un tabulador y un espacio no separable (U+00A0) entre palabras, con mayúsculas, `¿`, `?` y comas
- **THEN** la `query` enviada y el `queryText` persistido no tienen espacios en los extremos y cada secuencia de espacios es un único espacio U+0020
- **AND** las mayúsculas, los signos y la puntuación son los mismos que en la pregunta enviada

#### Scenario: Una pregunta cuyo NFD supera el máximo y cuyo NFC no se acepta [US-250 AC-3] [OUT-05]
- **GIVEN** el mismo contexto y una pregunta de 2000 caracteres en NFC cuya forma NFD supera 2000 caracteres
- **WHEN** la envía en NFD
- **THEN** no responde `422` y el cliente de `rag-orchestrator` registra una llamada con la pregunta en NFC de 2000 caracteres

#### Scenario: Una pregunta formada solo por espacios responde 422 sin llamar a rag-orchestrator [US-250 AC-3] [AC-05.1] (Decidido (usuario, 2026-11-03): el mínimo de 1 carácter también se mide tras normalizar, `[S5 resp. 13]`)
- **GIVEN** el mismo contexto
- **WHEN** envía una `query` formada solo por espacios, tabuladores y espacios no separables
- **THEN** responde `422` con `error = CUERPO_INVALIDO`, `message` y `traceId`, válido contra el spec de `clinical-api`
- **AND** el cliente de `rag-orchestrator` registra cero llamadas y no se persiste ningún `AIAnalysisRecord`
