## ADDED Requirements

### Requirement: El chat distingue lo documentado de la interpretación

Cada afirmación de un turno de caso SHALL tener `kind = "documentado"` o `kind = "interpretacion"` (enum cerrado de `ChatBlock`). El texto de un bloque `documentado` MUST ser byte a byte la `verbalization` determinista de un único `CaseFact` (ADR-34), insertada por el código y nunca escrita por el LLM, y su `ConversationDataLink` MUST traer el `recordedDate` del registro de Backend 1. Un bloque `interpretacion` MUST tener ≥ 1 `factRef` válido y pasar el NLI contra los hechos que enlaza.

#### Scenario: Solo hay bloques de afirmación o la limitación de AC-4
- **GIVEN** cualquier turno de caso
- **WHEN** se arma la respuesta
- **THEN** cada bloque de afirmación es `documentado` o `interpretacion`; el único otro bloque posible es el `limitacion` de texto fijo cuando no queda ninguna afirmación
- **AND** el rótulo visible «Interpretación generada por IA» de `kind = "interpretacion"` lo pinta la UI de `l1d-324` (L1D-324), no este change [US-261 AC-2]

#### Scenario: Tratamiento previo documentado con su fecha del registro
- **GIVEN** el paciente semilla (b) de FX-12-a con tratamiento previo ADT
- **WHEN** el oncólogo pregunta «¿Qué tratamiento previo ha recibido y cuándo?»
- **THEN** la respuesta tiene un bloque `kind = "documentado"` cuyo texto es byte a byte la verbalización determinista del tratamiento ADT
- **AND** su `ConversationDataLink` trae el `recordedDate` tomado del registro de Backend 1, no del LLM [US-261 AC-1] [AC-02.3] [ADR-34]

#### Scenario: El texto del LLM en un bloque documentado se descarta
- **GIVEN** el LLM falso devuelve una afirmación `documentado` con `factRefs` válidos y un texto propio
- **WHEN** se valida el turno
- **THEN** el bloque contiene solo la verbalización determinista del hecho y nada del texto del LLM [US-261 AC-1] [ADR-34]

#### Scenario: Varios hechos documentados salen en secuencia
- **GIVEN** una afirmación `documentado` que enlaza dos hechos con días relativos −160 y −40
- **WHEN** se arma la respuesta
- **THEN** hay un bloque `documentado` por hecho, en orden ascendente de día relativo [US-261 AC-1] [AC-02.3] (asumido en un bloque por hecho)

#### Scenario: Interpretación que combina dos hechos rotulada como tal
- **GIVEN** una afirmación del LLM que combina dos hechos y el NLI falso devuelve `entailment`
- **WHEN** se valida
- **THEN** aparece como `kind = "interpretacion"` con los dos `factRefs`
- **AND** `notices`, rellenado por `rag-orchestrator`, incluye el aviso de RN-19 [US-261 AC-2] [RN-19]

#### Scenario: Interpretación sin soporte NLI se omite
- **GIVEN** una afirmación `interpretacion` con dos `factRefs` válidos y el NLI falso devuelve `neutral`
- **WHEN** se valida
- **THEN** la afirmación no aparece en ningún bloque y `omittedClaims` suma 1 [US-261 AC-2] [RN-01] [AC-T1.2]

#### Scenario: Interpretación con una cifra ajena a los hechos se omite antes del NLI
- **GIVEN** una afirmación `interpretacion` que escribe una cifra o una unidad que no está en la descripción de los hechos que cita, y el NLI falso devuelve `entailment`
- **WHEN** se valida
- **THEN** la afirmación se omite, `omittedClaims` suma 1 y el adapter NLI no registra llamadas [US-261 AC-2] [RN-01] [ADR-34]

#### Scenario: Interpretación con verbo de tendencia o valoración se omite antes del NLI
- **GIVEN** una afirmación `interpretacion` que dice que un valor «subió», «empeoró», «mejoró» o es «favorable»
- **WHEN** se valida
- **THEN** la afirmación se omite, `omittedClaims` suma 1 y el adapter NLI no registra llamadas; `omittedClaims` cuenta afirmaciones descartadas, no ausencias del expediente [US-261 AC-2] [RN-23]

### Requirement: El chat acota la respuesta al periodo preguntado

Cuando la pregunta nombra un periodo relativo reconocido por reglas deterministas («últimos N días, semanas, meses o años», «último mes» o «último año»), Backend 2 SHALL filtrar `caseFacts` por día relativo antes de armar el prompt. Los `factRefs` de los bloques del turno MUST referirse solo a hechos dentro del periodo; un hecho cuyo intervalo empieza antes y termina dentro del periodo MUST llevar la marca «iniciado antes del periodo» en su verbalización.

