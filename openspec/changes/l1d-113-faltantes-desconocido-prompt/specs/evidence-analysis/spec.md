## ADDED Requirements

### Requirement: Los datos críticos faltantes viajan al prompt como «desconocido»
Por cada clave de `missingCriticalData`, el bloque de datos del paciente del prompt `rag-query` MUST contener la línea `<etiqueta>: desconocido`, con la etiqueta en español de `datos-criticos.json` del tipo del caso (FR-23, AC-04.3). El prompt SHALL NOT contener la clave cruda, un valor para el dato faltante ni el `pseudoPatientId` (RN-11).

#### Scenario: Estado menopáusico y Ki-67 faltantes aparecen como desconocido en el bloque de datos [US-116 AC-1] [AC-04.3] [FR-23]
- **GIVEN** un `RagQueryInternalRequest` de mama con `missingCriticalData = ["estado_menopausico", "ki67"]`, el catálogo de prueba montado con la versión de la solicitud y el LLM falso que captura el prompt (FX-06a-b)
- **WHEN** `rag-orchestrator` arma el prompt de `/rag/query` con chunks sobre el umbral
- **THEN** entre «Datos del paciente» y «Fragmentos:» aparecen las líneas «Estado menopáusico: desconocido» y «Ki-67: desconocido»
- **AND** el prompt no contiene las cadenas `estado_menopausico` ni `ki67` ni el `pseudoPatientId`
- **AND** la instrucción del prompt pide describir esos datos como «sin dato registrado (desconocido)» y esa instrucción no usa «no disponibles» (reservado a metadatos de fuente ausentes, RN-25)
- **AND** `check_prohibited_terms()` (niveles A y B) devuelve cero coincidencias sobre el prompt

#### Scenario: Sin faltantes no aparece ninguna línea desconocido [US-116 AC-5] [FR-23]
- **GIVEN** el mismo request con `missingCriticalData = []`
- **WHEN** `rag-orchestrator` arma el prompt de `/rag/query`
- **THEN** el bloque de datos del paciente no contiene ninguna línea con «desconocido»
- **AND** el bloque es idéntico al que se arma para ese contexto sin el cambio (solo diagnóstico y biomarcadores con su etiqueta de procedencia)

### Requirement: La consulta de recuperación incluye la línea actual y nunca valores de faltantes
El resumen del contexto clínico que se embebe junto con la pregunta (rama dense) MUST incluir la etiqueta de la línea de tratamiento actual cuando `clinicalContext.currentLine` no es `null` y SHALL NOT incluir ninguna etiqueta, valor ni la palabra «desconocido» por los datos de `missingCriticalData` (IA-03, PRD §12). La rama sparse, la reescritura de US-238 y el *reranker* siguen usando solo la pregunta (RN-03).

#### Scenario: Con línea actual y faltantes la consulta lleva la línea y ningún valor faltante [US-116 AC-2] [IA-03] (Decidido (usuario, 2026-11-03): literal «línea de tratamiento {n}», `[S5 resp. 13]`)
- **GIVEN** un `clinicalContext` de mama con `currentLine = 1` y `missingCriticalData = ["estado_menopausico", "ki67"]`
- **WHEN** se construye el texto de recuperación que se embebe junto con la pregunta
- **THEN** el texto contiene «línea de tratamiento 1»
- **AND** no contiene «Estado menopáusico», «Ki-67», `estado_menopausico`, `ki67` ni «desconocido»

#### Scenario: Sin línea actual la consulta no añade línea [US-116 AC-2] [IA-03]
- **GIVEN** el mismo `clinicalContext` con `currentLine = null`
- **WHEN** se construye el texto de recuperación
- **THEN** el texto es idéntico al resumen de diagnóstico y biomarcadores sin el cambio y no contiene «línea de tratamiento»

### Requirement: missingCriticalData solo admite claves del catálogo
Antes de detectar el idioma, embeber, buscar o invocar a cualquier modelo, y después de exigir la versión del catálogo (`409`), `POST /rag/query` MUST responder `422` con `ErrorValidacion` (`error = CUERPO_INVALIDO`) cuando un elemento de `clinicalContext.missingCriticalData` no cumple `^[a-z0-9_]+$` o no es una clave de `datos-criticos.json` del tipo de cáncer del caso (RN-11). El cuerpo y el log SHALL NOT repetir el valor recibido: solo su posición en `detail[].loc`.

