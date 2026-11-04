# api-contracts Specification

## Purpose
Fija el contrato OpenAPI 3.1 de `clinical-api` (público) y de `rag-orchestrator` (interno) como fuente única de la forma de la API, con ejemplos versionados no normativos, una verificación automática (`contracts:check`) y una generación reproducible (`contracts:generate`) que impiden reintroducir el vocabulario de recomendación, filtrar identidad o romper la forma congelada del análisis de evidencia.

## Requirements

### Requirement: Specs OpenAPI 3.1 de ambos proveedores
El repositorio MUST contener `apps/clinical-api/openapi.yaml` y `apps/rag-orchestrator/openapi.yaml` en OpenAPI 3.1, transcritos de readme §4.1 y §4.2, y `npm run contracts:check` SHALL validarlos y terminar con código 0 solo si ambos son válidos. Las mutaciones de los tests SHALL aplicarse como parches sobre los specs reales, nunca sobre copias completas.

#### Scenario: Ambos specs validan contra OpenAPI 3.1 [US-033 AC-1]
- **WHEN** se ejecuta `npm run contracts:check` sobre los dos specs transcritos
- **THEN** ambos validan sin errores contra OpenAPI 3.1 y el comando termina con código 0

#### Scenario: Un spec inválido o ausente hace fallar el comando [US-033 AC-1]
- **WHEN** un parche cambia `openapi` a `3.0.3` en uno de los specs, o el archivo no se encuentra en su ruta
- **THEN** el comando termina con código distinto de 0 y nombra el archivo y el error

### Requirement: Política de versión del contrato
Ambos specs MUST declarar `info.version` semántico (`MAJOR.MINOR.PATCH`), `1.0.0` al congelar; un cambio incompatible declarado en su change (ADR-26) SHALL subir la *major*; una operación, una respuesta o un código de error nuevos, la *minor*; un cambio solo de texto (descripciones, `message`), la *patch*; y un change que solo añade ejemplos MUST NOT tocar `info.version`.

#### Scenario: La versión es semántica en ambos specs [US-033 AC-1]
- **WHEN** `assertSpecVersions()` revisa ambos specs, y un parche pone `info.version: "v1"` en uno de ellos
- **THEN** los reales declaran un `info.version` semántico `MAJOR.MINOR.PATCH` (tras este change, `1.1.0` en ambos) y el parcheado hace terminar el comando con código distinto de 0 nombrando el spec

#### Scenario: Una operación nueva sube la minor [US-034 AC-1]
- **GIVEN** `main` con ambos specs en `1.0.0` y un change que solo añade una operación (`GET /health`) y sus ejemplos
- **WHEN** se comparan los specs del change con los de `main`
- **THEN** ambos declaran `info.version: 1.1.0` (minor) y no hay cambios incompatibles

#### Scenario: Dos changes que suben la versión del mismo spec a la vez
- **GIVEN** dos changes abiertos a la vez que suben `info.version` del mismo spec
- **WHEN** el segundo se mergea
- **THEN** quien mergea segundo rebasa sobre `main` y conserva el número que tenía asignado

### Requirement: Operaciones del S1 en el spec de clinical-api
Antes de la primera implementación del S1, el spec de `clinical-api` MUST contener `POST /platform/auth/login`, `POST /platform/auth/logout`, `GET /platform/patients`, `POST /platform/patients/search`, `GET /platform/patients/{patientId}`, `POST …/documents`, `POST /platform/evidence-analyses` y `GET /platform/patients/{patientId}/case` `[Pre-S1 resp. 34 (D-5)]`, además del registro manual y el seguimiento; cada historia posterior SHALL añadir su endpoint en su tarea `## contratos` (aditivo).

#### Scenario: Las operaciones del S1 están declaradas [US-033 AC-1]
- **WHEN** `assertSpecVersions()` revisa el spec de `clinical-api`, y un parche elimina `POST /platform/auth/logout`
- **THEN** el real contiene las ocho operaciones y el parcheado hace terminar el comando con código distinto de 0 nombrando la ruta

#### Scenario: La vista de caso se mantiene y es lectura clínica [US-033 AC-1] [Pre-S1 resp. 34 (D-5)]
- **WHEN** `assertSpecVersions()` y `assertOperationsDeclarePermission()` revisan `GET /platform/patients/{patientId}/case`
- **THEN** responde `200` con `CaseView`, declara `x-permission: clinical:read` y `401`, `403` y `404`; el administrador recibe `403` (lectura clínica)

### Requirement: Schemas cerrados y bloques obligatorios
Todo schema `type: object` de ambos specs y de `contracts/schemas/evidence.yaml` MUST declarar `required` y `additionalProperties: false` (o `unevaluatedProperties: false` en las composiciones), salvo las excepciones nombradas con dueño de design.md D7; `meta.retrievalParams` SHALL ser cerrado y todo enum nullable MUST incluir `null`. Las propiedades SHALL estar en camelCase y los bloques de ADR-26 MUST ser obligatorios aunque vayan vacíos `[Pre-S1 resp. 25]`.

#### Scenario: Un schema abierto rompe la verificación [US-033 AC-1] [Pre-S1 resp. 25]
- **WHEN** un parche quita `additionalProperties: false` de `EvidenceAnalysis`, abre `meta.retrievalParams` o agrega una propiedad `snake_case` a `FollowUpTurn`
- **THEN** `contracts:check` termina con código distinto de 0 y nombra el schema y la regla

#### Scenario: Un enum nullable sin null rompe la verificación [US-033 AC-1]
- **WHEN** un parche quita `null` del `enum` de `DiagnosisGrading.specimenType` manteniendo `type: [string, "null"]`
- **THEN** el comando termina con código distinto de 0 y nombra el campo

### Requirement: Forma congelada de EvidenceAnalysis
El schema `EvidenceAnalysis` MUST declarar como `required` `status` (`con_evidencia | sin_evidencia | tipo_no_habilitado`), `synthesis`, `applicability`, `evidenceOptions`, `discardedOptions`, `analysisBasis`, `topRelevanceScore` (`number | null`), `staleness`, `patientDataLinks` y `disclaimer`, con un `if/then` que exige `topRelevanceScore = null` y `evidenceOptions` vacío sin evidencia (RN-02). Un análisis nuevo SHALL llevar `staleness` y `newerVersionAvailable` neutros `[Pre-S1 resp. 29]`.

#### Scenario: EvidenceAnalysis declara los campos congelados [US-033 AC-1] [AC-05.3]
- **WHEN** `contracts:check` inspecciona el schema `EvidenceAnalysis` de `clinical-api`
- **THEN** encuentra los campos congelados en `required`, el enum de `status` exacto y `topRelevanceScore` que admite `null`

#### Scenario: Quitar un bloque de ADR-26 rompe la verificación [US-033 AC-1] [ADR-26]
- **WHEN** un parche quita `disclaimer` o `analysisBasis` del `required` de `EvidenceAnalysis`
- **THEN** el comando termina con código distinto de 0 y nombra el campo

#### Scenario: Los ejemplos del S1, sin evidencia, tipo no habilitado y S4 validan sin cambiar el contrato [US-033 AC-3] [AC-05.3] [RN-02]
- **WHEN** se validan contra el schema `con-evidencia-s1.json` (1 opción, `synthesis.agreements` y `synthesis.discrepancies` vacíos, `applicability = []`, `staleness` neutro y `newerVersionAvailable = false`), `sin-evidencia.json` (`evidenceOptions = []`, `topRelevanceScore = null`, `analysisBasis` presente), `tipo-no-habilitado.json` y `con-evidencia-s4.json` (con `agentSteps = []` y un criterio con `unknownReason: null`)
- **THEN** los cuatro pasan y ninguno exige un campo fuera del schema congelado

#### Scenario: Un ejemplo que no cumple el schema hace fallar el comando [US-033 AC-3] [RN-02]
- **WHEN** un parche quita `analysisBasis` de un ejemplo, o pone `topRelevanceScore = 0.0` en `sin-evidencia.json`
- **THEN** `contracts:check` termina con código distinto de 0 y nombra el ejemplo y la ruta JSON del fallo

#### Scenario: Quitar la regla sin_evidencia ⇒ null rompe la verificación [US-033 AC-3] [Pre-S1 resp. 25]
- **WHEN** un parche elimina el `if/then` de `EvidenceAnalysis` o el de `FollowUpTurn`
- **THEN** `assertNoEvidenceImpliesNullScore()` reporta el hallazgo y el comando termina con código distinto de 0

### Requirement: Esquema AnalysisBasis completo
El schema `AnalysisBasis` MUST declarar como `required`, desde el Pre-S1, `patientDataUsed`, `missingCriticalData`, `continuedWithWarning`, `assumptions`, `sourcesConsulted`, `sourcesNotIncluded`, `corpusCutoffDate`, `limitations`, `priorAnalysesUsed`, `agentSteps` y `omittedClaims`, aunque varios se llenen en sprints posteriores; `sourcesConsulted.filters` SHALL ser un objeto cerrado que incluye `publishedFromYear`.

#### Scenario: AnalysisBasis contiene los incisos (a) a (i) y omittedClaims [US-033 AC-4] [AC-T2.1]
- **WHEN** `contracts:check` inspecciona `AnalysisBasis`
- **THEN** declara los once campos como requeridos y `sourcesConsulted.filters` con `additionalProperties: false`

#### Scenario: Un campo ausente de AnalysisBasis rompe la verificación [US-033 AC-4]
- **WHEN** un parche quita `agentSteps` o `sourcesConsulted.filters.publishedFromYear`
- **THEN** el comando termina con código distinto de 0 y nombra el campo

### Requirement: Vocabulario v1.0 prohibido en los contratos
Ningún spec MUST declarar la ruta `/platform/rag/query` ni una propiedad `recommendations`; `contracts:check` SHALL fallar si alguien las agrega (D-01).

#### Scenario: Los specs no contienen vocabulario de recomendación [US-033 AC-2]
- **WHEN** `contracts:check` recorre los dos specs
- **THEN** no encuentra `/platform/rag/query` ni ninguna propiedad `recommendations` y termina con código 0

#### Scenario: Agregar vocabulario v1.0 rompe la verificación [US-033 AC-2]
- **WHEN** un parche agrega la ruta `/platform/rag/query` o una propiedad `recommendations` anidada en cualquier schema
- **THEN** el comando termina con código distinto de 0 y nombra el archivo y la ruta del hallazgo

### Requirement: Lenguaje no prescriptivo en specs y ejemplos
Ningún texto, clave ni valor de `enum`/`const` de los specs, de `evidence.yaml` ni de `contracts/examples/` MUST contener términos del Nivel A, términos del Nivel B ni palabras con los prefijos del Nivel B (`recomend`/`recomiend`/`recommend`) de la lista de RN-23, comparando con la normalización común de `@oncolens/clinical-language` (sin mayúsculas ni acentos, con plural y género, formas verbales y excepciones, `[S1 resp. 33]`).

