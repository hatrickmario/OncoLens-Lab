# evidence-analysis-gateway Specification

## Purpose
Define el comportamiento verificable del gateway de `clinical-api` para `POST /platform/evidence-analyses`: cómo se valida la petición en el borde, qué contexto clínico del caso se construye y se envía a `rag-orchestrator`, y cuándo no se invoca a `rag-orchestrator`. La persistencia del análisis y la desidentificación completa las añaden otros changes del mismo módulo con requisitos propios.

## Requirements

### Requirement: Request interno completo hacia rag-orchestrator
Para una petición válida sobre un paciente existente y con sesión válida, `clinical-api` MUST enviar a `POST /rag/query` un `RagQueryInternalRequest` válido contra el spec de `rag-orchestrator`, con `dataClassification` tomado de `patient.data_origin`, `catalogVersion` leído del `manifest.json` de `CLINICAL_CATALOG_PATH` y `maxOptions` de la clave de configuración `ANALYSIS_MAX_OPTIONS` (FR-09, HU-03).

#### Scenario: La pregunta sobre el paciente semilla de próstata envía su diagnóstico, su ADT y su progresión [US-052 AC-1] [AC-06.2] [HU-03] [OL-03]
- **GIVEN** `doc1@test.local` con sesión válida, el paciente semilla (b) del seed sintético y `rag-orchestrator` simulado con MSW que captura el request
- **WHEN** envía `POST /platform/evidence-analyses` con la pregunta "¿Qué opciones describe la evidencia para cáncer de próstata con progresión tras terapia de deprivación androgénica?" y `sourcesSelected` con `guias`, `ensayos` y `publicaciones` en `true`
- **THEN** el request capturado lleva `traceId`, `query`, `sourcesSelected`, `dataClassification = sintetico`, `catalogVersion` igual a la versión del `manifest.json` y `maxOptions = 1`
- **AND** su `clinicalContext` tiene `diagnosis.cancerType = prostata`, `diagnosis.grade` con el grupo ISUP, un elemento en `priorTreatments` (ADT) y un evento de progresión en `events`
- **AND** el request valida contra `RagQueryInternalRequest`

### Requirement: El gateway usa el transporte de servicio y nunca reenvía la sesión
El cliente generado hacia `rag-orchestrator` MUST instanciarse sobre el transporte `createRagOrchestratorFetch()` (JWT de servicio) y SHALL invocarse por el hostname interno `RAG_ORCHESTRATOR_URL`, sin reenviar cabeceras del request entrante, en particular `Cookie`.

#### Scenario: El request del análisis lleva el JWT de servicio y nunca la cookie del doctor [US-054 AC-4] [US-052 AC-1] [OL-03]
- **GIVEN** `doc1@test.local` con su cookie de sesión `oncolens_session` sintética, el paciente semilla (b), un par ES256 efímero de test y `rag-orchestrator` simulado que captura cabeceras
- **WHEN** envía `POST /platform/evidence-analyses` con la pregunta del AC-1
- **THEN** el request capturado hacia `/rag/query` lleva `Authorization: Bearer <jwt>` verificable con la clave pública efímera
- **AND** no lleva cabecera `Cookie` ni ninguna cabecera copiada del request entrante

### Requirement: Contexto clínico por allowlist explícita
`ClinicalContextBuilder` MUST construir el `clinicalContext` campo a campo desde una allowlist explícita, nunca copiando entidades completas; el resultado SHALL validar contra `ClinicalContext` con `additionalProperties: false` (RN-10). `clinicalNotes`, `biomarkerTrends` y `priorAnalyses` MUST viajar vacíos; `missingCriticalData` SHALL contener solo claves del catálogo clínico cargado.

#### Scenario: El contexto enviado valida contra el esquema cerrado y no lleva identificadores [US-052 AC-4] [RN-10] [OL-03]
- **GIVEN** el request capturado del caso del AC-1 sobre el paciente semilla (b)
- **WHEN** se validan las claves de `clinicalContext` contra el esquema `ClinicalContext` de `apps/rag-orchestrator/openapi.yaml` con `additionalProperties: false`
- **THEN** la validación pasa
- **AND** ninguna clave ni valor del payload contiene `patientId`, `identification`, `birthYear`, `agreementReference` ni `sourceDataset`, ni el UUID interno del paciente
- **AND** `clinicalNotes`, `biomarkerTrends` y `priorAnalyses` son listas vacías
- **AND** cada elemento de `missingCriticalData` es una clave del catálogo cargado

Regresión [RN-07] activa desde S3 (US-065): exclusión de datos `rechazado`/`reemplazado` y etiquetado completo de procedencia.
Regresión [RN-11] activa desde S1 con el change de L1D-203 (US-049): seudónimo criptográfico, enmascaramiento de la pregunta y del texto libre.

#### Scenario: Campos de la allowlist del contexto clínico [RN-10] [US-052]
- **GIVEN** el `clinicalContext` construido por `ClinicalContextBuilder`
- **WHEN** se inspecciona su allowlist
- **THEN** contiene solo diagnóstico activo, último valor por biomarcador, tratamientos previos, eventos, atributos, `currentLine` y, desde el S3, `missingCriticalData` con las claves del checklist

### Requirement: Validación de la petición en el borde sin invocar a la IA
`clinical-api` MUST validar el cuerpo de `POST /platform/evidence-analyses` con el schema Zod generado de `EvidenceAnalysisRequest` antes de cualquier lectura o llamada saliente; un cuerpo inválido (`query` vacía o de más de 2000 caracteres, o `sourcesSelected` sin ninguna fuente en `true`) SHALL responder `422` con `{ error, message, traceId }` (`error = CUERPO_INVALIDO`) y cero llamadas a `rag-orchestrator` (AC-05.1).

#### Scenario: Una pregunta vacía, demasiado larga o sin fuentes responde 422 sin llamar a rag-orchestrator [US-052 AC-2] [AC-05.1] [OL-03]
- **GIVEN** `doc1@test.local` con sesión válida, el paciente semilla (b) y `rag-orchestrator` simulado que cuenta llamadas
- **WHEN** envía un body con `query` vacía, otro con `query` de 2001 caracteres y otro con `guias`, `ensayos` y `publicaciones` en `false`
- **THEN** cada uno responde `422` con `error = CUERPO_INVALIDO`, `message` y `traceId`, válido contra el spec de `clinical-api`
- **AND** el cliente de `rag-orchestrator` registra cero llamadas

#### Scenario: Una pregunta de exactamente 2000 caracteres se acepta [US-052 AC-2] [AC-05.1] (asumido: borde inclusivo del contrato maxLength 2000)
- **GIVEN** el mismo contexto
- **WHEN** envía una `query` de 2000 caracteres con una fuente en `true`
- **THEN** no responde `422` y el cliente de `rag-orchestrator` registra una llamada

### Requirement: Paciente inexistente sin invocar a la IA
Si el `patientId` de la petición no corresponde a ningún paciente, `clinical-api` MUST responder `404` con `error = NO_ENCONTRADO` y SHALL no invocar a `rag-orchestrator`.

#### Scenario: Un patientId inexistente responde 404 sin llamar a rag-orchestrator [US-052 AC-3] [OL-03]
- **GIVEN** `doc1@test.local` con sesión válida y un `patientId` UUID que no existe en `clinical.patient`
- **WHEN** envía `POST /platform/evidence-analyses` con una pregunta válida
- **THEN** responde `404` con `error = NO_ENCONTRADO`, válido contra el spec de `clinical-api`
- **AND** el cliente de `rag-orchestrator` registra cero llamadas

### Requirement: Caso sin tipo de cáncer no se analiza
Si el paciente existe pero no tiene diagnóstico activo (el contexto no tendría tipo de cáncer), `clinical-api` MUST responder `422` con `error = TIPO_CANCER_NO_REGISTRADO`, `message` y `traceId` antes de desidentificar o llamar a `rag-orchestrator`; SHALL NOT invocar a la IA ni persistir un `AIAnalysisRecord`, y SHALL NOT presentarlo como "sin evidencia" (OL-02, `[S1 resp. 35]`).

#### Scenario: Un paciente sin diagnóstico responde 422 TIPO_CANCER_NO_REGISTRADO sin llamar a la IA ni persistir [S1 resp. 35] [OL-02] [OL-03]
- **GIVEN** `doc1@test.local` con sesión válida y un paciente sintético con `data_origin = sintetico`, creado en el test con datos ficticios y sin ningún `Diagnosis` activo
- **WHEN** envía `POST /platform/evidence-analyses` con una pregunta válida sobre ese paciente
- **THEN** responde `422` con `error = TIPO_CANCER_NO_REGISTRADO`, `message` y `traceId`, válido contra el spec de `clinical-api`
- **AND** el cliente de `rag-orchestrator` registra cero llamadas
- **AND** `ai_analysis_record` no tiene ninguna fila nueva

