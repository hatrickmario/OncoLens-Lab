# Spec Delta — terminology-reconciliation (l1d-335, US-277)

## ADDED Requirements

### Requirement: Solo un sinónimo equivalente resuelve un texto a su término canónico
`clinical-api` MUST leer `sinonimos.json` con el campo `relacion` y la marca `revision_provisional`, y `ReconciliationService` SHALL resolver un texto por sinónimos solo cuando su `relacion` es `equivalente`. Un texto que solo coincide con un sinónimo `mas_amplio` o `miembro_de_clase` MUST quedar `no_mapeado` con su texto original, sin heredar el código del término relacionado (ADR-33, RN-27).

#### Scenario: clinical-api arranca con el catálogo que declara relaciones [US-277 AC-1] [RN-27] (asumido)
- **GIVEN** el catálogo de la versión nueva montado en `CLINICAL_CATALOG_PATH`
- **WHEN** arranca `clinical-api`
- **THEN** la validación del catálogo al arrancar revisa `sinonimos.json` con su esquema y sus reglas, el catálogo terminológico se carga sin error y el servicio queda listo

#### Scenario: Un sinónimo equivalente sigue resolviendo al código del catálogo [US-277 AC-1] [ADR-33]
- **GIVEN** un catálogo de prueba con el término `leuprorelina` (con código ATC) y `leuprolide` como `equivalente`
- **WHEN** `ReconciliationService` decide una propuesta con `textoOriginal = "leuprolide"` y sin código
- **THEN** el resultado tiene `mappingStatus = mapeado` y el código ATC de `leuprorelina`

#### Scenario: Un miembro de clase no hereda el código de la clase [US-277 AC-1] [RN-27] (asumido)
- **GIVEN** un catálogo de prueba con un término de clase con código y un fármaco declarado solo como `miembro_de_clase` de esa clase
- **WHEN** se decide una propuesta cuyo `textoOriginal` es el nombre del fármaco, sin código
- **THEN** el resultado tiene `mappingStatus = no_mapeado`, código nulo y el texto original conservado

#### Scenario: Un equivalente ambiguo en el catálogo montado impide arrancar [US-277 AC-1] (asumido)
- **GIVEN** un catálogo montado cuyo manifiesto declara `sinonimos` y cuyo `prostata/sinonimos.json` tiene un texto `equivalente` de dos términos
- **WHEN** arranca `clinical-api`
- **THEN** no arranca y el error lleva solo el código `sinonimo_equivalente_ambiguo`, sin la ruta ni valores del catálogo

#### Scenario: Un catálogo sin relación en un sinónimo impide arrancar [US-277 AC-1] (asumido)
- **GIVEN** un catálogo montado cuyo `mama/sinonimos.json` tiene un sinónimo sin `relacion`
- **WHEN** arranca `clinical-api`
- **THEN** no arranca (fail-fast de US-041) y el log nombra el tipo y el archivo, sin valores del catálogo