#### Scenario: Specs y ejemplos sin términos prescriptivos [US-033 AC-17] [RN-23]
- **WHEN** `contracts:check` recorre todo el texto, las claves y los enums de specs y ejemplos, incluido `con-evidencia-s4.json`
- **THEN** no encuentra términos de la lista y termina con código 0

#### Scenario: Un término prescriptivo rompe la verificación [US-033 AC-17] [RN-23]
- **WHEN** un parche pone "Debe recibir" (con mayúscula) en el `rationale` de una opción del ejemplo del S4, "recommended for this patient" en una descripción, o un valor de `enum` `recomendada`
- **THEN** el comando termina con código distinto de 0 y nombra el archivo, la ruta y el término

### Requirement: Frases permitidas solo en textos propios
La regla de lenguaje de `contracts:check` SHALL admitir las `frasesPermitidas` de la propia lista, y solo en textos propios: los valores de los campos de `CAMPOS_GENERADOS` de `@oncolens/clinical-language` dentro de los ejemplos MUST verificarse sin `frasesPermitidas`.

#### Scenario: Una frase negativa normativa no es hallazgo [US-033 AC-17] [RN-23]
- **WHEN** una descripción contiene "no constituye una recomendación"
- **THEN** la regla no reporta hallazgo porque la frase está en `frasesPermitidas` de la lista

#### Scenario: Una frase permitida en un campo generado de un ejemplo sí es hallazgo [US-068 AC-5] [US-033 AC-17] [RN-23]
- **WHEN** un parche pone "no constituye una recomendación" en el `rationale` de una opción de `con-evidencia-s4.json`
- **THEN** el comando termina con código distinto de 0 y nombra el archivo, la ruta `rationale` y el término de nivel B

### Requirement: La regla de lenguaje lee el catálogo versionado
La lista SHALL leerse del catálogo de US-068 (`packages/clinical-catalogs/lenguaje/terminos-prohibidos.json`, 1.2.0, `[S1 resp. 15]`, `[S1 resp. 33]`) y la lista provisional `scripts/contracts/terminos-prohibidos-rn23.json` MUST NOT existir; si el catálogo falta, la regla MUST reportar un hallazgo que nombra la ruta.

#### Scenario: La regla lee el catálogo y no la lista provisional [US-068 AC-1] [US-033 AC-17] [RN-23] [S1 resp. 15] [S1 resp. 33]
- **WHEN** `contracts:check` corre sobre `main` tras este change
- **THEN** `assertNoPrescriptiveLanguage()` usa `packages/clinical-catalogs/lenguaje/terminos-prohibidos.json` y `scripts/contracts/terminos-prohibidos-rn23.json` no existe
- **AND** un parche que pone "deben recibir" en una descripción hace terminar el comando con código distinto de 0
- **AND** un parche que pone "administre" (Nivel A, `[S1 resp. 33]`) o "standard of care" (Nivel B, `[S1 resp. 33]`) en una descripción hace terminar el comando con código distinto de 0 nombrando el término
- **AND** un parche que retira el catálogo hace terminar el comando con código distinto de 0 nombrando su ruta

### Requirement: Aviso de IA obligatorio
`disclaimer` MUST ser obligatorio (`string`, `minLength: 1`) en `EvidenceAnalysis` y en `FollowUpTurn`, descrito como un solo texto configurable (`AI_DISCLAIMER_TEXT`, que manda sobre la redacción).

#### Scenario: La descripción del campo remite a la configuración y al literal [US-033 AC-17] [US-069 AC-2] [RN-22] [S1 resp. 32]
- **WHEN** `contracts:check` revisa `EvidenceAnalysis.properties.disclaimer` y `FollowUpTurn.properties.disclaimer`
- **THEN** cada descripción menciona `AI_DISCLAIMER_TEXT` y el literal de `[S1 resp. 32]`, y un parche que quita `disclaimer` del `required` o su `minLength` hace terminar el comando con código distinto de 0 nombrando el schema

### Requirement: Literal del aviso de IA
El `disclaimer` SHALL llevar **solo** la frase de RN-19 en el literal validado por los oncólogos asesores `[S1 resp. 32]` (PRD E-11, que supersede B-06): "Generado por IA; requiere validación clínica independiente por el oncólogo tratante.". "Uso académico/investigación" es una etiqueta permanente de la UI y MUST NOT formar parte del campo.

#### Scenario: El cambio no es incompatible [US-069 AC-1] [ADR-26] [decisión 58]
- **WHEN** se compara el spec de la rama con el de `main` (`oasdiff breaking`, o a mano mientras `contracts:breaking` no exista)
- **THEN** no hay cambios incompatibles (solo descripciones y ejemplos) y `info.version` de `clinical-api` pasa de 1.4.0 a 1.4.1 (patch, decisión 58 del plan)

### Requirement: Aviso de IA exacto en los ejemplos
En los ejemplos, `disclaimer` SHALL ser exactamente ese literal, con punto y coma y punto final, sin raya ni la etiqueta `[S1 resp. 32]` (supersede el literal de `[S1 resp. 9]`, la tolerancia de `[Pre-S1 resp. 25]` y la fila C-14). El cambio es compatible y solo de texto: `info.version` sube la *patch*.

#### Scenario: Los ejemplos llevan el aviso completo [US-033 AC-17] [RN-19]
- **WHEN** `contracts:check` revisa todo ejemplo de `contracts/examples/` que tenga `disclaimer` (`EvidenceAnalysis` y `FollowUpTurn`, sin lista fija de archivos, `[S1 resp. 17]`)
- **THEN** (`[US-069 AC-1]`, `[S1 resp. 32]`) cada `disclaimer` es exactamente "Generado por IA; requiere validación clínica independiente por el oncólogo tratante." y el comando termina con código 0

#### Scenario: Un aviso vacío o incompleto rompe la verificación [US-033 AC-17] [RN-19]
- **WHEN** un parche deja `disclaimer = ""` en un ejemplo, pone el literal anterior "Análisis generado por IA: requiere validación clínica del oncólogo tratante" (`[S1 resp. 9]`), quita "independiente" o el punto final, o le agrega " · Uso académico/investigación"
- **THEN** (`[US-069 AC-1]`, `[S1 resp. 32]`) el comando termina con código distinto de 0, nombra el ejemplo y la ruta `#/disclaimer` y muestra el literal esperado

### Requirement: Afirmaciones y opciones ancladas a una cita o a un dato del paciente
Toda `EvidenceOption` MUST tener `citedSources` con `minItems: 1` y todo `SupportedClaim` SHALL anclarse en `citedSources` o en `patientDataRefs` (`anyOf`, `minItems: 1`) (RN-01, ADR-34). Las referencias a datos del paciente MUST ser opacas por petición, `^r[0-9]+$` y nunca UUID, en `ClinicalContext.*.dataRef`, `patientDataRefs` y `supportingDataRefs`; Backend 1 SHALL resolverlas en `patientDataLinks` `[Pre-S1 resp. 29]`. En los ejemplos las citas casan por `chunkId`.

#### Scenario: Una opción o afirmación sin ancla rompe la verificación [US-033 AC-17] [RN-01]
- **WHEN** un parche quita `minItems: 1` de `EvidenceOption.citedSources`, deja una afirmación de `follow-up-turn.json` sin citas ni datos del paciente, o cambia el `chunkId` de una cita de una afirmación por uno ausente de `citedSources`
- **THEN** el comando termina con código distinto de 0 y nombra el schema o el ejemplo

#### Scenario: Una referencia a dato del paciente con forma de UUID rompe la verificación [US-033 AC-17] [Pre-S1 resp. 29] [RN-10]
- **WHEN** un parche quita `dataRef` de un ítem de `ClinicalContext.biomarkers`, quita el `pattern` de `SupportedClaim.patientDataRefs` o pone un UUID en `patientDataRefs` de un ejemplo de Backend 2
- **THEN** el comando termina con código distinto de 0 y nombra la ruta

### Requirement: Descripciones normativas
`relevanceScore` y `topRelevanceScore` MUST describirse como metadato secundario, puntaje del *reranker* en [0,1] que no ordena opciones ni mide solidez clínica ni probabilidad, y `evidenceOptions` como orden determinista por aplicabilidad (RN-03, RN-28). Las descripciones de `discrepancies[].explanation`, de la memoria rotulada y de los textos libres de `ClinicalContext` y `PriorAnalysisMemory` SHALL llevar las frases de design.md D7.

#### Scenario: Una descripción normativa ausente rompe la verificación [US-033 AC-17] [RN-03] [RN-28]
- **WHEN** un parche reemplaza la descripción de `relevanceScore` por "confianza de la opción", o quita "sin afirmación nueva" de `discrepancies[].explanation`
- **THEN** `assertNormativeDescriptions()` reporta el hallazgo y el comando termina con código distinto de 0

#### Scenario: Un texto libre sin marca de enmascarado rompe la verificación [US-033 AC-17] [RN-11]
- **WHEN** un parche quita "enmascarado (RN-11)" de la descripción de un texto libre de `ClinicalContext` o de `PriorAnalysisMemory.question`
- **THEN** el comando termina con código distinto de 0 y nombra la propiedad

### Requirement: El análisis es un evento derivado del timeline
La descripción de `POST /platform/evidence-analyses` MUST decir que el análisis aparece en el timeline como evento derivado y MUST NOT mencionar la escritura de un evento `analisis_ia` (C-06).

#### Scenario: La operación describe el evento derivado [US-033 AC-7] [AC-11.4]
- **WHEN** `contracts:check` revisa la descripción de `POST /platform/evidence-analyses`
- **THEN** contiene "evento derivado" y no menciona escribir un evento `analisis_ia`

#### Scenario: Volver a escribir el evento analisis_ia rompe la verificación [US-033 AC-7]
- **WHEN** un parche restaura la frase de readme "persiste AIAnalysisRecord y el evento analisis_ia"
- **THEN** el comando termina con código distinto de 0 y nombra la operación

### Requirement: Schemas compartidos con un solo origen
Los ocho schemas compartidos de design.md D1 (`EvidenceOption`, `DiscardedOption`, `Synthesis`, `SupportedClaim`, `SourceApplicability`, `ApplicabilityCriterion`, `ApplicabilitySummary`, `CitedSource`) MUST definirse solo en `contracts/schemas/evidence.yaml` y ambos specs SHALL referenciarlos con `$ref`; `Provenance` no es compartido `[Pre-S1 resp. 25]`. Lo generado para esos ocho SHALL ser idéntico en ambos proveedores (NFR-13).

