## ADDED Requirements

### Requirement: Lista versionada de términos prescriptivos prohibidos en dos niveles
La lista de RN-23 MUST vivir en `packages/clinical-catalogs/lenguaje/terminos-prohibidos.json` (1.1.0, `[S1 resp. 15]`) con `version`, `normalizacion`, un **Nivel A** de términos (salida generada y UI), un **Nivel B** de prefijos (solo textos propios de UI, prompts y contratos) y `frasesPermitidas` (solo textos propios). Los backends SHALL leerla de solo lectura desde `CLINICAL_CATALOG_PATH`.

#### Scenario: La lista cargada contiene los términos de RN-23 y los de S1 resp. 15 [US-068 AC-1] [AC-10.3] [RN-23]
- **GIVEN** la lista versionada `packages/clinical-catalogs/lenguaje/terminos-prohibidos.json`
- **WHEN** `loadProhibitedTerms()` la carga
- **THEN** devuelve `version` "1.1.0" y un Nivel A que incluye "recomendado para este paciente", "debe recibir", "el mejor tratamiento", "indicado para usted", "recommended for this patient", "should receive", "the best treatment" e "indicated for you"
- **AND** el Nivel A incluye además "deben recibir", "debería recibir", "se sugiere iniciar", "tratamiento indicado", "mejor opción", "usted debe", "you should", "the patient should", "indicated for this patient", "probabilidad de éxito" y "chance of success" `[S1 resp. 15]`
- **AND** el Nivel A conserva de la lista provisional del Pre-S1 "opción preferida", "tratamiento de elección" y "tratamiento óptimo"
- **AND** el Nivel B contiene los prefijos `recomend` y `recommend`
- **AND** cada término o prefijo tiene un `id` único entre niveles e `idioma`

### Requirement: La carga de la lista falla cerrada
Una lista ausente, ilegible o que no cumpla su esquema MUST producir un error que nombre el archivo y SHALL NOT tratarse como lista vacía por ningún consumidor.

#### Scenario: Una lista ausente o inválida falla cerrada [US-068 AC-1] [RN-23] (asumido)
- **GIVEN** una ruta de lista inexistente, o un archivo sin `terminos`
- **WHEN** `loadProhibitedTerms()` intenta cargarla
- **THEN** lanza un error que nombra el archivo
- **AND** ningún consumidor (lint, tests, validador de L1D-180) continúa con una lista vacía

### Requirement: Verificador de términos prohibidos con normalización común en Node y Python
`checkProhibitedTerms(texto, lista, { niveles, permitirFrases })` MUST ser puro y devolver `id` y nivel por cada aparición. MUST normalizar texto y términos (minúsculas, sin diacríticos, puntuación → espacio, espacios colapsados) y, en el Nivel A, comparar secuencias completas de claves flexivas que cubren plural, género y enclíticos `[S1 resp. 15]`. Por defecto MUST aplicar solo el Nivel A, sin `frasesPermitidas`.

#### Scenario: Las variantes de mayúsculas, tildes y puntuación coinciden [US-068 AC-2] [RN-23]
- **GIVEN** la lista versionada y el verificador `checkProhibitedTerms`
- **WHEN** recibe por separado "RECOMENDADO PARA ESTE PACIENTE", "Recomendado para este paciente." y "debe recibir" escrito sin tildes ni mayúsculas
- **THEN** devuelve exactamente una coincidencia por cada texto, con el `id` del término correspondiente

#### Scenario: Plural, género y enclíticos coinciden [US-068 AC-2] [RN-23] [S1 resp. 15]
- **GIVEN** la lista versionada y el verificador `checkProhibitedTerms`
- **WHEN** recibe por separado "deben recibir", "recomendada para esta paciente", "debe recibirlo" y "debe recibirse"
- **THEN** devuelve exactamente una coincidencia por texto: `es-deben-recibir`, `es-recomendado-para-este-paciente`, `es-debe-recibir` y `es-debe-recibir`

#### Scenario: Los literales de retirada no coinciden [US-068 AC-2] [RN-23] [S1 resp. 16]
- **GIVEN** la lista versionada y el verificador con los niveles A y B
- **WHEN** recibe "[afirmación retirada: formulación no permitida]" y "[claim removed: disallowed wording]"
- **THEN** devuelve cero coincidencias en ambos

