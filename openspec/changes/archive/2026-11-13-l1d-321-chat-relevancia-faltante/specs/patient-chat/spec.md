# Spec Delta — patient-chat (l1d-321-chat-relevancia-faltante)

## ADDED Requirements

### Requirement: La relevancia de un dato faltante se explica con el catálogo y la evidencia citada
Un turno `faltantes` con subintención `relevancia` SHALL identificar el dato crítico con reglas deterministas sobre el
catálogo vigente, SHALL devolver un bloque determinista `kind = "catalogo"` con los criterios de aplicabilidad cuyo
`destination` coincide con el del dato y SHALL devolver la explicación generada por el LLM en bloques
`kind = "evidencia"`, cada uno con ≥ 1 `ChatCitation` a un chunk recuperado en el turno y NLI `entailment`; una
explicación sin soporte MUST omitirse.

#### Scenario: Estado menopáusico con su criterio del catálogo real y evidencia citada
- **GIVEN** `P-CHAT` (FX-12-b) tras el turno de faltantes, el catálogo real `packages/clinical-catalogs/mama/aplicabilidad.json` (1.1.0), el corpus FX-06a-a y un LLM falso que devuelve una afirmación sobre el estado menopáusico con cita a un chunk recuperado en ese turno y NLI `entailment`
- **WHEN** el oncólogo pregunta «¿Por qué importa el estado menopáusico?»
- **THEN** la respuesta tiene un bloque `kind = "catalogo"` con el criterio `estado_menopausico` de `aplicabilidad.json`
- **AND** un bloque `kind = "evidencia"` con esa `ChatCitation` [US-264 AC-1] [RN-01] [RN-29] [S6 resp. 7]

#### Scenario: Ki-67: dato crítico sin criterio de aplicabilidad en el catálogo real
- **GIVEN** `P-CHAT` (FX-12-b) y el catálogo real de mama, donde `ki67` está en `datos-criticos.json` y ningún criterio de `aplicabilidad.json` tiene su `destination`
- **WHEN** el oncólogo pregunta «¿Por qué importa el Ki-67?»
- **THEN** la respuesta tiene un bloque `kind = "catalogo"` con el texto fijo de configuración que dice que es un dato crítico del catálogo vigente y que ningún criterio de aplicabilidad del catálogo vigente lo usa, sin ningún otro contenido clínico
- **AND** toda explicación adicional solo aparece como bloque `kind = "evidencia"` con `ChatCitation` y NLI `entailment` [US-264 AC-1] [RN-29] [RN-01] (asumido en el texto fijo)

### Requirement: Una explicación de relevancia sin soporte NLI se omite
Toda afirmación del turno de relevancia MUST pasar el NLI con `entailment` contra los chunks que cita. La que no lo pasa
SHALL omitirse y sumar 1 a `omittedClaims`; si no queda ninguna, la respuesta SHALL incluir un bloque determinista
`kind = "limitacion"` que diga que la evidencia recuperada no explica la relevancia del dato, junto al bloque `catalogo`.

#### Scenario: Única afirmación con NLI neutral
- **GIVEN** un LLM falso cuya única afirmación tiene NLI `neutral`
- **WHEN** se valida el turno de relevancia
- **THEN** la afirmación se omite y `omittedClaims = 1`
- **AND** la respuesta tiene un bloque `kind = "limitacion"` con «La evidencia recuperada no explica la relevancia de este dato» junto al bloque `catalogo` [US-264 AC-2] [RN-01] [S6 resp. 7]

### Requirement: Sin evidencia sobre el umbral la relevancia no invoca al LLM de generación
Si ningún chunk supera el umbral de relevancia (clave de configuración existente) tras el único bucle de reescritura, el
turno de relevancia MUST NOT invocar al LLM de generación y SHALL responder solo con el bloque `catalogo` y el aviso
«sin evidencia».

#### Scenario: Sin chunks sobre el umbral
- **GIVEN** que ningún chunk supera el umbral tras el único bucle de reescritura
- **WHEN** se procesa la pregunta de relevancia
- **THEN** el LLM de generación registra cero llamadas
- **AND** la respuesta tiene solo el bloque `catalogo` y el aviso «sin evidencia» [US-264 AC-3] [RN-02]

### Requirement: Una explicación de relevancia prescriptiva se omite
Una afirmación del turno de relevancia que contiene un término de la lista de términos prohibidos MUST omitirse aunque
tenga cita válida y NLI `entailment`, y SHALL sumar 1 a `omittedClaims`.

#### Scenario: «debe solicitarse» con cita y entailment
- **GIVEN** un LLM falso que devuelve «El Ki-67 debe solicitarse antes de cualquier tratamiento» con cita válida y NLI `entailment`
- **WHEN** se valida el turno de relevancia
- **THEN** la afirmación se omite por la lista de términos prohibidos
- **AND** `omittedClaims` aumenta en 1 [US-264 AC-4] [RN-23]

### Requirement: Un dato fuera del catálogo no recibe explicación de relevancia
Si la pregunta de relevancia no corresponde a ningún dato de `datos-criticos` del tipo de cáncer, la respuesta SHALL
decir que no es un dato crítico del catálogo vigente, MUST NOT llevar bloque `catalogo` y MUST NOT invocar al LLM de
generación.

#### Scenario: CA 15-3 no está en el catálogo
- **GIVEN** la pregunta «¿Por qué importa el CA 15-3?», que no está en `datos-criticos`
- **WHEN** se procesa
- **THEN** la respuesta dice que no es un dato crítico del catálogo vigente
- **AND** no lleva bloque `catalogo` (asumido) [US-264 AC-5]

### Requirement: La explicación de relevancia solo cita chunks recuperados en el turno
Una afirmación del turno de relevancia cuya cita apunta a un chunk recuperado en un turno anterior y no en el actual
MUST omitirse y sumar 1 a `omittedClaims`; la memoria de turnos previos nunca es cita ni soporte.

#### Scenario: Cita a un chunk de un turno anterior
- **GIVEN** una afirmación que cita un chunk recuperado en un turno anterior y no en este
- **WHEN** se valida el turno de relevancia
- **THEN** la afirmación se omite
- **AND** `omittedClaims` aumenta en 1 [US-264 AC-6] [RN-04] [RN-24]