### Requirement: Filtros aceptados y reenviados sin alterar el contexto en el S1
`clinical-api` MUST aceptar `filtersApplied` en la petición, reenviarlo a `rag-orchestrator` como `RagFiltersApplied` efectivo y, en el S1, SHALL no modificar el `clinicalContext` por los filtros; `filters_applied` MUST quedar disponible para la persistencia del análisis con el valor recibido.

#### Scenario: ultimosSeisMeses en true no cambia el contexto enviado y queda registrado [US-052 AC-5] [AC-05.1] [OL-03]
- **GIVEN** el request del AC-1 con `filtersApplied.ultimosSeisMeses = true`
- **WHEN** se envía
- **THEN** el `clinicalContext` capturado es idéntico al del AC-1 salvo `pseudoPatientId` y el request lleva `filtersApplied.ultimosSeisMeses = true`
- **AND** responde `200` y `filters_applied` queda persistido con `ultimosSeisMeses = true` (persistencia y respuesta implementadas por el change de L1D-104)

### Requirement: Sin sesión válida no se invoca a la IA
`POST /platform/evidence-analyses` MUST estar montado detrás del guard de sesión de `clinical-api`; sin cookie de sesión válida SHALL responder `401` con `error = NO_AUTENTICADO` antes del controlador y sin invocar a `rag-orchestrator` (FR-01).

#### Scenario: Un request sin cookie de sesión responde 401 antes del controlador [US-052 AC-6] [FR-01] [OL-03]
- **GIVEN** un request a `POST /platform/evidence-analyses` sin cookie de sesión, y otro con una cookie inexistente
- **WHEN** llega a `clinical-api`
- **THEN** ambos responden `401` con `error = NO_AUTENTICADO`, válido contra el spec de `clinical-api`
- **AND** el controlador no se ejecuta y el cliente de `rag-orchestrator` registra cero llamadas

### Requirement: Solo el rol doctor solicita análisis en el S1
`POST /platform/evidence-analyses` MUST exigir, tras el guard de sesión y antes de validar el cuerpo, que la sesión tenga rol `doctor`; con otro rol (en el S1, `admin`) SHALL responder `403` con `error = PERMISO_DENEGADO`, sin leer el caso ni invocar a `rag-orchestrator` (mínimo privilegio, PRD E-04, `[S1 resp. 14c]`).

#### Scenario: El administrador recibe 403 y no se invoca a la IA [US-052 AC-6] [PRD E-04] [S1 resp. 14c]
- **GIVEN** `admin@test.local` con sesión válida, el paciente semilla (b) y `rag-orchestrator` simulado que cuenta llamadas
- **WHEN** envía `POST /platform/evidence-analyses` con la pregunta del AC-1
- **THEN** responde `403` con `error = PERMISO_DENEGADO`, `message` y `traceId`, válido contra el spec de `clinical-api` (*helper* de L1D-164)
- **AND** el cliente de `rag-orchestrator` registra cero llamadas

Regresión [RBAC `ai_analysis:create` → 403] activa desde S2 (US-045), que reemplaza la comprobación de rol y conserva este escenario. Regresión [RN-15 opt-out → 403] activa desde S6 (US-148). Regresión [RN-17 paciente egresado → 422] Post-MVP (US-198). Regresión [409 de catálogo] activa desde S2 (US-041).

### Requirement: La sesión del doctor nunca llega a rag-orchestrator
El valor del token de `oncolens_session` MUST NOT salir de `clinical-api`: los requests hacia `rag-orchestrator` SHALL llevar solo `Authorization: Bearer <jwt de servicio>` (capacidad `service-auth`, L1D-105) y ninguna cabecera `Cookie` ni cabecera copiada del request entrante; el token MUST NOT aparecer en cabeceras, cuerpos ni logs de `rag-orchestrator`. (Requisito heredado de L1D-197, usuario, 2026-10-20, opción b.)

#### Scenario: El análisis con la cookie real no filtra el token hacia Backend 2 [US-211 AC-5] [FR-01] [OL-03]
- **GIVEN** la cookie `oncolens_session` obtenida con el login de `doc1@test.local` y `rag-orchestrator` simulado que captura el request
- **WHEN** se solicita un análisis sobre el paciente semilla (a) con esa cookie
- **THEN** el request capturado hacia `rag-orchestrator` lleva `Authorization: Bearer <jwt>` y no lleva cabecera `Cookie`
- **AND** el valor del token no aparece en ninguna cabecera ni en el cuerpo del request capturado

#### Scenario: Los logs de rag-orchestrator no contienen la cookie de sesión [US-211 AC-5] [OL-03]
- **GIVEN** `rag-orchestrator` bajo `TestClient` con registro de logs capturado y un `/rag/query` con un `Authorization: Bearer` de servicio válido y una cabecera `Cookie: oncolens_session=<valor sintético>`
- **WHEN** se atiende la petición
- **THEN** ningún registro capturado contiene el valor de la cookie ni el nombre `oncolens_session`

Nota: el E2E de los logs de `rag-orchestrator` con el navegador contra Compose queda fuera de este change, en la deuda D-3 (decisión 60 del plan).

### Requirement: El gateway no registra la pregunta ni el contexto en los logs
Los logs que emite `clinical-api` al atender `POST /platform/evidence-analyses` MUST contener solo `traceId`, el UUID del paciente y códigos de resultado, y SHALL no contener la `query`, el `clinicalContext` ni identidad del paciente.

#### Scenario: Con PII sintética sembrada, los logs del gateway no la contienen [US-052 AC-1] [RN-10] (asumido: aplicación de la regla de logs de CLAUDE.md al gateway)
- **GIVEN** FX-T4a-a con PII sintética en la identidad y una pregunta válida
- **WHEN** se ejecuta el análisis con `rag-orchestrator` simulado
- **THEN** las líneas de log capturadas no contienen la `query`, el texto de ningún ítem del contexto ni los identificadores de FX-T4a-a
- **AND** contienen el `traceId` de la petición

### Requirement: El traceId lo genera siempre clinical-api
`clinical-api` MUST generar el `traceId` de cada petición (patrón `^req_[A-Za-z0-9]{8,32}$`) y usar solo ese valor hacia `rag-orchestrator`, en la respuesta y en `ai_analysis_record`. El `X-Trace-Id` entrante MUST NOT copiarse a ninguno de ellos; SHALL ir solo al log como `traceIdEntrante`, y solo si cumple el patrón (RN-10).

#### Scenario: Un X-Trace-Id con PII sembrada no llega a la IA, a la respuesta ni al log [US-052 AC-1] [RN-10] (asumido: corrección del Gate 1, 2026-10-14)
- **GIVEN** `doc1@test.local` con sesión válida, el paciente semilla (b), el generador de `traceId` inyectado con `req_TestGen0001` y `rag-orchestrator` simulado que captura el request
- **WHEN** envía `POST /platform/evidence-analyses` con la pregunta del AC-1 y la cabecera `X-Trace-Id: Lucía Rondón 1234567`
- **THEN** el request capturado lleva `traceId = req_TestGen0001` y ninguna parte del body ni de sus cabeceras contiene `Lucía`, `Rondón` ni `1234567`
- **AND** el `traceId` de la respuesta es `req_TestGen0001`
- **AND** las líneas de log capturadas no contienen `Lucía`, `Rondón` ni `1234567` ni una clave `traceIdEntrante`

#### Scenario: Un X-Trace-Id con el patrón válido solo aparece en el log [US-052 AC-1] (asumido: corrección del Gate 1, 2026-10-14)
- **GIVEN** el mismo contexto y la cabecera `X-Trace-Id: req_Entrante01`
- **WHEN** se envía la petición
- **THEN** el request capturado y la respuesta llevan `traceId = req_TestGen0001` y no contienen `req_Entrante01`
- **AND** el log de la petición contiene `traceIdEntrante = req_Entrante01` junto al `traceId` generado

Regresión [`ai_analysis_record.trace_id` = traceId generado] activa desde S1 con el change de L1D-104.

### Requirement: Análisis persistido antes de responder
Ante una respuesta válida de `rag-orchestrator`, `clinical-api` MUST persistir el `AIAnalysisRecord` en `clinical.ai_analysis_record` dentro de una transacción y SHALL enviar la respuesta `200` solo después del `COMMIT` (RN-06, readme §2.1). La respuesta MUST construirse desde el registro persistido, con `id`, `traceId`, `evidenceOptions`, `analysisBasis` y `topRelevanceScore` idénticos a lo guardado.

