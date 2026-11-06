## ADDED Requirements

### Requirement: Clave de atributo y cumplimiento alternativo declarados en el catálogo
`packages/clinical-catalogs` MUST declarar la clave `sin_tratamiento_previo` en `atributos.json` y `satisfiedBy` opcional en el ítem `tratamientos_previos` de `datos-criticos.json`; el validador SHALL fallar con una referencia colgante y la versión del catálogo SHALL subir (RN-29).

#### Scenario: El validador acepta el catálogo coherente [RN-29]
- **WHEN** corre el validador del catálogo
- **THEN** pasa y `satisfiedBy` resuelve a una clave y valor existentes

#### Scenario: Una referencia colgante falla en CI [RN-29]
- **GIVEN** un fixture con `satisfiedBy.attribute_key` ausente de `atributos.json`
- **WHEN** corre el validador
- **THEN** falla nombrando el ítem y la clave

#### Scenario: Backends con versiones distintas [RN-22]
- **GIVEN** un backend con la versión anterior del catálogo
- **WHEN** se compara la versión entre backends
- **THEN** responde `409` como hasta ahora
