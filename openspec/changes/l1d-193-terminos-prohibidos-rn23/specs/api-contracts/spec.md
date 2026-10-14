## MODIFIED Requirements

### Requirement: Lenguaje no prescriptivo en specs y ejemplos
Ningún texto, clave ni valor de `enum`/`const` de los specs, de `evidence.yaml` ni de `contracts/examples/` MUST contener términos del Nivel A ni palabras con los prefijos del Nivel B (`recomend`/`recommend`) de la lista de RN-23, comparando con la normalización común de `@oncolens/clinical-language` (sin mayúsculas ni acentos, con plural y género); solo SHALL admitirse las `frasesPermitidas` de la propia lista, y solo en textos propios: los valores de los campos de `CAMPOS_GENERADOS` de `@oncolens/clinical-language` dentro de los ejemplos MUST verificarse sin `frasesPermitidas`. La lista SHALL leerse del catálogo de US-068 (`packages/clinical-catalogs/lenguaje/terminos-prohibidos.json`, 1.1.0, `[S1 resp. 15]`) y la lista provisional `scripts/contracts/terminos-prohibidos-rn23.json` MUST NOT existir; si el catálogo falta, la regla MUST reportar un hallazgo que nombra la ruta.

#### Scenario: Specs y ejemplos sin términos prescriptivos [US-033 AC-17] [RN-23]
- **WHEN** `contracts:check` recorre todo el texto, las claves y los enums de specs y ejemplos, incluido `con-evidencia-s4.json`
- **THEN** no encuentra términos de la lista y termina con código 0

#### Scenario: Un término prescriptivo rompe la verificación [US-033 AC-17] [RN-23]
- **WHEN** un parche pone "Debe recibir" (con mayúscula) en el `rationale` de una opción del ejemplo del S4, "recommended for this patient" en una descripción, o un valor de `enum` `recomendada`
- **THEN** el comando termina con código distinto de 0 y nombra el archivo, la ruta y el término

#### Scenario: Una frase negativa normativa no es hallazgo [US-033 AC-17] [RN-23]
- **WHEN** una descripción contiene "no constituye una recomendación"
- **THEN** la regla no reporta hallazgo porque la frase está en `frasesPermitidas` de la lista

#### Scenario: Una frase permitida en un campo generado de un ejemplo sí es hallazgo [US-068 AC-5] [US-033 AC-17] [RN-23]
- **WHEN** un parche pone "no constituye una recomendación" en el `rationale` de una opción de `con-evidencia-s4.json`
- **THEN** el comando termina con código distinto de 0 y nombra el archivo, la ruta `rationale` y el término de nivel B

#### Scenario: La regla lee el catálogo y no la lista provisional [US-068 AC-1] [US-033 AC-17] [RN-23] [S1 resp. 15]
- **WHEN** `contracts:check` corre sobre `main` tras este change
- **THEN** `assertNoPrescriptiveLanguage()` usa `packages/clinical-catalogs/lenguaje/terminos-prohibidos.json` y `scripts/contracts/terminos-prohibidos-rn23.json` no existe
- **AND** un parche que pone "deben recibir" en una descripción hace terminar el comando con código distinto de 0
- **AND** un parche que retira el catálogo hace terminar el comando con código distinto de 0 nombrando su ruta