#### Scenario: Últimos 100 días
- **GIVEN** `P-CHAT` (FX-12-b) con la quimioterapia neoadyuvante (inicio en el día −160), la cirugía conservadora (día −40) y el diagnóstico (día 0)
- **WHEN** el oncólogo pregunta «¿Qué ocurrió en los últimos 100 días?»
- **THEN** los bloques solo enlazan `factRefs` de hechos con día relativo ≥ −100, entre ellos la cirugía (día −40)
- **AND** la quimioterapia no llega al prompt ni a ningún bloque, porque `CaseFact` solo informa el día de inicio
- **AND** si `CaseFact` informara el fin del intervalo (`dia_relativo_fin`) y este cayera dentro del periodo, la quimioterapia se conservaría con la marca «(iniciado antes del periodo)» en su verbalización (regla pura probada en unitario; inactiva en integración) [US-261 AC-3] [AC-02.1] (asumido en el tratamiento de intervalos que cruzan el periodo)

#### Scenario: El periodo se mide desde el diagnóstico
- **GIVEN** que el día relativo 0 es el diagnóstico y no la fecha de hoy
- **WHEN** la pregunta nombra «los últimos N días»
- **THEN** el filtro conserva los hechos con día relativo ≥ −N [US-261 AC-3] (el ancla en el diagnóstico es una pregunta de producto abierta para el PO)

#### Scenario: Hecho que terminó antes del periodo
- **GIVEN** un hecho con intervalo de días −300 a −200
- **WHEN** el oncólogo pregunta por los últimos 100 días
- **THEN** el hecho no llega al prompt ni aparece en ningún `factRef` de los bloques [US-261 AC-3] [AC-02.1]

#### Scenario: Hechos sin fecha confiable fuera del periodo
- **GIVEN** una pregunta con periodo y un hecho con `relativeDay = null`
- **WHEN** se filtra
- **THEN** el hecho no llega al prompt y la respuesta suma a `notices` el aviso fijo «Se omitieron N dato(s) del expediente sin fecha confiable; no se pudieron ubicar en el periodo consultado», que no bloquea y no es el texto de «sin datos» (`CHAT_SIN_FECHA_TEXTO`) [US-261 AC-3] [RN-26]

#### Scenario: Pregunta con fecha absoluta no enmascarada
- **GIVEN** una pregunta con una fecha absoluta («desde el 2025-03-14») que Backend 1 no relativizó
- **WHEN** se arma el prompt
- **THEN** la fecha no se usa como periodo, `caseFacts` llega completo y ningún hecho lleva fecha absoluta [US-261 AC-3] [RN-11] (riesgo preexistente de `l1d-316`/`l1d-317` si Backend 1 no la relativiza)

#### Scenario: Pregunta sin periodo reconocido
- **GIVEN** una pregunta de caso sin ninguna expresión de periodo reconocida
- **WHEN** se arma el prompt
- **THEN** `caseFacts` llega completo, sin filtrar [US-261 AC-3] (asumido)

### Requirement: Sin hecho documentado el chat lo dice y no inventa

Una afirmación del LLM sin `factRefs` válidos SHALL omitirse sin invocar el NLI y sumar a `omittedClaims`. Si todas las afirmaciones del turno se omiten, la respuesta MUST contener únicamente un bloque `limitacion` con el texto fijo «No se encontró información documentada sobre lo preguntado en el expediente», declarado una sola vez en configuración (`CHAT_SIN_DATOS_TEXTO`, RN-22).

#### Scenario: Examen no documentado
- **GIVEN** el paciente semilla (a) de FX-12-a sin gammagrafía ósea registrada
- **WHEN** el oncólogo pregunta «¿Cuál fue el resultado de la gammagrafía ósea?» y el LLM falso devuelve una afirmación sin `factRefs`
- **THEN** la afirmación se omite, `omittedClaims = 1` y el adapter NLI no registra llamadas
- **AND** la respuesta trae un único bloque `kind=limitacion` con el texto fijo «No se encontró información documentada sobre lo preguntado en el expediente» [US-261 AC-4] [RN-01] [S6-prompt §3]

#### Scenario: El periodo no tiene datos pero el expediente sí
- **GIVEN** una pregunta con periodo y hechos del caso solo fuera de ese periodo
- **WHEN** ninguna afirmación sobrevive
- **THEN** el único bloque `limitacion` dice «No se encontró información documentada en el periodo consultado; el expediente tiene datos fuera de ese periodo» (`CHAT_SIN_DATOS_PERIODO_TEXTO`), distinto del texto de «sin datos» [US-261 AC-4]

### Requirement: Las preguntas sobre exámenes, tratamientos y periodos no llevan fechas absolutas al LLM

El prompt de un turno de caso con modo `documentado` o con filtro por periodo SHALL contener solo días relativos; ninguna fecha absoluta (`AAAA-MM-DD` u otro formato de calendario) MUST llegar al LLM, ni en los hechos, ni en el periodo, ni en la memoria del hilo.

#### Scenario: Prompt sin fechas absolutas
- **GIVEN** cualquiera de las preguntas de tratamiento, periodo o examen de este requisito sobre `P-CHAT`
- **WHEN** se arma el prompt que recibe el LLM falso
- **THEN** el prompt contiene días relativos y ninguna cadena que case con `\d{4}-\d{2}-\d{2}` [US-261 AC-5] [RN-11]