#### Scenario: El spec crudo referencia el origen único [US-033 AC-8]
- **WHEN** `contracts:check` revisa los dos specs **sin** *bundle*
- **THEN** cada uno de los ocho schemas es un `$ref` a `contracts/schemas/evidence.yaml` y ninguno está definido en línea

#### Scenario: Una copia en línea rompe la verificación [US-033 AC-8]
- **WHEN** un parche define en línea una copia de `EvidenceOption` con un campo distinto en el spec de `clinical-api`
- **THEN** el comando termina con código distinto de 0 y nombra el schema divergente

#### Scenario: Lo generado es idéntico para ambos proveedores [US-033 AC-8] [US-033 AC-16]
- **WHEN** se ejecuta `contracts:generate` y se comparan los tipos generados de los ocho schemas en `packages/api-contracts/src/types/clinical-api/` y `packages/api-contracts/src/types/rag-orchestrator/`
- **THEN** son textualmente idénticos

### Requirement: Generación reproducible desde los specs
`contracts:generate` MUST generar desde ambos specs los tipos TS, Zod y Pydantic y el extracto del readme §4, no editables; `contracts:generate:check` SHALL fallar ante una diferencia o un archivo sin versionar, y `contracts:check` si el extracto no coincide. `contracts:breaking` MUST comparar con `origin/main` y `contracts:verify-provider` MUST verificar el proveedor. El Zod MUST ser estricto y traducir `if/then`, `anyOf` y `allOf`; lo intraducible MUST hacer fallar `contracts:generate`.

#### Scenario: Generar dos veces no produce diferencias [US-033 AC-16] [Pre-S1 resp. 20]
- **WHEN** se ejecuta `contracts:generate:check` sobre el repositorio recién generado y versionado
- **THEN** termina con código 0 sin diferencias

#### Scenario: El Zod generado rechaza propiedades desconocidas [US-033 AC-16] [Pre-S1 resp. 33 (D-4)]
- **WHEN** se valida con el Zod generado de `rag-orchestrator` un ejemplo al que se añade una propiedad no declarada en un objeto cerrado
- **THEN** la validación falla (`z.strictObject`)

#### Scenario: Una edición a mano de lo generado se detecta [US-033 AC-16] [Pre-S1 resp. 20]
- **WHEN** se edita a mano `packages/api-contracts/src/zod/clinical-api/zod.gen.ts` o un modelo de `apps/rag-orchestrator/app/schemas/generated/` y se ejecuta `contracts:generate:check`
- **THEN** termina con código distinto de 0 y lista el archivo modificado

#### Scenario: Lo generado desactualizado o editado a mano rompe la CI [US-214 AC-4] [NFR-13]
- **GIVEN** un PR que cambia un `openapi.yaml` sin regenerar, o que edita a mano `packages/api-contracts/src/` (incluido `src/zod/`) o `apps/rag-orchestrator/app/schemas/generated/`
- **WHEN** corre `npm run contracts:generate:check` en la CI
- **THEN** termina con código distinto de 0 y lista cada archivo modificado

#### Scenario: El extracto del readme es generado y no normativo [US-033 AC-16] [Pre-S1 resp. 28]
- **WHEN** `contracts:check` compara el bloque entre `<!-- contracts:readme-extract:start -->` y `<!-- contracts:readme-extract:end -->` de readme §4 con la salida de `contracts:readme-extract`
- **THEN** coinciden, el bloque contiene `POST /platform/patients/{patientId}/documents`, `POST /platform/evidence-analyses` y `GET /platform/patients/{patientId}` y lo precede la marca "extracto generado, no normativo"

#### Scenario: Un extracto del readme editado a mano rompe la verificación [US-033 AC-16] [Pre-S1 resp. 28]
- **WHEN** se edita a mano una línea del extracto del readme
- **THEN** `assertReadmeExtractInSync()` reporta el hallazgo y el comando termina con código distinto de 0

#### Scenario: Eliminar o volver obligatorio un campo rompe contracts:breaking [US-214 AC-5] [ADR-26]
- **GIVEN** un clon temporal en el que se elimina un campo de un schema de respuesta, o se añade a `required` un campo de un schema de request, de cualquiera de los dos specs
- **WHEN** se ejecuta `npm run contracts:breaking` contra `origin/main`
- **THEN** termina con código distinto de 0 nombrando el proveedor y el cambio

#### Scenario: Un cambio incompatible declarado como excepción de ADR-26 pasa [US-214 AC-5] (asumido)
- **GIVEN** el mismo cambio declarado en `scripts/ci/contracts-breaking-excepciones.json` con su E-n, motivo y change, y citado en el `design.md` del change
- **WHEN** se ejecuta `npm run contracts:breaking`
- **THEN** termina con código 0 e imprime la excepción aplicada

#### Scenario: El Zod generado rechaza lo que el generador no traduce [US-214 AC-6] [RN-02] [Pre-S1 resp. 33]
- **GIVEN** los ejemplos de `contracts/examples/` y los parches negativos de `scripts/contracts/__fixtures__/parches/`
- **WHEN** se validan con el Zod generado, incluidos sus refinamientos
- **THEN** los ejemplos pasan y se rechazan `sin_evidencia` con `topRelevanceScore: 0.0`, un `CitedSource` o `FollowUpCitedSource` con una propiedad no evaluada y un objeto que no cumple ninguna rama de su `anyOf`

#### Scenario: Una construcción no traducible hace fallar la generación [US-214 AC-6] (asumido)
- **GIVEN** un spec temporal con un `if/then` sobre una forma que el generador de refinamientos no reconoce
- **WHEN** se ejecuta `npm run contracts:generate`
- **THEN** termina con código distinto de 0 nombrando el schema y la construcción

### Requirement: Tipo de cáncer no habilitado en Backend 2
`POST /rag/query` MUST declarar la respuesta `422` como `oneOf` de `ErrorTipoNoHabilitado` (`error` `const TIPO_NO_HABILITADO`) y `ErrorValidacion` (`error` `const CUERPO_INVALIDO`), y el enum de `RagQueryInternalResponse.status` SHALL seguir siendo `con_evidencia | sin_evidencia` (RN-20).

#### Scenario: /rag/query declara el 422 sin ampliar el enum de status [US-033 AC-9]
- **WHEN** `contracts:check` revisa `POST /rag/query` del spec de `rag-orchestrator`
- **THEN** la respuesta `422` es un `oneOf` que distingue `TIPO_NO_HABILITADO` de la validación, y `RagQueryInternalResponse.status` solo admite `con_evidencia` y `sin_evidencia`

#### Scenario: Ampliar el enum o quitar el 422 rompe la verificación [US-033 AC-9]
- **WHEN** un parche añade `tipo_no_habilitado` al enum de `RagQueryInternalResponse.status` o elimina la respuesta `422`
- **THEN** el comando termina con código distinto de 0 y nombra la ruta

### Requirement: Códigos de error cerrados y sin eco
Cada respuesta de error MUST referenciar un schema con `error` restringido por `const` o `enum`, y cada código SHALL tener un ejemplo en `index.json` o un `pendingExample` con dueño. `Error` y `ErrorValidacion` MUST NOT contener el valor recibido (`detail[]` cerrado, sin `input` ni `ctx`). Los `403` de `clinical-api` SHALL describirse como "RBAC u opt-out", nunca como equipo tratante (B-03).

#### Scenario: Un error con código abierto rompe la verificación [US-033 AC-17]
- **WHEN** un parche cambia el schema del `409` de `POST …/follow-ups` a `error: { type: string }`
- **THEN** `assertErrorCodesClosed()` reporta el hallazgo y el comando termina con código distinto de 0

#### Scenario: Un error que repite el valor recibido rompe la verificación [US-033 AC-17] [RN-10]
- **WHEN** un parche agrega `input` a un elemento de `detail` en `rag-validacion-422.json` o a `ErrorValidacion.detail.items.properties`
- **THEN** `assertErrorsNoEcho()` reporta el hallazgo y el comando termina con código distinto de 0

### Requirement: Login y cierre de sesión
`POST /platform/auth/login` MUST responder `204` sin cuerpo y documentar en `Set-Cookie` una cookie de sesión opaca `HttpOnly; Secure; SameSite=Strict`; credenciales inválidas y cuentas no activas SHALL responder `401` con `error = CREDENCIALES_INVALIDAS` y `traceId` (anti-enumeración). `POST /platform/auth/logout` SHALL responder `204` `[Pre-S1 resp. 29]`.

#### Scenario: El login responde 204 con la cookie documentada [US-033 AC-1] [Pre-S1 resp. 29]
- **WHEN** `contracts:check` revisa `POST /platform/auth/login`
- **THEN** la respuesta `204` no tiene `content`, su cabecera `Set-Cookie` describe `HttpOnly`, `Secure` y `SameSite=Strict`, y el `401` tiene `error` `const CREDENCIALES_INVALIDAS` con el ejemplo `error-credenciales-invalidas.json`

### Requirement: Registro manual de biomarcadores y diagnósticos
El spec de `clinical-api` MUST declarar `POST /platform/patients/{patientId}/biomarkers` (`BiomarkerManualCreate` → `201 Biomarker`, crea un `Exam` con `entry_method = manual`) y `POST /platform/patients/{patientId}/diagnoses` (`DiagnosisManualCreate` → `201 Diagnosis`; con diagnóstico vigente crea uno `manual_correction` y el anterior pasa a `reemplazado`), con `401`, `403`, `404` y `422` (ADR-33).

#### Scenario: Los endpoints de registro manual están declarados [US-033 AC-10]
- **WHEN** `contracts:check` revisa el spec de `clinical-api`
- **THEN** ambos `POST` existen con respuesta `201` y su schema, y sus descripciones fijan `entry_method = manual` y la transición a `reemplazado`

#### Scenario: Quitar un endpoint de registro manual rompe la verificación [US-033 AC-10]
- **WHEN** un parche elimina `POST …/biomarkers` o su respuesta `201`
- **THEN** el comando termina con código distinto de 0 y nombra la ruta

### Requirement: Gradación estructurada en el contrato de Diagnosis
`Diagnosis` MUST exponer `grade` (texto derivado) y `gradings[]` (`DiagnosisGrading`), ambos `readOnly`, con la revisión de cada gradación solo en su `provenance`. `DiagnosisManualCreate` SHALL aceptar una `grading` opcional (`DiagnosisGradingInput`, rangos de design.md D9) y MUST NOT aceptar `grade` (DEC-05, `[Pre-S1 resp. 18]`); `gleasonScore` e `isupGradeGroup` SHALL ser opcionales y, si llegan, validarse `[Pre-S1 resp. 29]`.

#### Scenario: Diagnosis expone gradings y grade es derivado [US-033 AC-11] [Pre-S1 resp. 18]
- **WHEN** `contracts:check` revisa `Diagnosis`, `DiagnosisManualCreate` y `DiagnosisGradingInput`
- **THEN** `grade` y `gradings[]` son `readOnly`, `grading` admite los dos sistemas con sus rangos y `grade` no forma parte del cuerpo de entrada

