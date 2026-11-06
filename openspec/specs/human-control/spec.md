# human-control Specification

## Purpose
Control humano del lenguaje: la lista versionada de términos prescriptivos prohibidos de RN-23 (Nivel A y Nivel B), su verificador común en Node y Python, y las reglas que impiden que la UI, los ejemplos del contrato y las salidas generadas usen lenguaje de recomendación (RN-23, D-01).

## Requirements

### Requirement: Lista versionada de términos prescriptivos prohibidos en dos niveles
La lista de RN-23 MUST vivir en `packages/clinical-catalogs/lenguaje/terminos-prohibidos.json` (1.6.0, US-249) con `version`, `normalizacion`, un **Nivel A** (salida generada y textos propios), un **Nivel B** de prefijos y términos (textos propios), `salidaGenerada.nivelB` (ids del Nivel B que también se aplican a la salida generada) y `frasesPermitidas`. Un término MAY declarar `formas` y `excepciones`. Los backends SHALL leerla de solo lectura desde `CLINICAL_CATALOG_PATH`.

#### Scenario: La lista cargada contiene los términos de RN-23 y los de S1 resp. 15 y 33 [US-068 AC-1] [AC-10.3] [RN-23] [S1 resp. 33]
- **GIVEN** la lista versionada `packages/clinical-catalogs/lenguaje/terminos-prohibidos.json`
- **WHEN** `loadProhibitedTerms()` la carga
- **THEN** devuelve `version` "1.6.0" y un Nivel A que incluye "recomendado para este paciente", "debe recibir", "el mejor tratamiento", "indicado para usted", "indicado para este paciente", "indicado para esta paciente", "recommended for this patient", "should receive", "the best treatment" e "indicated for you"
- **AND** el Nivel A incluye además "deben recibir", "debería recibir", "se sugiere iniciar", "tratamiento indicado", "mejor opción", "usted debe", "you should", "the patient should", "indicated for this patient", "probabilidad de éxito" y "chance of success" `[S1 resp. 15]`
- **AND** el Nivel A conserva de la lista provisional del Pre-S1 "opción preferida", "tratamiento de elección" y "tratamiento óptimo"
- **AND** el Nivel A incluye los términos de `[S1 resp. 33]`: "inicie", "administre", "prescriba", "suspenda", "cambie a", "elija", "escoja" y "ofrezca" (con `formas`), "se debe", "debe iniciar", "debe suspender", "se debe administrar", "no debe recibir", "no se debe administrar", "es necesario", "es imprescindible", "se recomienda", "se recomienda iniciar", "se indica", "está indicado", "está contraindicado", "la mejor opción es", "manejo de elección", "we recommend", "is recommended", "should be started", "must receive", "should not receive", "is indicated", "is contraindicated", "preferred treatment" y "treatment of choice"
- **AND** el Nivel A incluye las formas en voz propia de US-249: "se recomendaría", "se aconseja", "considere iniciar" y "se sugeriría", con sus `formas`
- **AND** el Nivel B contiene los prefijos `recomend`, `recomiend` y `recommend` y los términos de `[S1 resp. 33]` "iniciar", "administrar", "prescribir", "suspender", "ofrecer", "elegir", "start", "initiate", "administer", "prescribe", "discontinue", "offer", "choose", "switch to" y "standard of care"
- **AND** `salidaGenerada.nivelB` contiene exactamente `b-recomend`, `b-recomiend` y `b-recommend`
- **AND** `frasesPermitidas` incluye "iniciar sesión"
- **AND** cada término o prefijo tiene un `id` único entre niveles e `idioma`

#### Scenario: Un id de salidaGenerada que no existe en el Nivel B hace fallar la carga [US-249 AC-2] [RN-23] (Decidido, usuario, 2026-11-03)
- **GIVEN** una copia de la lista cuyo `salidaGenerada.nivelB` incluye un id que no está en el Nivel B
- **WHEN** `loadProhibitedTerms()` y el cargador de `rag-orchestrator` la cargan
- **THEN** ambos lanzan un error que nombra el archivo y el id desconocido
- **AND** ningún consumidor continúa con un subconjunto vacío

### Requirement: La carga de la lista falla cerrada
Una lista ausente, ilegible o que no cumpla su esquema MUST producir un error que nombre el archivo y SHALL NOT tratarse como lista vacía por ningún consumidor.

#### Scenario: Una lista ausente o inválida falla cerrada [US-068 AC-1] [RN-23] (asumido)
- **GIVEN** una ruta de lista inexistente, o un archivo sin `terminos`
- **WHEN** `loadProhibitedTerms()` intenta cargarla
- **THEN** lanza un error que nombra el archivo
- **AND** ningún consumidor (lint, tests, validador de L1D-180) continúa con una lista vacía

### Requirement: Verificador de términos prohibidos con normalización común en Node y Python
`checkProhibitedTerms(texto, lista, { niveles, permitirFrases })` MUST ser puro y devolver `id` y nivel por cada aparición. MUST normalizar y comparar secuencias de claves flexivas (plural, género, enclíticos); un término con `formas` MUST compararse por ellas y una `excepción` que lo contiene MUST anularlo `[S1 resp. 33]`. Entre solapadas, solo la de tramo más largo. Por defecto MUST aplicar solo el Nivel A, sin `frasesPermitidas`.

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

#### Scenario: La raíz recomend solo se aplica cuando se pide el Nivel B [US-068 AC-5] [RN-23] [S1 resp. 15] [S1 resp. 33]
- **GIVEN** el texto "La guía recomienda el esquema X"
- **WHEN** se verifica con el Nivel A (salida generada) y después con los niveles A y B (texto propio)
- **THEN** con el Nivel A devuelve cero coincidencias
- **AND** con los niveles A y B devuelve una coincidencia `b-recomiend` de nivel B

#### Scenario: Las formas dirigidas, deónticas y negativas de S1 resp. 33 coinciden una vez [US-068 AC-2] [RN-23] [S1 resp. 33]
- **GIVEN** la lista versionada 1.4.0 y el verificador con el Nivel A
- **WHEN** recibe por separado "administre trastuzumab", "No administre trastuzumab", "Adminístrelo cada 3 semanas", "no debe recibir", "No se debe administrar en embarazo", "debe iniciarse en las 12 semanas", "es necesaria una biopsia", "no está indicado", "la mejor opción es trastuzumab", "Se recomienda trastuzumab" y "Trastuzumab is recommended"
- **THEN** devuelve exactamente una coincidencia por texto: `es-administre`, `es-administre`, `es-administre`, `es-no-debe-recibir`, `es-no-se-debe-administrar`, `es-debe-iniciar`, `es-es-necesario`, `es-esta-indicado`, `es-la-mejor-opcion-es`, `es-se-recomienda` y `en-is-recommended`

