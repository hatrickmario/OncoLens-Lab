# Spec Delta — applicability

## ADDED Requirements

### Requirement: Estado por criterio calculado con los valores de los fragmentos que cita la opción
El estado de cada criterio de una opción MUST calcularse con una función pura sobre los valores de población cuyo `chunkId` cita esa opción, el valor del paciente del contexto y las tablas del catálogo; un valor de un fragmento no citado SHALL NOT entrar (RN-28, ADR-47).

#### Scenario: Una población inclusiva deja el criterio en parcial con motivo inclusiva [US-243 AC-1] [AC-08.1] [FR-25] [S4 resp. 8]
- **GIVEN** FX-08b-c, el paciente A-M2 (posmenopáusica) y la opción O-P1, que cita `ch-b1-1` con `premenopausal women` y `postmenopausal women`
- **WHEN** se calcula la aplicabilidad de la opción
- **THEN** `estado_menopausico` trae `status = parcial` y `partialReason = inclusiva`
- **AND** `studyPopulationValues` trae los dos valores de `ch-b1-1`

#### Scenario: Una población específica del perfil da coincide [US-243 AC-2] [AC-08.1] [DEC-11]
- **GIVEN** A-M2 y la opción O-P2, que cita `ch-b2-1` con `postmenopausal women only`
- **WHEN** se calcula la aplicabilidad
- **THEN** `estado_menopausico` trae `status = coincide` y `partialReason = null`

#### Scenario: Una restricción explícita que excluye al paciente da no_coincide [US-243 AC-3] [AC-08.1] [DEC-11] (asumido en la señal)
- **GIVEN** A-M3 (premenopáusica) y la opción O-P2 (`postmenopausal women only`), con `restrictionMarkers` del catálogo
- **WHEN** se calcula la aplicabilidad
- **THEN** `estado_menopausico` trae `status = no_coincide`

#### Scenario: Una lista incompleta sin restricción nunca excluye [US-243 AC-4] [AC-08.2] [ADR47-R2]
- **GIVEN** A-M3 y la opción O-P3, que cita `ch-b3-1` con `postmenopausal women` sin marcador de restricción
- **WHEN** se calcula la aplicabilidad
- **THEN** `estado_menopausico` trae `status = desconocido` y `unknownReason = no_reportado_por_fuente`
- **AND** el estado nunca es `no_coincide`

#### Scenario: La unidad de cálculo es el fragmento citado [US-243 AC-7] [AC-08.1] [ADR47-R18]
- **GIVEN** A-M2 y las opciones O-P7 (cita `ch-b7-1`) y O-P8 (cita `ch-b7-2`) del mismo `doc-b7`
- **WHEN** se calcula cada una
- **THEN** O-P7 trae `estado_menopausico = coincide` y O-P8 trae `no_coincide`
- **AND** ningún valor de un fragmento que la opción no cita entra en su estado

### Requirement: Valores en conflicto dejan el criterio desconocido con ambos valores visibles
Cuando los valores de los fragmentos citados son códigos del catálogo excluyentes entre sí, el criterio MUST quedar `desconocido` con `unknownReason = valores_en_conflicto`, conservar ambos valores con su `chunkId` y no marcar `populationNotComparable` por ese motivo (RN-28).

#### Scenario: Dos fragmentos con HER2 distinto dan desconocido con valores_en_conflicto [US-243 AC-5] [AC-08.2] [RN-28] (asumido: conflicto = códigos excluyentes en fragmentos distintos del mismo documento)
- **GIVEN** A-M2 y la opción O-P4, que cita `ch-b4-1` (`HER2-positive (IHC 3+)`) y `ch-b4-2` (`HER2-negative (IHC 2+, ISH not amplified)`)
- **WHEN** se calcula la aplicabilidad
- **THEN** `estado_her2` trae `status = desconocido` y `unknownReason = valores_en_conflicto`
- **AND** `studyPopulationValues` trae los dos valores con `chunkId` `ch-b4-1` y `ch-b4-2`
- **AND** `populationNotComparable = false` para la fuente

### Requirement: Subgrupo y mención no cuentan para el estado
Los valores con `scope = subgrupo` o `mencion` MUST NOT contar para el estado del criterio ni sumarse a `coincide` ni a `parcial` en el resumen de la fuente; SHALL conservarse en `studyPopulationValues` como contexto (ADR-47).

