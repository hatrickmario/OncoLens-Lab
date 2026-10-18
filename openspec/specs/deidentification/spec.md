# deidentification Specification

## Purpose
Define el comportamiento verificable de la desidentificación de todo lo que `clinical-api` envía hacia la IA (RN-11, dueña US-049): seudónimo aleatorio por consulta que nunca llega al prompt ni se persiste, fechas relativas, texto libre y pregunta enmascarados, minimización de notas y fallo cerrado cuando la desidentificación no puede garantizarse. Las Features que agregan contenido al contexto amplían estos requisitos por regresión.

## Requirements

### Requirement: La pregunta y el texto libre salen enmascarados hacia la IA
Antes de llamar a `rag-orchestrator`, `clinical-api` MUST enmascarar la `query` y el texto libre del `clinicalContext` con `PiiDetector` (en el S1, opción A de ADR-40 `[S1 resp. 3]`: identidad conocida más los formatos de `config/pii-formats.json` de L1D-166, fuente única, RN-22), sustituyendo cada coincidencia por un marcador y dejando intactos los términos clínicos. El payload MUST NOT contener `patientId` ni `birthYear` (RN-10, RN-11).

#### Scenario: La pregunta con nombre y documento del paciente sale enmascarada y conserva HER2 3+ [US-049 AC-1] [SEG-04] [RN-11] [OL-03] [AC-T4.3]
- **GIVEN** FX-T4a-a creado en la base de test, su identidad servida por el repositorio de identidad falso, `doc1@test.local` con sesión válida y `rag-orchestrator` simulado que captura el request
- **WHEN** envía `POST /platform/evidence-analyses` con la pregunta de FX-T4a-a (nombre y documento de identidad sintéticos más "HER2 3+"; el literal vive en el fixture, no en la spec)
- **THEN** el payload capturado no contiene ninguno de los valores de identidad de FX-T4a-a (nombre, apellido, documento, teléfono), ni el `patientId` ni `birthYear`
- **AND** la `query` enviada conserva "HER2 3+" y lleva marcadores de enmascaramiento en lugar del nombre y del documento

#### Scenario: La identidad del representante legal también se enmascara [US-049 AC-1] [RN-11] (asumido: la historia incluye la identidad del representante en la coincidencia exacta; aceptado [S1 resp. 3])
- **GIVEN** FX-T4a-c con su representante "Lucía Fernanda Rondón Peña" en el repositorio de identidad falso
- **WHEN** se ejecuta el análisis con una pregunta que nombra a la representante y al paciente
- **THEN** la `query` capturada no contiene `Tomás`, `Lucía`, `Rondón`, `1098765432` ni `52123456`

#### Scenario: Sin identidad registrada se aplican solo los patrones configurados [US-049 AC-1] [RN-22] (asumido: en el S1 no hay identidad almacenada hasta US-046; aceptado [S1 resp. 3])
- **GIVEN** el paciente semilla (b) sin identidad registrada y una pregunta que contiene un correo y un documento precedido de su palabra clave (`DNI 12345678`), ambos sintéticos y con los formatos de `config/pii-formats.json`
- **WHEN** se ejecuta el análisis
- **THEN** la `query` capturada sustituye ambos por sus marcadores, el resto de la pregunta queda igual y el cliente de `rag-orchestrator` registra una llamada

#### Scenario: Un teléfono escrito con separadores se enmascara [US-049 AC-1] [RN-11] (asumido: corrección del Gate 1, 2026-10-14; datos ficticios)
- **GIVEN** FX-T4a-a y la pregunta "¿Qué opciones describe la evidencia para HER2 3+? Teléfono 300 123 4567" (formato `telefono` de `config/pii-formats.json`, con palabra clave)
- **WHEN** se ejecuta el análisis
- **THEN** la `query` capturada no contiene `300 123 4567` ni `3001234567` y lleva `[TELEFONO]`
- **AND** conserva "HER2 3+"

#### Scenario: Las fechas absolutas en el texto libre se sustituyen por [FECHA] [US-049 AC-3] [RN-11] [AC-06.2] (asumido: corrección del Gate 1, 2026-10-14; datos ficticios)
- **GIVEN** el paciente semilla (b) y la pregunta "¿Qué describe la evidencia tras progresión del 15/03/2024 con Gleason 4+3, confirmada el 15 de marzo de 2024?"
- **WHEN** se ejecuta el análisis
- **THEN** la `query` capturada no contiene `15/03/2024` ni `15 de marzo de 2024` y lleva dos marcadores `[FECHA]`
- **AND** conserva "Gleason 4+3" y no rotula ninguna de las dos fechas como `[TELEFONO]` ni `[DOCUMENTO]`

