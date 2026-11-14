## ADDED Requirements

### Requirement: La pregunta por fuentes y limitaciones se responde sin el LLM de generación

Una pregunta por fuentes o limitaciones SHALL clasificarse por reglas como `intent = "fuentes_limitaciones"` y MUST
resolverse sin llamar al LLM. Cada documento citado en el último turno de evidencia MUST listarse en un bloque `fuente`
sin `chunkId`, con título, `sourceName`, año, idioma y licencia copiados del catálogo del corpus (RN-04, AC-T1.3), y
`notices` MUST llevar los avisos de RN-19.

#### Scenario: Fuentes del último turno de evidencia copiadas del catálogo [US-266 AC-1] [RN-04] [AC-T1.3]
- **GIVEN** un hilo con un turno de evidencia previo resuelto con `LLM-OK` sobre el corpus FX-06a-a, cuyo
  `structuredState` tiene `ultimaEvidencia` (sin `analysisId`) y `citasMostradas` con chunks de `doc-m1`, y el LLM falso
  con contador de invocaciones (FX-12-e)
- **WHEN** el oncólogo pregunta «¿Cuáles son las fuentes y las limitaciones?»
- **THEN** el turno tiene `intent = "fuentes_limitaciones"`
- **AND** el LLM falso registra cero llamadas de generación y cero de clasificación
- **AND** hay un bloque `fuente` por documento citado, con título, `sourceName`, año, idioma y licencia iguales a las
  columnas de `corpus_document` de ese documento, sin `chunkId` ni `citations[]`
- **AND** `notices` incluye el aviso de IA y el de uso académico de la configuración de Backend 2, sin punto final
- **AND** la respuesta valida contra `ChatTurnResponse` del `openapi.yaml` del proveedor

### Requirement: Un metadato de fuente ausente se muestra como «No disponible»

Si el catálogo del corpus no tiene un metadato de una fuente listada, el bloque `fuente` MUST mostrar «No disponible» en
su lugar; el valor nunca se infiere, nunca es `0` ni lo aporta el LLM (RN-25).

#### Scenario: Documento del corpus sin año [US-266 AC-2] [RN-25]
- **GIVEN** el turno de evidencia previo cita un documento del corpus de test con `published_at = null`
- **WHEN** el oncólogo pregunta por las fuentes
- **THEN** el bloque `fuente` de ese documento muestra el año como «No disponible»
- **AND** su texto no contiene `0` ni otro año en lugar del ausente

### Requirement: El turno declara las limitaciones de la recuperación

La respuesta de fuentes y limitaciones MUST incluir un bloque `limitacion` con la fecha de corte del corpus, las fuentes
no incluidas (configuración del corpus de Backend 2, las mismas que publica `/rag/query`) y el número de fragmentos
evaluados por el *reranker* (`len(ultimaEvidencia.chunkIds)`), nunca del LLM (AC-06.2).

#### Scenario: Corte del corpus, fuentes no incluidas y fragmentos evaluados [US-266 AC-3] [AC-06.2]
- **GIVEN** el mismo hilo, con `CORPUS_CUTOFF_DATE = 2026-09-30` y `CORPUS_EXCLUDED_SOURCES = NCCN,ESMO` en la
  configuración de Backend 2 y `ultimaEvidencia.chunkIds` con 41 ids
- **WHEN** se responde la pregunta por las fuentes y las limitaciones
- **THEN** un bloque `limitacion` incluye la fecha de corte `2026-09-30`, las fuentes no incluidas `NCCN` y `ESMO` y el
  número de fragmentos evaluados `41`
- **AND** ningún bloque contiene contenido de NCCN ni de ESMO, solo su nombre como fuente no incluida

### Requirement: El turno declara las limitaciones de la evidencia

La respuesta MUST incluir un bloque `limitacion` que nombra los criterios de aplicabilidad con estado «Desconocido» del
último análisis del estado efímero del hilo, el número de opciones en `discardedOptions` y la frase fija «La evidencia encontrada no permite
establecer por sí sola la aplicabilidad de un tratamiento a este paciente» (FR-10). El texto MUST NOT contener términos
de la lista prescriptiva prohibida (RN-23).