#### Scenario: Los usos descriptivos no coinciden en el Nivel A [US-068 AC-2] [RN-23] [S1 resp. 33] [S1 resp. 34]
- **GIVEN** la lista versionada 1.4.0 y el verificador con el Nivel A (salida generada)
- **WHEN** recibe por separado "los ensayos evaluaron administrar trastuzumab", "la guía recomienda X para pacientes con HER2 positivo", "el fármaco se administra cada 3 semanas", "la paciente inicia tratamiento", "fecha de inicio del tratamiento", "el cambio a trastuzumab", "la toxicidad se debe a la quimioterapia" y "como se indica en la tabla"
- **THEN** devuelve cero coincidencias en cada texto
- **AND** con los niveles A y B, "los ensayos evaluaron administrar trastuzumab" devuelve una coincidencia `b-es-administrar` y "la guía recomienda X para pacientes con HER2 positivo" una `b-recomiend`, ambas de nivel B

#### Scenario: Los literales del S1 de L1D-140 y L1D-194 no coinciden en ningún nivel [US-068 AC-2] [US-068 AC-5] [RN-23] [S1 resp. 28] [S1 resp. 32] [S1 resp. 35]
- **GIVEN** la lista versionada 1.4.0 y el verificador con los niveles A y B y `permitirFrases`
- **WHEN** recibe por separado "Relevancia de recuperación de evidencia", "Metadato secundario: no mide eficacia ni solidez clínica", "Ordenado por relevancia de recuperación de la búsqueda; no representa prioridad ni aplicabilidad clínica.", "Orden basado en la cita recuperada más relevante asociada a cada opción", "No resume la aplicabilidad, la eficacia ni la calidad global de la opción.", "Registro solo para auditoría: no es contenido clínico utilizable.", "Reintentar", "Análisis no realizado: falta el tipo de cáncer; no fue posible filtrar la evidencia.", "En pacientes con cáncer de mama HER2 positivo temprano, ¿qué describe la evidencia sobre mortalidad con terapia anti-HER2 adyuvante?", "Generado por IA; requiere validación clínica independiente por el oncólogo tratante." y "Uso académico/investigación"
- **THEN** devuelve cero coincidencias en cada texto, también sin `permitirFrases`
- **AND** "Iniciar sesión" devuelve cero con `permitirFrases` y una `b-es-iniciar` sin él

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

### Requirement: Aviso de IA en todo resultado del análisis
Todo resultado de `POST /platform/evidence-analyses` MUST llevar en `disclaimer` exactamente el valor de `AI_DISCLAIMER_TEXT` de `clinical-api` (por defecto, el literal validado por los oncólogos asesores, `[S1 resp. 32]`, PRD E-11, sin la etiqueta académica), y el panel de `web` MUST mostrarlo tal como llega, en una región `role="note"`, con cualquier `status`, incluido `sin_evidencia` `[S1 resp. 3]`.

#### Scenario: El análisis con evidencia muestra el aviso literal [US-069 AC-1] [AC-T3.1] [RN-19] [S1 resp. 32]
- **GIVEN** el paciente semilla (a) y `AI_DISCLAIMER_TEXT` con su valor por defecto
- **WHEN** se ejecuta un análisis que devuelve `status = con_evidencia` y el panel lo renderiza
- **THEN** el campo `disclaimer` de la respuesta es exactamente "Generado por IA; requiere validación clínica independiente por el oncólogo tratante." `[S1 resp. 32]`
- **AND** el panel muestra ese texto en una región `role="note"` junto al resultado

#### Scenario: El análisis sin evidencia también muestra el aviso [US-069 AC-4] [RN-19] [RN-02] (asumido, aceptado en S1 resp. 3)
- **GIVEN** una pregunta del *fixture* sin evidencia, sin chunks sobre el umbral
- **WHEN** el análisis devuelve `status = sin_evidencia` con `topRelevanceScore = null` y el panel lo renderiza
- **THEN** el campo `disclaimer` tiene el mismo literal que en `con_evidencia`
- **AND** el panel muestra el aviso en la región `role="note"`, aunque no haya opciones ni texto generado

#### Scenario: Con la dependencia caída no hay resultado que avisar [US-069 AC-1] (asumido)
- **WHEN** `rag-orchestrator` no responde y el BFF recibe un `502`, `503` o `504`
- **THEN** el panel muestra solo el estado de error mínimo del S1 ("No se pudo completar el análisis…" y el código de traza), según `docs/ux/S1/pantallas-s1.md`
- **AND** no hay resultado parcial ni región `role="note"` de aviso, porque no hay salida generada

### Requirement: Literal del aviso con fuente única en configuración
El literal del aviso de IA MUST vivir solo en `AI_DISCLAIMER_TEXT` de `clinical-api` (RN-19, RN-22, PRD E-11, `[S1 resp. 32]`). `web` MUST NOT declarar una constante, mensaje ni valor por defecto propio para el aviso: lo SHALL mostrar desde el campo `disclaimer` de la respuesta. `clinical-api` MUST negarse a arrancar si `AI_DISCLAIMER_TEXT` está vacía o ausente, nombrando la clave (asumido: falla cerrado, como el resto de la configuración obligatoria).

#### Scenario: Cambiar la clave cambia el campo y el panel sin cambiar código de web [US-069 AC-2] [RN-19] [RN-22] (asumido, aceptado en S1 resp. 3)
- **GIVEN** `AI_DISCLAIMER_TEXT` configurada en el test con un valor sintético distinto del literal por defecto
- **WHEN** se ejecuta un análisis y el panel lo renderiza
- **THEN** el campo `disclaimer` de la respuesta y el texto del aviso del panel son ese nuevo valor
- **AND** ningún archivo de `apps/web` contiene el literal "requiere validación clínica independiente por el oncólogo tratante" ni el anterior "requiere validación clínica del oncólogo tratante"

#### Scenario: La clave vacía impide arrancar clinical-api [US-069 AC-2] [RN-22] (asumido)
- **WHEN** `clinical-api` arranca con `AI_DISCLAIMER_TEXT` vacía o sin definir
- **THEN** el proceso termina con código distinto de 0 y un mensaje que nombra `AI_DISCLAIMER_TEXT`, sin servir ninguna petición

### Requirement: Etiqueta permanente "Uso académico/investigación"
Toda página autenticada de `web` MUST mostrar la etiqueta "Uso académico/investigación" en la cabecera común del *layout* del *dashboard* (`AppHeader`), como texto visible, permanente y no solo como color, independiente del campo `disclaimer` (RN-19, OL-04, `[S1 resp. 9]`, `[S1 resp. 32]`). En el S1 la única página autenticada es `/pacientes/[id]/analisis`; las páginas que se agreguen después (listado y ficha en el S2, alta en el S4) la heredan del *layout*.

