# Spec Delta — evidence-panel (l1d-332-aviso-ampliacion-visible)

## ADDED Requirements

### Requirement: Los avisos del turno de evidencia se ven junto al encabezado de las opciones
En una tarjeta del chat con `evidenceAnalysis` y opciones, el panel SHALL pintar cada entrada de `turn.notices[]`, tal como llegó, inmediatamente después del encabezado «Opciones descritas en la evidencia» y antes de las tarjetas de opción, sin expandir ni abrir nada. `web` MUST NOT añadir, traducir ni reescribir avisos de IA (RN-19), MUST NOT pintar un `notices[]` vacío como válido cuando hay contenido generado y MUST NOT dejar espacio ni recuadro vacíos cuando no hay aviso de ampliación.

#### Scenario: Aviso de ampliación visible antes de las opciones
- **GIVEN** un turno de evidencia con `contextExpansion` y, en `notices[]`, «La búsqueda se amplió con datos del caso: tipo, estadio y biomarcador» (`chat-turn-evidencia-contextual.json`)
- **WHEN** se renderiza la tarjeta del turno
- **THEN** el aviso aparece después del encabezado «Opciones descritas en la evidencia» y antes de la primera tarjeta de opción
- **AND** está visible sin pulsar «Expandir todo» y su texto es el recibido [US-274 AC-1] [RN-19] [AC-T3.1]

#### Scenario: Los avisos de IA salen solo del turno
- **GIVEN** un turno con `notices[]` con un texto sintético distinto del de configuración, y otro con bloques generados y `notices = []`
- **WHEN** se renderizan
- **THEN** el primero muestra solo el texto recibido y ningún aviso añadido por `web`
- **AND** el segundo no pinta el contenido y muestra el aviso «Respuesta sin los avisos de IA requeridos» [US-274 AC-3] [RN-19]

#### Scenario: Sin ampliación no hay aviso ni hueco
- **GIVEN** un turno de evidencia sin `contextExpansion` y con solo los dos avisos de RN-19
- **WHEN** se renderiza
- **THEN** no aparece el aviso de ampliación y el recuadro de avisos no contiene entradas vacías [US-274 AC-4] [RN-19]

### Requirement: Evidencia recuperada sin opciones soportadas con sus limitaciones visibles
En una tarjeta del chat con `evidenceAnalysis` y bloques `limitacion`, el panel SHALL pintar esos bloques sin plegar bajo el rótulo «Alcance de la respuesta», con el mensaje «Evidencia recuperada sin opciones soportadas» y el alcance de la recuperación tal como llegaron, y MUST NOT pintar el turno como respuesta con opciones (sin el encabezado «Opciones descritas en la evidencia»).

#### Scenario: Recuperado sin opciones
- **GIVEN** un turno con el bloque `limitacion` «Evidencia recuperada sin opciones soportadas» y su alcance (`chat-turn-evidencia-sin-opciones.json`)
- **WHEN** se renderiza
- **THEN** el mensaje y el alcance están visibles, bajo «Alcance de la respuesta», sin ningún `<details>` cerrado que los contenga
- **AND** no hay encabezado «Opciones descritas en la evidencia» ni tarjetas de opción [US-274 AC-2] [RN-01] [RN-23]

#### Scenario: Recorrido E2E sobre el chat falso
- **GIVEN** Compose con `LLM_PROVIDER=fake`, seed sintético y las preguntas literales que el fake sirve para los ejemplos contextual y sin opciones
- **WHEN** `doc1@test.local` las envía en el chat, a 375 y a 1280 px
- **THEN** el aviso de ampliación y el mensaje «Evidencia recuperada sin opciones soportadas» son visibles sin interacción [US-274 AC-5] [AC-T3.1]
