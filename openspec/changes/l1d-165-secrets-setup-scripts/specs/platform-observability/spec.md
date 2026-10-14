## ADDED Requirements

### Requirement: clinical-api no queda listo sin sus claves de identidad
`clinical-api` MUST cargar sus secretos desde archivos indicados por variables `*_FILE`. Si `IDENTITY_AES_KEY_FILE` o `BLIND_INDEX_HMAC_KEY_FILE` no está definida, su archivo no existe o está vacío, el proceso MUST NOT quedar listo (`GET /health` ≠ `200`) y SHALL registrar el nombre de la variable ausente, nunca un valor (RN-10).

#### Scenario: Sin la clave AES el arranque falla nombrando la variable [US-035 AC-5] [RN-10] (asumido) [S1 resp. 3]
- **GIVEN** la configuración de `clinical-api` con `IDENTITY_AES_KEY_FILE` apuntando a un archivo inexistente en un directorio temporal y el resto de secretos ficticios presentes
- **WHEN** el test de integración arranca la aplicación con su *factory* y captura el log
- **THEN** el arranque falla antes de escuchar, el log contiene `IDENTITY_AES_KEY_FILE` y no contiene el contenido de ningún secreto ficticio

#### Scenario: Con la clave HMAC vacía el arranque falla nombrando la variable [US-035 AC-5] [RN-10] (asumido) [S1 resp. 3]
- **GIVEN** `BLIND_INDEX_HMAC_KEY_FILE` apuntando a un archivo vacío
- **WHEN** el test de integración arranca la aplicación
- **THEN** el arranque falla antes de escuchar y el log contiene `BLIND_INDEX_HMAC_KEY_FILE` sin ningún valor

#### Scenario: En el stack, sin la clave montada, clinical-api no queda healthy [US-035 AC-5] (asumido) [S1 resp. 3]
- **GIVEN** el stack levantado con un *override* que apunta `IDENTITY_AES_KEY_FILE` de `clinical-api` a una ruta sin montar
- **WHEN** el smoke test espera el healthcheck y consulta `GET /health` de `clinical-api` desde `web`
- **THEN** `clinical-api` no figura `healthy`, `/health` no responde `200` y `docker compose logs clinical-api` nombra `IDENTITY_AES_KEY_FILE` sin ningún valor