#### Scenario: La raíz recomend solo se aplica cuando se pide el Nivel B [US-068 AC-5] [RN-23] [S1 resp. 15]
- **GIVEN** el texto "La guía recomienda el esquema X"
- **WHEN** se verifica con el Nivel A (salida generada) y después con los niveles A y B (texto propio)
- **THEN** con el Nivel A devuelve cero coincidencias
- **AND** con los niveles A y B devuelve una coincidencia `b-recomend` de nivel B

#### Scenario: El texto descriptivo no coincide [US-068 AC-2] [RN-23]
- **GIVEN** la lista versionada y el verificador `checkProhibitedTerms`
- **WHEN** recibe "Opciones descritas en la evidencia"
- **THEN** devuelve cero coincidencias

### Requirement: permitirFrases solo en el lint de textos propios
`permitirFrases: true` (y `permitir_frases=True`) SHALL usarse solo en el lint de textos propios (`lint:lenguaje` sobre los mensajes de UI y `contracts:check` sobre descripciones y valores ajenos a `CAMPOS_GENERADOS`) y MUST NOT aplicarse nunca a un valor de `CAMPOS_GENERADOS` (`option`, `rationale`, `unsupportedClaims`, `limitations[].text`, `synthesis`) ni a la salida generada en ejecución.

#### Scenario: permitirFrases solo se usa en el lint de textos propios y nunca sobre campos generados [US-068 AC-5] [US-068 AC-2] [RN-23]
- **GIVEN** el monorepo con `packages/clinical-language`, `scripts/contracts` y `apps/rag-orchestrator`, y la constante `CAMPOS_GENERADOS` de `origen-de-campos.json`
- **WHEN** un test estructural busca toda llamada a `checkProhibitedTerms` con `permitirFrases: true` y a `check_prohibited_terms` con `permitir_frases=True` fuera de los tests
- **THEN** las únicas llamadas están en `packages/clinical-language/bin/lint-lenguaje.ts` y en `scripts/contracts/rules/assertNoPrescriptiveLanguage.mjs`, y no hay ninguna en `apps/rag-orchestrator/app/`
- **AND** en `contracts:check`, un parche que pone "no constituye una recomendación" en el `rationale` de una opción de un ejemplo produce un hallazgo, mientras la misma frase en una descripción del spec no lo produce

### Requirement: Implementaciones conformes en Node y en Python
El verificador MUST existir en TypeScript (`packages/clinical-language`) y como gemelo `check_prohibited_terms(texto, lista, niveles, permitir_frases)` en el dominio de `rag-orchestrator`, y ambas implementaciones MUST dar el mismo resultado (`id` y nivel) sobre el archivo compartido de casos de conformidad.

#### Scenario: El gemelo Python da el mismo resultado que el verificador de Node [US-068 AC-2] [RN-23]
- **GIVEN** el archivo compartido `packages/clinical-language/conformidad/casos.json` con los textos del AC-2 y sus coincidencias esperadas
- **WHEN** se evalúan con `checkProhibitedTerms` (Vitest) y con `check_prohibited_terms` (Pytest)
- **THEN** ambos devuelven, caso por caso, los mismos `id` de término esperados

### Requirement: Origen de los campos del contrato definido una sola vez
`packages/clinical-language` MUST definir una sola vez (`origen-de-campos.json`) la allowlist de campos copiados del corpus (`chunkTextSnapshot`, `title`, `sourceName`, `externalId`, `authors`) y la de campos generados (`option`, `rationale`, `unsupportedClaims`, `limitations[].text`, `synthesis`). El recorrido de UI y el validador de L1D-180 SHALL usar estas listas y ningún otro módulo SHALL redefinirlas.

#### Scenario: Las dos allowlists se leen del paquete [US-068 AC-3] [RN-04] [RN-23]
- **GIVEN** `packages/clinical-language/origen-de-campos.json`
- **WHEN** se importan `CAMPOS_COPIADOS_DEL_CORPUS` y `CAMPOS_GENERADOS`
- **THEN** contienen exactamente los cinco campos del corpus y los cinco campos generados enumerados
- **AND** ningún campo está en ambas listas

### Requirement: Ningún texto visible de la UI usa términos prohibidos
Todo texto visible, `aria-label` y `aria-describedby` de las páginas de `web` de cada sprint MUST dar cero coincidencias con el Nivel A. Solo SHALL excluirse el texto copiado del corpus (RN-04, RN-25) en hojas `data-origen="corpus"` de la allowlist de campos del corpus, que MUST NOT contener texto generado; los atributos ARIA MUST verificarse siempre. El recorrido SHALL usar Playwright contra Compose en perfil de test, seed sintético y LLM fingido.