#### Scenario: Las páginas autenticadas del S1 muestran la etiqueta [US-069 AC-3] [RN-19] [OL-04]
- **GIVEN** una sesión válida del doctor sintético y el paciente semilla (a)
- **WHEN** se renderiza cada página autenticada del S1 (`/pacientes/[id]/analisis`, antes del análisis y con el resultado `con_evidencia`, `sin_evidencia` y error)
- **THEN** cada una muestra el texto "Uso académico/investigación" en la cabecera
- **AND** el texto no está dentro del aviso `role="note"` del campo `disclaimer`

#### Scenario: Sin sesión no se renderiza ninguna página autenticada [US-069 AC-3] [RN-19]
- **WHEN** se pide `/pacientes/[id]/analisis` sin la cookie de sesión
- **THEN** `web` redirige a `/login` (L1D-197) y el HTML servido no contiene datos del paciente ni del análisis

> Regresión [RN-19] activa desde S2: el resumen del caso (US-096, US-097) lleva el mismo aviso más "Verifique contra las fuentes" y las páginas de listado y ficha muestran la etiqueta. Regresión [RN-19] activa desde S5: cada turno de seguimiento (`FollowUpTurn.disclaimer`). Regresión [RN-15] activa desde S6: con opt-out de `analisis_ia` no hay resultado (`403`) y por tanto no hay aviso.

### Requirement: Una corrección crea una fila nueva y conserva la anterior como histórico
Al corregir un `Biomarker` o una `ClinicalNote` vigente, `clinical-api` MUST crear en una transacción una fila nueva con `entry_method = manual_correction`, `review_status = verificado` y `supersedes_id` hacia la anterior, y pasar la anterior a `reemplazado` (y `is_active = false` en la nota). Ningún `UPDATE` SHALL cambiar `value` ni `content` de una fila existente (RN-08, ADR-50).

#### Scenario: Corregir el valor de un biomarcador deja el anterior como histórico enlazado [US-253 AC-1] [RN-08] [AC-04.1]
- **GIVEN** el paciente semilla (a) activo con su Ki-67 `20 %` registrado y `doc1@test.local` con sesión válida
- **WHEN** envía `POST /platform/patients/{a}/biomarkers/{ki67}/corrections` con `value = "25"` y `unit = "%"`
- **THEN** responde `201` con un `Biomarker` `value = "25"`, `provenance.entryMethod = manual_correction` y `supersedesId = {ki67}`
- **AND** la fila `{ki67}` conserva `value = "20"` con `review_status = reemplazado`, y `GET /platform/patients/{a}` muestra en `recentBiomarkers` solo el Ki-67 `25 %` con origen «Corrección manual»

#### Scenario: El histórico del biomarcador se lee siguiendo supersedes_id [US-253 AC-1] [RN-08]
- **GIVEN** el Ki-67 de (a) corregido dos veces (`20` → `25` → `30`)
- **WHEN** el doctor pide `GET …/biomarkers/{vigente}/history`
- **THEN** recibe dos entradas `reemplazado`, de la más reciente (`25`) a la más antigua (`20`), con su `entryMethod` y fecha, y la lista no supera `CORRECTION_HISTORY_MAX`

#### Scenario: Corregir la fecha de un examen manual reemplaza también el examen [US-253 AC-1] [ADR-50] (Decidido (usuario, 2026-11-03): D3 del design, `[S5 resp. 13]`)
- **GIVEN** un biomarcador registrado a mano en un `Exam` `registro_manual` cuyo único biomarcador vigente es él
- **WHEN** el doctor corrige su `performedAt` a una fecha anterior a hoy
- **THEN** se crea un `Exam` nuevo `manual_correction` con esa fecha y `supersedes_id` al examen anterior, y el biomarcador nuevo cuelga de él
- **AND** si el examen anterior tenía otros biomarcadores vigentes, el examen nuevo lleva `supersedes_id = null` y el anterior sigue vigente con ellos

#### Scenario: Corregir texto o tipo de una nota crea una versión nueva [US-253 AC-2] [RN-08]
- **GIVEN** la nota `comorbilidad` sintética de (a) (FX-253-a)
- **WHEN** el doctor envía `POST …/clinical-notes/{nota}/corrections` con otro `content` y `noteType = antecedente`
- **THEN** responde `201` con la nota nueva (`manual_correction`, `supersedesId = {nota}`), `GET …/clinical-notes` lista solo la nueva y la anterior queda `reemplazado`, `is_active = false`, con su texto intacto en `GET …/clinical-notes/{nueva}/history`

#### Scenario: Una fila ya reemplazada no se puede volver a corregir [US-253 AC-1] [RN-08] (Decidido (usuario, 2026-11-03): concurrencia, D2 del design, `[S5 resp. 13]`)
- **GIVEN** el Ki-67 `{ki67}` ya reemplazado por una corrección anterior
- **WHEN** llega otra corrección sobre `{ki67}` (doble envío o dos pestañas)
- **THEN** responde `409 DATO_NO_VIGENTE`, no se crea ninguna fila y el vigente no cambia

#### Scenario: Una corrección sin cambios no crea filas [US-253 AC-3] (Decidido (usuario, 2026-11-03), `[S5 resp. 13]`)
- **WHEN** el doctor envía una corrección con los mismos valores que la fila vigente
- **THEN** responde `422 CUERPO_INVALIDO` sin `field` y no se crea ninguna fila

### Requirement: El biomarcador corregido se normaliza con el servicio de Backend 1
El biomarcador corregido MUST conservar el `originalName` de la fila anterior y obtener `name`, `loincCode` y `mappingStatus` de `ReconciliationService` (ADR-33, RN-27); el módulo de correcciones SHALL NOT asignar `mapeado` ni `no_mapeado` por su cuenta.

#### Scenario: La corrección pasa por la normalización final [US-253 AC-1] [RN-27] [ADR-33]
- **GIVEN** FX-01b-b montado y un biomarcador manual `originalName = "ERBB2"`
- **WHEN** el doctor corrige su valor
- **THEN** la fila nueva tiene `name = HER2`, `loincCode = LOINC-T-HER2`, `mappingStatus = mapeado` y `originalName = "ERBB2"`

### Requirement: Validación de la corrección sin cambios parciales
Un cuerpo inválido, un valor fuera del catálogo o una fecha posterior a hoy (reloj inyectado) MUST responder `422` con `ErrorCorreccionInvalida` y el campo afectado en `field`, sin crear ni modificar filas. Los límites de texto SHALL vivir en configuración (`CLINICAL_NOTE_MAX_CHARS`, RN-22).

#### Scenario: Una fecha posterior a hoy se rechaza junto al campo [US-253 AC-3] [PRD §10]
- **GIVEN** el reloj congelado en una fecha fija
- **WHEN** el doctor corrige el Ki-67 de (a) con `performedAt` = mañana
- **THEN** responde `422` con `error = CUERPO_INVALIDO` y `field = "performedAt"`, y el biomarcador vigente y su examen no cambian

