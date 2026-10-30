## ADDED Requirements

### Requirement: Lector de population_criteria que acepta la forma antigua y la nueva
El repositorio del catálogo del corpus MUST entregar al dominio una lista de valores por criterio desde la forma antigua y la nueva, y aceptar la marca `{"status": "pendiente", "values": []}` como criterio pendiente; una forma inválida (más de `POPULATION_MAX_VALUES_PER_CRITERION` valores de un fragmento, o `scope` fuera del enum) SHALL dejar el criterio `desconocido` con `no_reportado_por_fuente`, responder `200` y registrar `poblacion_forma_invalida` sin valor ni texto (RN-26, RN-14, RN-22).

#### Scenario: doc-a1 antigua y doc-b1 nueva llegan como lista y A-M1 × doc-a1 no cambia [US-241 AC-4] [ADR-47] [AC-08.9]
- **GIVEN** `doc-a1` (forma antigua) y `doc-b1` (forma nueva) de FX-08b-c y el catálogo `test-apl-1.0.0`
- **WHEN** el repositorio del catálogo del corpus los lee
- **THEN** ambos llegan al dominio como lista de valores
- **AND** el resumen de A-M1 × `doc-a1` es `{ coincide: 2, parcial: 0, noCoincide: 0, desconocido: 3 }`

#### Scenario: Una forma inválida degrada el criterio y no rompe el análisis [US-241 AC-5] [RN-26] [RN-14]
- **GIVEN** `POPULATION_MAX_VALUES_PER_CRITERION = 3`, una fila de forma nueva con 4 valores de un mismo fragmento en un criterio, y otra con un `scope` fuera del enum
- **WHEN** se lee en un análisis
- **THEN** ese criterio queda `desconocido` con `unknownReason = no_reportado_por_fuente` y el análisis responde `200`
- **AND** el log registra `poblacion_forma_invalida` con el criterio, el `chunkId` y el `traceId`, sin el valor ni el texto del fragmento

#### Scenario: La marca pendiente es una forma válida [US-241 AC-5] [ADR-47]
- **GIVEN** una fila de forma nueva con `estado_menopausico = {"status": "pendiente", "values": []}`
- **WHEN** el repositorio del catálogo del corpus la lee
- **THEN** el dominio recibe ese criterio como pendiente con lista vacía
- **AND** no se registra `poblacion_forma_invalida`