Regresión [RN-11] desde S2 (FEAT-02b/02c, eventos y tratamientos), S3 (notas y faltantes) y Post-MVP (memoria, FEAT-11c): cada Feature amplía este requisito con su PII sembrada.

### Requirement: Seudónimo aleatorio por consulta, nunca persistido ni en el prompt
`clinical-api` MUST asignar a cada consulta un `pseudoPatientId` nuevo, generado con un generador criptográfico, que no contenga ni derive del `patientId`; el `pseudoPatientId` MUST NOT persistirse en `ai_analysis_record`. `rag-orchestrator` MUST NOT incluir el `pseudoPatientId` en el texto del prompt enviado al LLM (RN-11, readme §6.1 #6).

#### Scenario: Dos análisis seguidos llevan seudónimos distintos que no se persisten [US-049 AC-2] [RN-11] [readme §6.1 #6]
- **GIVEN** FX-T4a-a y el generador criptográfico real de seudónimos
- **WHEN** se ejecutan dos análisis seguidos y se comparan los payloads capturados
- **THEN** los `pseudoPatientId` son distintos y ninguno contiene el `patientId`
- **AND** ninguno aparece en ninguna columna de los `ai_analysis_record` persistidos (persistencia del change de L1D-104)

#### Scenario: El prompt para el LLM no contiene el seudónimo [US-049 AC-5] [RN-11]
- **GIVEN** un `RagQueryInternalRequest` sintético con `pseudoPatientId = "psd_p7f3a"` (el `p-7f3a` del AC, ajustado al patrón del contrato) y el LLM falso
- **WHEN** `rag-orchestrator` arma el prompt con el constructor del change de L1D-275
- **THEN** el texto del prompt no contiene `psd_p7f3a` ni `p7f3a`

### Requirement: El contexto enviado no lleva fechas absolutas
El `clinicalContext` que sale hacia `rag-orchestrator` MUST expresar todo tiempo como meses relativos al reloj inyectado y SHALL no contener ninguna fecha absoluta; `verificarDesidentificado()` MUST rechazar un contexto con una cadena `AAAA-MM-DD` (RN-11, AC-06.2).

#### Scenario: El contexto trae meses relativos exactos y ninguna fecha absoluta [US-049 AC-3] [RN-11] [AC-06.2]
- **GIVEN** FX-T4a-a con el reloj de test congelado
- **WHEN** se inspecciona el `clinicalContext` capturado
- **THEN** no contiene ninguna cadena `AAAA-MM-DD`
- **AND** trae `diagnosis.monthsSinceDiagnosis = 14`, `biomarkers[HER2].monthsAgo = 13`, y en `priorTreatments[0]` `monthsSinceStart = 12` y `monthsSinceEnd = 8`

### Requirement: Minimización de notas clínicas en el S1
En el S1 `clinical-api` MUST enviar `clinicalContext.clinicalNotes` vacío aunque el paciente tenga notas, y `verificarDesidentificado()` SHALL rechazar un contexto con notas (readme §2.5, OL-03).

#### Scenario: Una nota con nombre, documento y teléfono no viaja [US-049 AC-4] [OL-03] [readme §2.5]
- **GIVEN** FX-T4a-a con su `ClinicalNote` que contiene nombre, documento y teléfono
- **WHEN** se ejecuta el análisis
- **THEN** `clinicalContext.clinicalNotes = []` en el payload capturado

Regresión [RN-11] activa desde S3: notas enmascaradas en el contexto.

### Requirement: El snapshot persistido es el contexto desidentificado enviado
El `clinical_context_snapshot` del `AIAnalysisRecord` MUST ser el `clinicalContext` enviado sin la clave `pseudoPatientId` (data-model), con el mismo hash SHA-256 de su JSON canónico, y el `query_text` persistido MUST ser la pregunta enmascarada (AC-06.2, AC-T1.4).

#### Scenario: El snapshot coincide con lo enviado y no contiene identificadores [US-049 AC-6] [AC-06.2] [AC-T1.4]
- **GIVEN** el análisis del escenario del AC-1
- **WHEN** se lee `clinical_context_snapshot` del `AIAnalysisRecord`
- **THEN** su hash canónico es igual al del `clinicalContext` enviado, ambos sin `pseudoPatientId`
- **AND** ni el snapshot ni `query_text` contienen `52123456`, `Lucía`, `Rondón`, `3001234567`, el `patientId` ni `birthYear`

### Requirement: La desidentificación falla cerrada
Si el detector de PII o el lector de identidad lanzan una excepción, o si `verificarDesidentificado()` rechaza el resultado, `clinical-api` MUST responder `503` con `error = DESIDENTIFICACION_NO_DISPONIBLE` y `{ error, message, traceId }` sin detalles internos, SHALL no invocar a `rag-orchestrator` y MUST NOT persistir ningún `AIAnalysisRecord`; nunca envía el texto sin enmascarar como respaldo (RN-11).

#### Scenario: Con el detector caído no sale nada hacia la IA [US-049 AC-7] (asumido: falla cerrada; aceptado [S1 resp. 3])
- **GIVEN** FX-T4a-a y un detector de PII que lanza una excepción
- **WHEN** `doc1@test.local` solicita el análisis
- **THEN** la respuesta es `503` con `error = DESIDENTIFICACION_NO_DISPONIBLE`, válida contra el spec de `clinical-api`
- **AND** el cliente de `rag-orchestrator` registra cero llamadas y no se persiste ningún `ai_analysis_record`

#### Scenario: Con el lector de identidad caído tampoco sale nada [US-049 AC-7] (asumido: falla cerrada; aceptado [S1 resp. 3])
- **GIVEN** FX-T4a-a y un repositorio de identidad que lanza una excepción
- **WHEN** se solicita el análisis
- **THEN** la respuesta es `503` con `error = DESIDENTIFICACION_NO_DISPONIBLE`, cero llamadas a `rag-orchestrator` y ningún registro persistido

Regresión [RN-15 opt-out → 403] activa desde S6 (US-148).

### Requirement: La guarda de entorno sintético se conserva hasta G-Piloto
Antes de desidentificar, `clinical-api` MUST aplicar `exigirEntornoSintetico()` (de L1D-103): con `APP_ENV` fuera de `{local, test}` (o ausente) o `data_origin ≠ sintetico` SHALL responder `502 ERROR_SERVICIO_IA` genérico, sin invocar a `rag-orchestrator` ni persistir (RN-11, RN-13). La guarda MUST permanecer hasta G-Piloto; solo la retira US-143 (`preflight real-data`).

#### Scenario: Un paciente con data_origin real_anonimizado no sale hacia la IA con el desidentificador definitivo [RN-11] [RN-13] [S1 resp. 14d] (asumido: corrección del Gate 1, 2ª vuelta, 2026-10-14)
- **GIVEN** `doc1@test.local` con sesión válida, `APP_ENV = test`, el desidentificador definitivo compuesto, un paciente sintético creado en el test con `data_origin = real_anonimizado` y `rag-orchestrator` simulado que cuenta llamadas
- **WHEN** envía `POST /platform/evidence-analyses` con una pregunta válida sobre ese paciente
- **THEN** responde `502` con `error = ERROR_SERVICIO_IA`, `message` fijo y `traceId`, válido contra el spec de `clinical-api`
- **AND** el cliente de `rag-orchestrator` registra cero llamadas, no se persiste ningún `ai_analysis_record` y el log lleva `motivo = data_origin` sin la pregunta

#### Scenario: Con APP_ENV piloto o ausente el paciente semilla tampoco sale hacia la IA [RN-11] [RN-13] [S1 resp. 14d] (asumido: corrección del Gate 1, 2ª vuelta, 2026-10-14)
- **GIVEN** el paciente semilla (b) con `data_origin = sintetico` y la app de test arrancada con `APP_ENV = piloto`, y en otro caso sin `APP_ENV`
- **WHEN** `doc1@test.local` envía una pregunta válida
- **THEN** ambas respuestas son `502` con `error = ERROR_SERVICIO_IA`, el cliente de `rag-orchestrator` registra cero llamadas y el detector de PII no se invoca

Retiro previsto en S6 con US-143 (G-Piloto, `preflight real-data`), con su propio delta `REMOVED`. Regresión [RN-12 proveedores locales] activa desde S6 (US-050).

### Requirement: La desidentificación no registra valores detectados
Los logs de la desidentificación MUST contener solo `traceId`, el UUID del paciente, los tipos detectados (`findingTypes`) y conteos, y SHALL no contener los valores detectados, la pregunta, el contexto ni la identidad (RN-10).

#### Scenario: Con PII sintética sembrada los logs solo llevan tipos [US-049 AC-1] [RN-10] (asumido: regla de logs de CLAUDE.md aplicada al detector, US-013 Contexto técnico)
- **GIVEN** el análisis del escenario del AC-1 con los logs capturados
- **WHEN** se inspeccionan las líneas emitidas por la desidentificación
- **THEN** no contienen `52123456`, `Lucía`, `Rondón` ni la pregunta
- **AND** contienen el `traceId` y los tipos `nombre` y `documento`