#### Scenario: El análisis con evidencia se responde con el mismo id y contenido que quedó registrado [US-053 AC-1] [AC-T1.4] [RN-06] [IA-09] [OL-03]
- **GIVEN** `doc1@test.local` con sesión válida, el paciente semilla (a) y `rag-orchestrator` simulado con MSW respondiendo `LLM-OK` (FX-06a-b) para `Q-HER2`, construido desde `contracts/examples/rag-query-con-evidencia.json`
- **WHEN** envía `POST /platform/evidence-analyses` con `Q-HER2`
- **THEN** la respuesta es `200` con un `EvidenceAnalysis` válido contra el spec de `clinical-api`
- **AND** su `id` existe en `clinical.ai_analysis_record` con el mismo `trace_id`, `analysis_type = analisis_evidencia`, `requested_by` igual al usuario de la sesión, `clinical_context_snapshot`, `context_fingerprint`, `corpus_release`, `catalog_version`, los cuatro modelos, `prompt_version`, `retrieval_params` y `top_relevance_score = 0.87`
- **AND** `evidenceOptions` de la respuesta es igual a `evidence_options` persistido y `analysisBasis` es igual a `analysis_basis` persistido

### Requirement: Contenido trazable del registro del análisis
El `AIAnalysisRecord` MUST incluir `trace_id`, `analysis_type = analisis_evidencia`, `requested_by`, `query_text` y `clinical_context_snapshot` desidentificados, `context_fingerprint`, `sources_selected`, `filters_applied`, `corpus_release`, `catalog_version`, los modelos y `llm_provider`, `prompt_version`, `retrieval_params`, `status` y `top_relevance_score` (IA-09, AC-T1.4); el `disclaimer` de la respuesta SHALL salir de la clave de configuración `AI_DISCLAIMER_TEXT`.

#### Scenario: Los filtros recibidos quedan persistidos con el análisis [US-052 AC-5] [AC-05.1] [OL-03]
- **GIVEN** el request del AC-1 de US-052 con `filtersApplied.ultimosSeisMeses = true` y `rag-orchestrator` simulado respondiendo con evidencia
- **WHEN** se envía
- **THEN** responde `200` y el `ai_analysis_record` de ese `id` tiene `filters_applied.ultimosSeisMeses = true`

#### Scenario: El trace_id persistido es el generado por clinical-api y no el X-Trace-Id entrante [US-053 AC-1] [RN-10] (asumido: corrección del Gate 1, 2026-10-14)
- **GIVEN** el análisis del AC-1 enviado con la cabecera `X-Trace-Id: req_Entrante01` y el generador de `traceId` inyectado con `req_TestGen0001`
- **WHEN** se lee el `ai_analysis_record` del `id` respondido
- **THEN** `trace_id = req_TestGen0001` y ninguna columna del registro contiene `req_Entrante01`

#### Scenario: La Base del análisis del S1 declara los datos usados y que los faltantes críticos aún no se calculan [US-053 AC-1] [FR-27] (asumido: corrección del Gate 1, 2026-10-14)
- **GIVEN** el análisis del AC-1, y en otro caso el de `Q-SIN` sin evidencia, sobre el paciente semilla (a)
- **WHEN** se completa el análisis
- **THEN** en ambos `analysisBasis.patientDataUsed` tiene una entrada por dato del contexto enviado, `analysisBasis.missingCriticalData = []` y `analysisBasis.assumptions` contiene `{ text: "Los faltantes críticos aún no se calculan en esta versión", origin: regla_catalogo }`, igual en la respuesta y en `analysis_basis` persistido
- **AND** el texto del supuesto es un literal del builder, no una clave de configuración

#### Scenario: El snapshot persistido no lleva el seudónimo de la consulta [US-053 AC-1] [RN-11] (asumido: nota de data-model.md §4.3 "sin pseudoPatientId")
- **GIVEN** el análisis del AC-1
- **WHEN** se lee `clinical_context_snapshot` del registro persistido
- **THEN** no contiene la clave `pseudoPatientId` ni el valor enviado como seudónimo en el request capturado

### Requirement: Un fallo de persistencia nunca muestra el análisis
Si la escritura del `AIAnalysisRecord` falla, `clinical-api` MUST responder `500` con el cuerpo genérico `ErrorInterno` (`{ error = ERROR_INTERNO, message, traceId }`), declarado en el spec de `clinical-api`, SHALL NOT incluir `evidenceOptions`, texto de opciones ni ningún otro campo del análisis, y MUST registrar en el log el `traceId` sin la pregunta, el contexto, la respuesta de `rag-orchestrator` ni el mensaje del error de la base de datos (RN-06, NFR-08, PRD §10).

#### Scenario: Con la escritura del registro fallando, la respuesta es 500 genérico sin opciones [US-053 AC-2] [AC-10.4] [RN-06] [NFR-08]
- **GIVEN** `rag-orchestrator` simulado respondiendo `LLM-OK` para `Q-HER2` y un fallo provocado en la escritura de `clinical.ai_analysis_record` de la base de datos de test (*trigger* temporal `BEFORE INSERT` que lanza excepción)
- **WHEN** `doc1@test.local` envía `Q-HER2` sobre el paciente semilla (a)
- **THEN** la respuesta es `500` con `error = ERROR_INTERNO`, `message` y `traceId`, válida contra el spec de `clinical-api`
- **AND** el cuerpo no contiene `evidenceOptions` ni el texto "Quimioterapia combinada con terapia anti-HER2"
- **AND** no existe fila en `clinical.ai_analysis_record` con ese `trace_id`
- **AND** el log capturado contiene ese `traceId` y no contiene la pregunta ni el texto de la opción

### Requirement: Deadline hacia rag-orchestrator sin registro persistido
`clinical-api` MUST enviar a `rag-orchestrator` la cabecera `X-Request-Deadline` (parámetro tipado de la operación del cliente generado de L1D-105, `[S1 resp. 13]`) con `ahora + RAG_TIMEOUT_MS` (clave de configuración, RN-22; reloj inyectado) y MUST abortar la llamada al vencer `RAG_TIMEOUT_MS`; entonces SHALL responder `504` con `ErrorDeadlineVencido` y no persistir ningún `AIAnalysisRecord` (FR-09).

#### Scenario: rag-orchestrator no responde a tiempo y la respuesta es 504 sin registro [US-053 AC-3] [FR-09] [OL-03]
- **GIVEN** `RAG_TIMEOUT_MS` de test, el reloj congelado y `rag-orchestrator` simulado que no responde dentro de ese plazo
- **WHEN** `doc1@test.local` envía `Q-HER2` sobre el paciente semilla (a) y el temporizador supera `RAG_TIMEOUT_MS`
- **THEN** la respuesta es `504` con `error = DEADLINE_VENCIDO` y `traceId`, válida contra el spec de `clinical-api`
- **AND** el request capturado llevó `X-Request-Deadline` igual al instante congelado más `RAG_TIMEOUT_MS`
- **AND** no existe fila en `clinical.ai_analysis_record` con ese `trace_id`

#### Scenario: Un 504 de rag-orchestrator por deadline vencido se responde como 504 sin registro [US-053 AC-3] [S1 resp. 12] (asumido: el 504 de rag es el deadline propagado que venció)
- **GIVEN** `rag-orchestrator` simulado respondiendo `504` desde `contracts/examples/rag-deadline-vencido.json`
- **WHEN** se envía `Q-HER2`
- **THEN** la respuesta es `504` con `error = DEADLINE_VENCIDO` y el `traceId` generado, sin el `message` de rag
- **AND** no se persiste ningún registro

### Requirement: Una sola tabla de mapeo de fallos de rag-orchestrator
`clinical-api` MUST mapear cada fallo de `POST /rag/query` en una única función (`mapearFalloRag()`, `[S1 resp. 12]`): `503 LOCAL_LLM_UNAVAILABLE`, `503 LLM_OUTPUT_INVALID` (desde el S4, Q1) y `409 CATALOG_VERSION_MISMATCH` conservan su código; `503 RETRIEVAL_UNAVAILABLE`, `503 NLI_UNAVAILABLE`, otros `4xx`/`5xx`, errores de red y respuestas que no validan → `502 ERROR_SERVICIO_IA`. Ninguna fila SHALL persistir un `AIAnalysisRecord` ni reenviar cuerpo, `message` o cabeceras de rag.

#### Scenario: El LLM local no disponible se responde como 503 sin registro [US-053 AC-4] [S1 resp. 12]
- **GIVEN** `rag-orchestrator` simulado respondiendo `503` desde `contracts/examples/rag-llm-local-no-disponible.json`
- **WHEN** `doc1@test.local` envía `Q-HER2` sobre el paciente semilla (a)
- **THEN** la respuesta es `503` con `error = LOCAL_LLM_UNAVAILABLE`, el `message` fijo de `error-llm-local-no-disponible.json` y el `traceId` generado, válida contra el spec de `clinical-api` (*helper* de L1D-164)
- **AND** no existe fila en `clinical.ai_analysis_record` con ese `trace_id`