#### Scenario: Los rangos y los opcionales de la gradación están declarados [US-033 AC-11] [Pre-S1 resp. 29]
- **WHEN** `contracts:check` revisa `GleasonIsupGradingInput` y `NottinghamGradingInput`
- **THEN** `gleason_isup` exige `specimenType` (`biopsia | prostatectomia`), `gradeScope` (`nucleo_sitio | peor | global`) y patrones primario y secundario entre 3 y 5, admite sin exigirlos `gleasonScore` entre 6 y 10 e `isupGradeGroup` entre 1 y 5, y declara `422 GRADACION_INCOHERENTE`; `nottingham` exige `nottinghamGrade` entre 1 y 3; ninguno admite propiedades adicionales

#### Scenario: Los ejemplos de gradación validan [US-033 AC-11] [Pre-S1 resp. 18]
- **WHEN** se validan `diagnosis-manual-gleason.json` (sin score ni grupo), `diagnosis-manual-gleason-completo.json`, `diagnosis-manual-nottingham.json` y `diagnosis-con-gradings.json` (con `grade = "Gleason 4+3=7 · ISUP 3"`)
- **THEN** los cuatro pasan

#### Scenario: Escribir grade a mano o exigir el score rompe la verificación [US-033 AC-11] [Pre-S1 resp. 18]
- **WHEN** un parche agrega `grade` a `DiagnosisManualCreate`, quita `readOnly` de `gradings`, elimina la rama `nottingham` del `oneOf` o añade `gleasonScore` al `required` de `GleasonIsupGradingInput`
- **THEN** el comando termina con código distinto de 0 y nombra el schema

### Requirement: Atribución de la cita copiada del catálogo
`CitedSource` MUST declarar todos sus campos como requeridos, entre ellos `licenseClass` (`dominio_publico | cc_by | cc_by_sa | cc_by_nc`), `authors` (`string | null`) y `sourceUrl` (`string | null`, `format: uri`, `pattern: ^https://`), descritos como copiados del catálogo del corpus y nunca del texto generado; solo los campos listados en design.md como nullables SHALL admitir `null` (RN-04, RN-25, `[Pre-S1 resp. 21]`).

#### Scenario: CitedSource declara licencia, autoría y enlace [US-033 AC-12] [Pre-S1 resp. 21]
- **WHEN** `contracts:check` revisa `CitedSource` en `contracts/schemas/evidence.yaml`
- **THEN** `licenseClass` tiene los cuatro valores, `authors` y `sourceUrl` admiten `null`, `sourceUrl` exige `https://` y la descripción indica su origen en el catálogo del corpus

#### Scenario: Los nullables de CitedSource son exactamente los declarados [US-033 AC-12]
- **WHEN** `contracts:check` revisa los tipos de `CitedSource`
- **THEN** solo `studyDesign`, `trialPhase`, `primaryEndpoint`, `sampleSize`, `publishedAt`, `lastUpdatedAt`, `guidelineVersion`, `authors` y `sourceUrl` admiten `null`, y todos los campos están en `required`

#### Scenario: Los ejemplos cubren la atribución ausente [US-033 AC-12] [RN-25]
- **WHEN** se validan los ejemplos de `contracts/examples/`
- **THEN** al menos uno tiene una cita con `authors = null` y otro con `sourceUrl = null`, y ambos validan (la UI los muestra como "No disponible")

#### Scenario: Una atribución mal declarada rompe la verificación [US-033 AC-12]
- **WHEN** un parche deja `authors` no nullable, quita `cc_by_nc` del enum o quita el `pattern` de `sourceUrl`
- **THEN** el comando termina con código distinto de 0 y nombra el campo

### Requirement: Preguntas de seguimiento ancladas a un análisis
`clinical-api` MUST declarar `POST` (`201 FollowUpTurn`) y `GET` (`200 FollowUpTurn[]`) sobre `/platform/evidence-analyses/{analysisId}/follow-ups` con los errores de design.md D11. `FollowUpTurn` SHALL exigir sus campos (con `question` enmascarada, `status` que incluye `fuera_de_contexto` e `isNewSource` por cita) y un `if/then` por `status` (FR-31, `[Pre-S1 resp. 19, 23]`). El mensaje del `409` MUST NOT tener imperativos ni claves de configuración.

#### Scenario: Los endpoints de seguimiento y FollowUpTurn están declarados [US-033 AC-13] [Pre-S1 resp. 19]
- **WHEN** `contracts:check` revisa el spec de `clinical-api`
- **THEN** existen `POST` (`201 FollowUpTurn`) y `GET` sobre `…/follow-ups`, `FollowUpTurn` declara sus campos requeridos, `question` se describe como enmascarada y cada elemento de `citedSources` declara `isNewSource` booleano (calculado por Backend 1)

#### Scenario: Superar el límite de seguimiento está declarado como conflicto [US-033 AC-13]
- **WHEN** `contracts:check` revisa las respuestas de `POST …/follow-ups`
- **THEN** declara `409` con `error` `const LIMITE_SEGUIMIENTO` y el ejemplo `error-limite-seguimiento.json`, cuyo `message` es "Este análisis alcanzó el máximo de preguntas de seguimiento configurado. Una pregunta distinta puede formularse en un análisis nuevo." sin nombrar `ANALYSIS_FOLLOWUP_MAX`

#### Scenario: El opt-out y el RBAC están declarados como permiso denegado [US-033 AC-13] [RN-15]
- **WHEN** `contracts:check` revisa las respuestas `403` de `POST …/follow-ups`
- **THEN** su `error` es un `enum` con `PERMISO_DENEGADO` y `OPT_OUT_ANALISIS_IA`, y existe el ejemplo `error-opt-out.json`

#### Scenario: Sesión ausente, paciente egresado o análisis sin evidencia [US-033 AC-13] [RN-17]
- **WHEN** `contracts:check` revisa `POST …/follow-ups`
- **THEN** declara `401` y `422` con `error` en `CUERPO_INVALIDO | PACIENTE_EGRESADO | ANALISIS_SIN_EVIDENCIA`

#### Scenario: Límite de solicitudes y dependencia caída están declarados [US-033 AC-13]
- **WHEN** `contracts:check` revisa `POST …/follow-ups` y `GET …/follow-ups`
- **THEN** el `POST` declara `404`, `429`, `502`, `503` (`LOCAL_LLM_UNAVAILABLE`) y `504` con código cerrado, y el `GET` declara `401`, `403` y `404`

#### Scenario: Quitar el 409, la marca de fuente nueva o el if/then rompe la verificación [US-033 AC-13]
- **WHEN** un parche elimina el `409` de `POST …/follow-ups`, quita `isNewSource` de `FollowUpTurn.citedSources` o pone una afirmación en `follow-up-fuera-de-contexto.json`
- **THEN** el comando termina con código distinto de 0 y nombra la ruta

### Requirement: Endpoint propio de seguimiento en Backend 2, sin estado
`rag-orchestrator` MUST declarar `POST /rag/follow-up` (`RagFollowUpRequest`/`RagFollowUpResponse`, design.md D10) con memoria rotulada y no citable; `/rag/query` SHALL NOT cambiar. La descripción SHALL decir que no guarda estado, que seudónimo y `traceId` son nuevos por turno, que la pregunta llega enmascarada y que con datos reales solo usa modelos locales, también en su `503`. `RagMeta` MUST exigir `catalogVersion` y no admitir nulos `[Pre-S1 resp. 19, 23, 29, 32 (D-3)]`.

#### Scenario: /rag/follow-up está declarado y /rag/query no cambia [US-033 AC-13] [Pre-S1 resp. 19]
- **WHEN** `contracts:check` revisa el spec de `rag-orchestrator`
- **THEN** existe `POST /rag/follow-up` con su petición y respuesta, `RagQueryInternalRequest` no tiene un bloque `followUp` y `RagQueryInternalResponse.status` no cambia

#### Scenario: Petición y respuesta del seguimiento interno [US-033 AC-13] [Pre-S1 resp. 19]
- **WHEN** `contracts:check` revisa `RagFollowUpRequest` y `RagFollowUpResponse`
- **THEN** la petición exige `traceId`, `dataClassification`, `catalogVersion`, `question` (enmascarada), `clinicalContext`, `analysisMemory` (forma de `priorAnalyses`, solo tiempos relativos) y `filtersApplied`; la respuesta exige `status` (`con_evidencia | sin_evidencia | fuera_de_contexto`), `answer`, `citedSources`, `omittedClaims`, `topRelevanceScore` (`number | null`, `null` si no hay evidencia o está fuera de contexto) y `meta` (`RagMeta` estricto, con `catalogVersion` requerido y sin campos nulos); `422` es `oneOf` `TIPO_NO_HABILITADO | CUERPO_INVALIDO`

#### Scenario: La memoria del análisis nunca es citable [US-033 AC-13] [RN-24]
- **WHEN** `contracts:check` revisa `analysisMemory` en `RagFollowUpRequest`
- **THEN** cada elemento exige `citable` `const false` y `source` `const analisis_previo_ia`, y un parche que admita `citable: true` hace fallar el comando

#### Scenario: Backend 2 no guarda estado y recibe la pregunta enmascarada [US-033 AC-13] [Pre-S1 resp. 23] [RN-10] [RN-12]
- **WHEN** `contracts:check` revisa la descripción de `POST /rag/follow-up` y la de su `503`
- **THEN** la operación dice que no guarda turnos ni memoria en disco, caché, Milvus o *logs*, que el `pseudoPatientId` y el `traceId` son nuevos en cada turno y que `question` llega enmascarada; la operación y su `503` dicen que con datos reales solo se usan modelos locales, sin *fallback* a la nube; un parche que quite cualquiera de esas frases hace fallar el comando

#### Scenario: catalogVersion es obligatorio en meta [US-033 AC-13] [Pre-S1 resp. 29]
- **WHEN** un parche quita `catalogVersion` del `required` de `RagMeta` o de `CaseSummaryMeta`, o sustituye `meta` de `/case/summary` por un objeto propio
- **THEN** el comando termina con código distinto de 0 y nombra el schema

#### Scenario: RagMeta es estricto y CaseSummaryMeta lleva null donde no hay corpus [US-033 AC-13] [Pre-S1 resp. 32 (D-3)]
- **WHEN** un parche vuelve nullable un campo de `RagMeta` (p. ej. `embeddingModel`), o un ejemplo de `/rag/query` o `/rag/follow-up` trae `retrievalParams` o `embeddingModel` en `null`, o el ejemplo del resumen del caso trae `corpusRelease` no nulo
- **THEN** el comando termina con código distinto de 0 y nombra el campo; `/case/summary` usa `CaseSummaryMeta` (design.md D10), que lleva `null` en `embeddingModel`, `rerankerModel`, `corpusRelease`, `corpusCutoffDate`, `excludedSources` y `retrievalParams` y exige `catalogVersion`

