## MODIFIED Requirements

### Requirement: Aviso de IA obligatorio
`disclaimer` MUST ser obligatorio (`string`, `minLength: 1`) en `EvidenceAnalysis` y en `FollowUpTurn`, descrito como un solo texto configurable (`AI_DISCLAIMER_TEXT`, que manda sobre la redacción) con **solo** la frase de RN-19 en el literal de PRD B-06: "Análisis generado por IA: requiere validación clínica del oncólogo tratante". "Uso académico/investigación" es una etiqueta permanente de la UI y MUST NOT formar parte del campo. En los ejemplos, `disclaimer` SHALL ser exactamente ese literal, con dos puntos y sin raya `[S1 resp. 9]` (supersede la tolerancia de `[Pre-S1 resp. 25]` y la fila C-14). El cambio es compatible y solo de texto: `info.version` sube la *patch*.

#### Scenario: Los ejemplos llevan el aviso completo [US-033 AC-17] [RN-19]
- **WHEN** `contracts:check` revisa todo ejemplo de `contracts/examples/` que tenga `disclaimer` (`EvidenceAnalysis` y `FollowUpTurn`, sin lista fija de archivos, `[S1 resp. 17]`)
- **THEN** (`[US-069 AC-1]`, `[S1 resp. 9]`) cada `disclaimer` es exactamente "Análisis generado por IA: requiere validación clínica del oncólogo tratante" y el comando termina con código 0

#### Scenario: Un aviso vacío o incompleto rompe la verificación [US-033 AC-17] [RN-19]
- **WHEN** un parche deja `disclaimer = ""` en un ejemplo, cambia los dos puntos por " — ", o le agrega " · Uso académico/investigación"
- **THEN** (`[US-069 AC-1]`, `[S1 resp. 9]`) el comando termina con código distinto de 0, nombra el ejemplo y la ruta `#/disclaimer` y muestra el literal esperado

#### Scenario: La descripción del campo remite a la configuración y al literal [US-033 AC-17] [US-069 AC-2] [RN-22] [S1 resp. 9]
- **WHEN** `contracts:check` revisa `EvidenceAnalysis.properties.disclaimer` y `FollowUpTurn.properties.disclaimer`
- **THEN** cada descripción menciona `AI_DISCLAIMER_TEXT` y el literal de B-06, y un parche que quita `disclaimer` del `required` o su `minLength` hace terminar el comando con código distinto de 0 nombrando el schema

#### Scenario: El cambio no es incompatible [US-069 AC-1] [ADR-26]
- **WHEN** se compara el spec de la rama con el de `main` (`oasdiff breaking`, o a mano mientras `contracts:breaking` no exista)
- **THEN** no hay cambios incompatibles (solo descripciones y ejemplos) y `info.version` de `clinical-api` pasa de 1.2.0 a 1.2.1 (patch, `[S1 resp. 17]`)