#### Scenario: Una salida inválida del LLM se responde como 503 LLM_OUTPUT_INVALID sin registro [US-245 AC-1] [RN-06] (decisión Q1, 2026-10-30)
- **GIVEN** `rag-orchestrator` simulado respondiendo `503` desde `contracts/examples/rag-salida-llm-invalida.json`
- **WHEN** `doc1@test.local` envía `Q-HER2` sobre el paciente semilla (a)
- **THEN** la respuesta es `503` con `error = LLM_OUTPUT_INVALID`, el `message` fijo de `error-salida-llm-invalida.json` y el `traceId` generado, válida contra el spec de `clinical-api`, y nunca `LOCAL_LLM_UNAVAILABLE`
- **AND** no existe fila en `clinical.ai_analysis_record` con ese `trace_id`

#### Scenario: La recuperación no disponible se responde como 502 sin registro [US-053 AC-4] [S1 resp. 12]
- **GIVEN** `rag-orchestrator` simulado respondiendo `503` con `error = RETRIEVAL_UNAVAILABLE` (ejemplo de L1D-106) y un `message` con texto interno sintético
- **WHEN** se envía `Q-HER2`
- **THEN** la respuesta es `502` con `error = ERROR_SERVICIO_IA` y el `message` fijo de `error-servicio-ia.json`, sin el texto interno
- **AND** no se persiste ningún registro

#### Scenario: El NLI no disponible se responde como 502 sin registro [US-053 AC-4] [S1 resp. 12]
- **GIVEN** `rag-orchestrator` simulado respondiendo `503` con `error = NLI_UNAVAILABLE` (ejemplo de L1D-180)
- **WHEN** se envía `Q-HER2`
- **THEN** la respuesta es `502` con `error = ERROR_SERVICIO_IA` y no se persiste ningún registro

#### Scenario: Un 422 de rag-orchestrator se responde como 502 sin eco [US-053 AC-4] [S1 resp. 12]
- **GIVEN** `rag-orchestrator` simulado respondiendo `422` desde `contracts/examples/rag-validacion-422.json`
- **WHEN** se envía `Q-HER2`
- **THEN** la respuesta es `502` con `error = ERROR_SERVICIO_IA` y no contiene el `message` ni los detalles del `422`
- **AND** no se persiste ningún registro

#### Scenario: Un 401 o un 500 de rag-orchestrator se responde como 502 sin detalles internos [US-053 AC-4] [OL-03]
- **GIVEN** `rag-orchestrator` simulado respondiendo `401` (desde `rag-token-servicio-invalido.json`) en un caso y `500` con un cuerpo con texto interno sintético en otro (desde el S2, el `409` de `CATALOG_VERSION_MISMATCH` tiene su propio escenario)
- **WHEN** `doc1@test.local` envía `Q-HER2` sobre el paciente semilla (a)
- **THEN** ambas respuestas son `502` con `error = ERROR_SERVICIO_IA`, el `message` fijo de `error-servicio-ia.json` y `traceId`, válidas contra el spec de `clinical-api`
- **AND** ninguna contiene el texto del cuerpo ni del `message` de `rag-orchestrator`
- **AND** no existe fila en `clinical.ai_analysis_record` con esos `trace_id`

#### Scenario: Un 503 con un código desconocido se responde como 502 [US-053 AC-4] [S1 resp. 12] (asumido: "cualquier otro 5xx")
- **GIVEN** `rag-orchestrator` simulado respondiendo `503` con un `error` que no es ninguno de los declarados
- **WHEN** se envía `Q-HER2`
- **THEN** la respuesta es `502` con `error = ERROR_SERVICIO_IA` y no se persiste ningún registro

#### Scenario: Una respuesta interna que no cumple el contrato se responde como 502 sin registro [US-053 AC-4] (asumido: defensa en el borde del Contexto técnico mapeada a 502)
- **GIVEN** `rag-orchestrator` simulado respondiendo `200` con `status = sin_evidencia` y `topRelevanceScore = 0.0`, y en otro caso con un `200` sin el bloque `meta`
- **WHEN** se envía `Q-HER2`
- **THEN** ambas respuestas son `502` con `error = ERROR_SERVICIO_IA` y no se persiste ningún registro

#### Scenario: Una conexión rechazada hacia rag-orchestrator se responde como 502 sin registro [US-053 AC-4] (asumido: error de red tratado como error entre servicios)
- **GIVEN** `rag-orchestrator` simulado que corta la conexión (error de red)
- **WHEN** se envía `Q-HER2`
- **THEN** la respuesta es `502` con `error = ERROR_SERVICIO_IA` y no se persiste ningún registro

#### Scenario: Un 409 de catálogo de rag-orchestrator se responde como 409 sin registro [US-041 AC-2] [NFR-14] [OL-02] [ADR-38]
- **GIVEN** `rag-orchestrator` simulado respondiendo `409` desde `contracts/examples/rag-catalog-version-mismatch.json`
- **WHEN** `doc1@test.local` envía `Q-HER2` sobre el paciente semilla (a)
- **THEN** la respuesta es `409` con `error = CATALOG_VERSION_MISMATCH`, el `message` fijo de `error-catalog-version-mismatch.json` y `traceId`, válida contra el spec de `clinical-api`, sin el cuerpo de `rag-orchestrator`
- **AND** no existe fila en `clinical.ai_analysis_record` con ese `trace_id`

#### Scenario: Un 409 o un 429 de rag-orchestrator se responde en el S1 como 502 sin registro [US-053 AC-4] [S1 resp. 12] (asumido: corrección del Gate 1, 2ª vuelta, 2026-10-14; sus códigos propios llegan con US-041 y US-056)
- **GIVEN** `rag-orchestrator` simulado respondiendo `429` con `Retry-After: 30` en un caso y `409` con un `error` distinto de `CATALOG_VERSION_MISMATCH` en otro (desde el S2, el `409` de `CATALOG_VERSION_MISMATCH` tiene su propio escenario)
- **WHEN** `doc1@test.local` envía `Q-HER2` sobre el paciente semilla (a)
- **THEN** ambas respuestas son `502` con `error = ERROR_SERVICIO_IA`, el `message` fijo de `error-servicio-ia.json` y `traceId`, válidas contra el spec de `clinical-api`, sin `Retry-After` ni el cuerpo de `rag-orchestrator`
- **AND** no existe fila en `clinical.ai_analysis_record` con esos `trace_id`

Regresión [RN-30 429 con `Retry-After`] activa desde S4 (US-056).

