## MODIFIED Requirements

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

## ADDED Requirements

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
