## ADDED Requirements

### Requirement: Los fragmentos se entregan al LLM con un alias corto y sin su chunkId real
El prompt de generación de `POST /rag/query` MUST presentar cada chunk entregado a la generación con un alias `C1…Cn` asignado por orden de `relevanceScore` descendente, con desempate por `chunkId` ascendente, y SHALL NOT contener ningún `chunkId` real. La instrucción de citar MUST pedir el alias del fragmento (RN-04). Solo reciben alias los chunks sobre el umbral que caben en el presupuesto de fragmentos configurado (`LLM_FRAGMENTS_MAX_CHARS`, RN-22).

#### Scenario: Cuatro chunks sobre el umbral reciben C1…C4 por relevancia y el prompt no lleva ids reales [US-236 AC-1] [RN-04]
- **GIVEN** una recuperación con cuatro chunks sobre el umbral (FX-06a-a) y el LLM falso `LLM-OK` a nivel de cliente (FX-06a-b)
- **WHEN** se arma el prompt de generación
- **THEN** el chunk de mayor `relevanceScore` lleva `C1` y los siguientes `C2`, `C3`, `C4` en orden descendente, y dos chunks con el mismo puntaje se ordenan por `chunkId` ascendente
- **AND** el texto del prompt no contiene ninguno de los cuatro `chunkId` reales

#### Scenario: La misma entrada produce los mismos alias [US-236 AC-5] [RN-06]
- **GIVEN** los mismos chunks en el mismo orden
- **WHEN** se arma el prompt dos veces
- **THEN** los dos prompts asignan alias idénticos a cada chunk

### Requirement: El alias citado se traduce al chunkId real antes de validar la cita
Cada alias citado MUST traducirse al `chunkId` real de su chunk antes de validar la cita, que sigue comparando `chunkId` reales (RN-01, RN-04). El alias es el único formato aceptado: cualquier otro texto, incluido un `chunkId` real, SHALL ser cita inválida, sin reparación; una opción sin cita traducible MUST ir a `discardedOptions` con `discardReason = cita_invalida`.

#### Scenario: Una cita a C2 apunta al chunk real con su texto del corpus [US-236 AC-2] [RN-04] [AC-T1.3]
- **GIVEN** FX-06a-a con cuatro chunks sobre el umbral y un LLM falso cuya opción cita `C2`
- **WHEN** `POST /rag/query` valida la respuesta
- **THEN** la opción queda en `evidenceOptions` y su cita tiene el `chunkId` real del chunk al que se asignó `C2`
- **AND** `chunkTextSnapshot` es igual al texto de ese chunk en el corpus
- **AND** la respuesta valida contra `RagQueryInternalResponse` del `openapi.yaml` del proveedor

#### Scenario: Un alias inexistente descarta la opción por cita inválida [US-236 AC-3] [RN-01] [AC-T1.2]
- **GIVEN** FX-06a-a con cuatro chunks entregados a la generación y un LLM falso cuya opción cita solo `C9`
- **WHEN** `POST /rag/query` valida la respuesta
- **THEN** la opción no está en `evidenceOptions` y aparece en `discardedOptions` con `discardReason = cita_invalida`

#### Scenario: El chunkId real copiado por el LLM no se acepta [US-236 AC-4] [RN-04] (asumido)
- **GIVEN** FX-06a-a y un LLM falso cuya opción cita el `chunkId` real `ch-m1-1` en lugar de su alias
- **WHEN** `POST /rag/query` valida la respuesta
- **THEN** la opción va a `discardedOptions` con `discardReason = cita_invalida`
- **AND** ningún id "parecido" a un `chunkId` real se repara ni se acepta

#### Scenario: Un alias de un chunk que no superó el umbral no existe [US-236 AC-6] [RN-01] [RN-24]
- **GIVEN** una recuperación donde tres chunks superan el umbral y un cuarto queda por debajo, y un LLM falso cuya opción cita `C4`
- **WHEN** `POST /rag/query` valida la respuesta
- **THEN** `C4` no corresponde a ningún chunk (solo existen `C1…C3`) y la opción va a `discardedOptions` con `discardReason = cita_invalida`
- **AND** el chunk bajo el umbral no aparece en ningún `citedSources` de la respuesta

### Requirement: Los alias nunca salen de la generación
Los alias MUST vivir solo dentro de una consulta de generación: la respuesta de `POST /rag/query`, el `AIAnalysisRecord` persistido por `clinical-api` y los logs de ambos servicios SHALL identificar los chunks solo por su `chunkId` real y SHALL NOT contener un alias como identificador (RN-06).

#### Scenario: Ni la respuesta, ni la persistencia, ni los logs llevan alias [US-236 AC-5] [RN-06]
- **GIVEN** FX-06a-a y un LLM falso cuya opción cita `C1` y `C2`
- **WHEN** se completa el análisis de punta a punta y se inspeccionan la respuesta serializada, el `AIAnalysisRecord` persistido y los logs capturados
- **THEN** cada `citedSources[].chunkId` es un `chunkId` real del corpus
- **AND** ninguna de las tres salidas contiene `C1` ni `C2` como identificador de chunk