#### Scenario: Un valor cuantitativo no numérico se rechaza [US-253 AC-3] [RN-27] (Decidido (usuario, 2026-11-04))
- **GIVEN** un biomarcador `cuantitativo` (Ki-67 de FX-01b-b)
- **WHEN** el doctor lo corrige con un `value` no numérico (p. ej. `"7+x"`)
- **THEN** responde `422` con `error = VALOR_FUERA_DE_CATALOGO` y `field = "value"`, sin filas nuevas

Limitación: los «valores admitidos» de un biomarcador cualitativo (p. ej. HER2) dependen del catálogo, que no los trae (1.3.0); se validan con el oncólogo (D5-21) y no se inventa un enum clínico.

#### Scenario: Una nota vacía o demasiado larga se rechaza [US-253 AC-3] [RN-22] (Decidido (usuario, 2026-11-03), `[S5 resp. 13]`)
- **WHEN** el doctor corrige una nota con `content` vacío o con más de `CLINICAL_NOTE_MAX_CHARS` caracteres
- **THEN** responde `422` con `field = "content"` y la nota vigente no cambia

### Requirement: Paciente egresado y administrador no corrigen
Toda corrección MUST responder `422 PACIENTE_EGRESADO` si el paciente está egresado (RN-17), comprobado antes de escribir, y `403` a una sesión sin `clinical:write` (`admin`, PRD §11); las lecturas de notas e histórico SHALL exigir `clinical:read`.

#### Scenario: Corregir un dato de un paciente egresado responde 422 [US-253 AC-4] [RN-17]
- **GIVEN** un paciente sintético egresado con un biomarcador y una nota
- **WHEN** el doctor intenta corregir cualquiera de los dos
- **THEN** responde `422` con `error = PACIENTE_EGRESADO` y no se crea ni modifica ninguna fila

#### Scenario: El administrador recibe 403 al corregir y al leer notas [US-253 AC-4] [PRD §11] (Decidido (usuario, 2026-11-03): lecturas, `[S5 resp. 13]`)
- **GIVEN** `admin@test.local` con sesión válida
- **WHEN** envía una corrección de biomarcador o de nota, o pide `GET …/clinical-notes` o `…/history`
- **THEN** responde `403` en todos los casos y no se crea ninguna fila

### Requirement: La corrección cambia el contexto del próximo análisis sin bloquear
Tras una corrección, el contexto clínico vigente del paciente MUST reflejar el valor nuevo, de modo que `huellaDelContexto()` del próximo análisis difiera de la del análisis previo; los análisis guardados SHALL quedar intactos y el aviso al usuario no bloquea ninguna acción (RN-26, D-10).

#### Scenario: La huella del contexto cambia tras corregir un dato que usó un análisis previo [US-253 AC-5] [RN-26] [RN-06]
- **GIVEN** un análisis guardado de (a) cuyo contexto incluyó Ki-67 `20 %`, con `rag-orchestrator` simulado desde `contracts/examples/`
- **WHEN** el doctor corrige Ki-67 a `25 %` y pide un análisis nuevo con la misma pregunta
- **THEN** el `contextFingerprint` del análisis nuevo difiere del previo, el contexto enviado lleva `25` y no `20`, y el `AIAnalysisRecord` previo conserva su snapshot y su huella sin cambios
- **AND** la corrección y el análisis nuevo responden `201` sin ningún bloqueo por el análisis previo

Regresión [RN-26] activa desde S6: la no reutilización de un análisis por huella la verifica US-251.

### Requirement: Corrección en línea con histórico desplegable en la ficha
La ficha MUST ofrecer «Corregir dato» en cada biomarcador y nota clínica vigente (variante A de S5-01), con formulario en línea, origen «Corrección manual» tras guardar, histórico desplegable con las filas `reemplazado` y aviso no bloqueante sobre análisis anteriores. La corrección de un dato «Por revisar» o «En conflicto» SHALL conservar el anterior como `reemplazado` (RN-08). Fechas relativas y textos en `messages/es.json` (`[S5 resp. 11]` (d)).

#### Scenario: El oncólogo corrige un biomarcador en la fila y ve el histórico [US-253 AC-1] [RN-08]
- **GIVEN** la ficha de (a) con MSW sirviendo `biomarker-corrected.json` y `correction-history-biomarker.json`
- **WHEN** el doctor pulsa «Corregir dato» en Ki-67, cambia el valor y pulsa «Guardar mi corrección»
- **THEN** la fila muestra el valor nuevo con «Corrección manual», aparece «Histórico» bajo la fila y al desplegarlo lista el valor anterior rotulado «reemplazado»
- **AND** al corregir un **biomarcador** se muestra «Los análisis anteriores se hicieron con el valor previo. Un análisis nuevo usará el valor corregido.» sin deshabilitar ninguna acción [US-253 AC-5] [RN-26]; al corregir una **nota** no se muestra aviso de análisis, porque las notas no entran al análisis

#### Scenario: Las fechas del histórico se muestran relativas [US-253 AC-1] [S5 resp. 11]
- **GIVEN** el reloj congelado y `correction-history-biomarker.json` con una entrada creada hoy y otra 12 días antes
- **WHEN** el doctor despliega «Histórico» en Ki-67
- **THEN** las entradas muestran «hoy» y «hace 12 días», cada una con la fecha absoluta en un `<time dateTime>`

#### Scenario: El oncólogo corrige una nota y conserva la versión anterior visible [US-253 AC-2]
- **GIVEN** la sección «Notas clínicas» de la ficha de (a)
- **WHEN** cambia el texto y el tipo de una nota y guarda
- **THEN** la sección muestra la versión nueva y el histórico desplegable muestra la anterior

#### Scenario: El error 422 aparece junto al campo y nada cambia [US-253 AC-3]
- **GIVEN** MSW respondiendo `error-correccion-fecha-futura.json`
- **WHEN** el doctor guarda una fecha posterior a hoy
- **THEN** el mensaje aparece junto al campo de fecha, se anuncia con `aria-live="assertive"`, el formulario sigue abierto con lo escrito y la fila no cambia

#### Scenario: Con paciente egresado la acción está deshabilitada y explicada [US-253 AC-4] [RN-17]
- **GIVEN** la ficha de un paciente sintético egresado
- **WHEN** se renderiza
- **THEN** «Corregir dato» está deshabilitado con «El paciente está egresado: no admite registros hasta su reactivación»

#### Scenario: El formulario de nota libre muestra el aviso de nombres [US-253 AC-6] [ADR-40] [RN-11]
- **WHEN** el doctor abre «Corregir dato» en una nota
- **THEN** encima del campo de texto aparece fijo «No escribas nombres de personas (ni del paciente ni de terceros) en las notas. Las notas no se envían a la IA en esta versión; conviene no incluir nombres de personas en ellas.» (S5 resp. 12: el envío de notas, tras el detector de PII, se traslada a ADR-40)

