# Spec Delta — patient-chat (l1d-317-chat-caso-situacion)

## ADDED Requirements

### Requirement: El turno de caso responde con bloques enlazados a los datos del paciente
Un turno cuya intención es `caso` SHALL devolver bloques `kind=documentado` con ≥ 1 `factRef` válido del turno, y
Backend 1 SHALL resolver cada `factRef` a un `ConversationDataLink` (`factRef`, `resourceType`, `resourceId`, `origin`,
`relativeDay`, `recordedDate`). Backend 2 SHALL rellenar `notices[]` con los avisos de RN-19 y «Verifique contra las
fuentes». El `recordedDate` de un `ConversationDataLink` MUST salir del registro de Backend 1, nunca del LLM.

#### Scenario: Situación actual con enlaces y avisos
- **GIVEN** el paciente semilla (a) (FX-12-a), `doc1@test.local` con rol `doctor` y el LLM falso `CHAT-CASO-OK` con NLI `entailment`
- **WHEN** pregunta «¿Cuál es la situación actual de este paciente?»
- **THEN** el turno tiene `intent = "caso"`
- **AND** cada bloque tiene `kind = "documentado"` y ≥ 1 `factRef`
- **AND** cada `factRef` de los bloques tiene su `ConversationDataLink` en `dataLinks` con `resourceType`, `resourceId` y `origin`
- **AND** `notices`, rellenado por `rag-orchestrator`, incluye «Generado por IA; requiere validación clínica independiente por el oncólogo tratante», «Uso académico/investigación» y «Verifique contra las fuentes» [US-260 AC-1] [AC-02.5] [RN-19] [ADR-34]

### Requirement: Una afirmación del caso sin soporte NLI se omite
Toda afirmación del turno de caso MUST pasar el NLI con `entailment` contra la verbalización determinista de los hechos
que enlaza (ADR-34). Una afirmación que no lo pasa SHALL omitirse de los bloques y sumar 1 a `omittedClaims` (RN-01).

#### Scenario: Afirmación inventada omitida
- **GIVEN** el LLM falso `CHAT-CASO-INVENTA`, que añade «Recibió radioterapia adyuvante» con `factRefs = ["f2"]` y NLI `neutral` para esa afirmación
- **WHEN** se valida el turno de caso
- **THEN** «Recibió radioterapia adyuvante» no aparece en ningún bloque
- **AND** `omittedClaims = 1` [US-260 AC-2] [AC-02.5] [RN-01]

### Requirement: Una afirmación del caso sin enlace válido se omite sin evaluar
Una afirmación del turno de caso sin ningún `factRef` válido del turno SHALL omitirse, sumar 1 a `omittedClaims` y MUST
NOT enviarse al NLI.

#### Scenario: Afirmación sin factRefs
- **GIVEN** el LLM falso `CHAT-CASO-SIN-ENLACE`, con una afirmación sin `factRefs`
- **WHEN** se valida el turno de caso
- **THEN** la afirmación se omite y `omittedClaims = 1`
- **AND** el adapter NLI falso no registra ninguna evaluación de esa afirmación [US-260 AC-3] [AC-T1.2]

### Requirement: Los hechos del caso enviados a la IA van desidentificados
Backend 1 SHALL enviar a `rag-orchestrator` cada hecho del caso con un `factRef` opaco por turno, su verbalización
determinista (`verbalization`) y su día relativo (`relativeDay`, entero o `null`), y MUST NOT incluir identidad, texto libre sin enmascarar, UUID de recursos o del paciente
ni fechas absolutas. La tabla `factRef → recurso` MUST quedarse en Backend 1.

#### Scenario: caseFacts de P-CHAT sin identidad ni fechas absolutas
- **GIVEN** el paciente sintético `P-CHAT` (FX-12-b) con su nota de texto libre que contiene el nombre y el documento sintéticos
- **WHEN** se envía el turno de caso y MSW captura el cuerpo hacia `/chat/turn`
- **THEN** `caseFacts` no contiene «Lucía Prueba Chat», el documento sintético de `P-CHAT`, ningún UUID de recurso ni del paciente, ni fechas con formato `AAAA-MM-DD`
- **AND** cada hecho lleva un `factRef` opaco del turno (`f1`, `f2`…), su verbalización determinista y su día relativo [US-260 AC-4] [RN-10] [RN-11] [ADR-34]

### Requirement: Los hechos del caso excluyen los datos rechazados y reemplazados
`caseFacts` SHALL contener solo datos vigentes: un dato `rechazado` o `reemplazado` MUST NOT aparecer, y su corrección
vigente SHALL aparecer en su lugar (RN-07, ADR-50).

#### Scenario: HER2 reemplazado fuera, corrección vigente dentro
- **GIVEN** `P-CHAT` con HER2 `2+` `reemplazado` por la corrección `3+` con `supersedes_id`
- **WHEN** se arma `caseFacts`
- **THEN** no hay ningún hecho con HER2 `2+`
- **AND** hay un hecho con HER2 `3+` [US-260 AC-5] [AC-02.6] [RN-07]

### Requirement: La evolución de una serie se presenta en orden cronológico
Cuando el turno de caso enlaza varios valores de una misma serie, sus `ConversationDataLink` SHALL aparecer en orden ascendente de
día relativo, calculado en Backend 1 de forma determinista.

#### Scenario: Evolución del PSA en orden
- **GIVEN** el paciente semilla (b) con tres PSA fechados (FX-12-a)
- **WHEN** pregunta «¿Cómo ha evolucionado el PSA?»
- **THEN** los `ConversationDataLink` de los tres PSA aparecen en orden ascendente de día relativo [US-260 AC-6] [AC-02.4] (asumido en el orden de presentación)

### Requirement: Sin LLM local el turno de caso no responde ni recurre a la nube
Si el LLM local no está disponible en el turno de caso, `clinical-api` SHALL responder `503`, MUST NOT persistir el turno
y ningún adapter de nube MUST recibir llamadas (RN-12, RN-06).

#### Scenario: LLM local caído
- **GIVEN** el LLM falso `LLM-CAIDO`
- **WHEN** se envía el turno de caso
- **THEN** `clinical-api` responde `503`
- **AND** no existe fila nueva en `clinical.conversation_turn`
- **AND** ningún adapter de nube registra llamadas [US-260 AC-7] [RN-12] [RN-06]
