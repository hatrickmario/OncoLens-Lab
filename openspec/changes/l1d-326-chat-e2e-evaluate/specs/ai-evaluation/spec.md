## ADDED Requirements

### Requirement: Dataset sintético del chat `chat-v1`

`data/eval/chat-v1/` MUST declarar `clase: sintetico` y contener ≥ 12 casos que cubren AC01…AC06 × {mama, próstata}.
Cada caso SHALL tener pregunta, `intent` esperado, respuesta esperada, hechos esperados (por clave del seed) o criterios
esperados y `revision_oncologo`. El dataset MUST NOT contener literales de identidad: la identidad de una pregunta con
PII se referencia con un marcador que la suite resuelve desde el seed.

#### Scenario: El dataset cubre AC01…AC06 por tipo de cáncer [US-269 AC-2] [RN-13] [RN-14]
- **GIVEN** `data/eval/chat-v1/`
- **WHEN** el cargador de la familia `chat` lo valida
- **THEN** el manifiesto declara `clase: sintetico` y hay ≥ 1 caso por cada par (AC01…AC06, mama | próstata), ≥ 12 en
  total, cada uno con respuesta esperada y hechos o criterios esperados

#### Scenario: El escaneo de PII de la CI no encuentra nada en el dataset [US-269 AC-2] [RN-14]
- **GIVEN** el caso de FX-12-d guardado con el marcador `{identidad_sintetica:P-CHAT}`
- **WHEN** corre el escaneo de PII de la CI sobre `data/eval/chat-v1/`
- **THEN** no reporta ningún hallazgo y la *allowlist* no tiene entradas nuevas para este dataset

### Requirement: Fidelidad del caso reconstruido en el chat por tipo de cáncer

La familia `chat` de `evaluate` SHALL publicar, por tipo de cáncer y sobre los turnos de AC01 y AC02, la proporción de
afirmaciones mostradas con soporte NLI y la precisión de los enlaces (enlaces que apuntan a un hecho esperado sobre el
total de enlaces de afirmaciones mostradas), además de los hechos esperados presentes. Las afirmaciones omitidas MUST
contarse aparte.

#### Scenario: El reporte publica soporte y precisión de enlaces por tipo de cáncer [US-269 AC-3] [M-02.1] [M-02.3]
- **GIVEN** los casos AC01 y AC02 de mama y próstata de `chat-v1` y las peticiones preparadas por `clinical-api`
- **WHEN** corre `evaluate` con `eval/configs/chat-local.yaml` (modelos locales)
- **THEN** el reporte publica, para `mama` y `prostata`, la proporción de afirmaciones mostradas con soporte NLI, la
  precisión de los enlaces, la proporción de hechos esperados presentes y el número de afirmaciones omitidas
- **AND** el reporte declara los modelos, la versión de los prompts del chat y `catalogVersion`

### Requirement: Sensibilidad y especificidad de los faltantes sembrados

La familia `chat` MUST medir en `clinical-api`, de forma determinista sobre pacientes sintéticos con faltantes sembrados,
la sensibilidad (faltantes sembrados detectados), la especificidad (datos presentes no marcados como faltantes) y la
exactitud de `gapType` frente a lo sembrado, y SHALL publicarlas en el mismo reporte.

#### Scenario: El reporte publica M-04.1, M-04.2 y la exactitud de gapType [US-269 AC-4] [M-04.1] [M-04.2]
- **GIVEN** `P-CHAT` con el catálogo FX-12-c (Ki-67 `no_buscado`, menopausia `no_encontrado`, RE `incompleto`, TNM
  `por_conciliar`) y los pacientes (b) y (e) con sus faltantes sembrados declarados en `chat-v1`
- **WHEN** corre `evaluate` de la familia `chat`
- **THEN** el reporte publica la sensibilidad, la especificidad y la exactitud de `gapType` por tipo de cáncer
- **AND** con el seed actual la exactitud de `gapType` de `P-CHAT` es 4/4

### Requirement: Cero salidas prescriptivas en los turnos del chat

Todo el texto mostrado de todos los turnos generados en una corrida de la familia `chat` MUST evaluarse con el filtro y
la lista de términos prohibidos de producción (RN-23); el número de salidas prescriptivas SHALL ser 0 y, si no lo es,
la corrida termina con código distinto de 0.

#### Scenario: Ningún turno contiene términos prohibidos [US-269 AC-5] [RN-23]
- **GIVEN** todos los turnos de la corrida de `chat-v1`
- **WHEN** se evalúan contra la lista de términos prohibidos
- **THEN** el reporte publica 0 salidas prescriptivas

#### Scenario: Una salida prescriptiva hace fallar la corrida [US-269 AC-5] [RN-23]
- **GIVEN** `chat-fake.yaml` con el guion `CHAT-PRESCRIPTIVO` (FX-12-e) inyectado como salida cruda del LLM
- **WHEN** corre la familia `chat`
- **THEN** la afirmación «debe recibir trastuzumab» no se muestra y el contador de salidas prescriptivas mostradas es 0
- **AND** si el filtro se desactivara en la configuración de prueba, la corrida terminaría con código distinto de 0

### Requirement: Identidad ausente del estado del hilo y de los logs en la suite del chat

La familia `chat` SHALL contar las apariciones de la identidad sintética en el estado del hilo y en los *logs* capturados
durante la corrida, y MUST publicar solo los conteos.

#### Scenario: La suite publica 0 apariciones de identidad [US-269 AC-6] [RN-10] [RN-11]
- **GIVEN** el caso con PII sembrada de `chat-v1` (FX-12-d)
- **WHEN** corre la suite
- **THEN** el reporte publica 0 apariciones de la identidad sintética en el estado del hilo y en los *logs* capturados
- **AND** el reporte no contiene la identidad ni el texto de la pregunta

### Requirement: Latencia por turno e intención para la revisión de ADR-51

La familia `chat` SHALL publicar el p95 de latencia por turno y por `intent`, sin umbral bloqueante, para la revisión de
ADR-51 en el cierre del S6.

#### Scenario: El reporte publica el p95 por intención sin bloquear [US-269 AC-7] [ADR-51] (asumido)
- **GIVEN** una corrida con `chat-local.yaml` terminada
- **WHEN** se genera el reporte
- **THEN** publica el p95 total por turno y el p95 de cada `intent` presente, rotulados como informativos
- **AND** ningún valor de latencia cambia el código de salida de la corrida

### Requirement: Rótulo de revisión clínica por caso del chat

Cada caso de `chat-v1` MUST llevar `revision_oncologo` con valor `pendiente` o `aprobado`; una métrica SHALL rotularse
«validada» solo sobre casos `aprobado`, y los casos `pendiente` se listan por id en el reporte como deuda, sin bloquear.

#### Scenario: Un caso sin revision_oncologo se rechaza [US-269 AC-8] (asumido)
- **GIVEN** un caso de `chat-v1` sin el campo `revision_oncologo`
- **WHEN** el cargador valida el dataset
- **THEN** termina con código distinto de 0 sin calcular métricas

#### Scenario: Los casos pendientes quedan como deuda sin bloquear [US-269 AC-8] [S6 resp. 12] (asumido)
- **GIVEN** `chat-v1` con todos los casos en `revision_oncologo: pendiente`
- **WHEN** corre la suite y se cierra la historia
- **THEN** ninguna métrica lleva el rótulo «validada», el reporte lista los ids pendientes y la corrida termina con
  código 0 si se cumplen RN-23 y la no fuga
- **AND** los pendientes se registran como deuda en el cierre del S6