#### Scenario: El formulario precarga valor, unidad y fecha del examen de un biomarcador con unidad [D5 feedback 1] [US-253 AC-1] [RN-08]
- **GIVEN** la ficha del paciente sintético (f) con Ki-67 `20` `%`, fecha del examen `2026-10-20` y origen «Carga inicial · Por revisar»
- **WHEN** el doctor pulsa «Corregir dato» en Ki-67
- **THEN** el formulario muestra «Valor» `20`, «Unidad (opcional)» `%` y «Fecha del examen» `2026-10-20`, todos editables
- **AND** el campo de fecha lleva como máximo la fecha de hoy del servidor

#### Scenario: Un biomarcador cualitativo sin unidad indica que la unidad es opcional [D5 feedback 1] [NFR-12]
- **GIVEN** RE `Negativo` sin unidad, con origen «Carga inicial · Por revisar · En conflicto»
- **WHEN** el doctor pulsa «Corregir dato» en RE
- **THEN** «Valor» muestra `Negativo` y «Fecha del examen» muestra la fecha del examen
- **AND** «Unidad (opcional)» está vacío, con «Sin unidad» como marcador y la ayuda «Déjala vacía si el resultado no lleva unidad.» asociada al campo con `aria-describedby`

#### Scenario: La unidad de un cuantitativo se conserva y borrarla envía null [D5 feedback 1]
- **GIVEN** PSA `4,2` `ng/mL` en la ficha
- **WHEN** el doctor abre «Corregir dato», cambia solo el valor y guarda
- **THEN** el cuerpo enviado incluye el valor nuevo y `unit = "ng/mL"` precargada
- **AND** si en cambio borra la unidad y guarda, el cuerpo incluye `unit = null`

#### Scenario: La fecha solo se envía si el oncólogo la cambió [D5 feedback 1] [ADR-50]
- **GIVEN** Ki-67 con fecha del examen `2026-10-20` precargada
- **WHEN** el doctor cambia solo el valor y guarda
- **THEN** el cuerpo enviado es `{ value, unit }` sin `performedAt`
- **AND** si cambia la fecha a `2026-10-22`, el cuerpo incluye `performedAt = "2026-10-22"`

#### Scenario: La fecha precargada no se desplaza por zona horaria [D5 feedback 1]
- **GIVEN** un biomarcador con `performedAt = "2026-10-01"` y el navegador en una zona horaria con desfase negativo
- **WHEN** el doctor abre «Corregir dato»
- **THEN** «Fecha del examen» muestra `2026-10-01`, no `2026-09-30`

#### Scenario: Una fecha posterior a hoy se rechaza junto al campo antes de enviar [D5 feedback 1] [US-253 AC-3]
- **GIVEN** el formulario de corrección abierto con «hoy» del servidor `2026-11-05`
- **WHEN** el doctor escribe `2099-01-01` en «Fecha del examen» y pulsa «Guardar mi corrección»
- **THEN** «La fecha no puede ser posterior a hoy.» aparece junto al campo, se anuncia en `aria-live="assertive"`, no se envía ninguna petición y lo escrito se conserva

#### Scenario: Corregir un dato por revisar y en conflicto conserva el anterior como histórico [D5 feedback 1] [RN-08]
- **GIVEN** RE `Negativo` con «Carga inicial · Por revisar · En conflicto» y MSW sirviendo `biomarker-corrected.json` y `correction-history-biomarker.json`
- **WHEN** el doctor corrige el valor y guarda
- **THEN** la fila muestra el valor nuevo con «Corrección manual» y el «Histórico» desplegado lista el dato de «Carga inicial» como «reemplazado»
- **AND** ningún valor anterior se sobrescribe ni desaparece en silencio

### Requirement: Pedir un análisis nunca modifica datos clínicos
Completar un análisis de evidencia MUST dejar intactas, en número de filas y en contenido, todas las tablas de los schemas `clinical` e `identity` salvo `clinical.ai_analysis_record`, que SHALL recibir exactamente una fila nueva (RN-06). Ningún `review_status` SHALL cambiar, tampoco en las filas registradas o corregidas a mano por el doctor (AC-T3.2).

#### Scenario: Un análisis con evidencia no cambia el número de filas clínicas ni ningún review_status [US-070 AC-1] [AC-T3.2]
- **GIVEN** el paciente semilla (a) y la instantánea (conteo y *hash* por tabla) de `patient`, `diagnosis`, `biomarker`, `treatment`, `clinical_event`, `prior_treatment` y `clinical_attribute`
- **WHEN** `doc1@test.local` completa un análisis `con_evidencia` (MSW con `contracts/examples/rag-query-con-evidencia.json`) y recibe `200`
- **THEN** el número de filas de esas siete tablas es el mismo que antes
- **AND** su *hash* de contenido no cambia, de modo que ningún `review_status` ha cambiado

#### Scenario: La única diferencia en clinical e identity es la fila nueva de ai_analysis_record [US-070 AC-2] [AC-T3.2] [RN-06]
- **GIVEN** el mismo paciente y la instantánea de todas las tablas de `clinical` e `identity` (asumido: `identity` se incluye por RN-10)
- **WHEN** se completa el análisis del escenario anterior
- **THEN** la única tabla con diferencia es `clinical.ai_analysis_record`, con una fila más
- **AND** esa fila tiene el `id` y el `traceId` de la respuesta, válida contra el spec de `clinical-api`

#### Scenario: Las filas registradas y corregidas a mano no cambian al analizar [US-070 AC-2] [AC-T3.2] [RN-08] [S5 resp. 3]
- **GIVEN** el paciente (a) con un biomarcador y un diagnóstico registrados a mano (US-110), un tratamiento previo y un atributo clínico manuales (US-094) y un biomarcador corregido (US-253: fila `reemplazado` y su sucesora `manual_correction`), creados por sus endpoints con la sesión del doctor
- **WHEN** se toma la instantánea de `clinical` e `identity` y se completa un análisis `con_evidencia`
- **THEN** la única tabla con diferencia es `clinical.ai_analysis_record`
- **AND** la fila `reemplazado` conserva su `review_status` y su valor, y las filas manuales siguen `verificado` con su `entry_method`

### Requirement: Una pregunta de seguimiento nunca modifica datos clínicos
Completar una pregunta de seguimiento sobre un análisis MUST dejar intactas todas las tablas de `clinical` e `identity` salvo `clinical.analysis_follow_up`, que SHALL recibir exactamente una fila nueva; la fila del análisis de origen en `ai_analysis_record` SHALL NOT cambiar (AC-T3.2, RN-06).

