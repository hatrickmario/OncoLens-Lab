## ADDED Requirements

### Requirement: Peticiones del chat preparadas por `clinical-api` con el pipeline de producción

`clinical-api` SHALL ofrecer `npm run eval:chat-preparar`, que arma sobre la BD de test con el seed sintético el
`ChatTurnRequest` de cada caso y control de `chat-v1` con el pipeline de producción (desidentificación incluida) y lo
escribe en un directorio no versionado, junto con la traducción clave del seed → `factRef`. El comando MUST negarse a
correr con `REAL_*_ENABLED` o en entorno `piloto` y MUST NOT calcular métricas de faltantes.

#### Scenario: Prepara una petición válida por caso con sus hechos traducidos [US-269 AC-3] [M-02.1]
- **GIVEN** la BD de test con el seed sintético y `data/eval/chat-v1/`
- **WHEN** corre `npm run eval:chat-preparar`
- **THEN** escribe una `<id-del-caso>.json` por cada caso y control, con una `peticion` que cumple `ChatTurnRequest` del
  contrato de `rag-orchestrator` y un `hechosPorClave` que traduce cada clave de `hechos_esperados` a un `factRef`
  presente en esa petición
- **AND** `git status --porcelain` no lista ningún archivo del directorio de salida

#### Scenario: El marcador de identidad se resuelve y la petición sale desidentificada [US-269 AC-6] [RN-10] [RN-11]
- **GIVEN** el caso `CHAT-AC01-MAMA-PII` con el marcador `{identidad_sintetica:P-CHAT}`
- **WHEN** se prepara su petición
- **THEN** la `peticion` no contiene el nombre, el documento ni la fecha de nacimiento de `P-CHAT`, ni el marcador sin
  resolver, ni un `pseudoPatientId` repetido entre casos
- **AND** el campo `identidad` lleva los textos sintéticos que la suite debe contar, y solo existe en el directorio no
  versionado

#### Scenario: hechosPorClave solo lleva claves semánticas y factRefs [US-269 AC-6] [RN-10] [RN-11]
- **GIVEN** las peticiones preparadas de `chat-v1` y los identificadores de los recursos del paciente sembrado en `clinical-api`
- **WHEN** se inspecciona cada `<id-del-caso>.json`
- **THEN** las claves de `hechosPorClave` son las claves semánticas de `hechos_esperados` y sus valores son `factRef` de esa petición
- **AND** el archivo no contiene ningún identificador de recurso de `clinical-api` ni el mapa `factRef → recurso`, que no sale de Backend 1

#### Scenario: Se niega a correr si la base no es la de test sintética [RN-13] (asumido)
- **GIVEN** `APP_ENV` dentro de `SEED_ALLOWED_ENVS`, `REAL_*_ENABLED=false` y una base que no es la de test o que contiene un paciente que no es del seed sintético
- **WHEN** corre `npm run eval:chat-preparar`
- **THEN** termina con código distinto de 0, sin abrir las claves de identidad y sin escribir ninguna petición

#### Scenario: El residuo de una corrida interrumpida se borra al arrancar [US-269 AC-6] [RN-10] (asumido)
- **GIVEN** el directorio de salida con archivos de una corrida anterior terminada por SIGKILL
- **WHEN** corre `npm run eval:chat-preparar`
- **THEN** esos archivos ya no existen antes de que se escriba la primera petición, también si la guarda se niega a preparar
- **AND** el directorio de salida estaba en el `.gitignore` antes de que existiera el comando que lo escribe

#### Scenario: Se niega a correr con datos reales habilitados [RN-13] (asumido)
- **GIVEN** `REAL_ANONYMIZED_ENABLED=true`, `REAL_IDENTIFIED_ENABLED=true` o el entorno `piloto`
- **WHEN** corre `npm run eval:chat-preparar`
- **THEN** termina con código distinto de 0 nombrando la variable, sin abrir las claves de identidad y sin escribir
  ninguna petición

#### Scenario: Un caso cuyo paciente o hecho no está en el seed detiene la preparación [US-269 AC-3] (asumido)
- **GIVEN** un caso de `chat-v1` que nombra un paciente o una clave de `hechos_esperados` que el seed no tiene
- **WHEN** corre `npm run eval:chat-preparar`
- **THEN** termina con código distinto de 0 nombrando el id del caso y la clave, y no deja un conjunto parcial de
  peticiones en el directorio de salida

### Requirement: Comando `evaluate:chat` que encadena preparación y medición