#### Scenario: El recorrido del S1 por login y panel da cero coincidencias [US-068 AC-3] [AC-T3.4] [M-10.2] [RN-23]
- **GIVEN** Compose en perfil de test con `LLM_PROVIDER=fake`, el paciente semilla y el recorrido Playwright por `/login` y por `/pacientes/[id]/analisis` en sus estados "con opción" y "solo descartadas" (con la sección de descartadas expandida), y en los estados mínimos del S1 "sin evidencia" y "error"
- **WHEN** se aplica `checkProhibitedTerms` (Nivel A) al texto visible, a los `aria-label` y a los `aria-describedby` de cada estado, excluido solo el texto de las hojas marcadas como copiadas del corpus
- **THEN** hay cero coincidencias en todos los estados
- **AND** un fallo nombra la ruta, el estado y el término encontrado

#### Scenario: La marca de corpus no sirve de escape [US-068 AC-3] [RN-04] [RN-23]
- **GIVEN** el panel en estado "con opción" y en "solo descartadas"
- **WHEN** el recorrido inspecciona los nodos `data-origen="corpus"`
- **THEN** cada uno es una hoja con `data-campo` en `CAMPOS_COPIADOS_DEL_CORPUS` y texto igual al campo del ejemplo del contrato
- **AND** ninguno, ni sus ancestros o descendientes marcados, contiene el texto de `option`, `rationale` ni `unsupportedClaims`
- **AND** sus `aria-label` y `aria-describedby` se verifican igual que los del resto de la página

### Requirement: Encabezado de opciones y botón de análisis con literales no prescriptivos
El panel de análisis MUST mostrar el encabezado exactamente "Opciones descritas en la evidencia" y el botón exactamente "Analizar evidencia", tomados del archivo de mensajes de UI de `web`.

#### Scenario: El panel con una opción muestra los literales exactos [US-068 AC-4] [AC-10.3] [HU-03]
- **GIVEN** el panel de `/pacientes/[id]/analisis` del paciente semilla con una respuesta `con_evidencia` de una opción
- **WHEN** se renderiza
- **THEN** el encabezado `h2` de las opciones es exactamente "Opciones descritas en la evidencia"
- **AND** el botón de envío del formulario es exactamente "Analizar evidencia"

### Requirement: La CI rechaza mensajes de UI con términos prohibidos
El script raíz `lint:lenguaje` MUST aplicar los niveles A y B del verificador (con `frasesPermitidas`) a cada valor de los archivos de mensajes de UI de `web` (`apps/web/messages/<idioma>.json`, creado por L1D-197, `[S1 resp. 18]`; este change solo lo lee) y terminar con código distinto de 0 si hay alguna coincidencia, nombrando la clave, el nivel y el término; un directorio de mensajes ausente o vacío MUST hacerlo fallar. La CI MUST ejecutarlo como job `lint:lenguaje` en cada PR.

#### Scenario: Un mensaje con "el mejor tratamiento" hace fallar el job y nombra la clave [US-068 AC-5] [RN-23] [readme §6.0 DoD]
- **GIVEN** un PR (fixture `ci/tests/lenguaje/`) que agrega al archivo de mensajes de UI de `web` una clave cuyo valor contiene "el mejor tratamiento"
- **WHEN** corre la CI
- **THEN** el job `lint:lenguaje` falla
- **AND** su salida nombra la clave del mensaje y el término "el mejor tratamiento"

#### Scenario: Un mensaje con la raíz recomend hace fallar el job [US-068 AC-5] [RN-23] [S1 resp. 15]
- **GIVEN** un fixture `ci/tests/lenguaje/con-raiz/` con una clave cuyo valor es "Opción recomendada"
- **WHEN** corre `npm run lint:lenguaje -- ci/tests/lenguaje/con-raiz`
- **THEN** termina con código distinto de 0
- **AND** su salida nombra la clave, el nivel B y la palabra "recomendada"

#### Scenario: Los mensajes sin términos prohibidos pasan [US-068 AC-5] [RN-23]
- **GIVEN** el archivo de mensajes de UI de `web` de `main`
- **WHEN** corre `npm run lint:lenguaje`
- **THEN** termina con código 0