#### Scenario: El anclaje del valor de la población del estudio lo da la opción [US-033 AC-17] [Pre-S1 resp. 37 (D-8)] [RN-01]
- **WHEN** se revisa `ApplicabilityCriterion.studyPopulationValue` en `con-evidencia-s4.json`
- **THEN** el criterio puede traer `citedSources` vacío y el anclaje lo da `EvidenceOption.citedSources` (`minItems: 1`); el título de `PMC9000001` describe terapia endocrina en receptor de estrógeno positivo, como su texto citado

#### Scenario: Los textos de UI con consecuencia de lenguaje son configuración [US-033 AC-17] [Pre-S1 resp. 37 (D-8)] [RN-22] [RN-23]
- **WHEN** se revisa design.md D15
- **THEN** los textos de `fuera_de_contexto`, de `sin_evidencia` y el encabezado "Opciones descritas en la evidencia" figuran como claves de configuración, revisadas en el Gate 2 de `apps/web`; el aviso de RN-19 del resumen del caso queda anotado para US-096 y US-097

#### Scenario: El proveedor del LLM es un enum [US-033 AC-13] [Pre-S1 resp. 36 (D-7)] [RN-12]
- **WHEN** se revisa `llmProvider` en `RagMeta` y en `CaseSummaryMeta`
- **THEN** es `enum [local, nube]`, y los ejemplos con datos sintéticos declaran `local`

### Requirement: Sin identidad ni identificadores enlazables en Backend 2
Ninguna propiedad, parámetro ni cabecera del spec de `rag-orchestrator`, a ninguna profundidad, MUST coincidir con `IDENTIDAD_B2` (design.md D13: identidad personal e ids enlazables), por regex sin mayúsculas sobre el nombre normalizado y con lista blanca; ningún `requestBody` SHALL declarar `format: uuid` `[Pre-S1 resp. 29]`. La única excepción SHALL ser `identityFound` en su puntero exacto de la respuesta `200` de `/documents/extract` (RN-10).

#### Scenario: Una clave de identidad anidada o una variante rompe la verificación [US-033 AC-17] [RN-10]
- **WHEN** un parche agrega `patientId` dentro de `ClinicalContext.diagnosis`, `birth_date` al cuerpo de `/case/summary`, `email` a `RagFollowUpRequest`, `patientName` o `fechaNacimiento` a `ClinicalContext`, o `sourceDocumentId` a la `Provenance` de Backend 2
- **THEN** `assertNoIdentityInRagContract()` nombra el archivo y la ruta y el comando termina con código distinto de 0

#### Scenario: Un UUID en una petición de Backend 2 rompe la verificación [US-033 AC-17] [Pre-S1 resp. 29]
- **WHEN** un parche declara `format: uuid` en una propiedad de `RagFollowUpRequest`
- **THEN** el comando termina con código distinto de 0 y nombra la ruta

#### Scenario: La excepción de identityFound es exacta [US-033 AC-17] [RN-10]
- **WHEN** un parche agrega `identityFound` a la respuesta de `/rag/query`, o `nationalId` al cuerpo multipart de `/documents/extract`
- **THEN** el comando termina con código distinto de 0, mientras que `identityFound` en la respuesta `200` de `/documents/extract` no produce hallazgo

#### Scenario: La lista blanca evita falsos positivos [US-033 AC-17]
- **WHEN** la regla recorre `biomarkerName`, `sourceName` y `originalName`
- **THEN** no reporta hallazgo porque están en su lista blanca

### Requirement: Búsqueda de pacientes sin identidad en la URL ni en las cabeceras
El spec de `clinical-api` MUST declarar `POST /platform/patients/search` con la identidad en el cuerpo (`idType` + `nationalId`, o `name`) y `GET /platform/patients` solo con `status`, `dataOrigin` y `page`; ningún parámetro `in: query`, `in: path` o `in: header` del spec SHALL coincidir con la lista `IDENTIDAD_PII` de design.md D13, salvo las cabeceras `Idempotency-Key`, `X-Trace-Id` y `X-Request-Deadline`. Los UUID en la ruta están permitidos `[Pre-S1 resp. 22]`.

#### Scenario: Un parámetro o cabecera de identidad rompe la verificación [US-033 AC-17] [Pre-S1 resp. 22] [RN-10]
- **WHEN** un parche agrega `nationalId` como parámetro de query a `GET /platform/patients`, `patientName` como query, o una cabecera `X-Patient-Email`
- **THEN** `assertNoIdentityInUrl()` reporta el hallazgo y el comando termina con código distinto de 0

#### Scenario: Un UUID de paciente en la ruta no es hallazgo [US-033 AC-17] [Pre-S1 resp. 22]
- **WHEN** la regla revisa `GET /platform/patients/{patientId}`
- **THEN** no reporta hallazgo

### Requirement: Permisos por operación y vista del administrador
Cada operación de `clinical-api` MUST declarar `x-permission` con uno o varios códigos concretos de la matriz de `data-model.md`, sin comodines; `publico` SHALL admitirse solo en el login y en `GET /health` (operación interna del healthcheck que `web` nunca reenvía, US-034).

#### Scenario: Una operación sin permiso declarado o con un código fuera de la matriz rompe la verificación [US-033 AC-17] [Pre-S1 resp. 29]
- **WHEN** un parche quita `x-permission` de `POST …/follow-ups`, usa un código que no está en la matriz, usa el comodín `ai_analysis:*` o pone `publico` en `GET /platform/patients`
- **THEN** `assertOperationsDeclarePermission()` reporta el hallazgo y el comando termina con código distinto de 0

#### Scenario: publico solo se admite en el login y en el health [US-034 AC-1]
- **WHEN** `assertOperationsDeclarePermission()` revisa el spec real, con `publico` en `POST /platform/auth/login` y en `GET /health`, y un parche pone `publico` en `POST /platform/auth/logout`
- **THEN** el real no produce hallazgos y el parcheado reporta `POST /platform/auth/logout` y hace terminar el comando con código distinto de 0

#### Scenario: La vista de la ficha está atada al permiso [US-033 AC-17] [Pre-S1 resp. 27]
- **WHEN** un parche quita `x-view-by-permission` de `GET /platform/patients/{patientId}` o mapea `default` a `PatientSummary`
- **THEN** `assertViewByPermission()` reporta el hallazgo y el comando termina con código distinto de 0

#### Scenario: El listado y la búsqueda no devuelven la identidad en claro [US-033 AC-17] [Pre-S1 resp. 36 (D-7)] [RN-10]
- **WHEN** se revisa `x-view-by-permission` de `GET /platform/patients` y de `POST /platform/patients/search`
- **THEN** mapean `clinical:read` a `PatientListItem` (los ítems de `PatientPage` son `PatientListItem` o `PatientAdminSummary`) (`fullNameMasked`, `nationalIdMasked`, sin `identification`); el nombre y el documento completos solo están en `PatientSummary.identification`, de la ficha; la búsqueda por nombre tiene a US-048 como dueña

#### Scenario: La vista del administrador no tiene datos clínicos [US-033 AC-15] [Pre-S1 resp. 27]
- **WHEN** se valida `patient-summary-admin.json` y un parche le agrega `diagnosis`
- **THEN** el ejemplo original valida con `nationalIdMasked`, `lifecycleStatus` y `registeredAt`, y el parcheado falla por `additionalProperties: false`

#### Scenario: El detalle del paciente se ata al permiso con x-view-by-permission [Pre-S1 resp. 24, 27, 29] (E-04)
- **WHEN** `contracts:check` revisa `GET /platform/patients/{patientId}`
- **THEN** responde `oneOf` `PatientSummary` o `PatientAdminSummary` (identificación enmascarada, `lifecycleStatus`, `registeredAt`, sin clínica), atado al permiso con `x-view-by-permission`

### Requirement: Filtro de antigüedad de la evidencia
`filtersApplied.publishedFromYear` (`integer | null`; `null` = toda la evidencia) MUST existir como opcional en la petición de `POST /platform/evidence-analyses` (ausente = `año actual − EVIDENCE_DEFAULT_YEARS`, resuelto por Backend 1) y como requerido en `RagFiltersApplied` de `/rag/query` y `/rag/follow-up` (valor efectivo); `AnalysisBasis.sourcesConsulted.filters.publishedFromYear` SHALL registrar el valor efectivo (E-02).

#### Scenario: publishedFromYear existe en ambas peticiones y en AnalysisBasis [US-033 AC-14]
- **WHEN** `contracts:check` revisa ambos specs
- **THEN** `publishedFromYear` es `integer` que admite `null` en las dos peticiones y en `AnalysisBasis.sourcesConsulted.filters`, es requerido en Backend 2 y la descripción remite a `EVIDENCE_DEFAULT_YEARS`

#### Scenario: Un filtro no nullable rompe la verificación [US-033 AC-14]
- **WHEN** un parche deja `publishedFromYear` como `integer` sin `null` en `RagFiltersApplied`
- **THEN** el comando termina con código distinto de 0 y nombra la ruta

### Requirement: Ejemplos sintéticos y no normativos
Los ejemplos de `contracts/examples/` MUST ser no normativos y sintéticos según la convención de design.md D3 (`dataClassification = sintetico`, prefijo `SINT-`, "Prueba Sintética", NCCN y ESMO solo en `sourcesNotIncluded`), y los de Backend 2 SHALL NOT tener identidad ni fechas absolutas en `clinicalContext`, `analysisMemory`, `query` o `question`; `assertExamplesSynthetic()` SHALL verificarlo (RN-14, `[Pre-S1 resp. 12]`).

#### Scenario: Un ejemplo no sintético rompe la verificación [US-033 AC-17] [RN-14] [Pre-S1 resp. 12]
- **WHEN** un parche pone `dataClassification = real_anonimizado` en `rag-query-request.json`, `sourceName = "NCCN"` en una cita, `nationalId = "12345678"` en `patient-search.json`, `name = "María Pérez"` en ese ejemplo, o la fecha `01/03/2026` dentro de `clinicalContext`
- **THEN** el comando termina con código distinto de 0 y nombra el ejemplo y la ruta

### Requirement: Clientes HTTP generados con fetch inyectable
`contracts:generate` MUST generar con hey-api (plugins `@hey-api/client-fetch` + `@hey-api/sdk`, incluidos en `@hey-api/openapi-ts` con versión exacta fijada) un SDK por spec en `packages/api-contracts/src/client/clinical-api/` (para `web`) y `packages/api-contracts/src/client/rag-orchestrator/` (para `clinical-api`), con `baseUrl` y `fetch` inyectables; lo generado MUST NOT editarse a mano y `contracts:generate:check` SHALL detectarlo `[S1 resp. 13]`.