#### Scenario: La única diferencia tras un seguimiento es la fila nueva de analysis_follow_up [US-070 AC-2] [AC-T3.2] [RN-06] (asumido: instrucción de /sprint-start del S5)
- **GIVEN** el análisis `con_evidencia` del paciente (a) con las filas manuales del requisito anterior y la instantánea de `clinical` e `identity`
- **WHEN** `doc1@test.local` envía `POST /platform/evidence-analyses/{analysisId}/follow-ups` (MSW con `contracts/examples/rag-follow-up-response.json`) y recibe `201`
- **THEN** la única tabla con diferencia es `clinical.analysis_follow_up`, con una fila más cuyo `id` es el del turno respondido
- **AND** la fila del análisis de origen en `ai_analysis_record` tiene el mismo *hash* que antes

### Requirement: Una respuesta interna con campos inesperados no persiste nada
Si la respuesta de `rag-orchestrator` trae un campo no declarado en su contrato (p. ej. `actions`), `clinical-api` MUST rechazarla con el Zod generado estricto y responder `502 ERROR_SERVICIO_IA` sin persistir `AIAnalysisRecord` ni devolver el campo; ninguna tabla de `clinical` ni de `identity` SHALL cambiar.

#### Scenario: Un campo actions en la respuesta interna no se persiste ni se devuelve y ninguna tabla cambia [US-070 AC-4] [AC-T3.2]
- **GIVEN** el paciente (a), la instantánea de `clinical` e `identity` y MSW respondiendo `/rag/query` con `rag-query-con-evidencia.json` más `actions: [{"type":"registrar_tratamiento"}]`
- **WHEN** `doc1@test.local` pide el análisis
- **THEN** la respuesta es `502` con `error = ERROR_SERVICIO_IA`, válida contra el spec de `clinical-api`, y su cuerpo no contiene `actions` ni `registrar_tratamiento`
- **AND** ninguna tabla de `clinical` ni de `identity` tiene diferencia, incluida `ai_analysis_record` (el supuesto «Zod descarta campos desconocidos» se sustituye por el rechazo del contrato estricto, design D4)

### Requirement: La tarjeta de opción no ofrece acciones clínicas
La tarjeta de cada opción descrita en el panel MUST NOT contener botones ni enlaces que registren un tratamiento, apliquen la opción o modifiquen datos del paciente; sus únicos controles SHALL ser de lectura (desplegar detalle, ver la cita) (AC-T3.2, FR-10).

#### Scenario: Los controles de la tarjeta de opción son solo de lectura [US-070 AC-3] [AC-T3.2] [FR-10]
- **GIVEN** la tarjeta de opción renderizada con cada opción de `contracts/examples/con-evidencia-s4-tres-opciones.json`
- **WHEN** se recorren sus controles (botones, enlaces y `summary`)
- **THEN** ninguno tiene un nombre accesible ni un destino que registre un tratamiento, aplique la opción o modifique datos del paciente
- **AND** los controles presentes son solo de lectura (detalle de la opción y de la cita)

### Requirement: El análisis de un paciente con avisos clínicos responde 200 con sus avisos
Para un paciente de un tipo habilitado con datos `requiere_revision`, datos en conflicto, datos críticos faltantes y una fuente de población no comparable, `POST /platform/evidence-analyses` MUST responder `200` con la opción y los avisos que existen en el S5 en su lugar del contrato; ningún aviso clínico SHALL convertirse en `4xx` ni ocultar la opción (RN-26).

#### Scenario: FX-T3-a con continueWithWarning responde 200 con población no comparable en warnings[] y faltantes y sin verificar declarados en la Base del análisis, no emitidos en warnings[] [US-071 AC-1] [RN-26] [AC-T3.3]
- **GIVEN** FX-T3-a (HER2 `3+` `verificado`, Ki-67 `20 %` `requiere_revision`, dos RE en conflicto, sin `estado_menopausico`) y `rag-orchestrator` simulado con `contracts/examples/rag-query-fx-t3-a.json`
- **WHEN** el doctor solicita el análisis con `continueWithWarning = true`
- **THEN** la respuesta es `200`, válida contra el spec del proveedor, con una opción en `evidenceOptions`
- **AND** esa opción trae `populationNotComparable = true` y `warnings = [poblacion_no_comparable]`
- **AND** el aviso de faltantes está declarado en la Base del análisis: `analysisBasis.missingCriticalData` contiene `estado_menopausico` y `continuedWithWarning` es `true`
- **AND** el aviso de dato sin verificar está declarado en la Base del análisis: `analysisBasis.patientDataUsed` incluye Ki-67 con `reviewStatus = requiere_revision`
- **AND** `warnings[]` no contiene `datos_faltantes`, `datos_sin_verificar` ni `datos_en_conflicto` (D1, `[S5 resp. 12]`)
- **AND** el `AIAnalysisRecord` queda persistido con los mismos faltantes

Notas de alcance:
- Regresión [RN-26] `datos_en_conflicto` (opción y tarjeta) y `datos_sin_verificar` en `evidenceOptions[].warnings`: activa desde S6/Post-MVP con US-101 y US-136; hoy FX-T3-a incluye el conflicto solo para probar que no bloquea.
- Regresión [RN-26] `patientDataWarning = en_conflicto` por criterio (US-124): activa desde S6/Post-MVP; ningún escenario del S5 lo afirma (`[S5 resp. 12]`).
- Regresión [RN-26] «desactualizado»: activa desde S6 con FEAT-11a (si hay capacidad).
- Regresión [RN-15] `403` por opt-out de `analisis_ia`: activa desde S6 con US-148. El `401` sin sesión y el `422 PACIENTE_EGRESADO` en registros siguen cubiertos por `auth-session` y `manual-clinical-entry`.

### Requirement: Las lecturas del paciente responden 200 con sus avisos
La ficha (`GET /platform/patients/{id}`), la vista de caso (`GET /platform/patients/{id}/case`) y el checklist (`GET /platform/patients/{id}/completeness`) MUST responder `200` para un paciente con avisos clínicos, mostrando el estado de cada dato en lugar de rechazar la lectura (RN-26, FR-11).

#### Scenario: Ficha, vista de caso y checklist de FX-T3-a responden 200 con sus avisos [US-071 AC-4] [RN-26] [FR-11]
- **GIVEN** FX-T3-a sembrado con el catálogo de datos críticos `test-1.0.0`
- **WHEN** se consultan la ficha, la vista de caso y `GET …/completeness` con una sesión `doctor`
- **THEN** las tres responden `200`, válidas contra el spec del proveedor
- **AND** la ficha y la vista de caso traen Ki-67 con `provenance.reviewStatus = requiere_revision`
- **AND** el checklist trae `ki67` en `presente_sin_verificar` y `estado_menopausico` en `faltante`

### Requirement: El panel ejecuta el análisis y muestra la opción no comparable pese a los avisos
Con avisos clínicos, el panel de análisis MUST permitir ejecutar el análisis desde el aviso previo de faltantes y MUST mostrar cada opción con la etiqueta «Población no comparable» cuando corresponda, sin ocultarla ni deshabilitarla (RN-26).