#### Scenario: Criterios desconocidos y opciones descartadas [US-266 AC-4] [FR-10]
- **GIVEN** un hilo vivo cuyo último análisis tiene los criterios «Estado menopáusico» y «Ki-67» en «Desconocido» y 1
  opción en `discardedOptions`
- **WHEN** se responde la pregunta por las fuentes y las limitaciones
- **THEN** un bloque `limitacion` nombra «Estado menopáusico» y «Ki-67», indica 1 opción descartada y contiene la frase
  «La evidencia encontrada no permite establecer por sí sola la aplicabilidad de un tratamiento a este paciente»
- **AND** ningún texto mostrado contiene términos de la lista prohibida de RN-23

### Requirement: Un turno de evidencia sin evidencia lo dice sin invocar al LLM de generación

Cuando una pregunta de evidencia del chat no supera el umbral tras el único segundo loop, el análisis MUST quedar
`status = "sin_evidencia"` con `topRelevanceScore = null` (nunca `0.0`) y `evidenceOptions = []`, el LLM de generación
MUST NOT invocarse, y el turno MUST decirlo junto al bloque `limitacion` de la recuperación (RN-02). Backend 1 MUST
persistir el análisis y el turno antes de responder (RN-06).

#### Scenario: Q-SIN en el chat responde sin_evidencia con las limitaciones de la recuperación [US-266 AC-5] [RN-02]
- **GIVEN** el corpus FX-06a-a, `Q-SIN` enviada como turno de una conversación del paciente semilla (a) y el LLM falso
  con contador de invocaciones
- **WHEN** `clinical-api` procesa el turno (Supertest + PostgreSQL real + MSW desde `chat-turn-fuentes-sin-evidencia.json`)
- **THEN** existe un `AIAnalysisRecord` con `status = "sin_evidencia"`, `topRelevanceScore = null` y
  `evidenceOptions = []`, enlazado al turno persistido
- **AND** el LLM de generación registra cero llamadas
- **AND** el turno indica que no se encontró evidencia y lleva el bloque `limitacion` con la fecha de corte, las fuentes
  no incluidas y los fragmentos evaluados, y `notices` con los avisos de RN-19
- **AND** el `structuredState` persistido tiene `ultimaEvidencia.topRelevanceScore = null` y no tiene `analysisId`

### Requirement: Sin evidencia consultada no se listan fuentes

Si el hilo no tiene ningún turno de evidencia, la pregunta por las fuentes MUST responder que aún no se ha consultado
evidencia en esta conversación, sin bloques `fuente`, sin `citations[]` y sin llamadas al LLM.

#### Scenario: Conversación sin turnos de evidencia [US-266 AC-6]
- **GIVEN** un hilo cuyos turnos previos son solo de `caso` y `faltantes` (sin `ultimaEvidencia`)
- **WHEN** el oncólogo pregunta por las fuentes
- **THEN** la respuesta dice que aún no se ha consultado evidencia en esta conversación
- **AND** no hay bloques `fuente` y `citations` está vacío
- **AND** el LLM falso registra cero llamadas

### Requirement: Un fallo del corpus en el turno de fuentes falla cerrado

Si el catálogo del corpus, las posiciones de los chunks o la release no responden, el turno de fuentes y limitaciones MUST
responder `503` con `RETRIEVAL_UNAVAILABLE`, sin detalle del borde y sin respuesta parcial, y el contrato de `/chat/turn`
MUST declarar ese código y `NLI_UNAVAILABLE` en su `503`. Backend 1 MUST traducirlo a `502` sin persistir el turno.

#### Scenario: Catálogo caído durante el turno de fuentes [US-266 AC-1] [RN-01] [RN-06]
- **GIVEN** un hilo con un turno de evidencia previo y el catálogo del corpus sin respuesta
- **WHEN** el oncólogo pregunta por las fuentes
- **THEN** `rag-orchestrator` responde `503` con `error = "RETRIEVAL_UNAVAILABLE"` sin el mensaje del borde
- **AND** el LLM registra cero llamadas
- **AND** `clinical-api` responde `502` y no persiste el turno
