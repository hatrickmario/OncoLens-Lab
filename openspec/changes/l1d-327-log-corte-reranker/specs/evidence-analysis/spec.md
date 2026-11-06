## ADDED Requirements

### Requirement: El log del corte previo al reranker identifica los fragmentos cortados sin su texto
Cuando el corte a `RERANKER_MAX_PAIRS` descarta candidatos, el evento `event=rag_query_corte` de `rag-orchestrator` MUST registrar, además de `recibidos`, `descartados` y `enviados`, el campo `cortados` con cada `chunkId` cortado y su puesto denso 1-based, en orden denso, hasta `RERANKER_CUT_LOG_MAX_IDS` ids, y `cortados_omitidos` con el resto. MUST NOT registrar texto de chunk, la pregunta ni identificadores del paciente (RN-10, RN-14, RN-22; cambia la decisión 82 `[S6 resp. 4]`).

#### Scenario: El evento lista los chunks cortados con su puesto denso [US-270 AC-1] [RN-22]
- **GIVEN** 15 candidatos falsos `ch-01`…`ch-15` ordenados por puntaje denso y `RERANKER_MAX_PAIRS = 12`
- **WHEN** corre la consulta
- **THEN** el evento `event=rag_query_corte` registra `recibidos=15 descartados=3 enviados=12`
- **AND** registra `cortados=ch-13:13,ch-14:14,ch-15:15`, en ese orden

#### Scenario: Ningún registro contiene texto de chunk, la pregunta ni identificadores del paciente [US-270 AC-2] [RN-10] [RN-14]
- **GIVEN** el caso de AC-1 con chunks cuyo texto y pregunta contienen marcadores únicos y un contexto con `pseudoPatientId`
- **WHEN** se captura el log de la consulta con `caplog`
- **THEN** ningún registro contiene el texto de un chunk, la pregunta ni el `pseudoPatientId`

#### Scenario: Sin corte el evento registra cero descartados y cortados vacío [US-270 AC-3] [RN-22]
- **GIVEN** 10 candidatos y `RERANKER_MAX_PAIRS = 12`
- **WHEN** corre la consulta
- **THEN** el evento registra `descartados=0` y `cortados=` vacío, sin `cortados_omitidos`

#### Scenario: La línea lista como máximo el tope configurado y cuenta los omitidos [US-270 AC-4] [RN-22] (asumido)
- **GIVEN** 200 candidatos, `RERANKER_MAX_PAIRS = 12` y `RERANKER_CUT_LOG_MAX_IDS = 50`
- **WHEN** corre la consulta
- **THEN** `cortados` lista los primeros 50 cortados en orden denso, del puesto 13 al 62
- **AND** el evento añade `cortados_omitidos=138`
