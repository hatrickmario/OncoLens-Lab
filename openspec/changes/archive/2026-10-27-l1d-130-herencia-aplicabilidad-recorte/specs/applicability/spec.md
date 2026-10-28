# Spec Delta — applicability

## Purpose

Aplicabilidad paciente ↔ evidencia: compara criterio a criterio la población de cada fuente con el caso, sin
ningún puntaje clínico (RN-28), y la agrega por opción para que el oncólogo juzgue si la evidencia aplica.

## ADDED Requirements

### Requirement: Una opción hereda la aplicabilidad de su fuente más aplicable
Con aplicabilidad calculada, cada opción validada MUST llevar en `applicabilitySummary` el `summary` de su
fuente citada más aplicable (comparador de RN-28) y en `perSource` una entrada por cada fuente citada, con su
propio `summary` y `populationNotComparable` (ADR-31). La relevancia de una fuente SHALL ser el mayor
`relevanceScore` de sus chunks citados por la opción (asumido). Ningún campo es un puntaje (RN-28).

#### Scenario: La opción con una fuente comparable y otra no comparable toma el resumen de la comparable [US-125 AC-1] [AC-08.8]
- **GIVEN** A-M1, el catálogo `test-apl-1.0.0` y una opción validada que cita `doc-a1` (0 excluyentes en No coincide, `{ coincide: 2, parcial: 0, noCoincide: 0, desconocido: 3 }`) y `doc-a2` (1 excluyente en No coincide)
- **WHEN** se agrega la aplicabilidad de la opción
- **THEN** `applicabilitySummary` es igual al `summary` de `doc-a1`
- **AND** `perSource` trae exactamente `doc-a1` y `doc-a2`, cada una con su propio `summary` y su `populationNotComparable` (`false` y `true`)
- **AND** la opción tiene `populationNotComparable = false` y `warnings` no incluye `poblacion_no_comparable`

#### Scenario: A igualdad de conteos la fuente más aplicable es la de mayor relevancia [US-125 AC-3] [RN-28] [RN-03]
- **GIVEN** una opción que cita dos fuentes con el mismo número de excluyentes en No coincide y el mismo número en Coincide, con relevancias 0,70 y 0,60
- **WHEN** se agrega la aplicabilidad de la opción
- **THEN** `applicabilitySummary` es el de la fuente con relevancia 0,70
- **AND** `perSource` conserva ambas fuentes

### Requirement: Una opción es de población no comparable solo si todas sus fuentes lo son
Una opción MUST tener `populationNotComparable = true` si y solo si todas las fuentes que cita tienen
`populationNotComparable = true` (un criterio excluyente en `no_coincide`), y en ese caso `warnings` MUST
incluir `poblacion_no_comparable` una sola vez (readme §4.1, ADR-31). El aviso no bloquea: la opción se
devuelve igual (RN-26).

#### Scenario: Todas las fuentes no comparables marcan la opción y su aviso [US-125 AC-2] [AC-08.8]
- **GIVEN** una opción validada cuyas dos fuentes citadas tienen un criterio excluyente en `no_coincide`
- **WHEN** se agrega la aplicabilidad de la opción
- **THEN** la opción tiene `populationNotComparable = true`
- **AND** `warnings` incluye `poblacion_no_comparable` exactamente una vez
- **AND** la opción sigue en `evidenceOptions` si el recorte la conserva (el aviso no la descarta)

### Requirement: Comparador de aplicabilidad determinista y sin puntaje combinado
La aplicabilidad relativa de fuentes u opciones MUST decidirse con un orden lexicográfico fijo y total
(RN-28, ADR-27): menos excluyentes en `no_coincide` → más `coincide` → mayor `relevanceScore` (RN-03) →
menor identificador estable (`externalId` o `chunkId` de la cita principal; asumido). SHALL ser
independiente del orden de entrada y nunca un puntaje combinado; `parcial` y `desconocido` no ordenan (asumido).

#### Scenario: La tabla de casos del comparador devuelve el orden esperado [US-125 AC-4] [RN-28] [ADR-27]
- **GIVEN** la tabla de casos del comparador: (a) 0 frente a 1 excluyente en No coincide con relevancia 0,50 frente a 0,95; (b) igual excluyentes y 3 frente a 2 en Coincide con relevancia 0,40 frente a 0,90; (c) igual excluyentes e igual Coincide con relevancia 0,70 frente a 0,60; (d) todo igual con identificadores `b` y `a`
- **WHEN** se evalúa la función pura con cada caso en ambos órdenes de entrada
- **THEN** gana, en cada caso, (a) la de 0 excluyentes, (b) la de 3 en Coincide, (c) la de 0,70 y (d) la de identificador `a`
- **AND** el resultado es el mismo para cualquier orden de entrada

#### Scenario: El comparador no admite un puntaje combinado [US-125 AC-4] [RN-28]
- **GIVEN** dos entradas en las que una suma ponderada de conteos y relevancia invertiría el orden (0 excluyentes, 0 Coincide, relevancia 0,10 frente a 1 excluyente, 5 Coincide, relevancia 0,99)
- **WHEN** se evalúa la función pura
- **THEN** gana la de 0 excluyentes
- **AND** la clave de orden expuesta por el comparador es una tupla de los conteos y la relevancia, sin ningún valor derivado de combinarlos

#### Scenario: Una opción sin ninguna fuente evaluada se agrega en cero y no falla [RN-28] [RN-26]
- **GIVEN** una opción validada cuyas fuentes citadas no tienen entrada en `applicability` (documento sin población o con origen no declarado)
- **WHEN** se agrega la aplicabilidad de la opción
- **THEN** `applicabilitySummary` es `{ coincide: 0, parcial: 0, noCoincide: 0, desconocido: 0 }`, `perSource` es `[]` y `populationNotComparable` es `false`
- **AND** `warnings` no incluye `poblacion_no_comparable`
