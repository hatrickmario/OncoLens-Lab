## Purpose

Define el comportamiento verificable del gateway de `clinical-api` para `POST /platform/evidence-analyses`: cómo se valida la petición en el borde, qué contexto clínico del caso se construye y se envía a `rag-orchestrator`, y cuándo no se invoca a `rag-orchestrator`. La persistencia del análisis y la desidentificación completa las añaden otros changes del mismo módulo con requisitos propios.

## ADDED Requirements

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
`ClinicalContextBuilder` MUST construir el `clinicalContext` campo a campo desde una allowlist explícita (diagnóstico activo, último valor por biomarcador, tratamientos previos, eventos, atributos y `currentLine`), nunca copiando entidades completas; el resultado SHALL validar contra `ClinicalContext` con `additionalProperties: false` (RN-10). En el S1 `clinicalNotes`, `biomarkerTrends`, `missingCriticalData` y `priorAnalyses` MUST viajar vacíos.

#### Scenario: El contexto enviado valida contra el esquema cerrado y no lleva identificadores [US-052 AC-4] [RN-10] [OL-03]
- **GIVEN** el request capturado del caso del AC-1 sobre el paciente semilla (b)
- **WHEN** se validan las claves de `clinicalContext` contra el esquema `ClinicalContext` de `apps/rag-orchestrator/openapi.yaml` con `additionalProperties: false`
- **THEN** la validación pasa
- **AND** ninguna clave ni valor del payload contiene `patientId`, `identification`, `birthYear`, `agreementReference` ni `sourceDataset`, ni el UUID interno del paciente
- **AND** `clinicalNotes`, `biomarkerTrends`, `missingCriticalData` y `priorAnalyses` son listas vacías

Regresión [RN-07] activa desde S3 (US-065): exclusión de datos `rechazado`/`reemplazado` y etiquetado completo de procedencia.
Regresión [RN-11] activa desde S1 con el change de L1D-203 (US-049): seudónimo criptográfico, enmascaramiento de la pregunta y del texto libre.

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
- **WHEN** envía `POST /platform/evidence-analyses` con la pregunta del AC-1 y la cabecera `X-Trace-Id: Lucía Rondón 52123456`
- **THEN** el request capturado lleva `traceId = req_TestGen0001` y ninguna parte del body ni de sus cabeceras contiene `Lucía`, `Rondón` ni `52123456`
- **AND** el `traceId` de la respuesta es `req_TestGen0001`
- **AND** las líneas de log capturadas no contienen `Lucía`, `Rondón` ni `52123456` ni una clave `traceIdEntrante`

#### Scenario: Un X-Trace-Id con el patrón válido solo aparece en el log [US-052 AC-1] (asumido: corrección del Gate 1, 2026-10-14)
- **GIVEN** el mismo contexto y la cabecera `X-Trace-Id: req_Entrante01`
- **WHEN** se envía la petición
- **THEN** el request capturado y la respuesta llevan `traceId = req_TestGen0001` y no contienen `req_Entrante01`
- **AND** el log de la petición contiene `traceIdEntrante = req_Entrante01` junto al `traceId` generado

Regresión [`ai_analysis_record.trace_id` = traceId generado] activa desde S1 con el change de L1D-104.

### Requirement: El desidentificador provisional falla cerrado fuera de datos sintéticos
Mientras el puerto `ContextDeidentifier` use el adaptador provisional de este change, `clinical-api` MUST rechazar el análisis antes de cualquier llamada saliente si `patient.data_origin ≠ sintetico` o si `APP_ENV` no está en `{local, test}` (incluido ausente), y SHALL responder `502` con `error = ERROR_SERVICIO_IA` genérico, sin invocar a `rag-orchestrator` ni persistir (RN-11, RN-13, `[S1 resp. 14d]`).

#### Scenario: Un paciente con data_origin real_anonimizado no sale hacia la IA [RN-11] [RN-13] [S1 resp. 14d]
- **GIVEN** `doc1@test.local` con sesión válida, `APP_ENV = test`, un paciente sintético creado en el test con `data_origin = real_anonimizado` y `rag-orchestrator` simulado que cuenta llamadas
- **WHEN** envía `POST /platform/evidence-analyses` con una pregunta válida sobre ese paciente
- **THEN** responde `502` con `error = ERROR_SERVICIO_IA`, `message` fijo y `traceId`, válido contra el spec de `clinical-api`
- **AND** el cliente de `rag-orchestrator` registra cero llamadas y el log lleva `motivo = data_origin` sin la pregunta

#### Scenario: Compose no levanta el servicio sin APP_ENV [RN-11] [RN-13] [decisión 64]
- **GIVEN** el `infra/docker/docker-compose.yml` con `clinical-api` declarando `APP_ENV: ${APP_ENV:?APP_ENV obligatorio}`
- **WHEN** se ejecuta `docker compose config` sin `APP_ENV` en el entorno
- **THEN** el comando falla con el mensaje `APP_ENV obligatorio` y no se levanta ningún servicio

#### Scenario: Con APP_ENV piloto o ausente el paciente semilla tampoco sale hacia la IA [RN-11] [RN-13] [S1 resp. 14d]
- **GIVEN** el paciente semilla (b) con `data_origin = sintetico` y la app de test arrancada con `APP_ENV = piloto`, y en otro caso sin `APP_ENV`
- **WHEN** `doc1@test.local` envía la pregunta del AC-1
- **THEN** ambas respuestas son `502` con `error = ERROR_SERVICIO_IA` y el cliente de `rag-orchestrator` registra cero llamadas

Regresión [RN-11 fallo cerrado `503 DESIDENTIFICACION_NO_DISPONIBLE`] activa desde S1 con el change de L1D-203, que sustituye este adaptador.

Nota de presentación (Gate 1, usuario, 2026-10-20): el panel de L1D-140 muestra para este `502` el mismo aviso neutro "No se pudo generar el análisis en este momento." (clave de `es.json`, dueño L1D-140). El `422 TIPO_CANCER_NO_REGISTRADO` es una imposibilidad técnica, no un aviso clínico de RN-26, y su `message` es fijo; el panel añade cómo continuar ("Registre el diagnóstico activo del paciente y vuelva a solicitar el análisis."). Este change no modifica `web`.