#### Scenario: Un SDK editado a mano o desactualizado rompe la verificación [US-054 AC-6] [S1 resp. 13]
- **WHEN** un parche edita un archivo de `packages/api-contracts/src/client/rag-orchestrator/` o el spec cambia sin regenerar
- **THEN** `npm run contracts:generate:check` termina con código distinto de 0 nombrando el archivo, y con el SDK regenerado termina con código 0

### Requirement: clinical-api llama a rag-orchestrator solo con el cliente generado sobre el transporte JWT
`clinical-api` MUST llamar a `rag-orchestrator` solo con `createRagOrchestratorClient()`, construido sobre `createRagOrchestratorFetch()`. `X-Request-Deadline` SHALL ser un parámetro tipado de la operación que pasa el servicio llamador; el transporte MUST NOT calcularlo ni añadirlo `[S1 resp. 13]`.

#### Scenario: El cliente de rag lleva el deadline del llamador y el JWT de servicio [US-054 AC-6] [S1 resp. 13]
- **GIVEN** `createRagOrchestratorClient()` con un par ES256 efímero, reloj congelado y MSW interceptando `POST /rag/query` en el borde HTTP
- **WHEN** el llamador invoca `ragQuery` con el cuerpo de `rag-query-request.json` y `X-Request-Deadline` = un instante sintético fijo, y en otra llamada sin ese parámetro
- **THEN** el request capturado lleva `X-Request-Deadline` igual al valor pasado y `Authorization: Bearer <jwt>` verificable con la clave pública, sin `Cookie`; sin el parámetro la cabecera `X-Request-Deadline` no aparece; y la respuesta se tipa como `RagQueryInternalResponse`

### Requirement: Health check declarado en ambos specs
Ambos specs MUST declarar `GET /health` con `security: []`, tag `operacion` y `200 HealthStatus` cerrado (`status` `const ok`; `configKeys`, `serviceVersion` y `catalogVersion` opcionales); `rag-orchestrator` SHALL declarar además `503 LlmLocalNoDisponible`. Es aditivo (ADR-26): `clinical-api` 1.7.0 y `rag-orchestrator` 1.5.0. Un único `health-ok.json` MUST validar contra `HealthStatus` de ambos specs.

#### Scenario: Ambos specs declaran el health con sus ejemplos [US-034 AC-1] [US-034 AC-4]
- **WHEN** `npm run contracts:check` revisa los dos specs y los ejemplos
- **THEN** `GET /health` existe en ambos con `HealthStatus` cerrado que admite `configKeys`, `serviceVersion` y `catalogVersion`, el de `rag-orchestrator` declara el `503` `LOCAL_LLM_UNAVAILABLE`, el único `health-ok.json` (con `status`, `configKeys`, `serviceVersion` y `catalogVersion`) valida contra el `HealthStatus` de los dos specs, `rag-health-llm-no-disponible.json` valida contra su `target` y el comando termina con código 0

#### Scenario: El cambio no es incompatible [US-034 AC-1]
- **WHEN** se comparan los specs del change con los de `main` (`npm run contracts:breaking`)
- **THEN** no se reporta ningún cambio incompatible y los specs declaran `info.version` `1.7.0` (`clinical-api`) y `1.5.0` (`rag-orchestrator`)

### Requirement: Ejemplos de request para las preguntas de fixture del modo fake
`index.json` MUST asociar `rag-query-con-evidencia.json` a `rag-query-request.json` y `rag-query-sin-evidencia.json` a `rag-query-request-sin-evidencia.json`, un request sintético válido contra `RagQueryInternalRequest` que solo difiere en la `query` `[S1 resp. 7]`.

#### Scenario: El request sin evidencia es un ejemplo sintético válido [US-034 AC-6] [S1 resp. 7]
- **WHEN** `contracts:check` valida `rag-query-request-sin-evidencia.json` contra `RagQueryInternalRequest`
- **THEN** el ejemplo valida, cumple `assertExamplesSynthetic()` y solo difiere de `rag-query-request.json` en la `query`

### Requirement: Preguntas de fixture distintas en todos los pares request → RagQueryInternalResponse
Toda entrada de `index.json` con `target` `#/components/schemas/RagQueryInternalResponse` MUST declarar su `request`, cada request de *fixture* SHALL asociarse a una sola respuesta y las `query` (sin espacios en los extremos) de todos esos requests MUST ser distintas, para que el modo `fake` elija sin ambigüedad aunque otros changes añadan pares. Lo verifica `assertFixtureQueriesDistinct()`.

#### Scenario: Cada respuesta fija tiene su pregunta de fixture distinta [US-034 AC-6] [S1 resp. 7]
- **WHEN** `assertFixtureQueriesDistinct()` compara las `query` de todos los requests asociados a una respuesta `RagQueryInternalResponse`
- **THEN** las `query` son distintas entre sí, cada respuesta tiene su `request` y el comando termina con código 0

#### Scenario: Un par nuevo con una pregunta repetida rompe la verificación [US-034 AC-6] [S1 resp. 7]
- **WHEN** un parche añade a `index.json` una tercera respuesta `RagQueryInternalResponse` cuyo `request` tiene la misma `query` que `rag-query-request.json` (o una respuesta `RagQueryInternalResponse` sin `request`)
- **THEN** `assertFixtureQueriesDistinct()` reporta ambos archivos y el comando termina con código distinto de 0

### Requirement: Los specs se empaquetan con bundleDocument de Redocly y fallan cerrado
`scripts/contracts` MUST empaquetar en memoria cada `openapi.yaml` con sus `$ref` a `contracts/` mediante `bundleDocument` de `@redocly/openapi-core`, sin escribir en el repositorio y sin un empaquetador propio. Tras empaquetar, una `$ref` externa sin resolver o un nombre de schema repetido MUST hacer fallar el comando nombrando el archivo y la referencia.

#### Scenario: El empaquetado nuevo no cambia lo generado ni el extracto [US-223 AC-1] [US-033 AC-8] [US-033 AC-16]
- **GIVEN** los specs de `main`
- **WHEN** se ejecutan `npm run contracts:check` y `npm run contracts:generate:check` con `bundleDocument`
- **THEN** `contracts:check` termina sin hallazgos y `contracts:generate:check` no produce diferencias en los tipos TS, el Zod, los modelos Pydantic ni el extracto del readme

#### Scenario: Una $ref externa no resuelta hace fallar el empaquetado [US-223 AC-2] [US-033 AC-8]
- **GIVEN** un spec temporal con una `$ref` a una subruta inexistente de `contracts/schemas/evidence.yaml`
- **WHEN** se empaqueta
- **THEN** el comando termina con código distinto de 0 y nombra el archivo y la referencia

#### Scenario: Un nombre de schema repetido hace fallar el empaquetado [US-223 AC-2]
- **GIVEN** un spec temporal que define en `components.schemas` un nombre que también trae `evidence.yaml`
- **WHEN** se empaqueta
- **THEN** el comando termina con código distinto de 0 y nombra el archivo y el schema repetido

#### Scenario: El empaquetador propio desaparece sin perder casos [US-223 AC-3]
- **GIVEN** la migración cerrada
- **WHEN** se inspecciona `scripts/contracts/`
- **THEN** no existe `lib/bundle.mjs` ni código que lo importe, el commit que borra sus tests lleva el *trailer* `Test-Removal:` y cada caso que cubrían tiene un test equivalente contra `bundleDocument`

### Requirement: Verificación automática del proveedor en los tests de integración
Los tests de integración de `clinical-api` y de `rag-orchestrator` MUST validar cada respuesta contra el `openapi.yaml` de su servicio sin que el test lo pida: código declarado, cabeceras obligatorias y cuerpo. Un incumplimiento MUST hacer fallar el test nombrando proveedor, método, plantilla, código y ruta JSON, sin imprimir el valor.

#### Scenario: Las suites de ambos proveedores pasan con la verificación activa [US-214 AC-1] [NFR-13]
- **GIVEN** los specs de `main` y el PostgreSQL de test
- **WHEN** se ejecuta `npm run contracts:verify-provider`
- **THEN** las suites de integración de `clinical-api` y de `rag-orchestrator` terminan en verde y el reporte indica, por proveedor, cuántas respuestas se verificaron

#### Scenario: topRelevanceScore 0.0 en sin_evidencia hace fallar al proveedor [US-214 AC-2] [RN-02] [ADR-26]
- **GIVEN** un adapter falso de `rag-orchestrator` que devuelve `status: sin_evidencia` con `topRelevanceScore: 0.0`
- **WHEN** corre el test de `POST /rag/query` con la verificación activa
- **THEN** falla nombrando `rag-orchestrator`, `POST /rag/query`, `200` y `/topRelevanceScore`

#### Scenario: Un campo no declarado en EvidenceAnalysis hace fallar al proveedor [US-214 AC-2] [ADR-26]
- **GIVEN** una respuesta de `POST /platform/evidence-analyses` a la que se añade un campo no declarado en `EvidenceAnalysis`
- **WHEN** corre el test de `clinical-api` con la verificación activa
- **THEN** falla nombrando `clinical-api`, la plantilla, el código y la ruta JSON del campo

#### Scenario: Una respuesta con un código no declarado hace fallar al proveedor [US-214 AC-1]
- **GIVEN** un endpoint que responde con un código de estado que su operación no declara
- **WHEN** corre su test con la verificación activa
- **THEN** falla nombrando el código no declarado y la operación

### Requirement: contracts:verify-provider corre en cada PR
`npm run contracts:verify-provider` MUST ejecutar ambas suites de integración con la verificación activa, y la CI MUST ejecutarlo en cada PR en jobs que forman parte de `ci-ok`.

#### Scenario: La CI ejecuta la verificación del proveedor en jobs bloqueantes [US-214 AC-1]
- **GIVEN** `.github/workflows/ci.yml`
- **WHEN** se inspeccionan los jobs `integration` y `build-test`
- **THEN** ejecutan `contracts:verify-provider` (o sus suites con `CONTRACT_VERIFY=strict`) y ambos figuran en `needs` de `ci-ok`

### Requirement: Las respuestas de error también son contrato
Las respuestas `401`, `403`, `409` y `422` de los endpoints existentes MUST cumplir el schema de error que declara su operación (incluido `TIPO_NO_HABILITADO` en `422`); un error cuya forma o código no esté declarado MUST hacer fallar el test.

#### Scenario: Los errores declarados cumplen su schema [US-214 AC-3] [B-10]
- **GIVEN** los tests existentes que provocan `401`, `403`, `409` y `422` (`TIPO_NO_HABILITADO`)
- **WHEN** corren con la verificación activa
- **THEN** cada cuerpo cumple el schema de error declarado y el test pasa

