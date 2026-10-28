## MODIFIED Requirements

### Requirement: Contexto clínico por allowlist explícita
`ClinicalContextBuilder` MUST construir el `clinicalContext` campo a campo desde una allowlist explícita (diagnóstico activo, último valor por biomarcador, tratamientos previos, eventos, atributos, `currentLine` y, desde el S3, `missingCriticalData` con las claves del checklist), nunca copiando entidades completas; el resultado SHALL validar contra `ClinicalContext` con `additionalProperties: false` (RN-10). `clinicalNotes`, `biomarkerTrends` y `priorAnalyses` MUST viajar vacíos; `missingCriticalData` SHALL contener solo claves del catálogo clínico cargado.

#### Scenario: El contexto enviado valida contra el esquema cerrado y no lleva identificadores [US-052 AC-4] [RN-10] [OL-03]
- **GIVEN** el request capturado del caso del AC-1 sobre el paciente semilla (b)
- **WHEN** se validan las claves de `clinicalContext` contra el esquema `ClinicalContext` de `apps/rag-orchestrator/openapi.yaml` con `additionalProperties: false`
- **THEN** la validación pasa
- **AND** ninguna clave ni valor del payload contiene `patientId`, `identification`, `birthYear`, `agreementReference` ni `sourceDataset`, ni el UUID interno del paciente
- **AND** `clinicalNotes`, `biomarkerTrends` y `priorAnalyses` son listas vacías
- **AND** cada elemento de `missingCriticalData` es una clave del catálogo cargado

Regresión [RN-07] activa desde S3 (US-065): exclusión de datos `rechazado`/`reemplazado` y etiquetado completo de procedencia.
Regresión [RN-11] activa desde S1 con el change de L1D-203 (US-049): seudónimo criptográfico, enmascaramiento de la pregunta y del texto libre.

## ADDED Requirements

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