#### Scenario: Continuar con el aviso de faltantes ejecuta el análisis y muestra el resultado [US-071 AC-2] [RN-26] [AC-04.2]
- **GIVEN** FX-T3-a en el panel `/pacientes/{id}/analisis` contra Compose en perfil de test (`LLM_PROVIDER=fake`)
- **WHEN** el bloque de faltantes (`role="status"`) lista «Estado menopáusico» y el doctor pulsa «Analizar evidencia» con la pregunta de `rag-query-request-fx-t3-a.json`
- **THEN** se envía un solo `POST /api/evidence-analyses` con `continueWithWarning = true`
- **AND** se muestra el resultado del análisis

#### Scenario: La opción de población no comparable se muestra con su etiqueta [US-071 AC-3] [RN-26] [AC-08.6]
- **GIVEN** el resultado del escenario anterior
- **WHEN** se renderiza el análisis
- **THEN** la opción de la fuente no comparable es visible con la etiqueta «Población no comparable» en texto
- **AND** no está oculta, plegada sin acceso ni deshabilitada

### Requirement: El recorrido del doctor no tiene ningún diálogo obligatorio
El recorrido login → ficha → vista de caso → faltantes → análisis MUST completarse sin ningún `dialog` ni `alertdialog` obligatorio; solo MAY aparecer los diálogos de registro que el oncólogo abre por su cuenta («Registrar biomarcador», «Completar diagnóstico a mano», «Agregar tratamiento previo», «Registrar atributo»), y ninguno se abre solo ni se interpone entre el oncólogo y el análisis (AC-T3.3, PP-6, `[S5 resp. 12]`).

#### Scenario: El doctor llega al resultado de FX-T3-a sin ningún diálogo obligatorio [US-071 AC-5] [AC-T3.3] [PP-6]
- **GIVEN** FX-T3-a sembrado en Compose en perfil de test
- **WHEN** en Playwright el doctor inicia sesión, abre la ficha de FX-T3-a, elige «Ver caso clínico», revisa los datos críticos faltantes sin abrir ninguna acción de registro, elige «Analizar la evidencia para este caso» en la vista de caso y pulsa «Analizar evidencia» en el panel
- **THEN** llega a `analysis-result` con la opción visible
- **AND** en ningún paso aparece un elemento `role="dialog"` o `role="alertdialog"` (los diálogos «Registrar biomarcador», «Completar diagnóstico a mano», «Agregar tratamiento previo» y «Registrar atributo» solo existen si el oncólogo los abre, y en este recorrido no los abre)
- **AND** ningún botón del recorrido queda deshabilitado por un aviso clínico

### Requirement: Conformidad por forma de la voz propia de recomendación
El archivo compartido `packages/clinical-language/conformidad/casos.json` MUST incluir, por cada forma de voz propia (condicional, impersonal con «se», imperativo) y por variante de número, género y negación, al menos un caso positivo y uno negativo, cada uno con un `id` de caso; Node y Python MUST dar el mismo resultado y un fallo SHALL nombrar el `id` del caso.

#### Scenario: Las formas en voz propia coinciden en el Nivel A en Node y en Python [US-249 AC-3] [AC-T3.4] [RN-23]
- **GIVEN** la lista 1.6.0 y los casos positivos de voz propia de `casos.json` («Se recomendaría iniciar trastuzumab», «No se recomendaría suspender», «Se aconseja administrar», «Se aconsejan dos ciclos», «Considere iniciar hormonoterapia», «Consideren iniciar», «Se sugeriría iniciar»)
- **WHEN** se evalúan con `checkProhibitedTerms` (Vitest) y `check_prohibited_terms` (Pytest) con el Nivel A
- **THEN** cada caso devuelve exactamente la coincidencia esperada, con el mismo `id` en ambas implementaciones

#### Scenario: Los usos descriptivos de las mismas palabras no coinciden [US-249 AC-3] [US-249 AC-5] [RN-23]
- **GIVEN** los casos negativos de voz propia de `casos.json` («los autores consideraron iniciar el tratamiento tras la cirugía», «el ensayo considera la recaída como evento», «Opciones descritas en la evidencia»)
- **WHEN** se evalúan con el Nivel A en Node y en Python
- **THEN** cada caso devuelve cero coincidencias

#### Scenario: Un caso de conformidad que falla nombra su id [US-249 AC-3] [RN-23]
- **GIVEN** un caso de `casos.json` cuyo resultado esperado no coincide con el del verificador
- **WHEN** corre la suite de conformidad
- **THEN** el fallo nombra el `id` del caso y su grupo, sin depender del orden de los casos

### Requirement: Corregir un tratamiento previo crea una fila nueva y conserva la anterior como histórico
Al corregir un `PriorTreatment` vigente, `clinical-api` MUST crear en una transacción una fila `manual_correction` `verificado` con `supersedes_id` hacia la anterior, que pasa a `reemplazado` con sus valores intactos (RN-08, ADR-50), y MUST decidir de nuevo `atcCodes` y `mappingStatus` con el catálogo (ADR-33, RN-27).

#### Scenario: Corregir el esquema deja el anterior como histórico enlazado [AC-04.1] [RN-08]
- **GIVEN** un paciente activo con el tratamiento «AC-T» en `adyuvante` y un `doctor` con sesión válida
- **WHEN** envía `POST /platform/patients/{p}/prior-treatments/{t}/corrections` con `regimenName = "FEC"` y el resto de campos válidos
- **THEN** responde `201` con un `PriorTreatment` `regimenName = "FEC"`, `provenance.entryMethod = manual_correction` y `supersedesId = {t}`
- **AND** la fila `{t}` conserva `regimenName = "AC-T"` con `review_status = reemplazado`, y la vista de caso lista solo la fila nueva

#### Scenario: El código ATC se recalcula con el catálogo [ADR-33] [RN-27]
- **GIVEN** un tratamiento con `atcCodes` del catálogo
- **WHEN** el doctor corrige `regimenName` a un texto sin entrada en el catálogo
- **THEN** la fila nueva queda `mappingStatus = no_mapeado`, `atcCodes = []` y conserva el texto tal como llegó, sin código inventado

#### Scenario: Un cuerpo incoherente se rechaza con el campo señalado [AC-04.1]
- **WHEN** el doctor corrige con `ongoing = false` sin `endReason`, o con `endedAt` anterior a `startedAt`
- **THEN** responde `422 CUERPO_INVALIDO` con `field` igual a la propiedad en falta y no cambia ninguna fila

#### Scenario: Una corrección sin cambios no crea fila [RN-08]
- **WHEN** el doctor envía los mismos valores que tiene la fila vigente
- **THEN** responde `422 CUERPO_INVALIDO` sin `field` y no se crea ninguna fila