#### Scenario: Un error con un código de error no declarado hace fallar el test [US-214 AC-3]
- **GIVEN** un endpoint que responde `422` con un `code` que no está en el enum de errores de su operación
- **WHEN** corre su test con la verificación activa
- **THEN** falla nombrando la operación, `422` y `/error`

### Requirement: Los consumidores solo llaman a los proveedores con clientes generados
El código de `apps/web` (Route Handlers y `lib/server`) y de `apps/clinical-api` MUST llamar a `clinical-api` y a `rag-orchestrator` solo mediante los clientes generados de `packages/api-contracts`; `contracts:check` MUST rechazar un `fetch` o un cliente HTTP directo hacia esos servicios fuera de los transportes declarados.

#### Scenario: Un fetch directo a rag-orchestrator rompe contracts:check [US-214 AC-1] (asumido)
- **GIVEN** un archivo de `apps/clinical-api/src/` que llama con `fetch` a una URL de `rag-orchestrator` fuera del cliente generado
- **WHEN** se ejecuta `npm run contracts:check`
- **THEN** termina con código distinto de 0 nombrando el archivo y la línea

### Requirement: Población del estudio como lista por fragmento, aditiva y opcional
`ApplicabilityCriterion` MUST declarar opcionales `studyPopulationValues` (`{value ≤ 200, chunkId, scope}`, sin `maxItems`) y `partialReason`; `unknownReason` MUST sumar `varios_valores_en_la_fuente` (reservado), `valores_en_conflicto`, `respaldo_fallido` y `sin_regla_de_comparacion`; `studyPopulationValue` SHALL ser `deprecated: true` y, con lista, llevar el primer valor de elegibilidad citado o `null`. El cambio SHALL ser aditivo (ADR-26) con versión minor (design D8–D10).

#### Scenario: El schema declara los campos nuevos y oasdiff no informa incompatibilidades [US-241 AC-1] [ADR-26] [ADR-47]
- **GIVEN** `contracts/schemas/evidence.yaml` editado primero y propagado con `sync-contracts`
- **WHEN** se ejecutan `contracts:check` y `oasdiff` contra `main`
- **THEN** `ApplicabilityCriterion` declara `studyPopulationValues` y `partialReason` opcionales con los límites y enums indicados, `unknownReason` incluye los cuatro valores nuevos y `studyPopulationValue` lleva `deprecated: true`
- **AND** `oasdiff` no informa ningún cambio incompatible y las versiones pasan a `rag-orchestrator` 1.6.0, `clinical-api` 1.11.0 y `evidence.yaml` 1.1.0

#### Scenario: Ambas formas validan y se conservan en clinical-api [US-241 AC-2] [RN-06] [ADR-26]
- **GIVEN** `contracts/examples/rag-query-poblacion-lista.json` (con los campos nuevos) y `rag-query-aplicabilidad-a-m1.json` (sin ellos), servidos por el mock de `rag-orchestrator` construido desde `contracts/examples/` (MSW)
- **WHEN** `clinical-api` recibe cada respuesta
- **THEN** ambas validan con el cliente generado de `packages/api-contracts`
- **AND** la respuesta y el `AIAnalysisRecord` conservan `studyPopulationValues`, `partialReason` y `studyPopulationValue` exactamente como llegaron, con la forma de `con-evidencia-s4-poblacion-lista.json`

### Requirement: Los valores de población entran en el filtro de términos prescriptivos
`packages/clinical-language/origen-de-campos.json` MUST listar `studyPopulationValues[].value` en `camposGenerados`, junto a `studyPopulationValue`, para que el recorrido de RN-23 lo incluya.

#### Scenario: El recorrido RN-23 visita studyPopulationValues[].value [US-241 AC-1] [RN-23]
- **GIVEN** `origen-de-campos.json` actualizado y `con-evidencia-s4-poblacion-lista.json`
- **WHEN** se ejecuta `contracts:check` (validador de origen de campos de US-068)
- **THEN** `studyPopulationValues[].value` figura en `camposGenerados` y el recorrido lo visita en el ejemplo

Regresión [RN-06] activa desde S3 (US-053): el análisis se persiste antes de responder.

### Requirement: RagMeta.retrievalParams declara la fusión sin nulos
`RagMeta.retrievalParams` de `rag-orchestrator` 1.7.0 MUST declarar en `required` `fusion` (`ninguna | rrf | ponderada`) y `fusionParam` (número ≥ 0), sin `null` y atados al modo por `if/then` (design.md D7); todos los ejemplos de `/rag/query` y `/rag/follow-up` SHALL traerlos (decisión D-c; ADR-26, aditivo).

#### Scenario: Los ejemplos de query y follow-up traen fusion y fusionParam [US-112 AC-5] [US-033 AC-13]
- **WHEN** `contracts:check` valida `contracts/examples/rag-query-*.json` y `rag-follow-up-*.json` contra `RagQueryInternalResponse` y `RagFollowUpResponse`
- **THEN** todos traen `meta.retrievalParams.fusion` y `fusionParam` sin `null`, los de modo `dense` con `fusion = ninguna` y `fusionParam = 0`
- **AND** `rag-query-hibrida.json` trae `retrievalMode = hibrida`, `fusion = rrf` y `fusionParam = 60` y tiene su propio request con una `query` distinta de las demás

#### Scenario: Un fusion nulo o incoherente con el modo rompe la verificación [US-112 AC-5] [US-033 AC-13]
- **WHEN** un parche deja `fusion` o `fusionParam` en `null`, los quita de `required`, o un ejemplo trae `retrievalMode = dense` con `fusion = rrf`
- **THEN** `contracts:check` termina con código distinto de 0 y nombra el campo
- **AND** también falla con `retrievalMode = hibrida` y `fusion = ninguna`
- **AND** el contrato solo fija el vínculo modo/fusión; el rango de `fusionParam` (entero ≥ 1 con `rrf`, (0, 1) con `ponderada`) NO lo valida el contrato sino `Settings` al arrancar (`RRF_K`, `HYBRID_SPARSE_WEIGHT`)

#### Scenario: El proveedor emite la fusión en el modo dense [US-112 AC-6]
- **WHEN** `contracts:verify-provider` valida la respuesta real de `/rag/query` con `RETRIEVAL_MODE` sin definir
- **THEN** la respuesta valida contra `RagQueryInternalResponse` con `fusion = ninguna` y `fusionParam = 0`

### Requirement: /completeness y CompletenessView en el spec de clinical-api
El spec de `clinical-api` MUST declarar `GET /platform/patients/{patientId}/completeness` con `x-permission: clinical:read`, respuestas `200`, `401`, `403`, `404` y `500`, y los schemas cerrados `CompletenessView`, `CompletenessItem` y `CompletenessProvenance` (subconjunto propio, sin modificar `Provenance`). El cambio MUST ser aditivo (sin ERR de oasdiff) y subir `info.version` a `1.12.0`.

#### Scenario: La operación está declarada y es aditiva [US-003 AC-1] [US-003 AC-3]
- **WHEN** `contracts:check` y `contracts:breaking` revisan el spec
- **THEN** la operación, `CompletenessView`, `CompletenessItem` y `CompletenessProvenance` existen con `x-permission: clinical:read` y `oasdiff` no reporta cambios incompatibles
- **AND** la respuesta real de `/completeness` valida contra el spec en `contracts:verify-provider`

### Requirement: La ficha declara si el checklist está disponible
`PatientSummary` SHALL ganar la propiedad opcional `completenessAvailable` (booleano; ausente equivale a `true`), sin volver nulable `missingCriticalCount`. `PatientListItem` SHALL NOT cambiar en el S4 (decisión Q2, usuario, 2026-10-30).

#### Scenario: La propiedad nueva es opcional [US-003 AC-2] [RN-26]
- **WHEN** `contracts:breaking` compara el spec con `main`
- **THEN** `completenessAvailable` aparece como propiedad opcional de `PatientSummary` y `missingCriticalCount` sigue siendo un entero requerido
- **AND** `PatientListItem` no tiene cambios respecto de `main`
- **AND** `patient-summary-checklist-no-disponible.json` (con `completenessAvailable = false`) valida contra `PatientSummary` y está registrado en `index.json`

### Requirement: Ejemplos de /completeness para los consumidores
`contracts/examples/` MUST incluir respuestas `200` de F-M2 (6 faltantes), de F-M1 (0 faltantes) y de tipo no habilitado (`items = []`), y los errores `401`, `403`, `404` y `500` de la operación, todos registrados en `index.json`.

#### Scenario: Los siete ejemplos validan contra su target [US-003 AC-1] [US-005 AC-1]
- **WHEN** `contracts:check` valida `contracts/examples/index.json`
- **THEN** los tres ejemplos `200` y los cuatro de error de `/completeness` validan contra su respuesta en el spec

### Requirement: Motivo lenguaje_no_permitido en DiscardedOption
El enum `DiscardedOption.discardReason` de `contracts/schemas/evidence.yaml` MUST incluir `lenguaje_no_permitido` al final de los motivos vigentes, como cambio aditivo sin ruptura (ADR-26; schema 1.2.0, `rag-orchestrator` 1.8.0, `clinical-api` 1.13.0), con sus ejemplos registrados en `contracts/examples/index.json`; `clinical-api` SHALL validarlo con su cliente generado y persistirlo sin pérdida (RN-06).

#### Scenario: El motivo nuevo es aditivo y viaja sin pérdida hasta la persistencia [US-245 AC-7] [ADR-26] [RN-06]
- **GIVEN** `contracts/schemas/evidence.yaml` con `lenguaje_no_permitido` añadido al enum de `DiscardedOption.discardReason` y los ejemplos `con-evidencia-solo-descartadas-lenguaje.json` y `con-evidencia-solo-descartadas-sin-soporte-y-lenguaje.json` (`EvidenceAnalysis`, `clinical-api`) y `rag-query-solo-descartadas-lenguaje.json` (`RagQueryInternalResponse`, `rag-orchestrator`, con su request `rag-query-request-solo-descartadas-lenguaje.json` y una pregunta distinta de las de los ejemplos existentes), registrados en `index.json`
- **WHEN** se ejecutan `sync-contracts`, `contracts:check` y `oasdiff` contra `main`
- **THEN** no hay cambio incompatible
- **AND** cada ejemplo valida contra su `target` de `index.json` y los mocks MSW/`respx` se construyen desde ellos
- **AND** `clinical-api`, con el MSW de `rag-orchestrator` construido desde `rag-query-solo-descartadas-lenguaje.json`, valida la respuesta con su cliente generado y persiste en el `AIAnalysisRecord` el `discardReason = lenguaje_no_permitido` sin pérdida

