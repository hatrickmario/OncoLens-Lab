## ADDED Requirements

### Requirement: Configuración tipada y validada al arranque
`clinical-api` y `rag-orchestrator` MUST leer toda configuración calibrable (RN-22) a través de un único módulo tipado por servicio (Zod en Node, Pydantic Settings en Python), cargado una vez antes de escuchar; ningún otro módulo SHALL leer el entorno directamente. Un valor ausente obligatorio o inválido MUST dejar el servicio sin quedar listo, con una línea de log JSON que nombra la variable y la regla incumplida y nunca su valor.

#### Scenario: Con el .env de referencia ambos servicios cargan su configuración [US-037 AC-1] [RN-22] [readme §1.4]
- **GIVEN** un entorno con los valores de readme §1.4 (`ENABLED_CANCER_TYPES`, `RELEVANCE_THRESHOLD`, TTL de sesión, *rate limits*, plazos de retención, `CLINICAL_CATALOG_VERSION`, `ANALYSIS_MEMORY_MAX`, `EVIDENCE_STALE_YEARS`, `AGENT_MAX_ITERATIONS`, `AGENT_MAX_SUBQUERIES`) y secretos ficticios
- **WHEN** arrancan `clinical-api` y `rag-orchestrator`
- **THEN** cada uno queda listo con su configuración cargada por su módulo tipado
- **AND** un test estático confirma que fuera de ese módulo no hay lecturas de `process.env` (Node) ni de `os.environ` (Python) en `src/` y `app/`, salvo la raíz de composición que lo invoca

#### Scenario: Un umbral fuera de rango impide arrancar [US-037 AC-2] [RN-22] (asumido)
- **GIVEN** `RELEVANCE_THRESHOLD=1.7`
- **WHEN** arranca `rag-orchestrator`
- **THEN** no queda listo, termina con código distinto de 0 y su log contiene una línea JSON con `variable = RELEVANCE_THRESHOLD` y la regla de rango, sin el valor `1.7`

#### Scenario: Un TTL no numérico impide arrancar [US-037 AC-2] [RN-22] (asumido)
- **GIVEN** `SESSION_IDLE_MINUTES=abc`
- **WHEN** arranca `clinical-api`
- **THEN** no escucha, termina con código 1 y el log registra `event = configuracion_invalida` con `variable = SESSION_IDLE_MINUTES`, la regla y `motivo = valor_invalido`, sin el valor `abc` y sin campo `valorInvalido`

### Requirement: Un único evento de configuración inválida con motivo cerrado
Todo fallo de configuración al arrancar, en ambos servicios, MUST registrarse con `event = configuracion_invalida`, `variable`, `regla` y `motivo` (enum cerrado: `valor_invalido`, `variable_ausente` y los que añadan otros changes, p. ej. `catalogo_no_disponible`). El valor MUST NOT registrarse, salvo en el campo cerrado `valorInvalido` para claves enum no sensibles (design D2).

#### Scenario: Un valor inválido de un enum no sensible se registra en el campo cerrado [US-037 AC-2] [RN-22] (asumido: excepción del Gate 1 del S2)
- **GIVEN** una clave de prueba declarada como enum no sensible con valores `mama | prostata` y el valor `leucemia`, y en otro caso el valor `Lucía Rondón`
- **WHEN** arranca `clinical-api`
- **THEN** no escucha y el log registra `event = configuracion_invalida`, `motivo = valor_invalido` y `valorInvalido = leucemia`
- **AND** con `Lucía Rondón` (no cumple el patrón) la línea no tiene `valorInvalido` ni contiene `Lucía`

### Requirement: La nube está deshabilitada por defecto
Sin `LLM_CLOUD_ENABLED` en el entorno, el valor efectivo en `rag-orchestrator` MUST ser `false` (RN-12).

#### Scenario: Sin la variable el proveedor en la nube queda deshabilitado [US-037 AC-6] [RN-12]
- **GIVEN** un entorno sin `LLM_CLOUD_ENABLED`
- **WHEN** arranca `rag-orchestrator` y el test lee la configuración efectiva
- **THEN** `llm_cloud_enabled` es `false`
