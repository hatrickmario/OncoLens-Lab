# Spec Delta — patient-chat (l1d-319-chat-contradicciones)

## ADDED Requirements

### Requirement: El chat muestra cada contradicción con los dos valores y sus fuentes
Cuando el oncólogo pregunta por contradicciones del expediente, el turno de caso SHALL devolver un bloque
`kind = "conflicto"` por cada par de registros en conflicto que calculó Backend 1 (`CaseFact.conflictWith`), con los dos
valores, sus días relativos, la etiqueta «Por conciliar» en su texto y los `factRefs` de ambos registros, cada uno
resuelto a un `ConversationDataLink`. Backend 2 MUST componer el bloque con una función pura, sin LLM, y MUST NOT elegir
un valor (RN-08).

#### Scenario: Estadios IIA y IIB en conflicto
- **GIVEN** el paciente sintético `P-CHAT` (FX-12-b) con `stage_value = IIA` (día relativo 0) y `stage_value = IIB` (día relativo +10) `requiere_revision` con `conflicts_with_id` al primero, y `doc1@test.local` con rol `doctor`
- **WHEN** pregunta «¿Hay contradicciones en el expediente?»
- **THEN** la respuesta tiene un bloque `kind = "conflicto"` cuyo texto contiene «Por conciliar», los valores IIA e IIB y sus momentos relativos («al momento del diagnóstico» y «10 días después del diagnóstico»)
- **AND** el bloque tiene los `factRefs` de los dos registros de estadio y cada uno tiene su `ConversationDataLink` en `dataLinks`
- **AND** el LLM falso de generación no registra llamadas para componer el bloque [US-262 AC-1] [RN-08] [S6-prompt §2.A]

### Requirement: La IA no resuelve un conflicto del expediente
Una afirmación del LLM que enlaza a un hecho marcado en conflicto (`conflictWith`) sin enlazar también a su contraparte
SHALL omitirse antes del NLI y sumar 1 a `omittedClaims`. El aviso de conflicto MUST NOT bloquear el turno (RN-26).

#### Scenario: «El estadio correcto es IIB» se omite
- **GIVEN** `P-CHAT` y el LLM falso `CHAT-CONFLICTO-RESUELVE` (FX-12-e), que devuelve «El estadio correcto es IIB» con `factRefs` solo al registro IIB
- **WHEN** se valida el turno de caso
- **THEN** «El estadio correcto es IIB» no aparece en ningún bloque
- **AND** `omittedClaims` suma 1 por esa afirmación y el NLI falso no la evalúa [US-262 AC-2] [AC-T3.2] [RN-26]

### Requirement: Un dato corregido se marca y enlaza a su histórico sin enviar el valor reemplazado
Un hecho vigente que reemplazó a otro (`supersedes_id`, ADR-50) SHALL llevar `corrected = true` en `caseFacts` y el
sufijo «(corregido)» en su `verbalization`, y su `ConversationDataLink` SHALL llevar el `resourceType` y el `resourceId`
del registro vigente, de los que la UI deriva la ruta del histórico. La respuesta MUST NOT incluir una ruta de histórico
(`historyPath`). El valor reemplazado MUST NOT viajar a `rag-orchestrator` (RN-07).

#### Scenario: HER2 corregido de 2+ a 3+
- **GIVEN** `P-CHAT` con HER2 `2+` (día −180) `reemplazado` por la corrección `3+` (día −170) con `supersedes_id`
- **WHEN** el oncólogo pregunta «¿Cuál es el HER2 de la paciente?» y MSW captura el cuerpo hacia `/chat/turn`
- **THEN** el bloque muestra `3+` con la marca «(corregido)»
- **AND** el hecho del HER2 en el cuerpo enviado a `/chat/turn` tiene `corrected = true`
- **AND** el `ConversationDataLink` del bloque tiene el `resourceType` del biomarcador y el `resourceId` del `3+`, sin `historyPath`
- **AND** el cuerpo enviado a `/chat/turn` no contiene el valor `2+` [US-262 AC-3] [ADR-50] [RN-07] [AC-02.6]

### Requirement: Sin contradicciones el chat lo dice sin invocar al LLM
Si la pregunta es de contradicciones y ningún hecho de `caseFacts` está marcado en conflicto, el turno SHALL responder el
texto de configuración «No hay contradicciones registradas en el expediente», seguido de su alcance «Se revisaron los diagnósticos y biomarcadores del expediente», y MUST NOT invocar al LLM de generación.

#### Scenario: Paciente sin conflictos
- **GIVEN** el paciente semilla (a) (FX-12-a), sin registros en conflicto, y el LLM falso que cuenta invocaciones
- **WHEN** pregunta «¿Hay contradicciones?»
- **THEN** la respuesta empieza por «No hay contradicciones registradas en el expediente» y añade «Se revisaron los diagnósticos y biomarcadores del expediente»
- **AND** el LLM falso de generación registra cero llamadas [US-262 AC-4] [RN-08]

#### Scenario: Marca de conflicto sin contraparte
- **GIVEN** un hecho marcado en conflicto cuya contraparte no está entre los hechos del turno
- **WHEN** el oncólogo pregunta por contradicciones
- **THEN** el turno no responde «No hay contradicciones»: declara que hay datos marcados en conflicto cuya contraparte no está entre los datos consultados [RN-08]

### Requirement: Un turno del chat nunca modifica el expediente
El turno de chat SHALL ser de solo lectura sobre los datos clínicos: MUST NOT cambiar `review_status`,
`conflicts_with_id` ni `supersedes_id` de ningún registro del paciente, ni crear o borrar registros clínicos.

#### Scenario: Estado de revisión intacto tras el turno
- **GIVEN** `P-CHAT` y una instantánea de `review_status`, `conflicts_with_id` y `supersedes_id` de todos sus registros clínicos
- **WHEN** termina un turno con «¿Hay contradicciones en el expediente?» y otro con `CHAT-CONFLICTO-RESUELVE`
- **THEN** los tres campos de todos sus registros son iguales a la instantánea y el número de registros clínicos no cambia [US-262 AC-5] [AC-T3.2] [S6-prompt §3]