#### Scenario: Un faltante en texto libre responde 422 sin eco y sin invocar puertos [US-116 AC-3] [RN-11] (Decidido (usuario, 2026-11-03): validación, `[S5 resp. 13]`)
- **GIVEN** un request de mama con `missingCriticalData = ["ki67", "Estado menopáusico de la paciente"]` y adapters falsos de embeddings, búsqueda, LLM y NLI con contador de invocaciones
- **WHEN** `clinical-api` lo envía a `POST /rag/query` con un JWT de servicio válido
- **THEN** responde `422` con `error = CUERPO_INVALIDO` y `detail[0].loc = ["body", "clinicalContext", "missingCriticalData", 1]`, validando contra `ErrorValidacion` del `openapi.yaml` del proveedor
- **AND** ni el cuerpo de la respuesta ni los logs contienen «Estado menopáusico de la paciente»
- **AND** embeddings, búsqueda, LLM y NLI registran cero invocaciones

#### Scenario: Una clave con forma válida fuera del catálogo responde 422 [US-116 AC-3] [RN-11] (Decidido (usuario, 2026-11-03): validación, `[S5 resp. 13]`)
- **GIVEN** un request de mama con `missingCriticalData = ["psa_serie"]` (clave del catálogo de próstata, no de mama)
- **WHEN** se procesa
- **THEN** responde `422` con `error = CUERPO_INVALIDO` y `detail[0].loc` terminado en `0`, sin invocar a ningún puerto

#### Scenario: Con otra versión del catálogo manda el 409 [US-116 AC-3] [RN-11]
- **GIVEN** un request con `catalogVersion` distinta de la montada y un `missingCriticalData` con una clave no catalogada
- **WHEN** se procesa
- **THEN** responde `409` (versión del catálogo) y no `422`

### Requirement: Con faltantes y sin evidencia no se invoca al LLM de generación
Declarar faltantes MUST NOT alterar RN-02 enmendada: si ningún chunk supera el umbral tras el segundo loop, `POST /rag/query` responde `sin_evidencia` con `topRelevanceScore = null` sin invocar al LLM de generación ni al agente, y la reescritura (como mucho una, US-238) recibe solo la pregunta.

#### Scenario: Faltantes con Q-SIN responden sin_evidencia sin generación [US-116 AC-4] [RN-02]
- **GIVEN** el corpus FX-06a-a, `RELEVANCE_THRESHOLD = 0.30`, `missingCriticalData = ["estado_menopausico", "ki67"]`, `Q-SIN` y los LLM falsos de generación y de reescritura con contador de invocaciones (FX-06a-b, FX-06b-a)
- **WHEN** `clinical-api` envía la consulta a `POST /rag/query`
- **THEN** responde `200` con `status = sin_evidencia`, `evidenceOptions = []` y `topRelevanceScore = null`
- **AND** el LLM de generación registra cero invocaciones y el de reescritura como mucho una
- **AND** la entrada capturada por el LLM de reescritura no contiene «desconocido» ni las etiquetas de los faltantes

### Requirement: La versión del prompt de generación sube con las líneas desconocido
Al incorporar las líneas «desconocido», `VERSION_DEL_PROMPT` MUST pasar de `rag-query@0.6.0` a `rag-query@0.7.0` (versión definitiva del change) y `meta.promptVersion` MUST reflejarla, para que la suite `evaluate` y el registro del análisis distingan los prompts.

#### Scenario: meta.promptVersion refleja la nueva versión menor [US-116 AC-1] (Decidido (usuario, 2026-11-03): versionado del prompt, `[S5 resp. 13]`)
- **GIVEN** una consulta a `/rag/query` con faltantes, chunks sobre el umbral y el LLM falso
- **WHEN** se lee `meta.promptVersion`
- **THEN** vale `rag-query@0.7.0`
