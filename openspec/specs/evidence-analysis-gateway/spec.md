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
`clinical-api` MUST mapear cada fallo de `POST /rag/query` en una única función (`mapearFalloRag()`, `[S1 resp. 12]`): `503 LOCAL_LLM_UNAVAILABLE` y, desde el S2, `409 CATALOG_VERSION_MISMATCH` conservan su código; `503 RETRIEVAL_UNAVAILABLE`, `503 NLI_UNAVAILABLE`, otros `4xx`/`5xx`, errores de red y respuestas que no validan → `502 ERROR_SERVICIO_IA`. Ninguna fila SHALL persistir un `AIAnalysisRecord` ni reenviar cuerpo, `message` o cabeceras de rag.

#### Scenario: El LLM local no disponible se responde como 503 sin registro [US-053 AC-4] [S1 resp. 12]
- **GIVEN** `rag-orchestrator` simulado respondiendo `503` desde `contracts/examples/rag-llm-local-no-disponible.json`
- **WHEN** `doc1@test.local` envía `Q-HER2` sobre el paciente semilla (a)
- **THEN** la respuesta es `503` con `error = LOCAL_LLM_UNAVAILABLE`, el `message` fijo de `error-llm-local-no-disponible.json` y el `traceId` generado, válida contra el spec de `clinical-api` (*helper* de L1D-164)
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

Regresión [RN-30 429 con `Retry-After`] activa desde S4 (US-056). Regresión [RN-12 503 y `llm_provider` local con datos reales] activa desde S6 (US-050).

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
- **GIVEN** la constante `ESTADOS_DESCARTADOS` de `modules/patients/estados-de-revision.ts`
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
