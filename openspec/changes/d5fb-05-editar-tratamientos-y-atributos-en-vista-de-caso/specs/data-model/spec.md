## ADDED Requirements

### Requirement: Tratamientos previos y atributos clínicos enlazan su versión anterior
`clinical.prior_treatment` y `clinical.clinical_attribute` MUST tener `supersedes_id uuid NULL` con FK a la propia tabla (`ON DELETE RESTRICT`) e índice único parcial sobre `supersedes_id` no nulo, de modo que una fila solo pueda ser reemplazada una vez (ADR-50). La migración SHALL ser aditiva y `docs/architecture/data-model.md` SHALL describirla.

#### Scenario: Las filas existentes quedan con supersedes_id nulo [ADR-50]
- **WHEN** se aplica la migración sobre una base con tratamientos y atributos
- **THEN** ninguna fila cambia y todas tienen `supersedes_id` nulo

#### Scenario: No se reemplaza dos veces la misma fila [ADR-50]
- **WHEN** se intenta insertar una segunda fila con el mismo `supersedes_id`
- **THEN** la base lo rechaza por el índice único parcial

#### Scenario: No se admite un supersedes_id inexistente
- **WHEN** se inserta una fila con un `supersedes_id` que no existe
- **THEN** la base lo rechaza por la FK