### Requirement: Sin evidencia persistido con puntaje nulo
Cuando `rag-orchestrator` responde `status = sin_evidencia`, `clinical-api` MUST persistir el `AIAnalysisRecord` con `status = sin_evidencia`, `evidence_options = []` y `top_relevance_score IS NULL` (nunca `0.0`), y SHALL responder `200` con `topRelevanceScore = null`, `evidenceOptions = []` y `analysisBasis` presente (RN-02, readme §6.1 #1).

#### Scenario: Una pregunta sin evidencia responde 200 con puntaje nulo y queda registrada con NULL [US-053 AC-5] [RN-02] [readme §6.1 #1]
- **GIVEN** `rag-orchestrator` simulado respondiendo `status = sin_evidencia` para `Q-SIN`, construido desde `contracts/examples/rag-query-sin-evidencia.json`
- **WHEN** `doc1@test.local` envía `Q-SIN` sobre el paciente semilla (a)
- **THEN** la respuesta es `200` con `status = sin_evidencia`, `topRelevanceScore = null`, `evidenceOptions = []` y `analysisBasis` presente, válida contra el spec de `clinical-api`
- **AND** el registro persistido con ese `id` tiene `top_relevance_score IS NULL` y `analysis_basis` igual al `analysisBasis` respondido

### Requirement: El análisis no escribe eventos clínicos
Persistir un análisis de evidencia MUST NOT insertar filas en `clinical.clinical_event`: el análisis aparece en el timeline como evento derivado de `AIAnalysisRecord` (ADR-32, AC-11.4).

#### Scenario: El número de eventos clínicos del paciente no cambia tras un análisis [US-053 AC-6] [AC-11.4] [ADR-32]
- **GIVEN** el paciente semilla (a) y el recuento de sus filas en `clinical.clinical_event`
- **WHEN** se completa el análisis del AC-1 con respuesta `200`
- **THEN** el recuento de filas de `clinical.clinical_event` del paciente es el mismo que antes
- **AND** existe el `ai_analysis_record` del análisis

Regresión [AC-11.4 timeline con el evento derivado] activa desde S3 (US-088).

### Requirement: El 422 TIPO_CANCER_NO_REGISTRADO de rag-orchestrator conserva su código
`mapearFalloRag()` MUST traducir un `422` de `rag-orchestrator` con `error = TIPO_CANCER_NO_REGISTRADO` a `422 TIPO_CANCER_NO_REGISTRADO` de `clinical-api` con su mensaje fijo, no a `502`; SHALL NOT persistir un `AIAnalysisRecord` ni hacer eco del `message` de rag (`[S1 resp. 35]`).

#### Scenario: Un 422 TIPO_CANCER_NO_REGISTRADO de rag-orchestrator se responde como 422 con el mismo código y sin eco [US-053 AC-4] [S1 resp. 35]
- **GIVEN** `rag-orchestrator` simulado respondiendo `422` desde `contracts/examples/rag-tipo-cancer-no-registrado.json` (L1D-106) con un `message` con texto interno sintético
- **WHEN** se envía `Q-HER2`
- **THEN** la respuesta es `422` con `error = TIPO_CANCER_NO_REGISTRADO`, el `message` fijo de `error-tipo-cancer-no-registrado.json` y el `traceId` generado, válida contra el spec de `clinical-api` (*helper* de L1D-164), sin el texto interno de rag
- **AND** no se persiste ningún registro

### Requirement: Aplicabilidad persistida igual a la respondida
`clinical-api` MUST persistir en `clinical.ai_analysis_record.applicability` la `applicability` recibida de `rag-orchestrator` sin transformarla, con sus causas, avisos, conteos y `populationNotComparable`, y la respuesta `200` SHALL construirse desde ese valor persistido (RN-06, AC-T1.4).

#### Scenario: La aplicabilidad de A-M1 con doc-a1 se lee igual del registro [US-124 AC-7]
- **GIVEN** `doc1@test.local` con sesión válida, A-M1 sembrado por el test y `rag-orchestrator` simulado con MSW respondiendo una `applicability` de `doc-a1` con `estado_menopausico` en `desconocido` (`falta_en_paciente`, `patientDataWarning = faltante`), `ecog` con `patientDataWarning = sin_verificar` y el `summary` del ejemplo, construida desde `contracts/examples/con-evidencia-s3-aplicabilidad.json` y `rag-query-aplicabilidad-a-m1.json`
- **WHEN** envía `POST /platform/evidence-analyses` y después se lee el `AIAnalysisRecord` del `id` respondido
- **THEN** `applicability` del registro es igual, campo a campo, a la `applicability` de la respuesta [RN-06] [AC-T1.4]
- **AND** la respuesta valida contra el spec de `clinical-api`

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
- **THEN** el biomarcador `90 %` identificado por su `dataRef` (no por su nombre) lleva `provenance.conflict = true` y `provenance.reviewStatus = requiere_revision`

Regresión [RN-07] activa desde S5 (US-099 AC-8): conflicto detectado por la reconciliación al persistir una extracción, en lugar de sembrado.

### Requirement: Los datos rechazados o reemplazados nunca entran al contexto ni al registro
Un dato con `review_status` `rechazado` o `reemplazado` MUST NOT aparecer en el `clinicalContext` enviado a `rag-orchestrator` ni en el `clinical_context_snapshot` del `AIAnalysisRecord` persistido (RN-07, AC-02.6). La exclusión SHALL aplicarse con un único predicado de RN-07 compartido con la ficha del paciente y con el checklist, derivado de una sola constante de estados descartados.

#### Scenario: Los datos de progesterona rechazado y reemplazado no viajan ni se persisten [US-065 AC-3] [AC-02.6] [RN-07]
- **GIVEN** FX-T1a-a, con un receptor de progesterona `negativo` `rechazado` y otro `positivo` `reemplazado`
- **WHEN** un doctor solicita un análisis de evidencia, se captura el `clinicalContext` y se lee el `AIAnalysisRecord` persistido
- **THEN** ningún biomarcador identificado por el `dataRef` de los dos registros de progesterona (`rechazado` y `reemplazado`) aparece en el `clinicalContext` capturado
- **AND** ninguno de esos dos registros aparece en `clinical_context_snapshot`
- **AND** ningún valor `rechazado` ni `reemplazado` aparece en ninguna `provenance.reviewStatus` del payload ni del snapshot

#### Scenario: El predicado SQL y el filtro de completitud derivan de la misma constante de estados descartados [RN-07] (unitario)
- **GIVEN** la constante `ESTADOS_DESCARTADOS` de `modules/compartido/estados-de-revision.ts`
- **WHEN** se construye `sqlDatoVigente('review_status')` y se aplica `registrosVigentes()` a un registro por estado de revisión
- **THEN** la cadena SQL excluye exactamente los estados de `ESTADOS_DESCARTADOS`
- **AND** `registrosVigentes()` descarta exactamente esos mismos estados

### Requirement: Los faltantes críticos viajan en todo análisis como claves del catálogo
En todo análisis de un tipo habilitado, `clinical-api` MUST calcular el checklist (US-002) en el servidor, en el mismo `POST` y antes de llamar a `rag-orchestrator`, y SHALL enviar en `clinicalContext.missingCriticalData` las claves `faltante` en el orden del catálogo, con o sin `continueWithWarning` (FR-09, FR-23, RN-26). Cada elemento MUST ser una clave del catálogo, nunca texto del paciente (RN-11).

#### Scenario: Continuar con aviso envía los seis faltantes de F-M2 en el orden del catálogo [US-006 AC-1] [AC-04.3] [ADR-38]
- **GIVEN** `doc1@test.local` con sesión válida, el catálogo `test-1.0.0` (FX-04-a, `apps/clinical-api/tests/fixtures/completeness/catalogos/test-1.0.0`, 12 ítems) en `CLINICAL_CATALOG_PATH`, el paciente F-M2 (FX-04-b; sus seis faltantes se derivan de FX-04-a) y `rag-orchestrator` simulado con MSW que captura el request
- **WHEN** envía `POST /platform/evidence-analyses` con una pregunta válida y `continueWithWarning = true`
- **THEN** el request capturado lleva `clinicalContext.missingCriticalData = ["grado", "rp", "her2_ish", "ki67", "estado_menopausico", "brca_germinal"]` y `catalogVersion = "test-1.0.0"`
- **AND** el request valida contra `RagQueryInternalRequest`

#### Scenario: Sin continueWithWarning el análisis no se bloquea y lleva los mismos faltantes [US-006 AC-3] [RN-26] [AC-04.2] [FR-09]
- **GIVEN** el mismo contexto del escenario anterior
- **WHEN** envía el análisis sin el campo `continueWithWarning`
- **THEN** la respuesta es `200`, válida contra el spec de `clinical-api`
- **AND** el request capturado lleva la misma `missingCriticalData` de seis claves

#### Scenario: Un dato registrado justo antes del POST ya no figura como faltante [US-006 AC-4] [AC-04.4] [readme §2.1] (asumido: sin `GET …/completeness` hasta US-003, S4; el checklist previo se calcula con `CompletenessService`)
- **GIVEN** F-M2 con su checklist calculado con seis faltantes y, después, un `ClinicalAttribute` `estado_menopausico` `verificado` registrado en la base de test
- **WHEN** se procesa el `POST /platform/evidence-analyses`
- **THEN** el request capturado lleva `missingCriticalData` con cinco claves y sin `estado_menopausico`

#### Scenario: Los faltantes son claves del catálogo y el payload no lleva la PII sembrada [US-006 AC-6] [RN-11] [AC-T4.3]
- **GIVEN** F-M2 con una `ClinicalNote` que contiene un nombre y un número de documento sintéticos generados en tiempo de test
- **WHEN** se captura el request interno del análisis
- **THEN** cada elemento de `missingCriticalData` es una clave del catálogo `test-1.0.0` y cumple `^[a-z0-9_]+$`
- **AND** ni el nombre ni el número de documento sembrados aparecen en `missingCriticalData` ni en ningún otro campo del payload

### Requirement: Faltantes y continuación con aviso persistidos con el análisis
El `AIAnalysisRecord` MUST persistir en `missing_critical_data` exactamente la lista enviada en `clinicalContext.missingCriticalData`, en `continued_with_warning` el valor de `continueWithWarning` de la petición (`false` si se omite) y en `catalog_version` la versión enviada, en la misma transacción que el resto del registro y antes de responder (RN-06, AC-T1.4), también cuando la respuesta es `sin_evidencia` (FR-27, RN-02).

#### Scenario: El registro guarda los seis faltantes, la continuación con aviso y la versión del catálogo [US-006 AC-2] [AC-T1.4] [FR-27] [readme §3.1]
- **GIVEN** el análisis de [US-006 AC-1] completado con `rag-orchestrator` simulado respondiendo con evidencia
- **WHEN** se lee el `AIAnalysisRecord` del `id` respondido
- **THEN** `missing_critical_data` tiene las mismas seis claves en el mismo orden, `continued_with_warning = true` y `catalog_version = "test-1.0.0"`

#### Scenario: Sin continueWithWarning el registro guarda false y los mismos faltantes [US-006 AC-3] [RN-26] [readme §4.1]
- **GIVEN** el análisis de F-M2 enviado sin `continueWithWarning`
- **WHEN** se lee su `AIAnalysisRecord`
- **THEN** `continued_with_warning = false` y `missing_critical_data` tiene las mismas seis claves

#### Scenario: Un análisis sin evidencia también persiste los faltantes [US-006 AC-5] [FR-27] [RN-02]
- **GIVEN** F-M2 y `rag-orchestrator` simulado respondiendo `status = "sin_evidencia"` desde `contracts/examples/rag-query-sin-evidencia.json`
- **WHEN** se completa el análisis
- **THEN** la respuesta es `200` con `status = sin_evidencia` y el `AIAnalysisRecord` persiste las seis claves en `missing_critical_data`

#### Scenario: Si rag-orchestrator no responde a tiempo no queda ningún registro con faltantes [US-006 AC-7] [OL-03] [RN-06]
- **GIVEN** F-M2, `RAG_TIMEOUT_MS` de test, el reloj congelado y `rag-orchestrator` simulado que no responde dentro del plazo
- **WHEN** se envía el análisis y el temporizador supera `RAG_TIMEOUT_MS`
- **THEN** la respuesta es `504` con `error = DEADLINE_VENCIDO`, válida contra el spec de `clinical-api`
- **AND** no existe ningún `AIAnalysisRecord` nuevo para ese paciente

### Requirement: Checklist no disponible en el servidor falla cerrado
Si el cálculo del checklist falla durante el análisis, `clinical-api` MUST responder `500` con `ErrorInterno` (`{ error = ERROR_INTERNO, message, traceId }`), SHALL NOT invocar a `rag-orchestrator` ni persistir ningún `AIAnalysisRecord`, y MUST registrar en el log solo el `traceId`, el UUID del paciente y `resultado = checklist_no_disponible`, sin el mensaje del error original (`[S3 resp. 5]`: no se analiza sin faltantes, para que el análisis sea reproducible, AC-T1.4).

#### Scenario: Con el checklist lanzando un error la respuesta es 500 sin llamar a la IA ni persistir [US-006 AC-8] [AC-T1.4] (asumido: hallazgo M-08 del piloto; decidido en [S3 resp. 5])
- **GIVEN** F-M2, un `ChecklistDeFaltantes` inyectado por la factory que lanza un error y `rag-orchestrator` simulado que cuenta llamadas
- **WHEN** `doc1@test.local` envía `POST /platform/evidence-analyses`
- **THEN** la respuesta es `500` con `error = ERROR_INTERNO`, `message` y `traceId`, válida contra el spec de `clinical-api`
- **AND** el cliente de `rag-orchestrator` registra cero llamadas
- **AND** no existe ningún `AIAnalysisRecord` nuevo para ese paciente

### Requirement: Las opciones se persisten y se responden en el orden recibido
`clinical-api` MUST persistir `evidence_options` del `AIAnalysisRecord` con el mismo orden y contenido que `evidenceOptions` recibido de `rag-orchestrator`, sin reordenarlo ni filtrarlo, y la respuesta `200` SHALL construirse desde el valor persistido (RN-06, AC-T1.4). `ANALYSIS_MAX_OPTIONS` (RN-22) MUST valer 3 por defecto desde el S4 y el arranque SHALL rechazar valores fuera de 1–3 (asumido, tope de FR-09).

#### Scenario: evidence_options persistido igual y en el mismo orden que la respuesta [US-134 AC-8] [RN-06] [AC-T1.4]
- **GIVEN** el análisis del AC-1 de US-134 con `rag-orchestrator` simulado respondiendo [O-B, O-D, O-C]
- **WHEN** se lee `evidence_options` del `AIAnalysisRecord`
- **THEN** el arreglo es igual en profundidad y en orden a `evidenceOptions` de la respuesta
- **AND** `clinical-api` no aplica ningún `sort`, `reverse` ni filtro sobre las opciones

#### Scenario: Con maxOptions 3 la respuesta trae las opciones en el orden recibido [US-134 AC-1] [AC-10.1] [RN-28] [HU-10] [FR-09]
- **GIVEN** `ANALYSIS_MAX_OPTIONS = 3` y `rag-orchestrator` simulado con [O-B, O-D, O-C] y `maxOptions = 3` en el request interno capturado
- **WHEN** `doc1@test.local` envía `Q-HER2` sobre A-M1
- **THEN** responde `200` con `evidenceOptions` = [O-B, O-D, O-C] y `analysisBasis.maxOptions = 3`

#### Scenario: Una opción no comparable se propaga visible y última [US-134 AC-4] [RN-28] [RN-26] [AC-08.8]
- **GIVEN** `rag-orchestrator` simulado con [O-B, O-C, O-A] (O-A con `populationNotComparable = true` y `poblacion_no_comparable`)
- **WHEN** se envía la consulta
- **THEN** la respuesta y el registro traen [O-B, O-C, O-A] con el aviso de O-A intacto

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

### Requirement: Un tipo de cáncer no habilitado no se analiza
Si el tipo del `Diagnosis` activo del paciente no está en `ENABLED_CANCER_TYPES`, `POST /platform/evidence-analyses` MUST responder `200` con `status = tipo_no_habilitado`, `evidenceOptions = []`, `discardedOptions = []`, `topRelevanceScore = null` y la Base del análisis, sin construir el contexto clínico ni llamar a `rag-orchestrator`, y MUST persistir antes de responder un `AIAnalysisRecord` con ese estado (RN-06). La UI SHALL mostrar el aviso informativo de alcance, no un error.

#### Scenario: Con solo mama habilitada el análisis del paciente (b) responde tipo_no_habilitado sin llamar a la IA [US-043 AC-2] [RN-20] [FR-09] [AC-06.1]
- **GIVEN** `ENABLED_CANCER_TYPES=mama`, `doc1@test.local` autenticado, el paciente semilla (b) (próstata) y `rag-orchestrator` simulado con contador de llamadas
- **WHEN** solicita un análisis
- **THEN** la respuesta es `200`, válida contra `EvidenceAnalysis`, con `status = "tipo_no_habilitado"`, `evidenceOptions = []` y `topRelevanceScore = null`
- **AND** el cliente de `rag-orchestrator` registra cero llamadas
- **AND** existe un `AIAnalysisRecord` con ese `trace_id`, `status = tipo_no_habilitado` y `top_relevance_score` nulo

#### Scenario: La Base de tipo_no_habilitado dice que no se consultó el corpus [US-043 AC-2] [FR-27] [S2 resp. 10]
- **GIVEN** el contexto del escenario anterior, `CORPUS_EXCLUDED_SOURCES=NCCN,ESMO`, `CORPUS_CUTOFF_DATE=2026-09-30` y un request con `guias` y `publicaciones` seleccionadas
- **WHEN** solicita un análisis
- **THEN** `analysisBasis.patientDataUsed = []`, `sourcesConsulted.selected = ["guias","publicaciones"]`, `filters` igual al request, `retrieved = 0` y `aboveThreshold = 0`
- **AND** `sourcesNotIncluded = ["NCCN","ESMO"]` y `corpusCutoffDate = 2026-09-30`, la respuesta valida contra `EvidenceAnalysis` y el `analysis_basis` persistido es igual

#### Scenario: El panel muestra el aviso de alcance ante tipo_no_habilitado [US-043 AC-2] [RN-26] [S2 resp. 6]
- **GIVEN** el panel de análisis con MSW respondiendo desde `contracts/examples/tipo-no-habilitado.json`
- **WHEN** se muestra el resultado
- **THEN** el panel muestra el aviso informativo "Tipo de cáncer fuera del alcance del piloto: sin análisis con IA" y la Base del análisis, sin ninguna opción y sin estilo de error

### Requirement: Pregunta de seguimiento anclada, validada y persistida antes de responder
`clinical-api` MUST atender `POST /platform/evidence-analyses/{analysisId}/follow-ups` enviando a `/rag/follow-up` el contexto anclado al análisis, recibir la respuesta completa, persistir el turno en `clinical.analysis_follow_up` **antes** de responder y devolver `201 FollowUpTurn` válido contra su spec (FR-31, RN-01, RN-04, RN-06). Un fallo al persistir SHALL responder `500` sin contenido generado.

#### Scenario: Primera pregunta de seguimiento sobre la opción 2 de un análisis con evidencia [US-218 AC-1] [RN-01] [RN-06] [RN-04]
- **GIVEN** `doc1@test.local` con sesión válida, un análisis `con_evidencia` del paciente semilla (b) con al menos dos opciones, y `rag-orchestrator` simulado (MSW desde `rag-follow-up-response.json`) que registra el cuerpo recibido
- **WHEN** envía `POST /platform/evidence-analyses/{id}/follow-ups` con una pregunta sobre la opción 2
- **THEN** responde `201` con un `FollowUpTurn` válido contra el spec de `clinical-api`, `turnNumber = 1` y cada afirmación de `answer` con ≥ 1 cita a un chunk de `citedSources` o un `patientDataRef` resuelto en `patientDataLinks`
- **AND** `rag-orchestrator` recibió exactamente una llamada y existe una fila en `analysis_follow_up` con el mismo `id`, `turn_number = 1`, `question_text` y `cited_sources` que la respuesta (el orden «persistir antes de responder» lo prueba el escenario de fallo de persistencia)
- **AND** los campos de cada cita son los de la respuesta de `rag-orchestrator`, copiados sin cambios

#### Scenario: Un fallo al persistir el turno nunca muestra la respuesta [US-218 AC-1] [RN-06]
- **GIVEN** el mismo contexto y la inserción en `analysis_follow_up` forzada a fallar (rol de test sin `INSERT` sobre la tabla)
- **WHEN** envía la pregunta
- **THEN** responde `500 ERROR_INTERNO` válido contra el spec, sin `answer` ni texto generado en el cuerpo

#### Scenario: Una respuesta sin evidencia también se persiste como turno [US-218 AC-3] [RN-02]
- **GIVEN** `rag-orchestrator` simulado con `rag-follow-up-sin-evidencia.json`
- **WHEN** envía la pregunta
- **THEN** responde `201` con `status = sin_evidencia`, `answer` y `citedSources` vacíos, válido contra el spec, y el turno queda persistido con ese estado

### Requirement: Marca de fuente nueva calculada por clinical-api
`clinical-api` MUST calcular `isNewSource` de cada cita del turno: `true` si su `chunkId` no está entre las citas persistidas del análisis de origen (opciones y síntesis), `false` si está. `rag-orchestrator` SHALL NOT conocer esa marca `[Pre-S1 resp. 19]`.

#### Scenario: Una fuente ya citada por el análisis y otra nueva [US-218 AC-1] [Pre-S1 resp. 19]
- **GIVEN** un análisis que citó `ch-a1-1` y una respuesta de seguimiento simulada que cita `ch-a1-1` y `ch-a5-1`
- **WHEN** se crea el turno
- **THEN** `citedSources` marca `ch-a1-1` con `isNewSource = false` y `ch-a5-1` con `isNewSource = true`, y así queda en `cited_sources` persistido

### Requirement: Contexto del seguimiento desde el snapshot del análisis, desidentificado y con seudónimo nuevo por turno
`clinical-api` MUST armar `RagFollowUpRequest` desde el `clinicalContextSnapshot` del análisis con un `pseudoPatientId` y un `traceId` nuevos por turno (generadores inyectados), la pregunta enmascarada y `analysisMemory` con el análisis de origen rotulado `citable = false`. El seudónimo MUST NOT persistirse (RN-10, RN-11); el `trace_id` propio del turno SHALL persistirse en `analysis_follow_up` (`[S5 resp. 12]`).

#### Scenario: Dos turnos llevan seudónimos y traceId distintos, se persiste el trace_id del turno y nunca el seudónimo [US-218 AC-8] [RN-11] [Pre-S1 resp. 23] [Pre-S1 resp. 29] [S5 resp. 12]
- **GIVEN** un análisis `con_evidencia` y `rag-orchestrator` simulado que registra los cuerpos y la cabecera `X-Trace-Id`
- **WHEN** se envían dos preguntas de seguimiento seguidas
- **THEN** los dos cuerpos tienen `clinicalContext.pseudoPatientId` distintos entre sí y distintos del usado por el análisis, y `traceId` distintos entre sí y del análisis
- **AND** ninguna columna de `analysis_follow_up` contiene ninguno de los dos `pseudoPatientId`, y el `trace_id` de cada fila es el de su propio turno (`data-model` §7; Decidido, usuario, 2026-11-03, [S5 resp. 12])

#### Scenario: La memoria del análisis viaja rotulada y no citable [US-218 AC-2] [RN-24]
- **GIVEN** el mismo contexto
- **WHEN** se envía una pregunta de seguimiento
- **THEN** el cuerpo trae exactamente un elemento en `analysisMemory` con `source = analisis_previo_ia`, `citable = false`, la pregunta del análisis enmascarada y los títulos de sus opciones, y `clinicalContext` sin `pseudoPatientId` del análisis ni UUID

### Requirement: Pregunta y evolución enmascaradas hacia la IA, en el turno y fuera de los logs
`clinical-api` MUST normalizar la pregunta con la regla única de US-250 y enmascararla con el desidentificador de ADR-40 antes de persistirla y enviarla, y enmascarar el texto de `analysisMemory` y de `outcomesSince`. `FollowUpTurn.question` y `question_text` SHALL ser la versión enmascarada. Ningún log MUST contener la pregunta (RN-11).

#### Scenario: PII sembrada en la pregunta y en la evolución no sale hacia la IA ni a los logs [US-218 AC-6] [RN-11] [Pre-S1 resp. 23]
- **GIVEN** un análisis `con_evidencia`, un evento clínico registrado después del análisis con un documento de identidad sintético en su descripción, y logs capturados
- **WHEN** envía una pregunta de seguimiento que contiene el nombre sintético del paciente y un teléfono
- **THEN** el cuerpo recibido por `rag-orchestrator` no contiene el nombre, el teléfono ni el documento en `question`, `analysisMemory[*].outcomesSince` ni en ningún otro campo
- **AND** `FollowUpTurn.question` y `question_text` persistido contienen la versión enmascarada
- **AND** ninguna línea de log contiene la pregunta, el nombre, el teléfono ni el documento

#### Scenario: La pregunta de seguimiento en NFD se normaliza igual que la del análisis [US-218 AC-1] [US-250 AC-1] [OUT-05]
- **GIVEN** el mismo contexto
- **WHEN** envía la pregunta de la Demo 4 en NFD con espacios repetidos en los extremos
- **THEN** la `question` que recibe `rag-orchestrator` y `question_text` están en NFC, sin espacios en los extremos ni repetidos, idénticos byte a byte a los de la misma pregunta enviada en NFC
- **AND** una pregunta formada solo por espacios responde `422 CUERPO_INVALIDO` sin llamar a `rag-orchestrator` ni persistir turno

### Requirement: Límite de preguntas de seguimiento por análisis en configuración
`clinical-api` MUST rechazar con `409 LIMITE_SEGUIMIENTO` (mensaje sin imperativos ni claves de configuración) toda pregunta sobre un análisis que ya tiene `ANALYSIS_FOLLOWUP_MAX` turnos, sin llamar a `rag-orchestrator`. El límite SHALL leerse de configuración (RN-22) y comprobarse también al insertar, bajo bloqueo, para que dos peticiones simultáneas no lo superen.

#### Scenario: La pregunta 11 de un análisis con 10 turnos se rechaza [US-218 AC-4] [RN-22]
- **GIVEN** `ANALYSIS_FOLLOWUP_MAX = 10` y un análisis con 10 turnos persistidos
- **WHEN** envía la pregunta 11
- **THEN** responde `409` con `error = LIMITE_SEGUIMIENTO`, el `message` de `error-limite-seguimiento.json` y `traceId`, válido contra el spec, y `rag-orchestrator` registra cero llamadas

#### Scenario: El límite sale de la configuración [US-218 AC-4] [RN-22]
- **GIVEN** `ANALYSIS_FOLLOWUP_MAX = 2` inyectado en la configuración de test y un análisis con 2 turnos
- **WHEN** envía la pregunta 3
- **THEN** responde `409 LIMITE_SEGUIMIENTO`

#### Scenario: Dos preguntas simultáneas sobre el último turno libre no superan el límite [US-218 AC-4] (Decidido, usuario, 2026-11-03, [S5 resp. 13])
- **GIVEN** `ANALYSIS_FOLLOWUP_MAX = 10` y un análisis con 9 turnos
- **WHEN** llegan dos preguntas a la vez
- **THEN** una responde `201` con `turnNumber = 10` y la otra `409 LIMITE_SEGUIMIENTO`, y la tabla tiene exactamente 10 turnos

### Requirement: Bordes del seguimiento sin invocar a la IA
`clinical-api` MUST responder sin llamar a `rag-orchestrator` ni persistir turno: `401` sin sesión, `403` sin `follow_ups:create`, `404` si el análisis no existe y `422 ANALISIS_SIN_EVIDENCIA` si el análisis es `sin_evidencia`; y ante un fallo de `rag-orchestrator` SHALL aplicar la tabla única de fallos sin consumir turno. Regresión [RN-15] activa desde S6 (DEC-22). Regresión [RN-17 paciente egresado → 422] Post-MVP (US-198).

#### Scenario: El administrador no puede preguntar ni leer seguimientos [US-218 AC-6] (403 por RBAC)
- **GIVEN** `admin@test.local` con sesión válida y un análisis `con_evidencia`
- **WHEN** envía `POST …/follow-ups` o `GET …/follow-ups`
- **THEN** responde `403` válido contra el spec y `rag-orchestrator` registra cero llamadas

#### Scenario: Seguimiento sobre un análisis sin evidencia o inexistente [US-218] (non-goal de la historia y contrato congelado; Decidido, usuario, 2026-11-03, [S5 resp. 13])
- **GIVEN** un análisis `sin_evidencia` y un UUID que no corresponde a ningún análisis
- **WHEN** envía una pregunta sobre cada uno
- **THEN** el primero responde `422` con `error = ANALISIS_SIN_EVIDENCIA` y el segundo `404`, ambos válidos contra el spec y sin llamadas a `rag-orchestrator`

#### Scenario: rag-orchestrator caído no consume turno [US-218 AC-1] [RN-06]
- **GIVEN** `rag-orchestrator` simulado con `503 LOCAL_LLM_UNAVAILABLE` y, en otra petición, sin respuesta antes del *deadline*
- **WHEN** envía la pregunta
- **THEN** responde `503` y `504` respectivamente, según la tabla única de fallos, válidos contra el spec, y no se persiste ningún turno

#### Scenario: NLI no disponible en Backend 2 se expone como 502, igual que en el análisis [US-218 AC-1] [RN-01]
- **GIVEN** `rag-orchestrator` simulado con `503` y `rag-nli-no-disponible.json`
- **WHEN** envía la pregunta
- **THEN** responde `502` válido contra el spec, sin texto generado, y no se persiste ningún turno

#### Scenario: Desidentificación no disponible falla cerrada sin llamar a la IA [US-218 AC-6] [RN-11]
- **GIVEN** el detector de PII de ADR-40 forzado a fallar en el arranque de la petición
- **WHEN** envía la pregunta
- **THEN** responde `503` con el cuerpo de `error-desidentificacion-no-disponible.json`, válido contra el spec, `rag-orchestrator` registra cero llamadas y no se persiste ningún turno

### Requirement: Lectura del hilo de seguimiento
`clinical-api` MUST atender `GET /platform/evidence-analyses/{analysisId}/follow-ups` con los turnos del análisis en orden de creación, válidos contra el spec, con `403` sin `follow_ups:read` y `404` si el análisis no existe.

#### Scenario: El hilo se devuelve en orden [US-218 AC-1]
- **GIVEN** un análisis con 2 turnos persistidos
- **WHEN** `doc1@test.local` envía `GET …/follow-ups`
- **THEN** responde `200` con un arreglo de 2 `FollowUpTurn` válidos contra el spec, con `turnNumber` 1 y 2 en ese orden y la pregunta enmascarada

### Requirement: La declaración de ausencia viaja al análisis desidentificada y no se lee como dato ausente
El gateway MUST incluir en el contexto desidentificado la declaración `sin_tratamiento_previo` como atributo con fecha relativa (sin identidad ni texto libre, RN-10, RN-11) y Backend 2 SHALL verbalizarla de forma determinista como «Sin tratamiento previo a la fecha» (ADR-34). Sin declaración y sin tratamientos, el hecho SHALL omitirse. La declaración NO SHALL ser citable ni soporte NLI como fuente del corpus (RN-24) y NO SHALL cambiar el estado de los criterios de aplicabilidad existentes.

#### Scenario: Contexto con declaración y sin tratamientos [RN-11] [ADR-34]
- **GIVEN** el paciente (g) con la declaración y `priorTreatments = []`
- **WHEN** se arma el contexto y se verbaliza el hecho
- **THEN** contiene el atributo con `monthsAgo` y la frase «Sin tratamiento previo a la fecha», sin `patientId` real ni fechas absolutas

#### Scenario: Sin declaración no hay frase [RN-02]
- **GIVEN** el mismo paciente sin declaración
- **WHEN** se verbaliza
- **THEN** no aparece la frase y no se afirma la ausencia de tratamientos

#### Scenario: La aplicabilidad no se infiere [RN-28]
- **GIVEN** la declaración y un estudio con criterio `linea_tratamiento`
- **WHEN** se calcula la aplicabilidad
- **THEN** el criterio queda en el estado que tendría sin la declaración

### Requirement: La clasificación de datos del request interno sale del paciente
`clinical-api` MUST fijar `dataClassification` de todo request hacia `rag-orchestrator` (`/rag/query` y `/chat/turn`) desde `Patient.data_origin`, mediante una única función con nombre propio, y MUST NOT tomarla del body público ni de la sesión (RN-12, OL-03).

#### Scenario: Un paciente real produce un request interno real aunque el body diga lo contrario [US-050 AC-4] [RN-12] [OL-03] [readme §2.5]
- **GIVEN** un paciente con `data_origin = real_identificado` en el repositorio falso del test unitario y una petición cuyo objeto de entrada trae `dataClassification = sintetico`
- **WHEN** el gateway arma el request interno
- **THEN** el request lleva `dataClassification = real_identificado`

#### Scenario: El body público con dataClassification se rechaza en el borde sin invocar a la IA [US-050 AC-4] [OL-03] (asumido: `EvidenceAnalysisRequest` tiene `additionalProperties: false`)
- **GIVEN** `doc1@test.local` con sesión válida y un cliente de `rag-orchestrator` que cuenta llamadas
- **WHEN** envía `POST /platform/evidence-analyses` con `Q-HER2` sobre el paciente semilla (a) y `dataClassification = sintetico` en el body
- **THEN** la respuesta es `422` con `error = CUERPO_INVALIDO` (el código de validación del borde del gateway), válida contra el spec de `clinical-api`, el cliente registra cero llamadas y no se persiste ningún registro

### Requirement: Un proveedor de nube con datos reales nunca se acepta ni se persiste
Si la respuesta de `rag-orchestrator` declara `meta.llmProvider = nube` para un request con `dataClassification` real, `clinical-api` MUST responder `502 ERROR_SERVICIO_IA` sin persistir ningún `AIAnalysisRecord` y registrar el evento `proveedor_no_permitido` sin contenido clínico (RN-12, defensa en profundidad).

#### Scenario: Una respuesta con llmProvider nube para un paciente real se descarta [US-050 AC-5] [RN-12] (asumido: verificación de `RagMeta.llmProvider` contra `dataClassification` declarada en el contrato)
- **GIVEN** un paciente de contenido sintético con `data_origin = real_anonimizado` (el arnés de test omite la guarda de entorno sintético `[S1 resp. 14d]`, que retira US-143) y `rag-orchestrator` simulado respondiendo `200` con `meta.llmProvider = nube`
- **WHEN** `doc1@test.local` solicita el análisis
- **THEN** la respuesta es `502` con `error = ERROR_SERVICIO_IA`, sin cuerpo de `rag-orchestrator`
- **AND** no existe fila en `clinical.ai_analysis_record` con ese `trace_id`

#### Scenario: Un turno de seguimiento servido por la nube para un análisis real se descarta [US-050 AC-5] [RN-12] (asumido: el seguimiento es otro turno con LLM del mismo gateway)
- **GIVEN** un análisis de un paciente cuyo `data_classification` es real y `rag-orchestrator` simulado respondiendo `200` en `/rag/follow-up` con `meta.llmProvider = nube`
- **WHEN** `doc1@test.local` envía una pregunta de seguimiento
- **THEN** la respuesta es `502` con `error = ERROR_SERVICIO_IA` y no se persiste ningún turno de seguimiento

#### Scenario: El 503 de LLM local caído con dato real se propaga sin detalles ni registro [US-050 AC-5] [FR-09] [AC-06.1] [readme §4.1]
- **GIVEN** un paciente de test con `data_origin = real_identificado` y `rag-orchestrator` simulado respondiendo `503` desde `contracts/examples/rag-llm-local-no-disponible.json`
- **WHEN** `doc1@test.local` solicita el análisis
- **THEN** la respuesta es `503` con `error = LOCAL_LLM_UNAVAILABLE`, el `message` fijo y el `traceId`, válida contra el spec de `clinical-api`, sin texto interno de `rag-orchestrator`
- **AND** no existe fila en `clinical.ai_analysis_record` con ese `trace_id`
