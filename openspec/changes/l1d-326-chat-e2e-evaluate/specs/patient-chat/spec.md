## ADDED Requirements

### Requirement: El recorrido AC01…AC06 del chat se verifica de punta a punta con mama y próstata

Un E2E Playwright contra Compose (seed sintético, `LLM_PROVIDER=fake`) SHALL recorrer AC01…AC06 con el paciente (a) de
mama y el (b) de próstata. Cada turno MUST tener el `intent` esperado; los bloques `documentado`, `interpretacion` y
`conflicto` MUST llevar ≥ 1 enlace y los `evidencia` ≥ 1 cita (RN-01), con `faltante`, `catalogo`, `limitacion` y
`fuente` exentos; cada turno generado MUST mostrar los avisos de RN-19.

#### Scenario: Conversación de mama AC01…AC06 [US-269 AC-1] [RN-19] [RN-01]
- **GIVEN** Compose con el seed sintético, `LLM_PROVIDER=fake` y un oncólogo sintético con sesión
- **WHEN** Playwright abre el chat del paciente semilla (a) y envía en orden las preguntas de AC01 (situación clínica),
  AC02 (un examen o tratamiento concreto), AC03 (qué falta), AC04 (por qué importa un faltante), AC05 (evidencia) y AC06
  (fuentes y limitaciones)
- **THEN** los turnos tienen, respectivamente, `intent` `caso`, `caso`, `faltantes`, `faltantes`, `evidencia` y
  `fuentes_limitaciones`
- **AND** cada bloque `documentado`, `interpretacion` o `conflicto` tiene ≥ 1 enlace a un dato del paciente y cada
  bloque `evidencia` tiene ≥ 1 cita
- **AND** a los bloques `faltante`, `catalogo`, `limitacion` y `fuente` no se les exige enlace ni cita
- **AND** cada turno con contenido generado muestra «Generado por IA; requiere validación clínica independiente por el
  oncólogo tratante» y «Uso académico/investigación», sin punto final

#### Scenario: Conversación de próstata AC01…AC06 [US-269 AC-1] [RN-19] [RN-01]
- **GIVEN** el mismo entorno y las respuestas fijas `contracts/examples/chat-turn-*-prostata.json`
- **WHEN** Playwright recorre AC01…AC06 con el paciente semilla (b) (ISUP 3, serie de tres PSA, ADT, progresión)
- **THEN** cada turno tiene el `intent` esperado, cada bloque `documentado`, `interpretacion` o `conflicto` tiene ≥ 1
  enlace y cada bloque `evidencia` ≥ 1 cita, sin exigirlo a `faltante`, `catalogo`, `limitacion` ni `fuente`
- **AND** los avisos de RN-19 aparecen, sin punto final, en cada turno con contenido generado

### Requirement: La identidad sintética no aparece en ninguna superficie de la conversación

A lo largo de una conversación, la identidad del paciente MUST NOT aparecer en los cuerpos que `clinical-api` envía a
`rag-orchestrator`, en el estado efímero del hilo de `rag-orchestrator` ni en los *logs* de `web`, `clinical-api` y
`rag-orchestrator` (RN-10, RN-11), aunque el oncólogo la escriba en la pregunta.

#### Scenario: Pregunta con PII sembrada sin fuga en los cuerpos hacia Backend 2 [US-269 AC-6] [RN-10] [RN-11]
- **GIVEN** el paciente `P-CHAT` (FX-12-b, sembrado por `l1d-315`), MSW capturando `POST /chat/turn` y la pregunta FX-12-d con su nombre,
  documento y fecha de nacimiento sintéticos
- **WHEN** el oncólogo envía la pregunta por `POST …/conversations/{id}/turns`
- **THEN** ninguno de los cuerpos capturados contiene el nombre, el documento ni la fecha de nacimiento absoluta
  sintéticos

#### Scenario: Sin fuga en el estado del hilo [US-269 AC-6] [RN-11]
- **GIVEN** la petición desidentificada de FX-12-d producida por el pipeline de `clinical-api`
- **WHEN** `rag-orchestrator` resuelve el turno y se inspecciona el estado del hilo en el registro en memoria
- **THEN** 0 apariciones de la identidad sintética en todos los campos del estado

#### Scenario: Sin fuga en los logs de Compose [US-269 AC-6] [RN-10]
- **GIVEN** el E2E de la conversación con FX-12-d terminado
- **WHEN** se recogen los *logs* de `web`, `clinical-api` y `rag-orchestrator`
- **THEN** 0 apariciones del nombre, del documento y de la fecha de nacimiento sintéticos