#### Scenario: Un valor de subgrupo se muestra pero el criterio queda desconocido [US-243 AC-6] [AC-08.1] [ADR47-R1] [S4 resp. 3]
- **GIVEN** A-M2 y la opción O-P6, que cita `ch-b6-1` con `triple-negative (TNBC)` de `scope = subgrupo`
- **WHEN** se calcula la aplicabilidad
- **THEN** `receptores_hormonales` trae `status = desconocido` y `unknownReason = no_reportado_por_fuente`
- **AND** `studyPopulationValues` conserva el valor con `scope = subgrupo`
- **AND** el resumen de la fuente no lo cuenta como `coincide` ni como `parcial`

### Requirement: Tabla de casos pura, determinista y sin puntaje
La proyección de los estados internos (design D2, incluidos rango solapado, `solo_subgrupo` antiguo y los casos sin regla de comparación) a los cuatro estados, a `partialReason` y a `unknownReason` (`sin_regla_de_comparacion` para los casos sin regla) MUST ser una función pura: misma entrada, misma salida, cero invocaciones del LLM y ningún puntaje ni porcentaje (RN-28, ADR-34).

#### Scenario: Cada caso de la tabla proyecta el estado y el motivo esperados y el cálculo es idéntico al repetirlo [US-243 AC-8] [AC-08.9] [RN-28] [ADR-34] [S4 resp. 11]
- **GIVEN** la tabla de casos de la función pura (exacto, inclusivo, mezclado con fragmento de `study_design` guía o revisión con varios valores, rango solapado, `solo_subgrupo` de la forma antigua, en conflicto, ausente, restricción, `valor_fuera_de_tabla`, `sin_escala` y `forma_no_comparable`) y el LLM falso con contador
- **WHEN** se evalúa dos veces cada caso
- **THEN** cada caso proyecta al estado visible, al `partialReason` y al `unknownReason` esperados (rango solapado → `parcial` / `rango_solapado`; `solo_subgrupo` antiguo → `parcial` / `solo_subgrupo`; los tres casos sin regla → `desconocido` / `sin_regla_de_comparacion`) y los dos resultados son idénticos
- **AND** el LLM falso registra cero invocaciones
- **AND** la salida no contiene ningún puntaje ni porcentaje

#### Scenario: Un fragmento que mezcla poblaciones sin desagregar deja parcial con motivo mezclada [US-243 AC-8] [AC-08.1] [DEC-11]
- **GIVEN** A-M2 y la opción O-P5, que cita `ch-b5-1` de `doc-b5` (`study_design = guia`) con dos valores de menopausia
- **WHEN** se calcula la aplicabilidad
- **THEN** `estado_menopausico` trae `status = parcial` y `partialReason = mezclada`

<!-- Regresiones anotadas (no son escenarios de este change):
- Regresión [RN-28] orden por estados y sin puntaje activa desde S4 en US-134.
- Regresión [RN-02] sin evidencia, `applicability = []` y sin invocar al LLM, activa desde S3 en US-055/US-124 AC-6.
-->

## MODIFIED Requirements

### Requirement: Desconocido sin causa cuando el dato no falta
Un criterio `desconocido` cuyo motivo no es la ausencia del dato en el paciente ni en la fuente MUST llevar la causa que lo produce: `sin_regla_de_comparacion` cuando el catálogo no define cómo comparar el valor (`valor_fuera_de_tabla`, `sin_escala`, `forma_no_comparable`, p. ej. un estadio sin escala ordenada) y `valores_en_conflicto` en el conflicto (US-243, enum de US-241). `unknownReason = null` con `status = desconocido` SHALL quedar solo en los análisis históricos persistidos antes de este change, que no se reescriben (RN-06).

#### Scenario: Estadio de A-M1 sin escala ordenada
- **GIVEN** A-M1 con estadio «IIA» y `doc-a1` con estadio «I–III», y un catálogo de test sin escala ordenada para el estadio
- **WHEN** se evalúa la aplicabilidad de `doc-a1`
- **THEN** `estadio` trae `status = desconocido` y `unknownReason = sin_regla_de_comparacion`
- **AND** `contracts/examples/rag-query-aplicabilidad-a-m1.json` y `con-evidencia-s3-aplicabilidad.json` traen ese mismo motivo para el estadio y validan con `contracts:check`