### Requirement: Corregir un atributo clínico conserva la clave y valida el valor contra el catálogo
Al corregir un `ClinicalAttribute` vigente, `clinical-api` MUST mantener `attributeKey`, validar `value` contra la lista del catálogo para el tipo de cáncer del diagnóstico vigente (RN-29), crear una fila `manual_correction` `verificado` con `supersedes_id` y pasar la anterior a `reemplazado` con su valor intacto (RN-08).

#### Scenario: Corregir el valor de un atributo deja el anterior como histórico [AC-04.1] [RN-08]
- **GIVEN** un paciente de mama con un atributo del catálogo registrado con un valor equivocado
- **WHEN** el doctor envía `POST …/clinical-attributes/{a}/corrections` con otro valor de la lista del catálogo
- **THEN** responde `201` con la fila nueva (`manual_correction`, `supersedesId = {a}`) y la anterior queda `reemplazado` con su valor
- **AND** `GET …/clinical-attributes` devuelve solo la fila nueva

#### Scenario: Un valor fuera del catálogo se rechaza [RN-29]
- **WHEN** el doctor corrige con un valor que no está en la lista del catálogo
- **THEN** responde `422 VALOR_FUERA_DE_CATALOGO` con `field = value` sin repetir el valor y no cambia ninguna fila

#### Scenario: La clave no se puede cambiar
- **WHEN** el cuerpo incluye `attributeKey`
- **THEN** responde `422 CUERPO_INVALIDO` porque el contrato no admite esa propiedad

### Requirement: La corrección conserva la coherencia de la declaración de ausencia (d5fb-04, D4)
Corregir un tratamiento NO SHALL crear ni borrar declaraciones `sin_tratamiento_previo`; corregir la declaración es una corrección de atributo normal en la que solo `observedAt` cambia (la clave y el valor `si` son inmutables). Tras cualquier corrección MUST seguir cumpliéndose que un `PriorTreatment` vigente y una declaración vigente no coexisten.

#### Scenario: Corregir un tratamiento no toca las declaraciones [D4]
- **GIVEN** un paciente con un tratamiento vigente y ninguna declaración vigente
- **WHEN** el doctor corrige el esquema del tratamiento
- **THEN** la fila nueva queda vigente, la anterior `reemplazado` y el paciente sigue sin declaración vigente

#### Scenario: La declaración de ausencia se corrige como un atributo más [AC-04.1] [RN-08]
- **GIVEN** un paciente con la declaración `sin_tratamiento_previo = si` vigente con `observedAt` equivocada
- **WHEN** el doctor envía `POST …/clinical-attributes/{a}/corrections` con `value = si` y otra `observedAt`
- **THEN** responde `201` con la fila nueva (`manual_correction`, `supersedesId = {a}`) y la anterior queda `reemplazado`
- **AND** el ítem `tratamientos_previos` del checklist sigue cumplido por la declaración vigente

#### Scenario: El valor de la declaración no se puede cambiar
- **WHEN** el doctor corrige la declaración con un `value` distinto de `si`
- **THEN** responde `422 VALOR_FUERA_DE_CATALOGO` con `field = value` y no cambia ninguna fila

### Requirement: Reglas comunes de la corrección de tratamientos y atributos
Las correcciones SHALL exigir `clinical:write`, un paciente activo (RN-17) y un dato vigente; el histórico SHALL exigir `clinical:read`. El administrador MUST recibir `403` en todas. Corregir un dato ya reemplazado MUST responder `409 DATO_NO_VIGENTE`.

#### Scenario: El administrador no puede corregir ni leer el histórico [PRD §11]
- **GIVEN** un `admin` con sesión válida
- **WHEN** llama a cualquiera de las cuatro operaciones
- **THEN** responde `403` y no cambia ninguna fila

#### Scenario: Paciente egresado [RN-17]
- **GIVEN** un paciente egresado con un tratamiento y un atributo
- **WHEN** el doctor intenta corregir cualquiera de los dos
- **THEN** responde `422 PACIENTE_EGRESADO` sin escribir

#### Scenario: Un dato ya reemplazado no se corrige dos veces [RN-08]
- **GIVEN** un tratamiento ya reemplazado por una corrección anterior
- **WHEN** llega otra corrección sobre su id (doble envío)
- **THEN** responde `409 DATO_NO_VIGENTE` y no se crea ninguna fila

#### Scenario: El histórico se lee del más reciente al más antiguo [RN-08]
- **GIVEN** un atributo corregido dos veces
- **WHEN** el doctor pide `GET …/clinical-attributes/{vigente}/history`
- **THEN** recibe dos entradas `reemplazado` ordenadas de la más reciente a la más antigua, sin superar `CORRECTION_HISTORY_MAX`

#### Scenario: Los logs no registran valores [Política de logs]
- **WHEN** se corrige un tratamiento o un atributo
- **THEN** el log contiene `patientId` (UUID), ids de filas y `traceId`, y no `regimenName`, valores ni identidad

### Requirement: La vista de caso permite corregir tratamientos previos y atributos clínicos
Cada fila de «Tratamientos previos» y de «Atributos clínicos» SHALL mostrar «Corregir dato», que abre el formulario de alta precargado con «Guardar mi corrección», y la fila corregida SHALL mostrar origen «Corrección manual» y su histórico desplegable. Con paciente egresado la acción MUST estar deshabilitada.

#### Scenario: El doctor corrige un tratamiento desde la vista de caso [AC-04.1]
- **GIVEN** la vista de caso de un paciente activo con un tratamiento previo
- **WHEN** el doctor pulsa «Corregir dato» en esa fila, cambia el esquema y pulsa «Guardar mi corrección»
- **THEN** el diálogo se cierra, la fila muestra el esquema nuevo con origen «Corrección manual» sin recargar la página y el foco vuelve al botón
- **AND** el histórico desplegable muestra el esquema anterior

#### Scenario: Un error de validación aparece junto al campo [NFR-12]
- **WHEN** `clinical-api` responde `422` con `field = endedAt`
- **THEN** el formulario sigue abierto, el mensaje aparece junto a ese campo anunciado en `aria-live="assertive"`

#### Scenario: Paciente egresado [RN-17]
- **GIVEN** la vista de caso de un paciente egresado
- **THEN** «Corregir dato» está deshabilitado y `aria-describedby` apunta al texto que explica que no admite registros

#### Scenario: Estado vacío
- **GIVEN** un paciente sin tratamientos previos ni atributos
- **THEN** cada sección muestra «Sin datos registrados» y su acción de alta, sin botones de corrección

#### Scenario: Aviso no bloqueante sobre análisis anteriores [RN-26]
- **GIVEN** un paciente con un análisis guardado
- **WHEN** se guarda una corrección
- **THEN** se muestra el aviso de que los análisis anteriores usaron el dato previo, sin impedir generar uno nuevo

#### Scenario: Sin términos prohibidos en los textos nuevos [RN-23]
- **THEN** los textos nuevos de `messages/es.json` no contienen términos de la lista de términos prescriptivos prohibidos