### Requirement: Error LLM_OUTPUT_INVALID en el 503 de ambos backends
El schema `ErrorSalidaLlmInvalida` (`error = LLM_OUTPUT_INVALID`, `message`, `traceId`, sin detalles internos) MUST añadirse como alternativa aditiva del `oneOf` del `503` de `POST /rag/query` (1.8.0) y de `POST /platform/evidence-analyses` (1.13.0), con ejemplos en `index.json` (ADR-26). `clinical-api` SHALL propagarlo sin convertirlo en `LOCAL_LLM_UNAVAILABLE` (Q1, 2026-10-30).

#### Scenario: El error de salida inválida es aditivo y clinical-api lo propaga sin cambiarlo [US-245 AC-1] [ADR-26] [RN-06] (decisión Q1, 2026-10-30)
- **GIVEN** `ErrorSalidaLlmInvalida` en el `oneOf` del `503` de ambos `openapi.yaml` y los ejemplos `rag-salida-llm-invalida.json` y `error-salida-llm-invalida.json` registrados en `index.json`
- **WHEN** `clinical-api`, con el MSW de `rag-orchestrator` construido desde `rag-salida-llm-invalida.json`, recibe `POST /platform/evidence-analyses`
- **THEN** responde `503` con `error = "LLM_OUTPUT_INVALID"`, validado contra su `openapi.yaml`, y nunca `LOCAL_LLM_UNAVAILABLE`
- **AND** no persiste un `AIAnalysisRecord` con contenido generado (RN-06 sin cambios)
- **AND** `oasdiff` contra `main` no reporta cambio incompatible

### Requirement: Campos aditivos de opciones no mostradas
`RagQueryInternalResponse` (rag-orchestrator 1.9.0) MUST declarar `optionsNotShown` (integer >= 0) como requerido y siempre emitido (`0` sin recorte); `AnalysisBasis` (clinical-api 1.14.0) MUST declarar `optionsNotShown` (integer >= 0) y `maxOptions` (integer 1–3), opcionales solo por los análisis históricos. El cambio SHALL ser aditivo (ADR-26), con sus ejemplos en `index.json` (design, Contratos).

#### Scenario: Los campos nuevos son aditivos y los mocks salen de los ejemplos [US-134 AC-3] [ADR-26] [RN-06]
- **GIVEN** `apps/rag-orchestrator/openapi.yaml` 1.9.0 y `apps/clinical-api/openapi.yaml` 1.14.0 con los campos nuevos, y los ejemplos `rag-query-tres-opciones.json` (con `rag-query-request-tres-opciones.json`) y `con-evidencia-s4-tres-opciones.json`
- **WHEN** se ejecutan `sync-contracts`, `contracts:check` y `oasdiff` contra `main`
- **THEN** no hay cambio incompatible en ninguno de los dos specs
- **AND** `rag-query-tres-opciones.json` valida contra `RagQueryInternalResponse` y `con-evidencia-s4-tres-opciones.json` valida contra `EvidenceAnalysis`
- **AND** `rag-query-tres-opciones-no-comparable.json` y `con-evidencia-s4-tres-opciones-no-comparable.json` (`LLM-TRES`) traen O-A no comparable en tercer lugar y `optionsNotShown = 0`
- **AND** todo ejemplo con target `RagQueryInternalResponse` en `index.json`, incluidos los de `l1d-291`, `l1d-295` y `l1d-297`, trae `optionsNotShown = 0` (salvo `rag-query-tres-opciones.json`) y sigue validando
- **AND** los mocks MSW/`respx` se construyen desde esos ejemplos y `clinical-api` valida la respuesta interna con su cliente generado

### Requirement: Cada openapi.yaml proveedor se edita a mano y lo demás se genera
Los dos `openapi.yaml` MUST editarse a mano como fuente (no se generan) y los tipos TS, Zod y Pydantic SHALL generarse después desde ellos; `contracts/schemas/evidence.yaml` (solo schemas compartidos) MUST NOT cambiar en este change.

#### Scenario: Los artefactos generados salen del openapi.yaml proveedor [ADR-26]
- **GIVEN** el diff del change
- **WHEN** se compara con la salida de la generación desde los dos `openapi.yaml`
- **THEN** los tipos de `packages/api-contracts`, los schemas Zod y los modelos Pydantic coinciden con lo generado
- **AND** `contracts/schemas/evidence.yaml` no aparece en el diff

### Requirement: RagMeta.retrievalParams declara la reescritura sin nulos
`RagMeta.retrievalParams` de `rag-orchestrator` 1.10.0 MUST declarar en `required` `queryRewrite` (`{applied: boolean, reason: disparado | no_disparado | no_disponible | no_aplica}`, cerrado, sin `null`, `applied = true` ⇔ `disparado`); todos los ejemplos de respuesta de `/rag/query` y `/rag/follow-up` con `meta.retrievalParams` SHALL traerlo, los de seguimiento con `no_aplica` (decisión D-c; ADR-26, aditivo).

#### Scenario: Los ejemplos de query y follow-up traen queryRewrite [US-238 AC-1] [US-033 AC-13]
- **WHEN** `contracts:check` valida `contracts/examples/rag-query-*.json` y `rag-follow-up-*.json`
- **THEN** todos traen `meta.retrievalParams.queryRewrite` sin `null`, los de seguimiento con `reason = no_aplica`
- **AND** `rag-query-reescritura-aplicada.json` trae `{applied: true, reason: "disparado"}` y tiene su propio request `rag-query-request-reescritura-aplicada.json` con una `query` distinta de las demás

#### Scenario: Un queryRewrite nulo o incoherente rompe la verificación [US-238] [US-033 AC-13]
- **WHEN** un parche deja `reason` en `null`, quita `queryRewrite` de `required`, o un ejemplo trae `applied = true` con `reason = no_disparado`
- **THEN** `contracts:check` termina con código distinto de 0 y nombra el campo

#### Scenario: El proveedor emite queryRewrite en cada camino [US-238 AC-1] [US-238 AC-2] [US-238 AC-5]
- **WHEN** `contracts:verify-provider` valida las respuestas reales de `/rag/query` en rescate, primer loop con evidencia y LLM caído
- **THEN** validan contra `RagQueryInternalResponse` con `reason` `disparado`, `no_disparado` y `no_disponible` respectivamente

### Requirement: AnalysisBasis declara si la búsqueda se repitió con reformulación
`AnalysisBasis.sourcesConsulted` del `openapi.yaml` de `clinical-api` (versión 1.15.0) MUST declarar en `required` `queryRewritten` (`boolean`, sin `null`), descrito como verdadero solo cuando el segundo loop de reescritura rescató evidencia; ningún campo de `AnalysisBasis` SHALL contener la consulta reformulada (decisión D-d, 2026-10-30).

#### Scenario: Los ejemplos de la Base traen queryRewritten [US-238 AC-7] [FR-27]
- **WHEN** `contracts:check` valida los ejemplos con `analysisBasis`
- **THEN** todos traen `sourcesConsulted.queryRewritten`, `false` salvo `con-evidencia-reescritura.json`, que trae `true`
- **AND** un parche que lo quita de `required` o lo vuelve nullable hace terminar el comando con código distinto de 0

### Requirement: Operaciones de corrección, histórico y notas clínicas en el spec de clinical-api
El spec de `clinical-api` MUST declarar `correctBiomarker`, `correctClinicalNote`, `listClinicalNotes` (`ClinicalNoteList`, sin paginación), `getBiomarkerHistory` y `getClinicalNoteHistory` con `x-permission`, schemas cerrados con nombre y un ejemplo sintético en cada `200`/`201`. El cambio SHALL ser aditivo (ADR-26) con `info.version` 1.19.0.

#### Scenario: Las operaciones de corrección están declaradas con sus errores [US-253 AC-1] [US-253 AC-2] [ADR-26]
- **WHEN** `contracts:check` revisa `apps/clinical-api/openapi.yaml`
- **THEN** existen las cinco operaciones (`201`/`200`, `401`, `403`, `404` y, en las correcciones, `409` y `422`) con `clinical:write` o `clinical:read`, `ErrorCorreccionInvalida` (`CUERPO_INVALIDO`, `PACIENTE_EGRESADO`, `VALOR_FUERA_DE_CATALOGO`; `field` opcional, `type: string`, sin enum, con la misma descripción que los demás 422 de registro, `[S5 resp. 10]` (3)) y `ErrorDatoNoVigente` (`DATO_NO_VIGENTE`), `getClinicalNoteHistory` enlaza `correction-history-clinical-note.json`, `listClinicalNotes` enlaza `clinical-notes-list.json`, y cada ejemplo nuevo de `contracts/examples/` valida contra su schema

#### Scenario: El cambio no rompe a los consumidores [US-253 AC-1] [ADR-26]
- **WHEN** `contracts:breaking` compara el spec con `main`
- **THEN** reporta 0 cambios incompatibles: `Biomarker.supersedesId` es opcional y `Provenance.reviewStatus` no amplía su enum (el histórico usa `CorrectionHistory` con `reviewStatus = reemplazado`), y `info.version` es 1.19.0

#### Scenario: Las respuestas reales cumplen el spec, incluidos los errores [US-253 AC-3] [US-253 AC-4]
- **GIVEN** los tests de integración de las cinco operaciones
- **WHEN** corre la verificación del proveedor
- **THEN** cada `201`, `200`, `403`, `404`, `409` y `422` emitido valida contra el spec de `clinical-api`

### Requirement: Opciones de registro manual y campo del error en el spec de clinical-api
`apps/clinical-api/openapi.yaml` MUST declarar `getManualEntryOptions` (`GET /platform/patients/{patientId}/manual-entry-options`, `200 ManualEntryOptions`, `401`, `403`, `404`, `500`), con ejemplos en `contracts/examples/` e `info.version` 1.20.0; el cambio SHALL ser aditivo (ADR-26). La propiedad opcional `field` de `ErrorRegistroManualInvalido` y `ErrorDiagnosticoInvalido` (string sin enum, introducida por `l1d-80`, `[S5 resp. 10]`) SHALL usarse sin redefinirla.

#### Scenario: El cambio de contrato es aditivo [US-111 AC-1] [US-111 AC-4] [ADR-26] [S5 resp. 13]
- **WHEN** se corre `contracts:breaking` contra `main` tras editar el spec
- **THEN** reporta 0 cambios incompatibles, y `contracts:check` valida los ejemplos `manual-entry-options-mama.json`, `manual-entry-options-prostata.json`, `manual-entry-options-sin-diagnostico.json`, `error-valor-fuera-de-catalogo-campo.json` y `error-gradacion-incoherente-campo.json`

#### Scenario: Los ejemplos previos del registro manual siguen válidos [US-111 AC-4] [ADR-26] [S5 resp. 13]
- **WHEN** se validan `error-valor-fuera-de-catalogo.json` y `error-gradacion-incoherente.json` (sin `field`) contra el spec nuevo
- **THEN** siguen siendo válidos