El repositorio SHALL ofrecer `npm run evaluate:chat -- --config <yaml>`, que prepara las peticiones en `clinical-api`,
ejecuta la familia `chat` de `rag-orchestrator` sobre ellas, deja el JSON de la familia en `--salida` y borra las
peticiones temporales al terminar, también si falla. Con `proveedor: local` MUST usar solo la lista cerrada de
proveedores locales (RN-12). El tope del proceso se lee de `EVAL_TIMEOUT_S`.

#### Scenario: Con adapters falsos corre sin base de datos [US-269 AC-3] [AC-T5.1]
- **GIVEN** `eval/configs/chat-fake.yaml` y la opción `--sin-preparar`
- **WHEN** corre `npm run evaluate:chat`
- **THEN** la familia `chat` usa los ejemplos del contrato como peticiones, publica el reporte con `proveedor: fake` y
  devuelve el código de salida de la familia

#### Scenario: Con modelos locales mide sobre las peticiones de producción [US-269 AC-3] [US-269 AC-7] [M-02.3]
- **GIVEN** `eval/configs/chat-local.yaml`, la BD de test con el seed, los pesos de ADR-39 en el entorno y el LLM local
  en marcha
- **WHEN** corre `npm run evaluate:chat`
- **THEN** la familia recibe las peticiones preparadas por `clinical-api`, escribe `chat.json` en `--salida` y, al
  terminar, el directorio de peticiones temporales no existe

#### Scenario: Sin peticiones o sin pesos no escribe cifras [US-269 AC-3] (asumido)
- **GIVEN** `chat-local.yaml` con `--sin-preparar`, o sin las variables de pesos de ADR-39
- **WHEN** corre `npm run evaluate:chat`
- **THEN** termina con código 2 nombrando lo que falta y no escribe ningún reporte en `--salida`

#### Scenario: Una URL de nube aborta antes de cualquier petición [RN-12]
- **GIVEN** una configuración con `proveedor: local` cuya URL del LLM no es un host local
- **WHEN** corre `npm run evaluate:chat`
- **THEN** termina con código distinto de 0 sin enviar ninguna petición a ese host y sin escribir reporte

#### Scenario: El LLM local no responde [US-269 AC-3] (asumido)
- **GIVEN** `chat-local.yaml` y el LLM local detenido
- **WHEN** corre `npm run evaluate:chat`
- **THEN** termina con código distinto de 0 nombrando la dependencia caída, no escribe un reporte con cifras parciales y
  borra las peticiones temporales

### Requirement: Salidas prescriptivas e identidad en el reporte del chat y en el código de salida

El reporte de `evaluate:chat` MUST publicar el conteo de salidas prescriptivas y el de apariciones de identidad (estado
del hilo y *logs*), también cuando valen 0. Si alguno de los dos no es 0, el comando SHALL terminar con código distinto
de 0 (RN-23, RN-10).

#### Scenario: Ambos conteos en 0 figuran en el reporte y el comando termina bien [US-269 AC-5] [US-269 AC-6] [RN-23] [RN-10]
- **GIVEN** una corrida de `evaluate:chat` con adapters falsos sobre las peticiones preparadas, en la que ningún turno muestra un término prohibido ni la identidad sintética
- **WHEN** se genera el reporte
- **THEN** publica salidas prescriptivas = 0 y apariciones de identidad = 0 en el estado del hilo y en los *logs*
- **AND** el comando termina con código 0

#### Scenario: La corrida con modelos locales publica los conteos tal como salen [US-269 AC-5] [US-269 AC-6] [RN-23] [RN-10]
- **GIVEN** una corrida de `evaluate:chat` con `proveedor: local`
- **WHEN** se genera el reporte
- **THEN** publica las salidas prescriptivas y las apariciones de identidad con el valor medido, sin texto ni identidad
- **AND** el código de salida sigue la misma regla: distinto de 0 si alguno no es 0

#### Scenario: Un conteo distinto de 0 hace fallar el comando [US-269 AC-5] [US-269 AC-6] [RN-23] [RN-10]
- **GIVEN** una corrida con adapters falsos en la que un turno muestra una salida prescriptiva, o en la que la identidad sintética aparece en el estado del hilo o en los *logs*
- **WHEN** corre `npm run evaluate:chat`
- **THEN** el reporte publica ambos conteos, con el que no es 0, y solo ids de caso, sin texto ni identidad
- **AND** el comando termina con código distinto de 0

### Requirement: Corpus, umbrales y autoría del reporte del chat

La medición del chat con modelos locales MUST usar como corpus la ingesta de `l1d-119`, el mismo en la corrida base y en
la final (`[S7 resp. 10]`), y los umbrales de `Settings`, sin duplicarlos en `chat-local.yaml` (RN-22, `[S7 resp. 11]`).
`ai-eval-runner` SHALL versionar el `chat.json` de la familia como `reports/eval/l1d-326-chat-v1.json` y escribir
`reports/eval/l1d-326-chat-v1.md`.

