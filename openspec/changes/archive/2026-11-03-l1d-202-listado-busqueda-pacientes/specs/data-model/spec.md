## MODIFIED Requirements

### Requirement: Índice ciego único de la identidad
`identity.patient_identity` MUST tener una restricción única sobre `(id_type, issuing_country, national_id_hmac)` y sus columnas de documento y nombre MUST ser `bytea` cifrables (`national_id_ciphertext`, `full_name_ciphertext`), sin ninguna columna con el dato en claro (ADR-6, RN-10). Decidido en el refinamiento del S2 (P-4, decidido por el usuario el 2026-10-21): la tabla SHALL tener además `full_name_hmac` (índice ciego del nombre completo normalizado, con índice no único), que `IdentityService` escribe siempre y el seed completa en las filas sembradas.

#### Scenario: Una segunda identidad con el mismo índice ciego falla [US-038 AC-6] [ADR-6]
- **WHEN** se insertan en `identity.patient_identity` dos filas sintéticas (con `id_type = sintetico`, para dos pacientes sintéticos) con el mismo `id_type`, `issuing_country` y `national_id_hmac`
- **THEN** la segunda inserción falla por la restricción única

#### Scenario: El índice ciego choca también sin país emisor [US-038 AC-6] (asumido)
- **WHEN** las dos filas sintéticas tienen el mismo `id_type` y `national_id_hmac` y `issuing_country` nulo
- **THEN** la segunda inserción falla por la restricción única (`NULLS NOT DISTINCT`)

#### Scenario: La identidad no tiene columnas en claro [US-038 AC-6] [RN-10]
- **WHEN** se listan las columnas de `identity.patient_identity` y `identity.legal_representative`
- **THEN** el documento y el nombre solo existen como columnas `bytea` `*_ciphertext` y los índices ciegos como `national_id_hmac` y `full_name_hmac`; no hay columnas de texto con el documento ni el nombre

#### Scenario: Dos pacientes con el mismo nombre normalizado comparten índice sin chocar [US-048 AC-3] [S2 resp. 4]
- **GIVEN** la migración de `full_name_hmac` aplicada y el seed sintético ejecutado
- **WHEN** se insertan dos identidades sintéticas con documentos distintos y el mismo `full_name_hmac`
- **THEN** ambas inserciones se aceptan y ninguna fila de `identity.patient_identity` tiene `full_name_hmac` nulo
