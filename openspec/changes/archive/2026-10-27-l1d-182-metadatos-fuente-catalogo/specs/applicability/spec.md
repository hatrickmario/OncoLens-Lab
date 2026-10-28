# Spec Delta — applicability

<!-- Decisión del usuario, 2026-10-24, [S3 resp. 16]: el requisito de `studyPopulationValue` es uno solo y es de
l1d-127. Este change lo reescribe como MODIFIED (texto de l1d-127 sin cambios + su escenario de US-122 AC-5) solo
para añadir el escenario de US-127 AC-4. Se archiva después de l1d-127 (orden 127 → 128 → 129 → 130 → 182). -->

## MODIFIED Requirements

### Requirement: Valor del estudio copiado de la fuente o desconocido sin inferencia
`studyPopulationValue` MUST copiarse carácter a carácter de `population_criteria` del documento, bajo el `studyKey` del criterio (RN-25, AC-08.9), sin reformular, traducir, normalizar ni completar. Sin valor estructurado (ausente o `no_disponible`) SHALL ser `null` y el criterio `desconocido` con `no_reportado_por_fuente`, salvo dato faltante en el paciente (`falta_en_paciente`, `[S3 resp. 16]`). Si la lectura falla, MUST responder `503 RETRIEVAL_UNAVAILABLE`.

#### Scenario: Un documento sin información de población deja todos los criterios desconocidos [US-122 AC-5] [AC-08.3] [RN-25]
- **GIVEN** FX-08b-a, A-M1 y `doc-a3`, sin información de población
- **WHEN** se evalúa `doc-a3`
- **THEN** cada uno de sus criterios trae `status = desconocido` y `studyPopulationValue = null`
- **AND** cada criterio con dato en el paciente trae `unknownReason = no_reportado_por_fuente`, salvo dato faltante (US-124): `estado_menopausico`, ausente en A-M1, trae `unknownReason = falta_en_paciente` [S3 resp. 16]
- **AND** ninguno trae un valor del estudio distinto de `null`

#### Scenario: El valor del estudio es el texto del catálogo sin reformular [US-127 AC-4] [AC-08.9] [RN-25]
- **GIVEN** FX-08b-a: catálogo clínico `test-apl-1.0.0`, paciente A-M1 y `doc-a1` con `population_criteria` estructurado sembrado en el schema `corpus` de test, y un generador falso cuya opción cita un chunk de `doc-a1`
- **WHEN** `POST /rag/query` arma la aplicabilidad
- **THEN** en `applicability` de `doc-a1`, el `studyPopulationValue` de cada criterio con valor estructurado es idéntico (misma cadena, mismas mayúsculas, tildes y signos, por ejemplo "I–III" con su raya) al texto de `population_criteria` de `doc-a1` para ese criterio
- **AND** ningún `studyPopulationValue` contiene texto del generador falso ni el `patientValue` del criterio
- **AND** la respuesta valida contra `RagQueryInternalResponse` del `openapi.yaml` del proveedor