#### Scenario: El reporte declara el corpus y los umbrales efectivos [US-269 AC-3] [RN-22] [S7 resp. 10] [S7 resp. 11]
- **GIVEN** `chat-local.yaml` sin bloque de umbrales y el corpus de la ingesta de `l1d-119` cargado
- **WHEN** corre `evaluate:chat` con modelos locales
- **THEN** la familia toma `RELEVANCE_THRESHOLD`, `NLI_ENTAILMENT_THRESHOLD` y `RETRIEVAL_TOP_K` de `Settings`
- **AND** el reporte registra esos valores efectivos y el corpus medido

#### Scenario: El JSON y el Markdown versionados tienen nombre y autor fijos [US-269 AC-3] (asumido)
- **GIVEN** una corrida terminada que dejó `chat.json` en el directorio de `--salida`
- **WHEN** `ai-eval-runner` versiona el resultado con `run-ai-eval`
- **THEN** `reports/eval/l1d-326-chat-v1.json` es ese `chat.json` sin modificar y `reports/eval/l1d-326-chat-v1.md` resume solo los agregados de ese JSON
- **AND** ni `evaluate:chat` ni la familia `chat` escriben directamente en `reports/eval/`

### Requirement: Reporte versionado del chat con modelos locales

Toda cifra del chat con modelos locales MUST provenir de `reports/eval/l1d-326-chat-v1.{json,md}`, producido por
`run-ai-eval` con `chat-local.yaml`. El reporte SHALL declarar `proveedor`, el reloj usado, los modelos, la huella de la
configuración, la versión de los prompts del chat, `catalogVersion` y el corpus medido, y MUST listar como no medidas,
con valor `null`, las métricas de faltantes.

#### Scenario: El reporte de la corrida real trae las métricas del caso y la latencia [US-269 AC-3] [US-269 AC-7] [M-02.1] [M-02.3]
- **GIVEN** una corrida terminada de `evaluate:chat` con `chat-local.yaml`
- **WHEN** `run-ai-eval` escribe el reporte
- **THEN** publica, para `mama` y `prostata`, la proporción de afirmaciones mostradas con soporte NLI, la precisión de
  los enlaces, los hechos esperados presentes y las afirmaciones omitidas, y el p95 por turno y por `intent`
- **AND** declara `proveedor: local`, reloj `real`, modelos, huella, versión de los prompts, `catalogVersion` y corpus

#### Scenario: Las métricas de faltantes van como no medidas [US-269 AC-4] (asumido)
- **GIVEN** cualquier corrida de la familia `chat` de este alcance
- **WHEN** se genera el reporte
- **THEN** la sensibilidad, la especificidad y la exactitud de `gapType` valen `null` y figuran en la lista de métricas
  no medidas, nunca `0.0`

#### Scenario: El reporte no contiene texto ni identidad [US-269 AC-6] [RN-10] [RN-14]
- **GIVEN** el reporte de la corrida real
- **WHEN** corre el escaneo de PII de la CI sobre `reports/eval/`
- **THEN** no hay hallazgos: el reporte lleva agregados e ids de caso, sin preguntas, respuestas ni textos de identidad

#### Scenario: La revisión clínica pendiente se declara y no bloquea [US-269 AC-8] [S7 resp. 1]
- **GIVEN** `chat-v1` con casos en `revision_oncologo: pendiente`
- **WHEN** se genera el reporte de la corrida real
- **THEN** ninguna métrica lleva el rótulo «validada» y los ids pendientes aparecen listados

## MODIFIED Requirements

### Requirement: Latencia por turno e intención para la revisión de ADR-51

La familia `chat` SHALL publicar el p95 de latencia por turno y por `intent`, sin umbral bloqueante, para la revisión de
ADR-51, y MUST declarar en el reporte el reloj usado (`real` o `simulado`). Solo una corrida con reloj `real` y modelos
locales cuenta como medición de latencia.

#### Scenario: El reporte publica el p95 por intención sin bloquear [US-269 AC-7] [ADR-51] (asumido)
- **GIVEN** una corrida con `chat-local.yaml` terminada
- **WHEN** se genera el reporte
- **THEN** publica el p95 total por turno y el p95 de cada `intent` presente, rotulados como informativos
- **AND** ningún valor de latencia cambia el código de salida de la corrida

#### Scenario: Con reloj simulado la latencia no cuenta como medición [US-269 AC-7] (asumido)
- **GIVEN** una corrida con `chat-fake.yaml`
- **WHEN** se genera el reporte
- **THEN** declara reloj `simulado` y `proveedor: fake`, y su latencia va rotulada como simulada
